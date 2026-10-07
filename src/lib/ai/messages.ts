import type { Participant } from "@/lib/collab/presence-state";
import type { CellCoord } from "@/lib/sheet/address";
import { sameCoord } from "@/lib/sheet/selection";
import { strings } from "@/resources/strings";
import { aiActivitiesAt, blockingOverlaps, type AiOverlap } from "./coedit";
import type { AiErrorInfo, AiWarning } from "./protocol";
import type { AiRun } from "./run";

/** AI 기능의 상태를 화면 문구로 바꿈. 서버가 보낸 코드도 여기서 문구가 됨. */

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

/** 목록에 없는 모델은 서버가 기본값으로 정한 모델로 봄. */
export function modelDescription(id: string): string {
  const descriptions: Readonly<Record<string, string>> = strings.ai.models.descriptions;
  return descriptions[id] ?? strings.ai.models.serverDefault;
}

export interface StatusLine {
  text: string;
  tone: "muted" | "warn" | "success" | "danger";
  icon: "spinner" | "check" | "alert" | null;
}

/** 실행 카드 맨 위에 보이는 진행 상태. 답만 한 실행은 보여 줄 상태가 없어서 null */
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

/** AI 요청창 위에 뜨는 안내. 다른 참여자의 AI 편집과 범위가 겹칠 때만 있음. lock은 내 셀 잠금이 켜져 있는지. */
export function overlapNotice(overlaps: readonly AiOverlap[], lock: boolean): OverlapNotice | null {
  const C = strings.ai.composer;
  const describe = (list: readonly AiOverlap[]) => ({
    names: list.map((o) => o.participant.user.name).join(", "),
    reviewing: list.every((o) => o.activity.status === "reviewing"),
  });
  const lockedByOthers = overlaps.filter((o) => o.activity.locked);
  if (lockedByOthers.length > 0) {
    const { names, reviewing } = describe(lockedByOthers);
    return { text: C.lockedByOther(names, reviewing), blocking: true };
  }
  if (overlaps.length === 0) return null;
  const { names, reviewing } = describe(overlaps);
  if (blockingOverlaps(overlaps, lock).length > 0) {
    return { text: C.cannotLock(names, reviewing), blocking: true };
  }
  return { text: C.overlap(names, reviewing), blocking: false };
}

/**
 * 편집칸 위에 뜨는 안내.
 * 같은 셀을 동시에 입력하면 나중에 확정한 값이 남음. 다른 참여자의 AI 편집 범위여도 막지 않음.
 * (입력한 셀은 그 사람의 AI 결과에서 충돌로 표시됨)
 */
export function editorNotices(participants: readonly Participant[], coord: CellCoord): string[] {
  const notices: string[] = [];
  const coEditors = participants.filter(
    (p) => !p.isSelf && p.editing && sameCoord(p.editing, coord),
  );
  if (coEditors.length > 0) {
    notices.push(strings.grid.coEditing(coEditors.map((p) => p.user.name).join(", ")));
  }
  for (const { participant, activity } of aiActivitiesAt(participants, coord)) {
    notices.push(
      strings.grid.inRemoteAiRange(participant.user.name, activity.status === "reviewing"),
    );
  }
  return notices;
}
