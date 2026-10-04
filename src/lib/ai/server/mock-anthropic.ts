import {
  forEachCell,
  normalizeRange,
  parseA1,
  parseRangeA1,
  toA1,
  type CellCoord,
  type CellRange,
} from "@/lib/sheet/address";
import type { AiCell } from "../protocol";
import { EDIT_TOOL_NAME, parseUserMessage } from "./prompt";

/**
 * 가짜 Claude API. Anthropic SDK의 fetch 자리에 넣으면 실제 Messages API와 같은 형식으로 답한다.
 * - 정상: SSE 스트림(message_start → thinking → text → tool_use 입력 조각 → message_delta → message_stop)
 * - 실패: 실제와 같은 오류 JSON과 상태 코드
 * SDK가 응답을 해석하는 과정까지 실제와 같으므로, 이걸로 개발한 코드는 API 키만 넣으면 실제 모델에서 돈다.
 *
 * 지시문에 아래 표시를 넣으면 실패·지연 상황을 재현한다(개발·시연용).
 *   [느림] 첫 응답 8초 지연   [한도] 429 요청 한도   [키] 401 인증 실패
 *   [과부하] 생성 도중 과부하 오류   [거절] 모델 거절   [잘림] 최대 길이에서 끊김
 */

interface MockOptions {
  /** 지연 배율. 테스트에서는 0으로 기다림 없이 돌린다. */
  delayScale?: number;
}

type Scenario =
  "normal" | "slow" | "rate_limited" | "auth" | "overloaded" | "refusal" | "truncated";

const SCENARIO_TAGS: Array<[string, Scenario]> = [
  ["[느림]", "slow"],
  ["[한도]", "rate_limited"],
  ["[키]", "auth"],
  ["[과부하]", "overloaded"],
  ["[거절]", "refusal"],
  ["[잘림]", "truncated"],
];

export function createMockAnthropicFetch({ delayScale = 1 }: MockOptions = {}): typeof fetch {
  return async (_input, init) => {
    const signal = init?.signal ?? undefined;
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      model?: string;
      messages?: Array<{ role: string; content: unknown }>;
    };
    const lastUser = [...(body.messages ?? [])].reverse().find((m) => m.role === "user");
    const prompt = typeof lastUser?.content === "string" ? lastUser.content : "";
    const { cells, range, instruction } = parseUserMessage(prompt);
    const scenario = SCENARIO_TAGS.find(([tag]) => instruction.includes(tag))?.[1] ?? "normal";
    const cleanInstruction = SCENARIO_TAGS.reduce((s, [tag]) => s.split(tag).join(""), instruction);

    const wait = (ms: number) => sleep(ms * delayScale, signal);

    if (scenario === "rate_limited") {
      await wait(300);
      return errorResponse(
        429,
        "rate_limit_error",
        "Number of requests has exceeded your rate limit.",
      );
    }
    if (scenario === "auth") {
      await wait(300);
      return errorResponse(401, "authentication_error", "invalid x-api-key");
    }
    await wait(scenario === "slow" ? 8000 : 400);

    const plan = planResponse(cells, range, cleanInstruction);
    const model = body.model ?? "mock";
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const encoder = new TextEncoder();
        const send = (event: string, data: unknown) =>
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        try {
          send("message_start", {
            type: "message_start",
            message: {
              id: "msg_mock",
              type: "message",
              role: "assistant",
              model,
              content: [],
              stop_reason: null,
              stop_sequence: null,
              usage: { input_tokens: Math.ceil(prompt.length / 4), output_tokens: 1 },
            },
          });

          // Opus 5.5는 항상 먼저 생각한다(기본 설정에서는 생각 내용이 비어서 온다).
          send("content_block_start", {
            type: "content_block_start",
            index: 0,
            content_block: { type: "thinking", thinking: "", signature: "" },
          });
          await wait(700);
          send("content_block_delta", {
            type: "content_block_delta",
            index: 0,
            delta: { type: "signature_delta", signature: "mock-signature" },
          });
          send("content_block_stop", { type: "content_block_stop", index: 0 });

          send("content_block_start", {
            type: "content_block_start",
            index: 1,
            content_block: { type: "text", text: "" },
          });
          const text = scenario === "refusal" ? "이 요청은" : plan.text;
          for (const piece of chunk(text, 3)) {
            await wait(30);
            send("content_block_delta", {
              type: "content_block_delta",
              index: 1,
              delta: { type: "text_delta", text: piece },
            });
          }
          send("content_block_stop", { type: "content_block_stop", index: 1 });

          let stopReason = "end_turn";
          if (scenario === "refusal") {
            stopReason = "refusal";
          } else if (plan.edits.length > 0) {
            stopReason = "tool_use";
            send("content_block_start", {
              type: "content_block_start",
              index: 2,
              content_block: {
                type: "tool_use",
                id: "toolu_mock",
                name: EDIT_TOOL_NAME,
                input: {},
              },
            });
            const pieces = chunk(JSON.stringify({ edits: plan.edits }), 16);
            const cutAt = scenario === "truncated" ? Math.ceil(pieces.length * 0.6) : pieces.length;
            for (const [i, piece] of pieces.entries()) {
              if (i >= cutAt) break;
              if (scenario === "overloaded" && i === Math.floor(pieces.length / 2)) {
                send("error", {
                  type: "error",
                  error: { type: "overloaded_error", message: "Overloaded" },
                });
                controller.close();
                return;
              }
              await wait(25);
              send("content_block_delta", {
                type: "content_block_delta",
                index: 2,
                delta: { type: "input_json_delta", partial_json: piece },
              });
            }
            send("content_block_stop", { type: "content_block_stop", index: 2 });
            if (scenario === "truncated") stopReason = "max_tokens";
          }

          send("message_delta", {
            type: "message_delta",
            delta: { stop_reason: stopReason, stop_sequence: null },
            usage: { output_tokens: 200 + plan.edits.length * 20 },
          });
          send("message_stop", { type: "message_stop" });
          controller.close();
        } catch {
          // 요청이 취소되면(브라우저가 중단) 더 보내지 않는다.
          try {
            controller.close();
          } catch {
            // 이미 닫힘
          }
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: { "content-type": "text/event-stream", "request-id": "req_mock" },
    });
  };
}

function errorResponse(status: number, type: string, message: string): Response {
  return new Response(JSON.stringify({ type: "error", error: { type, message } }), {
    status,
    // 실제 API라면 SDK가 자동 재시도하지만, 가짜 오류는 바로 화면에서 확인할 수 있게 재시도를 끈다.
    headers: {
      "content-type": "application/json",
      "x-should-retry": "false",
      "request-id": "req_mock",
    },
  });
}

function sleep(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    if (ms <= 0) return resolve();
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

function chunk(text: string, size: number): string[] {
  const chars = Array.from(text);
  const pieces: string[] = [];
  for (let i = 0; i < chars.length; i += size) pieces.push(chars.slice(i, i + size).join(""));
  return pieces;
}

/* ───────────── 가짜 답 만들기 ───────────── */

interface Plan {
  text: string;
  edits: AiCell[];
}

const NUMBER = /^-?[\d,]+(\.\d+)?$/;

/** 지시문의 몇 가지 낱말만 알아듣는 흉내. 실제 모델로 바꾸면 이 부분은 쓰이지 않는다. */
export function planResponse(cells: AiCell[], range: string | null, instruction: string): Plan {
  const values = new Map(cells.map((c) => [c.cell, c.value]));
  const target = (range && parseRangeA1(range)) || boundingBox(cells) || parseRangeA1("A1:C5")!;
  const coords: CellCoord[] = [];
  forEachCell(target, (coord) => coords.push(coord));
  const valueAt = (coord: CellCoord) => values.get(toA1(coord)) ?? "";
  const where = range ? `${range} 범위` : "시트";
  const said = instruction.trim();

  if (/대문자|upper/i.test(said)) {
    const edits = coords
      .filter((c) => valueAt(c) !== valueAt(c).toUpperCase())
      .map((c) => ({ cell: toA1(c), value: valueAt(c).toUpperCase() }));
    return withText(edits, `(가짜 응답) ${where}의 영문 ${edits.length}칸을 대문자로 바꿀게요.`);
  }
  if (/두\s*배|2\s*배|double/i.test(said)) {
    const edits = coords
      .filter((c) => NUMBER.test(valueAt(c)))
      .map((c) => {
        const raw = valueAt(c);
        const doubled = Number(raw.replace(/,/g, "")) * 2;
        return {
          cell: toA1(c),
          value: raw.includes(",") ? doubled.toLocaleString("en-US") : String(doubled),
        };
      });
    return withText(edits, `(가짜 응답) ${where}의 숫자 ${edits.length}개를 두 배로 바꿀게요.`);
  }
  if (/지워|비워|clear/i.test(said)) {
    const edits = coords
      .filter((c) => valueAt(c) !== "")
      .map((c) => ({ cell: toA1(c), value: "" }));
    return withText(edits, `(가짜 응답) ${where}의 값 ${edits.length}개를 지울게요.`);
  }
  if (/[?？]$/.test(said)) {
    return {
      text: `(가짜 응답) 지금 시트에는 값이 있는 셀이 ${cells.length}개 있어요. 실제 모델을 연결하면 질문에 제대로 답해요.`,
      edits: [],
    };
  }
  const empty = coords.filter((c) => valueAt(c) === "");
  const edits = empty.map((c, i) => ({ cell: toA1(c), value: `예시 ${i + 1}` }));
  return withText(edits, `(가짜 응답) ${where}의 빈칸 ${edits.length}개를 예시 값으로 채울게요.`);
}

function withText(edits: AiCell[], text: string): Plan {
  return edits.length > 0
    ? { text, edits }
    : { text: "(가짜 응답) 바꿀 셀을 찾지 못했어요.", edits };
}

function boundingBox(cells: AiCell[]): CellRange | null {
  const coords = cells.map((c) => parseA1(c.cell)).filter((c): c is CellCoord => c !== null);
  if (coords.length === 0) return null;
  return coords.reduce<CellRange>(
    (box, c) =>
      normalizeRange(
        { row: Math.min(box.start.row, c.row), col: Math.min(box.start.col, c.col) },
        { row: Math.max(box.end.row, c.row), col: Math.max(box.end.col, c.col) },
      ),
    { start: coords[0], end: coords[0] },
  );
}
