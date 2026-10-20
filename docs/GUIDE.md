# 코드 읽기 가이드

처음 이 코드를 여는 사람을 위한 안내서다. 화면을 이루는 구성요소에서 출발해 파일을 따라가며, 무엇이 어디서 어떻게 동작하는지와 기술을 왜 그렇게 골랐는지를 설명한다.

함께 보면 좋은 문서:

- [README](../README.md): 실행 방법, 공동 편집 × AI 규칙과 그 이유
- [PLAN.md](../PLAN.md): 처음 세운 계획(저장소에는 올리지 않는 로컬 문서). 이 가이드에서 "PLAN"이라고 적은 근거가 이 문서이고, 계획과 달라진 점은 [7장](#7-계획과-달라진-점)에 정리했다.
- [project-structure 규칙](../.claude/skills/project-structure/SKILL.md): 파일을 나누는 기준과 import 방향

## 목차

1. [한눈에 보기](#1-한눈에-보기)
2. [폴더와 레이어](#2-폴더와-레이어)
3. [시트가 열리기까지](#3-시트가-열리기까지)
4. [구성요소별로 따라가기](#4-구성요소별로-따라가기)
5. [동작 하나씩 따라가기](#5-동작-하나씩-따라가기)
6. [기술 선택과 이유](#6-기술-선택과-이유)
7. [계획과 달라진 점](#7-계획과-달라진-점)
8. [한계와 보완할 수 있는 지점](#8-한계와-보완할-수-있는-지점)
9. [테스트 지도](#9-테스트-지도)
10. [용어](#10-용어)

---

## 1. 한눈에 보기

### 무엇을 하는 앱인가

- 같은 브라우저에서 탭을 여러 개 열면 탭마다 다른 참여자가 되어 한 시트를 동시에 편집한다. 서버를 거치지 않고 탭끼리 직접 변경을 주고받는다.
- 내용은 브라우저의 IndexedDB에 저장되어, 모든 탭을 닫았다 다시 열어도 남는다.
- AI 패널에서 요청하면 Claude가 셀 값을 제안한다. 사용자는 제안을 검토한 뒤에 적용한다. 서버가 하는 일은 API 키를 숨기고 Claude 응답을 중계하는 것뿐이다.

### 화면 구성요소

[SheetApp.tsx](../src/components/sheet/SheetApp.tsx)가 화면 전체를 조립한다.

```tsx
<SheetProvider session={loaded.session}>            // 탭 하나의 세션과 컨트롤러를 아래로 공급
  <Shell participants={<ParticipantList />}>         // 머리말 + 참여자 목록
    {loaded.storage === "unavailable" && <StorageNotice />}  // 저장소를 못 열었을 때의 띠
    <Toolbar />                                      // 실행 취소, 서식, AI 패널 열기
    <FormulaBar />                                   // 선택 범위 주소와 셀 값(보기 전용)
    <Workspace />                                    // Grid + (열려 있으면) AiPanel
  </Shell>
</SheetProvider>
```

| 구성요소        | 파일                                                               | 읽는 데이터                                   | 부르는 명령                                     |
| --------------- | ------------------------------------------------------------------ | --------------------------------------------- | ----------------------------------------------- |
| ParticipantList | [ParticipantList.tsx](../src/components/sheet/ParticipantList.tsx) | 참여자 목록                                   | 이름 바꾸기, 참여자 위치로 이동                 |
| Toolbar         | [Toolbar.tsx](../src/components/sheet/Toolbar.tsx)                 | 셀 서식, 선택, 실행 취소 가능 여부            | 서식 켜기/끄기, 색·정렬, 실행 취소/다시 실행    |
| FormulaBar      | [FormulaBar.tsx](../src/components/sheet/FormulaBar.tsx)           | 셀 값, 선택                                   | 없음                                            |
| Grid            | [grid/Grid.tsx](../src/components/sheet/grid/Grid.tsx)             | 셀 값·서식, 선택, 편집 상태, 참여자, AI 제안  | 키보드·마우스로 하는 모든 시트 명령             |
| AiPanel         | [ai/AiPanel.tsx](../src/components/sheet/ai/AiPanel.tsx)           | AI 대화, 서버 연결 정보                       | 요청, 중단, 적용, 버리기, 다시 요청             |

### 부품 지도

```
탭 하나(브라우저)
 ├─ components ........... 화면. 데이터를 읽어 그리고, 사용자 입력을 명령으로 넘긴다
 ├─ hooks ................ 바깥 상태가 바뀌면 React가 다시 그리게 구독한다
 ├─ SheetController ...... 선택·편집 상태와 시트 명령
 ├─ AiController ......... AI 대화·실행 상태와 AI 명령
 └─ SheetSession
     ├─ Y.Doc ............ 셀 값·서식 (모든 탭이 공유, 저장됨)
     ├─ Awareness ........ 이름·색·선택·AI 활동 (모든 탭이 공유, 저장 안 됨)
     ├─ UndoManager ...... 이 탭에서 한 편집만 되돌린다
     ├─ IndexedDB ........ Y.Doc을 브라우저에 저장한다
     └─ BroadcastChannel . 다른 탭과 Y.Doc·Awareness 변경을 주고받는다

AI 요청: AiController ── POST /api/ai/edit ──▶ Route Handler ──▶ Claude API (키가 없으면 가짜 API)
                     ◀── NDJSON 스트림(한 줄에 이벤트 하나) ──┘
```

### 추천 읽기 순서

처음이라면 아래 순서로 열어 보면 된다. 앞의 파일일수록 다른 파일에 덜 기대고 있다.

1. [address.ts](../src/lib/sheet/address.ts), [schema.ts](../src/lib/sheet/schema.ts): A1 주소, 시트 크기, 서식 규칙
2. [document.ts](../src/lib/sheet/document.ts): 셀 값과 서식을 Y.Doc에 저장하는 방식
3. [session.ts](../src/lib/collab/session.ts): 탭 하나를 이루는 부품
4. [SheetApp.tsx](../src/components/sheet/SheetApp.tsx) → [SheetContext.tsx](../src/components/sheet/SheetContext.tsx): 화면과 부품을 잇는 곳
5. [sheet-controller.ts](../src/lib/controller/sheet-controller.ts): 시트 명령
6. [Grid.tsx](../src/components/sheet/grid/Grid.tsx) → [useCellEditor.ts](../src/hooks/grid/useCellEditor.ts) → [keymap.ts](../src/lib/sheet/keymap.ts) → [navigation.ts](../src/lib/sheet/navigation.ts): 입력과 이동
7. [ai-controller.ts](../src/lib/ai/ai-controller.ts) → [run.ts](../src/lib/ai/run.ts) → [coedit.ts](../src/lib/ai/coedit.ts): AI의 브라우저 쪽
8. [route.ts](../src/app/api/ai/edit/route.ts) → [claude.ts](../src/lib/ai/server/claude.ts): AI의 서버 쪽

---

## 2. 폴더와 레이어

| 위치                | 책임                                                              | import해도 되는 것             |
| ------------------- | ----------------------------------------------------------------- | ------------------------------ |
| `src/app/`          | 라우팅. 페이지 하나와 AI Route Handler 하나                        | 모두                           |
| `src/components/`   | 화면. `ui/`는 시트를 모르는 공통 부품(Popover, Notice)             | hooks, lib, resources, styles  |
| `src/hooks/`        | React와 lib를 잇는 hook. 파일 하나에 hook 하나                     | lib, resources                 |
| `src/lib/`          | React 없는 로직. 컨트롤러, 순수 함수, Yjs 모델, AI 프로토콜        | lib 안, resources              |
| `src/lib/ai/server/` | 서버 전용(API 키). 파일 맨 위에 `import "server-only"`            | lib                            |
| `src/resources/`    | 화면 문구, 색 목록, 무작위 이름 단어                               | 없음                           |
| `src/styles/`       | 디자인 토큰과 공통 클래스                                          | 없음                           |

import는 `app → components → hooks → lib` 한 방향으로만 간다. `lib/`에는 React가 없다. 그래서 핵심 로직 전부를 브라우저 없이 Node에서 테스트할 수 있다.

`lib/`는 다시 이렇게 나뉜다. 위에 있는 폴더는 아래에 있는 폴더를 모른다.

| 폴더              | 내용                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------ |
| `lib/sheet`       | 시트 자체. A1 주소, 크기, 서식 규칙, Y.Doc 읽기·쓰기, 선택·이동·키 규칙, 그리드 치수       |
| `lib/collab`      | 탭 사이. 세션, BroadcastChannel provider, 참여자(presence), 신원, 탭 생존 확인, 실행 취소 |
| `lib/controller`  | `SheetController`: 선택·편집 상태와 시트 명령                                             |
| `lib/ai`          | AI의 브라우저 쪽. 프로토콜, 요청 만들기, 실행 상태, 충돌 판단, `AiController`, 문구        |
| `lib/ai/server`   | AI의 서버 쪽. Claude 호출, 프롬프트, 스트림 파서, 요청 검증, 가짜 API                     |
| `lib/store.ts`    | 구독할 수 있는 작은 값 저장소(3.5)                                                         |

`lib/sheet`는 `lib/collab`·`lib/ai`·`lib/controller`를 import하지 않고, `lib/collab`은 `lib/ai`를 import하지 않는다.

---

## 3. 시트가 열리기까지

### 3.1 page → SheetApp

- [page.tsx](../src/app/page.tsx)는 서버 컴포넌트이고 `<SheetApp sheetId="default" />` 하나만 그린다. `sheetId`는 시트의 이름이다. IndexedDB 데이터베이스 이름과 BroadcastChannel 이름이 모두 `spread-sheet:default`가 되므로, `sheetId`가 다르면 서로 섞이지 않는다.
- [SheetApp.tsx](../src/components/sheet/SheetApp.tsx) 첫 줄의 `"use client"`부터 그 아래는 모두 브라우저에서만 돈다. IndexedDB, BroadcastChannel, Web Locks, sessionStorage가 모두 브라우저 API이기 때문이다. 서버는 HTML 껍데기를 보내고 AI 요청을 중계하는 일만 한다.

### 3.2 useSheetSession: 세션 만들기

[useSheetSession.ts](../src/hooks/sheet/useSheetSession.ts)가 하는 일:

1. `loadTabUser()`: sessionStorage에서 이 탭의 이름·색을 읽는다. 없으면 무작위로 만들어 저장한다([identity.ts](../src/lib/collab/identity.ts)).
2. `createSheetSession(sheetId, { user, onUserChange: saveTabUser })`로 세션을 만든다.
3. 저장된 내용을 다 불러온 뒤에야(`whenLoaded`) 세션을 돌려준다. 그 전까지 `SheetApp`은 "시트를 불러오는 중…"만 보여 준다. 빈 시트가 잠깐 보였다가 내용이 채워지는 깜빡임을 막기 위해서다.
4. `pagehide`(탭 닫기, 새로고침) 때 `session.leave()`로 내 참여자 정보를 바로 지운다. `pageshow`가 bfcache 복원이면 `session.rejoin()`으로 다시 합류한다.
5. 컴포넌트가 사라지면 `session.destroy()`를 부른다.

[createSheetSession](../src/lib/collab/session.ts)은 부품 여섯 개를 만든다.

| 부품                       | 하는 일                                                        |
| -------------------------- | -------------------------------------------------------------- |
| `Y.Doc`                    | 셀 값과 서식. 모든 탭이 같은 내용으로 맞춰진다(6.2)             |
| `Awareness`                | 커서·선택처럼 저장하지 않는 상태. 탭마다 자기 상태를 하나씩 가진다 |
| `IndexeddbPersistence`     | 문서 변경을 IndexedDB에 저장하고, 열 때 저장된 내용을 불러온다  |
| `BroadcastChannelProvider` | 다른 탭과 문서·awareness 변경을 주고받는다(6.3)                 |
| `Presence`                 | awareness 위에서 내 정보를 알리고, 다른 탭들을 참여자 목록으로 모은다 |
| `Y.UndoManager`            | 이 탭에서 한 편집만 되돌린다(5.3)                               |

**저장소 상태를 정하는 방법.** y-indexeddb는 성공(`whenSynced`)만 알리고 실패는 알리지 않는다. 성공만 기다리면 저장소가 막힌 브라우저(사생활 보호 모드, 용량 초과)에서는 로딩 화면이 끝나지 않는다. 그래서 아래 셋 중 먼저 일어나는 것으로 상태를 정한다.

- 저장된 내용을 다 불러옴 → `"ready"`
- 데이터베이스 열기 실패 → `"unavailable"`
- 5초(`STORAGE_TIMEOUT_MS`)가 지남 → `"unavailable"`

`"unavailable"`이면 `StorageNotice` 띠가 뜬다. 이때도 탭 간 동기화는 그대로 된다. 저장소가 늦게라도 열리면 `whenPersisted`가 끝나면서 띠가 사라진다.

React 개발 모드(Strict Mode)는 effect를 실행 → 정리 → 다시 실행한다. 그래서 세션도 만들어졌다 정리되고 다시 만들어질 수 있다. 이 때문에 `destroy()`는 여러 번 불려도 안전하게 만들어져 있다.

### 3.3 SheetProvider: 컨트롤러 만들기

[SheetContext.tsx](../src/components/sheet/SheetContext.tsx)가 세션을 받아 세 가지를 만들고 Context로 내려보낸다.

- `new SheetController(session)`: 선택·편집 상태와 모든 시트 명령을 가진다.
- `new AiController(session.doc, controller, fetchAiTransport, session.presence)`
  - 시트 컨트롤러를 통째로 알지 않고 `commitEdit`, `select`, `reveal`, `focus` 네 가지(`AiSheetBinding`)만 쓴다.
  - 서버와 통신하는 함수(`transport`)를 주입받는다. 테스트에서는 이 함수를 응답을 직접 흘려보내는 가짜로 바꾼다.
- `aiPanel`: AI 패널이 열렸는지(`Store<boolean>`).

컨트롤러는 생성자에서 아무것도 구독하지 않고, effect에서 `connect()`를 불러 구독한다. Strict Mode에서는 객체가 두 번 만들어질 수 있는데, 생성자에서 구독하면 버려진 객체의 구독이 남는다. 생성은 부수 효과 없이 하고, 구독은 effect에서 하고 정리 함수로 끊는다.

하위 컴포넌트는 `useSheet()`, `useSelection()`, `useEditState()`로 필요한 것을 꺼낸다.

### 3.4 상태가 사는 곳

| 상태                               | 위치                                     | 누가 보나  | 저장                        |
| ---------------------------------- | ---------------------------------------- | ---------- | --------------------------- |
| 셀 값·서식                         | `Y.Doc`의 `values`·`formats`             | 모든 탭    | IndexedDB                   |
| 이름·색·선택·편집 중인 셀·AI 활동  | `Awareness`(→ `Presence`)                | 모든 탭    | 안 함                       |
| 실행 취소 기록                     | `Y.UndoManager`                          | 이 탭      | 안 함                       |
| 선택, 편집 상태                    | `SheetController.selection`·`.edit`      | 이 탭      | 안 함                       |
| 편집칸에 입력 중인 글자            | `<input>`의 DOM 값(React가 관리하지 않음) | 이 탭      | 안 함                       |
| AI 대화·실행·덮어쓰기 선택         | `AiController`의 store들                 | 이 탭      | 안 함(새로고침하면 사라짐) |
| AI 패널 열림                       | Context의 `aiPanel`                      | 이 탭      | 안 함                       |
| 탭의 이름·색                       | sessionStorage                           | 이 탭      | 탭이 열려 있는 동안         |
| 마지막으로 고른 AI 모델            | localStorage                             | 이 브라우저 | 계속                        |

### 3.5 화면이 다시 그려지는 방법

React 밖에 있는 상태는 모두 `useSyncExternalStore`로 구독한다.

| hook                                                           | 구독하는 것            | 다시 그리는 때                                                 |
| -------------------------------------------------------------- | ---------------------- | -------------------------------------------------------------- |
| [useStore](../src/hooks/useStore.ts)                           | `lib/store.ts`의 Store | `set`으로 값이 바뀔 때                                         |
| [useDocVersion](../src/hooks/sheet/useDocVersion.ts)           | Y.Doc의 `update`       | 문서가 바뀔 때마다. 버전 번호만 받고, 값은 렌더 중에 문서에서 직접 읽는다 |
| [useParticipants](../src/hooks/sheet/useParticipants.ts)       | `Presence`             | 참여자 목록이 바뀔 때                                          |
| [useUndoState](../src/hooks/sheet/useUndoState.ts)             | UndoManager 스택 이벤트 | 실행 취소·다시 실행 가능 여부가 바뀔 때                         |

이렇게 한 이유:

- **선택·편집 상태를 React state가 아니라 Store에 둔 이유**: 키 입력이나 포인터 같은 이벤트 핸들러는 항상 최신 선택을 바로 읽어야 한다. React state는 다음 렌더 전까지 옛 값이 보일 수 있고, state와 ref를 함께 맞추는 방식은 둘이 어긋날 틈이 있다([store.ts](../src/lib/store.ts)). Store는 React 밖의 컨트롤러가 가지고, 화면은 구독만 한다.
- **문서를 React state로 복사하지 않는 이유**: 문서의 원본은 Y.Doc 하나뿐이다. 화면은 "바뀌었다"는 신호(버전 번호)만 받고, 값은 그릴 때 문서에서 읽는다. 원본과 복사본이 어긋날 일이 없다.

---

## 4. 구성요소별로 따라가기

### 4.1 Shell과 ParticipantList

관련 파일: [ParticipantList.tsx](../src/components/sheet/ParticipantList.tsx), [Popover.tsx](../src/components/ui/Popover.tsx), [useDismiss.ts](../src/hooks/ui/useDismiss.ts), [presence.ts](../src/lib/collab/presence.ts), [presence-state.ts](../src/lib/collab/presence-state.ts), [identity.ts](../src/lib/collab/identity.ts), [liveness.ts](../src/lib/collab/liveness.ts), [collab/messages.ts](../src/lib/collab/messages.ts)

화면에서 보이는 것:

- 머리말 오른쪽에 아바타가 최대 4개 보이고 나머지는 `+n`으로 표시된다. 누르면 목록이 열린다.
- 목록에서 나는 맨 위에, 나머지는 이름순으로 나온다. 줄마다 상태 문구가 하나 붙는데, `participantStatus()`가 AI 편집 > 입력 중 > 보는 중 > 들어오는 중 순서로 하나만 고른다.
- 다른 참여자의 줄을 누르면 그 사람이 입력 중인 셀(없으면 선택한 셀)로 이동한다(`controller.jumpTo`).
- 내 줄에서는 이름을 바꿀 수 있다. `presence.rename()`이 공백을 정리하고 20자로 자른 뒤, 다른 탭에 알리고 sessionStorage에도 저장한다.
- Popover는 바깥을 누르거나 Esc를 누르면 닫힌다. Esc는 캡처 단계에서 먼저 받아, 그리드가 같은 Esc로 편집을 취소하지 않게 한다.

화면 뒤에서 일어나는 것(`Presence`):

- **신원**: 이름과 색은 탭마다 sessionStorage에 있다. 새 탭은 새 참여자가 되고, 같은 탭을 새로고침하면 같은 이름으로 돌아온다.
- **합류**: `join()`은 탭 생존 확인용 잠금을 먼저 쥐고, 그다음에 내 상태를 공개한다. 이미 있는 참여자와 색이나 이름이 겹치면 바꿔서 들어간다(`avoidTaken`).
- **동시 합류로 겹칠 때**: 거의 동시에 들어온 경우나, sessionStorage까지 복사되는 탭 복제로 겹친 경우가 있다. 이때는 clientID가 큰 쪽이 양보한다(`resolveConflicts`). 양쪽이 같은 규칙을 따르므로 한쪽만 바뀐다.
- **떠남 감지**([liveness.ts](../src/lib/collab/liveness.ts)): 각 탭은 `spread-sheet:presence:<clientID>`라는 Web Lock을 쥐고 놓지 않는다. 다른 탭들은 그 잠금을 요청해 두고 기다린다. 탭이 닫히면 브라우저가 잠금을 풀고, 기다리던 탭에 잠금이 넘어오는 순간 "그 탭이 닫혔다"고 판단해 참여자를 지운다. 정상적으로 닫히는 경우는 `pagehide`에서 먼저 지운다.
- **검증**: 다른 탭(이전 버전 코드일 수도 있다)에서 온 값이므로, `isPresenceState()`로 형식을 확인한 것만 목록에 넣는다.

### 4.2 StorageNotice

저장소를 열 수 없을 때(3.2) 화면 위쪽에 경고 띠를 보여 준다. [Notice.tsx](../src/components/ui/Notice.tsx)의 `bar` 모양이다.

### 4.3 Toolbar

관련 파일: [Toolbar.tsx](../src/components/sheet/Toolbar.tsx), [document.ts](../src/lib/sheet/document.ts), [colors.ts](../src/resources/colors.ts)

- **버튼 상태는 매번 문서에서 계산한다.** `useDocVersion`과 `useSelection`으로 문서나 선택이 바뀔 때마다 다시 그린다.
  - 굵게 같은 서식 버튼은 `hasFormatEverywhere()`(범위 전체에 그 서식이 켜져 있는가)일 때 눌린 상태다.
  - 색 견본과 정렬 버튼은 `commonStyle()`(범위 전체가 같은 값이면 그 값, 아니면 null)로 정한다.
- **누르면** `controller.toggleFormat`, `setStyle`, `clearFormats`, `undo`, `redo` 중 하나를 부르고 그리드로 포커스를 돌린다.
- **켜기/끄기 규칙**은 구글 시트와 같다. 범위 전체에 켜져 있으면 끄고, 하나라도 꺼져 있으면 모두 켠다.
- **포커스를 빼앗지 않는다.** 툴바의 `onMouseDown`에서 `preventDefault()`를 하므로, 버튼을 눌러도 그리드 편집칸이 포커스를 잃지 않는다. 그래서 셀을 입력하는 도중에 굵게를 눌러도 입력이 끊기지 않는다.
- 실행 취소/다시 실행 버튼은 `useUndoState`로 켜고 끈다.

**데이터 모델**([document.ts](../src/lib/sheet/document.ts)):

```
values  : Y.Map   "B2" → "100"
formats : Y.Map   "B2.bold" → true    "B2.color" → "#cc0000"    "B2.align" → "right"
```

- 셀마다 Map을 중첩하지 않고 "셀.속성" 형태의 평평한 키를 쓴다. 이유는 6.2에 있다.
- 모든 쓰기는 `doc.transact(fn, origin)` 안에서 한다. `origin`은 `"user-edit"`(사람) 또는 `"ai-apply"`(AI 적용)이고, 이 값으로 실행 취소 대상인지가 정해진다(5.3).
- `writeValues()`는 값이 같은 셀을 건너뛴다. 그래서 실행 취소 기록에 아무것도 바뀌지 않은 단계가 남지 않는다. 빈 문자열을 쓰면 키를 지운다.
- 서식 값은 저장 전에 `isValidStyle()`로 검증한다(색은 `#rrggbb`, 정렬은 left/center/right만). 다른 탭이나 AI에서 온 값도 같은 함수를 거친다.
- Delete 키는 값만 지우고 서식은 남긴다(`clearValues`). 엑셀·구글 시트와 같다.

### 4.4 FormulaBar

[FormulaBar.tsx](../src/components/sheet/FormulaBar.tsx)는 선택 범위 주소(`A1:C3`)와 active 셀의 값을 보여 주기만 한다. 수식 입력줄에서 직접 고치는 기능은 없다(8장).

### 4.5 Workspace → Grid

관련 파일: [grid/](../src/components/sheet/grid), [hooks/grid/](../src/hooks/grid), [keymap.ts](../src/lib/sheet/keymap.ts), [navigation.ts](../src/lib/sheet/navigation.ts), [selection.ts](../src/lib/sheet/selection.ts), [geometry.ts](../src/lib/sheet/geometry.ts), [viewport.ts](../src/lib/sheet/viewport.ts)

#### 그리는 구조

CSS Grid 하나 안에 머리글과 셀 2,600개(100행 × 26열)를 `div`로 그린다. 그 위에 절대 위치 오버레이를 [layers.ts](../src/components/sheet/grid/layers.ts)의 z-index 순서대로 쌓는다.

| z-index         | 컴포넌트                  | 그리는 것                                       |
| --------------- | ------------------------- | ----------------------------------------------- |
| 6, 7, 12        | `RemoteCursors`           | 다른 참여자의 선택 범위, 커서, 이름표           |
| 8, 13           | `AiPreview`               | 내 AI 제안 미리보기와 범위 이름표               |
| 9               | `RemoteAiActivity`        | 다른 참여자의 AI 편집 범위                       |
| 10              | `SelectionOverlay`        | 내 선택                                          |
| 15, 16          | `CellEditor`, `CoEditNotice` | 편집칸과 그 위의 안내                         |
| 20, 30          | `GridHeaders`             | 스크롤해도 고정되는 행·열 머리글과 왼쪽 위 모서리 |

- 오버레이에는 `pointer-events: none`([grid.css](../src/styles/grid.css)의 `overlay`)을 주어 클릭이 아래 셀로 통과한다.
- 위치는 [geometry.ts](../src/lib/sheet/geometry.ts)의 고정 치수(열 100px, 행 24px)로 계산한다. `cellRect`·`rangeRect`가 픽셀 위치를 주고, `outsetRect`가 1px 격자선까지 덮도록 넓힌다.
- **다시 그리는 범위를 줄인다.** `GridCells`는 `memo`이고 문서 버전이 바뀔 때만 다시 그린다. 그래서 선택만 바뀌면 셀 2,600개를 다시 그리지 않는다. 문서가 바뀌어도 각 `Cell`이 값·서식을 원시값 props로 받아 `memo`로 비교하므로, 실제로 DOM이 바뀌는 것은 내용이 바뀐 셀뿐이다. 시트 크기가 고정이라 가상 스크롤은 쓰지 않는다(8장).

#### 입력: 편집칸은 항상 떠 있다

[CellEditor.tsx](../src/components/sheet/grid/CellEditor.tsx), [useCellEditor.ts](../src/hooks/grid/useCellEditor.ts)

- `<input>` 하나가 늘 active 셀 위에 투명하게(opacity 0) 놓여 포커스를 쥐고 있다. 편집 중이 아닐 때도 그렇다.
- 이렇게 하는 이유는 첫 글자를 잃지 않기 위해서다. 셀을 선택한 채 타이핑하면 첫 글자가 바로 이 input에 들어간다. 한글도 첫 자모부터 이 input에서 IME 조합이 시작된다. 편집이 시작되면 같은 input이 보이게 바뀔 뿐이고, 다른 요소로 포커스를 옮기지 않는다. IME 후보창도 셀 위치에 뜬다.
- input은 **비제어(uncontrolled)** 다. React가 value를 관리하지 않는다. React가 조합 중인 값을 덮어쓰면 한글이 깨지기 때문이다. 컨트롤러는 `view.readDraft()`·`writeDraft()`로 DOM 값을 직접 읽고 쓴다.
- 편집 모드는 두 가지다([keymap.ts](../src/lib/sheet/keymap.ts)의 `EditMode`). 엑셀과 같다.
  - `enter`: 셀을 선택한 채 바로 타이핑해서 시작한 경우. 방향키를 누르면 입력을 확정하고 옆 셀로 이동한다.
  - `edit`: F2나 더블클릭으로 시작한 경우. 기존 값이 들어 있고, 방향키는 글자 사이에서 커서를 움직인다. F2를 누르면 두 모드가 바뀐다.

#### 키보드: 키 → 동작 → 명령

```
keydown ─▶ useCellEditor.onKeyDown
            ├─ IME 조합 중(isComposing 또는 keyCode 229)이면 아무것도 하지 않는다
            └─ resolveGridKey(키, 편집 모드, Mac인가) ─▶ GridAction 또는 null
                 ├─ null이면 브라우저 기본 동작(글자 입력, 커서 이동)에 맡긴다
                 └─ 있으면 preventDefault() 후 controller.runAction(action)
                      ├─ 이동 계열 → controller.navigate() → navigate() 순수 함수
                      └─ 그 밖     → startEdit, cancelEdit, toggleFormat, undo …
```

| 키                                  | 동작                                                                  |
| ----------------------------------- | --------------------------------------------------------------------- |
| 방향키 / Shift+방향키               | 이동 / 범위 넓히기                                                    |
| Ctrl(⌘)+방향키                      | 데이터 블록의 끝으로 이동(엑셀 규칙). Shift를 같이 누르면 범위로       |
| Enter·Tab (Shift는 반대 방향)       | 입력 확정 후 아래·오른쪽으로. 범위가 선택돼 있으면 범위 안을 돈다     |
| PageUp/PageDown, Home, Ctrl+Home    | 한 화면, 행 처음, 시트 처음                                           |
| Ctrl+A                              | 전체 선택                                                             |
| F2 / Esc                            | 편집 시작·모드 전환 / 편집 취소                                       |
| Delete, Backspace                   | 값 지우기(서식은 남김)                                                |
| Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z        | 실행 취소, 다시 실행. 편집 중에는 입력칸의 기본 동작(글자 되돌리기)    |
| Ctrl+B/I/U/5, Ctrl+Shift+L/E/R, Ctrl+\ | 굵게·기울임·밑줄·취소선, 정렬, 서식 지우기                          |

- `resolveGridKey()`와 `navigate()`는 둘 다 순수 함수다. React 없이 테스트한다([keymap.test.ts](../tests/unit/sheet/keymap.test.ts), [navigation.test.ts](../tests/unit/sheet/navigation.test.ts)).
- `navigate()`는 (선택, `tabReturnCol`)과 동작, 그리고 `{ 한 화면의 행 수, 셀이 채워졌는가 }`를 받아 새 선택과 스크롤할 셀을 돌려준다.
- `tabReturnCol`은 엑셀의 Tab 동작을 따라 하기 위한 값이다. Tab으로 오른쪽으로 입력해 나가다 Enter를 누르면, Tab을 시작한 열의 다음 행으로 돌아간다.
- 선택([selection.ts](../src/lib/sheet/selection.ts))은 좌표 세 개로 이루어진다. `anchor`는 범위를 시작한 고정 꼭짓점, `focus`는 Shift+방향키나 드래그로 움직이는 꼭짓점, `active`는 입력이 들어가는 셀이다.

#### 마우스

[useGridPointer.ts](../src/hooks/grid/useGridPointer.ts), [viewport.ts](../src/lib/sheet/viewport.ts)

- 셀마다 핸들러를 달지 않고 콘텐츠 `div` 하나에서 이벤트를 받는다. `hitTest()`가 포인터 좌표로 셀, 행 머리글, 열 머리글, 모서리 중 어디인지 판정한다. 머리글은 화면에 고정돼 있으므로 스크롤 영역을 기준으로 계산한다.
- `pointerdown`에서 하는 일:
  1. `preventDefault()`: 편집칸의 포커스를 지키고, 드래그하는 동안 글자가 선택되지 않게 한다.
  2. `finishBeforePointer()`: 편집 중이면 입력을 확정한다. IME 조합 중이면 blur → focus로 조합부터 끝낸다.
  3. `pointerSelect()`로 선택한다.
  4. `setPointerCapture()`: 그리드 밖으로 끌어도 이벤트를 계속 받는다.
- `pointermove`는 `pointerDrag()`, 더블클릭은 `startEdit("edit", true)`를 부른다.

#### 컨트롤러와 DOM을 잇는 SheetView

`SheetController`는 DOM을 모른다. Grid가 `attachView({ reveal, visibleRowCount, focus, readDraft, writeDraft })`로 DOM 작업을 붙여 준다. 붙이기 전에는 아무것도 하지 않는 `detachedView`가 들어 있다. 그래서 테스트에서는 DOM 없이 컨트롤러를 돌릴 수 있다.

#### 공동 편집 표시

- `RemoteCursors`: 다른 참여자의 범위(얇은 테두리), 커서(굵은 테두리, 입력 중이면 옅은 바탕색), 이름표
- `RemoteAiActivity`: 다른 참여자가 AI로 편집 중인 범위(점선)와 "○○ · AI 결과 검토 중" 이름표
- `CoEditNotice`: 내가 입력 중인 셀에 대한 안내(`editorNotices()`). 같은 셀을 다른 사람도 입력하고 있거나, 다른 사람의 AI 편집 범위 안일 때 뜬다.
- `AnchoredLabel`: 셀·범위 위(또는 아래)에 붙는 이름표의 공통 컴포넌트. 대상이 첫 행이면 호출하는 쪽이 `below`를 넘겨, 머리글에 가리지 않게 아래에 붙인다.

### 4.6 Workspace → AiPanel

관련 파일: [AiPanel.tsx](../src/components/sheet/ai/AiPanel.tsx), [AiComposer.tsx](../src/components/sheet/ai/AiComposer.tsx), [ModelSelect.tsx](../src/components/sheet/ai/ModelSelect.tsx), [run-card/](../src/components/sheet/ai/run-card), [useAiConnection.ts](../src/hooks/ai/useAiConnection.ts), [ai/messages.ts](../src/lib/ai/messages.ts)

- **AiPanel**: 열릴 때 `GET /api/ai/edit`로 연결 정보를 받는다. 가짜 응답 모드인지, 기본 모델이 무엇인지, 고를 수 있는 모델이 무엇인지가 들어 있고, 이것으로 배지와 모델 목록을 그린다. 대화가 비어 있으면 예시 요청 칩을 보여 준다. 가짜 모드라면 실패를 재현하는 태그 안내도 함께 보여 준다.
- **AiComposer**: 요청 입력칸이다.
  - 범위는 여러 칸을 선택해 두었으면 "선택 범위", 아니면 "시트 전체"가 기본이다.
  - Enter로 보내고, Shift+Enter로 줄을 바꾸고, Esc로 중단한다.
  - 같은 범위를 다른 사람이 AI로 편집 중이면 미리 알려 준다(`overlappingAi()`). 그래도 요청은 막지 않는다.
- **AiRunCard**(`run-card/index.tsx`): AI 실행 하나를 보여 준다. 데이터는 여기서만 읽고, `StatusLine`·`ConflictBanner`·`ProposalList`에는 props로 넘긴다. 보여 주는 것은 진행 상태, 답 글, 경고, 충돌 안내, 제안 목록(셀마다 "지금 값 → 제안", 충돌한 셀은 "요청 때 값 → 지금 값"도 함께), 그리고 적용·버리기·원래 값 보기·다시 시도 버튼이다.
- 상태를 화면 문구로 바꾸는 일은 [lib/ai/messages.ts](../src/lib/ai/messages.ts)에 모여 있다. 컴포넌트는 그 결과를 그리기만 한다.

요청부터 적용까지의 흐름은 [5.5](#55-ai-요청-한-번)에 있다.

---

## 5. 동작 하나씩 따라가기

### 5.1 B2에 "100"을 입력하고 Enter를 누르면, 다른 탭에 보이기까지

1. **"1"을 누른다.** `onKeyDown` → `resolveGridKey()`가 null을 돌려준다. 브라우저가 투명한 편집칸에 "1"을 넣는다.
2. **편집이 시작된다.** `onInput` → `controller.startEdit("enter", false)` → `edit` store가 `{ mode: "enter", coord: B2 }`가 된다.
   - `CellEditor`가 보이는 편집칸으로 바뀐다.
   - `SheetController.connect()`에서 걸어 둔 구독이 `presence.setEditing(B2)`를 불러, 다른 탭에 "B2 입력 중"을 알린다.
3. "0", "0"을 입력한다.
4. **Enter를 누른다.** `resolveGridKey()`가 `{ type: "advance", dRow: 1 }`을 돌려주고, `runAction` → `controller.navigate()`로 이어진다. `navigate()`는 먼저 `commitEdit()`을 부른다.
   - `setValue(doc, B2, "100", "user-edit")` → `writeValues()` → `doc.transact(…, "user-edit")`
   - 편집칸을 비우고 `edit`를 null로 바꾼다.
   - 그다음 `navigate()` 순수 함수가 B3을 선택하고 스크롤한다.
5. **트랜잭션이 끝나면** 넷이 반응한다. UndoManager는 트랜잭션 종료(`afterTransaction`)를 듣고, 나머지 셋은 Y.Doc의 `update` 이벤트를 듣는다.
   - `UndoManager`: origin이 `"user-edit"`이므로 실행 취소 스택에 넣는다. 이때 선택(B2)도 함께 기억한다(5.3).
   - `IndexeddbPersistence`: 이 업데이트를 IndexedDB에 저장한다.
   - `BroadcastChannelProvider`: 이 업데이트를 다른 탭에 방송한다.
   - `useDocVersion`: 버전을 올린다. 그러면 `GridCells`, `Toolbar`, `FormulaBar`가 다시 그려진다.
6. **탭 B가 받는다.** `channel.onmessage` → `receive()` → `readSyncMessage()`가 업데이트를 탭 B의 문서에 적용한다. 이때 origin은 provider다.
   - provider는 origin이 자기 자신이므로 다시 방송하지 않는다.
   - 탭 B의 `UndoManager`는 origin이 provider라서 이 변경을 기록하지 않는다. 그래서 탭 B에서 실행 취소를 눌러도 A가 입력한 값은 지워지지 않는다.
   - `useDocVersion`이 버전을 올려 탭 B의 화면이 바뀐다.

### 5.2 한글 "가"를 입력하면

1. `compositionstart`: 조합 중 표시를 켜고 `startEdit("enter", false)`를 부른다.
2. 조합 중에 들어오는 keydown은 `isComposing`이라 무시한다. 그래서 글자를 확정하려고 누른 Enter가 다음 셀로 이동하는 동작으로 처리되지 않는다. 여기서 Enter를 처리하면 마지막 글자가 사라지거나 두 번 들어간다.
3. `compositionend`: 조합 중 표시를 끈다.
4. 조합 중에 다른 셀을 클릭하면, `finishBeforePointer()`가 blur → focus로 브라우저가 조합을 끝내게 하고, `onBlur`에서 입력을 확정한다.
5. 다른 창으로 전환해서 blur된 경우(`document.hasFocus()`가 false)에는 확정하지 않고 편집을 유지한다. 돌아오면 이어서 입력할 수 있다.

### 5.3 실행 취소(Ctrl+Z)

1. `resolveGridKey()`가 `undo`를 돌려준다. 편집 중일 때의 Ctrl+Z는 입력칸의 기본 동작(글자 되돌리기)에 맡긴다.
2. `controller.undo()`는 먼저 `commitEdit()`으로 입력 중이던 값을 확정한 뒤 `undoManager.undo()`를 부른다. 그래서 입력 중에 툴바의 실행 취소를 누르면 "입력 취소"처럼 동작하고, 다시 실행으로 되살릴 수 있다.
3. UndoManager 설정([undo.ts](../src/lib/collab/undo.ts)):
   - `trackedOrigins: {"user-edit", "ai-apply"}`: 이 탭에서 한 변경만 기록한다. 다른 탭에서 온 변경(origin = provider)과 저장소에서 불러온 변경은 대상이 아니다.
   - `captureTimeout: 0`: 기본값(500ms)이면 빠르게 이어진 편집이 한 단계로 합쳐진다. 0이면 동작 하나가 한 단계다.
4. 선택 위치 복원([sheet-controller.ts](../src/lib/controller/sheet-controller.ts)의 `connect`):
   - `stack-item-added` 이벤트에서 그때의 선택을 기록 항목의 `meta`에 저장한다.
   - `stack-item-popped` 이벤트에서 그 선택으로 이동한다.
   - 되돌리는 동안 반대쪽(다시 실행) 스택에 새 항목이 생기고, Yjs는 `added`를 먼저 내고 `popped`를 나중에 낸다. 코드는 이 순서를 이용해 새 항목에도 같은 선택을 넣는다. 그래서 다시 실행해도 같은 위치로 간다.
5. 다른 참여자가 그 뒤에 덮어쓴 셀은 되돌리지 않는다(Yjs UndoManager의 기본 동작).

### 5.4 다른 참여자의 커서가 보이기까지, 그리고 탭이 닫히면

1. 선택이 바뀐다 → `controller.selection` store가 바뀐다 → `connect()`의 구독이 `presence.setSelection()`을 부른다 → `awareness.setLocalState()`
2. provider의 `handleAwarenessUpdate`는 **내 상태가 바뀐 경우에만** 방송한다. 다른 탭의 상태를 중계하면, 타임아웃으로 지운 상태가 다시 퍼지면서 살아 있는 참여자가 목록에서 깜빡일 수 있기 때문이다.
3. 탭 B가 받는다. `applyAwarenessUpdate()` → awareness `change` → `Presence.handleChange()`. 이 함수는 새 참여자의 잠금을 기다리기 시작하고(`watch`), 이름·색 충돌을 확인하고, 검증하고 정렬한 참여자 목록을 다시 만든다(`recompute`). 그 결과 `useParticipants` → `RemoteCursors`, `ParticipantList`가 다시 그려진다.
4. 탭 A를 닫으면 `pagehide` → `leave()` → `setLocalState(null)`이 되어 "A가 떠났다"가 방송된다. 브라우저가 강제 종료돼서 `pagehide`가 없었다면, A의 Web Lock이 풀리면서 탭 B의 `watch` 콜백이 불리고 A를 지운다.
5. 새 탭이 들어오면, provider 생성자의 `announce()`가 네 가지를 보낸다: SyncStep1(내가 가진 것의 요약), SyncStep2(내 문서), awareness 질의, 내 awareness. 다른 탭들은 SyncStep1에 SyncStep2(상대에게 없는 부분)로 답한다. 방송이라 답장이 모든 탭에 가지만, Yjs 업데이트는 같은 것을 두 번 적용해도 결과가 같으므로(멱등) 안전하다.

### 5.5 AI 요청 한 번

**① 브라우저: 보내기** — [AiController.send()](../src/lib/ai/ai-controller.ts)

1. 지시문의 앞뒤 공백을 지우고 2,000자로 자른다. 이미 실행 중이거나 검토 중이면 거절한다(`isBusy`).
2. 범위를 시트 안으로 자른다. `snapshotCells()`는 비어 있지 않은 셀을 읽는 순서대로 모으고, `conversationHistory()`는 최근 대화 10개를 모은다([request.ts](../src/lib/ai/request.ts)). 상한은 모두 `AI_LIMITS`를 따른다.
3. `createRun()`으로 실행을 만든다. 이때 `base`에 **요청 시점의 셀 값**을 기억해 둔다. 나중에 충돌을 판단하는 기준이 된다(5.6).
4. 대화(`messages`)에 사용자 메시지와 실행을 넣고, `active`를 이 실행으로 바꾼다. 그러면 Grid에 미리보기가 시작되고, `ai.connect()`의 구독이 `presence.setAi({ status: "generating", range })`로 다른 탭에 알린다.
5. `AbortController`와 감시 타이머를 건다. 5초 동안 아무 이벤트도 없으면 "응답 지연"을 표시하고, 60초면 시간 초과 오류로 끝낸다. 이벤트가 올 때마다 타이머를 다시 건다.
6. [fetchAiTransport](../src/lib/ai/transport.ts)가 `POST /api/ai/edit`를 보낸다. 응답 본문을 줄 단위로 나눠 `JSON.parse` → `parseStreamEvent()`(형식 검증) → `onEvent`로 넘긴다.

**② 서버** — [route.ts](../src/app/api/ai/edit/route.ts) → [lib/ai/server/](../src/lib/ai/server)

1. 본문을 JSON으로 읽고 `parseEditRequest()`(zod)로 검증한다. 길이 상한과, A1 주소가 시트 안인지를 본다. 실패하면 400을 돌려준다.
2. 서버가 허용한 모델만 받는다(`model_not_offered`). 브라우저가 임의의 모델로 비용을 쓰지 못하게 하기 위해서다.
3. `streamClaudeEdits()`(async generator)를 시작하고 **첫 이벤트를 먼저 기다린다.** 스트림이 시작되기 전의 오류(키 오류, 요청 한도 등)는 `AiProviderError`로 던져지고, 이것을 HTTP 상태 코드(401, 429 …)로 응답한다. 스트림이 시작된 뒤의 오류는 스트림 안의 `error` 이벤트로 보낸다.
4. `ReadableStream`의 `pull`로 이벤트를 한 줄씩 NDJSON으로 보낸다. 브라우저가 연결을 끊으면 `request.signal`을 통해 SDK 호출도 멈춘다.
5. Claude 호출([claude.ts](../src/lib/ai/server/claude.ts), [prompt.ts](../src/lib/ai/server/prompt.ts)):
   - 시스템 프롬프트, `propose_edits` 도구, 사용자 메시지를 보낸다. 사용자 메시지에는 `<sheet>` 블록(`B2 = "100"` 형식), 편집 가능 범위, 요청이 들어간다.
   - 글 조각(`text_delta`)이 오면 `{ type: "text" }`를 보낸다.
   - 도구 입력 JSON 조각(`input_json_delta`)이 오면 [edit-stream-parser.ts](../src/lib/ai/server/edit-stream-parser.ts)가 `{"edits":[{…},{…}]}`에서 원소 하나가 닫힐 때마다 `JSON.parse`해 `{ type: "edit", cell, value }`를 보낸다.
   - 응답이 끝나면 종료 이유를 확인한다. 모델이 거절했으면(`refusal`) `refused` 오류로 끝낸다. 그 밖에는, 최대 길이에서 끊겼으면(`max_tokens`) 경고를 보내고, 형식이 잘못된 제안이 있었으면 그 개수 경고를 보낸 뒤 `done`을 보낸다.
   - SDK 오류는 `toAiError()`가 auth, quota, rate_limited, overloaded 같은 코드로 분류한다.
6. API 키가 없거나 `AI_MOCK=1`이면, [setup.ts](../src/lib/ai/server/setup.ts)가 SDK의 `fetch` 자리에 [가짜 API](../src/lib/ai/server/mock-anthropic.ts)를 넣는다. 가짜 API는 실제 API와 같은 SSE를 만들어 돌려주므로 서버 코드는 실제와 같은 경로를 지난다. 지시문에 `[느림]` `[한도]` `[키]` `[과부하]` `[거절]` `[잘림]`을 넣으면 그 실패를 재현한다.

**③ 브라우저: 받기** — `AiController.handleEvent()` → [run.ts](../src/lib/ai/run.ts)의 `applyProgress()`

| 이벤트    | 하는 일                                                                                                    |
| --------- | ---------------------------------------------------------------------------------------------------------- |
| `meta`    | 연결됨 표시, 실제 응답한 모델 이름 기록                                                                    |
| `text`    | 답 글에 이어 붙인다                                                                                        |
| `edit`    | `addProposal()`. 주소가 잘못됐거나 범위 밖이면 개수만 센다. 요청 때 값과 같으면 제안에서 뺀다. 같은 셀이 다시 오면 덮어쓴다 |
| `warning` | 경고 목록에 쌓는다                                                                                         |
| `done`    | `finishRun()`. 제안이 있으면 검토(`review`), 없으면 답만 한 것(`answered`)으로 끝낸다                       |
| `error`   | 실패로 끝낸다. 서버는 코드만 보내고, 화면 문구는 브라우저가 [strings.ts](../src/resources/strings.ts)에서 고른다 |

첫 제안이 오면 그 셀로 스크롤해서, 다른 곳을 보고 있어도 생성되는 과정을 볼 수 있게 한다.

**④ 검토와 적용**

- **미리보기**([AiPreview.tsx](../src/components/sheet/grid/AiPreview.tsx)): 문서에는 쓰지 않고 셀 위에 덮어 그리기만 한다. 셀 상태(5.6)에 따라 보라색 제안, 주황 테두리만(충돌이라 지금 값을 가리지 않음), 그리지 않음(이미 같음) 중 하나다. "원래 값 보기"를 누르면 제안을 감춘다.
- **적용**(`AiController.apply()`):
  1. 내가 입력 중이던 값을 먼저 확정한다(`commitEdit`). 그 셀이 제안 대상이면 충돌로 판단된다.
  2. 화면에 보이던 판단이 아니라 지금 값으로 다시 판단한다. 쓸 셀은 "깨끗한 셀"과 "덮어쓰기를 고른 충돌 셀"이다.
  3. 바뀔 범위로 선택을 옮긴다. 실행 취소하면 이 범위로 돌아오게 하기 위해서다.
  4. `writeValues(…, "ai-apply")`로 한 트랜잭션에 쓴다. 그래서 실행 취소 한 번으로 모두 되돌아간다.
  5. 2번의 판단과 4번의 쓰기가 같은 동기 코드 안에 있다. BroadcastChannel 메시지는 이벤트 루프의 작업으로 전달되므로, 그 사이에 다른 탭의 변경이 끼어들 수 없다.
- 그 밖의 동작: 버리기(`discard`), 지금 값으로 다시 요청(`regenerate` = 버리고 같은 지시로 다시 보내기), 중단(`cancel` = 요청 끊기), 다시 시도(`retry` = 지금 고른 모델로 다시 보내기)

### 5.6 공동 편집 × AI: 판단은 함수 하나

[coedit.ts](../src/lib/ai/coedit.ts)의 `classifyCell(base, current, proposed)`가 셀마다 세 값을 비교한다.

| 조건                     | 상태       | 적용하면                         |
| ------------------------ | ---------- | -------------------------------- |
| 제안 = 지금 값           | `same`     | 바꿀 것 없음                     |
| 지금 값 = 요청 때 값     | `clean`    | AI 값으로 바뀐다                 |
| 그 밖(그사이 누가 바꿈)  | `conflict` | 건너뛴다(덮어쓰기를 고르면 쓴다) |

- **판단 결과를 저장하지 않는다.** Grid와 AiRunCard가 문서가 바뀔 때마다 다시 계산한다. 그래서 바꾼 사람이 원래 값으로 되돌리면 충돌 표시도 저절로 사라진다.
- **덮어쓰기는 "고를 때 본 값"에 묶인다.** `overwrites`에 "셀 → 고를 때의 값"을 저장한다. 고른 뒤에 값이 또 바뀌면, 사용자가 그 새 값은 확인하지 않았으므로 다시 건너뛴다.
- **다른 탭에 알리기**: `aiActivityOf(run)`이 `{ status: generating | reviewing, range }`를 만든다. 제안 값은 싣지 않는다. 확정되지 않은 값이 실제 데이터처럼 보이면 혼란스럽고, 토큰마다 모든 탭에 방송하게 되기 때문이다. `publishActivity()`는 상태나 범위가 바뀔 때만 보낸다.
- **겹침 안내**: `overlappingAi()`는 시트 전체 요청을 시트 전체 범위로 보고 겹치는지 판단한다. 편집칸 위 안내(`aiActivitiesAt()`)는 범위를 아직 모르는 시트 전체 요청을 뺀다. 빼지 않으면 모든 셀에 안내가 뜬다.
- README의 세 상황은 [coedit-tabs.test.ts](../tests/unit/ai/coedit-tabs.test.ts)에서 실제 세션 두 개를 열어 재현한다.

---

## 6. 기술 선택과 이유

### 요약

| 기술                                | 쓰는 곳                        | 고른 이유                                                                   | 대가·한계                                       |
| ----------------------------------- | ------------------------------ | --------------------------------------------------------------------------- | ----------------------------------------------- |
| Next.js 16 App Router, React 19, TS | 전체                           | 과제 조건. 서버 기능은 API 키를 숨기는 Route Handler 하나만 쓴다            | 화면은 전부 클라이언트 컴포넌트                 |
| Yjs (CRDT)                          | 셀 값·서식                     | 서버 없이 여러 탭이 같은 상태로 수렴. awareness·UndoManager 내장            | 같은 셀을 동시에 쓰면 한쪽 값이 이긴다          |
| y-protocols + 직접 만든 provider    | 탭 간 전송                     | 브라우저 API만 쓰라는 조건. y-websocket과 같은 인코딩이라 교체가 쉽다       | 같은 브라우저의 탭끼리만                        |
| y-indexeddb                         | 저장                           | Yjs 업데이트를 그대로 저장. 별도 직렬화가 필요 없다                         | 실패를 알리지 않아 타임아웃으로 보완            |
| Web Locks                           | 탭 닫힘 감지                   | 탭이 죽으면 브라우저가 잠금을 풀어 즉시·정확하게 안다                       | 없는 환경에서는 30초 타임아웃으로 대체           |
| 직접 만든 그리드                    | 화면                           | 원격 커서, AI 미리보기, 한글 IME를 세밀하게 제어. 라이브러리 라이선스 문제   | 가상 스크롤 없음(고정 100×26)                   |
| 컨트롤러 + 작은 Store               | 상태와 명령                    | 모든 입력 경로가 같은 명령을 부른다. React 없이 테스트 가능                  | 구독 코드를 직접 관리                           |
| `@anthropic-ai/sdk`, 도구 호출      | AI 서버                        | 스트리밍, 취소, 오류 분류, 재시도. 구조화된 결과를 셀 단위로 스트리밍        | 도구 입력 파서를 직접 작성                      |
| fetch 스트림 + NDJSON               | 브라우저 ↔ 서버                | POST 본문 + 스트리밍 + 취소. 줄 단위라 파싱이 단순                          | 프로토콜 검증을 직접 작성                       |
| zod                                 | 서버의 요청 검증               | 신뢰할 수 없는 입력의 형식과 길이 상한 검증                                 | 브라우저 쪽 검증은 손으로 쓴 함수               |
| 가짜 Claude API(fetch 주입)         | 개발, 테스트                   | 키 없이 실제와 같은 코드 경로. 실패 상황 재현                               | 응답 내용은 몇 낱말만 알아듣는 흉내             |
| Tailwind CSS 4 + 토큰               | 스타일                         | 정해진 단계만 쓰게 강제. 상태는 aria-* 속성으로                              | 토큰 밖의 값은 tokens.css에 먼저 추가해야 한다  |
| Vitest + fake-indexeddb             | 테스트                         | lib가 React와 무관해 Node에서 바로 실행. 탭 여러 개를 실제 경로로 재현      | 브라우저 E2E는 아직 없음                        |

### 6.1 Next.js App Router

- PLAN에 적힌 과제 조건이다. 이 앱에서 서버가 필요한 이유는 하나뿐이다. **API 키를 브라우저에 보내지 않는 것.** 그래서 서버 기능은 Route Handler [route.ts](../src/app/api/ai/edit/route.ts) 하나만 쓴다.
- `lib/ai/server/`의 파일은 맨 위에 `import "server-only"`가 있다. 클라이언트 코드가 이 파일을 import하면 Next.js가 빌드 오류를 낸다. 실수로 키를 다루는 코드가 브라우저 번들에 들어가는 것을 막는다.
- 화면은 `SheetApp`부터 전부 클라이언트 컴포넌트다. 핵심 기능(동기화, 저장, 생존 확인)이 모두 브라우저 API이기 때문이다.
- React 19의 `use(Context)`, `<Context value>` 문법을 쓴다. 바깥 상태 구독에는 React 표준인 `useSyncExternalStore`를 쓴다(3.5).

### 6.2 Yjs: 왜 CRDT인가, 왜 평평한 키인가

- **문제**: 여러 탭이 같은 셀을 동시에 바꿔도 모든 탭이 같은 결과로 맞춰져야 한다. 그런데 순서를 정해 줄 서버가 없다.
- **CRDT**는 중앙에서 순서를 정하지 않아도, 같은 변경들을 받기만 하면 받은 순서와 관계없이 같은 상태가 되는 자료구조다. 이것을 직접 만들려면 수렴, 늦게 합류한 탭의 따라잡기, "내 변경만 실행 취소"를 모두 손으로 해결해야 한다.
- **Yjs를 고른 이유**(PLAN): 검증된 CRDT이고, 참여자 정보를 위한 awareness와 origin별로 기록하는 UndoManager가 함께 있다. 이 프로젝트의 "내 변경만 되돌리기"와 "AI 적용을 한 번에 되돌리기"는 트랜잭션 origin 하나로 해결된다.
- **평평한 키를 쓰는 이유**(PLAN, [document.ts](../src/lib/sheet/document.ts)): 셀마다 `Y.Map`을 중첩한다고 해 보자. 빈 셀에 A가 값을 넣는 순간 B가 굵게를 누르면, 두 탭이 각자 그 셀의 Map을 새로 만든다. 그러면 하나가 이기고 다른 쪽 Map은 통째로 사라진다. `"B2"`, `"B2.bold"`처럼 평평한 키로 두면 서로 다른 키라 두 변경이 모두 남는다. 이 동작은 [document.test.ts](../tests/unit/sheet/document.test.ts)의 "concurrent edits"에서 확인한다.
- **대가**: 같은 키를 거의 동시에 바꾸면 CRDT 규칙에 따라 한쪽 값이 이긴다. 어느 쪽이 이길지는 사용자가 고를 수 없다. README의 "한계"에 적혀 있다.

### 6.3 BroadcastChannel provider를 직접 만든 이유

- PLAN의 조건이 "브라우저 API만"이다. BroadcastChannel은 같은 출처(origin)의 탭끼리 메시지를 주고받는 브라우저 API다.
- 메시지 형식은 y-websocket과 같은 y-protocols 인코딩(sync step 1/2, update, awareness)이다. 그래서 네트워크 동기화로 확장할 때 [broadcast-provider.ts](../src/lib/collab/broadcast-provider.ts)만 `WebsocketProvider`로 바꾸면 된다.
- 1:1 연결이 아니라 1:N 방송이라는 점을 두 가지로 처리한다. SyncStep2 답장이 모든 탭에 가도 멱등이라 문제없다. 그리고 각 탭은 자기 awareness만 방송한다(5.4의 깜빡임 문제).
- bfcache에서 복원된 탭은 멈춰 있던 동안의 메시지를 놓쳤으므로, `resync()`로 합류 절차를 다시 밟는다.

### 6.4 탭 생존 확인을 Web Locks로 한 이유

- y-protocols awareness의 기본 방식은 각 탭이 15초마다 자기 상태를 갱신하고, 30초 동안 소식이 없는 탭을 지우는 것이다. 그런데 크롬은 가려진 탭의 타이머를 늦춘다. 그래서 열려 있는 탭이 목록에서 사라졌다가 다시 나타난다.
- Web Lock은 탭이 죽으면 브라우저가 풀어 준다. 그래서 타이머 없이 즉시, 정확하게 알 수 있다. Web Locks가 없는 환경에서는 기본 방식으로 돌아간다([presence.test.ts](../tests/unit/collab/presence.test.ts)에서 두 경우를 모두 확인).
- PLAN에서는 heartbeat 방식이었는데, 구현하면서 이 방식으로 바꿨다(7장).

### 6.5 sessionStorage와 localStorage

- 참여자 신원은 **탭 단위**여야 한다(새 탭 = 새 참여자). 그래서 탭마다 따로인 sessionStorage에 둔다.
- 모델 선택은 **사람(브라우저) 단위**의 취향이다. 그래서 localStorage에 둔다.
- 둘 다 접근 실패(사생활 보호 모드, 차단)를 `try/catch`로 무시한다. 저장하지 못해도 이번 화면에서는 그대로 쓴다.

### 6.6 그리드를 직접 만든 이유

- PLAN: 원격 커서, AI 미리보기 오버레이, 한글 IME 처리를 세밀하게 제어하기 위해서다. Handsontable 같은 라이브러리는 라이선스 문제도 있다.
- 크기가 100 × 26으로 고정이라 셀 2,600개를 DOM으로 그대로 그리고, `memo`로 다시 그리는 범위를 줄이는 것으로 충분했다.

### 6.7 로직을 컨트롤러로 React 밖에 둔 이유

- 키보드, 마우스, 툴바, AI 패널이 모두 같은 명령을 부른다. 그래서 "편집 중이면 먼저 확정한다" 같은 규칙이 [SheetController](../src/lib/controller/sheet-controller.ts) 한 곳에만 있다.
- React 없이 테스트할 수 있다([sheet-controller.test.ts](../tests/unit/controller/sheet-controller.test.ts), [ai-controller.test.ts](../tests/unit/ai/ai-controller.test.ts)).
- 상태 관리 라이브러리를 들이지 않았다. 필요한 기능이 `get`·`set`·`subscribe`뿐이라 [store.ts](../src/lib/store.ts) 24줄로 충분하다.

### 6.8 AI: Claude API, 공식 SDK, 도구 호출

- **공식 SDK**(`@anthropic-ai/sdk`): 스트리밍, `AbortSignal`을 통한 취소, 오류 종류별 클래스(`AuthenticationError`, `RateLimitError` …), 자동 재시도(`maxRetries: 2`), 타임아웃(60초)을 제공한다. 실패 처리를 상황별로 다르게 하는 데 필요한 정보가 이미 나뉘어 있다.
- **도구 호출(tool use)로 결과를 받는다.** 자유 텍스트에서 셀 값을 뽑아내는 대신, `{ cell, value }` 목록이라는 스키마로 받는다. `eager_input_streaming`을 켜면 도구 입력이 생성되는 대로 도착하므로, 셀 제안을 하나씩 미리보기에 보여 줄 수 있다.
- **점진 파서를 직접 만든 이유**([edit-stream-parser.ts](../src/lib/ai/server/edit-stream-parser.ts)): SDK의 부분 JSON 해석은 잘린 문자열도 조용히 받아들일 수 있다. 그래서 배열 원소가 닫힐 때만 `JSON.parse`로 엄격하게 읽는다. 반쯤 생성된 값이 제안으로 나가지 않는다.
- **비용 통제**: 서버가 허용한 모델 목록(`AI_MODELS`와 `ANTHROPIC_MODEL`)으로만 요청한다. 요청 크기 상한(`AI_LIMITS`)은 브라우저가 자를 때와 서버가 검증할 때 같은 값을 쓴다.
- 지원하는 모델에서만 `effort` 옵션과, 거절 시 다른 모델로 이어 처리하는 서버 측 대체 옵션을 켠다. 지원하지 않는 옵션을 보내면 400 오류가 나기 때문이다.

### 6.9 브라우저 ↔ 서버: fetch 스트림, NDJSON, 코드만 보내기

- 요청에 시트 내용을 실어야 하므로 POST가 필요하다. `EventSource`(SSE)는 GET만 보낼 수 있어 맞지 않는다. `fetch` 응답 스트림을 쓰면 `AbortController`로 끊을 수도 있다.
- NDJSON은 한 줄에 JSON 하나다. 줄을 나눠 `JSON.parse`하기만 하면 되고, 해석할 수 없는 줄은 건너뛰면 된다.
- 첫 이벤트를 기다렸다가 응답을 시작하는 덕분에, 스트림 시작 전의 실패를 HTTP 상태 코드로 알릴 수 있다.
- **오류와 경고는 코드로만 보낸다**([protocol.ts](../src/lib/ai/protocol.ts)). 화면 문구는 브라우저가 [strings.ts](../src/resources/strings.ts)에서 고른다. 문구는 한 파일에서만 고치면 되고, 서버는 화면 문구를 알 필요가 없다.
- 들어오는 값은 양쪽에서 검증한다. 서버는 zod로, 브라우저는 `parseStreamEvent()`로 한다.

### 6.10 가짜 Claude API

- [mock-anthropic.ts](../src/lib/ai/server/mock-anthropic.ts)를 SDK의 `fetch` 자리에 넣는다. 그러면 SDK 입장에서는 실제 API와 같은 SSE를 받는다. 서버 코드와 SDK의 파싱 경로가 실제와 똑같으므로, 가짜로 확인한 코드가 실제 모델에서도 그대로 동작한다.
- API 키 없이 데모와 테스트를 할 수 있다. 지연, 요청 한도, 키 오류, 과부하, 거절, 잘림을 태그 하나로 재현할 수 있다.
- [ai-controller.test.ts](../tests/unit/ai/ai-controller.test.ts)의 "end to end" 테스트는 컨트롤러 → fetch → route → Claude 코드 → SDK → 가짜 API 전 구간을 한 번에 지난다.

### 6.11 Tailwind CSS 4와 디자인 토큰

- [tokens.css](../src/styles/tokens.css)의 `@theme`에서 Tailwind 기본 팔레트·글자 크기·모서리·그림자를 `initial`로 끄고, 정해진 단계만 정의한다. 토큰 밖의 값을 쓰면 클래스가 아예 만들어지지 않으므로, 제각각인 값이 코드에 흩어지지 않는다.
- 버튼의 눌림·선택 같은 상태는 클래스를 바꾸지 않고 `aria-pressed`, `aria-checked`, `aria-expanded` 속성으로 표현한다. 접근성과 스타일이 한 번에 맞춰진다.
- 위치나 참여자 색처럼 계산으로 정해지는 값만 인라인 `style`로 준다.

### 6.12 Vitest와 fake-indexeddb

- `lib/`에 React가 없으므로 Node 환경에서 바로 테스트한다.
- Node 24에는 BroadcastChannel과 Web Locks(`navigator.locks`)가 있다. 그래서 테스트 안에서 세션을 여러 개 열면 브라우저 탭 여러 개와 같은 경로로 동작한다([presence.test.ts](../tests/unit/collab/presence.test.ts)의 주석). IndexedDB는 fake-indexeddb로 대신한다.

---

## 7. 계획과 달라진 점

| PLAN.md의 계획                                   | 지금 구현                                                      | 이유                                                     |
| ------------------------------------------------ | -------------------------------------------------------------- | -------------------------------------------------------- |
| 비정상 종료는 heartbeat 타임아웃으로 감지         | Web Locks(없으면 awareness 기본 타임아웃)                       | 가려진 탭의 타이머가 늦춰져 열린 탭이 깜빡였다(6.4)     |
| AI 적용 앞뒤로 `UndoManager.stopCapturing()`      | `captureTimeout: 0`                                            | 모든 동작이 원래 한 단계가 되므로 따로 끊을 필요가 없다 |
| 탭 복제 시 sessionStorage 중복을 감지해 새로 만듦 | 이름·색 충돌을 clientID 규칙으로 해결(`resolveConflicts`)      | 복제뿐 아니라 우연히 겹친 경우도 같은 규칙으로 처리된다 |
| Playwright로 여러 탭 E2E                          | 없음. Vitest에서 실제 세션 여러 개로 재현                       | —                                                        |
| P1: 복사/붙여넣기(TSV), End 키                    | 아직 없음                                                      | —                                                        |

---

## 8. 한계와 보완할 수 있는 지점

### 기능의 한계

- **적용 순간의 짧은 틈**: 적용하는 거의 같은 순간(탭 간 전달 지연 안)에 다른 탭이 같은 셀을 고치면, 둘 중 한 값으로 수렴한다. 이 틈까지 막으려면 서버가 순서를 정해 주어야 한다(README).
- **제안은 그 탭에만 있다.** 검토 중인 제안은 새로고침하면 사라진다(README).
- **같은 브라우저 안에서만 공동 편집이 된다.** 다른 기기와 함께 쓰려면 provider를 WebSocket으로 바꾸고, 서버 저장소, 인증, 서버 기준 awareness가 필요하다(PLAN 9장).
- **AI 요청에 인증과 사용량 제한이 없다.** 지금은 서버에 접근할 수 있는 사람이면 누구나 서버의 API 키로 요청할 수 있다. 배포하려면 사용자별 요청 한도가 필요하다.
- **시트 전체를 AI에 보낸다.** 비어 있지 않은 셀을 최대 2,600개, 셀당 1,000자까지 보낸다. 시트가 커지면 범위 주변만 보내거나 요약해서 보내는 방식이 필요하다.
- **시트 크기가 100 × 26으로 고정이다.** 가상 스크롤이 없다. 수식, 행·열 삽입, 여러 시트는 범위 밖이다.
- **수식 입력줄은 보기 전용이다.** 복사/붙여넣기도 아직 없다.

### 코드를 더 정리할 수 있는 곳

동작은 그대로 두고 중복을 걷어낼 수 있는 곳들이다.

1. **다른 탭에서 온 좌표를 쓰는 곳마다 보정한다.** `RemoteCursors`, `collab/messages.ts`, `ParticipantList`, `RemoteAiActivity`, `coedit.ts`가 각자 clamp하거나 시트 범위로 자른다. [Presence.recompute()](../src/lib/collab/presence.ts)에서 한 번만 정규화하면 사용하는 곳들이 단순해진다.
2. **`intersectRanges(x, SHEET_RANGE)`가 9번 반복된다**(그중 6번은 [document.ts](../src/lib/sheet/document.ts)). `schema.ts`에 `clipToSheet()`를 두면 된다. document.ts의 "자르기 → transact → 셀마다" 뼈대도 헬퍼 하나로 묶을 수 있다.
3. **범위의 bounding box를 두 번 구현했다.** `coedit.ts`의 `boundingRange`와 `mock-anthropic.ts`의 `boundingBox`다. `address.ts`로 옮겨 하나만 둔다.
4. **제안 상태를 다시 그리는 코드가 두 컴포넌트에 같은 모양으로 있다.** [Grid.tsx](../src/components/sheet/grid/Grid.tsx)와 [run-card/index.tsx](../src/components/sheet/ai/run-card/index.tsx)가 `useDocVersion` + `useStore(ai.overwrites)` + `ai.states(run)`를 똑같이 부른다. `useProposalStates()` hook 하나로 묶으면 숨은 의존 관계가 함수 이름에 드러난다.
5. **모델 선택 흐름이 세 레이어에 흩어져 있다.** 불러오기는 hook, 저장은 `ModelSelect`, 상태는 `AiController`에 있다. 같은 엔드포인트도 GET은 hook에서, POST는 `transport.ts`에서 부른다.
6. **단축키 표가 두 곳에 있다.** [Toolbar.tsx](../src/components/sheet/Toolbar.tsx)의 툴팁 단축키가 `keymap.ts`의 표를 다시 적은 것이다. ⌘/Ctrl 표기도 Toolbar와 StatusLine에 중복된다.
7. **실행 상태 판정이 흩어져 있다.** `status === "review"`가 9곳에 있고, 재시도 가능 여부는 컴포넌트에서 판단한다. `isRunning`처럼 `isReviewing`, `canRetry`를 [run.ts](../src/lib/ai/run.ts)에 둔다.
8. **import 방향 규칙을 도구로 강제하지 않는다.** 지금은 규칙이 지켜지고 있지만 문서로만 정해져 있다. ESLint `no-restricted-imports`로 강제할 수 있다.
9. **[useUndoState.ts](../src/hooks/sheet/useUndoState.ts)는 구독자가 둘 이상이면 첫 번째만 알림을 받는다.** 구독자마다 공유 snapshot을 갱신하는 구조이기 때문이다. 지금은 Toolbar 하나만 써서 드러나지 않는다.
10. **[strings.ts](../src/resources/strings.ts) 머리 주석이 사실과 다르다.** "서버와 브라우저가 같이 쓴다"고 되어 있지만, 지금 서버는 문구를 쓰지 않는다.

---

## 9. 테스트 지도

`npm test`로 모두 실행한다. 테스트 폴더는 `src/lib`와 같은 분류를 따른다.

| 파일                                         | 확인하는 것                                                          |
| -------------------------------------------- | -------------------------------------------------------------------- |
| `sheet/address.test.ts`                      | A1 표기 변환, 범위 계산                                              |
| `sheet/schema.test.ts`                       | 숫자의 기본 정렬, 셀 주소 검증                                       |
| `sheet/document.test.ts`                     | 값·서식 쓰기, **동시 편집 시 평평한 키**                             |
| `sheet/selection.test.ts`                    | 이동·확장, 범위 안 순환, Ctrl+방향키 목적지                          |
| `sheet/keymap.test.ts`                       | 키 → 동작(편집 중/아닐 때, 단축키)                                   |
| `sheet/navigation.test.ts`                   | Tab 다음 Enter, 범위 안 이동, 스크롤 대상                            |
| `controller/sheet-controller.test.ts`        | 편집 명령, 실행 취소 시 선택 복원, presence 알림                     |
| `collab/broadcast-provider.test.ts`          | 탭 간 문서·awareness 동기화                                          |
| `collab/session.test.ts`                     | 모든 탭을 닫은 뒤 복원, 탭별 실행 취소, 저장소 무응답, 시트 분리      |
| `collab/presence.test.ts`                    | 참여자 목록, Web Locks와 대체 방식, 이름·색 충돌                     |
| `collab/undo.test.ts`                        | 내 변경만 되돌리기                                                   |
| `ai/run.test.ts`                             | 스트림 이벤트에 따른 실행 상태 변화, 요청 만들기                     |
| `ai/coedit.test.ts`                          | 충돌 판단, 덮어쓰기 규칙, 겹침                                       |
| `ai/coedit-tabs.test.ts`                     | **README의 세 상황을 실제 세션 두 개로 재현**                        |
| `ai/ai-controller.test.ts`                   | 요청·스트림·타임아웃·적용, 컨트롤러부터 가짜 API까지 전 구간          |
| `ai/messages.test.ts`                        | 오류·경고 코드 → 문구, 프로토콜에 문구가 실리지 않음                 |
| `ai/server.test.ts`                          | 스트림 파서, 프롬프트, 모델 목록, 오류 분류, 실제 SDK + 가짜 API      |
| `ai/route.test.ts`                           | GET/POST의 HTTP 동작과 상태 코드                                     |

---

## 10. 용어

| 용어                     | 뜻                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| A1 표기                  | 열 문자 + 행 번호로 셀을 가리키는 방식. `B2`는 0부터 센 `{ row: 1, col: 1 }`                |
| anchor / focus / active  | 범위를 시작한 꼭짓점 / 움직이는 꼭짓점 / 입력이 들어가는 셀                                |
| 편집 모드 enter / edit   | 바로 타이핑해서 시작(방향키 = 이동) / F2·더블클릭으로 시작(방향키 = 커서 이동)            |
| origin                   | Yjs 트랜잭션에 붙이는 출처 표시. 실행 취소 대상을 가르는 데 쓴다                           |
| awareness                | 저장하지 않고 탭끼리만 공유하는 상태(y-protocols)                                          |
| presence                 | awareness 위에 만든 참여자 정보(이름·색·선택·편집 셀·AI 활동)                              |
| clientID                 | Yjs가 탭(문서 인스턴스)마다 붙이는 번호. 충돌 양보 규칙과 잠금 이름에 쓴다                 |
| run(실행)                | AI 요청 한 번. 대기 → 스트리밍 → 검토 → 적용/버림/중단/오류                                |
| proposal(제안)           | AI가 제안한 셀 하나의 새 값. `before`(요청 때 값)와 `after`를 가진다                       |
| base                     | 요청 시점의 셀 값 모음. 충돌 판단의 기준                                                  |
| same / clean / conflict  | 제안이 이미 반영됨 / 그대로 적용 가능 / 그사이 다른 사람이 바꿈                            |
| overwrite(덮어쓰기)      | 충돌한 셀에 AI 값을 쓰기로 고른 것. 고를 때 본 값에 묶인다                                 |
| scope                    | AI가 편집해도 되는 범위. null이면 시트 전체                                               |
| transport                | AI 요청을 보내고 이벤트를 넘겨주는 함수. 실제는 fetch, 테스트는 가짜                       |
| SheetView                | 컨트롤러가 DOM 작업(스크롤, 포커스, 편집칸 글자)을 맡기는 인터페이스                       |
| bfcache                  | 뒤로/앞으로 가기 때 페이지를 멈춘 채 보관했다가 되살리는 브라우저 캐시                     |
