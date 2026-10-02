import { PARTICIPANT_COLORS, normalizeName, randomUser, type UserInfo } from "./presence";

/**
 * 탭별 신원(이름·색). sessionStorage는 탭마다 따로라서 새 탭은 새 참여자가 되고,
 * 같은 탭을 새로고침하면 같은 이름으로 돌아온다.
 */
const STORAGE_KEY = "spread-sheet:user";

export function loadTabUser(): UserInfo {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === "object" && parsed !== null) {
        const { name, color } = parsed as Partial<UserInfo>;
        const normalized = typeof name === "string" ? normalizeName(name) : null;
        if (normalized && typeof color === "string" && PARTICIPANT_COLORS.includes(color)) {
          return { name: normalized, color };
        }
      }
    }
  } catch {
    // 저장소를 쓸 수 없으면(차단된 환경 등) 매번 새 신원으로 시작한다.
  }
  const user = randomUser();
  saveTabUser(user);
  return user;
}

export function saveTabUser(user: UserInfo): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } catch {
    // 저장하지 못해도 이번 세션 동안은 그대로 쓴다.
  }
}
