import { removeAwarenessStates, type Awareness } from "y-protocols/awareness";
import type { CellCoord, CellRange } from "@/lib/sheet/address";
import type { Selection } from "@/lib/sheet/selection";

/**
 * 참여자 표시(presence).
 *
 * awareness에 { user, selection, editing, ai }를 싣고, 다른 탭의 상태를 참여자 목록으로 만든다.
 *
 * 탭이 살아 있는지는 타이머가 아니라 Web Locks로 판단한다.
 * - 각 탭은 자기 clientID 이름의 잠금을 쥔 다음에 awareness를 공개한다.
 * - 다른 탭은 그 잠금을 요청해 두고 기다린다. 탭이 닫히거나 죽으면 브라우저가 잠금을 풀고,
 *   기다리던 탭에 잠금이 넘어오는 순간 그 참여자를 지운다.
 * y-protocols의 기본 방식(15초마다 갱신, 30초 무소식이면 삭제)은 크롬이 5분 넘게 가려진 탭의
 * 타이머를 1분에 한 번으로 늦추기 때문에, 열려 있는 탭이 목록에서 사라졌다 나타나는 문제가 있다.
 * Web Locks를 쓸 수 없는 환경에서는 기본 방식을 그대로 쓴다.
 */

export interface UserInfo {
  name: string;
  color: string;
}

/**
 * 내 AI 편집이 어디까지 왔는지. 다른 참여자에게 "○○님이 이 범위를 AI로 편집 중"으로 보인다.
 * 제안 값 자체는 싣지 않는다(확정되지 않은 값이 실제 데이터처럼 보이지 않게, 토큰마다 방송하지 않게).
 */
export interface AiActivity {
  status: "generating" | "reviewing";
  /** 편집 범위. 시트 전체 요청이라 아직 제안이 없으면 null */
  range: CellRange | null;
}

export interface PresenceState {
  user: UserInfo;
  selection: Selection | null;
  /** 지금 입력 중인 셀 */
  editing: CellCoord | null;
  /** 진행 중인 AI 편집 */
  ai: AiActivity | null;
}

export interface Participant extends PresenceState {
  clientId: number;
  isSelf: boolean;
}

/** 흰 글자를 얹어도 읽히는 색. 내 선택 표시에 쓰는 파란색(#1a73e8)은 뺐다. */
export const PARTICIPANT_COLORS = [
  "#e8710a",
  "#1e8e3e",
  "#d93025",
  "#9334e6",
  "#00838f",
  "#c2185b",
  "#3f51b5",
  "#795548",
  "#b06000",
  "#827717",
];

const ADJECTIVES = [
  "용감한",
  "졸린",
  "배고픈",
  "신난",
  "차분한",
  "수줍은",
  "똑똑한",
  "느긋한",
  "상냥한",
  "날쌘",
  "엉뚱한",
  "반짝이는",
  "씩씩한",
  "명랑한",
  "꼼꼼한",
  "부지런한",
];

const ANIMALS = [
  "수달",
  "판다",
  "고래",
  "여우",
  "다람쥐",
  "펭귄",
  "부엉이",
  "고양이",
  "강아지",
  "코알라",
  "너구리",
  "토끼",
  "사슴",
  "알파카",
  "돌고래",
  "햄스터",
];

const MAX_NAME_LENGTH = 20;

const pick = <T>(items: readonly T[], random: () => number): T =>
  items[Math.floor(random() * items.length)];

export function randomName(random: () => number = Math.random): string {
  return `${pick(ADJECTIVES, random)} ${pick(ANIMALS, random)}`;
}

/** 다른 참여자가 쓰지 않는 색을 고른다. 모두 쓰였으면 아무 색이나. */
export function pickColor(taken: Set<string>, random: () => number = Math.random): string {
  const free = PARTICIPANT_COLORS.filter((color) => !taken.has(color));
  return pick(free.length > 0 ? free : PARTICIPANT_COLORS, random);
}

export function randomUser(random: () => number = Math.random): UserInfo {
  return { name: randomName(random), color: pickColor(new Set(), random) };
}

/** 이름 앞뒤 공백을 없애고 길이를 제한한다. 비면 null. */
export function normalizeName(name: string): string | null {
  const trimmed = name.trim().replace(/\s+/g, " ").slice(0, MAX_NAME_LENGTH);
  return trimmed.length > 0 ? trimmed : null;
}

const isCoord = (value: unknown): value is CellCoord =>
  typeof value === "object" &&
  value !== null &&
  Number.isInteger((value as CellCoord).row) &&
  Number.isInteger((value as CellCoord).col);

const isSelection = (value: unknown): value is Selection =>
  typeof value === "object" &&
  value !== null &&
  isCoord((value as Selection).anchor) &&
  isCoord((value as Selection).focus) &&
  isCoord((value as Selection).active);

const isRange = (value: unknown): value is CellRange =>
  typeof value === "object" &&
  value !== null &&
  isCoord((value as CellRange).start) &&
  isCoord((value as CellRange).end);

const isAiActivity = (value: unknown): value is AiActivity =>
  typeof value === "object" &&
  value !== null &&
  ((value as AiActivity).status === "generating" || (value as AiActivity).status === "reviewing") &&
  ((value as AiActivity).range === null || isRange((value as AiActivity).range));

/** 다른 탭에서 온 상태는 형식을 확인한 뒤에만 쓴다. ai가 없으면(이전 버전 탭) 진행 중인 AI 편집이 없는 것으로 본다. */
export function isPresenceState(value: unknown): value is PresenceState {
  if (typeof value !== "object" || value === null) return false;
  const { user, selection, editing, ai } = value as PresenceState;
  return (
    typeof user === "object" &&
    user !== null &&
    typeof user.name === "string" &&
    typeof user.color === "string" &&
    (selection === null || isSelection(selection)) &&
    (editing === null || isCoord(editing)) &&
    (ai === undefined || ai === null || isAiActivity(ai))
  );
}

const LOCK_PREFIX = "spread-sheet:presence:";
const lockName = (clientId: number) => `${LOCK_PREFIX}${clientId}`;

function webLocks(): LockManager | null {
  return typeof navigator !== "undefined" && navigator.locks ? navigator.locks : null;
}

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
  private readonly watchers = new Map<number, AbortController>();
  private releaseOwnLock: (() => void) | null = null;
  private readonly locks = webLocks();

  constructor(
    private readonly awareness: Awareness,
    user: UserInfo,
    private readonly onUserChange?: (user: UserInfo) => void,
  ) {
    this.local = { user, selection: null, editing: null, ai: null };
    if (this.locks) {
      // 생존 확인을 잠금으로 하므로, 시간이 지나면 다른 탭의 상태를 지우는 기본 타이머는 끈다.
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

  /** 잠금을 쥔 뒤 내 상태를 공개한다. 잠금 없이 공개하면 다른 탭이 나를 이미 떠난 것으로 볼 수 있다. */
  async join(): Promise<void> {
    if (this.destroyed) return;
    if (this.locks && !this.releaseOwnLock) await this.acquireOwnLock(this.locks);
    if (this.destroyed) return;
    this.joined = true;
    this.local = { ...this.local, user: this.avoidTaken(this.local.user) };
    this.publish();
  }

  /** 탭을 떠날 때(pagehide) 내 상태를 지워 다른 탭에서 바로 사라지게 한다. */
  leave(): void {
    if (!this.joined) return;
    this.joined = false;
    this.awareness.setLocalState(null);
  }

  setSelection(selection: Selection): void {
    this.local = { ...this.local, selection };
    this.publish();
  }

  setEditing(editing: CellCoord | null): void {
    this.local = { ...this.local, editing };
    this.publish();
  }

  setAi(ai: AiActivity | null): void {
    this.local = { ...this.local, ai };
    this.publish();
  }

  /** @returns 바뀌었으면 true */
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
    this.watchers.forEach((controller) => controller.abort());
    this.watchers.clear();
    this.releaseOwnLock?.();
    this.releaseOwnLock = null;
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

  /** 합류할 때 이미 쓰이는 이름·색을 피한다. */
  private avoidTaken(user: UserInfo): UserInfo {
    const others = this.otherStates().map(([, state]) => state.user);
    const colors = new Set(others.map((u) => u.color));
    const names = new Set(others.map((u) => u.name));
    let next = user;
    if (colors.has(next.color)) next = { ...next, color: pickColor(colors) };
    if (names.has(next.name)) next = { ...next, name: this.freeName(names) };
    if (next !== user) this.onUserChange?.(next);
    return next;
  }

  /**
   * 동시에 합류해 이름·색이 겹치면(탭 복제 포함) clientID가 큰 쪽이 양보한다.
   * 두 탭이 같은 규칙을 따르므로 한쪽만 바꾸게 된다.
   */
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
        name: this.freeName(new Set(this.otherStates().map(([, s]) => s.user.name))),
      };
    }
    if (next !== user) this.updateUser(next);
  }

  private freeName(taken: Set<string>): string {
    for (let i = 0; i < 20; i++) {
      const candidate = randomName();
      if (!taken.has(candidate)) return candidate;
    }
    return `${randomName()} ${Math.floor(Math.random() * 90) + 10}`;
  }

  private handleChange = ({ added, removed }: AwarenessChanges): void => {
    for (const clientId of added) if (clientId !== this.clientId) this.watch(clientId);
    for (const clientId of removed) this.unwatch(clientId);
    this.resolveConflicts();
    this.recompute();
  };

  private recompute(): void {
    const participants: Participant[] = [];
    this.awareness.getStates().forEach((state, clientId) => {
      if (!isPresenceState(state)) return;
      participants.push({
        ...state,
        ai: state.ai ?? null,
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

  private acquireOwnLock(locks: LockManager): Promise<void> {
    return new Promise((acquired) => {
      void locks.request(
        lockName(this.clientId),
        () =>
          new Promise<void>((release) => {
            this.releaseOwnLock = release;
            acquired();
          }),
      );
    });
  }

  /** 다른 탭의 잠금을 기다린다. 잠금이 넘어오면 그 탭은 닫힌 것이다. */
  private watch(clientId: number): void {
    if (!this.locks || this.watchers.has(clientId)) return;
    const controller = new AbortController();
    this.watchers.set(clientId, controller);
    this.locks
      .request(lockName(clientId), { signal: controller.signal }, () => {
        this.watchers.delete(clientId);
        if (!this.destroyed && this.awareness.getStates().has(clientId)) {
          removeAwarenessStates(this.awareness, [clientId], "lock-released");
        }
      })
      .catch(() => {
        // 참여자가 정상적으로 떠나 기다림을 취소한 경우(AbortError)
      });
  }

  private unwatch(clientId: number): void {
    this.watchers.get(clientId)?.abort();
    this.watchers.delete(clientId);
  }
}
