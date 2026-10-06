/**
 * 화면에 보이는 문구와 사용자에게 전달되는 메시지. 문구는 이 파일에서만 고친다.
 * 값이 들어가는 문구는 함수로 둔다. 서버(오류·경고 메시지)와 브라우저가 같이 쓴다.
 */

const wholeSheet = "시트 전체";
/** 다른 참여자의 AI 편집 단계 */
const aiActivity = (reviewing: boolean) => (reviewing ? "AI 결과 검토" : "AI 편집");

export const strings = {
  app: {
    title: "Spread Sheet",
    description: "여러 사람이 함께, AI와 함께 편집하는 스프레드시트",
    loading: "시트를 불러오는 중…",
    storageUnavailable:
      "이 브라우저에서 저장소를 열 수 없어 편집 내용이 저장되지 않아요. 열려 있는 다른 탭과의 동기화는 계속 동작해요.",
  },

  toolbar: {
    label: "서식 도구",
    undo: "실행 취소",
    redo: "다시 실행",
    bold: "굵게",
    italic: "기울임꼴",
    underline: "밑줄",
    strike: "취소선",
    textColor: "텍스트 색상",
    textColorReset: "기본 색상",
    fillColor: "채우기 색상",
    fillColorReset: "채우기 없음",
    alignLeft: "왼쪽 정렬",
    alignCenter: "가운데 정렬",
    alignRight: "오른쪽 정렬",
    clearFormat: "서식 지우기",
    ai: "AI 편집",
    aiLock: "AI 편집 시 셀 잠금",
    aiLockTitle:
      "켜면 다음 AI 요청부터, 요청한 범위를 결과를 적용하거나 버릴 때까지 다른 참여자가 바꿀 수 없어요",
    withShortcut: (label: string, shortcut: string) => `${label} (${shortcut})`,
  },

  formulaBar: {
    range: "선택 범위",
    value: "셀 내용",
  },

  participants: {
    list: "참여자 목록",
    count: (n: number) => `참여자 ${n}명`,
    heading: (n: number) => `지금 이 시트에 ${n}명이 있어요`,
    jumpTo: "이 참여자의 위치로 이동",
    me: "(나)",
    withMe: (name: string) => `${name} (나)`,
    rename: "내 이름 바꾸기",
    nameInput: "내 이름",
    saveName: "이름 저장",
    status: {
      ai: (where: string | null, reviewing: boolean, locked: boolean) =>
        `${where ?? wholeSheet} ${aiActivity(reviewing)} 중${locked ? " · 잠금" : ""}`,
      editing: (cell: string) => `${cell} 입력 중`,
      viewing: (range: string) => `${range} 보는 중`,
      joining: "들어오는 중",
    },
  },

  grid: {
    cellEditor: "셀 편집",
    remoteEditing: "· 입력 중",
    remoteAi: (reviewing: boolean, locked: boolean) =>
      `${aiActivity(reviewing)} 중${locked ? " · 잠금" : ""}`,
    lockedByAi: (name: string) =>
      `${name}님이 AI 편집을 위해 잠근 셀이에요 · 끝나면 편집할 수 있어요`,
    coEditing: (names: string) => `${names}님도 이 셀을 입력 중이에요`,
    inRemoteAiRange: (name: string, reviewing: boolean) =>
      `${name}님이 ${aiActivity(reviewing)} 중 · 입력한 값은 기본으로 유지돼요`,
    aiGenerating: (count: number) => `AI가 제안을 만드는 중… ${count > 0 ? `${count}개` : ""}`,
    aiReviewing: (count: number) => `AI 제안 ${count}개 · 검토 중`,
    aiChanged: (count: number) => `· 바뀐 셀 ${count}개`,
  },

  ai: {
    panel: {
      title: "AI 편집",
      close: "AI 패널 닫기",
      connectedBadge: "Claude API",
      connectedTitle: "서버가 Claude API에 연결되어 있어요",
      mockBadge: "가짜 응답 · API 키 없음",
      mockTitle: "API 키가 없어 가짜 응답으로 동작해요",
      intro:
        "시트 내용을 바탕으로 AI가 값을 제안해요. 범위를 선택하고 요청하면 그 범위만 바꾸고, 결과는 원래 값과 비교한 뒤 적용할 수 있어요.",
      examples: [
        "선택한 범위의 숫자를 두 배로 바꿔 줘",
        "빈칸을 예시 값으로 채워 줘",
        "영문을 대문자로 바꿔 줘",
      ],
      mockHint: (tags: string) =>
        `지금은 가짜 응답이에요. 요청에 ${tags}를 넣으면 지연·오류 상황을 재현할 수 있어요.`,
      requestScope: (range: string | null) => (range ? `범위 ${range}` : wholeSheet),
    },

    composer: {
      scope: "편집 범위",
      scopeSelection: "선택 범위",
      scopeSheet: wholeSheet,
      input: "AI에게 요청",
      placeholder: "예: 이 범위의 숫자를 두 배로 바꿔 줘",
      placeholderReviewing: "제안을 적용하거나 버리면 새 요청을 보낼 수 있어요",
      send: "보내기 (Enter)",
      stop: "생성 중단 (Esc)",
      hint: "Enter로 보내기 · Shift+Enter 줄바꿈 · AI 결과는 적용하기 전까지 시트에 쓰이지 않아요",
      model: "AI 모델",
      modelTitle: "다음 요청에 쓸 모델",
      overlap: (names: string, reviewing: boolean) =>
        `${names}님이 이 범위를 AI로 ${reviewing ? "검토" : "편집"} 중이에요. 요청할 수는 있지만, 먼저 적용된 셀은 내 결과에서 충돌로 표시되고 기본으로 건너뛰어요.`,
      lockedByOther: (names: string, reviewing: boolean) =>
        `${names}님이 이 범위를 잠그고 AI로 ${reviewing ? "검토" : "편집"} 중이에요. 끝날 때까지 이 범위에는 요청할 수 없어요.`,
      cannotLock: (names: string, reviewing: boolean) =>
        `${names}님이 이 범위를 AI로 ${reviewing ? "검토" : "편집"} 중이라 잠글 수 없어요. 셀 잠금을 끄거나 끝난 뒤에 요청해 주세요.`,
    },

    run: {
      mockBadge: "가짜 응답",
      scope: (range: string | null) => range ?? wholeSheet,
      skipped: (n: number) => `범위 밖이거나 주소가 잘못된 제안 ${n}개는 제외했어요.`,
      proposals: "제안 목록",
      apply: (n: number) => `적용하기 (${n})`,
      nothingToApply: "적용할 셀이 없어요",
      discard: "버리기",
      showOriginal: "원래 값 보기",
      retry: "다시 시도",
      status: {
        requesting: "AI에 요청하는 중…",
        thinking: "생각하는 중…",
        slow: "응답이 늦어지고 있어요. 계속 기다리거나 중단할 수 있어요.",
        stalled: "응답이 잠시 멈췄어요. 계속 기다리는 중…",
        writing: "답을 쓰는 중…",
        proposing: (n: number) => `제안을 만드는 중… ${n}개`,
        review: (n: number) => `제안 ${n}개 · 시트에서 원래 값과 비교한 뒤 적용하세요`,
        nothingApplied: (skipped: string) => `바꿀 셀이 없어 적용하지 않았어요${skipped}`,
        applied: (undoKey: string, skipped: string) =>
          `적용했어요 · ${undoKey}로 한 번에 되돌릴 수 있어요${skipped}`,
        appliedSkipped: (n: number) => ` · 그사이 바뀐 ${n}개 셀은 건너뛰었어요`,
        discarded: "제안을 버렸어요",
        cancelled: "중단했어요. 받은 제안은 적용하지 않았어요.",
        error: "오류가 발생했어요.",
      },
      conflict: {
        summary: (n: number) => `요청한 뒤 다른 값으로 바뀐 셀이 ${n}개 있어요.`,
        keeping: "지금 값을 지키고 건너뛰어요.",
        overwriting: "모두 덮어쓰기로 골랐어요.",
        overwriteAll: "모두 덮어쓰기",
        skipAll: "모두 건너뛰기",
        regenerate: "지금 값으로 다시 요청",
        overwrite: "덮어쓰기",
        changedSince: "요청 때",
        now: "지금",
      },
      jumpTo: (cell: string) => `${cell}로 이동`,
      empty: "빈칸",
      cleared: "지움",
      same: "이미 같은 값이에요",
    },

    /** 모델 고르기 목록의 설명(모델 id별) */
    models: {
      descriptions: {
        "claude-opus-5-5": "가장 정확",
        "claude-sonnet-5-5": "속도·정확도 균형",
        "claude-haiku-4-5": "가장 빠르고 저렴",
      },
      serverDefault: "서버 기본 모델",
    },

    /** 오류 안내. 서버는 코드(code, reason)만 보내고 브라우저가 여기서 문구를 고른다. */
    errors: {
      bad_request: "요청 형식이 올바르지 않아요.",
      auth: "AI 서비스 인증에 실패했어요. 서버의 API 키 설정을 확인해 주세요.",
      quota: "AI 사용 한도에 도달했어요. 한도를 늘리거나 다음 달에 다시 시도해 주세요.",
      rate_limited: "요청이 너무 많아요. 잠시 뒤 다시 시도해 주세요.",
      overloaded: "AI 서비스가 혼잡해요. 잠시 뒤 다시 시도해 주세요.",
      refused: "AI가 이 요청에 답하지 않았어요. 표현을 바꿔 다시 요청해 보세요.",
      timeout: "AI 응답이 너무 오래 걸려 중단했어요.",
      network: "AI 서버에 연결하지 못했어요. 네트워크를 확인해 주세요.",
      unknown: "알 수 없는 오류가 발생했어요.",
      model_not_offered: "고른 모델을 쓸 수 없어요. 다른 모델을 골라 주세요.",
      model_unavailable: "이 모델을 쓸 수 없어요. 다른 모델을 골라 주세요.",
      stream_dropped: "응답이 중간에 끊겼어요. 다시 시도해 주세요.",
      connection_lost: "응답을 받는 중에 연결이 끊겼어요.",
    },

    warnings: {
      truncated: "응답이 최대 길이에서 끊겼어요. 받은 제안까지만 검토할 수 있어요.",
      invalidEdits: (n: number) => `형식이 맞지 않는 제안 ${n}개는 뺐어요.`,
      unparsable: "AI 응답 일부를 해석하지 못해 받은 제안까지만 보여 드려요.",
    },
  },
};
