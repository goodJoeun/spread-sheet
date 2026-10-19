import type * as Y from "yjs";
import type { AiActivity, Participant } from "@/lib/collab/presence-state";
import { boundingRange, rangeToA1, type CellCoord, type CellRange } from "@/lib/sheet/address";
import { EditOrigin, valuesOf, writeValues } from "@/lib/sheet/document";
import { clipToSheet } from "@/lib/sheet/schema";
import type { Selection } from "@/lib/sheet/selection";
import { createStore } from "@/lib/store";
import {
  aiActivityOf,
  blockingOverlaps,
  evaluateProposals,
  overlappingAi,
  summarize,
  writable,
  type ProposalState,
} from "./coedit";
import {
  AI_LIMITS,
  aiError,
  type AiEditRequest,
  type AiErrorInfo,
  type AiStreamEvent,
} from "./protocol";
import { conversationHistory, snapshotCells } from "./request";
import {
  applyProgress,
  createRun,
  finishRun,
  isReviewing,
  isRunning,
  type AiMessage,
  type AiRun,
  type AiRunInit,
} from "./run";
import { AiRequestError, type AiTransport } from "./transport";

// [흐름 21] 첫 버전부터 요청 때 값(base)을 기록해 둠. 다음 커밋의 충돌 판단(흐름 22)이 이 값 위에 얹힘.
// 시트는 SheetController가 아니라 AiSheetBinding으로만 받아 lib/ai가 컨트롤러를 모르게 함.
/**
 * AI 결과는 제안으로만 들고 있다가, 적용할 때 한 트랜잭션으로 한꺼번에 씀. 그래서 실행 취소 한 번으로 모두 되돌릴 수 있음.
 * 요청 때 값(base)과 달라진 셀은 다른 참여자가 바꾼 것으로 보고 기본으로 건너뜀.
 */

export const SLOW_AFTER_MS = 5_000;
export const IDLE_TIMEOUT_MS = 60_000;

export interface AiSheetBinding {
  commitEdit(): void;
  select(selection: Selection, reveal?: CellCoord | null): void;
  reveal(coord: CellCoord): void;
  focus(): void;
}

export interface AiPresenceBinding {
  setAi(activity: AiActivity | null): void;
  /** 없으면 다른 참여자가 없는 것으로 봄. */
  getParticipants?(): readonly Participant[];
}

export class AiController {
  readonly messages = createStore<AiMessage[]>([]);
  /** 미리보기에 그릴 실행(생성 중이거나 검토 중). 없으면 null */
  readonly active = createStore<AiRun | null>(null);
  readonly showOriginal = createStore(false);
  /** 다음 요청에 쓸 모델. null이면 서버 기본 모델 */
  readonly model = createStore<string | null>(null);
  /** 충돌한 셀 중 덮어쓰기로 고른 셀: 셀 → 고를 때 본 값 */
  readonly overwrites = createStore<ReadonlyMap<string, string>>(new Map());
  /** 셀 잠금 토글. 켜 두면 다음 요청부터, 실행이 끝날 때까지 요청 범위를 다른 참여자가 바꿀 수 없음. */
  readonly lockCells = createStore(false);

  private nextId = 1;
  private inflight: { runId: number; abort: AbortController } | null = null;
  private slowTimer: ReturnType<typeof setTimeout> | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private publishedActivity = "";

  constructor(
    private readonly doc: Y.Doc,
    private readonly sheet: AiSheetBinding,
    private readonly transport: AiTransport,
    private readonly presence: AiPresenceBinding = { setAi() {} },
  ) {}

  /** 내 AI 작업 상태를 다른 탭에 알리기 시작하고 정리 함수를 돌려줌. 생성자가 아니라 여기서 구독해서, React 개발 모드가 정리했다가 다시 연결해도 구독이 새거나 끊기지 않음. */
  connect(): () => void {
    this.publishedActivity = "";
    this.publishActivity();
    const off = this.active.subscribe(() => this.publishActivity());
    return () => {
      off();
      this.publishedActivity = "";
      this.presence.setAi(null);
    };
  }

  /**
   * 제안마다 현재 문서 값과 비교한 상태(same·clean·conflict)를 계산함.
   * 결과를 저장하지 않고 매번 다시 비교해서, 바꾼 사람이 원래 값으로 되돌리면 충돌도 저절로 풀림.
   */
  states(run: AiRun | null = this.active.get()): ProposalState[] {
    if (!run) return [];
    const values = valuesOf(this.doc);
    return evaluateProposals(
      run.proposals,
      (cell) => values.get(cell) ?? "",
      this.overwrites.get(),
    );
  }

  /** 충돌한 셀 하나를 덮어쓸지 정함. 고를 때 본 현재 값을 함께 기억함. */
  setOverwrite(cell: string, overwrite: boolean): void {
    const state = this.states().find((s) => s.proposal.cell === cell);
    if (!state || state.status !== "conflict") return;
    this.overwrites.set((prev) => {
      const next = new Map(prev);
      if (overwrite) next.set(cell, state.current);
      else next.delete(cell);
      return next;
    });
  }

  /** 충돌한 셀 전체를 한 번에 덮어쓰거나 모두 건너뜀. */
  setOverwriteAll(overwrite: boolean): void {
    const conflicts = this.states().filter((s) => s.status === "conflict");
    this.overwrites.set((prev) => {
      const next = new Map(prev);
      for (const s of conflicts) {
        if (overwrite) next.set(s.proposal.cell, s.current);
        else next.delete(s.proposal.cell);
      }
      return next;
    });
  }

  /** 생성 중이거나 검토를 기다리는 결과가 있으면 새 요청을 받지 않음. */
  isBusy(): boolean {
    const run = this.active.get();
    return this.inflight !== null || isReviewing(run);
  }

  /** 지시문과 범위로 AI 요청을 시작함. 요청에 실은 셀 값이 요청 때 값(base)이 됨. 보냈으면 true. */
  send(instruction: string, scope: CellRange | null): boolean {
    const text = instruction.trim().slice(0, AI_LIMITS.instruction);
    if (!text || this.isBusy()) return false;
    const range = scope ? clipToSheet(scope) : null;
    const locked = this.lockCells.get();
    if (this.isBlockedByOtherAi(range, locked)) return false;

    const cells = snapshotCells(this.doc);
    const model = this.model.get();
    const request: AiEditRequest = {
      instruction: text,
      range: range ? rangeToA1(range) : null,
      cells,
      // 이번 요청을 대화에 넣기 전에 만들어야 이번 지시문이 이전 대화에 겹쳐 들어가지 않음.
      history: conversationHistory(this.messages.get()),
      ...(model ? { model } : {}),
    };
    // 요청에 실은 셀 값이 곧 요청 때 값(base). 적용할 때 이 값과 지금 값을 비교함.
    const base = new Map(cells.map((c) => [c.cell, c.value]));
    const run = this.beginRun({ instruction: text, scope: range, model, base, locked });
    this.stream(run.id, request);
    return true;
  }

  /** 생성 중인 요청을 중단함. 서버의 모델 호출도 함께 끊김. */
  cancel(): void {
    const current = this.inflight;
    if (!current) return;
    this.endRequest();
    current.abort.abort();
    this.updateRun(current.runId, (run) => ({ ...run, status: "cancelled", slow: false }));
    this.active.set(null);
  }

  /** 검토 중인 제안 중 적용할 수 있는 것만 한 트랜잭션(ai-apply)으로 씀. 실행 취소 한 번으로 모두 되돌아감. */
  apply(): void {
    const run = this.active.get();
    if (!isReviewing(run) || run.proposals.length === 0) return;

    // 내가 입력 중이던 값도 먼저 확정함. 그 셀이 제안 대상이면 충돌로 판단됨.
    this.sheet.commitEdit();
    // 화면에 보이던 상태가 아니라 지금 값으로 다시 판단함. 판단과 쓰기를 같은 동기 코드에서 하므로,
    // 그 사이에 다른 탭의 변경(BroadcastChannel 메시지)이 끼어들 수 없음.
    const states = this.states(run);
    const writes = states.filter(writable).map((s) => s.proposal);
    const skipped = summarize(states).skipped;

    const box = boundingRange(writes.map((p) => p.coord));
    if (box) {
      // 적용 직전에 선택을 바뀔 범위로 옮겨 둠. 그래야 실행 취소했을 때 이 범위로 돌아옴.
      this.sheet.select({ anchor: box.start, focus: box.end, active: box.start }, box.start);
      writeValues(
        this.doc,
        writes.map((p) => ({ coord: p.coord, value: p.after })),
        EditOrigin.Ai,
      );
    }

    this.updateRun(run.id, (r) => ({
      ...r,
      status: "applied",
      result: { applied: writes.length, skipped },
    }));
    this.closeReview();
  }

  /** 지금 제안을 버리고 같은 요청을 최신 시트 기준으로 다시 보냄("지금 값으로 다시 요청"). */
  regenerate(): boolean {
    const run = this.active.get();
    if (!isReviewing(run)) return false;
    this.discard();
    return this.send(run.instruction, run.scope);
  }

  /** 검토 중인 제안을 문서에 쓰지 않고 버림. */
  discard(): void {
    const run = this.active.get();
    if (!isReviewing(run)) return;
    this.updateRun(run.id, (r) => ({ ...r, status: "discarded" }));
    this.closeReview();
  }

  /** 실패한 요청을 다시 보냄. 원래 요청의 모델이 아니라 지금 고른 모델로 보냄. */
  retry(runId: number): boolean {
    const run = this.findRun(runId);
    return run ? this.send(run.instruction, run.scope) : false;
  }

  /** 진행 중인 요청을 끊고 정리함. 컨트롤러를 버릴 때 부름. */
  destroy(): void {
    const current = this.inflight;
    this.endRequest();
    current?.abort.abort();
  }

  /** 다른 사람의 AI 작업 때문에 이 요청을 막아야 하는지 확인함. 남이 잠근 범위에는 요청할 수 없고, 내가 잠그려면 겹치는 AI 작업이 없어야 함. */
  private isBlockedByOtherAi(range: CellRange | null, locked: boolean): boolean {
    const overlaps = overlappingAi(this.presence.getParticipants?.() ?? [], range);
    return blockingOverlaps(overlaps, locked).length > 0;
  }

  /** 새 실행을 만들어 요청과 함께 대화에 넣고, 미리보기에 그릴 실행(active)으로 정함. */
  private beginRun(init: Omit<AiRunInit, "id">): AiRun {
    const userMessageId = this.nextId++;
    const run = createRun({ ...init, id: this.nextId++ });
    this.messages.set((list) => [
      ...list,
      { id: userMessageId, role: "user", text: init.instruction, scope: init.scope },
      { id: run.id, role: "assistant", run },
    ]);
    this.showOriginal.set(false);
    this.overwrites.set(new Map());
    this.active.set(run);
    return run;
  }

  /** 요청을 보내고 받은 이벤트를 실행에 반영함. done 없이 끝나거나 요청이 실패하면 오류로 끝냄. */
  private stream(runId: number, request: AiEditRequest): void {
    const abort = new AbortController();
    this.inflight = { runId, abort };
    this.armWatchdog();

    let finished = false;
    this.transport(request, {
      signal: abort.signal,
      onEvent: (event) => {
        if (this.inflight?.runId !== runId) return;
        this.armWatchdog();
        if (this.handleEvent(runId, event)) finished = true;
      },
    })
      .then(() => {
        if (!finished && this.inflight?.runId === runId) {
          this.fail(runId, aiError("network", "stream_dropped"));
        }
      })
      .catch((error: unknown) => {
        // 중단·시간 초과·완료로 이미 정리된 실행이면 무시함.
        if (this.inflight?.runId !== runId) return;
        this.fail(runId, error instanceof AiRequestError ? error.info : aiError("network"));
      });
  }

  /** 스트림 이벤트 하나를 실행에 반영함. 첫 셀 제안이 오면 그 셀로 화면을 옮김. 실행이 끝났으면 true. */
  private handleEvent(runId: number, event: AiStreamEvent): boolean {
    if (event.type === "done") {
      this.finish(runId);
      return true;
    }
    if (event.type === "error") {
      this.fail(runId, event.error);
      return true;
    }
    const hadProposals = (this.findRun(runId)?.proposals.length ?? 0) > 0;
    this.updateRun(runId, (r) => applyProgress(r, event));
    // 첫 제안이 오면 그 셀로 화면을 옮김. 다른 곳을 보고 있어도 생성 과정을 볼 수 있게.
    const first = this.findRun(runId)?.proposals[0];
    if (!hadProposals && first) this.sheet.reveal(first.coord);
    return false;
  }

  /** 스트림이 정상으로 끝났을 때. 셀 제안이 있으면 검토 상태로 남김. */
  private finish(runId: number): void {
    this.endRequest();
    this.updateRun(runId, finishRun);
    const run = this.findRun(runId);
    this.active.set(isReviewing(run) ? run : null);
  }

  /** 실행을 오류로 끝냄. 아직 응답을 받는 중이면 요청도 끊음. */
  private fail(runId: number, error: AiErrorInfo): void {
    const current = this.inflight;
    this.endRequest();
    // 시간 초과처럼 아직 응답을 받는 중이면 요청도 끊음.
    if (current?.runId === runId) current.abort.abort();
    this.updateRun(runId, (r) => ({ ...r, status: "error", slow: false, error }));
    this.active.set(null);
  }

  /** 대화 목록에서 id로 실행을 찾음. */
  private findRun(runId: number): AiRun | null {
    for (const m of this.messages.get()) {
      if (m.role === "assistant" && m.run.id === runId) return m.run;
    }
    return null;
  }

  /** 검토 상태(미리보기, 원래 값 보기, 덮어쓰기 선택)를 비우고 포커스를 시트로 돌림. */
  private closeReview(): void {
    this.active.set(null);
    this.showOriginal.set(false);
    this.overwrites.set(new Map());
    this.sheet.focus();
  }

  /** 내 AI 작업 상태를 다른 탭에 알림. 상태·범위·잠금이 바뀔 때만 보내고, 글자가 들어올 때마다 보내지 않음. */
  private publishActivity(): void {
    const activity = aiActivityOf(this.active.get());
    const key = activity
      ? `${activity.status}:${activity.range ? rangeToA1(activity.range) : "*"}:${activity.locked}`
      : "";
    if (key === this.publishedActivity) return;
    this.publishedActivity = key;
    this.presence.setAi(activity);
  }

  // [흐름 32] 전 이름 settle이 inflight까지 비워서, 패널을 닫아도 요청이 끊기지 않던 버그가 있었음.
  // 하는 일을 endRequest·stopWatchdog으로 나눠 이름에 드러내고, abort는 부르는 쪽이 정하게 함.
  /** 진행 중인 요청을 정리함(감시 타이머를 끄고 inflight를 비움). 요청을 끊을지(abort)는 부르는 쪽이 정함. */
  private endRequest(): void {
    this.stopWatchdog();
    this.inflight = null;
  }

  /** 응답 지연·시간 초과 타이머를 끔. */
  private stopWatchdog(): void {
    if (this.slowTimer) clearTimeout(this.slowTimer);
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.slowTimer = this.idleTimer = null;
  }

  /** 응답 감시 타이머를 다시 맞춤. 이벤트가 올 때마다 다시 재서, 5초 동안 없으면 "응답 지연"을 표시하고 60초 동안 없으면 시간 초과로 끝냄. */
  private armWatchdog(): void {
    const runId = this.inflight?.runId;
    if (runId === undefined) return;
    this.stopWatchdog();
    this.slowTimer = setTimeout(() => {
      if (this.inflight?.runId === runId) this.updateRun(runId, (r) => ({ ...r, slow: true }));
    }, SLOW_AFTER_MS);
    this.idleTimer = setTimeout(() => {
      if (this.inflight?.runId === runId) this.fail(runId, aiError("timeout"));
    }, IDLE_TIMEOUT_MS);
  }

  /** 대화 목록에 있는 실행 하나를 바꿈. 생성 중인 실행이면 미리보기(active)도 같이 바꿈. */
  private updateRun(runId: number, change: (run: AiRun) => AiRun): void {
    this.messages.set((list) =>
      list.map((m) =>
        m.role === "assistant" && m.run.id === runId ? { ...m, run: change(m.run) } : m,
      ),
    );
    const active = this.active.get();
    const updated = this.findRun(runId);
    if (updated && active?.id === runId && isRunning(active)) this.active.set(updated);
  }
}
