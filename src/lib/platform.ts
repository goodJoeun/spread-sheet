/** macOS/iOS면 단축키에 Ctrl 대신 Cmd를 씀. 브라우저에서만 호출함. */
export function isApplePlatform(): boolean {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);
}
