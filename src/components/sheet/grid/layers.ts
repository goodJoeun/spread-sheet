/**
 * 그리드 안에서 겹쳐 그리는 것들의 순서(z-index). 숫자가 클수록 앞에 보인다.
 * 새 레이어(예: AI 미리보기)를 넣을 때는 여기서 자리를 정한다.
 */
export const Layer = {
  /** 다른 참여자의 선택 범위 */
  remoteRange: 6,
  /** 다른 참여자의 active 셀 */
  remoteCursor: 7,
  /** 내 선택 범위와 active 셀 */
  selection: 10,
  /** 다른 참여자 이름표(내 선택에 가리지 않게 위로) */
  remoteLabel: 12,
  /** 셀 편집칸 */
  editor: 15,
  /** 편집칸 위 안내(같은 셀 동시 입력 등) */
  editorNotice: 16,
  /** 스크롤해도 고정되는 행·열 머리글 */
  header: 20,
  /** 왼쪽 위 모서리 */
  corner: 30,
} as const;
