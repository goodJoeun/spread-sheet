# 발표 스크립트 (20분)

`SheetApp`에서 출발해 화면 트리를 위에서 아래로 내려가면서, 각 지점에 어떤 모듈이 어떤 모양으로 붙어 있고 무슨 일을 하는지 설명합니다.

**이렇게 읽으세요**

- VS Code에서 `Ctrl+Shift+V`(미리보기)로 열고 링크를 클릭하면 그 파일의 그 줄로 넘어갑니다.
- 장면마다 순서가 같습니다.
  - 📂 **열 코드**: 화살표 순서대로 엽니다.
  - 🗣 **말할 내용**: 그대로 읽어도 되게 썼습니다.
  - 🧱 **선언 방식**: 이 지점의 로직이 어떤 모양으로 선언됐는지 짚습니다.
  - 📦 **모듈 설명** (접힘): 파일별로 무슨 일을 하는지, 주요 함수가 무엇인지 정리했습니다. 질문을 받거나 시간이 남을 때 펼칩니다.

<br>

## 목차

| 순서                                                | 내용              | 시간  | 다루는 모듈                                                                                                                    |
| --------------------------------------------------- | ----------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------ |
| [0](#0-먼저-볼-지도)                                | 먼저 볼 지도      | -     | -                                                                                                                              |
| [1](#1-소개-000100)                                 | 소개              | 1분   | -                                                                                                                              |
| [2](#2-데모-100330)                                 | 데모              | 2.5분 | -                                                                                                                              |
| [3](#3-page--sheetapp-330430)                       | page → SheetApp   | 1분   | `page`, `SheetApp`                                                                                                             |
| [4](#4--usesheetsession--createsheetsession-430730) | ① 세션 조립       | 3분   | `session`, `broadcast-provider`, `presence-state`, `presence`, `identity`, `liveness`, `undo`, `schema`, `address`, `document` |
| [5](#5--sheetprovider-7301030)                      | ② SheetProvider   | 3분   | `SheetContext`, `sheet-controller`, `store`, `useStore`                                                                        |
| [6](#6-shell-아래-부품들-10301230)                  | Shell 아래 부품들 | 2분   | `ParticipantList`, `Toolbar`, `FormulaBar`, `collab/messages`, `draft-input`, 구독 hook                                        |
| [7](#7-grid-키-하나가-다른-탭에-닿기까지-12301530)  | Grid              | 3분   | `Grid`, 층 부품, `useCellEditor`, `useGridPointer`, `keymap`, `navigation`, `selection`, `geometry`, `viewport`                |
| [8](#8-aipanel-ai-편집과-공동-편집--15301900)       | AiPanel ⭐        | 3.5분 | `AiPanel`, `AiComposer`, `ai-controller`, `request`, `transport`, `server/*`, `run`, `coedit`, `AiRunCard`, `AiPreview`, `locks` |
| [9](#9-정리-테스트-한계-확장-19002000)              | 정리              | 1분   | 테스트                                                                                                                         |

<br>

## 0. 먼저 볼 지도

화면은 하나의 트리로 감싸지고, 로직은 `lib`에서 만들어져 트리의 **두 이음매(①, ②)** 에 꽂힙니다. 그 아래 부품은 객체를 직접 만들지 않고 꺼내 쓰기만 합니다.

```
[화면 트리: 무엇이 무엇을 감싸나]          [lib: 어디서 만들어져 꽂히나]

page.tsx
└─ SheetApp                                                    §3
   ├─ useSheetSession ◀────────── ① createSheetSession          §4
   │                                 Y.Doc · IndexedDB · BroadcastChannel
   │                                 Presence · UndoManager
   │   (불러오는 중이면 로딩 화면)
   └─ SheetProvider ◀──────────── ② new SheetController(session) §5
      │                              new AiController(...)
      └─ Shell                                                   §6
         ├─ ParticipantList ┐
         ├─ Toolbar         │ 모두 useSheet()로 ②를 꺼내 쓰고
         ├─ FormulaBar      │ 필요한 Store만 구독
         └─ Workspace       │
            ├─ Grid         │                                    §7
            └─ AiPanel      ┘                                    §8

[SheetApp 바깥]
  /api/ai/edit (서버) ── AiController가 fetch로만 연결            §8
```

### lib 폴더의 역할

| 폴더             | 맡은 일                                              | 모르는 것              |
| ---------------- | ---------------------------------------------------- | ---------------------- |
| `lib/sheet`      | 시트 자체: 주소, 규칙, 문서 읽기·쓰기, 선택, 키 해석 | collab, ai, controller |
| `lib/collab`     | 탭 간 동기화, 참여 상태, 탭 생존 확인, 실행 취소     | ai                     |
| `lib/controller` | 시트 명령을 한 곳에 모은 `SheetController`           | ai                     |
| `lib/ai`         | AI 요청 한 번의 생명주기. `server/`는 서버 전용      | -                      |

### 로직의 다섯 가지 선언 방식

각 장의 🧱에서 이 이름으로 부릅니다.

| 모양            | 언제 쓰나                                                               | 예                                                       |
| --------------- | ----------------------------------------------------------------------- | -------------------------------------------------------- |
| **팩토리 함수** | 여러 부품을 조립해 객체 하나로 돌려줄 때                                | `createSheetSession`, `createStore`, `createUndoManager` |
| **클래스**      | 상태를 들고 오래 살며, 구독 시작(`connect`)과 정리(`destroy`)가 있을 때 | `SheetController`, `AiController`, `Presence`            |
| **문서 함수**   | Y.Doc을 첫 인자로 받아 읽고 쓸 때                                       | `getValue(doc, …)`, `writeValues(doc, …, origin)`        |
| **순수 함수**   | 입력만으로 결과가 정해지는 판단                                         | `resolveGridKey`, `applyNavigation`, `classifyCell`      |
| **계약 타입**   | 경계를 넘는 데이터의 모양                                               | `protocol.ts`, `presence-state.ts`, `run.ts`             |

### 데이터는 두 갈래로 흐릅니다

|           | 문서 (Y.Doc)       | 참여 상태 (awareness)                                     |
| --------- | ------------------ | --------------------------------------------------------- |
| 담는 것   | 확정된 셀 값, 서식 | 이름·색, 선택, 편집 중인 셀, 입력 중인 글자, AI 작업 상태 |
| 저장      | IndexedDB에 저장   | 저장 안 함 (탭을 닫으면 사라짐)                           |
| 실행 취소 | 대상               | 대상 아님                                                 |

> 확정되지 않은 것(입력 중인 글자, AI 제안)은 문서에 넣지 않습니다. 이 앱 전체를 관통하는 원칙입니다.

<br>

---

## 1. 소개 (0:00–1:00)

📂 [README.md](../README.md)

🗣 여러 사람이 동시에 편집하고 AI의 도움도 받을 수 있는 웹 스프레드시트를 만들었습니다. 조건은 서버 없이 브라우저 API만으로 공동 편집을 구현하는 것이었습니다. 서버는 AI 호출에만 씁니다.

🗣 데모를 짧게 보여 드린 뒤, 화면이 그려지는 순서대로 내려가면서 각 화면 뒤에 어떤 모듈이 어떻게 붙어 있는지 설명하겠습니다.

<br>

## 2. 데모 (1:00–3:30)

🖥 같은 주소를 탭 두 개(A, B)로 열어 나란히 둡니다. `.env.local`에서 `AI_MOCK=1`을 켜 두면 AI 응답이 안정적입니다.

1. **커서와 입력 중인 값**: A에서 범위를 선택하고 한글을 입력합니다. B에 색 테두리, 이름표, 확정 전인 글자가 보입니다.
2. **AI 충돌**: A에서 AI 편집을 요청하고, 생성 중에 B가 범위 안의 셀을 고칩니다. 그 셀이 주황 테두리(충돌)로 바뀌고 기본으로 건너뜁니다.
3. **셀 잠금**: 잠금을 켜고 다시 요청합니다. B에서 그 셀에 입력하려고 하면 막힙니다.
4. **탭 닫기**: A를 닫습니다. B에서 커서와 잠금이 바로 사라집니다.

<br>

## 3. page → SheetApp (3:30–4:30)

📂 [page.tsx](../src/app/page.tsx#L4) → [SheetApp](../src/components/sheet/SheetApp.tsx#L20) → [로딩 화면](../src/components/sheet/SheetApp.tsx#L23) → [불러온 뒤](../src/components/sheet/SheetApp.tsx#L33)

🗣 page.tsx는 `SheetApp`에 시트 ID `"default"`를 넘겨줍니다. 시트는 하나이고, 같은 주소를 연 탭은 모두 같은 시트를 봅니다.

🗣 `SheetApp`은 두 번 그려집니다. 처음에는 세션이 없어서 껍데기(`Shell`) 안에 "불러오는 중"만 보여 주고, 저장된 내용을 다 불러오면 `SheetProvider`로 감싼 실제 화면을 그립니다.

🗣 이 파일에서 로직이 꽂히는 곳은 `useSheetSession`(①)과 `SheetProvider`(②) 두 군데입니다. 차례로 보겠습니다.

<details>
<summary>📦 모듈 설명: page.tsx · SheetApp.tsx</summary>

#### [page.tsx](../src/app/page.tsx) — 라우트

`app/`은 라우팅만 맡습니다. 시트 ID를 정해 `SheetApp`을 그립니다. 시트 ID는 IndexedDB 이름과 탭 간 채널 이름(`spread-sheet:시트ID`)에 쓰여서, ID가 다르면 다른 시트가 됩니다.

#### [SheetApp.tsx](../src/components/sheet/SheetApp.tsx) — 앱의 뼈대

| 부품                                                        | 하는 일                                                                 |
| ----------------------------------------------------------- | ----------------------------------------------------------------------- |
| [`SheetApp`](../src/components/sheet/SheetApp.tsx#L20)      | 세션을 불러오고, 로딩 화면 또는 실제 화면을 고름                        |
| [`Workspace`](../src/components/sheet/SheetApp.tsx#L45)     | 그리드와 AI 패널을 나란히 둠. `aiPanel` Store를 보고 패널을 붙일지 정함 |
| [`Shell`](../src/components/sheet/SheetApp.tsx#L56)         | 헤더(로고, 제목, 참여자 목록)와 본문 껍데기                             |
| [`StorageNotice`](../src/components/sheet/SheetApp.tsx#L71) | 저장소를 못 열었을 때 띄우는 경고 띠                                    |

`Workspace`를 따로 둔 이유: `SheetApp`은 Provider를 return하는 쪽이라 Provider 바깥에 있어서 `useSheet()`를 부를 수 없습니다.

</details>

<br>

## 4. ① useSheetSession → createSheetSession (4:30–7:30)

### 4-1. hook은 세션의 수명만 관리합니다

📂 [useSheetSession](../src/hooks/sheet/useSheetSession.ts#L11) → [세션 생성](../src/hooks/sheet/useSheetSession.ts#L15) → [whenLoaded](../src/hooks/sheet/useSheetSession.ts#L20) → [정리](../src/hooks/sheet/useSheetSession.ts#L37)

🗣 세션은 채널을 열고 저장소에 연결하는 등 바깥 자원을 잡습니다. 그래서 렌더링 중이 아니라 `useEffect` 안에서 만들고, 컴포넌트가 사라지면 `destroy`로 정리합니다. hook은 만들기, 다 불러올 때까지 기다리기, 정리하기만 하고, 세션이 어떻게 조립되는지는 모릅니다.

🗣 탭을 닫으면(`pagehide`) 바로 참여자 목록에서 빠지고, 뒤로 가기 캐시에서 돌아오면(`pageshow`) 놓친 변경을 다시 받습니다.

### 4-2. createSheetSession: 팩토리 함수가 부품을 조립합니다

📂 [SheetSession 인터페이스](../src/lib/collab/session.ts#L10) → [createSheetSession](../src/lib/collab/session.ts#L43) → [whenLoaded](../src/lib/collab/session.ts#L60) → [돌려주는 객체](../src/lib/collab/session.ts#L78)

🧱 **팩토리 함수.** 부품 다섯 개를 만들어 서로 잇고, 바깥에는 `SheetSession` 인터페이스 하나로 내보냅니다. 부품을 어떻게 이었는지는 이 함수 안에만 있습니다.

```
createSheetSession(sheetId)
├─ Y.Doc                     셀 값과 서식의 원본
├─ IndexeddbPersistence      브라우저에 저장, 열 때 불러옴
├─ BroadcastChannelProvider  다른 탭과 주고받음
├─ Awareness → Presence      이름·색·커서·입력 중 글자 (저장 안 함)
│              └─ TabLiveness   탭이 닫혔는지 감지
└─ UndoManager               이 탭의 편집만 실행 취소
```

🗣 저장과 전송을 문서와 따로 붙였기 때문에, 서버로 넓힐 때 이 함수에서 전송 부품 하나만 바꾸면 됩니다.

🗣 y-indexeddb는 불러오기 성공만 알리고 실패는 알리지 않습니다. 처음엔 성공만 기다려서, 저장소가 막힌 브라우저에서 로딩 화면이 끝나지 않았습니다. 그래서 성공, 실패, 5초 경과 중 먼저 오는 것으로 결정합니다.

📂 [돌려주는 객체](../src/lib/collab/session.ts#L78) → [useSheetSession](../src/hooks/sheet/useSheetSession.ts#L28) → [SheetProvider](../src/components/sheet/SheetContext.tsx#L29) → [ControllerSession](../src/lib/controller/sheet-controller.ts#L45)

🗣 돌려주는 객체는 두 갈래로 쓰입니다. 수명에 관한 값은 `useSheetSession` hook만 쓰고, 부품은 `SheetApp` → `SheetProvider`를 거쳐 컨트롤러와 화면 부품이 씁니다.

```
createSheetSession()이 돌려주는 객체
├─ 수명 → useSheetSession
│   ├─ whenLoaded / whenPersisted   로딩 화면 끝내기, 저장 불가 안내 띄우기·거두기
│   ├─ leave / rejoin               pagehide / pageshow
│   ├─ destroy                      effect 정리
│   └─ sheetId                      다른 시트의 세션을 돌려주지 않도록 확인
└─ 부품 → SheetApp → SheetProvider → 컨트롤러 · 화면
    ├─ doc          쓰기: 컨트롤러 (문서 함수로) / 읽기: 화면
    ├─ presence     알리기: 컨트롤러 · AI 컨트롤러 / 목록 구독: 화면
    ├─ undoManager  실행: 컨트롤러 / 버튼 상태: 툴바
    └─ awareness    세션 밖에서는 쓰지 않음 (presence가 감쌈)
```

| 값              | 쓰는 곳                                                                                                                                                                                                                                                                                                                  | 어떻게                                                                                                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sheetId`       | [useSheetSession:53](../src/hooks/sheet/useSheetSession.ts#L53)                                                                                                                                                                                                                                                          | 들고 있는 세션의 `sheetId`가 지금 인자와 같을 때만 돌려줌. 시트가 바뀐 직후 새 세션이 준비되기 전에 이전 시트가 보이지 않음                                                                                      |
| `whenLoaded`    | [useSheetSession:28](../src/hooks/sheet/useSheetSession.ts#L28)                                                                                                                                                                                                                                                          | resolve되기 전엔 `null`이라 [SheetApp](../src/components/sheet/SheetApp.tsx#L23)이 로딩 화면을 그림. 결과는 `storage`로 넘겨 `unavailable`이면 [저장 불가 안내](../src/components/sheet/SheetApp.tsx#L36)를 띄움 |
| `whenPersisted` | [useSheetSession:32](../src/hooks/sheet/useSheetSession.ts#L32)                                                                                                                                                                                                                                                          | 저장소가 늦게 열리면 `storage`를 `ready`로 바꿔 안내를 거둠                                                                                                                                                      |
| `doc`           | [SheetController](../src/lib/controller/sheet-controller.ts#L308), [AiController](../src/components/sheet/SheetContext.tsx#L31), [Grid](../src/components/sheet/grid/Grid.tsx#L39), [FormulaBar](../src/components/sheet/FormulaBar.tsx#L16), [Toolbar](../src/components/sheet/toolbar/index.tsx#L75)                   | 쓰기는 컨트롤러가 `toggleFormat(doc, range, key, EditOrigin.User)`처럼 문서 함수에 넘김. 화면은 `useDocVersion(doc)`으로 변경을 구독하고 `getValue`·`getFormat`으로 읽음                                         |
| `presence`      | [SheetController.connect](../src/lib/controller/sheet-controller.ts#L99), [AiController](../src/lib/ai/ai-controller.ts#L354), [Grid](../src/components/sheet/grid/Grid.tsx#L42), [AiComposer](../src/components/sheet/ai/AiComposer.tsx#L32), [ParticipantList](../src/components/sheet/participant-list/index.tsx#L18) | 컨트롤러는 선택·편집 중인 셀·입력 중 글자를, AI 컨트롤러는 AI 작업 범위(`setAi`)를 알림. 화면은 `useParticipants(presence)`로 참여자 목록을 구독하고, 이름 바꾸기는 `presence.rename`                            |
| `undoManager`   | [SheetController](../src/lib/controller/sheet-controller.ts#L332), [Toolbar](../src/components/sheet/toolbar/index.tsx#L78)                                                                                                                                                                                              | 컨트롤러가 `undo()`·`redo()`를 부르고, 스택 이벤트로 [선택을 변경 위치로 되돌림](../src/lib/controller/sheet-controller.ts#L127). 툴바는 `useUndoState`로 버튼을 켜고 끔                                         |
| `awareness`     | 없음                                                                                                                                                                                                                                                                                                                     | 인터페이스에는 있지만 세션 밖에서 직접 쓰지 않음. provider와 presence가 안에서 쓰고, 참여 상태는 모두 `presence`를 거침                                                                                          |
| `leave()`       | [useSheetSession:38](../src/hooks/sheet/useSheetSession.ts#L38)                                                                                                                                                                                                                                                          | `pagehide`에서 참여자 목록에서 바로 빠짐                                                                                                                                                                         |
| `rejoin()`      | [useSheetSession:40](../src/hooks/sheet/useSheetSession.ts#L40)                                                                                                                                                                                                                                                          | `pageshow`가 캐시 복원(`persisted`)일 때 놓친 변경을 다시 받고 다시 참여                                                                                                                                         |
| `destroy()`     | [useSheetSession:49](../src/hooks/sheet/useSheetSession.ts#L49)                                                                                                                                                                                                                                                          | effect 정리 함수. 시트가 바뀌거나 화면에서 사라질 때 부품을 모두 닫음                                                                                                                                            |

🗣 컨트롤러는 `SheetSession` 전체가 아니라 `ControllerSession`(`doc`, `undoManager`, `presence`의 메서드 몇 개)만 받습니다. 그래서 테스트에서는 세션을 다 만들지 않고 가짜 presence만 넘기면 됩니다.

📂 [leave · rejoin · destroy](../src/lib/collab/session.ts#L86) → [Presence.join / leave](../src/lib/collab/presence.ts#L59) → [provider.resync](../src/lib/collab/broadcast-provider.ts#L50) → [provider.destroy](../src/lib/collab/broadcast-provider.ts#L148) → [TabLiveness](../src/lib/collab/liveness.ts#L18)

🗣 세 메서드는 "얼마나 떠나는가"가 다릅니다. `leave`는 목록에서만 빠지고, `rejoin`은 그 상태에서 돌아오고, `destroy`는 모든 부품을 닫습니다.

```
leave()     목록에서만 빠짐. 채널·저장소·잠금은 그대로
└─ presence.leave()
   └─ awareness.setLocalState(null)   → provider가 "내 상태 없음"을 방송 → 다른 탭 목록에서 바로 빠짐

rejoin()    leave 상태에서 돌아옴
├─ provider.resync()                  합류 절차(announce)를 다시 밟음
│   ├─ Step1 · Step2                  상태 벡터와 변경을 보내 멈춰 있던 동안 놓친 변경을 주고받음
│   └─ 참여 상태 요청                  다른 탭의 이름·커서를 다시 받음
└─ presence.join()
   ├─ liveness.hold()                 생존 확인 잠금 (이미 쥐고 있으면 바로 넘어감)
   ├─ avoidTaken()                    그사이 같은 이름·색을 쓰는 탭이 생겼으면 바꿈
   └─ publish()                       내 상태를 다시 공개

destroy()   모든 부품을 닫음. 두 번 불러도 한 번만 실행
├─ undoManager.destroy()              문서 구독 해제
├─ provider.destroy()                 내 참여 상태 제거를 방송한 뒤 채널을 닫음
├─ presence.destroy()                 awareness 구독 해제, 잠금을 놓아 다른 탭이 퇴장을 알아챔
├─ awareness.destroy()
├─ persistence.destroy()              저장소가 열려 있을 때만 끝나기를 기다림
└─ doc.destroy()                      마지막에 문서를 닫음
```

🗣 탭을 닫을 때 `destroy`가 아니라 `leave`만 부르는 이유는 `pagehide`가 탭을 닫을 때만 오는 게 아니기 때문입니다. 뒤로 가기 캐시에 들어갈 때도 오는데, 이때 부품을 다 닫으면 돌아왔을 때 쓸 세션이 없습니다. 그래서 목록에서만 빠지고, 진짜로 닫히면 브라우저가 페이지를 버리면서 Web Locks 잠금도 풀어 줍니다.

🗣 `destroy`의 순서에도 이유가 있습니다. provider는 awareness를 통해 "나 나감"을 방송하므로 awareness보다 먼저 닫습니다. y-indexeddb의 `destroy`는 저장소가 열리지 않은 상태면 끝나지 않으므로, `ready`일 때만 기다립니다.

🗣 세 메서드는 모두 `useSheetSession`에서만 부르고, 브라우저나 React 이벤트에 걸려 있습니다.

| 메서드      | 트리거                                                                                 | 사용자가 하는 일                                                                       |
| ----------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `leave()`   | [`pagehide`](../src/hooks/sheet/useSheetSession.ts#L38)                                | 탭 닫기, 새로고침, 다른 페이지로 이동                                                  |
| `rejoin()`  | [`pageshow`에서 `event.persisted === true`](../src/hooks/sheet/useSheetSession.ts#L40) | 뒤로/앞으로 가기로 돌아왔는데, 브라우저가 캐시(bfcache)에 얼려 둔 페이지를 되살린 경우 |
| `destroy()` | [effect 정리 함수](../src/hooks/sheet/useSheetSession.ts#L49)                          | `SheetApp`이 화면에서 사라지거나 `sheetId`가 바뀔 때                                   |

```
처음 열기          createSheetSession → presence.join()      세 메서드 모두 안 불림
탭 닫기·새로고침   pagehide → leave() → 브라우저가 페이지를 버림
                   destroy()는 안 불림. 채널·저장소·Web Locks 잠금은 브라우저가 정리
                   새로고침이면 새 페이지에서 "처음 열기"부터
다른 사이트 → 뒤로 pagehide → leave() → 캐시에 얼려 둠 (세션 객체는 메모리에 남음)
                   → pageshow(persisted) → rejoin() → 놓친 변경을 받고 다시 참여
                   캐시에 안 넣었으면 그냥 새로 불러오므로 "처음 열기"와 같음
탭 전환·최소화     pagehide가 오지 않음 (visibilitychange는 다른 이벤트) → 아무것도 안 불림
개발 모드          StrictMode가 effect를 한 번 정리하고 다시 돌림 → create → destroy() → create
                   Fast Refresh로 effect가 다시 돌 때도 같음
```

🗣 지금은 [page.tsx](../src/app/page.tsx)가 `sheetId="default"` 하나만 써서, `destroy()`는 실제로 개발 모드에서만 불립니다. 시트를 고르는 화면이 생겨 `sheetId`가 바뀌면 이전 세션을 닫는 데 쓰입니다. 탭을 닫을 때는 React가 정리 함수를 돌릴 틈이 없으므로, 다른 탭 목록에서 바로 빠지게 하는 일은 `pagehide`에 붙은 `leave()`가 맡습니다.

### 4-3. 탭끼리 맞추는 방법

📂 [broadcast-provider.ts 상단 주석](../src/lib/collab/broadcast-provider.ts#L7) → [announce](../src/lib/collab/broadcast-provider.ts#L55) → [handleDocUpdate](../src/lib/collab/broadcast-provider.ts#L110)

🗣 메모리를 공유하는 게 아니라, 탭마다 사본을 갖고 변경 기록을 주고받아 같은 상태로 수렴합니다. 탭끼리 공유하는 건 브라우저의 `BroadcastChannel` 하나이고, provider는 탭마다 하나씩 있습니다.

```
탭 A                     탭 B                     탭 C
┌──────────┐            ┌──────────┐            ┌──────────┐
│ Y.Doc    │            │ Y.Doc    │            │ Y.Doc    │
│ Provider │            │ Provider │            │ Provider │
└────┬─────┘            └────┬─────┘            └────┬─────┘
     └──────── BroadcastChannel("spread-sheet:시트ID") ─┘
```

🗣 새 탭은 "어디까지 가지고 있다"(상태 벡터)를 먼저 보내고, 빠진 기록만 받습니다. 그 뒤로는 편집할 때마다 변경을 보냅니다. [111줄](../src/lib/collab/broadcast-provider.ts#L111)에서 받은 변경은 다시 보내지 않습니다. 다시 보내면 탭끼리 끝없이 주고받기 때문입니다.

📂 [onmessage](../src/lib/collab/broadcast-provider.ts#L42) → [receive](../src/lib/collab/broadcast-provider.ts#L76) → [readSyncMessage](../src/lib/collab/broadcast-provider.ts#L85) → [useDocVersion](../src/hooks/sheet/useDocVersion.ts#L40) → [Grid](../src/components/sheet/grid/Grid.tsx#L39) → [GridCells](../src/components/sheet/grid/GridCells.tsx#L57)

🗣 받는 쪽에서 값을 꺼내는 건 provider가 아닙니다. provider는 받은 변경을 문서에 넣기만 하고, 화면 부품이 그릴 때 `Y.Doc`에서 직접 읽습니다.

```
① 채널 메시지 도착       channel.onmessage → receive()
② 문서에 반영           readSyncMessage(..., doc, origin = provider)
                         └─ Y.applyUpdate → 이 탭의 Y.Doc이 바뀌고 "update" 발생
③ "update"를 받는 리스너
   ├─ handleDocUpdate    origin이 provider라 return (다시 방송 안 함)
   └─ useDocVersion      version++ → 구독 중인 컴포넌트에 알림
④ 다시 그림             Grid: version = useDocVersion(doc) → <GridCells doc version />
⑤ 값 읽기 (get)         GridCells: valuesOf(doc).get("B2"), getFormat(doc, coord)
                         FormulaBar: getValue(doc, selection.active)
```

🗣 셀 값을 React state로 복사하지 않고 "바뀌었다"는 신호(버전 번호)만 받습니다. 원본이 `Y.Doc` 하나라 화면과 어긋날 일이 없고, 내 탭의 편집이든 다른 탭에서 온 변경이든 같은 "update" 한 길로 들어오므로 화면은 둘을 구분하지 않습니다.

### 4-4. 문서의 모양: 평평한 키와 문서 함수

📂 [schema.ts](../src/lib/sheet/schema.ts#L18) → [document.ts 상단 결정](../src/lib/sheet/document.ts#L15) → [EditOrigin](../src/lib/sheet/document.ts#L27) → [writeValues](../src/lib/sheet/document.ts#L79)

```
Y.Doc
├─ "values"  (Y.Map<string>)          "B2" → "100",  "C3" → "합계"
└─ "formats" (Y.Map<true | string>)   "B2.bold" → true,  "C3.align" → "center"
```

🗣 셀마다 Map을 따로 두지 않고 `"B2"` 같은 평평한 키로 저장합니다. 빈 셀에 두 사람이 동시에 처음 입력하면 각자 새 Map을 만들고, 그중 하나가 통째로 사라질 수 있기 때문입니다.

🧱 **문서 함수.** Y.Doc을 감싸는 클래스를 만들지 않고, `writeValues(doc, writes, origin)`처럼 문서를 첫 인자로 받는 함수를 썼습니다. 문서를 고치는 길은 이 파일 하나이고, 모든 쓰기에 출처(`user-edit`, `ai-apply`)를 붙입니다. 실행 취소는 이 출처만 대상으로 해서, 다른 탭의 입력은 지우지 않습니다.

### 4-5. 참여 상태: 받은 값은 들어오는 곳에서 한 번만 맞춥니다

📂 [PresenceState 계약](../src/lib/collab/presence-state.ts#L28) → [normalizePresenceState](../src/lib/collab/presence-state.ts#L97) → [Presence](../src/lib/collab/presence.ts#L24) → [TabLiveness](../src/lib/collab/liveness.ts#L18)

🧱 **계약 타입 + 클래스.** 참여 상태의 모양은 `presence-state.ts`에 계약으로 두고, `Presence` 클래스가 그 계약을 지키며 보내고 받습니다. 다른 탭은 이전 버전 코드로 돌 수도 있어서, 받은 값은 형식을 확인하고 좌표를 시트 안으로 맞춘 뒤에 참여자 목록에 넣습니다. 목록을 쓰는 화면은 다시 확인하지 않아도 됩니다.

🗣 탭이 닫혔는지는 Web Locks로 알아챕니다. 처음 계획한 주기적 신호(heartbeat) 방식은 백그라운드 탭의 타이머가 느려져서, 살아 있는 사람이 목록에서 깜빡였기 때문에 바꿨습니다.

<details>
<summary>📦 모듈 설명: lib/collab (session · broadcast-provider · presence-state · presence · identity · liveness · undo)</summary>

#### [session.ts](../src/lib/collab/session.ts) — 협업 부품의 조립과 수명

`createSheetSession()`이 시트 하나에 필요한 객체를 만들고 연결합니다. 다른 협업 모듈을 묶어 수명을 관리하는 진입점입니다.

| 멤버                                          | 하는 일                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------ |
| `doc`, `awareness`, `presence`, `undoManager` | 조립한 부품을 그대로 내보냄                                              |
| `whenLoaded`                                  | 불러오기 성공(`ready`) 또는 실패·5초 경과(`unavailable`) 중 먼저 오는 것 |
| `whenPersisted`                               | 저장소가 늦게라도 준비되면 알림. 저장 불가 안내를 거둘 때 씀             |
| `leave()` / `rejoin()` / `destroy()`          | 퇴장 / 뒤로·앞으로 가기 캐시에서 복귀 / 자원 정리                        |

#### [broadcast-provider.ts](../src/lib/collab/broadcast-provider.ts) — 탭 간 전송

`BroadcastChannelProvider`가 같은 시트의 탭끼리 메시지를 주고받습니다. 데이터 전달만 맡고, 편집 규칙이나 화면 표시는 모릅니다.

| 메서드                                                                  | 하는 일                                                                     |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [`announce`](../src/lib/collab/broadcast-provider.ts#L55)               | 합류 알림. Step1(상태 벡터) → Step2(변경 내용) → 참여 상태 요청 순서로 보냄 |
| [`receive`](../src/lib/collab/broadcast-provider.ts#L76)                | 받은 메시지를 종류(문서 동기화, 참여 상태, 참여 상태 요청)에 따라 처리      |
| [`handleDocUpdate`](../src/lib/collab/broadcast-provider.ts#L110)       | 내 탭의 문서 변경만 방송. 받은 변경은 다시 보내지 않음                      |
| [`handleAwarenessUpdate`](../src/lib/collab/broadcast-provider.ts#L120) | 내 참여 상태만 방송. 남의 상태를 대신 보내면 떠난 사람이 되살아남           |
| `resync()`                                                              | 캐시에서 복귀한 탭이 놓친 변경을 다시 받음                                  |

메시지 형식은 y-websocket과 같은 y-protocols 인코딩이라, 번호가 두 겹입니다.

- Step1 메시지: `[0 바깥: 문서 동기화][0 안쪽: SyncStep1][상태 벡터]`
- Step2 메시지: `[0 바깥: 문서 동기화][1 안쪽: SyncStep2][변경 내용]`

#### [presence-state.ts](../src/lib/collab/presence-state.ts) — 참여 상태의 계약

각 탭의 이름표(`PresenceState`)에는 `user`, `selection`, `editing`, `draft`, `ai` 다섯 가지가 들어 있습니다. 여기에 `clientId`와 `isSelf`를 더한 것이 화면에서 쓰는 `Participant`입니다.

| 함수                                                                | 하는 일                                                                                                                                                                      |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`isPresenceState`](../src/lib/collab/presence-state.ts#L76)        | 다른 탭에서 온 데이터의 형식 검사                                                                                                                                            |
| [`normalizePresenceState`](../src/lib/collab/presence-state.ts#L97) | 좌표를 시트 안으로 맞추고, 이전 버전에서 빠진 필드를 기본값으로 채움. AI 범위가 시트와 전혀 안 겹치면 그 AI 상태를 지움(`null`로 바꾸면 "시트 전체"라는 다른 뜻이 되기 때문) |

#### [presence.ts](../src/lib/collab/presence.ts) — 참여 상태 관리

`presence-state`가 데이터의 모양과 정리 규칙이라면, `Presence`는 그 데이터를 유지하고 알리는 동작입니다.

| 메서드                                                                                                      | 하는 일                                                                  |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [`join`](../src/lib/collab/presence.ts#L59) / [`leave`](../src/lib/collab/presence.ts#L71)                  | 생존 확인 잠금을 먼저 쥔 뒤 내 상태 공개 / 제거                          |
| [`setSelection`](../src/lib/collab/presence.ts#L78) · [`setEditing`](../src/lib/collab/presence.ts#L84)     | 선택 위치와 편집 위치 알림                                               |
| [`setDraft`](../src/lib/collab/presence.ts#L92)                                                             | 입력 중인 글자를 최대 1,000자까지 알림                                   |
| [`setAi`](../src/lib/collab/presence.ts#L100)                                                               | AI 작업 상태(범위, 잠금 여부) 알림                                       |
| [`rename`](../src/lib/collab/presence.ts#L106)                                                              | 이름 변경                                                                |
| [`getParticipants`](../src/lib/collab/presence.ts#L114) · [`subscribe`](../src/lib/collab/presence.ts#L117) | 참여자 목록 조회와 구독. 나를 먼저, 그다음 이름순                        |
| [`resolveConflicts`](../src/lib/collab/presence.ts#L166)                                                    | 이름·색이 겹치면 `clientId`가 큰 쪽이 양보. 서로 묻지 않아도 한쪽만 바뀜 |

#### [identity.ts](../src/lib/collab/identity.ts) — 표시용 이름과 색

| 함수                                                                                                    | 하는 일                                                               |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| [`randomName`](../src/lib/collab/identity.ts#L18)                                                       | 형용사와 동물 이름을 조합                                             |
| [`pickColor`](../src/lib/collab/identity.ts#L23)                                                        | 아직 안 쓰인 색을 먼저 고름                                           |
| [`normalizeName`](../src/lib/collab/identity.ts#L34)                                                    | 공백 정리, 최대 20자                                                  |
| [`loadTabUser`](../src/lib/collab/identity.ts#L40) · [`saveTabUser`](../src/lib/collab/identity.ts#L62) | `sessionStorage`에 읽고 저장. 새로고침해도 같은 사람, 새 탭은 새 사람 |

로그인이나 권한을 다루는 인증 기능은 아닙니다.

#### [liveness.ts](../src/lib/collab/liveness.ts) — 탭 종료 감지

`TabLiveness`가 Web Locks로 탭이 닫혔는지 알아챕니다.

1. 각 탭이 자기 `clientId` 이름의 잠금을 쥡니다([`hold`](../src/lib/collab/liveness.ts#L30)).
2. 다른 탭은 그 잠금을 얻을 때까지 기다립니다([`watch`](../src/lib/collab/liveness.ts#L47)).
3. 탭이 닫혀 잠금이 풀리면, 기다리던 탭이 알아채고 그 참여자를 지웁니다.

Web Locks가 없는 환경에서는 awareness의 기본 타임아웃 방식을 그대로 씁니다.

#### [undo.ts](../src/lib/collab/undo.ts) — 탭별 실행 취소

[`createUndoManager()`](../src/lib/collab/undo.ts#L10)가 Yjs 실행 취소 관리자를 만듭니다.

- 이 탭의 `user-edit`, `ai-apply` 출처만 추적하고, 다른 탭에서 온 변경은 빼놓습니다.
- `captureTimeout: 0`으로 빠르게 이어진 편집도 합치지 않습니다. 동작 하나가 정확히 한 단계입니다.

</details>

<details>
<summary>📦 모듈 설명: lib/sheet 데이터 모델 (schema · address · document)</summary>

시트 내용의 원본은 Y.Doc 안의 Map 두 개이고, 그 위의 모든 읽기와 쓰기는 이 세 파일을 거칩니다.

#### [schema.ts](../src/lib/sheet/schema.ts) — 시트의 규칙

시트 크기, 서식의 종류와 형식, 기본 정렬, 주소 검증을 한 곳에 모읍니다. 화면, AI 프롬프트, 서버 검증이 같은 규칙을 씁니다. Yjs를 모르게 따로 둬서, 선택이나 키 해석 같은 순수 로직이 Yjs를 끌어오지 않습니다.

| 항목                                                                                                | 내용                                                      |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| [`ROW_COUNT`, `COL_COUNT`](../src/lib/sheet/schema.ts#L18)                                          | 100행 × 26열                                              |
| [`isInSheet`](../src/lib/sheet/schema.ts#L26), [`clipToSheet`](../src/lib/sheet/schema.ts#L31)      | 좌표·범위가 시트 안인지, 시트 안으로 자르기               |
| [`FORMAT_KEYS`](../src/lib/sheet/schema.ts#L37), [`STYLE_KEYS`](../src/lib/sheet/schema.ts#L41)     | 켜고 끄는 서식(굵게 등)과 값을 갖는 서식(색, 정렬)을 나눔 |
| [`isSheetCellA1`](../src/lib/sheet/schema.ts#L54), [`isValidStyle`](../src/lib/sheet/schema.ts#L68) | 다른 탭이나 AI에서 온 주소·서식 값 검증                   |

#### [address.ts](../src/lib/sheet/address.ts) — 좌표와 A1 표기

아무것도 import하지 않는 순수 함수 모듈입니다. 주소를 두 모양으로 다룹니다.

- A1 표기(`"B2"`, `"A1:C3"`): 사람이 읽는 모양. 문서의 키, AI와의 통신, 화면 표시에 씀
- 좌표(`{ row, col }`): 계산하는 모양. 선택, 이동, 위치 계산에 씀 (행이 0부터 시작)

| 함수                                                                                               | 하는 일                                                                   |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [`colToLabel`](../src/lib/sheet/address.ts#L23) · [`labelToCol`](../src/lib/sheet/address.ts#L38)  | `26 ↔ "AA"`. 엑셀 열 이름엔 0에 해당하는 글자가 없어서 일반 26진법과 다름 |
| [`toA1`](../src/lib/sheet/address.ts#L48) · [`parseA1`](../src/lib/sheet/address.ts#L53)           | `{1,1} ↔ "B2"`. `parseA1`은 공백, 소문자, `$B$2`까지 받아 줌              |
| [`normalizeRange`](../src/lib/sheet/address.ts#L63)                                                | 두 꼭짓점을 어떤 순서로 받아도 왼쪽 위·오른쪽 아래로 정리                 |
| [`parseRangeA1`](../src/lib/sheet/address.ts#L71) · [`rangeToA1`](../src/lib/sheet/address.ts#L81) | `"A1:C3" ↔ CellRange`. 셀 하나면 `"B2"`로 짧게 씀                         |
| [`rangeContains`](../src/lib/sheet/address.ts#L88)                                                 | 셀이 범위 안인지                                                          |
| [`boundingRange`](../src/lib/sheet/address.ts#L93)                                                 | 여러 셀을 감싸는 가장 작은 사각형. AI가 바꾼 셀들의 영역을 구할 때 씀     |
| [`forEachCell`](../src/lib/sheet/address.ts#L109)                                                  | 범위 안 셀을 행 순서로 돌기                                               |
| [`intersectRanges`](../src/lib/sheet/address.ts#L118)                                              | 두 범위가 겹치는 부분. 잠금 범위 판정에 씀                                |

#### [document.ts](../src/lib/sheet/document.ts) — Y.Doc 읽기와 쓰기

| 함수                                                                                                   | 하는 일                                                                                                   |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| [`EditOrigin`](../src/lib/sheet/document.ts#L27)                                                       | 쓰기 출처 `user-edit`, `ai-apply`. AI 기능보다 먼저 선언함(실행 취소 기준은 나중에 바꾸기 어려워서)       |
| [`valuesOf`](../src/lib/sheet/document.ts#L34) · [`formatsOf`](../src/lib/sheet/document.ts#L39)       | 값 Map, 서식 Map을 꺼냄                                                                                   |
| [`getValue`](../src/lib/sheet/document.ts#L47)                                                         | 셀 하나의 값. 없으면 `""`                                                                                 |
| [`getFormat`](../src/lib/sheet/document.ts#L52)                                                        | `"B2.bold"`, `"B2.color"`처럼 흩어진 서식을 객체 하나로 모음                                              |
| [`writeValues`](../src/lib/sheet/document.ts#L79)                                                      | 여러 셀을 한 트랜잭션으로 씀. 시트 밖 셀과 값이 같은 셀은 건너뛰고, `""`면 키를 지움. 바뀐 셀 수를 돌려줌 |
| [`setValue`](../src/lib/sheet/document.ts#L96) · [`clearValues`](../src/lib/sheet/document.ts#L101)    | 셀 하나 쓰기 / 범위 값 지우기. 둘 다 `writeValues`를 거침                                                 |
| [`setFormat`](../src/lib/sheet/document.ts#L122) · [`toggleFormat`](../src/lib/sheet/document.ts#L144) | 범위 전체의 서식을 켜고 끔                                                                                |
| [`setStyle`](../src/lib/sheet/document.ts#L156) · [`commonStyle`](../src/lib/sheet/document.ts#L179)   | 값 서식(색, 정렬) 지정 / 범위가 모두 같은 값이면 그 값                                                    |
| [`clearFormats`](../src/lib/sheet/document.ts#L194)                                                    | 서식만 지우고 값은 남김                                                                                   |

</details>

<br>

## 5. ② SheetProvider (7:30–10:30)

### 5-1. Provider는 화면을 그리지 않고, 명령 객체를 만들어 내려 줍니다

📂 [SheetProvider](../src/components/sheet/SheetContext.tsx#L22) → [컨트롤러 생성](../src/components/sheet/SheetContext.tsx#L29) → [connect](../src/components/sheet/SheetContext.tsx#L35) → [Context 반환](../src/components/sheet/SheetContext.tsx#L42) → [useSheet](../src/components/sheet/SheetContext.tsx#L45)

🗣 `SheetProvider`가 return하는 것은 `<SheetContext>{children}</SheetContext>`뿐입니다. 화면 부품은 `SheetApp`이 `children`으로 넣어 줍니다. Provider는 세션을 받아 명령 객체 두 개를 만들고 Context로 내려 줍니다.

```ts
const controller = new SheetController(session);
const ai = new AiController(session.doc, controller, fetchAiTransport, session.presence);
```

🗣 객체는 `useMemo`로 만들고, 구독 시작(`connect`)은 `useEffect`에서 합니다. React 개발 모드가 객체를 두 번 만들어도 구독이 새지 않게 하기 위해서입니다.

### 5-2. 컨트롤러는 필요한 것만 좁은 인터페이스로 받습니다

📂 [ControllerSession](../src/lib/controller/sheet-controller.ts#L45) → [SheetView](../src/lib/controller/sheet-controller.ts#L36) → [AiSheetBinding · AiPresenceBinding](../src/lib/ai/ai-controller.ts#L47) → [AiController 생성자](../src/lib/ai/ai-controller.ts#L78)

🧱 **클래스 + 좁은 인터페이스 주입.** 두 컨트롤러는 다른 모듈의 클래스를 import하지 않고, 생성자에서 "이런 메서드가 있는 것"을 받습니다.

| 받는 쪽           | 받는 것                                                         | 실제로 넣는 것             |
| ----------------- | --------------------------------------------------------------- | -------------------------- |
| `SheetController` | `ControllerSession` (doc, undoManager, presence의 메서드 몇 개) | `session`                  |
| `SheetController` | `SheetView` (스크롤, 포커스, 편집칸 글자)                       | Grid가 나중에 붙여 줌 (§7) |
| `AiController`    | `AiSheetBinding` (확정, 선택, 포커스)                           | `controller`               |
| `AiController`    | `AiTransport` (요청 함수)                                       | `fetchAiTransport`         |
| `AiController`    | `AiPresenceBinding` (AI 상태 알리기)                            | `session.presence`         |

🗣 이렇게 한 이유는 두 가지입니다. `lib/ai`가 `SheetController`를 몰라도 되니 AI 기능을 빼도 시트는 그대로 돕니다. 그리고 테스트에서 가짜 객체를 넣을 수 있어서, 컨트롤러를 화면 없이, 네트워크 없이 테스트할 수 있습니다.

### 5-3. 컨트롤러의 상태는 Store 필드로 드러납니다

📂 [SheetController의 Store 필드](../src/lib/controller/sheet-controller.ts#L77) → [AiController의 Store 필드](../src/lib/ai/ai-controller.ts#L61) → [store.ts](../src/lib/store.ts#L10) → [useStore](../src/hooks/useStore.ts#L5)

🧱 **팩토리 함수(Store).** 컨트롤러는 화면이 알아야 할 상태를 `readonly selection = createStore(...)`처럼 공개 필드로 둡니다. 컨트롤러 안에서는 `get()`으로 바로 읽고, 화면은 `useStore`로 구독만 합니다.

🗣 키를 누르는 순간에는 다음 화면이 그려지기를 기다리지 않고 최신 선택 위치를 바로 읽어야 합니다. 그래서 React state가 아니라 컨트롤러 안에 둡니다. 필요한 기능은 읽기, 바꾸기, 알리기뿐이라 라이브러리 없이 직접 만들었고, 구독은 React 표준 방식인 `useSyncExternalStore`로 합니다.

<details>
<summary>📦 모듈 설명: SheetContext · sheet-controller · store · useStore</summary>

#### [SheetContext.tsx](../src/components/sheet/SheetContext.tsx) — 명령 객체 공급

| 멤버                                                                                                                            | 하는 일                                                               |
| ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| [`SheetProvider`](../src/components/sheet/SheetContext.tsx#L22)                                                                 | `SheetController`, `AiController`, `aiPanel` Store를 만들고 `connect` |
| [`useSheet`](../src/components/sheet/SheetContext.tsx#L45)                                                                      | `{ session, controller, ai, aiPanel }`을 꺼냄. Provider 밖이면 오류   |
| [`useSelection`](../src/components/sheet/SheetContext.tsx#L51) · [`useEditState`](../src/components/sheet/SheetContext.tsx#L55) | 자주 쓰는 Store 구독의 줄임                                           |

처음엔 props로 넘기고 Grid가 ref로 명령을 노출했는데, 툴바와 참여자 목록도 같은 명령이 필요해지면서 Context로 바꿨습니다.

#### [sheet-controller.ts](../src/lib/controller/sheet-controller.ts) — 시트 명령을 한 곳에

키보드, 마우스, 툴바, 수식 입력줄, AI 패널이 모두 이 클래스의 같은 명령을 부릅니다. 그래서 "편집 중이면 먼저 확정한다", "잠긴 셀이면 막는다" 같은 규칙이 한 곳에만 있습니다. 그리드에 붙이기 전에 독립 클래스로 먼저 만들고, 테스트로 동작을 고정했습니다.

| 묶음      | 메서드                                                                                                                                                                                                                                                               | 하는 일                                                                     |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 상태      | `selection`, `edit`, `draft`, `lockNotice`                                                                                                                                                                                                                           | 화면이 구독하는 Store                                                       |
| 연결      | [`connect`](../src/lib/controller/sheet-controller.ts#L99)                                                                                                                                                                                                           | 선택·편집이 바뀌면 참여 상태로 알림. 실행 취소 항목에 선택 위치를 함께 저장 |
|           | [`attachView`](../src/lib/controller/sheet-controller.ts#L139)                                                                                                                                                                                                       | Grid가 DOM 일(`SheetView`)을 붙임                                           |
| 편집      | [`startEdit`](../src/lib/controller/sheet-controller.ts#L162)                                                                                                                                                                                                        | 잠긴 셀인지 확인하고 편집 시작                                              |
|           | [`draftChanged`](../src/lib/controller/sheet-controller.ts#L176) · [`replaceDraft`](../src/lib/controller/sheet-controller.ts#L185)                                                                                                                                  | 입력 중인 글자를 Store와 참여 상태에 반영 / 수식 입력줄 글자로 바꿈         |
|           | [`commitEdit`](../src/lib/controller/sheet-controller.ts#L195) · [`cancelEdit`](../src/lib/controller/sheet-controller.ts#L208)                                                                                                                                      | 확정해 문서에 씀 / 취소                                                     |
| 선택      | [`select`](../src/lib/controller/sheet-controller.ts#L226) · [`jumpTo`](../src/lib/controller/sheet-controller.ts#L233)                                                                                                                                              | 선택 바꾸기 / 특정 셀로 이동(참여자 목록에서 클릭)                          |
|           | [`navigate`](../src/lib/controller/sheet-controller.ts#L241)                                                                                                                                                                                                         | `applyNavigation`으로 다음 선택 계산                                        |
|           | [`pointerSelect`](../src/lib/controller/sheet-controller.ts#L256) · [`pointerDrag`](../src/lib/controller/sheet-controller.ts#L277)                                                                                                                                  | 마우스 클릭·드래그 선택                                                     |
| 잠금      | [`blockIfLocked`](../src/lib/controller/sheet-controller.ts#L298)                                                                                                                                                                                                    | 다른 사람이 AI로 잠근 범위면 막고 안내                                      |
| 서식·값   | [`toggleFormat`](../src/lib/controller/sheet-controller.ts#L306) · [`setStyle`](../src/lib/controller/sheet-controller.ts#L312) · [`clearFormats`](../src/lib/controller/sheet-controller.ts#L318) · [`clearValues`](../src/lib/controller/sheet-controller.ts#L324) | 선택 범위에 적용. 잠긴 셀이면 막음                                          |
| 실행 취소 | [`undo`](../src/lib/controller/sheet-controller.ts#L330) · [`redo`](../src/lib/controller/sheet-controller.ts#L336)                                                                                                                                                  | 편집 중이면 먼저 확정한 뒤 실행                                             |
| 입구      | [`runAction`](../src/lib/controller/sheet-controller.ts#L343)                                                                                                                                                                                                        | `resolveGridKey`가 돌려준 동작을 받아 위 명령으로 나눠 보냄                 |

#### [store.ts](../src/lib/store.ts) — 값 하나를 담는 저장소

| 멤버            | 하는 일                                                                |
| --------------- | ---------------------------------------------------------------------- |
| `get()`         | 지금 값. 렌더링을 기다리지 않음                                        |
| `set(next)`     | 값이나 `prev => next` 함수를 받음. `Object.is`로 같으면 아무것도 안 함 |
| `subscribe(fn)` | 바뀌면 부를 함수 등록. 해제 함수를 돌려줌                              |

값을 그 자리에서 고치면 참조가 같아서 알림이 가지 않습니다. 바꿀 때는 항상 새 객체를 넘깁니다.

#### [useStore.ts](../src/hooks/useStore.ts) — Store를 화면에 연결

`useSyncExternalStore(store.subscribe, store.get, store.get)` 한 줄입니다. 렌더링 도중 컴포넌트마다 다른 값을 보는 문제(tearing)를 React가 막아 줍니다.

</details>

<br>

## 6. Shell 아래 부품들 (10:30–12:30)

📂 [Shell](../src/components/sheet/SheetApp.tsx#L56) → [ParticipantList](../src/components/sheet/participant-list/index.tsx#L16) → [Toolbar](../src/components/sheet/toolbar/index.tsx#L71) → [FormulaBar](../src/components/sheet/FormulaBar.tsx#L14) → [Workspace](../src/components/sheet/SheetApp.tsx#L45)

### 6-1. 기능의 맨 위 부품이 꺼내고 구독합니다

🗣 부품마다 첫 줄에서 `useSheet()`로 필요한 걸 꺼내고, 필요한 Store만 구독합니다. 예를 들어 `FormulaBar`는 선택, 편집 상태, 입력 중인 글자만 구독합니다. 그래서 선택이 바뀌면 수식 입력줄은 다시 그려지지만 다른 부품은 그대로입니다.

🗣 구조 규칙으로 "데이터는 위에서 읽고 아래로 내린다"를 정해 두었습니다([SKILL.md](../.claude/skills/project-structure/SKILL.md)). Context와 Store 구독은 기능의 맨 위 부품에서만 하고, 그 아래 부품은 props만 받습니다.

### 6-2. hook은 두 종류입니다

| 종류        | 하는 일                             | 예                                                                                                                                                                                                                     |
| ----------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 구독 hook   | lib의 값을 화면에 연결              | [useStore](../src/hooks/useStore.ts#L5), [useDocVersion](../src/hooks/sheet/useDocVersion.ts#L40), [useParticipants](../src/hooks/sheet/useParticipants.ts#L5), [useUndoState](../src/hooks/sheet/useUndoState.ts#L45) |
| 이벤트 hook | DOM 이벤트를 컨트롤러 명령으로 바꿈 | [useCellEditor](../src/hooks/grid/useCellEditor.ts#L15), [useGridPointer](../src/hooks/grid/useGridPointer.ts#L14), [useFormulaInput](../src/hooks/sheet/useFormulaInput.ts#L19)                                       |

🗣 구독 hook은 모두 `useSyncExternalStore` 한 가지 방법을 씁니다. Store, Y.Doc, 참여자 목록, 실행 취소 상태처럼 React 바깥 값은 전부 같은 방식으로 화면에 연결됩니다.

### 6-3. 무엇을 보여 줄지는 순수 함수가 정합니다

📂 [participantStatus](../src/lib/collab/messages.ts#L9) → [ParticipantRows에서 사용](../src/components/sheet/participant-list/ParticipantRows.tsx#L50)

🧱 **순수 함수.** "B2 입력 중", "AI 결과 검토 중 · 잠금" 같은 문구는 기능마다 `messages.ts`의 함수가 정합니다. 부품은 결과를 마크업으로 바꾸기만 합니다. 판단은 화면 없이 테스트하고, 문구는 `resources/strings.ts` 한 곳에서 고칩니다.

<details>
<summary>📦 모듈 설명: 부품들 · collab/messages · draft-input · 구독 hook</summary>

#### 화면 부품

| 부품                                                                        | 꺼내 쓰는 것                                 | 하는 일                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`ParticipantList`](../src/components/sheet/participant-list/index.tsx#L16) | `session.presence`, `controller`             | 참여자 아바타와 목록. 내 이름 바꾸기([`SelfRow`](../src/components/sheet/participant-list/ParticipantRows.tsx#L13)), 다른 사람 클릭하면 그 위치로 이동([`OtherRow`](../src/components/sheet/participant-list/ParticipantRows.tsx#L88)) |
| [`Toolbar`](../src/components/sheet/toolbar/index.tsx#L71)                  | `controller`, `ai`, `aiPanel`, `undoManager` | 실행 취소, 서식, 색([`ColorMenu`](../src/components/sheet/toolbar/ColorMenu.tsx#L20)), 정렬, 셀 잠금 토글, AI 패널 열기                                                                                                                |
| [`FormulaBar`](../src/components/sheet/FormulaBar.tsx#L14)                  | `controller`                                 | 선택한 셀 주소와 값. 편집 중이면 셀 편집칸과 같은 글자를 보여 줌                                                                                                                                                                       |

#### [collab/messages.ts](../src/lib/collab/messages.ts) — 참여 상태를 화면 문구로

파일 이름의 `messages`는 네트워크 메시지가 아니라 화면에 보이는 안내 문구입니다.

| 함수                                                     | 하는 일                                                               |
| -------------------------------------------------------- | --------------------------------------------------------------------- |
| [`participantStatus`](../src/lib/collab/messages.ts#L9)  | 참여자 목록의 상태. AI 작업 → 입력 중 → 선택 중 → 입장 중 순서로 우선 |
| [`lockedCellNotices`](../src/lib/collab/messages.ts#L22) | 잠긴 셀을 고치려 할 때 띄울 안내                                      |

#### [draft-input.ts](../src/lib/sheet/draft-input.ts) — 편집칸 표시

셀 편집칸과 수식 입력줄에 같은 표시(`data-draft-input`)를 붙입니다([`isDraftInput`](../src/lib/sheet/draft-input.ts#L5)). 셀에서 입력하다 수식 입력줄을 클릭해도 같은 편집으로 보고, 중간에 확정하지 않고 이어서 편집하게 합니다.

#### 구독 hook

| hook                                                          | 구독 대상      | 돌려주는 것                                |
| ------------------------------------------------------------- | -------------- | ------------------------------------------ |
| [`useStore`](../src/hooks/useStore.ts#L5)                     | Store          | 지금 값                                    |
| [`useDocVersion`](../src/hooks/sheet/useDocVersion.ts#L40)    | Y.Doc `update` | 버전 번호. 값은 그릴 때 문서에서 직접 읽음 |
| [`useParticipants`](../src/hooks/sheet/useParticipants.ts#L5) | `Presence`     | 참여자 목록                                |
| [`useUndoState`](../src/hooks/sheet/useUndoState.ts#L45)      | UndoManager    | `canUndo`, `canRedo`                       |

</details>

<br>

## 7. Grid: 키 하나가 다른 탭에 닿기까지 (12:30–15:30)

### 7-1. Grid는 컨트롤러에 DOM 일을 붙여 주고, 층을 쌓아 그립니다

📂 [Grid](../src/components/sheet/grid/Grid.tsx#L37) → [구독](../src/components/sheet/grid/Grid.tsx#L38) → [attachView](../src/components/sheet/grid/Grid.tsx#L54) → [층](../src/components/sheet/grid/Grid.tsx#L93) → [layers.ts](../src/components/sheet/grid/layers.ts#L3)

🗣 5-2에서 컨트롤러가 받는다고 한 `SheetView`를 여기서 붙입니다. 스크롤, 포커스, 편집칸 글자 읽기처럼 DOM이 필요한 일만 Grid가 맡고, 컨트롤러는 그걸 부르기만 합니다.

🗣 셀 값은 화면에 복사하지 않습니다. `useDocVersion`으로 "바뀌었다"는 신호만 받고, 그릴 때 문서에서 직접 읽습니다. 그 위에 층을 차례로 쌓습니다.

```
아래 ─────────────────────────────────────────────────────▶ 위
GridHeaders · GridCells → RemoteDrafts · RemoteCursors → AiPreview
→ RemoteAiActivity → SelectionOverlay(내 선택) → 이름표 → CellEditor → CoEditNotice
```

🗣 다른 사람의 커서는 내 선택보다 아래에 두어 내 커서가 가려지지 않게 했고, 이름표는 위에 두어 이름이 가려지지 않게 했습니다. 이 순서는 `layers.ts` 한 곳에 있습니다.

### 7-2. 판단은 순수 함수, 실행은 컨트롤러, 쓰기는 문서 함수

📂 [useCellEditor](../src/hooks/grid/useCellEditor.ts#L15) → [resolveGridKey 호출](../src/hooks/grid/useCellEditor.ts#L49) → [resolveGridKey](../src/lib/sheet/keymap.ts#L99) → [runAction](../src/lib/controller/sheet-controller.ts#L343) → [applyNavigation](../src/lib/sheet/navigation.ts#L52) → [commitEdit](../src/lib/controller/sheet-controller.ts#L195) → [writeValues](../src/lib/sheet/document.ts#L79) → [handleDocUpdate](../src/lib/collab/broadcast-provider.ts#L110) → [useDocVersion](../src/hooks/sheet/useDocVersion.ts#L40)

🗣 지금까지 본 층이 한 번에 이어지는 흐름입니다. 탭 A에서 B2에 "100"을 입력하고 Enter를 누르면 이렇게 흘러갑니다.

```
 탭 A                                               탭 B
 ① 타이핑 시작   startEdit()
 ② 입력 중       draftChanged() ──awareness──▶  B2 위에 "10…" 미리 표시
                 (문서는 그대로)
 ③ Enter        commitEdit()
                 → writeValues(origin = "user-edit")
                 → values["B2"] = "100"
 ④ update 이벤트 ┬ provider: 채널로 방송 ──────▶ ⑤ 받아서 문서에 적용
                 ├ IndexedDB: 저장                   (origin = provider)
                 ├ UndoManager: 실행 취소 기록        → 다시 방송 안 함
                 └ 화면 다시 그림                     → 실행 취소 기록 안 함
                                                    → 화면 다시 그림
```

| 단계                  | 어디서                                     | 선언 모양          |
| --------------------- | ------------------------------------------ | ------------------ |
| 키를 받음             | `useCellEditor`                            | 이벤트 hook        |
| 어떤 동작인지 정함    | `resolveGridKey`                           | 순수 함수          |
| 명령 실행, 편집 확정  | `SheetController.runAction` → `commitEdit` | 클래스             |
| 다음 칸 계산          | `applyNavigation`                          | 순수 함수          |
| 출처를 붙여 문서에 씀 | `writeValues`                              | 문서 함수          |
| 다른 탭에 보내고 저장 | `BroadcastChannelProvider`, IndexedDB      | 클래스 (세션 부품) |
| 받은 탭이 다시 그림   | `useDocVersion`                            | 구독 hook          |

🗣 판단을 순수 함수로 뺐기 때문에, Tab 다음 Enter나 Ctrl+방향키 같은 엑셀 규칙을 화면 없이 테스트할 수 있습니다. 이동 규칙은 처음엔 576줄짜리 Grid 안에 있었는데, 이 기준으로 [순수 함수로 뺐습니다](../src/lib/sheet/navigation.ts#L50).

🗣 한글 입력 때문에 편집칸은 항상 선택한 셀 위에서 포커스를 갖고 있습니다. 편집을 시작할 때 포커스를 옮기면 첫 자모가 사라지기 때문입니다. [조합 중](../src/hooks/grid/useCellEditor.ts#L57)에 누른 Enter는 시트가 처리하지 않습니다.

<details>
<summary>📦 모듈 설명: Grid 부품 · 이벤트 hook · keymap · navigation · selection · geometry · viewport</summary>

#### Grid 층 부품

| 부품                                                                        | 그리는 것                                                 |
| --------------------------------------------------------------------------- | --------------------------------------------------------- |
| [`GridHeaders`](../src/components/sheet/grid/GridHeaders.tsx#L17)           | 행·열 머리글. 선택 범위를 강조                            |
| [`GridCells`](../src/components/sheet/grid/GridCells.tsx#L56)               | 셀 2,600개. 문서가 바뀔 때만 다시 그림 (가상 스크롤 없음) |
| [`RemoteDrafts`](../src/components/sheet/grid/RemoteDrafts.tsx#L23)         | 다른 사람이 입력 중인 글자 (문서엔 없음)                  |
| [`RemoteCursors`](../src/components/sheet/grid/RemoteCursors.tsx#L18)       | 다른 사람의 선택 테두리와 이름표                          |
| [`AiPreview`](../src/components/sheet/grid/AiPreview.tsx#L27)               | 내 AI 제안 미리보기. 충돌한 셀은 주황 테두리만            |
| [`RemoteAiActivity`](../src/components/sheet/grid/RemoteAiActivity.tsx#L17) | 다른 사람의 AI 작업 범위 점선과 "AI 결과 검토 중"         |
| [`SelectionOverlay`](../src/components/sheet/grid/SelectionOverlay.tsx#L12) | 내 선택 범위와 활성 셀                                    |
| [`CellEditor`](../src/components/sheet/grid/CellEditor.tsx#L29)             | 항상 선택한 셀 위에 있는 투명한 편집칸                    |
| [`CoEditNotice`](../src/components/sheet/grid/CoEditNotice.tsx#L13)         | "○○님도 이 셀을 입력 중이에요" 같은 편집칸 위 안내        |

#### 이벤트 hook

| hook                                                           | 하는 일                                                                                      |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [`useCellEditor`](../src/hooks/grid/useCellEditor.ts#L15)      | 편집칸의 키·입력·한글 조합 이벤트를 컨트롤러 명령으로. 조합 중이면 시트가 키를 처리하지 않음 |
| [`useGridPointer`](../src/hooks/grid/useGridPointer.ts#L14)    | 클릭·드래그·더블클릭을 `pointerSelect`, `pointerDrag`, `startEdit`로                         |
| [`useFormulaInput`](../src/hooks/sheet/useFormulaInput.ts#L19) | 수식 입력줄의 입력을 `replaceDraft`, `commitEdit`로. 셀 편집과 같은 길을 지남                |

#### [keymap.ts](../src/lib/sheet/keymap.ts) — 키를 동작으로

[`resolveGridKey()`](../src/lib/sheet/keymap.ts#L99)가 키 입력을 받아 "무슨 동작인지"(`GridAction`)를 돌려줍니다. 실행은 컨트롤러가 합니다.

| 키                                      | 동작                                  |
| --------------------------------------- | ------------------------------------- |
| 방향키 / `Shift`+방향키 / `Ctrl`+방향키 | 이동 / 범위 확장 / 데이터 경계로 이동 |
| `Enter`, `Tab`                          | 다음 셀로                             |
| `F2`                                    | 편집 시작 또는 편집 모드 전환         |
| `Ctrl+B` 등                             | 서식 명령                             |

같은 키도 편집 모드에 따라 다릅니다. 셀에 바로 타이핑한 `enter` 모드에서는 방향키가 확정 후 이동이고, F2나 더블클릭으로 시작한 `edit` 모드에서는 글자 사이 커서를 움직입니다. 단축키 정의([`FORMAT_SHORTCUTS`](../src/lib/sheet/keymap.ts#L54), [`COMMAND_SHORTCUTS`](../src/lib/sheet/keymap.ts#L67))와 툴바에 보일 문자열([`shortcutLabel`](../src/lib/sheet/keymap.ts#L78))도 여기 있습니다.

#### [navigation.ts](../src/lib/sheet/navigation.ts) — 다음 선택 계산

[`applyNavigation()`](../src/lib/sheet/navigation.ts#L52)이 지금 선택과 이동 동작을 받아 새 선택, Tab 복귀 열, 화면에 보여야 할 셀(`reveal`)을 돌려줍니다. 실제 스크롤과 상태 반영은 컨트롤러가 합니다.

- Tab으로 입력을 시작한 열을 기억합니다: `B2 → Tab → C2 → Tab → D2 → Enter → B3`
- 여러 셀을 선택한 상태에서는 Enter·Tab이 범위 안에서 활성 셀을 순환시킵니다.

#### [selection.ts](../src/lib/sheet/selection.ts) — 선택의 모양과 기본 연산

| 속성     | 뜻                                    | 예                             |
| -------- | ------------------------------------- | ------------------------------ |
| `anchor` | 범위 선택을 시작한 고정 셀            | B2에서 드래그를 시작하면 B2    |
| `focus`  | 드래그나 Shift+방향키로 움직이는 끝점 | D5까지 드래그하면 D5           |
| `active` | 실제 입력이 들어가는 셀               | 범위 안에서 Enter·Tab으로 이동 |

| 함수                                                                                                                                                           | 하는 일                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [`clampCoord`](../src/lib/sheet/selection.ts#L16) · [`collapsedSelection`](../src/lib/sheet/selection.ts#L24)                                                  | 시트 안으로 맞춤 / 한 셀 선택                               |
| [`selectionRange`](../src/lib/sheet/selection.ts#L30)                                                                                                          | 드래그 방향과 상관없이 정리된 범위                          |
| [`moveSelection`](../src/lib/sheet/selection.ts#L46) · [`extendSelection`](../src/lib/sheet/selection.ts#L52)                                                  | 한 셀로 줄여 이동 / 끝점만 이동                             |
| [`advanceWithinRange`](../src/lib/sheet/selection.ts#L63)                                                                                                      | 범위를 유지하며 활성 셀 순환. Tab은 가로, Enter는 세로 우선 |
| [`jumpTarget`](../src/lib/sheet/selection.ts#L85)                                                                                                              | Ctrl+방향키의 목적지(데이터 경계)                           |
| [`selectAll`](../src/lib/sheet/selection.ts#L111) · [`selectRows`](../src/lib/sheet/selection.ts#L116) · [`selectColumns`](../src/lib/sheet/selection.ts#L122) | 전체·행·열 선택                                             |

`selection`이 "한 칸 옮기는 계산"을 주면, `navigation`이 동작에 맞춰 그 계산을 조합하고 Tab 복귀 열과 스크롤 대상까지 정합니다.

#### [geometry.ts](../src/lib/sheet/geometry.ts) — 좌표를 픽셀로

셀 너비 100px, 높이 24px, 머리글 크기를 정의하고, 좌표를 그릴 위치로 바꿉니다. 좌표는 머리글을 포함한 그리드 기준이며 스크롤은 고려하지 않습니다.

| 함수                                                                                             | 하는 일                                |
| ------------------------------------------------------------------------------------------------ | -------------------------------------- |
| [`gridLineOf`](../src/lib/sheet/geometry.ts#L12)                                                 | 행·열 번호를 CSS Grid 줄 번호로        |
| [`cellRect`](../src/lib/sheet/geometry.ts#L24) · [`rangeRect`](../src/lib/sheet/geometry.ts#L39) | 셀 하나 / 범위의 위치와 크기           |
| [`outsetRect`](../src/lib/sheet/geometry.ts#L34)                                                 | 테두리까지 덮도록 위·왼쪽으로 1px 넓힘 |

#### [viewport.ts](../src/lib/sheet/viewport.ts) — 스크롤과 클릭 위치

| 함수                                                  | 하는 일                                                     |
| ----------------------------------------------------- | ----------------------------------------------------------- |
| [`revealCell`](../src/lib/sheet/viewport.ts#L11)      | 셀이 보이도록 스크롤 (`SheetView.reveal`로 컨트롤러에 붙음) |
| [`visibleRowCount`](../src/lib/sheet/viewport.ts#L30) | 한 화면에 보이는 행 수 (PageUp/Down)                        |
| [`hitTest`](../src/lib/sheet/viewport.ts#L36)         | 클릭한 위치가 셀·행 머리글·열 머리글·모서리 중 어디인지     |

</details>

<br>

## 8. AiPanel: AI 편집과 공동 편집 ⭐ (15:30–19:00)

> 시간이 모자라도 이 부분은 줄이지 않습니다. 이 과제만의 고민이 가장 많이 드러나는 곳입니다.

🗣 사용자가 셀을 고르고 지시문을 보내는 순간부터, AI가 제안을 만들고, 화면에 보여 주고, 사용자가 적용할지 정하기까지를 파일 순서대로 따라가겠습니다. 코드의 `[기능 설명: AI 편집 n/9]` 주석이 아래 번호와 같은 순서입니다.

```
 사용자                 브라우저                                         서버
 ──────                 ────────                                         ────
 ① 범위 선택·지시문 ──▶ AiComposer.send                                          §8-1
                        ② AiController.send                                       §8-2
                           셀 스냅샷 → base 기록 → 실행(run) 시작
                        ③ fetchAiTransport ── POST /api/ai/edit ──▶ ④ route: 검증 → 모델 확인   §8-3
                                                                    ⑤ claude: Claude 호출
                                                                    ⑥ parser: 셀이 완성될 때마다
                           ◀──── NDJSON 한 줄씩 (meta · text · edit · … · done) ────
                        ⑦ handleEvent → applyProgress  (메모리에만, 문서엔 안 씀)  §8-4
                        ⑧ 패널: AiRunCard   그리드: AiPreview  (지금 값과 비교)     §8-5
 ⑨ 적용 / 버리기 ─────▶ AiController.apply → writeValues(ai-apply)                §8-6
                           → 다른 탭에는 7-2와 같은 길로 전달
```

| 단계          | 파일                                                  | 선언 모양        | 문서(Y.Doc)          |
| ------------- | ----------------------------------------------------- | ---------------- | -------------------- |
| ① 입력        | `AiPanel`, `AiComposer`                               | 화면 부품        | 읽지 않음            |
| ② 요청 만들기 | `AiController.send`, `request.ts`                     | 클래스, 순수 함수 | 읽기 (스냅샷)        |
| ③–⑥ 전송·생성 | `transport.ts` → `route.ts` → `claude.ts` → parser    | 계약 타입        | 모름                 |
| ⑦ 받기        | `AiController.handleEvent`, `run.ts`                  | 순수 함수        | 쓰지 않음            |
| ⑧ 보여 주기   | `AiRunCard`, `AiPreview`, `coedit.ts`                 | 순수 함수        | 읽기 (지금 값과 비교) |
| ⑨ 결정        | `AiController.apply` / `discard`                      | 클래스           | **여기서만 씀**      |

### 8-1. 입력: 셀 선택과 지시문 (① AiPanel → AiComposer)

📂 [툴바 AI 버튼](../src/components/sheet/toolbar/index.tsx#L188) → [Workspace](../src/components/sheet/SheetApp.tsx#L51) → [AiPanel](../src/components/sheet/ai/AiPanel.tsx#L19) → [AiComposer](../src/components/sheet/ai/AiComposer.tsx#L29) → [useSelection](../src/components/sheet/ai/AiComposer.tsx#L31) → [범위 정하기](../src/components/sheet/ai/AiComposer.tsx#L40) → [send](../src/components/sheet/ai/AiComposer.tsx#L47)

🗣 툴바의 AI 버튼은 `aiPanel` Store를 켜고 끄기만 합니다. `Workspace`가 그 값을 구독하다가 `AiPanel`을 그리드 옆에 붙입니다.

🗣 `AiPanel`은 두 부분입니다. 위는 대화 목록으로, `ai.messages` Store를 구독해 내 요청은 `UserMessage`, AI 응답은 `AiRunCard`로 그립니다. 아래는 요청창 `AiComposer`입니다. 패널이 열릴 때 [useAiConnection](../src/hooks/ai/useAiConnection.ts#L9)이 같은 주소에 GET을 보내 고를 수 있는 모델 목록을 받아 옵니다.

🗣 요청창은 그리드에서 고른 선택을 따로 넘겨받지 않습니다. `useSelection()`으로 컨트롤러의 `selection` Store를 직접 구독합니다. 그래서 패널을 열어 둔 채 그리드에서 범위를 바꾸면 "선택 범위 B2:D5" 칩이 바로 바뀝니다.

```
선택이 여러 칸  → 기본 "선택 범위"  → scope = B2:D5
선택이 한 칸    → 기본 "시트 전체"  → scope = null
사용자가 칩을 누르면 그 선택을 따름
```

🗣 보내기 전에 [overlapNotice](../src/components/sheet/ai/AiComposer.tsx#L43)로 다른 사람의 AI 작업과 겹치는지 미리 알려 줍니다(8-7). Enter를 누르면 `ai.send(지시문, scope)`를 부르고, 보냈으면 입력칸을 비웁니다. [한글 조합 중의 Enter](../src/components/sheet/ai/AiComposer.tsx#L56)는 글자를 확정하는 키라서 보내지 않습니다.

### 8-2. 요청 만들기: 셀 값을 찍어 두고 실행을 시작합니다 (② AiController.send)

📂 [send](../src/lib/ai/ai-controller.ts#L147) → [isBusy · 겹침 확인](../src/lib/ai/ai-controller.ts#L149) → [snapshotCells](../src/lib/ai/request.ts#L10) → [요청 객체](../src/lib/ai/ai-controller.ts#L156) → [base 기록](../src/lib/ai/ai-controller.ts#L165) → [beginRun](../src/lib/ai/ai-controller.ts#L251) → [stream](../src/lib/ai/ai-controller.ts#L266)

🗣 `send`는 위에서부터 이렇게 읽힙니다.

```
send(instruction, scope)
├─ 막을 일이 있으면 false   빈 지시문 · 생성/검토 중인 실행이 있음 · 남이 잠근 범위
├─ snapshotCells(doc)        비어 있지 않은 셀만 행 순서로. 서식은 안 보냄
├─ request                   { instruction, range: "B2:D5", cells, history, model }
├─ base = cells를 Map으로    ★ 요청에 실은 값 = 요청 때 값. 충돌 판정의 기준
├─ beginRun()                대화 목록에 [내 요청, 빈 AI 실행] 추가, active = 그 실행
└─ stream()                  AbortController와 응답 감시 타이머를 켜고 transport 호출
```

🗣 `base`를 따로 읽지 않고 **요청에 실은 셀 값 그대로** 씁니다. AI가 본 시트와 나중에 비교할 기준이 정확히 같아야 하기 때문입니다.

🗣 `beginRun`이 `active` Store를 바꾸는 순간 두 곳이 반응합니다. 패널에는 "AI에 요청하는 중…" 카드가 생기고, 그리드에는 요청 범위에 점선 테두리가 그려집니다. 아직 서버에서 아무것도 오지 않았는데도 바로 보이는 이유입니다.

### 8-3. 전송과 생성: 브라우저에서 서버, Claude까지 (③–⑥)

📂 [fetchAiTransport](../src/lib/ai/transport.ts#L45) → [route POST](../src/app/api/ai/edit/route.ts#L28) → [parseEditRequest](../src/lib/ai/server/validate.ts#L35) → [모델 확인](../src/app/api/ai/edit/route.ts#L40) → [첫 이벤트 기다리기](../src/app/api/ai/edit/route.ts#L50) → [streamClaudeEdits](../src/lib/ai/server/claude.ts#L86) → [buildUserMessage](../src/lib/ai/server/prompt.ts#L68) → [EDIT_TOOL](../src/lib/ai/server/prompt.ts#L17) → [createEditStreamParser](../src/lib/ai/server/edit-stream-parser.ts#L15)

🧱 **계약 타입이 경계를 나눕니다.** 브라우저와 서버는 [`protocol.ts`](../src/lib/ai/protocol.ts#L117)의 `AiEditRequest`와 `AiStreamEvent`로만 대화합니다. 서버는 오류 코드만 보내고, 화면 문구는 브라우저가 고릅니다.

| 단계 | 파일                                                                      | 하는 일                                                                                                                         |
| ---- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| ③    | [`transport.ts`](../src/lib/ai/transport.ts#L48)                          | 요청을 JSON으로 POST. `AbortSignal`을 같이 넘겨 중단하면 서버 호출도 끊김                                                       |
| ④    | [`route.ts`](../src/app/api/ai/edit/route.ts#L35)                         | zod로 검증 → 허용한 모델인지 확인 → 첫 이벤트까지 기다림. 그 전 실패는 HTTP 상태로, [스트림을 연 뒤](../src/app/api/ai/edit/route.ts#L57) 실패는 `error` 이벤트로 |
| ⑤    | [`claude.ts`](../src/lib/ai/server/claude.ts#L92)                         | 시스템 지침 + `propose_edits` 도구 + 시트 내용(`B2 = "1,000"`)으로 Claude 스트림을 염                                           |
| ⑥    | [`edit-stream-parser.ts`](../src/lib/ai/server/edit-stream-parser.ts#L62) | 조각난 도구 입력에서 `{ cell, value }` 하나가 완전히 닫혔을 때만 `JSON.parse`                                                   |

🗣 AI의 답은 두 갈래로 옵니다. 지침에 따라 먼저 "무엇을 바꾸겠다"는 짧은 글을 쓰고, 시트를 바꿔야 하면 `propose_edits` 도구를 한 번 부릅니다. `claude.ts`가 Claude 스트림을 앱 이벤트로 바꿉니다.

```
Claude 스트림                     →  앱 이벤트 (NDJSON 한 줄)
message_start                     →  { type: "meta", model }
text_delta  "B열 합계를…"         →  { type: "text", delta }
input_json_delta  '{"edits":[{"c' →  (parser가 모음, 아직 안 보냄)
input_json_delta  'ell":"B5","value":"1250"}' →  { type: "edit", cell: "B5", value: "1250" }
끝 (refusal / max_tokens)         →  { type: "error" } / { type: "warning", truncated }
끝                                →  { type: "done" }
```

🗣 질문만 했다면 도구를 부르지 않으므로 `text`만 오고 끝납니다. 결과를 글이 아니라 도구 호출로 받은 이유는 셀 하나씩 생성되는 대로 보여 주기 위해서입니다. 그런데 SDK는 덜 만들어진 문자열도 받아들여서 `"1250"` 대신 `"12"`가 보일 수 있었습니다. 그래서 셀 하나가 완전히 닫혔을 때만 읽는 파서를 직접 만들었습니다.

### 8-4. 받기: 이벤트를 실행에 쌓기만 합니다 (⑦ handleEvent → applyProgress)

📂 [createLineSplitter](../src/lib/ai/transport.ts#L74) → [parseStreamEvent](../src/lib/ai/transport.ts#L67) → [onEvent](../src/lib/ai/ai-controller.ts#L274) → [handleEvent](../src/lib/ai/ai-controller.ts#L294) → [applyProgress](../src/lib/ai/run.ts#L99) → [addProposal](../src/lib/ai/run.ts#L130) → [updateRun](../src/lib/ai/ai-controller.ts#L386) → [finish](../src/lib/ai/ai-controller.ts#L312) → [finishRun](../src/lib/ai/run.ts#L125)

🗣 응답은 조각으로 도착하므로 `transport`가 줄바꿈 단위로 자르고, 한 줄을 `parseStreamEvent`로 다시 검사한 뒤 `onEvent`로 넘깁니다. 타입은 런타임 데이터를 보장하지 않기 때문에 경계에서 한 번 더 확인합니다.

🧱 **순수 함수.** 컨트롤러는 받은 이벤트를 직접 해석하지 않고 `applyProgress(run, event)`에 넘겨 **새 실행 객체**를 받습니다. 시트에는 아직 아무것도 쓰지 않습니다.

| 이벤트             | 실행(`AiRun`)에 생기는 일                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `meta`             | `connected = true`, 모델 이름 기록 → 상태 문구 "AI에 요청하는 중…"이 "생각하는 중…"으로                                               |
| `text`             | `status = "streaming"`, `text`에 이어 붙임                                                                             |
| `edit`             | [`addProposal`](../src/lib/ai/run.ts#L130): 범위 밖이면 `excluded`만 셈 · `before = base[셀]` · 요청 때 값과 같으면 뺌 · 같은 셀이면 교체 |
| `warning`          | `warnings`에 추가                                                                                                      |
| `done`             | [`finishRun`](../src/lib/ai/run.ts#L125): 제안이 있으면 `review`, 없으면 `answered`                                     |
| `error` · 끊김 · 60초 | [`fail`](../src/lib/ai/ai-controller.ts#L320): `status = "error"`, 서버 호출도 끊음                                  |

🗣 `updateRun`은 대화 목록의 그 실행과 `active`를 함께 바꿉니다. 첫 제안이 오면 [그 셀로 스크롤](../src/lib/ai/ai-controller.ts#L307)해서, 다른 곳을 보고 있어도 생성 과정을 볼 수 있게 했습니다. 이벤트가 올 때마다 [감시 타이머](../src/lib/ai/ai-controller.ts#L373)를 다시 재서, 5초 동안 없으면 "응답 지연", 60초면 시간 초과로 끝냅니다.

🗣 실행 상태 변화를 순수 함수로 뺐기 때문에 "범위 밖 제안은 버린다", "같은 셀은 마지막 제안으로" 같은 규칙을 네트워크 없이 테스트합니다.

### 8-5. 보여 주기: 패널과 그리드가 같은 실행을 그립니다 (⑧)

📂 [AiRunCard](../src/components/sheet/ai/run-card/index.tsx#L26) → [useDocVersion](../src/components/sheet/ai/run-card/index.tsx#L34) → [ai.states](../src/components/sheet/ai/run-card/index.tsx#L36) → [states](../src/lib/ai/ai-controller.ts#L102) → [evaluateProposals](../src/lib/ai/coedit.ts#L36) → [classifyCell](../src/lib/ai/coedit.ts#L22) → [Grid의 aiStates](../src/components/sheet/grid/Grid.tsx#L78) → [AiPreview](../src/components/sheet/grid/AiPreview.tsx#L27)

🗣 `active` Store 하나를 두 부품이 구독합니다. 패널의 `AiRunCard`는 글과 목록으로, 그리드의 `AiPreview`는 셀 위에 겹쳐서 보여 줍니다.

```
                       ai.active (Store)
                ┌─────────────┴─────────────┐
     AiPanel → AiRunCard                 Grid → AiPreview
     ├─ StatusLine     "제안을 만드는 중… 3개"  ├─ 요청 범위 점선 + "AI가 제안을 만드는 중… 3개"
     ├─ run.text       AI의 글 답변         ├─ clean   → 제안 값을 셀 위에 겹쳐 그림
     ├─ ConflictBanner 충돌 n개 안내        ├─ conflict → 주황 테두리만 (지금 값은 그대로)
     ├─ ProposalList   B5: 1000 → 1250     └─ same    → 그리지 않음
     └─ 적용 · 버리기 · 원래 값 보기
```

🧱 **순수 함수.** 화면에 보이는 판정은 저장하지 않습니다. 그릴 때마다 `ai.states()`가 셀마다 요청 때 값·지금 값·제안 값 세 개를 비교합니다.

```ts
if (proposed === current) return "same"; // 이미 같음 → 쓸 필요 없음
if (current === base) return "clean"; // 아무도 안 건드림 → 씀
return "conflict"; // 누군가 바꿈 → 기본은 건너뜀
```

🗣 두 부품 모두 `useDocVersion(doc)`을 구독합니다. 그래서 다른 탭이 B5를 고치면 문서 버전이 바뀌어 다시 그려지고, 그때 다시 비교해서 B5가 바로 충돌로 바뀝니다. 바꾼 사람이 원래 값으로 되돌리면 충돌도 저절로 풀립니다. 생성 중 수정, 검토 중 수정, 겹치는 동시 요청을 따로 처리하지 않고 이 함수 하나로 다룹니다.

🗣 왜 충돌한 셀을 기본으로 건너뛸까요? AI 결과는 다시 요청하면 또 만들 수 있지만, 사람이 입력한 값은 사라지면 되살리기 어렵기 때문입니다.

### 8-6. 결정: 사용자가 고르면 그때 처음 문서에 씁니다 (⑨)

📂 [적용 버튼](../src/components/sheet/ai/run-card/index.tsx#L100) → [apply](../src/lib/ai/ai-controller.ts#L184) → [commitEdit](../src/lib/ai/ai-controller.ts#L189) → [다시 판정](../src/lib/ai/ai-controller.ts#L192) → [select](../src/lib/ai/ai-controller.ts#L199) → [writeValues](../src/lib/ai/ai-controller.ts#L200) → [closeReview](../src/lib/ai/ai-controller.ts#L338)

🗣 `review` 상태가 되면 카드에 버튼이 생깁니다. 버튼은 모두 `AiController`의 메서드 하나씩을 부르고, 문서를 건드리는 것은 **적용** 하나뿐입니다.

| 사용자가 누르는 것      | 화면                                                                                | 컨트롤러                                                     | 문서            |
| ----------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------- |
| 적용 (n개)              | [AiRunCard](../src/components/sheet/ai/run-card/index.tsx#L100)                     | [`apply`](../src/lib/ai/ai-controller.ts#L184)               | `ai-apply`로 씀 |
| 버리기                  | [AiRunCard](../src/components/sheet/ai/run-card/index.tsx#L108)                     | [`discard`](../src/lib/ai/ai-controller.ts#L224)             | 안 건드림       |
| 원래 값 보기            | [AiRunCard](../src/components/sheet/ai/run-card/index.tsx#L115)                     | `showOriginal` Store → [미리보기 숨김](../src/components/sheet/grid/AiPreview.tsx#L58) | 안 건드림       |
| 충돌 셀의 "덮어쓰기"    | [ProposalList](../src/components/sheet/ai/run-card/ProposalList.tsx#L88)            | [`setOverwrite`](../src/lib/ai/ai-controller.ts#L114)        | 안 건드림       |
| 모두 덮어쓰기 / 건너뛰기 | [ConflictBanner](../src/components/sheet/ai/run-card/ConflictBanner.tsx#L36)       | [`setOverwriteAll`](../src/lib/ai/ai-controller.ts#L126)     | 안 건드림       |
| 지금 값으로 다시 요청   | [ConflictBanner](../src/components/sheet/ai/run-card/ConflictBanner.tsx#L41)        | [`regenerate`](../src/lib/ai/ai-controller.ts#L216) = 버리기 + `send` | 안 건드림       |
| 제안 행 클릭            | [ProposalList](../src/components/sheet/ai/run-card/ProposalList.tsx#L71)            | `controller.jumpTo` (그 셀로 이동)                           | 안 건드림       |
| 중단 (생성 중) · Esc    | [AiComposer](../src/components/sheet/ai/AiComposer.tsx#L102)                        | [`cancel`](../src/lib/ai/ai-controller.ts#L172) (서버 호출도 끊김) | 안 건드림       |
| 다시 시도 (실패 후)     | [AiRunCard](../src/components/sheet/ai/run-card/index.tsx#L128)                     | [`retry`](../src/lib/ai/ai-controller.ts#L232)               | 안 건드림       |

🗣 덮어쓰기를 고르면 그때 본 값도 함께 기억합니다. 고른 뒤에 값이 또 바뀌면 다시 건너뜁니다. 사용자가 보지 못한 값을 덮어쓰지 않기 위해서입니다.

🗣 적용할 때는 7-2에서 본 `writeValues`를 그대로 쓰고, 출처만 `ai-apply`로 붙입니다.

1. 내가 입력 중이던 값을 먼저 확정합니다. 그 셀이 제안 대상이면 충돌이 됩니다.
2. 화면에 보이던 판정이 아니라 지금 값으로 다시 판정하고, `clean`이거나 덮어쓰기를 고른 셀만 남깁니다.
3. 바뀔 범위로 선택을 옮깁니다. 그래야 실행 취소했을 때 이 범위로 돌아옵니다.
4. 쓸 셀을 한 트랜잭션으로 씁니다. 실행 취소 한 번에 AI 결과 전체가 되돌아갑니다.
5. 실행을 `applied`로 바꾸고 `active`를 비웁니다. 그리드의 미리보기가 사라지고, 카드에는 "적용했어요 · Ctrl+Z로 한 번에 되돌릴 수 있어요"가 남습니다.

🗣 판정과 쓰기를 같은 동기 코드에서 해서, 그 사이에 다른 탭의 변경이 끼어들 수 없습니다. 쓴 뒤로는 사람이 입력한 값과 똑같이 `update` 이벤트 → 채널 방송 → 다른 탭 화면 갱신으로 이어집니다(7-2). 다른 탭은 AI가 쓴 값인지 구분하지 않습니다.

### 8-7. 다른 사람에게 보이는 것: 참여 상태에 얹고, 컨트롤러가 막습니다

📂 [publishActivity](../src/lib/ai/ai-controller.ts#L347) → [RemoteAiActivity](../src/components/sheet/grid/RemoteAiActivity.tsx#L17) → [locks.ts 결정](../src/lib/collab/locks.ts#L5) → [lockHolder](../src/lib/collab/locks.ts#L19) → [blockIfLocked](../src/lib/controller/sheet-controller.ts#L298)

🗣 지금까지는 요청한 탭의 이야기였습니다. 다른 탭에는 제안 값이 아니라 "누가 어느 범위에서 AI로 작업 중인지"만 보입니다. AI 작업 상태와 잠금은 새 저장소를 만들지 않고, 커서처럼 참여 상태에 얹어 보냅니다. 그래서 잠근 탭이 닫히면 잠금도 함께 사라집니다. AI 제안 값 자체는 보내지 않습니다. 범위 전체에 깔려서 실제 데이터처럼 보이기 쉽기 때문입니다.

🧱 **모듈 방향을 지키는 위치 선정.** 잠그는 쪽은 AI이고 막는 쪽은 `SheetController`입니다. 그런데 `lib/collab`은 `lib/ai`를 몰라야 합니다. 그래서 잠금 판정 `lockHolder`를 "참여 상태로 편집 허용을 정하는 규칙"으로 보고 `collab`에 두었습니다.

🗣 기본은 막지 않고 알리기만 합니다(soft lock). 사람의 작업 흐름이 AI 때문에 끊기면 안 되기 때문입니다. 확인 창도 띄우지 않습니다. 포커스를 빼앗으면 한글 조합이 끊깁니다. 확실히 막고 싶을 때만 셀 잠금(hard lock)을 켭니다.

<details>
<summary>📦 모듈 설명: lib/ai 브라우저 쪽 (ai-controller · run · coedit · request · transport · protocol · messages · model-preference · mock-scenarios) · locks</summary>

`lib/ai/`는 AI 요청 한 번의 생명주기를 맡습니다.

1. `ai-controller`가 시트, 대화, 범위를 모아 실행을 시작합니다.
2. `request`가 요청 데이터를 만들고 `transport`가 `/api/ai/edit`로 보냅니다.
3. 서버가 Claude 응답을 스트리밍하면 `run`이 실행 상태를 갱신하고, `coedit`가 충돌을 판단합니다.
4. 사용자가 적용하면 `ai-controller`가 적용할 수 있는 제안만 한 트랜잭션으로 씁니다.

#### [ai-controller.ts](../src/lib/ai/ai-controller.ts) — AI 실행 전체 조율

| 묶음         | 멤버                                                                                                                                                   | 하는 일                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| 상태 (Store) | [`messages`, `active`, `showOriginal`, `model`, `overwrites`, `lockCells`](../src/lib/ai/ai-controller.ts#L61)                                         | 대화 목록, 생성·검토 중인 실행, 원본 보기, 모델, 덮어쓰기 선택, 셀 잠금 토글       |
| 연결         | [`connect`](../src/lib/ai/ai-controller.ts#L86)                                                                                                        | `active`가 바뀌면 AI 작업 상태를 참여 상태로 알림                                  |
| 판정         | [`states`](../src/lib/ai/ai-controller.ts#L102)                                                                                                        | 제안마다 현재 값과 비교한 상태. 저장하지 않고 매번 계산                            |
|              | [`setOverwrite`](../src/lib/ai/ai-controller.ts#L114) · [`setOverwriteAll`](../src/lib/ai/ai-controller.ts#L126)                                       | 충돌 셀 덮어쓰기 선택. 고를 때 본 값도 함께 저장                                   |
| 요청         | [`send`](../src/lib/ai/ai-controller.ts#L147)                                                                                                          | 겹치는 AI 작업 확인 → 셀 스냅샷 → `base` 기록 → 스트림 시작                        |
|              | [`cancel`](../src/lib/ai/ai-controller.ts#L172) · [`retry`](../src/lib/ai/ai-controller.ts#L232) · [`regenerate`](../src/lib/ai/ai-controller.ts#L216) | 취소(서버 호출도 끊김) / 재시도 / 지금 값으로 다시 요청                            |
| 적용         | [`apply`](../src/lib/ai/ai-controller.ts#L184) · [`discard`](../src/lib/ai/ai-controller.ts#L224)                                                      | 한 트랜잭션으로 쓰기 / 버리기(문서 안 건드림)                                      |
| 내부         | [`stream`](../src/lib/ai/ai-controller.ts#L266) · [`handleEvent`](../src/lib/ai/ai-controller.ts#L294)                                                 | 전송 함수를 부르고, 이벤트를 `applyProgress`로 쌓음. 첫 제안이 오면 그 셀로 스크롤 |
|              | [`armWatchdog`](../src/lib/ai/ai-controller.ts#L373)                                                                                                   | 5초 동안 이벤트가 없으면 "응답 지연", 60초면 시간 초과                             |
|              | [`publishActivity`](../src/lib/ai/ai-controller.ts#L347)                                                                                               | 생성·검토 상태, 범위, 잠금 여부만 알림. 제안 값은 안 보냄                          |

겹치는 요청 규칙: 다른 사람이 잠근 범위에는 요청할 수 없고, 내가 잠그려면 겹치는 AI 작업이 없어야 합니다. 양쪽 다 잠그지 않으면 동시에 실행할 수 있습니다.

#### [run.ts](../src/lib/ai/run.ts) — AI 요청 한 번의 상태 모델

`AiRun`은 지시문, 범위, 잠금 여부, 모델, AI의 텍스트 답변, 셀 제안, 제외한 제안 수, 경고와 오류, 요청 때 값, 적용 결과를 담습니다.

| 상태                                            | 뜻                                               |
| ----------------------------------------------- | ------------------------------------------------ |
| `waiting` → `streaming`                         | 응답을 기다림 → 텍스트·제안을 받는 중            |
| `review` / `answered`                           | 제안을 다 받아 검토 중 / 제안 없이 텍스트 답변만 |
| `applied` / `discarded` / `cancelled` / `error` | 적용함 / 버림 / 취소함 / 오류                    |

| 함수                                                                                | 하는 일                                                                                                                                    |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| [`createRun`](../src/lib/ai/run.ts#L78)                                             | 새 실행                                                                                                                                    |
| [`applyProgress`](../src/lib/ai/run.ts#L99)                                         | 이벤트를 반영한 새 실행을 돌려줌. 주소가 잘못됐거나 범위 밖인 제안은 `excluded` 수만 늘림. 같은 셀 제안은 교체하고, 요청 때 값과 같으면 뺌 |
| [`finishRun`](../src/lib/ai/run.ts#L125)                                            | 제안이 있으면 `review`, 없으면 `answered`                                                                                                  |
| [`isRunning`](../src/lib/ai/run.ts#L59) · [`isReviewing`](../src/lib/ai/run.ts#L64) | 상태 판정 헬퍼                                                                                                                             |

#### [coedit.ts](../src/lib/ai/coedit.ts) — AI 제안과 공동 편집의 충돌 판단

| 함수                                                                                                 | 하는 일                                                               |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| [`classifyCell`](../src/lib/ai/coedit.ts#L22)                                                        | 요청 때 값·현재 값·제안 값으로 `same` / `clean` / `conflict`          |
| [`evaluateProposals`](../src/lib/ai/coedit.ts#L36)                                                   | 모든 제안을 판정. 덮어쓰기는 고를 때 본 값과 지금 값이 같을 때만 유효 |
| [`writable`](../src/lib/ai/coedit.ts#L50) · [`summarize`](../src/lib/ai/coedit.ts#L62)               | 실제로 쓸 제안 / 적용·건너뜀 개수                                     |
| [`aiActivityOf`](../src/lib/ai/coedit.ts#L90)                                                        | 실행을 다른 탭에 알릴 AI 작업 상태로                                  |
| [`overlappingAi`](../src/lib/ai/coedit.ts#L107) · [`blockingOverlaps`](../src/lib/ai/coedit.ts#L123) | 다른 사람의 AI 작업과 겹치는 범위 / 그중 요청을 막아야 하는 것        |
| [`aiActivitiesAt`](../src/lib/ai/coedit.ts#L128)                                                     | 특정 셀에 걸친 다른 사람의 AI 작업                                    |

#### [request.ts](../src/lib/ai/request.ts) — 시트와 대화를 요청 데이터로

| 함수                                                  | 하는 일                                                                         |
| ----------------------------------------------------- | ------------------------------------------------------------------------------- |
| [`snapshotCells`](../src/lib/ai/request.ts#L10)       | 비어 있지 않은 셀만 행 순서로. 개수와 길이 제한. 서식은 안 보냄                 |
| [`conversationHistory`](../src/lib/ai/request.ts#L23) | 최근 대화를 서버 형식으로. 시트 스냅샷은 매번 새로 보내고, 이전 대화엔 텍스트만 |

#### [transport.ts](../src/lib/ai/transport.ts) — NDJSON 스트림 전송

| 멤버                                                   | 하는 일                                                                   |
| ------------------------------------------------------ | ------------------------------------------------------------------------- |
| [`AiTransport`](../src/lib/ai/transport.ts#L23)        | 전송 함수의 타입. `AiController`는 이 타입만 알고, 테스트에선 가짜를 넣음 |
| [`fetchAiTransport`](../src/lib/ai/transport.ts#L45)   | `/api/ai/edit`로 POST하고 응답을 한 줄씩 읽음. `AbortSignal`로 취소       |
| [`createLineSplitter`](../src/lib/ai/transport.ts#L26) | 조각나 도착한 응답에서 완성된 줄만 꺼냄                                   |
| [`AiRequestError`](../src/lib/ai/transport.ts#L11)     | 네트워크 실패, HTTP 오류, 중간 끊김을 한 오류로                           |

브라우저 기본 스트리밍(EventSource)은 GET만 돼서, 시트 내용을 실을 수 있게 fetch + NDJSON을 택했습니다.

#### [protocol.ts](../src/lib/ai/protocol.ts) — 브라우저와 서버의 공통 계약

| 항목                                                 | 내용                                                                        |
| ---------------------------------------------------- | --------------------------------------------------------------------------- |
| [`AI_LIMITS`](../src/lib/ai/protocol.ts#L15)         | 지시문, 셀 값, 셀 수, 대화 크기 제한. 브라우저와 서버가 같은 값을 씀        |
| [`AiEditRequest`](../src/lib/ai/protocol.ts#L36)     | 요청 형식                                                                   |
| [`AI_MODELS`](../src/lib/ai/protocol.ts#L57)         | 고를 수 있는 모델 목록                                                      |
| [`AiStreamEvent`](../src/lib/ai/protocol.ts#L117)    | `meta` · `text` · `edit` · `warning` · `done` · `error`                     |
| [`AI_ERRORS`](../src/lib/ai/protocol.ts#L125)        | 오류 코드별 HTTP 상태와 재시도 가능 여부                                    |
| [`parseStreamEvent`](../src/lib/ai/protocol.ts#L175) | 받은 이벤트를 런타임에 다시 검사 (타입은 런타임 데이터를 보장하지 않으므로) |

#### [ai/messages.ts](../src/lib/ai/messages.ts) — AI 상태를 화면 문구로

| 함수                                                                                                    | 하는 일                                                                                               |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| [`aiErrorMessage`](../src/lib/ai/messages.ts#L13) · [`aiWarningMessage`](../src/lib/ai/messages.ts#L18) | 오류·경고 코드를 문구로                                                                               |
| [`runStatusLine`](../src/lib/ai/messages.ts#L44)                                                        | 실행 카드의 진행 상태 문구, 아이콘, 색조. 같은 `waiting`도 "요청 중", "생각 중", "응답 지연"으로 나뉨 |
| [`overlapNotice`](../src/lib/ai/messages.ts#L88)                                                        | 다른 사람의 AI 작업과 겹칠 때 요청창 위 안내                                                          |
| [`editorNotices`](../src/lib/ai/messages.ts#L112)                                                       | 같은 셀 동시 입력, AI 작업 범위 안 편집 때 편집칸 위 안내                                             |

#### [model-preference.ts](../src/lib/ai/model-preference.ts) · [mock-scenarios.ts](../src/lib/ai/mock-scenarios.ts)

- **model-preference**: 마지막으로 고른 모델을 `localStorage`에 저장합니다. 문서 데이터가 아니라서 Y.Doc이나 참여 상태에 넣지 않습니다. 저장에 실패해도 오류를 내지 않습니다.
- **mock-scenarios**: 가짜 AI 모드에서 상황을 재현하는 태그입니다(`[느림]`, `[한도]`, `[키]`, `[과부하]`, `[거절]`, `[잘림]`). AI 패널과 서버의 가짜 API가 같은 정의를 씁니다.

#### [locks.ts](../src/lib/collab/locks.ts) — AI 잠금 판정

| 함수                                           | 하는 일                                                |
| ---------------------------------------------- | ------------------------------------------------------ |
| [`aiArea`](../src/lib/collab/locks.ts#L13)     | 범위가 `null`(시트 전체 요청)이면 시트 전체로 봄       |
| [`lockHolder`](../src/lib/collab/locks.ts#L19) | 요청한 범위와 겹치는 AI 잠금을 가진 다른 참여자를 찾음 |

`liveness.ts`의 Web Locks와는 용도가 다릅니다. 여기서는 참여 상태를 보고 편집 허용 여부를 판단만 합니다.

#### AI 패널 부품

| 부품                                                             | 하는 일                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`AiPanel`](../src/components/sheet/ai/AiPanel.tsx#L19)          | 대화 목록과 요청창. 서버 연결 정보는 [`useAiConnection`](../src/hooks/ai/useAiConnection.ts#L9)으로 받음                                                                                                                                                               |
| [`AiComposer`](../src/components/sheet/ai/AiComposer.tsx#L29)    | 지시문 입력, 범위(선택/시트 전체) 고르기, 겹침 안내                                                                                                                                                                                                                    |
| [`ModelSelect`](../src/components/sheet/ai/ModelSelect.tsx#L15)  | 모델 고르기                                                                                                                                                                                                                                                            |
| [`AiRunCard`](../src/components/sheet/ai/run-card/index.tsx#L26) | 실행 하나의 카드: [`StatusLine`](../src/components/sheet/ai/run-card/StatusLine.tsx#L22), [`ProposalList`](../src/components/sheet/ai/run-card/ProposalList.tsx#L23), [`ConflictBanner`](../src/components/sheet/ai/run-card/ConflictBanner.tsx#L18), 적용·버리기 버튼 |

</details>

<details>
<summary>📦 모듈 설명: lib/ai/server (route · validate · setup · prompt · claude · edit-stream-parser · mock-anthropic)</summary>

`server/` 아래 파일은 서버에서만 돕니다(`import "server-only"`). API 키가 브라우저 번들에 들어가지 않게 하고, 브라우저에서 온 입력과 모델이 낸 출력을 경계에서 검사합니다. 파일마다 경계를 하나씩 맡습니다.

| 파일                                                                      | 맡은 경계     | 하는 일                                                                                                                                                 |
| ------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`route.ts`](../src/app/api/ai/edit/route.ts#L28)                         | HTTP          | 얇은 어댑터. 시작 전 실패는 HTTP 상태로, [스트림을 연 뒤](../src/app/api/ai/edit/route.ts#L57) 실패는 스트림 안 `error` 이벤트로                        |
| [`validate.ts`](../src/lib/ai/server/validate.ts#L35)                     | 브라우저 입력 | zod로 지시문, 셀 주소, 개수, 길이, 대화 역할, 모델 ID를 검사                                                                                            |
| [`setup.ts`](../src/lib/ai/server/setup.ts#L23)                           | 환경 변수     | API 키, 기본 모델, effort, 재시도 횟수를 읽고 SDK 클라이언트를 만듦. 키가 없거나 `AI_MOCK=1`이면 SDK의 fetch만 가짜로 바꿈                              |
| [`prompt.ts`](../src/lib/ai/server/prompt.ts#L17)                         | 모델 입력     | 시스템 지침, `propose_edits` 도구 스키마, 메시지. 시트는 `B2 = "1,000"`처럼 JSON 문자열 값으로 보냄                                                     |
| [`claude.ts`](../src/lib/ai/server/claude.ts#L86)                         | 모델 호출     | SDK 스트림을 `AiStreamEvent`로 바꿈. 최대 토큰 도달은 `truncated` 경고로, SDK 오류는 앱 오류 코드로([`toAiError`](../src/lib/ai/server/claude.ts#L170)) |
| [`edit-stream-parser.ts`](../src/lib/ai/server/edit-stream-parser.ts#L15) | 모델 출력     | 조각난 도구 입력 JSON에서 `edits` 원소가 완전히 닫힌 경우에만 `JSON.parse`. 주소 대문자화, 숫자 값 문자열화, 길이 제한                                  |
| [`mock-anthropic.ts`](../src/lib/ai/server/mock-anthropic.ts#L30)         | 테스트        | 실제 API와 같은 SSE 형식으로 답하는 가짜 fetch. 지연, 한도, 인증 오류, 과부하, 거절, 잘림을 재현                                                        |

가짜 모드도 실제와 같은 경로를 지납니다.

```
가짜 fetch → Anthropic SDK → claude.ts → AiStreamEvent → transport → AiController
```

그래서 가짜 모드에서 확인한 스트리밍과 오류 처리가 실제 Claude 호출에서도 똑같이 동작합니다.

</details>

<br>

## 9. 정리: 테스트, 한계, 확장 (19:00–20:00)

📂 [coedit-tabs.test.ts](../tests/unit/ai/coedit-tabs.test.ts) → [README 4. 아직 남은 한계](../README.md#4-아직-남은-한계) → [README 5. 네트워크 확장](../README.md#5-공동-편집-구조를-실제-네트워크-기반-동기화로-확장한다면)

🗣 정리하면, 화면은 두 이음매에서 로직을 받아 쓰기만 하고, 로직은 다섯 가지 모양으로 역할을 나눴습니다. `lib`에 React가 없고 의존성을 좁은 인터페이스로 받기 때문에, 테스트가 모두 Node에서 돕니다. 실제 세션 두 개를 열어 데모에서 본 충돌 상황을 그대로 재현해 검증합니다.

🗣 한계도 있습니다. 같은 셀을 동시에 확정하면 먼저 확정한 값이 사라집니다. 잠금이 다른 탭에 전달되기 전의 아주 짧은 순간에 한 입력은 막지 못합니다. 이 틈을 막으려면 순서를 정해 주는 서버가 필요합니다.

🗣 서버로 넓힐 때는 ① `createSheetSession`에서 `BroadcastChannelProvider`를 `WebsocketProvider`로 바꾸면 됩니다. 메시지 형식을 y-websocket과 같게 맞춰 두었기 때문입니다. ② 아래의 Provider, 컨트롤러, 화면은 그대로 쓸 수 있습니다.

🗣 이상입니다. 질문 받겠습니다.

<details>
<summary>📦 참고: 공동 편집이 부딪히는 지점 (질문 대비)</summary>

| 상황                                      | 처리 방식                                                                           | 코드                                                              |
| ----------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 두 사람이 다른 셀을 동시에 확정           | 키가 달라서 둘 다 남음                                                              | [document.ts](../src/lib/sheet/document.ts#L15)                   |
| 두 사람이 같은 셀을 동시에 확정           | Yjs 규칙으로 한쪽 값만 남음. 모든 탭이 같은 결과로 맞춰짐                           | Yjs 기본 동작                                                     |
| 남이 입력 중인 셀                         | 확정 전 글자를 셀 위에 겹쳐 보여 줌 (문서엔 없음)                                   | [RemoteDrafts](../src/components/sheet/grid/RemoteDrafts.tsx#L23) |
| AI 결과를 기다리는 사이 남이 그 셀을 바꿈 | 충돌로 표시하고 기본은 건너뜀. 덮어쓰기를 고를 수 있음                              | [classifyCell](../src/lib/ai/coedit.ts#L22)                       |
| 덮어쓰기를 고른 뒤 값이 또 바뀜           | 덮어쓰기는 고를 때 본 값에만 유효. 새 값이면 다시 건너뜀                            | [evaluateProposals](../src/lib/ai/coedit.ts#L36)                  |
| AI 요청자가 셀 잠금을 켬                  | 끝날 때까지 다른 탭은 그 범위에서 편집·서식·지우기가 막힘                           | [blockIfLocked](../src/lib/controller/sheet-controller.ts#L298)   |
| 잠근 탭이 갑자기 닫힘                     | Web Locks로 감지해 바로 풀림                                                        | [liveness.ts](../src/lib/collab/liveness.ts#L18)                  |
| AI 요청 둘의 범위가 겹침                  | 둘 다 잠금 없음 → 허용(먼저 적용된 쪽이 나중 쪽의 충돌). 남이 잠근 범위 → 요청 불가 | [overlappingAi](../src/lib/ai/coedit.ts#L107)                     |
| 실행 취소                                 | 내 탭에서 한 변경만 되돌림                                                          | [undo.ts](../src/lib/collab/undo.ts#L10)                          |
| 적용 중에 다른 탭 메시지가 끼어듦         | 판정과 쓰기를 같은 동기 코드에서 해서 끼어들 수 없음                                | [apply](../src/lib/ai/ai-controller.ts#L184)                      |

</details>
