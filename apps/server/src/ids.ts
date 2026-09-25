import { randomBytes, randomInt } from "node:crypto";
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "@uno/protocol";

export function sessionId(): string {
  return randomBytes(18).toString("base64url");
}

export function shortId(prefix: string): string {
  return `${prefix}_${randomBytes(6).toString("base64url")}`;
}

export function roomCode(): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  return code;
}

export function between(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min));
}
