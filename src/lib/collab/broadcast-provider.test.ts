import { afterEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { parseA1, type CellCoord } from "@/lib/sheet/address";
import { EditOrigin, getValue, setValue } from "@/lib/sheet/document";
import { BroadcastChannelProvider } from "./broadcast-provider";
import { createUndoManager } from "./undo";

// Node의 BroadcastChannel도 브라우저처럼 같은 이름의 다른 인스턴스에 메시지를 전달한다.
// 탭 하나 = Y.Doc 하나 + provider 하나로 보고 테스트한다.

const at = (a1: string): CellCoord => parseA1(a1)!;
const { User } = EditOrigin;

let cleanup: Array<() => void> = [];
afterEach(() => {
  cleanup.forEach((fn) => fn());
  cleanup = [];
});

function openTab(room: string) {
  const doc = new Y.Doc();
  const provider = new BroadcastChannelProvider(room, doc);
  cleanup.push(() => provider.destroy());
  return { doc, provider, awareness: provider.awareness };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

describe("BroadcastChannelProvider", () => {
  it("syncs edits between open tabs in both directions", async () => {
    const room = crypto.randomUUID();
    const a = openTab(room);
    const b = openTab(room);

    setValue(a.doc, at("A1"), "from A", User);
    setValue(b.doc, at("B1"), "from B", User);

    await vi.waitFor(() => {
      expect(getValue(b.doc, at("A1"))).toBe("from A");
      expect(getValue(a.doc, at("B1"))).toBe("from B");
    });
  });

  it("gives a late joiner the current content", async () => {
    const room = crypto.randomUUID();
    const a = openTab(room);
    setValue(a.doc, at("C3"), "existing", User);

    const late = openTab(room);
    await vi.waitFor(() => expect(getValue(late.doc, at("C3"))).toBe("existing"));
  });

  it("sends a late joiner's own content to existing tabs", async () => {
    const room = crypto.randomUUID();
    const a = openTab(room);

    // 다른 탭이 모르는 내용을 가진 채 합류하는 경우(예: 저장소에서 먼저 불러온 내용)
    const doc = new Y.Doc();
    setValue(doc, at("D4"), "offline", User);
    const provider = new BroadcastChannelProvider(room, doc);
    cleanup.push(() => provider.destroy());

    await vi.waitFor(() => expect(getValue(a.doc, at("D4"))).toBe("offline"));
  });

  it("does not put changes from other tabs on my undo stack", async () => {
    const room = crypto.randomUUID();
    const a = openTab(room);
    const b = openTab(room);
    const undo = createUndoManager(a.doc);
    cleanup.push(() => undo.destroy());

    setValue(b.doc, at("A1"), "from B", User);
    await vi.waitFor(() => expect(getValue(a.doc, at("A1"))).toBe("from B"));
    expect(undo.canUndo()).toBe(false);
  });

  describe("awareness", () => {
    it("shares presence with tabs that are already open", async () => {
      const room = crypto.randomUUID();
      const a = openTab(room);
      const b = openTab(room);

      a.awareness.setLocalState({ user: { name: "A" } });
      await vi.waitFor(() =>
        expect(b.awareness.getStates().get(a.doc.clientID)).toEqual({ user: { name: "A" } }),
      );
    });

    it("shows existing participants to a tab that joins later", async () => {
      const room = crypto.randomUUID();
      const a = openTab(room);
      a.awareness.setLocalState({ user: { name: "A" } });

      const late = openTab(room);
      await vi.waitFor(() =>
        expect(late.awareness.getStates().get(a.doc.clientID)).toEqual({ user: { name: "A" } }),
      );
    });

    it("removes a participant as soon as their tab closes", async () => {
      const room = crypto.randomUUID();
      const a = openTab(room);
      const b = openTab(room);
      a.awareness.setLocalState({ user: { name: "A" } });
      await vi.waitFor(() => expect(b.awareness.getStates().has(a.doc.clientID)).toBe(true));

      a.provider.destroy();
      await vi.waitFor(() => expect(b.awareness.getStates().has(a.doc.clientID)).toBe(false));
    });

    it("never relays another tab's presence", async () => {
      const room = crypto.randomUUID();
      const a = openTab(room);
      const b = openTab(room);
      // 합류 과정(동기화, awareness 요청/응답)이 끝난 뒤부터 관찰한다.
      await settle();
      const observer = new BroadcastChannel(`spread-sheet:${room}`);
      cleanup.push(() => observer.close());
      let awarenessMessages = 0;
      observer.onmessage = (event: MessageEvent<Uint8Array>) => {
        if (event.data[0] === 1) awarenessMessages++;
      };

      a.awareness.setLocalState({ user: { name: "A" } });
      await vi.waitFor(() => expect(b.awareness.getStates().has(a.doc.clientID)).toBe(true));
      await settle();
      // A가 보낸 한 번만 관찰되어야 한다. B가 A의 상태를 중계했다면 두 번 이상이 된다.
      expect(awarenessMessages).toBe(1);
    });
  });
});
