import { afterEach, describe, expect, it, vi } from "vitest";
import { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import { collapsedSelection } from "@/lib/sheet/selection";
import { BroadcastChannelProvider } from "@/lib/collab/broadcast-provider";
import { PARTICIPANT_COLORS } from "@/resources/colors";
import { normalizeName, pickColor } from "@/lib/collab/identity";
import { Presence } from "@/lib/collab/presence";
import { DRAFT_MAX_LENGTH, type UserInfo } from "@/lib/collab/presence-state";

// 탭 하나 = Y.Doc + Awareness + BroadcastChannelProvider + Presence.
// Node 24에는 BroadcastChannel과 Web Locks(navigator.locks)가 있어서, 브라우저와 같은 경로로 동작함.

let cleanup: Array<() => void> = [];
afterEach(() => {
  cleanup.forEach((fn) => fn());
  cleanup = [];
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

interface TabOptions {
  clientId?: number;
  user?: UserInfo;
  onUserChange?: (user: UserInfo) => void;
}

function openTab(room: string, { clientId, user, onUserChange }: TabOptions = {}) {
  const doc = new Y.Doc();
  if (clientId !== undefined) doc.clientID = clientId;
  const awareness = new Awareness(doc);
  const provider = new BroadcastChannelProvider(room, doc, { awareness });
  const presence = new Presence(
    awareness,
    user ?? { name: `참여자 ${doc.clientID}`, color: "#e8710a" },
    onUserChange,
  );
  cleanup.push(() => {
    provider.destroy();
    presence.destroy();
    awareness.destroy();
  });
  return { doc, awareness, provider, presence };
}

const names = (presence: Presence) => presence.getParticipants().map((p) => p.user.name);

describe("Presence", () => {
  it("lists every open tab, with myself first", async () => {
    const room = crypto.randomUUID();
    const a = openTab(room, { user: { name: "다람쥐", color: PARTICIPANT_COLORS[0] } });
    const b = openTab(room, { user: { name: "고래", color: PARTICIPANT_COLORS[1] } });
    await Promise.all([a.presence.join(), b.presence.join()]);

    await vi.waitFor(() => expect(names(a.presence)).toEqual(["다람쥐", "고래"]));
    expect(names(b.presence)).toEqual(["고래", "다람쥐"]);
    const [self, other] = a.presence.getParticipants();
    expect(self.isSelf).toBe(true);
    expect(other).toMatchObject({ isSelf: false, clientId: b.doc.clientID });
  });

  it("shares the selected range and the cell being edited", async () => {
    const room = crypto.randomUUID();
    const a = openTab(room);
    const b = openTab(room);
    await Promise.all([a.presence.join(), b.presence.join()]);

    const selection = { ...collapsedSelection({ row: 1, col: 1 }), focus: { row: 3, col: 2 } };
    a.presence.setSelection(selection);
    a.presence.setEditing({ row: 1, col: 1 });

    await vi.waitFor(() => {
      const seen = b.presence.getParticipants().find((p) => !p.isSelf);
      expect(seen?.selection).toEqual(selection);
      expect(seen?.editing).toEqual({ row: 1, col: 1 });
    });
  });

  it("shares the text being typed, and drops it when editing ends", async () => {
    const room = crypto.randomUUID();
    const a = openTab(room);
    const b = openTab(room);
    await Promise.all([a.presence.join(), b.presence.join()]);
    const other = () => b.presence.getParticipants().find((p) => !p.isSelf);

    a.presence.setEditing({ row: 0, col: 0 });
    a.presence.setDraft("안녕");
    await vi.waitFor(() => expect(other()?.draft).toBe("안녕"));

    a.presence.setDraft("x".repeat(DRAFT_MAX_LENGTH + 10));
    await vi.waitFor(() => expect(other()?.draft).toHaveLength(DRAFT_MAX_LENGTH));

    a.presence.setEditing(null);
    await vi.waitFor(() => expect(other()?.draft).toBeNull());
  });

  it("shares the AI edit in progress, without the proposed values", async () => {
    const room = crypto.randomUUID();
    const a = openTab(room);
    const b = openTab(room);
    await Promise.all([a.presence.join(), b.presence.join()]);
    const other = () => b.presence.getParticipants().find((p) => !p.isSelf);

    const range = { start: { row: 1, col: 1 }, end: { row: 2, col: 1 } };
    a.presence.setAi({ status: "reviewing", range, locked: true });
    await vi.waitFor(() =>
      expect(other()?.ai).toEqual({ status: "reviewing", range, locked: true }),
    );

    a.presence.setAi(null);
    await vi.waitFor(() => expect(other()?.ai).toBeNull());
  });

  it("accepts presence without an AI field, and ignores a malformed one", async () => {
    const room = crypto.randomUUID();
    const a = openTab(room);
    const b = openTab(room);
    // 잠금을 쥔(살아 있는) 탭이 이전 형식이나 잘못된 형식의 상태를 보내는 경우
    await Promise.all([a.presence.join(), b.presence.join()]);
    const user = { name: "이전 버전", color: "#1e8e3e" };

    b.awareness.setLocalState({ user, selection: null, editing: null });
    await vi.waitFor(() => expect(a.presence.getParticipants()).toHaveLength(2));
    expect(a.presence.getParticipants().find((p) => !p.isSelf)?.ai).toBeNull();

    b.awareness.setLocalState({ user, selection: null, editing: null, ai: { status: "hacking" } });
    await vi.waitFor(() => expect(a.presence.getParticipants()).toHaveLength(1));
  });

  it("drops a participant who leaves the page", async () => {
    const room = crypto.randomUUID();
    const a = openTab(room);
    const b = openTab(room);
    await Promise.all([a.presence.join(), b.presence.join()]);
    await vi.waitFor(() => expect(b.presence.getParticipants()).toHaveLength(2));

    a.presence.leave();
    await vi.waitFor(() => expect(b.presence.getParticipants()).toHaveLength(1));
  });

  it("drops a tab that vanished without saying goodbye, once its lock is released", async () => {
    const room = crypto.randomUUID();
    const a = openTab(room);
    const b = openTab(room);
    await Promise.all([a.presence.join(), b.presence.join()]);
    await vi.waitFor(() => expect(b.presence.getParticipants()).toHaveLength(2));

    // 탭이 비정상 종료된 상황: awareness 제거 메시지 없이 잠금만 풀린다.
    a.presence.destroy();
    await vi.waitFor(() => expect(b.presence.getParticipants()).toHaveLength(1));
  });

  /**
   * A가 1분 넘게 아무 소식이 없는 상황을 만든 뒤 B의 점검 타이머를 돌린다.
   * (awareness는 시각을 lib0가 import 시점에 잡아 둔 Date.now로 읽어서 가짜 Date로는 시간을 흘릴 수 없다.
   *  대신 B가 기억하는 A의 마지막 갱신 시각을 1분 전으로 돌린다.)
   */
  async function makeQuiet() {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const room = crypto.randomUUID();
    const a = openTab(room);
    const b = openTab(room);
    await Promise.all([a.presence.join(), b.presence.join()]);
    await vi.waitFor(() => expect(b.presence.getParticipants()).toHaveLength(2));
    b.awareness.meta.get(a.doc.clientID)!.lastUpdated -= 60_000;
    vi.advanceTimersByTime(10_000);
    return b;
  }

  it("keeps a quiet (e.g. hidden, throttled) tab listed for as long as it is open", async () => {
    const b = await makeQuiet();
    expect(b.presence.getParticipants()).toHaveLength(2);
  });

  it("falls back to the awareness timeout when Web Locks are unavailable", async () => {
    vi.stubGlobal("navigator", {});
    const b = await makeQuiet();
    expect(b.presence.getParticipants().map((p) => p.isSelf)).toEqual([true]);
  });

  it("resolves a name/color clash so that exactly one tab changes", async () => {
    const room = crypto.randomUUID();
    const clash = { name: "같은 이름", color: PARTICIPANT_COLORS[0] };
    const changes: string[] = [];
    const base = Math.floor(Math.random() * 1e8) + 1000;
    const a = openTab(room, {
      clientId: base + 1,
      user: clash,
      onUserChange: () => changes.push("a"),
    });
    const b = openTab(room, {
      clientId: base + 2,
      user: clash,
      onUserChange: () => changes.push("b"),
    });
    await Promise.all([a.presence.join(), b.presence.join()]);

    await vi.waitFor(() => {
      const [selfA, otherA] = a.presence.getParticipants();
      expect(otherA).toBeDefined();
      expect(selfA.user.name).not.toBe(otherA.user.name);
      expect(selfA.user.color).not.toBe(otherA.user.color);
    });
    const kept = [a.presence.user, b.presence.user].filter(
      (u) => u.name === clash.name && u.color === clash.color,
    );
    expect(kept).toHaveLength(1);
    expect(new Set(changes).size).toBe(1);
  });

  it("ignores malformed presence from other tabs", async () => {
    const room = crypto.randomUUID();
    const a = openTab(room);
    const b = openTab(room);
    await a.presence.join();
    b.awareness.setLocalState({ user: "not an object", selection: 42 });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(a.presence.getParticipants()).toHaveLength(1);
  });

  it("renames with normalization and shares the new name", async () => {
    const room = crypto.randomUUID();
    const a = openTab(room);
    const b = openTab(room);
    await Promise.all([a.presence.join(), b.presence.join()]);

    expect(a.presence.rename("   ")).toBe(false);
    expect(a.presence.rename("  새   이름 ")).toBe(true);
    await vi.waitFor(() => expect(names(b.presence)).toContain("새 이름"));
  });
});

describe("helpers", () => {
  it("prefers colors nobody uses yet", () => {
    const taken = new Set(PARTICIPANT_COLORS.slice(0, -1));
    expect(pickColor(taken)).toBe(PARTICIPANT_COLORS.at(-1));
    expect(PARTICIPANT_COLORS).toContain(pickColor(new Set(PARTICIPANT_COLORS)));
  });

  it("normalizes names", () => {
    expect(normalizeName("  a  b ")).toBe("a b");
    expect(normalizeName("")).toBeNull();
    expect(normalizeName("가".repeat(50))).toHaveLength(20);
  });
});
