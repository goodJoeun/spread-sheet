/**
 * 다른 참여자의 표시는 테두리를 그 사람 색으로 그리고, 바탕은 같은 색을 옅게 깔아 셀 값을 가리지 않음.
 * 값은 #rrggbb 뒤에 붙이는 16진수 알파.
 */
const TINT_ALPHA = {
  /** AI 편집 범위(약 5%). 범위가 넓을 수 있어 가장 옅게 */
  aiRange: "0d",
  /** 선택 범위(약 8%) */
  selection: "14",
  /** 입력 중인 셀(약 12%) */
  editingCell: "1f",
} as const;

export function participantTint(color: string, use: keyof typeof TINT_ALPHA): string {
  return `${color}${TINT_ALPHA[use]}`;
}
