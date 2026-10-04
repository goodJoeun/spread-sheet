import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiController } from "@/lib/ai/ai-controller";
import { overlappingAi } from "@/lib/ai/coedit";
import type { AiStreamEvent } from "@/lib/ai/protocol";
import type { AiTransport } from "@/lib/ai/transport";
import { createSheetSession, type SheetSession } from "@/lib/collab/session";
import { SheetController } from "@/lib/controller/sheet-controller";
import { parseA1, parseRangeA1, rangeToA1 } from "@/lib/sheet/address";
import { EditOrigin, getValue, setValue } from "@/lib/sheet/document";

// 실제 탭과 같은 구성(Y.Doc + IndexedDB + BroadcastChannel + Presence)을 두 개 열어
// 공동 편집과 AI 편집이 만나는 세 상황을 재현한다. AI 응답만 테스트가 직접 흘려보낸다.

const at = (a1: string) => parseA1(a1)!;
const range = (a1: string) => parseRangeA1(a1)!;

let cleanup: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  for (const fn of cleanup.reverse()) await fn();
  cleanup = [];
});

function scriptedTransport() {
  const calls: Array<{ emit: (...events: AiStreamEvent[]) => void }> = [];
  const transport: AiTransport = (_request, options) =>
    new Promise<void>((resolve, reject) => {
      options.signal.addEventListener("abort", () =>
        reject(new DOMException("aborted", "AbortError")),
      );
      calls.push({ emit: (...events) => events.forEach((e) => options.onEvent(e)) });
    });
  return { transport, calls };
}

async function openTab(sheetId: string, name: string) {
  const session: SheetSession = createSheetSession(sheetId, {
    user: { name, color: name === "A" ? "#e8710a" : "#1e8e3e" },
  });
  const sheet = new SheetController(session);
  const { transport, calls } = scriptedTransport();
  const ai = new AiController(session.doc, sheet, transport, session.presence);
  const disconnect = sheet.connect();
  const disconnectAi = ai.connect();
  cleanup.push(async () => {
    disconnectAi();
    ai.destroy();
    disconnect();
    await session.destroy();
  });
  await session.whenLoaded;
  const othersAi = () =>
    session.presence
      .getParticipants()
      .filter((p) => !p.isSelf)
      .map((p) => p.ai && `${p.user.name}:${p.ai.status}:${p.ai.range && rangeToA1(p.ai.range)}`);
  return { session, doc: session.doc, sheet, ai, calls, othersAi };
}

async function openTwoTabs() {
  const sheetId = crypto.randomUUID();
  const a = await openTab(sheetId, "A");
  const b = await openTab(sheetId, "B");
  setValue(a.doc, at("B2"), "100", EditOrigin.User);
  setValue(a.doc, at("B3"), "200", EditOrigin.User);
  await vi.waitFor(() => {
    expect(getValue(b.doc, at("B3"))).toBe("200");
    expect(b.session.presence.getParticipants()).toHaveLength(2);
  });
  return { a, b };
}

const values = (tab: { doc: SheetSession["doc"] }) =>
  ["B2", "B3"].map((cell) => getValue(tab.doc, at(cell)));

describe("co-editing × AI across tabs", () => {
  it("1. keeps what another participant typed while the AI was generating", async () => {
    const { a, b } = await openTwoTabs();
    a.ai.send("두 배로", range("B2:B3"));
    a.calls[0].emit({ type: "edit", cell: "B2", value: "200" });

    setValue(b.doc, at("B2"), "150", EditOrigin.User);
    await vi.waitFor(() => expect(getValue(a.doc, at("B2"))).toBe("150"));
    a.calls[0].emit({ type: "edit", cell: "B3", value: "400" }, { type: "done" });

    expect(a.ai.states().map((s) => s.status)).toEqual(["conflict", "clean"]);
    a.ai.apply();
    await vi.waitFor(() => expect(values(b)).toEqual(["150", "400"]));
    expect(values(a)).toEqual(["150", "400"]);

    // A의 실행 취소는 A가 적용한 셀만 되돌린다.
    a.session.undoManager.undo();
    await vi.waitFor(() => expect(values(b)).toEqual(["150", "200"]));
  });

  it("2. shows others that a range is being generated and reviewed, and clears it when done or gone", async () => {
    const { a, b } = await openTwoTabs();
    a.ai.send("두 배로", range("B2:B3"));
    await vi.waitFor(() => expect(b.othersAi()).toEqual(["A:generating:B2:B3"]));

    a.calls[0].emit({ type: "edit", cell: "B2", value: "200" }, { type: "done" });
    await vi.waitFor(() => expect(b.othersAi()).toEqual(["A:reviewing:B2:B3"]));
    // 제안 값은 다른 탭의 시트에 나타나지 않는다.
    expect(values(b)).toEqual(["100", "200"]);

    a.ai.discard();
    await vi.waitFor(() => expect(b.othersAi()).toEqual([null]));

    // 검토하던 탭이 닫히면 표시도 바로 사라진다.
    a.ai.send("다시", range("B2:B3"));
    a.calls[1].emit({ type: "edit", cell: "B3", value: "1" }, { type: "done" });
    await vi.waitFor(() => expect(b.othersAi()).toEqual(["A:reviewing:B2:B3"]));
    a.session.leave();
    await vi.waitFor(() => expect(b.othersAi()).toEqual([]));
  });

  it("3. lets overlapping requests proceed; the later one sees the earlier result as conflicts", async () => {
    const { a, b } = await openTwoTabs();
    a.ai.send("두 배로", range("B2:B3"));
    await vi.waitFor(() => expect(b.othersAi()).toEqual(["A:generating:B2:B3"]));

    // B는 요청하기 전에 겹친다는 것을 알 수 있지만, 요청은 막히지 않는다.
    const participants = b.session.presence.getParticipants();
    expect(overlappingAi(participants, range("B3:B4")).map((o) => o.participant.user.name)).toEqual(
      ["A"],
    );
    expect(b.ai.send("1 더하기", range("B3:B4"))).toBe(true);

    a.calls[0].emit(
      { type: "edit", cell: "B2", value: "200" },
      { type: "edit", cell: "B3", value: "400" },
      { type: "done" },
    );
    b.calls[0].emit(
      { type: "edit", cell: "B3", value: "201" },
      { type: "edit", cell: "B4", value: "1" },
      { type: "done" },
    );

    a.ai.apply();
    await vi.waitFor(() => expect(getValue(b.doc, at("B3"))).toBe("400"));

    expect(b.ai.states().map((s) => `${s.proposal.cell}:${s.status}:${s.current}`)).toEqual([
      "B3:conflict:400",
      "B4:clean:",
    ]);
    b.ai.apply();
    await vi.waitFor(() => expect(getValue(a.doc, at("B4"))).toBe("1"));
    expect(getValue(a.doc, at("B3"))).toBe("400");
  });
});
