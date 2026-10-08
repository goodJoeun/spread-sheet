import { removeAwarenessStates, type Awareness } from "y-protocols/awareness";
import type { CellCoord } from "@/lib/sheet/address";
import type { Selection } from "@/lib/sheet/selection";
import { normalizeName, pickColor, randomName } from "./identity";
import { TabLiveness, webLocks } from "./liveness";
import {
  DRAFT_MAX_LENGTH,
  isPresenceState,
  normalizePresenceState,
  type AiActivity,
  type Participant,
  type PresenceState,
  type UserInfo,
} from "./presence-state";

/** 내 상태를 다른 탭에 알리고, 다른 탭의 상태를 모아 참여자 목록을 만듦. */

interface AwarenessChanges {
  added: number[];
  updated: number[];
  removed: number[];
}

export class Presence {
  private local: PresenceState;
  private joined = false;
  private destroyed = false;
  private snapshot: Participant[] = [];
  private readonly listeners = new Set<() => void>();
  private readonly liveness: TabLiveness | null;

  constructor(
    private readonly awareness: Awareness,
    user: UserInfo,
    private readonly onUserChange?: (user: UserInfo) => void,
  ) {
    this.local = { user, selection: null, editing: null, draft: null, ai: null };
    const locks = webLocks();
    this.liveness = locks ? new TabLiveness(locks, this.handleGone) : null;
    if (this.liveness) {
      // 살아 있는지는 Web Locks로 확인하므로, 오래 소식 없는 탭을 지우는 기본 타이머는 끔.
      clearInterval(awareness._checkInterval);
    }
    awareness.on("change", this.handleChange);
    this.recompute();
  }

  get clientId(): number {
    return this.awareness.clientID;
  }

  get user(): UserInfo {
    return this.local.user;
  }

  /** 잠금을 쥔 뒤에 내 상태를 공개함. 잠금 없이 공개하면 다른 탭이 나를 이미 떠난 참여자로 볼 수 있음. */
  async join(): Promise<void> {
    if (this.destroyed) return;
    await this.liveness?.hold(this.clientId);
    if (this.destroyed) return;
    this.joined = true;
    this.local = { ...this.local, user: this.avoidTaken(this.local.user) };
    this.publish();
  }

  leave(): void {
    if (!this.joined) return;
    this.joined = false;
    this.awareness.setLocalState(null);
  }

  setSelection(selection: Selection): void {
    this.local = { ...this.local, selection };
    this.publish();
  }

  /** 편집을 끝내면 입력 중이던 글자도 함께 지움. */
  setEditing(editing: CellCoord | null): void {
    this.local = { ...this.local, editing, draft: editing ? this.local.draft : null };
    this.publish();
  }

  setDraft(draft: string | null): void {
    const next = draft === null ? null : draft.slice(0, DRAFT_MAX_LENGTH);
    if (next === this.local.draft) return;
    this.local = { ...this.local, draft: next };
    this.publish();
  }

  setAi(ai: AiActivity | null): void {
    this.local = { ...this.local, ai };
    this.publish();
  }

  rename(name: string): boolean {
    const normalized = normalizeName(name);
    if (!normalized || normalized === this.local.user.name) return false;
    this.updateUser({ ...this.local.user, name: normalized });
    return true;
  }

  getParticipants = (): Participant[] => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.awareness.off("change", this.handleChange);
    this.liveness?.destroy();
    this.listeners.clear();
  }

  private publish(): void {
    if (this.joined && !this.destroyed) this.awareness.setLocalState(this.local);
  }

  private updateUser(user: UserInfo): void {
    this.local = { ...this.local, user };
    this.publish();
    this.onUserChange?.(user);
    this.recompute();
  }

  private otherStates(): Array<[number, PresenceState]> {
    const others: Array<[number, PresenceState]> = [];
    this.awareness.getStates().forEach((state, clientId) => {
      if (clientId !== this.clientId && isPresenceState(state)) others.push([clientId, state]);
    });
    return others;
  }

  private avoidTaken(user: UserInfo): UserInfo {
    const others = this.otherStates().map(([, state]) => state.user);
    const colors = new Set(others.map((u) => u.color));
    const names = new Set(others.map((u) => u.name));
    let next = user;
    if (colors.has(next.color)) next = { ...next, color: pickColor(colors) };
    if (names.has(next.name)) next = { ...next, name: freeName(names) };
    if (next !== user) this.onUserChange?.(next);
    return next;
  }

  /** 이름이나 색이 겹치면 clientID가 큰 쪽이 양보함. 양쪽이 같은 규칙을 따르므로 한쪽만 바뀜. */
  private resolveConflicts(): void {
    if (!this.joined) return;
    const senior = this.otherStates().filter(([clientId]) => clientId < this.clientId);
    const { user } = this.local;
    let next = user;
    if (senior.some(([, s]) => s.user.color === user.color)) {
      next = {
        ...next,
        color: pickColor(new Set(this.otherStates().map(([, s]) => s.user.color))),
      };
    }
    if (senior.some(([, s]) => s.user.name === user.name)) {
      next = {
        ...next,
        name: freeName(new Set(this.otherStates().map(([, s]) => s.user.name))),
      };
    }
    if (next !== user) this.updateUser(next);
  }

  private handleChange = ({ added, removed }: AwarenessChanges): void => {
    for (const clientId of added) if (clientId !== this.clientId) this.liveness?.watch(clientId);
    for (const clientId of removed) this.liveness?.unwatch(clientId);
    this.resolveConflicts();
    this.recompute();
  };

  /** 다른 탭이 닫혔을 때 호출됨(그 탭의 잠금이 풀림). */
  private handleGone = (clientId: number): void => {
    if (!this.destroyed && this.awareness.getStates().has(clientId)) {
      removeAwarenessStates(this.awareness, [clientId], "lock-released");
    }
  };

  private recompute(): void {
    const participants: Participant[] = [];
    this.awareness.getStates().forEach((state, clientId) => {
      if (!isPresenceState(state)) return;
      participants.push({
        ...normalizePresenceState(state),
        clientId,
        isSelf: clientId === this.clientId,
      });
    });
    participants.sort(
      (a, b) => Number(b.isSelf) - Number(a.isSelf) || a.user.name.localeCompare(b.user.name, "ko"),
    );
    this.snapshot = participants;
    this.listeners.forEach((listener) => listener());
  }
}

/** 겹치지 않는 무작위 이름을 찾는 횟수. 그래도 못 찾으면 두 자리 숫자를 붙임. */
const FREE_NAME_ATTEMPTS = 20;

function freeName(taken: Set<string>): string {
  for (let i = 0; i < FREE_NAME_ATTEMPTS; i++) {
    const candidate = randomName();
    if (!taken.has(candidate)) return candidate;
  }
  const twoDigits = 10 + Math.floor(Math.random() * 90);
  return `${randomName()} ${twoDigits}`;
}
