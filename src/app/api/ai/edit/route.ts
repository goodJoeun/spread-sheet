import {
  AI_ERRORS,
  aiError,
  type AiConnectionInfo,
  type AiErrorInfo,
  type AiStreamEvent,
} from "@/lib/ai/protocol";
import { AiProviderError, streamClaudeEdits } from "@/lib/ai/server/claude";
import { getClaudeSetup } from "@/lib/ai/server/setup";
import { parseEditRequest } from "@/lib/ai/server/validate";

/** API 키는 서버에서만 읽음. 브라우저로는 보내지 않음. */

const encoder = new TextEncoder();
const line = (event: AiStreamEvent) => encoder.encode(`${JSON.stringify(event)}\n`);

function errorResponse(error: AiErrorInfo): Response {
  return Response.json({ error }, { status: AI_ERRORS[error.code].status });
}

export async function GET(): Promise<Response> {
  const { provider, defaultModel, models } = getClaudeSetup();
  const info: AiConnectionInfo = { provider, defaultModel, models };
  return Response.json(info, { headers: { "cache-control": "no-store" } });
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

  const setup = getClaudeSetup();
  // 고를 수 있게 한 모델만 받는다. 브라우저가 임의의 모델로 비용을 쓰지 못하게.
  if (editRequest.model && !setup.models.some((m) => m.id === editRequest.model)) {
    return errorResponse(aiError("bad_request", "model_not_offered"));
  }

  // 브라우저가 요청을 취소하면(중단 버튼, 탭 닫기) request.signal이 끊기고 모델 호출도 멈춘다.
  const events = streamClaudeEdits(setup, editRequest, request.signal);

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
