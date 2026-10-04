import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { POST } from "@/app/api/ai/edit/route";
import {
  AiController,
  IDLE_TIMEOUT_MS,
  SLOW_AFTER_MS,
  type AiPresenceBinding,
  type AiRun,
} from "@/lib/ai/ai-controller";
import { aiError, type AiEditRequest, type AiStreamEvent } from "@/lib/ai/protocol";
import {
  AiRequestError,
  createLineSplitter,
  fetchAiTransport,
  type AiTransport,
  type AiTransportOptions,
} from "@/lib/ai/transport";
import { createUndoManager } from "@/lib/collab/undo";
import { SheetController } from "@/lib/controller/sheet-controller";
import { parseA1, parseRangeA1, rangeToA1 } from "@/lib/sheet/address";
import { EditOrigin, getValue, setValue } from "@/lib/sheet/document";
import { collapsedSelection, selectionRange } from "@/lib/sheet/selection";
import type { AiActivity } from "@/lib/collab/presence";

const at = (a1: string) => parseA1(a1)!;
const range = (a1: string) => parseRangeA1(a1)!;

let cleanup: Array<() => void> = [];
afterEach(() => {
  cleanup.forEach((fn) => fn());
  cleanup = [];
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function scriptedTransport() {
  const calls: Array<{
    request: AiEditRequest;
    options: AiTransportOptions;
    end: () => void;
    reject: (error: unknown) => void;
    emit: (...events: AiStreamEvent[]) => void;
  }> = [];
  const transport: AiTransport = (request, options) =>
    new Promise<void>((resolve, reject) => {
      options.signal.addEventListener("abort", () =>
        reject(new DOMException("aborted", "AbortError")),
      );
      calls.push({
        request,
        options,
        end: resolve,
        reject,
        emit: (...events) => events.forEach((e) => options.onEvent(e)),
      });
    });
  return { transport, calls };
}

function setup(transport: AiTransport, presence?: AiPresenceBinding) {
  const doc = new Y.Doc();
  const undoManager = createUndoManager(doc);
  const sheet = new SheetController(
    { doc, undoManager, presence: { setSelection() {}, setEditing() {} } },
    collapsedSelection(at("A1")),
  );
  cleanup.push(sheet.connect(), () => undoManager.destroy());
  const ai = new AiController(doc, sheet, transport, presence);
  const disconnectAi = ai.connect();
  cleanup.push(disconnectAi, () => ai.destroy());
  setValue(doc, at("B2"), "100", EditOrigin.User);
  setValue(doc, at("B3"), "200", EditOrigin.User);
  undoManager.clear();
  const lastRun = () => {
    const last = ai.messages.get().at(-1);
    return last?.role === "assistant" ? last.run : null;
  };
  return { doc, undoManager, sheet, ai, lastRun, disconnectAi };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("AiController", () => {
  it("sends the sheet, the range and the instruction, and shows the run as waiting", () => {
    const { transport, calls } = scriptedTransport();
    const { ai, lastRun } = setup(transport);

    expect(ai.send("  두 배로  ", range("B2:B5"))).toBe(true);
    expect(calls[0].request).toEqual({
      instruction: "두 배로",
      range: "B2:B5",
      cells: [
        { cell: "B2", value: "100" },
        { cell: "B3", value: "200" },
      ],
      history: [],
    });
    expect(ai.messages.get().map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(lastRun()?.status).toBe("waiting");
    expect(ai.active.get()?.id).toBe(lastRun()?.id);
  });

  it("sends the picked model and shows it until the server says which model answered", () => {
    const { transport, calls } = scriptedTransport();
    const { ai, lastRun } = setup(transport);
    ai.model.set("claude-haiku-4-5");

    ai.send("두 배로", range("B2:B5"));
    expect(calls[0].request.model).toBe("claude-haiku-4-5");
    expect(lastRun()?.model).toBe("claude-haiku-4-5");

    calls[0].emit({ type: "meta", provider: "anthropic", model: "claude-haiku-4-5-20251001" });
    expect(lastRun()?.model).toBe("claude-haiku-4-5-20251001");
  });

  it("collects proposals as they stream: compares with the request-time value, skips out-of-range cells", () => {
    const { transport, calls } = scriptedTransport();
    const { ai, lastRun } = setup(transport);
    ai.send("두 배로", range("B2:B5"));
    const call = calls[0];

    call.emit({ type: "meta", provider: "mock", model: "m" }, { type: "text", delta: "두 배로" });
    expect(lastRun()).toMatchObject({ status: "streaming", connected: true, text: "두 배로" });

    call.emit(
      { type: "edit", cell: "B2", value: "150" },
      { type: "edit", cell: "B3", value: "400" },
      { type: "edit", cell: "C9", value: "out of range" },
      { type: "edit", cell: "B2", value: "200" }, // 같은 셀은 마지막 제안으로
      { type: "edit", cell: "B4", value: "" }, // 원래도 빈칸 → 바뀌는 게 없음
    );
    expect(lastRun()?.proposals.map((p) => [p.cell, p.before, p.after])).toEqual([
      ["B2", "100", "200"],
      ["B3", "200", "400"],
    ]);
    expect(lastRun()?.skipped).toBe(1);
    expect(ai.active.get()?.proposals).toHaveLength(2);

    call.emit({ type: "done" });
    expect(lastRun()?.status).toBe("review");
    expect(ai.isBusy()).toBe(true);
    expect(ai.send("다른 요청", null)).toBe(false);
  });

  it("applies all proposals in one transaction that a single undo reverts, restoring the selection", () => {
    const { transport, calls } = scriptedTransport();
    const { ai, doc, undoManager, sheet, lastRun } = setup(transport);
    ai.send("두 배로", range("B2:B5"));
    calls[0].emit(
      { type: "edit", cell: "B2", value: "200" },
      { type: "edit", cell: "B3", value: "400" },
      { type: "done" },
    );

    ai.apply();
    expect([getValue(doc, at("B2")), getValue(doc, at("B3"))]).toEqual(["200", "400"]);
    expect(lastRun()?.status).toBe("applied");
    expect(ai.active.get()).toBeNull();

    sheet.select(collapsedSelection(at("Z99")));
    undoManager.undo();
    expect([getValue(doc, at("B2")), getValue(doc, at("B3"))]).toEqual(["100", "200"]);
    expect(rangeToA1(selectionRange(sheet.selection.get()))).toBe("B2:B3");
    expect(undoManager.canUndo()).toBe(false);
  });

  it("discards without touching the sheet", () => {
    const { transport, calls } = scriptedTransport();
    const { ai, doc, lastRun } = setup(transport);
    ai.send("두 배로", null);
    calls[0].emit({ type: "edit", cell: "B2", value: "999" }, { type: "done" });
    ai.discard();
    expect(getValue(doc, at("B2"))).toBe("100");
    expect(lastRun()?.status).toBe("discarded");
    expect(ai.isBusy()).toBe(false);
  });

  it("cancels mid-stream: aborts the request and ignores anything that arrives later", () => {
    const { transport, calls } = scriptedTransport();
    const { ai, lastRun } = setup(transport);
    ai.send("두 배로", null);
    calls[0].emit({ type: "edit", cell: "B2", value: "200" });

    ai.cancel();
    expect(calls[0].options.signal.aborted).toBe(true);
    expect(lastRun()?.status).toBe("cancelled");
    expect(ai.active.get()).toBeNull();

    calls[0].emit({ type: "edit", cell: "B3", value: "400" }, { type: "done" });
    expect(lastRun()?.status).toBe("cancelled");
    expect(lastRun()?.proposals).toHaveLength(1);
  });

  it("finishes as an answer when nothing needs to change", () => {
    const { transport, calls } = scriptedTransport();
    const { ai, lastRun } = setup(transport);
    ai.send("몇 칸이야?", null);
    calls[0].emit({ type: "text", delta: "2칸이에요." }, { type: "done" });
    expect(lastRun()?.status).toBe("answered");
    expect(ai.active.get()).toBeNull();
  });

  it("shows server errors and request failures, and retries with the same instruction and range", async () => {
    const { transport, calls } = scriptedTransport();
    const { ai, lastRun } = setup(transport);

    ai.send("두 배로", range("B2:B3"));
    calls[0].emit({ type: "error", error: aiError("overloaded") });
    expect(lastRun()).toMatchObject({
      status: "error",
      error: { code: "overloaded", retryable: true },
    });

    expect(ai.retry(lastRun()!.id)).toBe(true);
    expect(calls[1].request.range).toBe("B2:B3");
    calls[1].reject(new AiRequestError(aiError("rate_limited")));
    await flush();
    expect(lastRun()).toMatchObject({ status: "error", error: { code: "rate_limited" } });
  });

  it("treats a stream that ends without done as a dropped connection", async () => {
    const { transport, calls } = scriptedTransport();
    const { ai, lastRun } = setup(transport);
    ai.send("두 배로", null);
    calls[0].emit({ type: "text", delta: "..." });
    calls[0].end();
    await flush();
    expect(lastRun()).toMatchObject({ status: "error", error: { code: "network" } });
  });

  it("flags a slow response, clears the flag when data arrives, and times out when nothing comes", () => {
    vi.useFakeTimers();
    const { transport, calls } = scriptedTransport();
    const { ai, lastRun } = setup(transport);
    ai.send("두 배로", null);

    vi.advanceTimersByTime(SLOW_AFTER_MS);
    expect(lastRun()?.slow).toBe(true);
    calls[0].emit({ type: "meta", provider: "mock", model: "m" });
    expect(lastRun()?.slow).toBe(false);

    vi.advanceTimersByTime(IDLE_TIMEOUT_MS);
    expect(lastRun()).toMatchObject({ status: "error", error: { code: "timeout" } });
    expect(calls[0].options.signal.aborted).toBe(true);
  });

  it("sends earlier turns as history", () => {
    const { transport, calls } = scriptedTransport();
    const { ai } = setup(transport);
    ai.send("첫 요청", null);
    calls[0].emit({ type: "text", delta: "첫 답" }, { type: "done" });
    ai.send("이어서", null);
    expect(calls[1].request.history).toEqual([
      { role: "user", text: "첫 요청" },
      { role: "assistant", text: "첫 답" },
    ]);
  });
});

describe("end to end: controller → fetch → route → Claude code → SDK → mock API", () => {
  it("streams real proposals into review and applies them", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("AI_MOCK_DELAY_SCALE", "0");
    vi.stubGlobal("fetch", (url: string, init: RequestInit) =>
      POST(new Request(new URL(url, "http://localhost"), init)),
    );
    const { ai, doc, lastRun } = setup(fetchAiTransport);

    ai.send("두 배로", range("B2:B3"));
    await vi.waitFor(() => expect(lastRun()?.status).toBe("review"));
    const run = lastRun() as AiRun;
    expect(run.provider).toBe("mock");
    expect(run.text).toContain("두 배");
    expect(run.proposals.map((p) => `${p.cell}:${p.before}->${p.after}`)).toEqual([
      "B2:100->200",
      "B3:200->400",
    ]);

    ai.apply();
    expect(getValue(doc, at("B3"))).toBe("400");
  });

  it("shows the HTTP error for a rate limit", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("AI_MOCK_DELAY_SCALE", "0");
    vi.stubGlobal("fetch", (url: string, init: RequestInit) =>
      POST(new Request(new URL(url, "http://localhost"), init)),
    );
    const { ai, lastRun } = setup(fetchAiTransport);
    ai.send("[한도] 두 배로", null);
    await vi.waitFor(() =>
      expect(lastRun()).toMatchObject({ status: "error", error: { code: "rate_limited" } }),
    );
  });
});

describe("createLineSplitter", () => {
  it("joins lines split across chunks", () => {
    const splitter = createLineSplitter();
    expect(splitter.push('{"a":')).toEqual([]);
    expect(splitter.push('1}\n{"b"')).toEqual(['{"a":1}']);
    expect(splitter.push(":2}\n")).toEqual(['{"b":2}']);
    expect(splitter.flush()).toEqual([]);
  });
});

describe("AiController: following the generation", () => {
  it("scrolls the first proposal into view without changing the selection", () => {
    const { transport, calls } = scriptedTransport();
    const { ai, sheet } = setup(transport);
    const reveal = vi.spyOn(sheet, "reveal");
    const before = sheet.selection.get();

    ai.send("채워 줘", null);
    calls[0].emit(
      { type: "edit", cell: "K40", value: "a" },
      { type: "edit", cell: "K41", value: "b" },
    );
    expect(reveal).toHaveBeenCalledTimes(1);
    expect(reveal).toHaveBeenCalledWith(at("K40"));
    expect(sheet.selection.get()).toBe(before);
  });
});

/** 다른 참여자가 이 셀을 바꾼 것처럼 원격 변경으로 적용한다(내 실행 취소 대상이 아니다). */
function remoteEdit(doc: Y.Doc, a1: string, value: string) {
  const other = new Y.Doc();
  Y.applyUpdate(other, Y.encodeStateAsUpdate(doc));
  setValue(other, at(a1), value, EditOrigin.User);
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(other, Y.encodeStateVector(doc)), "remote");
}

/** B2=100, B3=200인 시트에 B2:B3을 두 배로 하라고 요청하고, 첫 제안까지 받은 상태 */
function generating(presence?: AiPresenceBinding) {
  const { transport, calls } = scriptedTransport();
  const env = setup(transport, presence);
  env.ai.send("두 배로", range("B2:B3"));
  calls[0].emit({ type: "edit", cell: "B2", value: "200" });
  const finish = () => calls[0].emit({ type: "edit", cell: "B3", value: "400" }, { type: "done" });
  return { ...env, calls, finish };
}

const statuses = (ai: AiController) => ai.states().map((s) => `${s.proposal.cell}:${s.status}`);

describe("AiController: co-editing", () => {
  it("skips a cell someone changed while it was generating, and one undo reverts only what was applied", () => {
    const { ai, doc, undoManager, finish, lastRun } = generating();
    remoteEdit(doc, "B2", "150");
    finish();

    expect(statuses(ai)).toEqual(["B2:conflict", "B3:clean"]);
    expect(ai.states()[0]).toMatchObject({ current: "150", proposal: { before: "100" } });

    ai.apply();
    expect([getValue(doc, at("B2")), getValue(doc, at("B3"))]).toEqual(["150", "400"]);
    expect(lastRun()?.result).toEqual({ applied: 1, skipped: 1 });

    undoManager.undo();
    expect([getValue(doc, at("B2")), getValue(doc, at("B3"))]).toEqual(["150", "200"]);
    expect(undoManager.canUndo()).toBe(false);
  });

  it("treats a cell deleted while it was generating as a conflict too", () => {
    const { ai, doc, finish } = generating();
    remoteEdit(doc, "B3", "");
    finish();
    expect(statuses(ai)).toEqual(["B2:clean", "B3:conflict"]);
    ai.apply();
    expect([getValue(doc, at("B2")), getValue(doc, at("B3"))]).toEqual(["200", ""]);
  });

  it("re-checks at apply time, including a change that arrives during review", () => {
    const { ai, doc, finish } = generating();
    finish();
    expect(statuses(ai)).toEqual(["B2:clean", "B3:clean"]);

    remoteEdit(doc, "B3", "333");
    expect(statuses(ai)).toEqual(["B2:clean", "B3:conflict"]);
    ai.apply();
    expect(getValue(doc, at("B3"))).toBe("333");
  });

  it("counts my own draft, committed by apply, as a change since the request", () => {
    const { ai, doc, sheet, finish } = generating();
    finish();
    let draft = "";
    sheet.attachView({
      reveal() {},
      focus() {},
      visibleRowCount: () => 20,
      readDraft: () => draft,
      writeDraft: (text) => {
        draft = text;
      },
    });
    sheet.select(collapsedSelection(at("B2")));
    sheet.startEdit("enter", false);
    draft = "mine";

    ai.apply();
    expect([getValue(doc, at("B2")), getValue(doc, at("B3"))]).toEqual(["mine", "400"]);
  });

  it("does not count a cell someone already set to the proposed value", () => {
    const { ai, doc, finish, lastRun } = generating();
    remoteEdit(doc, "B2", "200");
    finish();
    expect(statuses(ai)).toEqual(["B2:same", "B3:clean"]);
    ai.apply();
    expect(lastRun()?.result).toEqual({ applied: 1, skipped: 0 });
  });

  it("overwrites a conflict only while it still holds the value seen when choosing", () => {
    const { ai, doc, finish } = generating();
    remoteEdit(doc, "B2", "150");
    remoteEdit(doc, "B3", "250");
    finish();

    ai.setOverwrite("B2", true);
    ai.setOverwrite("B3", true);
    remoteEdit(doc, "B3", "275"); // 고른 뒤 또 바뀜
    expect(ai.states().map((s) => s.overwrite)).toEqual([true, false]);

    ai.apply();
    expect([getValue(doc, at("B2")), getValue(doc, at("B3"))]).toEqual(["200", "275"]);
  });

  it("overwrites or skips every conflict at once", () => {
    const { ai, doc, finish } = generating();
    remoteEdit(doc, "B2", "150");
    remoteEdit(doc, "B3", "250");
    finish();

    ai.setOverwriteAll(true);
    expect(ai.states().every((s) => s.overwrite)).toBe(true);
    ai.setOverwriteAll(false);
    expect(ai.states().some((s) => s.overwrite)).toBe(false);
    ai.setOverwrite("B3", true);
    ai.apply();
    expect([getValue(doc, at("B2")), getValue(doc, at("B3"))]).toEqual(["150", "400"]);
  });

  it("regenerates with the same instruction and the current values", () => {
    const { ai, doc, calls, finish, lastRun } = generating();
    remoteEdit(doc, "B2", "150");
    finish();
    const first = lastRun()!;

    expect(ai.regenerate()).toBe(true);
    expect(
      ai.messages.get().find((m) => m.role === "assistant" && m.run.id === first.id),
    ).toMatchObject({ run: { status: "discarded" } });
    expect(calls[1].request).toMatchObject({ instruction: "두 배로", range: "B2:B3" });
    expect(calls[1].request.cells).toContainEqual({ cell: "B2", value: "150" });
    expect(ai.overwrites.get().size).toBe(0);
  });

  it("shares the range and stage with other participants, but not on every streamed token", () => {
    const published: Array<AiActivity | null> = [];
    const { transport, calls } = scriptedTransport();
    const { ai } = setup(transport, { setAi: (a) => published.push(a) });

    ai.send("두 배로", range("B2:B3"));
    calls[0].emit(
      { type: "text", delta: "두" },
      { type: "text", delta: " 배" },
      { type: "edit", cell: "B2", value: "200" },
    );
    calls[0].emit({ type: "done" });
    ai.discard();

    expect(published).toEqual([
      { status: "generating", range: range("B2:B3") },
      { status: "reviewing", range: range("B2:B3") },
      null,
    ]);
  });

  it("grows the shared range with the proposals of a whole-sheet request", () => {
    const published: Array<AiActivity | null> = [];
    const { transport, calls } = scriptedTransport();
    const { ai } = setup(transport, { setAi: (a) => published.push(a) });

    ai.send("채워 줘", null);
    calls[0].emit(
      { type: "edit", cell: "C3", value: "a" },
      { type: "edit", cell: "E5", value: "b" },
    );
    ai.cancel();

    expect(
      published.map((a) => (a ? `${a.status}:${a.range ? rangeToA1(a.range) : "*"}` : null)),
    ).toEqual(["generating:*", "generating:C3", "generating:C3:E5", null]);
  });

  it("stops sharing on error and when disconnected, and resumes when connected again", () => {
    const published: Array<AiActivity | null> = [];
    const { transport, calls } = scriptedTransport();
    const { ai, disconnectAi } = setup(transport, { setAi: (a) => published.push(a) });
    ai.send("두 배로", null);
    calls[0].emit({ type: "error", error: aiError("overloaded") });
    expect(published.at(-1)).toBeNull();

    ai.send("다시", null);
    expect(published.at(-1)).toMatchObject({ status: "generating" });
    disconnectAi();
    expect(published.at(-1)).toBeNull();

    // React 개발 모드처럼 정리한 뒤 다시 연결하면 진행 중인 상태를 다시 알린다.
    const reconnect = ai.connect();
    cleanup.push(reconnect);
    expect(published.at(-1)).toMatchObject({ status: "generating" });
    calls[1].emit({ type: "edit", cell: "B2", value: "1" }, { type: "done" });
    expect(published.at(-1)).toMatchObject({ status: "reviewing" });
  });
});
