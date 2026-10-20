# 발표 스크립트 (20분)

`SheetApp`에서 출발해 화면 트리를 위에서 아래로 내려가면서, 각 지점에 어떤 로직이 어떤 모양으로 선언돼 붙는지 설명합니다. 링크를 누르면 해당 파일의 그 줄로 넘어갑니다.

- VS Code에서 `Ctrl+Shift+V`(미리보기)로 열고 링크를 클릭하면 됩니다. 편집기에서는 `Ctrl+클릭`입니다.
- 📂 열 코드 · 🗣 말할 내용 · 🖥 화면 조작 · 🧱 이 지점의 로직 선언 방식

<br>

## 먼저 볼 지도

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

lib의 코드는 하는 일에 따라 다섯 가지 모양으로 선언돼 있습니다. 각 장의 🧱에서 이 이름으로 부릅니다.

| 모양 | 언제 쓰나 | 예 |
| --- | --- | --- |
| **팩토리 함수** | 여러 부품을 조립해 객체 하나로 돌려줄 때 | `createSheetSession`, `createStore`, `createUndoManager` |
| **클래스** | 상태를 들고 오래 살며, 구독 시작(`connect`)과 정리(`destroy`)가 있을 때 | `SheetController`, `AiController`, `Presence`, `BroadcastChannelProvider` |
| **문서 함수** | Y.Doc을 첫 인자로 받아 읽고 쓸 때 | `document.ts`의 `getValue(doc, …)`, `writeValues(doc, …, origin)` |
| **순수 함수** | 입력만으로 결과가 정해지는 판단 | `resolveGridKey`, `applyNavigation`, `classifyCell`, `participantStatus` |
| **계약 타입** | 경계를 넘는 데이터의 모양 | `protocol.ts`, `presence-state.ts`, `run.ts` |

| 순서 | 내용 | 시간 |
| --- | --- | --- |
| 1 | 소개 | 1분 |
| 2 | 데모 | 2.5분 |
| 3 | page → SheetApp | 1분 |
| 4 | ① useSheetSession → createSheetSession | 3분 |
| 5 | ② SheetProvider | 3분 |
| 6 | Shell 아래 부품들 | 2분 |
| 7 | Grid: 키 하나가 다른 탭에 닿기까지 | 3분 |
| 8 | AiPanel: AI 편집과 공동 편집 ⭐ | 3.5분 |
| 9 | 정리: 테스트, 한계, 확장 | 1분 |

<br>

## 1. 소개 (0:00–1:00)

📂 [README.md](../README.md)

🗣 여러 사람이 동시에 편집하고 AI의 도움도 받을 수 있는 웹 스프레드시트를 만들었습니다. 조건은 서버 없이 브라우저 API만으로 공동 편집을 구현하는 것이었습니다. 서버는 AI 호출에만 씁니다.

🗣 데모를 짧게 보여 드린 뒤, 화면이 그려지는 순서대로 내려가면서 각 화면 뒤에 어떤 로직이 어떻게 붙어 있는지 설명하겠습니다.

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

🗣 페이지는 `SheetApp`에 시트 ID `"default"`를 넘기는 게 전부입니다. 시트는 하나이고, 같은 주소를 연 탭은 모두 같은 시트를 봅니다.

🗣 `SheetApp`은 두 번 그려집니다. 처음에는 세션이 없어서 껍데기(`Shell`) 안에 "불러오는 중"만 보여 주고, 저장된 내용을 다 불러오면 `SheetProvider`로 감싼 실제 화면을 그립니다.

🗣 이 파일에서 로직이 꽂히는 곳은 두 군데입니다. `useSheetSession`(①)과 `SheetProvider`(②)입니다. 이 둘을 차례로 보겠습니다.

<br>

## 4. ① useSheetSession → createSheetSession (4:30–7:30)

### 4-1. hook은 세션의 수명만 관리합니다

📂 [useSheetSession](../src/hooks/sheet/useSheetSession.ts#L11) → [세션 생성](../src/hooks/sheet/useSheetSession.ts#L15) → [whenLoaded](../src/hooks/sheet/useSheetSession.ts#L20) → [정리](../src/hooks/sheet/useSheetSession.ts#L37)

🗣 세션은 채널을 열고 저장소에 연결하는 등 바깥 자원을 잡습니다. 그래서 렌더링 중이 아니라 `useEffect` 안에서 만들고, 컴포넌트가 사라지면 `destroy`로 정리합니다. hook이 하는 일은 만들기, 다 불러올 때까지 기다리기, 정리하기뿐입니다. 세션이 어떻게 조립되는지는 모릅니다.

### 4-2. createSheetSession: 팩토리 함수가 부품을 조립합니다

📂 [SheetSession 인터페이스](../src/lib/collab/session.ts#L10) → [createSheetSession](../src/lib/collab/session.ts#L43) → [돌려주는 객체](../src/lib/collab/session.ts#L78)

🧱 **팩토리 함수.** 부품 다섯 개를 만들어 서로 잇고, 바깥에는 `SheetSession` 인터페이스 하나로 내보냅니다. 부품을 어떻게 이었는지는 이 함수 안에만 있습니다.

| 부품 | 선언 모양 | 하는 일 |
| --- | --- | --- |
| `Y.Doc` | Yjs 클래스 | 셀 값과 서식의 원본 |
| `IndexeddbPersistence` | y-indexeddb 클래스 | 변경을 브라우저에 저장하고, 열 때 불러옴 |
| [`BroadcastChannelProvider`](../src/lib/collab/broadcast-provider.ts#L28) | 직접 만든 클래스 | 다른 탭과 변경을 주고받음 |
| [`Presence`](../src/lib/collab/presence.ts#L24) | 직접 만든 클래스 | 이름, 색, 커서, 입력 중인 글자 (저장 안 함) |
| [`createUndoManager`](../src/lib/collab/undo.ts#L10) | 팩토리 함수 | 이 탭에서 한 편집만 실행 취소 |

🗣 확정된 셀 값은 문서(Y.Doc)에 담겨 저장되고 실행 취소 대상이 됩니다. 커서나 입력 중인 글자는 참여 상태(awareness)에 담겨 공유만 되고 저장되지 않습니다. "확정되지 않은 것은 문서에 넣지 않는다"가 앱 전체의 원칙입니다.

🗣 저장과 전송을 문서와 따로 붙였기 때문에, 서버로 넓힐 때 이 함수에서 전송 부품 하나만 바꾸면 됩니다.

### 4-3. 탭끼리 맞추는 방법

📂 [broadcast-provider.ts 상단 주석](../src/lib/collab/broadcast-provider.ts#L7) → [announce](../src/lib/collab/broadcast-provider.ts#L53) → [handleDocUpdate](../src/lib/collab/broadcast-provider.ts#L109)

🗣 메모리를 공유하는 게 아니라, 탭마다 사본을 갖고 변경 기록을 주고받아 같은 상태로 수렴합니다. 새 탭은 "어디까지 가지고 있다"를 먼저 보내고 빠진 기록만 받습니다. 그 뒤로는 편집할 때마다 변경을 보냅니다. [111줄](../src/lib/collab/broadcast-provider.ts#L111)에서 받은 변경은 다시 보내지 않습니다.

### 4-4. 문서 안의 모양: 문서 함수와 계약 타입

📂 [schema.ts](../src/lib/sheet/schema.ts#L18) → [document.ts 상단 결정](../src/lib/sheet/document.ts#L15) → [EditOrigin](../src/lib/sheet/document.ts#L27) → [writeValues](../src/lib/sheet/document.ts#L79)

🧱 **문서 함수.** Y.Doc을 감싸는 클래스를 만들지 않았습니다. `writeValues(doc, writes, origin)`처럼 문서를 첫 인자로 받는 함수들입니다. 문서를 고치는 길은 이 파일 하나이고, 모든 쓰기에 출처(`user-edit`, `ai-apply`)를 붙입니다. 실행 취소는 이 출처만 대상으로 해서, 다른 탭의 입력은 지우지 않습니다.

🗣 셀은 `"B2"` 같은 평평한 키로 저장합니다. 빈 셀에 두 사람이 동시에 처음 입력해도 두 변경이 모두 남게 하기 위해서입니다. 시트 크기와 서식 종류는 Yjs를 모르는 `schema.ts`에 두어, 화면, AI 프롬프트, 서버 검증이 같은 규칙을 씁니다.

### 4-5. Presence: 다른 탭에서 온 값은 들어오는 곳에서 한 번만 맞춥니다

📂 [Presence](../src/lib/collab/presence.ts#L24) → [PresenceState 계약](../src/lib/collab/presence-state.ts#L28) → [isPresenceState](../src/lib/collab/presence-state.ts#L76) → [normalizePresenceState](../src/lib/collab/presence-state.ts#L97) → [TabLiveness](../src/lib/collab/liveness.ts#L18)

🧱 **클래스 + 계약 타입.** 참여 상태의 모양은 `presence-state.ts`에 계약으로 두고, `Presence` 클래스는 그 계약을 지키며 보내고 받습니다. 다른 탭은 이전 버전 코드로 돌 수도 있습니다. 그래서 받은 값은 형식을 확인하고 좌표를 시트 안으로 맞춘 뒤에 참여자 목록에 넣습니다. 목록을 쓰는 화면은 다시 확인하지 않아도 됩니다.

🗣 탭이 닫혔는지는 `TabLiveness`가 Web Locks로 알아챕니다. 처음 계획한 주기적 신호(heartbeat) 방식은 가려진 탭이 목록에서 깜빡여서 바꿨습니다.

<br>

## 5. ② SheetProvider (7:30–10:30)

### 5-1. Provider는 화면을 그리지 않고, 명령 객체를 만들어 내려 줍니다

📂 [SheetProvider](../src/components/sheet/SheetContext.tsx#L22) → [컨트롤러 생성](../src/components/sheet/SheetContext.tsx#L29) → [connect](../src/components/sheet/SheetContext.tsx#L35) → [Context 반환](../src/components/sheet/SheetContext.tsx#L42) → [useSheet](../src/components/sheet/SheetContext.tsx#L45)

🗣 `SheetProvider`가 return하는 것은 `<SheetContext>{children}</SheetContext>`뿐입니다. 화면 부품은 `SheetApp`이 `children`으로 넣어 줍니다. Provider가 하는 일은 세션을 받아 명령 객체 두 개를 만들고, Context로 내려 주는 것입니다.

```ts
const controller = new SheetController(session);
const ai = new AiController(session.doc, controller, fetchAiTransport, session.presence);
```

🗣 객체는 `useMemo`로 만들고, 구독 시작(`connect`)은 `useEffect`에서 합니다. React 개발 모드가 객체를 두 번 만들어도 구독이 새지 않게 하기 위해서입니다.

### 5-2. 컨트롤러는 필요한 것만 좁은 인터페이스로 받습니다

📂 [ControllerSession](../src/lib/controller/sheet-controller.ts#L45) → [SheetView](../src/lib/controller/sheet-controller.ts#L36) → [AiSheetBinding · AiPresenceBinding](../src/lib/ai/ai-controller.ts#L47) → [AiController 생성자](../src/lib/ai/ai-controller.ts#L78)

🧱 **클래스 + 좁은 인터페이스 주입.** 두 컨트롤러는 다른 모듈의 클래스를 import하지 않습니다. 생성자에서 "이런 메서드가 있는 것"을 받습니다.

| 받는 쪽 | 받는 것 | 실제로 넣는 것 |
| --- | --- | --- |
| `SheetController` | `ControllerSession` (doc, undoManager, presence의 메서드 몇 개) | `session` |
| `SheetController` | `SheetView` (스크롤, 포커스, 편집칸 글자) | Grid가 나중에 붙여 줌 (§7) |
| `AiController` | `AiSheetBinding` (확정, 선택, 포커스) | `controller` |
| `AiController` | `AiTransport` (요청 함수) | `fetchAiTransport` |
| `AiController` | `AiPresenceBinding` (AI 상태 알리기) | `session.presence` |

🗣 이렇게 한 이유는 두 가지입니다. 첫째, `lib/ai`가 `SheetController`를 몰라도 됩니다. 그래서 AI 기능을 빼도 시트는 그대로 돕니다. 둘째, 테스트에서 가짜 객체를 넣을 수 있습니다. 컨트롤러를 화면 없이, 네트워크 없이 테스트할 수 있는 이유가 여기 있습니다.

### 5-3. 컨트롤러의 상태는 Store 필드로 드러납니다

📂 [SheetController의 Store 필드](../src/lib/controller/sheet-controller.ts#L77) → [AiController의 Store 필드](../src/lib/ai/ai-controller.ts#L61) → [store.ts](../src/lib/store.ts#L10) → [useStore](../src/hooks/useStore.ts#L5)

🧱 **팩토리 함수(Store).** 컨트롤러는 화면이 알아야 할 상태를 `readonly selection = createStore(...)`처럼 공개 필드로 둡니다. 컨트롤러 안에서는 `get()`으로 바로 읽고, 화면은 `useStore`로 구독만 합니다.

🗣 키를 누르는 순간에는 다음 화면이 그려지기를 기다리지 않고 최신 선택 위치를 바로 읽어야 합니다. 그래서 React state가 아니라 컨트롤러 안에 둡니다. 필요한 기능은 읽기, 바꾸기, 알리기뿐이라 라이브러리 없이 직접 만들었고, 구독은 React 표준 방식인 `useSyncExternalStore`로 합니다.

<br>

## 6. Shell 아래 부품들 (10:30–12:30)

📂 [Shell](../src/components/sheet/SheetApp.tsx#L56) → [ParticipantList](../src/components/sheet/participant-list/index.tsx#L16) → [Toolbar](../src/components/sheet/toolbar/index.tsx#L71) → [FormulaBar](../src/components/sheet/FormulaBar.tsx#L14) → [Workspace](../src/components/sheet/SheetApp.tsx#L45)

### 6-1. 기능의 맨 위 부품이 꺼내고 구독합니다

🗣 부품마다 첫 줄에서 `useSheet()`로 필요한 걸 꺼내고, 필요한 Store만 구독합니다. 예를 들어 `FormulaBar`는 선택, 편집 상태, 입력 중인 글자를 구독합니다. 그래서 선택이 바뀌면 수식 입력줄은 다시 그려지지만 다른 부품은 그대로입니다.

🗣 구조 규칙으로 "데이터는 위에서 읽고 아래로 내린다"를 정해 두었습니다([SKILL.md](../.claude/skills/project-structure/SKILL.md)). Context와 Store 구독은 기능의 맨 위 부품에서만 하고, 그 아래 부품은 props만 받습니다.

🗣 `Workspace`는 `SheetApp` 안에 따로 둔 작은 부품입니다. `SheetApp`은 Provider 바깥이라 `useSheet()`를 부를 수 없기 때문입니다. `aiPanel` Store를 보고 그리드 옆에 AI 패널을 붙일지 정합니다.

### 6-2. hook은 두 종류입니다

| 종류 | 하는 일 | 예 |
| --- | --- | --- |
| 구독 hook | lib의 값을 화면에 연결 | [useStore](../src/hooks/useStore.ts#L5), [useDocVersion](../src/hooks/sheet/useDocVersion.ts#L40), [useParticipants](../src/hooks/sheet/useParticipants.ts#L5), [useUndoState](../src/hooks/sheet/useUndoState.ts#L45) |
| 이벤트 hook | DOM 이벤트를 컨트롤러 명령으로 바꿈 | [useCellEditor](../src/hooks/grid/useCellEditor.ts#L15), [useGridPointer](../src/hooks/grid/useGridPointer.ts#L14), [useFormulaInput](../src/hooks/sheet/useFormulaInput.ts#L19) |

🗣 구독 hook은 모두 `useSyncExternalStore` 한 가지 방법을 씁니다. Store, Y.Doc, 참여자 목록, 실행 취소 상태처럼 React 바깥 값은 전부 같은 방식으로 화면에 연결됩니다.

### 6-3. 무엇을 보여 줄지는 순수 함수가 정합니다

📂 [participantStatus](../src/lib/collab/messages.ts#L9) → [ParticipantRows에서 사용](../src/components/sheet/participant-list/ParticipantRows.tsx#L50)

🧱 **순수 함수.** "B2 입력 중", "AI 결과 검토 중 · 잠금" 같은 문구는 기능마다 `messages.ts`의 함수가 정합니다. 부품은 결과를 마크업으로 바꾸기만 합니다. 그래서 판단은 화면 없이 테스트하고, 문구는 `resources/strings.ts` 한 곳에서 고칩니다.

<br>

## 7. Grid: 키 하나가 다른 탭에 닿기까지 (12:30–15:30)

### 7-1. Grid는 컨트롤러에 DOM 일을 붙여 주고, 층을 쌓아 그립니다

📂 [Grid](../src/components/sheet/grid/Grid.tsx#L37) → [구독](../src/components/sheet/grid/Grid.tsx#L38) → [attachView](../src/components/sheet/grid/Grid.tsx#L54) → [층](../src/components/sheet/grid/Grid.tsx#L93) → [layers.ts](../src/components/sheet/grid/layers.ts#L3)

🗣 5-2에서 컨트롤러가 받는다고 한 `SheetView`를 여기서 붙입니다. 스크롤, 포커스, 편집칸 글자 읽기처럼 DOM이 필요한 일만 Grid가 맡고, 컨트롤러는 그걸 부르기만 합니다.

🗣 셀 값은 화면에 복사하지 않습니다. `useDocVersion`으로 "바뀌었다"는 신호만 받고, 그릴 때 문서에서 직접 읽습니다. 그 위에 다른 사람의 입력 중 글자, 커서, AI 작업 표시, AI 미리보기, 내 선택, 안내, 편집칸을 차례로 쌓습니다. 쌓는 순서는 `layers.ts` 한 곳에 있습니다.

### 7-2. 판단은 순수 함수, 실행은 컨트롤러, 쓰기는 문서 함수

📂 [useCellEditor](../src/hooks/grid/useCellEditor.ts#L15) → [resolveGridKey 호출](../src/hooks/grid/useCellEditor.ts#L49) → [resolveGridKey](../src/lib/sheet/keymap.ts#L99) → [runAction](../src/lib/controller/sheet-controller.ts#L343) → [applyNavigation](../src/lib/sheet/navigation.ts#L52) → [commitEdit](../src/lib/controller/sheet-controller.ts#L195) → [writeValues](../src/lib/sheet/document.ts#L79) → [handleDocUpdate](../src/lib/collab/broadcast-provider.ts#L109) → [useDocVersion](../src/hooks/sheet/useDocVersion.ts#L40)

🗣 지금까지 본 층이 한 번에 이어지는 흐름입니다. B2에 "100"을 입력하고 Enter를 누르면 이렇게 흘러갑니다.

| 단계 | 어디서 | 선언 모양 |
| --- | --- | --- |
| 1. 투명한 편집칸이 키를 받음 | `useCellEditor` | 이벤트 hook |
| 2. 어떤 동작인지 정함 | `resolveGridKey` | 순수 함수 |
| 3. 명령 실행, 편집 확정 | `SheetController.runAction` → `commitEdit` | 클래스 |
| 4. 다음 칸 계산 | `applyNavigation` | 순수 함수 |
| 5. 출처 `user-edit`를 붙여 문서에 씀 | `writeValues` | 문서 함수 |
| 6. 다른 탭에 보내고 저장 | `BroadcastChannelProvider`, IndexedDB | 클래스 (세션 부품) |
| 7. 받은 탭의 버전이 올라 다시 그림 | `useDocVersion` | 구독 hook |

🗣 판단을 순수 함수로 뺐기 때문에, Tab 다음 Enter나 Ctrl+방향키 같은 엑셀 규칙을 화면 없이 테스트할 수 있습니다. 이동 규칙은 처음엔 576줄짜리 Grid 안에 있었는데, 이 기준으로 [순수 함수로 뺐습니다](../src/lib/sheet/navigation.ts#L50).

🗣 한글 입력 때문에 편집칸은 항상 선택한 셀 위에서 포커스를 갖고 있습니다. 편집을 시작할 때 포커스를 옮기면 첫 자모가 사라지기 때문입니다. [조합 중](../src/hooks/grid/useCellEditor.ts#L57)에 누른 Enter는 시트가 처리하지 않습니다.

<br>

## 8. AiPanel: AI 편집과 공동 편집 (15:30–19:00) ⭐

> 시간이 모자라도 이 부분은 줄이지 않습니다. 이 과제만의 고민이 가장 많이 드러나는 곳입니다.

### 8-1. 요청: 브라우저에서 서버까지

📂 [AiPanel](../src/components/sheet/ai/AiPanel.tsx#L19) → [AiComposer](../src/components/sheet/ai/AiComposer.tsx#L29) → [send](../src/lib/ai/ai-controller.ts#L147) → [snapshotCells](../src/lib/ai/request.ts#L10) → [AiTransport 타입](../src/lib/ai/transport.ts#L23) → [protocol.ts](../src/lib/ai/protocol.ts#L1) → [route POST](../src/app/api/ai/edit/route.ts#L28) → [streamClaudeEdits](../src/lib/ai/server/claude.ts#L86) → [createEditStreamParser](../src/lib/ai/server/edit-stream-parser.ts#L15)

🗣 `AiPanel`도 다른 부품처럼 `useSheet()`로 `AiController`를 꺼내 씁니다. 요청할 때 그 순간의 셀 값(요청 때 값)을 함께 보내고, 이 값을 기록해 둡니다.

🧱 **계약 타입이 경계를 나눕니다.** 브라우저와 서버는 `protocol.ts`의 타입으로만 대화합니다. 서버는 오류 코드만 보내고, 화면 문구는 브라우저가 고릅니다. 서버 쪽 파일은 경계를 하나씩 맡습니다.

| 서버 파일 | 맡은 경계 |
| --- | --- |
| [`route.ts`](../src/app/api/ai/edit/route.ts#L28) | HTTP. `lib/ai/server`를 부르는 얇은 어댑터 |
| [`validate.ts`](../src/lib/ai/server/validate.ts#L35) | 브라우저에서 들어온 입력 (zod) |
| [`edit-stream-parser.ts`](../src/lib/ai/server/edit-stream-parser.ts#L15) | 모델에서 나온 출력 |
| [`setup.ts`](../src/lib/ai/server/setup.ts#L23) | 환경 변수, API 키 (`server-only`) |

🗣 결과는 도구 호출 `{ cell, value }`로 스트리밍해서 받습니다. SDK는 덜 만들어진 문자열도 받아들여서 `"1250"` 대신 `"12"`가 보일 수 있었습니다. 그래서 셀 값 하나가 완전히 도착했을 때만 읽는 파서를 직접 만들었습니다.

### 8-2. 받기: 실행 상태는 순수 함수로 쌓고, 충돌은 매번 다시 계산합니다

📂 [handleEvent](../src/lib/ai/ai-controller.ts#L294) → [applyProgress](../src/lib/ai/run.ts#L99) → [states](../src/lib/ai/ai-controller.ts#L102) → [classifyCell](../src/lib/ai/coedit.ts#L22) → [ConflictBanner](../src/components/sheet/ai/run-card/ConflictBanner.tsx)

🧱 **순수 함수.** 받은 제안은 `applyProgress(run, event)`가 새 실행 객체를 만들어 쌓습니다. 시트에는 아직 쓰지 않습니다. 충돌 판정 `classifyCell(요청 때 값, 현재 값, 제안 값)`은 값 세 개만 보는 함수입니다. 생성 중 수정, 검토 중 수정, 겹치는 동시 요청을 따로 처리하지 않고 이 함수 하나로 다룹니다.

🗣 판정 결과를 저장하지 않고 그릴 때마다 현재 값과 다시 비교합니다. 그래서 바꾼 사람이 원래 값으로 되돌리면 충돌도 저절로 풀립니다.

🗣 왜 충돌한 셀을 기본으로 건너뛸까요? AI 결과는 다시 요청하면 또 만들 수 있지만, 사람이 입력한 값은 사라지면 되살리기 어렵기 때문입니다.

### 8-3. 적용: 같은 문서 함수, 다른 출처

📂 [apply](../src/lib/ai/ai-controller.ts#L184)

🗣 적용할 때는 7-2에서 본 `writeValues`를 그대로 쓰고, 출처만 `ai-apply`로 붙입니다. 내가 입력 중이던 값을 먼저 확정하고, 판정과 쓰기를 같은 동기 코드에서 합니다. 그래서 그 사이에 다른 탭의 변경이 끼어들 수 없습니다. 한 번에 쓰므로 실행 취소 한 번으로 모두 되돌릴 수 있습니다.

### 8-4. 다른 사람에게 보이는 것: 참여 상태에 얹고, 컨트롤러가 막습니다

📂 [publishActivity](../src/lib/ai/ai-controller.ts#L347) → [RemoteAiActivity](../src/components/sheet/grid/RemoteAiActivity.tsx) → [locks.ts 결정](../src/lib/collab/locks.ts#L5) → [lockHolder](../src/lib/collab/locks.ts#L19) → [blockIfLocked](../src/lib/controller/sheet-controller.ts#L298)

🗣 AI 작업 상태와 잠금은 새 저장소를 만들지 않고, 커서처럼 참여 상태에 얹어 보냅니다. 그래서 7-1의 `RemoteAiActivity` 층에 "○○ · AI 결과 검토 중"이 보이고, 잠근 탭이 닫히면 잠금도 함께 사라집니다. AI 제안 값 자체는 보여 주지 않습니다. 범위 전체에 깔려서 실제 데이터처럼 보이기 쉽기 때문입니다.

🧱 **모듈 방향을 지키는 위치 선정.** 잠그는 쪽은 AI이고 막는 쪽은 `SheetController`입니다. 그런데 `lib/collab`은 `lib/ai`를 몰라야 합니다. 그래서 잠금 판정 `lockHolder`를 "참여 상태로 편집 허용을 정하는 규칙"으로 보고 `collab`에 두었습니다. 막는 곳은 5-2에서 본 컨트롤러의 `blockIfLocked` 한 곳입니다.

🗣 기본은 막지 않고 알리기만 합니다(soft lock). 사람의 작업 흐름이 AI 때문에 끊기면 안 되기 때문입니다. 확인 창도 띄우지 않습니다. 포커스를 빼앗으면 한글 조합이 끊깁니다. 확실히 막고 싶을 때만 셀 잠금(hard lock)을 켭니다.

<br>

## 9. 정리: 테스트, 한계, 확장 (19:00–20:00)

📂 [coedit-tabs.test.ts](../tests/unit/ai/coedit-tabs.test.ts) → [README 4. 아직 남은 한계](../README.md#4-아직-남은-한계) → [README 5. 네트워크 확장](../README.md#5-공동-편집-구조를-실제-네트워크-기반-동기화로-확장한다면)

🗣 정리하면, 화면은 두 이음매에서 로직을 받아 쓰기만 하고, 로직은 다섯 가지 모양으로 역할을 나눴습니다. `lib`에 React가 없고 의존성을 좁은 인터페이스로 받기 때문에, 테스트가 모두 Node에서 돕니다. 실제 세션 두 개를 열어 데모에서 본 충돌 상황을 그대로 재현해 검증합니다.

🗣 한계도 있습니다. 같은 셀을 동시에 확정하면 먼저 확정한 값이 사라집니다. 잠금이 다른 탭에 전달되기 전의 아주 짧은 순간에 한 입력은 막지 못합니다. 이 틈을 막으려면 순서를 정해 주는 서버가 필요합니다.

🗣 서버로 넓힐 때는 ① `createSheetSession`에서 `BroadcastChannelProvider`를 `WebsocketProvider`로 바꾸면 됩니다. 메시지 형식을 y-websocket과 같게 맞춰 두었기 때문입니다. ② 아래의 Provider, 컨트롤러, 화면은 그대로 쓸 수 있습니다.

🗣 이상입니다. 질문 받겠습니다.
