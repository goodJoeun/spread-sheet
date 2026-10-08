import type { Participant } from "@/lib/collab/presence-state";
import { strings } from "@/resources/strings";

/** 이름 마지막 낱말의 첫 글자를 참여자 색 원 안에 보여 줌. */
export function Avatar({
  participant,
  className = "",
}: {
  participant: Participant;
  className?: string;
}) {
  const { user, isSelf } = participant;
  const initial = user.name.split(" ").at(-1)?.charAt(0) ?? "?";
  return (
    <span
      title={isSelf ? strings.participants.withMe(user.name) : user.name}
      className={`avatar ${className}`}
      style={{ backgroundColor: user.color }}
    >
      {initial}
    </span>
  );
}
