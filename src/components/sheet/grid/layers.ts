/** 그리드 안 겹침 순서(z-index). 숫자가 클수록 앞에 보임. */
export const Layer = {
  remoteRange: 6,
  /** 다른 참여자가 입력 중인 글자. 그 사람의 커서 테두리와 같은 층이지만 먼저 그려서, 테두리가 글자 위에 보임. */
  remoteDraft: 7,
  remoteCursor: 7,
  aiPreview: 8,
  remoteAi: 9,
  selection: 10,
  /** 내 선택에 가려지지 않게 선택보다 위 */
  remoteLabel: 12,
  aiLabel: 13,
  editor: 15,
  /** 편집칸 위 안내(같은 셀 동시 입력 등) */
  editorNotice: 16,
  header: 20,
  corner: 30,
} as const;
