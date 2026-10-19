import { useSyncExternalStore } from "react";
import type { Store } from "@/lib/store";

// [흐름 23] 처음엔 lib/store.ts에 있었음. SKILL.md에 "lib에는 React 없음" 규칙과 예외 목록을 적고, 그 목록을 지우며 옮겨 옴.
export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
