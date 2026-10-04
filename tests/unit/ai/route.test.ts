import { beforeAll, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/ai/edit/route";
import { parseStreamEvent, type AiEditRequest } from "@/lib/ai/protocol";

// API 키 없이 → 가짜 Claude API(같은 SDK 경로). 지연 없이 돌린다.
beforeAll(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("AI_MOCK_DELAY_SCALE", "0");
});

const body = (instruction: string): AiEditRequest => ({
  instruction,
  range: "A1:A3",
  cells: [{ cell: "A1", value: "hello" }],
  history: [],
});

const post = (payload: unknown) =>
  POST(
    new Request("http://localhost/api/ai/edit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof payload === "string" ? payload : JSON.stringify(payload),
    }),
  );

describe("POST /api/ai/edit", () => {
  it("streams NDJSON events", async () => {
    const response = await post(body("대문자로"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/x-ndjson");
    const events = (await response.text())
      .trim()
      .split("\n")
      .map((line) => parseStreamEvent(JSON.parse(line)));
    expect(events[0]).toMatchObject({ type: "meta", provider: "mock" });
    expect(events).toContainEqual({ type: "edit", cell: "A1", value: "HELLO" });
    expect(events.at(-1)).toEqual({ type: "done" });
  });

  it("rejects malformed requests with 400", async () => {
    const bad = await post("{not json");
    expect(bad.status).toBe(400);
    const invalid = await post({ ...body("x"), range: "A1:ZZZ9999" });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ error: { code: "bad_request" } });
  });

  it("returns the HTTP status of errors that happen before streaming", async () => {
    const response = await post(body("[한도] 대문자로"));
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({
      error: { code: "rate_limited", retryable: true },
    });
  });
});
