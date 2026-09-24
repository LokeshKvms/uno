import { type Card, type CardColor, type CardValue, type Color, type GameState, createGame } from "../src/index.ts";

let serial = 0;
export function card(color: CardColor, value: CardValue): Card {
  return { id: `t-${color}-${value}-${serial++}`, color, value };
}

export interface Scenario {
  players?: number;
  hands: Card[][];
  top: Card;
  color?: Color;
  current?: number;
  direction?: 1 | -1;
  drawPile?: Card[];
  mode?: "single" | "match";
  scores?: number[];
}

export function scenario(s: Scenario): GameState {
  const n = s.players ?? s.hands.length;
  const { state } = createGame({
    players: Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}` })),
    mode: s.mode ?? "match",
    seed: 42,
  });
  state.players.forEach((p, i) => {
    p.hand = s.hands[i] ?? [];
    p.score = s.scores?.[i] ?? 0;
  });
  state.discardPile = [s.top];
  state.activeColor = s.color ?? (s.top.color === "wild" ? "red" : (s.top.color as Color));
  state.currentIndex = s.current ?? 0;
  state.direction = s.direction ?? 1;
  state.drawPile = s.drawPile ?? Array.from({ length: 20 }, () => card("blue", "5"));
  state.phase = "turn";
  state.challenge = null;
  state.lastCall = null;
  state.drawnCardId = null;
  return state;
}

export function mustOk<T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> {
  if (!r.ok) throw new Error(`expected ok, got ${JSON.stringify(r)}`);
  return r as Extract<T, { ok: true }>;
}
