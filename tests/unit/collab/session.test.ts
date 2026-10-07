import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseA1, type CellCoord } from "@/lib/sheet/address";
import { EditOrigin, getValue, setValue } from "@/lib/sheet/document";
import { STORAGE_TIMEOUT_MS, createSheetSession, type SheetSession } from "@/lib/collab/session";

const at = (a1: string): CellCoord => parseA1(a1)!;
const { User } = EditOrigin;

let open: SheetSession[] = [];
afterEach(async () => {
  await Promise.all(open.map((session) => session.destroy()));
  open = [];
  vi.useRealTimers();
  vi.unstubAllGlobals();
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

  it("reports storage as ready once saved content is loaded", async () => {
    await expect(openSheet(crypto.randomUUID()).whenLoaded).resolves.toBe("ready");
  });

  it("opens without storage when IndexedDB never answers, and still syncs tabs", async () => {
    // 응답하지 않는 IndexedDB(차단·멈춤 상황): open 요청이 성공도 실패도 하지 않음.
    vi.stubGlobal("indexedDB", { open: () => ({}) });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const sheetId = crypto.randomUUID();
    const a = openSheet(sheetId);
    const b = openSheet(sheetId);

    vi.advanceTimersByTime(STORAGE_TIMEOUT_MS);
    await expect(a.whenLoaded).resolves.toBe("unavailable");
    await expect(b.whenLoaded).resolves.toBe("unavailable");

    setValue(a.doc, at("A1"), "still syncs", User);
    await vi.waitFor(() => expect(getValue(b.doc, at("A1"))).toBe("still syncs"));
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
