import { PARTICIPANT_COLORS } from "@/resources/colors";
import { NAME_ADJECTIVES, NAME_ANIMALS } from "@/resources/names";
import type { UserInfo } from "./presence-state";

/**
 * 탭마다 따로 갖는 신원(이름·색).
 * sessionStorage는 탭마다 따로라서, 새 탭은 새 참여자가 되고 같은 탭을 새로고침하면 같은 이름으로 돌아옴.
 */
const STORAGE_KEY = "spread-sheet:user";

export const MAX_NAME_LENGTH = 20;

const pick = <T>(items: readonly T[], random: () => number): T =>
  items[Math.floor(random() * items.length)];

export function randomName(random: () => number = Math.random): string {
  return `${pick(NAME_ADJECTIVES, random)} ${pick(NAME_ANIMALS, random)}`;
}

export function pickColor(taken: Set<string>, random: () => number = Math.random): string {
  const free = PARTICIPANT_COLORS.filter((color) => !taken.has(color));
  return pick(free.length > 0 ? free : PARTICIPANT_COLORS, random);
}

export function randomUser(random: () => number = Math.random): UserInfo {
  return { name: randomName(random), color: pickColor(new Set(), random) };
}

export function normalizeName(name: string): string | null {
  const trimmed = name.trim().replace(/\s+/g, " ").slice(0, MAX_NAME_LENGTH);
  return trimmed.length > 0 ? trimmed : null;
}

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
