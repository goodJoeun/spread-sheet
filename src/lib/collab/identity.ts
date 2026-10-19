import { PARTICIPANT_COLORS } from "@/resources/colors";
import { NAME_ADJECTIVES, NAME_ANIMALS } from "@/resources/names";
import type { UserInfo } from "./presence-state";

/**
 * 탭마다 따로 갖는 신원(이름·색).
 * sessionStorage는 탭마다 따로라서, 새 탭은 새 참여자가 되고 같은 탭을 새로고침하면 같은 이름으로 돌아옴.
 */
const STORAGE_KEY = "spread-sheet:user";

export const MAX_NAME_LENGTH = 20;

/** 목록에서 하나를 무작위로 고름. */
const pick = <T>(items: readonly T[], random: () => number): T =>
  items[Math.floor(random() * items.length)];

/** "용감한 수달"처럼 형용사와 동물을 조합한 이름을 만듦. */
export function randomName(random: () => number = Math.random): string {
  return `${pick(NAME_ADJECTIVES, random)} ${pick(NAME_ANIMALS, random)}`;
}

/** 아직 아무도 쓰지 않는 색을 먼저 고름. 모두 쓰였으면 전체에서 고름. */
export function pickColor(taken: Set<string>, random: () => number = Math.random): string {
  const free = PARTICIPANT_COLORS.filter((color) => !taken.has(color));
  return pick(free.length > 0 ? free : PARTICIPANT_COLORS, random);
}

/** 무작위 이름과 색으로 새 사용자를 만듦. */
export function randomUser(random: () => number = Math.random): UserInfo {
  return { name: randomName(random), color: pickColor(new Set(), random) };
}

/** 앞뒤 공백을 지우고 연속 공백을 하나로 줄여 20자로 자름. 비면 null. */
export function normalizeName(name: string): string | null {
  const trimmed = name.trim().replace(/\s+/g, " ").slice(0, MAX_NAME_LENGTH);
  return trimmed.length > 0 ? trimmed : null;
}

/** 이 탭의 이름·색을 sessionStorage에서 읽음. 없거나 형식이 틀리면 새로 만들어 저장함. */
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

/** 이 탭의 이름·색을 sessionStorage에 저장함. 새로고침해도 같은 사용자로 돌아오게. */
export function saveTabUser(user: UserInfo): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } catch {
    // 저장하지 못해도 이번 세션 동안은 그대로 쓴다.
  }
}
