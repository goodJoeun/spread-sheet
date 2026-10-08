/** macOS/iOS면 단축키에 Ctrl 대신 Cmd를 씀. 브라우저에서만 호출함. */
export function isApplePlatform(): boolean {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);
}

/** 입력기가 처리 중인 키의 keyCode. 일부 브라우저는 조합 중인 키를 isComposing 없이 이 값으로만 알려 줌. */
const IME_PROCESS_KEY_CODE = 229;

/**
 * 한글처럼 입력기가 글자를 조합하는 중에 누른 키인지. 이런 키(조합을 확정하는 Enter 등)는 입력기에 맡겨야 함.
 * 여기서 처리하면 마지막 글자가 사라지거나 두 번 들어감.
 */
export function isImeComposing(e: { isComposing: boolean; keyCode: number }): boolean {
  return e.isComposing || e.keyCode === IME_PROCESS_KEY_CODE;
}
