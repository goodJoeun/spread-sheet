import { describe, expect, it } from "vitest";
import { lockHolder } from "@/lib/collab/locks";
import type { AiActivity, Participant } from "@/lib/collab/presence-state";
import { parseRangeA1, type CellRange } from "@/lib/sheet/address";

const range = (a1: string) => parseRangeA1(a1)!;

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

const locked = (r: CellRange | null): AiActivity => ({
  status: "generating",
  range: r,
  locked: true,
});

describe("lockHolder", () => {
  it("finds another participant who locked an overlapping range", () => {
    const people = [participant(2, locked(range("B2:C3"))), participant(3, locked(range("F1:F9")))];
    expect(lockHolder(people, range("C3:D4"))?.clientId).toBe(2);
    expect(lockHolder(people, range("A1:A9"))).toBeNull();
  });

  it("ignores my own lock and unlocked AI edits", () => {
    const people = [
      participant(1, locked(range("A1:C3")), true),
      participant(2, { status: "reviewing", range: range("A1:C3"), locked: false }),
    ];
    expect(lockHolder(people, range("B2:B2"))).toBeNull();
  });

  it("treats a locked whole-sheet request as locking every cell", () => {
    expect(lockHolder([participant(2, locked(null))], range("Z99:Z99"))?.clientId).toBe(2);
  });
});
