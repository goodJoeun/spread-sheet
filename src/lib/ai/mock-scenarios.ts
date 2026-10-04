/**
 * 가짜 응답 모드에서 지시문에 넣으면 지연·실패를 재현하는 표시.
 * 서버의 가짜 API(server/mock-anthropic.ts)가 동작을 고르는 데 쓰고, AI 패널은 안내에 보여 준다.
 */
export const MOCK_SCENARIO_TAGS = {
  slow: "[느림]",
  rate_limited: "[한도]",
  auth: "[키]",
  overloaded: "[과부하]",
  refusal: "[거절]",
  truncated: "[잘림]",
} as const;

export type MockScenario = keyof typeof MOCK_SCENARIO_TAGS | "normal";
