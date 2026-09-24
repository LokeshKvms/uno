export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 6;
export const MAX_SEATS = 10;
export const MAX_SPECTATORS = 20;
export const AVATAR_COUNT = 8;
export const NAME_MAX = 20;
export const CHAT_MAX = 240;

export const TIMING = {
  turnMs: 45_000,
  drawnMs: 20_000,
  challengeMs: 20_000,
  colorMs: 20_000,
  nextRoundMs: 15_000,
  disconnectedTurnMs: 20_000,
  graceMs: 60_000,
  catchWindowMs: 3_000,
  awayAfterTimeouts: 3,
} as const;

export const QUICK_CHAT = ["Good game!", "Nice one!", "Oops.", "Your turn!", "So close!", "Rematch?", "Be right back", "Thinking..."] as const;

export const REACTIONS = ["😂", "😮", "😡", "🔥", "👏", "😭", "🤝", "💀"] as const;
