// [흐름 6 · 189d4b4] 그리드를 만들며 추가. 필요한 건 읽기·바꾸기·알리기뿐이라 상태 관리 라이브러리 대신 직접 만듦.
/** 이벤트 핸들러에서 항상 최신 값을 바로 읽어야 하는 상태(선택, 편집)에 씀. state와 ref를 따로 맞추는 방식보다 값이 어긋날 틈이 없음. */
export interface Store<T> {
  get(): T;
  set(next: T | ((prev: T) => T)): void;
  subscribe(listener: () => void): () => void;
}

/** 값 하나를 담는 저장소를 만듦. 값이 실제로 바뀔 때만 구독자에게 알림. */
export function createStore<T>(initial: T): Store<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next) {
      const resolved = typeof next === "function" ? (next as (prev: T) => T)(value) : next;
      if (Object.is(resolved, value)) return;
      value = resolved;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
