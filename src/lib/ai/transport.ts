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
    super(info.message);
  }
}

export interface AiTransportOptions {
  signal: AbortSignal;
  onEvent: (event: AiStreamEvent) => void;
}

/** 요청을 보내고 이벤트를 하나씩 넘긴다. 스트림이 끝나면 resolve, 실패하면 AiRequestError로 reject. */
export type AiTransport = (request: AiEditRequest, options: AiTransportOptions) => Promise<void>;

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
    throw new AiRequestError(aiError("network", "응답을 받는 중에 연결이 끊겼어요."));
  }
};
