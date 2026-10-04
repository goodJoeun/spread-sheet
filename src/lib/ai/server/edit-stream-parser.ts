import "server-only";
import { AI_LIMITS } from "../protocol";

export interface ParsedEdit {
  cell: string;
  value: string;
}

/**
 * 조각조각 도착하는 도구 입력({"edits":[...]})에서 완성된 원소를 하나씩 꺼낸다.
 * SDK의 부분 JSON 해석은 잘린 문자열을 조용히 받아들일 수 있어, 원소가 닫힐 때만 JSON.parse로 엄격하게 읽는다.
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
