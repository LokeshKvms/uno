import type { Card, Color } from "./cards.ts";
import { type GameEvent, type GameState, type Mode, type Phase, type RoundResult, actorId, playableCardIds, topCard } from "./game.ts";

export interface SeatView {
  id: string;
  name: string;
  count: number;
  score: number;
}

export interface GameView {
  mode: Mode;
  target: number;
  round: number;
  phase: Phase;
  players: SeatView[];
  currentId: string | null;
  dealerId: string;
  direction: 1 | -1;
  activeColor: Color;
  top: Card;
  discardTrail: Card[];
  drawCount: number;
  hand: Card[];
  playableIds: string[];
  canDraw: boolean;
  canPass: boolean;
  drawnCardId: string | null;
  challenge: { offenderId: string; victimId: string; previousColor: Color } | null;
  lastCallId: string | null;
  roundWinnerId: string | null;
  matchWinnerId: string | null;
  history: RoundResult[];
}

export function viewFor(state: GameState, viewerId: string | null): GameView {
  const viewer = viewerId ? state.players.find((p) => p.id === viewerId) : undefined;
  const acting = actorId(state);
  const isMyTurn = !!viewer && acting === viewer.id;
  return {
    mode: state.mode,
    target: state.target,
    round: state.round,
    phase: state.phase,
    players: state.players.map((p) => ({ id: p.id, name: p.name, count: p.hand.length, score: p.score })),
    currentId: acting,
    dealerId: state.players[state.dealerIndex]?.id ?? "",
    direction: state.direction,
    activeColor: state.activeColor,
    top: topCard(state),
    discardTrail: state.discardPile.slice(-5),
    drawCount: state.drawPile.length,
    hand: viewer ? viewer.hand.map((c) => ({ ...c })) : [],
    playableIds: viewer ? playableCardIds(state, viewer.id) : [],
    canDraw: isMyTurn && state.phase === "turn",
    canPass: isMyTurn && state.phase === "drawn",
    drawnCardId: isMyTurn ? state.drawnCardId : null,
    challenge: state.challenge
      ? { offenderId: state.challenge.offenderId, victimId: state.challenge.victimId, previousColor: state.challenge.previousColor }
      : null,
    lastCallId: state.lastCall?.playerId ?? null,
    roundWinnerId: state.roundWinnerId,
    matchWinnerId: state.matchWinnerId,
    history: state.history,
  };
}

export function redactEvent(event: GameEvent, viewerId: string | null): GameEvent {
  if (event.type === "draw" && event.playerId !== viewerId) {
    return { ...event, cards: [] };
  }
  if (event.type === "challenge" && event.challengerId !== viewerId) {
    return { ...event, offenderHand: [] };
  }
  return event;
}
