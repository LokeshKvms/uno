import { z } from "zod";
import type { BotLevel, GameEvent, GameView, Mode } from "@uno/engine";

export * from "./constants.ts";
import { AVATAR_COUNT, CHAT_MAX, MAX_SEATS, NAME_MAX, ROOM_CODE_LENGTH } from "./constants.ts";

const nameSchema = z
  .string({ error: "Enter a name." })
  .transform((s) => s.replace(/\s+/g, " ").trim())
  .pipe(
    z
      .string()
      .min(1, { error: "Enter a name." })
      .max(NAME_MAX, { error: `Keep your name to ${NAME_MAX} characters or fewer.` })
      .regex(/^[\p{L}\p{N} ._'!?&-]+$/u, { error: "Names can use letters, numbers, spaces and . _ ' ! ? & -" }),
  );

export const profileSchema = z.object({
  name: nameSchema,
  avatar: z
    .number()
    .int()
    .min(0)
    .max(AVATAR_COUNT - 1)
    .default(0),
});

export const createRoomSchema = profileSchema.extend({
  bots: z
    .object({
      count: z
        .number()
        .int()
        .min(1)
        .max(MAX_SEATS - 1),
      level: z.enum(["easy", "normal", "hard"]),
    })
    .optional(),
});

export const roomCodeSchema = z
  .string()
  .transform((s) => s.trim().toUpperCase())
  .pipe(z.string().length(ROOM_CODE_LENGTH, { error: "Room codes are 6 characters." }));

const colorSchema = z.enum(["red", "yellow", "green", "blue"]);

export const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("play"), cardId: z.string().max(40), color: colorSchema.optional(), callUno: z.boolean().optional() }),
  z.object({ type: z.literal("draw") }),
  z.object({ type: z.literal("pass") }),
  z.object({ type: z.literal("chooseColor"), color: colorSchema }),
  z.object({ type: z.literal("challenge"), challenge: z.boolean() }),
  z.object({ type: z.literal("callUno") }),
  z.object({ type: z.literal("catch"), targetId: z.string().max(40) }),
  z.object({ type: z.literal("ready"), ready: z.boolean() }),
  z.object({ type: z.literal("settings"), mode: z.enum(["single", "match"]) }),
  z.object({ type: z.literal("start") }),
  z.object({ type: z.literal("addBot"), level: z.enum(["easy", "normal", "hard"]) }),
  z.object({ type: z.literal("removeSeat"), seatId: z.string().max(40) }),
  z.object({ type: z.literal("nextRound") }),
  z.object({ type: z.literal("toLobby") }),
  z.object({ type: z.literal("leave") }),
  z.object({ type: z.literal("back") }),
  z.object({ type: z.literal("takeSeat") }),
]);
export type RoomAction = z.infer<typeof actionSchema>;

export const commandSchema = z.object({
  id: z.string().min(8).max(64),
  action: actionSchema,
});
export type Command = z.infer<typeof commandSchema>;

export const chatSchema = z.object({
  text: z
    .string()
    .transform((s) => s.replace(/[\u0000-\u001f\u007f]/g, " ").trim())
    .pipe(z.string().min(1).max(CHAT_MAX)),
});

export const reactionSchema = z.object({
  kind: z.enum(["emoji", "quick"]),
  index: z.number().int().min(0).max(15),
});

export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Please check what you entered.";
}

export type SeatControl = "human" | "bot" | "autopilot";

export interface SeatInfo {
  id: string;
  name: string;
  avatar: number;
  kind: "human" | "bot";
  botLevel: BotLevel;
  control: SeatControl;
  connected: boolean;
  ready: boolean;
  away: boolean;
  left: boolean;
}

export interface SpectatorInfo {
  id: string;
  name: string;
  avatar: number;
  connected: boolean;
}

export type RoomEventType =
  "joined" | "left" | "botTookOver" | "reconnected" | "disconnected" | "hostChanged" | "removed" | "reclaimed" | "away" | "back" | "watching";

export type LogEntry =
  { id: number; at: number; kind: "game"; event: GameEvent } | { id: number; at: number; kind: "room"; type: RoomEventType; seatId: string; name: string };

export type DeadlineKind = "turn" | "challenge" | "color" | "nextRound" | null;

export interface RoomSnapshot {
  code: string;
  revision: number;
  serverTime: number;
  selfId: string;
  role: "player" | "spectator";
  hostId: string;
  mode: Mode;
  status: "lobby" | "playing";
  seats: SeatInfo[];
  spectators: SpectatorInfo[];
  game: GameView | null;
  deadline: number;
  deadlineKind: DeadlineKind;
  suspended: boolean;
  log: LogEntry[];
}

export interface ChatMessage {
  id: number;
  at: number;
  fromId: string;
  name: string;
  avatar: number;
  text: string;
  quick: boolean;
}

export interface ReactionBroadcast {
  fromId: string;
  kind: "emoji" | "quick";
  index: number;
}

export type Ack = { ok: true } | { ok: false; error: string };

export interface SessionInfo {
  room: string | null;
  name: string;
  avatar: number;
}

export interface JoinResult {
  code: string;
  role: "player" | "spectator";
}

export interface RoomPreview {
  code: string;
  status: "lobby" | "playing";
  hostName: string;
  players: number;
  seatsOpen: number;
}

export interface ServerToClient {
  snapshot: (s: RoomSnapshot) => void;
  chat: (m: ChatMessage) => void;
  chatHistory: (m: ChatMessage[]) => void;
  reaction: (r: ReactionBroadcast) => void;
  replaced: () => void;
  removed: (reason: string) => void;
}

export interface ClientToServer {
  command: (c: Command, ack: (a: Ack) => void) => void;
  chat: (c: { text: string }, ack: (a: Ack) => void) => void;
  reaction: (r: { kind: "emoji" | "quick"; index: number }) => void;
  sync: () => void;
}
