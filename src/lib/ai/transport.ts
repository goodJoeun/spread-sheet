import {
  AI_ENDPOINT,
  aiError,
  errorFromResponse,
  parseStreamEvent,
  type AiEditRequest,
  type AiErrorInfo,
  type AiStreamEvent,
} from "./protocol";

export class AiRequestError extends Error {
  constructor(readonly info: AiErrorInfo) {
    super(`AI request failed: ${info.reason ?? info.code}`);
  }
}

export interface AiTransportOptions {
  signal: AbortSignal;
  onEvent: (event: AiStreamEvent) => void;
}

/** 요청을 보내고 이벤트를 하나씩 넘긴다. 스트림이 끝나면 resolve, 실패하면 AiRequestError로 reject. */
export type AiTransport = (request: AiEditRequest, options: AiTransportOptions) => Promise<void>;

/** 조각나 도착하는 응답을 줄 단위로 나눔. 줄바꿈이 아직 안 온 마지막 조각은 다음 조각까지 보관함. */
export function createLineSplitter() {
  let rest = "";
  return {
    push(chunk: string): string[] {
      rest += chunk;
      const lines = rest.split("\n");
      rest = lines.pop() ?? "";
      return lines;
    },
    flush(): string[] {
      const last = rest;
      rest = "";
      return last ? [last] : [];
    },
  };
}

// [기능 설명: AI 편집 3/9] /api/ai/edit에 POST하고, NDJSON 응답을 한 줄씩 이벤트로 넘김.
/** 실제 전송. /api/ai/edit에 POST하고 NDJSON 응답을 이벤트로 넘김. 네트워크·HTTP·도중 끊김 오류는 AiRequestError로 바꿈. */
export const fetchAiTransport: AiTransport = async (request, { signal, onEvent }) => {
  let response: Response;
  try {
    response = await fetch(AI_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new AiRequestError(aiError("network"));
  }

  if (!response.ok || !response.body) {
    const body: unknown = await response.json().catch(() => null);
    throw new AiRequestError(errorFromResponse(response.status, body));
  }

  const handle = (line: string) => {
    if (!line.trim()) return;
    try {
      const event = parseStreamEvent(JSON.parse(line));
      if (event) onEvent(event);
    } catch {
      // 해석할 수 없는 줄은 건너뛴다.
    }
  };

  const splitter = createLineSplitter();
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      splitter.push(value).forEach(handle);
    }
    splitter.flush().forEach(handle);
  } catch (error) {
    if (signal.aborted) throw error;
    throw new AiRequestError(aiError("network", "connection_lost"));
  }
};
