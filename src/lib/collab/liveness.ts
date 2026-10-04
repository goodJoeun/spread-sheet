/**
 * 탭이 살아 있는지는 타이머 대신 Web Locks로 판단한다. 각 탭이 자기 clientID 이름의 잠금을 쥐고,
 * 다른 탭은 그 잠금을 기다리다 넘어오면(탭이 닫힘) 그 참여자를 지운다.
 * y-protocols 기본 방식(30초 무소식이면 삭제)은 크롬이 가려진 탭의 타이머를 늦춰서 열린 탭이 사라졌다 나타난다.
 * Web Locks가 없으면 기본 방식을 쓴다(webLocks()가 null).
 */

const LOCK_PREFIX = "spread-sheet:presence:";
const lockName = (clientId: number) => `${LOCK_PREFIX}${clientId}`;

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

  /** 내 잠금을 쥔다. 탭이 닫히면 브라우저가 풀어 주고, 기다리던 다른 탭이 알아챈다. */
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

  /** 다른 탭의 잠금을 기다린다. 잠금이 넘어오면 그 탭은 닫힌 것이다. */
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

  unwatch(clientId: number): void {
    this.watchers.get(clientId)?.abort();
    this.watchers.delete(clientId);
  }

  destroy(): void {
    this.destroyed = true;
    this.watchers.forEach((controller) => controller.abort());
    this.watchers.clear();
    this.release();
  }

  private release(): void {
    this.releaseOwnLock?.();
    this.releaseOwnLock = null;
  }
}
