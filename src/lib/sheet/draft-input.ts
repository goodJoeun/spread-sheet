/** 셀 편집칸과 수식 입력줄에 붙이는 표시. 둘 사이로 포커스가 옮겨 갈 때는 편집을 확정하지 않는다. */
export const DRAFT_INPUT_PROPS = { "data-draft-input": "" } as const;

export function isDraftInput(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.hasAttribute("data-draft-input");
}
