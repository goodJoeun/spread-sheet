import type { CellCoord } from "./address";
import type { GridAction } from "./keymap";
import {
  advanceWithinRange,
  collapsedSelection,
  extendSelection,
  extendSelectionTo,
  isMultiCell,
  jumpTarget,
  moveSelection,
  selectAll,
  type Selection,
} from "./selection";

const NAVIGATION_TYPES = [
  "move",
  "extend",
  "jump",
  "advance",
  "page",
  "rowStart",
  "sheetStart",
  "selectAll",
] as const;

export type NavigationAction = Extract<GridAction, { type: (typeof NAVIGATION_TYPES)[number] }>;

/** 이동 동작인지. 이동이면 applyNavigation이, 아니면 컨트롤러가 처리함. */
export function isNavigationAction(action: GridAction): action is NavigationAction {
  return (NAVIGATION_TYPES as readonly string[]).includes(action.type);
}

export interface NavigationState {
  selection: Selection;
  /** Tab으로 입력해 나가기 시작한 열. Enter를 누르면 이 열의 다음 행으로 돌아감(엑셀과 같음). */
  tabReturnCol: number | null;
}

export interface NavigationContext {
  pageRows: number;
  isFilled: (coord: CellCoord) => boolean;
}

export interface NavigationResult extends NavigationState {
  /** null이면 스크롤하지 않음 */
  reveal: CellCoord | null;
}

// [흐름 13 · a525359] 576줄짜리 Grid의 runAction 안에 있던 이동 규칙을 순수 함수로 뺌. 엑셀 이동 규칙을 화면 없이 테스트하려고.
/** 선택 상태와 이동 동작을 받아 다음 선택, Tab 복귀 열, 스크롤할 셀을 계산하는 순수 함수. 화면 높이와 셀이 차 있는지는 인자로 받아서 DOM과 문서를 모름. */
export function applyNavigation(
  state: NavigationState,
  action: NavigationAction,
  context: NavigationContext,
): NavigationResult {
  const sel = state.selection;
  const keptTabCol = action.type === "advance" ? state.tabReturnCol : null;
  const result = (
    selection: Selection,
    reveal: CellCoord | null = selection.active,
    tabReturnCol: number | null = keptTabCol,
  ): NavigationResult => ({ selection, reveal, tabReturnCol });

  switch (action.type) {
    case "move":
      return result(moveSelection(sel, action.dRow, action.dCol));

    case "extend": {
      const next = extendSelection(sel, action.dRow, action.dCol);
      return result(next, next.focus);
    }

    case "jump": {
      const from = action.extend ? sel.focus : sel.active;
      const target = jumpTarget(from, action.dRow, action.dCol, context.isFilled);
      return result(
        action.extend ? extendSelectionTo(sel, target) : collapsedSelection(target),
        target,
      );
    }

    case "advance": {
      if (isMultiCell(sel)) return result(advanceWithinRange(sel, action.dRow, action.dCol));
      if (action.dCol !== 0) {
        const next = moveSelection(sel, 0, action.dCol);
        return result(next, next.active, state.tabReturnCol ?? sel.active.col);
      }
      if (action.dRow > 0 && state.tabReturnCol !== null) {
        return result(
          collapsedSelection({ row: sel.active.row + 1, col: state.tabReturnCol }),
          undefined,
          null,
        );
      }
      return result(moveSelection(sel, action.dRow, 0), undefined, null);
    }

    case "page": {
      const rows = context.pageRows * action.direction;
      if (action.extend) {
        const next = extendSelection(sel, rows, 0);
        return result(next, next.focus);
      }
      return result(moveSelection(sel, rows, 0));
    }

    case "rowStart":
      return result(collapsedSelection({ row: sel.active.row, col: 0 }));

    case "sheetStart":
      return result(collapsedSelection({ row: 0, col: 0 }));

    case "selectAll":
      return result(selectAll(sel), null);
  }
}
