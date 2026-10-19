// [흐름 10] 참여자 표시를 만들며 정함. 처음 계획한 타이머(heartbeat) 방식은 가려진 탭이 목록에서 깜빡여 Web Locks로 바꿈.
/**
 * 탭이 살아 있는지는 타이머 대신 Web Locks로 판단함.
 * 각 탭은 자기 clientID 이름의 잠금을 쥐고, 다른 탭은 그 잠금을 기다림. 잠금이 넘어오면(=탭이 닫힘) 그 참여자를 지움.
 * y-protocols 기본 방식(30초 동안 소식이 없으면 삭제)을 쓰지 않는 이유: 크롬이 가려진 탭의 타이머를 늦춰서, 열려 있는 탭이 사라졌다가 다시 나타남.
 * Web Locks가 없으면(webLocks()가 null) 기본 방식을 씀.
 */

const LOCK_PREFIX = "spread-sheet:presence:";
/** 탭 번호별 잠금 이름. */
const lockName = (clientId: number) => `${LOCK_PREFIX}${clientId}`;

/** Web Locks를 쓸 수 있으면 돌려줌. 없으면 null(기본 타이머 방식으로 감). */
export function webLocks(): LockManager | null {
  return typeof navigator !== "undefined" && navigator.locks ? navigator.locks : null;
}

export class TabLiveness {
  private readonly watchers = new Map<number, AbortController>();
  private releaseOwnLock: (() => void) | null = null;
  private destroyed = false;

  constructor(
    private readonly locks: LockManager,
    /** 다른 탭이 닫혔을 때 */
    private readonly onGone: (clientId: number) => void,
  ) {}

  /** 내 탭 번호 이름의 잠금을 쥠. 탭이 닫히면 브라우저가 풀어 주고, 기다리던 다른 탭이 알아챔. */
  hold(clientId: number): Promise<void> {
    if (this.releaseOwnLock) return Promise.resolve();
    return new Promise((acquired) => {
      void this.locks.request(
        lockName(clientId),
        () =>
          new Promise<void>((release) => {
            this.releaseOwnLock = release;
            // 잠금을 기다리는 사이 정리됐으면 바로 놓는다.
            if (this.destroyed) this.release();
            acquired();
          }),
      );
    });
  }

  /** 다른 탭의 잠금을 기다림. 잠금이 넘어오면 그 탭이 닫힌 것이므로 onGone을 부름. */
  watch(clientId: number): void {
    if (this.destroyed || this.watchers.has(clientId)) return;
    const controller = new AbortController();
    this.watchers.set(clientId, controller);
    this.locks
      .request(lockName(clientId), { signal: controller.signal }, () => {
        this.watchers.delete(clientId);
        if (!this.destroyed) this.onGone(clientId);
      })
      .catch(() => {
        // 참여자가 정상적으로 떠나 기다림을 취소한 경우(AbortError)
      });
  }

  /** 정상적으로 떠난 탭은 기다림을 취소함. */
  unwatch(clientId: number): void {
    this.watchers.get(clientId)?.abort();
    this.watchers.delete(clientId);
  }

  /** 모든 기다림을 취소하고 내 잠금을 놓음. */
  destroy(): void {
    this.destroyed = true;
    this.watchers.forEach((controller) => controller.abort());
    this.watchers.clear();
    this.release();
  }

  /** 내 잠금을 놓음. 다른 탭이 이 잠금을 받아 내가 떠난 것을 알게 됨. */
  private release(): void {
    this.releaseOwnLock?.();
    this.releaseOwnLock = null;
  }
}
