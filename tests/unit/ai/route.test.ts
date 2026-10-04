import { beforeAll, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/ai/edit/route";
import { parseStreamEvent, type AiConnectionInfo, type AiEditRequest } from "@/lib/ai/protocol";

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

describe("GET /api/ai/edit", () => {
  it("tells whether it is the mock and which models can be picked", async () => {
    const info = (await (await GET()).json()) as AiConnectionInfo;
    expect(info.provider).toBe("mock");
    expect(info.models.map((m) => m.id)).toContain(info.defaultModel);
    expect(info.models.map((m) => m.id)).toContain("claude-haiku-4-5");
  });
});

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

  it("answers with the picked model and refuses models the server does not offer", async () => {
    const picked = await post({ ...body("대문자로"), model: "claude-haiku-4-5" });
    const first = parseStreamEvent(JSON.parse((await picked.text()).split("\n")[0]));
    expect(first).toEqual({ type: "meta", provider: "mock", model: "claude-haiku-4-5" });

    const unknown = await post({ ...body("대문자로"), model: "claude-unknown" });
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toMatchObject({ error: { code: "bad_request" } });
  });

  it("returns the HTTP status of errors that happen before streaming", async () => {
    const response = await post(body("[한도] 대문자로"));
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({
      error: { code: "rate_limited", retryable: true },
    });
  });
});
