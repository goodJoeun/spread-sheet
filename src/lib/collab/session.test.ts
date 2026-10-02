import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseA1, type CellCoord } from "@/lib/sheet/address";
import { EditOrigin, getValue, setValue } from "@/lib/sheet/document";
import { createSheetSession, type SheetSession } from "./session";

const at = (a1: string): CellCoord => parseA1(a1)!;
const { User } = EditOrigin;

let open: SheetSession[] = [];
afterEach(async () => {
  await Promise.all(open.map((session) => session.destroy()));
  open = [];
});

function openSheet(sheetId: string) {
  const session = createSheetSession(sheetId);
  open.push(session);
  return session;
}

describe("createSheetSession", () => {
  it("restores content after every tab is closed and the sheet is reopened", async () => {
    const sheetId = crypto.randomUUID();
    const first = openSheet(sheetId);
    await first.whenLoaded;
    setValue(first.doc, at("A1"), "persisted", User);
    await first.destroy();

    const reopened = openSheet(sheetId);
    await reopened.whenLoaded;
    expect(getValue(reopened.doc, at("A1"))).toBe("persisted");
  });

  it("syncs live edits between tabs and keeps undo per tab", async () => {
    const sheetId = crypto.randomUUID();
    const a = openSheet(sheetId);
    const b = openSheet(sheetId);
    await Promise.all([a.whenLoaded, b.whenLoaded]);

    setValue(a.doc, at("A1"), "from A", User);
    setValue(b.doc, at("B1"), "from B", User);
    await vi.waitFor(() => {
      expect(getValue(a.doc, at("B1"))).toBe("from B");
      expect(getValue(b.doc, at("A1"))).toBe("from A");
    });

    b.undoManager.undo();
    await vi.waitFor(() => expect(getValue(a.doc, at("B1"))).toBe(""));
    expect(getValue(a.doc, at("A1"))).toBe("from A");
  });

  it("isolates different sheets", async () => {
    const a = openSheet(crypto.randomUUID());
    const b = openSheet(crypto.randomUUID());
    await Promise.all([a.whenLoaded, b.whenLoaded]);
    setValue(a.doc, at("A1"), "only in a", User);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(getValue(b.doc, at("A1"))).toBe("");
  });
});
