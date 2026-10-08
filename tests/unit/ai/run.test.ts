import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { aiActivityOf } from "@/lib/ai/coedit";
import { conversationHistory, snapshotCells } from "@/lib/ai/request";
import { applyProgress, createRun, finishRun, isRunning, type AiMessage } from "@/lib/ai/run";
import { EditOrigin, writeValues } from "@/lib/sheet/document";

const run = (scope = { start: { row: 0, col: 0 }, end: { row: 1, col: 1 } }) =>
  createRun({ id: 1, instruction: "x", scope, model: null, base: new Map([["A1", "1"]]) });

describe("applyProgress", () => {
  it("범위 안의 제안만 받고, 범위 밖·잘못된 주소는 센다", () => {
    let r = run();
    r = applyProgress(r, { type: "edit", cell: "B2", value: "2" });
    r = applyProgress(r, { type: "edit", cell: "C3", value: "3" });
    r = applyProgress(r, { type: "edit", cell: "??", value: "4" });
    expect(r.proposals.map((p) => p.cell)).toEqual(["B2"]);
    expect(r.excluded).toBe(2);
    expect(r.status).toBe("streaming");
  });

  it("같은 셀은 나중 제안으로 바꾸고, 요청 때 값과 같아지면 뺀다", () => {
    let r = applyProgress(run(), { type: "edit", cell: "a1", value: "9" });
    expect(r.proposals).toMatchObject([{ cell: "A1", before: "1", after: "9" }]);
    r = applyProgress(r, { type: "edit", cell: "A1", value: "1" });
    expect(r.proposals).toEqual([]);
  });

  it("글과 경고를 이어 붙인다", () => {
    let r = applyProgress(run(), { type: "text", delta: "두 " });
    r = applyProgress(r, { type: "text", delta: "배" });
    r = applyProgress(r, { type: "warning", warning: { code: "truncated" } });
    expect(r.text).toBe("두 배");
    expect(r.warnings).toEqual([{ code: "truncated" }]);
  });
});

describe("finishRun / isRunning / aiActivityOf", () => {
  it("제안이 있으면 검토, 없으면 답만 한 것으로 끝난다", () => {
    const withEdit = applyProgress(run(), { type: "edit", cell: "B1", value: "x" });
    expect(finishRun(withEdit).status).toBe("review");
    expect(finishRun(run()).status).toBe("answered");
  });

  it("생성·검토 중일 때만 다른 참여자에게 알린다", () => {
    const r = run();
    expect(isRunning(r)).toBe(true);
    expect(aiActivityOf(r)).toEqual({ status: "generating", range: r.scope, locked: false });
    const reviewing = finishRun(applyProgress(r, { type: "edit", cell: "B1", value: "x" }));
    expect(isRunning(reviewing)).toBe(false);
    expect(aiActivityOf(reviewing)).toMatchObject({ status: "reviewing" });
    expect(aiActivityOf(finishRun(r))).toBeNull();
    expect(aiActivityOf(null)).toBeNull();
  });

  it("잠근 실행은 제안과 상관없이 요청한 범위를 그대로 잠근다", () => {
    const r = createRun({
      id: 1,
      instruction: "x",
      scope: null,
      model: null,
      base: new Map(),
      locked: true,
    });
    const withEdit = applyProgress(r, { type: "edit", cell: "C3", value: "x" });
    expect(aiActivityOf(withEdit)).toEqual({ status: "generating", range: null, locked: true });
  });
});

describe("request", () => {
  it("비어 있지 않은 셀을 행 우선 순서로 싣는다", () => {
    const doc = new Y.Doc();
    writeValues(
      doc,
      [
        { coord: { row: 1, col: 0 }, value: "A2" },
        { coord: { row: 0, col: 1 }, value: "B1" },
        { coord: { row: 0, col: 0 }, value: "A1" },
      ],
      EditOrigin.User,
    );
    expect(snapshotCells(doc).map((c) => c.cell)).toEqual(["A1", "B1", "A2"]);
  });

  it("글로 답하지 않은 실행은 대화 기록에서 뺀다", () => {
    const messages: AiMessage[] = [
      { id: 1, role: "user", text: "질문", scope: null },
      { id: 2, role: "assistant", run: { ...run(), text: "답" } },
      { id: 3, role: "user", text: "편집만", scope: null },
      { id: 4, role: "assistant", run: run() },
    ];
    expect(conversationHistory(messages)).toEqual([
      { role: "user", text: "질문" },
      { role: "assistant", text: "답" },
      { role: "user", text: "편집만" },
    ]);
  });
});
