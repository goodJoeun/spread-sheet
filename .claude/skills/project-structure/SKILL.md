---
name: project-structure
description: 이 프로젝트에서 컴포넌트를 나누거나 합칠 때, 새 파일·폴더를 어디에 둘지 정할 때, import 방향과 로직 위치를 판단할 때 따르는 규칙. 컴포넌트를 추가·분리·이동하거나 구조를 리뷰할 때 먼저 읽는다.
---

# 프로젝트 구조 규칙

목표는 "더 잘게 쪼개기"가 아니라 **한 기준으로 일관되게 판단하기**다. 이 문서의 규칙과 코드가 다르면 코드를 규칙에 맞추고, 규칙이 틀렸다면 이 문서를 먼저 고친다.

## 1. 컴포넌트 파일 나누기

### 같은 파일에 둔다 — 아래를 모두 만족할 때

- 이 파일 안에서만 쓴다.
- context·store·저장소(localStorage 등)·네트워크를 직접 다루지 않는다. 필요한 값은 props로만 받는다.
- 파일이 약 200줄 이하다.

### 파일로 분리한다 — 하나라도 해당할 때

- 두 개 이상의 파일에서 쓴다.
- 자기 데이터 출처가 있다: `useSheet()`, `useStore(...)`, `localStorage`, `fetch` 등을 직접 부른다.
- 파일이 약 200~250줄을 넘거나, 의미 있는 하위 컴포넌트가 셋 이상이다.
- 따로 테스트하거나 다른 곳에서 찾아 들어올 이유가 있다.

### 부모와 자식이 함께 커지면 폴더로 묶는다

```
ai/run-card/
  index.tsx          # AiRunCard만 export
  StatusLine.tsx
  ProposalRow.tsx
  ConflictBanner.tsx
```

- 폴더 밖에서는 `index.tsx`만 import한다. 자식 컴포넌트는 폴더 밖으로 export하지 않는다(공개 범위를 한 파일일 때와 같게 유지).
- 반대로 아주 작은 조각(약 30줄 이하)이 여러 파일로 흩어져 있고 한 곳에서만 쓰이면 합치는 것도 같은 규칙의 적용이다.

### 언제나 지킨다

- 컴포넌트 안에서 다른 컴포넌트를 선언하지 않는다(렌더할 때마다 새 타입이 되어 상태가 초기화된다). 하위 컴포넌트는 모듈 최상위에 둔다.
- **데이터는 위에서 읽고 아래로 내린다.** context(`useSheet`)와 store 구독은 기능의 최상위 컴포넌트에서 하고, 하위 컴포넌트는 props와 콜백만 받는다. 하위 컴포넌트가 직접 context를 읽어야 한다면 그 컴포넌트는 독립 기능이므로 파일로 분리한다.

## 2. 로직은 컴포넌트 밖에 둔다

- "상태 → 무엇을 보여 줄지"를 고르는 판단(상태별 문구·아이콘·색, 안내 메시지 목록, 참여자 상태 문구 등)은 순수 함수로 빼서 React 없이 테스트한다. 컴포넌트는 그 결과를 마크업으로 바꾸기만 한다.
- 상태를 화면 문구로 바꾸는 함수는 기능마다 `messages.ts` 한 파일에 모은다(예: `lib/ai/messages.ts`). `strings`를 읽어 문구를 만드는 lib 파일은 여기뿐이다. 아이콘·색은 문구와 함께 의미 값(`tone: "warn"`, `icon: "spinner"`)으로 돌려주고, 클래스·아이콘 컴포넌트로 바꾸는 일은 컴포넌트가 한다.
- 도메인 규칙(숫자 판정, 정렬 기본값, 시트 크기, 입력 길이 상한)은 한 곳에서 정의하고 가져다 쓴다. 컴포넌트·서버 프롬프트·검증 스키마에 숫자나 정규식을 다시 적지 않는다.
- 두 곳 이상에서 같은 계산을 하면 바로 묶는다. 특히:
  - 셀·범위에 붙는 이름표 위치 계산 → 공통 컴포넌트 하나
  - 셀 서식 → 인라인 스타일 변환 → 함수 하나
  - 실행 상태 판정(`waiting`/`streaming` 등) → `isRunning(run)` 같은 헬퍼 하나

## 3. 디렉터리와 import 방향

| 위치 | 책임 | import해도 되는 것 |
|---|---|---|
| `src/app/` | 라우팅만. `route.ts`는 `lib/ai/server`를 부르는 얇은 어댑터 | 모두 |
| `src/components/` | 화면. `ui/`는 도메인을 모르는 공통 부품 | hooks, lib, resources, styles |
| `src/hooks/` | React와 lib를 잇는 hook. 파일 하나에 hook 하나, 파일 이름 = hook 이름 | lib, resources |
| `src/lib/` | React 없는 로직. controller, 순수 함수, Yjs 모델, AI 프로토콜 | lib 안에서만, resources |
| `src/lib/ai/server/` | 서버 전용(API 키·`process.env`). 파일 맨 위에 `import "server-only"` | lib |
| `src/resources/` | 문구·색·이름 같은 정적 데이터 | 없음 |
| `src/styles/` | 디자인 토큰과 공통 클래스 | 없음 |

- 아래 방향으로만 import한다: `app → components → hooks → lib`. **hooks가 components를, lib가 hooks·components를 import하지 않는다.**
- `lib/sheet`는 `lib/collab`·`lib/ai`·`lib/controller`를 모른다. `lib/collab`은 `lib/ai`를 모른다.
- `lib/` 안에서는 `react`를 import하지 않는다.
- 같은 폴더 안의 두 파일이 서로를 import하지 않는다(타입만이어도). 공유 타입은 별도 파일로 뺀다.
- 서버와 브라우저 사이 형식(`lib/ai/protocol.ts`)에는 화면 문구를 싣지 않는다. 서버는 코드(와 개수 같은 값)를 보내고, 문구는 브라우저가 `strings`에서 고른다.
- `resources/strings.ts`는 화면에 보이는 문구만 둔다. 동작을 바꾸는 키(가짜 응답 시나리오 표시 등)는 그 기능의 설정에 둔다.

## 4. 판단 순서 (새 컴포넌트·파일을 만들 때)

1. 이 로직에 React가 필요한가? 아니면 `lib/`의 순수 함수나 controller로.
2. 이미 같은 계산·마크업이 다른 곳에 있는가? 있으면 먼저 묶는다.
3. 1장의 기준으로 같은 파일에 둘지, 파일·폴더로 나눌지 정한다.
4. 3장의 import 방향을 어기지 않는지 확인한다.

## 알려진 예외 (고치면 이 목록에서 지운다)

- `components/sheet/Toolbar.tsx`(약 280줄)의 `ColorMenu` → `toolbar/` 폴더 대상.
