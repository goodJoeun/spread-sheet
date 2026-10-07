import type { CSSProperties } from "react";
import type { CellFormat } from "@/lib/sheet/schema";

/** 셀 글자 서식(굵게·기울임·밑줄·취소선·글자색)을 인라인 스타일로 바꿈. 셀과 편집칸이 같은 모양이 되도록 한 곳에서 만듦. */
export function cellTextStyle({
  bold,
  italic,
  underline,
  strike,
  color,
}: CellFormat): CSSProperties {
  const decoration = [underline && "underline", strike && "line-through"].filter(Boolean).join(" ");
  return {
    fontWeight: bold ? 700 : undefined,
    fontStyle: italic ? "italic" : undefined,
    textDecorationLine: decoration || undefined,
    color,
  };
}
