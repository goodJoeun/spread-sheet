import { AI_ERRORS, aiError, type AiErrorInfo, type AiStreamEvent } from "@/lib/ai/protocol";
import { AiProviderError, streamClaudeEdits } from "@/lib/ai/server/claude";
import { getClaudeSetup } from "@/lib/ai/server/setup";
import { parseEditRequest } from "@/lib/ai/server/validate";

/**
 * POST /api/ai/edit — 시트 편집 제안을 NDJSON 스트림으로 돌려준다.
 * API 키는 이 서버 코드에서만 읽고 브라우저로 보내지 않는다.
 */

const encoder = new TextEncoder();
const line = (event: AiStreamEvent) => encoder.encode(`${JSON.stringify(event)}\n`);

function errorResponse(error: AiErrorInfo): Response {
  return Response.json({ error }, { status: AI_ERRORS[error.code].status });
}

/** GET /api/ai/edit — 연결 상태(실제 Claude인지 가짜인지, 모델). 패널 머리말에 보여 준다. */
export async function GET(): Promise<Response> {
  const { provider, model } = getClaudeSetup();
  return Response.json({ provider, model }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(aiError("bad_request"));
  }
  const editRequest = parseEditRequest(body);
  if (!editRequest) return errorResponse(aiError("bad_request"));

  // 브라우저가 요청을 취소하면(중단 버튼, 탭 닫기) request.signal이 끊기고 모델 호출도 멈춘다.
  const events = streamClaudeEdits(getClaudeSetup(), editRequest, request.signal);

  // 첫 이벤트까지 기다린다. 스트림 시작 전에 실패하면(키 오류, 요청 한도 등) HTTP 오류로 알린다.
  let first: IteratorResult<AiStreamEvent>;
  try {
    first = await events.next();
  } catch (error) {
    if (error instanceof AiProviderError) return errorResponse(error.info);
    console.error("[ai] unexpected error", error);
    return errorResponse(aiError("unknown"));
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      if (first.done) controller.close();
      else controller.enqueue(line(first.value));
    },
    async pull(controller) {
      try {
        const { value, done } = await events.next();
        if (done) controller.close();
        else controller.enqueue(line(value));
      } catch (error) {
        console.error("[ai] stream failed", error);
        controller.enqueue(line({ type: "error", error: aiError("unknown") }));
        controller.close();
      }
    },
    async cancel() {
      await events.return(undefined);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store, no-transform",
    },
  });
}
