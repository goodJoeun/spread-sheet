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

  /** 이 탭의 번호(Yjs clientID). 이름·색 충돌 양보와 생존 확인 잠금 이름에 씀. */
  get clientId(): number {
    return this.awareness.clientID;
  }

  /** 지금 이 탭의 이름과 색. */
  get user(): UserInfo {
    return this.local.user;
  }

  /** 참여함. 생존 확인 잠금을 먼저 쥔 뒤에 내 상태를 공개함(잠금 없이 공개하면 다른 탭이 나를 이미 떠난 참여자로 볼 수 있음). 이름·색이 겹치면 바꿔서 공개함. */
  async join(): Promise<void> {
    if (this.destroyed) return;
    await this.liveness?.hold(this.clientId);
    if (this.destroyed) return;
    this.joined = true;
    const user = this.avoidTaken(this.local.user);
    if (user !== this.local.user) this.onUserChange?.(user);
    this.local = { ...this.local, user };
    this.publish();
  }

  /** 내 상태를 지워 다른 탭 목록에서 바로 빠짐(탭을 닫을 때). */
  leave(): void {
    if (!this.joined) return;
    this.joined = false;
    this.awareness.setLocalState(null);
  }

  /** 내 선택 범위를 다른 탭에 알림. */
  setSelection(selection: Selection): void {
    this.local = { ...this.local, selection };
    this.publish();
  }

  /** 편집 중인 셀을 알림. 편집을 끝내면 입력 중이던 글자도 함께 지움. */
  setEditing(editing: CellCoord | null): void {
    this.local = { ...this.local, editing, draft: editing ? this.local.draft : null };
    this.publish();
  }

  // [흐름 28 · 2c03693] 입력 중인 글자는 문서가 아니라 참여 상태로 보냄. 문서에 쓰면 저장되고 실행 취소 기록에도 남기 때문.
  /** 입력 중인 글자를 알림. 모든 탭에 보내므로 1,000자까지만, 바뀌었을 때만 보냄. */
  setDraft(draft: string | null): void {
    const next = draft === null ? null : draft.slice(0, DRAFT_MAX_LENGTH);
    if (next === this.local.draft) return;
    this.local = { ...this.local, draft: next };
    this.publish();
  }

  /** 내 AI 작업 상태(생성·검토 중, 범위, 잠금)를 알림. 제안 값은 싣지 않음. */
  setAi(ai: AiActivity | null): void {
    this.local = { ...this.local, ai };
    this.publish();
  }

  /** 내 이름을 바꿈. 바뀌었으면 true. */
  rename(name: string): boolean {
    const normalized = normalizeName(name);
    if (!normalized || normalized === this.local.user.name) return false;
    this.updateUser({ ...this.local.user, name: normalized });
    return true;
  }

  /** 지금 참여자 목록(나 먼저, 나머지는 이름순). */
  getParticipants = (): Participant[] => this.snapshot;

  /** 참여자 목록이 바뀌면 알림을 받음. 해제 함수를 돌려줌. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** awareness 구독과 생존 확인을 정리함. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.awareness.off("change", this.handleChange);
    this.liveness?.destroy();
    this.listeners.clear();
  }

  /** 참여한 뒤에만 내 상태를 awareness에 올림. */
  private publish(): void {
    if (this.joined && !this.destroyed) this.awareness.setLocalState(this.local);
  }

  /** 이름·색을 바꿔 알리고, 탭별 저장(onUserChange)도 부름. */
  private updateUser(user: UserInfo): void {
    this.local = { ...this.local, user };
    this.publish();
    this.onUserChange?.(user);
    this.recompute();
  }

  /** 다른 탭들의 상태 중 형식이 올바른 것만 모음. */
  private otherStates(): Array<[number, PresenceState]> {
    const others: Array<[number, PresenceState]> = [];
    this.awareness.getStates().forEach((state, clientId) => {
      if (clientId !== this.clientId && isPresenceState(state)) others.push([clientId, state]);
    });
    return others;
  }

  /** 다른 참여자가 이미 쓰는 이름·색이면 겹치지 않게 바꾼 신원을 돌려줌. 겹치지 않으면 받은 객체 그대로. */
  private avoidTaken(user: UserInfo): UserInfo {
    const others = this.otherStates().map(([, state]) => state.user);
    const colors = new Set(others.map((u) => u.color));
    const names = new Set(others.map((u) => u.name));
    let next = user;
    if (colors.has(next.color)) next = { ...next, color: pickColor(colors) };
    if (names.has(next.name)) next = { ...next, name: freeName(names) };
    return next;
  }

  // [흐름 11 · f63fb07] 탭 복제(sessionStorage 복사)만 따로 감지하려다, 우연히 겹친 경우까지 이 규칙 하나로 풀기로 함.
  /** 이름이나 색이 겹치면 clientID가 큰 쪽이 양보해 다시 고름. 양쪽이 같은 규칙을 따르므로 한쪽만 바뀜. */
  private resolveConflicts(): void {
    if (!this.joined) return;
    const others = this.otherStates();
    const senior = others.filter(([clientId]) => clientId < this.clientId);
    const { user } = this.local;
    let next = user;
    if (senior.some(([, s]) => s.user.color === user.color)) {
      next = { ...next, color: pickColor(new Set(others.map(([, s]) => s.user.color))) };
    }
    if (senior.some(([, s]) => s.user.name === user.name)) {
      next = { ...next, name: freeName(new Set(others.map(([, s]) => s.user.name))) };
    }
    if (next !== user) this.updateUser(next);
  }

  /** awareness가 바뀌면 새로 들어온 탭의 생존 확인을 시작하고, 이름·색 겹침을 풀고, 목록을 다시 만듦. */
  private handleChange = ({ added, removed }: AwarenessChanges): void => {
    for (const clientId of added) if (clientId !== this.clientId) this.liveness?.watch(clientId);
    for (const clientId of removed) this.liveness?.unwatch(clientId);
    this.resolveConflicts();
    this.recompute();
  };

  /** 다른 탭이 닫혔을 때(그 탭의 잠금이 풀림) 그 탭의 참여 상태를 지움. */
  private handleGone = (clientId: number): void => {
    if (!this.destroyed && this.awareness.getStates().has(clientId)) {
      removeAwarenessStates(this.awareness, [clientId], "lock-released");
    }
  };

  /** 참여 상태를 검증·보정해 참여자 목록을 다시 만들고 구독자에게 알림. */
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

/** 아무도 쓰지 않는 무작위 이름을 찾음. 못 찾으면 두 자리 숫자를 붙임. */
function freeName(taken: Set<string>): string {
  for (let i = 0; i < FREE_NAME_ATTEMPTS; i++) {
    const candidate = randomName();
    if (!taken.has(candidate)) return candidate;
  }
  const twoDigits = 10 + Math.floor(Math.random() * 90);
  return `${randomName()} ${twoDigits}`;
}
