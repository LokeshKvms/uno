import { AVATAR_TONES, initials } from "../lib/avatars.ts";
import { Robot } from "@phosphor-icons/react";

interface AvatarProps {
  name: string;
  avatar: number;
  size?: number;
  bot?: boolean;
  dim?: boolean;
}

export function Avatar({ name, avatar, size = 36, bot, dim }: AvatarProps) {
  return (
    <span
      className="avatar"
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        background: AVATAR_TONES[avatar % AVATAR_TONES.length],
        fontSize: Math.round(size * 0.38),
        opacity: dim ? 0.55 : 1,
      }}
    >
      {bot ? <Robot size={Math.round(size * 0.55)} weight="bold" /> : initials(name)}
    </span>
  );
}
