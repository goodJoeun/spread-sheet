import type { Participant } from "@/lib/collab/presence-state";
import type { CellCoord } from "@/lib/sheet/address";
import { sameCoord } from "@/lib/sheet/selection";
import { strings } from "@/resources/strings";
import { aiActivitiesAt, blockingOverlaps, type AiOverlap } from "./coedit";
import { isAiModelId, type AiErrorInfo, type AiModelId, type AiWarning } from "./protocol";
import type { AiRun } from "./run";

// [결정] 처음엔 서버가 오류 문구를 보냈음. 서버는 코드만 보내고 문구는 여기서 고르게 바꿈. 문구를 고칠 때 서버를 건드리지 않게.
/** AI 기능의 상태를 화면 문구로 바꿈. 서버가 보낸 코드도 여기서 문구가 됨. */

/** 서버가 보낸 오류 코드(와 세부 이유)를 화면 문구로 바꿈. */
export function aiErrorMessage(error: AiErrorInfo): string {
  return strings.ai.errors[error.reason ?? error.code];
}

/** 서버가 보낸 경고 코드를 화면 문구로 바꿈. */
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

/** AI_MODELS에 모델을 추가하고 설명을 빠뜨리면 여기서 타입 오류가 남. */
const MODEL_DESCRIPTIONS: Readonly<Record<AiModelId, string>> = strings.ai.models.descriptions;

/** 모델 선택 목록에 보일 모델 설명. 목록에 없는 모델은 서버가 기본값으로 정한 모델로 봄. */
export function modelDescription(id: string): string {
  return isAiModelId(id) ? MODEL_DESCRIPTIONS[id] : strings.ai.models.serverDefault;
}

export interface StatusLine {
  text: string;
  tone: "muted" | "warn" | "success" | "danger";
  icon: "spinner" | "check" | "alert" | null;
}

/** 실행 카드 맨 위에 보일 진행 상태(문구·아이콘·색조). 같은 대기 중이라도 연결·지연 여부에 따라 "요청 중", "생각 중", "응답 지연"으로 나눔. 답만 한 실행은 null. */
export function runStatusLine(run: AiRun, undoKey: string): StatusLine | null {
  const S = strings.ai.run.status;
  const line = (
    text: string,
    icon: StatusLine["icon"] = null,
    tone: StatusLine["tone"] = "muted",
  ): StatusLine => ({ text, tone, icon });

  switch (run.status) {
    case "waiting":
      if (run.slow) return line(S.slow, "spinner", "warn");
      return line(run.connected ? S.thinking : S.requesting, "spinner");
    case "streaming":
      if (run.slow) return line(S.stalled, "spinner", "warn");
      return line(
        run.proposals.length > 0 ? S.proposing(run.proposals.length) : S.writing,
        "spinner",
      );
    case "review":
      return line(S.review(run.proposals.length));
    case "answered":
      return null;
    case "applied": {
      const skipped = run.result?.skipped ?? 0;
      const skippedText = skipped > 0 ? S.appliedSkipped(skipped) : "";
      if (run.result?.applied === 0) return line(S.nothingApplied(skippedText));
      return line(S.applied(undoKey, skippedText), "check", "success");
    }
    case "discarded":
      return line(S.discarded);
    case "cancelled":
      return line(S.cancelled);
    case "error":
      return line(run.error ? aiErrorMessage(run.error) : S.error, "alert", "danger");
  }
}

export interface OverlapNotice {
  text: string;
  /** 이 범위에는 지금 요청할 수 없음 */
  blocking: boolean;
}

/** AI 요청창 위에 띄울 안내. 다른 사람의 AI 작업과 범위가 겹칠 때만 있음. lock은 내 셀 잠금이 켜져 있는지. */
export function overlapNotice(overlaps: readonly AiOverlap[], lock: boolean): OverlapNotice | null {
  const C = strings.ai.composer;
  // 여러 사람이 겹치면, 모두 검토 중일 때만 "검토 중"으로 알림.
  const describe = (list: readonly AiOverlap[]) => ({
    names: list.map((o) => o.participant.user.name).join(", "),
    stage: list.every((o) => o.activity.status === "reviewing")
      ? ("reviewing" as const)
      : ("generating" as const),
  });
  const lockedByOthers = overlaps.filter((o) => o.activity.locked);
  if (lockedByOthers.length > 0) {
    const { names, stage } = describe(lockedByOthers);
    return { text: C.lockedByOther(names, stage), blocking: true };
  }
  if (overlaps.length === 0) return null;
  const { names, stage } = describe(overlaps);
  if (blockingOverlaps(overlaps, lock).length > 0) {
    return { text: C.cannotLock(names, stage), blocking: true };
  }
  return { text: C.overlap(names, stage), blocking: false };
}

// [기능 설명: 입력 중인 값 4/4] 같은 셀을 다른 사람도 입력 중이면 편집칸 위에 안내를 띄움. 막지는 않음.
/** 편집칸 위에 띄울 안내 목록. 같은 셀을 다른 사람도 입력 중이거나 다른 사람의 AI 작업 범위일 때 알리되, 막지는 않음(입력한 셀은 그 사람의 AI 결과에서 충돌로 표시됨). */
export function editorNotices(participants: readonly Participant[], coord: CellCoord): string[] {
  const notices: string[] = [];
  const coEditors = participants.filter(
    (p) => !p.isSelf && p.editing && sameCoord(p.editing, coord),
  );
  if (coEditors.length > 0) {
    notices.push(strings.grid.coEditing(coEditors.map((p) => p.user.name).join(", ")));
  }
  for (const { participant, activity } of aiActivitiesAt(participants, coord)) {
    notices.push(strings.grid.inRemoteAiRange(participant.user.name, activity.status));
  }
  return notices;
}
