# spread-sheet

여러 탭에서 동시에 편집하고, AI의 도움을 받아 편집할 수 있는 웹 스프레드시트입니다.

> 개발 중입니다.

## 실행 방법

Node.js 20 이상이 필요합니다.

```bash
npm install
cp .env.example .env.local   # ANTHROPIC_API_KEY 입력
npm run dev
```

브라우저에서 http://localhost:3000 을 열고, 같은 주소를 탭 여러 개로 열면 각 탭이 서로 다른 참여자가 됩니다.

## 스크립트

| 명령                | 설명                 |
| ------------------- | -------------------- |
| `npm run dev`       | 개발 서버            |
| `npm run build`     | 프로덕션 빌드        |
| `npm run lint`      | ESLint               |
| `npm run typecheck` | TypeScript 타입 검사 |
| `npm test`          | Vitest 단위 테스트   |
| `npm run format`    | Prettier 포맷        |
