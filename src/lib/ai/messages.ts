import { strings } from "@/resources/strings";
import type { AiErrorInfo, AiWarning } from "./protocol";

/** 서버가 보낸 코드를 화면 문구로 바꾼다. */

export function aiErrorMessage(error: AiErrorInfo): string {
  return strings.ai.errors[error.reason ?? error.code];
}

export function aiWarningMessage(warning: AiWarning): string {
  switch (warning.code) {
    case "truncated":
      return strings.ai.warnings.truncated;
    case "invalid_edits":
      return strings.ai.warnings.invalidEdits(warning.count);
    case "unparsable":
      return strings.ai.warnings.unparsable;
  }
}

/** 목록에 없는 모델은 서버가 기본값으로 정한 모델이다. */
export function modelDescription(id: string): string {
  const descriptions: Readonly<Record<string, string>> = strings.ai.models.descriptions;
  return descriptions[id] ?? strings.ai.models.serverDefault;
}
