import { AI_LIMITS } from "../protocol";

export interface ParsedEdit {
  cell: string;
  value: string;
}

/**
 * propose_edits 도구 입력({"edits":[{...},{...}]})이 조각조각 도착할 때,
 * 완성된 edits 원소를 하나씩 꺼낸다.
 *
 * SDK도 부분 JSON을 관대하게 해석하지만, 잘린 문자열을 조용히 받아들일 수 있다.
 * 여기서는 원소 하나가 닫는 괄호까지 다 도착했을 때만 JSON.parse로 엄격하게 읽고 형식을 확인한다.
 */
export function createEditStreamParser() {
  let buffer = "";
  let scanned = 0;
  let inString = false;
  let escaped = false;
  /** 열린 괄호들. 루트 객체 "{" 안의 배열 "[" 안의 객체가 edits 원소다. */
  const stack: string[] = [];
  let elementStart = -1;

  function readElement(json: string): ParsedEdit | null {
    let value: unknown;
    try {
      value = JSON.parse(json);
    } catch {
      return null;
    }
    if (typeof value !== "object" || value === null) return null;
    const { cell, value: raw } = value as { cell?: unknown; value?: unknown };
    if (typeof cell !== "string") return null;
    // 모델이 숫자를 문자열 대신 숫자로 보내는 경우도 받아 준다.
    if (typeof raw !== "string" && typeof raw !== "number") return null;
    return { cell: cell.trim().toUpperCase(), value: String(raw).slice(0, AI_LIMITS.cellValue) };
  }

  return {
    /** 새 조각을 넣고, 이번에 완성된 원소들을 돌려준다. 형식이 틀린 원소는 invalid로 센다. */
    push(chunk: string): { edits: ParsedEdit[]; invalid: number } {
      buffer += chunk;
      const edits: ParsedEdit[] = [];
      let invalid = 0;
      for (; scanned < buffer.length; scanned++) {
        const ch = buffer[scanned];
        if (inString) {
          if (escaped) escaped = false;
          else if (ch === "\\") escaped = true;
          else if (ch === '"') inString = false;
          continue;
        }
        if (ch === '"') {
          inString = true;
        } else if (ch === "{" || ch === "[") {
          if (ch === "{" && stack.length === 2 && stack[0] === "{" && stack[1] === "[") {
            elementStart = scanned;
          }
          stack.push(ch);
        } else if (ch === "}" || ch === "]") {
          stack.pop();
          if (ch === "}" && stack.length === 2 && elementStart >= 0) {
            const edit = readElement(buffer.slice(elementStart, scanned + 1));
            if (edit) edits.push(edit);
            else invalid++;
            elementStart = -1;
          }
        }
      }
      return { edits, invalid };
    },
  };
}
