import { describe, expect, it } from "vitest";
import type { AiProposal } from "@/lib/ai/run";
import {
  activityRange,
  aiActivitiesAt,
  classifyCell,
  evaluateProposals,
  overlappingAi,
  summarize,
} from "@/lib/ai/coedit";
import type { AiActivity, Participant } from "@/lib/collab/presence";
import { parseA1, parseRangeA1, rangeToA1, type CellRange } from "@/lib/sheet/address";

const at = (a1: string) => parseA1(a1)!;
const range = (a1: string) => parseRangeA1(a1)!;

const proposal = (cell: string, before: string, after: string): AiProposal => ({
  coord: at(cell),
  cell,
  before,
  after,
});

function participant(clientId: number, ai: AiActivity | null, isSelf = false): Participant {
  return {
    clientId,
    isSelf,
    user: { name: `참여자 ${clientId}`, color: "#e8710a" },
    selection: null,
    editing: null,
    ai,
  };
}

describe("classifyCell(base, current, proposed)", () => {
  it.each([
    ["1", "1", "2", "clean"],
    ["", "", "new", "clean"],
    // 요청 뒤 다른 값으로 바뀜(수정, 삭제, 빈칸에 입력)
    ["1", "5", "2", "conflict"],
    ["1", "", "2", "conflict"],
    ["", "typed", "2", "conflict"],
    // 지금 값이 이미 제안과 같음(다른 참여자가 같은 값으로 바꾼 경우 포함)
    ["1", "2", "2", "same"],
    ["1", "1", "1", "same"],
  ] as const)("base %j, current %j, proposed %j → %s", (base, current, proposed, status) => {
    expect(classifyCell(base, current, proposed)).toBe(status);
  });
});

describe("evaluateProposals", () => {
  const proposals = [proposal("B2", "100", "200"), proposal("B3", "300", "600")];

  it("compares each proposal with the current value", () => {
    const current = new Map([
      ["B2", "100"],
      ["B3", "999"],
    ]);
    const states = evaluateProposals(proposals, (cell) => current.get(cell) ?? "", new Map());
    expect(states.map((s) => [s.proposal.cell, s.current, s.status, s.overwrite])).toEqual([
      ["B2", "100", "clean", false],
      ["B3", "999", "conflict", false],
    ]);
    expect(summarize(states)).toEqual({ toApply: 1, skipped: 1, conflicts: 1 });
  });

  it("binds an overwrite to the value seen when it was chosen", () => {
    const read = (b3: string) => (cell: string) => (cell === "B3" ? b3 : "100");
    const overwrites = new Map([["B3", "999"]]);

    const chosen = evaluateProposals(proposals, read("999"), overwrites);
    expect(chosen[1]).toMatchObject({ status: "conflict", overwrite: true });
    expect(summarize(chosen)).toEqual({ toApply: 2, skipped: 0, conflicts: 1 });

    // 고른 뒤에 또 바뀌면 그 값은 확인하지 않았으므로 다시 건너뛴다.
    const changedAgain = evaluateProposals(proposals, read("1000"), overwrites);
    expect(changedAgain[1]).toMatchObject({ status: "conflict", overwrite: false });
  });

  it("clears the conflict when the cell is changed back", () => {
    const states = evaluateProposals(
      proposals,
      (cell) => (cell === "B2" ? "100" : "300"),
      new Map(),
    );
    expect(states.map((s) => s.status)).toEqual(["clean", "clean"]);
  });
});

describe("activityRange", () => {
  it("uses the requested range, or the cells proposed so far for a whole-sheet request", () => {
    expect(rangeToA1(activityRange(range("A1:C3"), [])!)).toBe("A1:C3");
    expect(activityRange(null, [])).toBeNull();
    expect(rangeToA1(activityRange(null, [{ coord: at("D5") }, { coord: at("B9") }])!)).toBe(
      "B5:D9",
    );
  });
});

describe("overlappingAi", () => {
  const reviewing = (r: CellRange | null): AiActivity => ({ status: "reviewing", range: r });

  it("finds other participants whose AI range overlaps mine", () => {
    const people = [
      participant(1, reviewing(range("B2:C3")), true), // 나 자신은 빼고
      participant(2, reviewing(range("C3:D4"))),
      participant(3, reviewing(range("F1:F9"))),
      participant(4, null),
    ];
    expect(overlappingAi(people, range("A1:C3")).map((o) => o.participant.clientId)).toEqual([2]);
  });

  it("treats a whole-sheet request on either side as overlapping", () => {
    expect(overlappingAi([participant(2, reviewing(null))], range("Z99:Z99"))).toHaveLength(1);
    expect(overlappingAi([participant(2, reviewing(range("A1:A1")))], null)).toHaveLength(1);
  });

  it("only warns about a cell once the other participant's range is known", () => {
    const people = [participant(2, reviewing(null)), participant(3, reviewing(range("B2:B4")))];
    expect(aiActivitiesAt(people, at("B3")).map((o) => o.participant.clientId)).toEqual([3]);
    expect(aiActivitiesAt(people, at("Z1"))).toEqual([]);
  });
});
