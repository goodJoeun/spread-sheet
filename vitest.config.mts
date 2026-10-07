import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // server-only import는 Next가 처리함. 테스트는 서버 코드를 직접 부르므로 빈 모듈로 바꿈.
      "server-only": fileURLToPath(
        new URL("./node_modules/next/dist/compiled/server-only/empty.js", import.meta.url),
      ),
    },
  },
  test: {
    // 단위 테스트는 tests/unit 아래에 src/lib와 같은 분류로 둠(tests/e2e는 Playwright용).
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx"],
    environment: "node",
  },
});
