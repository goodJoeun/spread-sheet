/** macOS/iOS면 단축키 수식키로 Ctrl 대신 Cmd를 쓴다. 브라우저에서만 호출한다. */
export function isApplePlatform(): boolean {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);
}
