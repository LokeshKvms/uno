import { type Card, type Color, COLORS, HAND_SIZE, canPlayOn, cardPoints, createDeck, isWild } from "./cards.ts";
import { type Rng, randomInt, shuffle } from "./rng.ts";

export type Mode = "single" | "match";
export type Phase = "turn" | "drawn" | "chooseColor" | "challenge" | "roundOver" | "matchOver";

export const MATCH_TARGET = 500;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 10;

export interface GamePlayer {
  id: string;
  name: string;
  hand: Card[];
  score: number;
}

export interface RoundBreakdown {
  playerId: string;
  cards: Card[];
  points: number;
}

export interface RoundResult {
  round: number;
  winnerId: string;
  points: number;
  breakdown: RoundBreakdown[];
}

export interface ChallengeState {
  offenderId: string;
  victimId: string;
  illegal: boolean;
  previousColor: Color;
  offenderHand: Card[];
}

export interface GameState {
  mode: Mode;
  target: number;
  players: GamePlayer[];
  round: number;
  dealerIndex: number;
  drawPile: Card[];
  discardPile: Card[];
  activeColor: Color;
  direction: 1 | -1;
  currentIndex: number;
  phase: Phase;
  drawnCardId: string | null;
  challenge: ChallengeState | null;
  lastCall: { playerId: string } | null;
  roundWinnerId: string | null;
  matchWinnerId: string | null;
  history: RoundResult[];
  turnSerial: number;
  rng: Rng;
}

export type GameAction =
  | { type: "play"; cardId: string; color?: Color; callUno?: boolean }
  | { type: "draw" }
  | { type: "pass" }
  | { type: "chooseColor"; color: Color }
  | { type: "challenge"; challenge: boolean }
  | { type: "callUno" }
  | { type: "catch"; targetId: string };

export type DrawReason = "draw" | "draw2" | "draw4" | "challenge" | "caught" | "timeout";

export type GameEvent =
  | { type: "roundStart"; round: number; dealerId: string; card: Card }
  | { type: "play"; playerId: string; card: Card; color: Color }
  | {
      type: "draw";
      playerId: string;
      count: number;
      reason: DrawReason;
      cards: Card[];
    }
  | { type: "skip"; playerId: string }
  | { type: "reverse"; direction: 1 | -1 }
  | { type: "colorChosen"; playerId: string; color: Color }
  | {
      type: "challenge";
      challengerId: string;
      offenderId: string;
      success: boolean;
      offenderHand: Card[];
    }
  | { type: "uno"; playerId: string }
  | { type: "caught"; playerId: string; byId: string }
  | { type: "pass"; playerId: string; reason: "kept" | "noPlayable" | "empty" }
  | { type: "reshuffle"; count: number }
  | { type: "turn"; playerId: string }
  | { type: "roundOver"; winnerId: string; points: number }
  | { type: "matchOver"; winnerId: string };

export type GameResult = { ok: true; state: GameState; events: GameEvent[] } | { ok: false; error: string };

export interface NewGameOptions {
  players: { id: string; name: string }[];
  mode: Mode;
  seed: number;
  target?: number;
}

export function createGame(options: NewGameOptions): { state: GameState; events: GameEvent[] } {
  if (options.players.length < MIN_PLAYERS || options.players.length > MAX_PLAYERS) {
    throw new Error(`A game needs ${MIN_PLAYERS}-${MAX_PLAYERS} players.`);
  }
  const state: GameState = {
    mode: options.mode,
    target: options.target ?? MATCH_TARGET,
    players: options.players.map((p) => ({ id: p.id, name: p.name, hand: [], score: 0 })),
    round: 0,
    dealerIndex: -1,
    drawPile: [],
    discardPile: [],
    activeColor: "red",
    direction: 1,
    currentIndex: 0,
    phase: "roundOver",
    drawnCardId: null,
    challenge: null,
    lastCall: null,
    roundWinnerId: null,
    matchWinnerId: null,
    history: [],
    turnSerial: 0,
    rng: { state: options.seed >>> 0 },
  };
  const events: GameEvent[] = [];
  dealRound(state, events);
  return { state, events };
}

export function startNextRound(state: GameState): GameResult {
  if (state.phase !== "roundOver") return fail("The current round is still being played.");
  const next = structuredClone(state);
  const events: GameEvent[] = [];
  dealRound(next, events);
  return { ok: true, state: next, events };
}

export function actorId(state: GameState): string | null {
  if (state.phase === "roundOver" || state.phase === "matchOver") return null;
  if (state.phase === "challenge") return state.challenge?.victimId ?? null;
  return state.players[state.currentIndex]?.id ?? null;
}

export function topCard(state: GameState): Card {
  return state.discardPile[state.discardPile.length - 1]!;
}

export function playableCardIds(state: GameState, playerId: string): string[] {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || actorId(state) !== playerId) return [];
  if (state.phase === "drawn") {
    return state.drawnCardId ? [state.drawnCardId] : [];
  }
  if (state.phase !== "turn") return [];
  const top = topCard(state);
  return player.hand.filter((c) => canPlayOn(c, top, state.activeColor)).map((c) => c.id);
}

export function applyAction(state: GameState, playerId: string, action: GameAction): GameResult {
  if (state.phase === "roundOver" || state.phase === "matchOver") {
    return fail("This round is over.");
  }
  const index = state.players.findIndex((p) => p.id === playerId);
  if (index < 0) return fail("You are not seated at this table.");

  const s = structuredClone(state);
  const events: GameEvent[] = [];

  if (action.type === "callUno") {
    if (s.lastCall?.playerId !== playerId) {
      return fail("You can call UNO when you are down to one card.");
    }
    s.lastCall = null;
    events.push({ type: "uno", playerId });
    return { ok: true, state: s, events };
  }

  if (action.type === "catch") {
    const target = s.players.find((p) => p.id === action.targetId);
    if (!target || action.targetId === playerId) return fail("Pick another player to catch.");
    if (s.lastCall?.playerId !== action.targetId) {
      return fail(`Too late. ${target.name} is safe.`);
    }
    s.lastCall = null;
    events.push({ type: "caught", playerId: target.id, byId: playerId });
    drawCards(s, s.players.indexOf(target), 2, "caught", events);
    return { ok: true, state: s, events };
  }

  if (action.type === "challenge") {
    if (s.phase !== "challenge" || s.challenge?.victimId !== playerId) {
      return fail("There is no Wild Draw Four waiting on you.");
    }
  } else if (s.currentIndex !== index) {
    return fail("It is not your turn yet.");
  }

  s.lastCall = null;

  switch (action.type) {
    case "play":
      return playCard(s, index, action, events);
    case "draw":
      return drawForTurn(s, index, events);
    case "pass":
      if (s.phase !== "drawn") return fail("Draw a card before passing.");
      s.drawnCardId = null;
      events.push({ type: "pass", playerId, reason: "kept" });
      advanceTurn(s, nextIndex(s, index), events);
      return { ok: true, state: s, events };
    case "chooseColor":
      if (s.phase !== "chooseColor") return fail("There is no color to choose right now.");
      if (!COLORS.includes(action.color)) return fail("Pick red, yellow, green, or blue.");
      s.activeColor = action.color;
      events.push({ type: "colorChosen", playerId, color: action.color });
      s.phase = "turn";
      s.turnSerial++;
      events.push({ type: "turn", playerId });
      return { ok: true, state: s, events };
    case "challenge":
      return resolveChallenge(s, action.challenge, events);
  }
}

export function timeoutAction(state: GameState): GameAction | null {
  switch (state.phase) {
    case "turn":
      return { type: "draw" };
    case "drawn":
      return { type: "pass" };
    case "chooseColor":
      return { type: "chooseColor", color: dominantColor(state.players[state.currentIndex]!.hand, state.rng.state) };
    case "challenge":
      return { type: "challenge", challenge: false };
    default:
      return null;
  }
}

export function dominantColor(hand: Card[], salt = 0): Color {
  const counts = COLORS.map((color) => hand.filter((c) => c.color === color).length);
  const best = Math.max(...counts);
  const candidates = COLORS.filter((_, i) => counts[i] === best);
  return candidates[Math.abs(salt) % candidates.length]!;
}

export function totalCards(state: GameState): number {
  return state.drawPile.length + state.discardPile.length + state.players.reduce((sum, p) => sum + p.hand.length, 0);
}

function fail(error: string): GameResult {
  return { ok: false, error };
}

function nextIndex(s: GameState, from: number, steps = 1): number {
  const n = s.players.length;
  return (((from + s.direction * steps) % n) + n) % n;
}

function advanceTurn(s: GameState, index: number, events: GameEvent[]): void {
  s.currentIndex = index;
  s.phase = "turn";
  s.drawnCardId = null;
  s.turnSerial++;
  events.push({ type: "turn", playerId: s.players[index]!.id });
}

function dealRound(s: GameState, events: GameEvent[]): void {
  const n = s.players.length;
  s.round += 1;
  s.dealerIndex = s.round === 1 ? randomInt(s.rng, n) : (s.dealerIndex + 1) % n;
  s.direction = 1;
  s.drawPile = shuffle(s.rng, createDeck());
  s.discardPile = [];
  s.challenge = null;
  s.lastCall = null;
  s.drawnCardId = null;
  s.roundWinnerId = null;
  for (const p of s.players) p.hand = [];
  for (let i = 0; i < HAND_SIZE; i++) {
    for (let k = 1; k <= n; k++) {
      s.players[(s.dealerIndex + k) % n]!.hand.push(s.drawPile.pop()!);
    }
  }

  let start = s.drawPile.pop()!;
  while (start.value === "draw4") {
    s.drawPile.push(start);
    shuffle(s.rng, s.drawPile);
    start = s.drawPile.pop()!;
  }
  s.discardPile.push(start);
  const dealer = s.dealerIndex;
  const dealerId = s.players[dealer]!.id;
  events.push({ type: "roundStart", round: s.round, dealerId, card: start });
  s.turnSerial++;

  if (start.value === "wild") {
    s.activeColor = "red";
    s.currentIndex = nextIndex(s, dealer);
    s.phase = "chooseColor";
    events.push({ type: "turn", playerId: s.players[s.currentIndex]!.id });
    return;
  }

  s.activeColor = start.color as Color;
  s.phase = "turn";
  switch (start.value) {
    case "reverse":
      s.direction = -1;
      events.push({ type: "reverse", direction: -1 });
      s.currentIndex = dealer;
      break;
    case "skip": {
      const skipped = nextIndex(s, dealer);
      events.push({ type: "skip", playerId: s.players[skipped]!.id });
      s.currentIndex = nextIndex(s, dealer, 2);
      break;
    }
    case "draw2": {
      const victim = nextIndex(s, dealer);
      drawCards(s, victim, 2, "draw2", events);
      events.push({ type: "skip", playerId: s.players[victim]!.id });
      s.currentIndex = nextIndex(s, dealer, 2);
      break;
    }
    default:
      s.currentIndex = nextIndex(s, dealer);
  }
  events.push({ type: "turn", playerId: s.players[s.currentIndex]!.id });
}

function takeCard(s: GameState, events: GameEvent[]): Card | null {
  if (s.drawPile.length === 0) {
    if (s.discardPile.length <= 1) return null;
    const top = s.discardPile.pop()!;
    s.drawPile = shuffle(s.rng, s.discardPile);
    s.discardPile = [top];
    events.push({ type: "reshuffle", count: s.drawPile.length });
  }
  return s.drawPile.pop() ?? null;
}

function drawCards(s: GameState, index: number, count: number, reason: DrawReason, events: GameEvent[]): Card[] {
  const drawn: Card[] = [];
  const pending: GameEvent[] = [];
  for (let i = 0; i < count; i++) {
    const card = takeCard(s, pending);
    if (!card) break;
    drawn.push(card);
  }
  s.players[index]!.hand.push(...drawn);
  events.push(...pending);
  events.push({ type: "draw", playerId: s.players[index]!.id, count: drawn.length, reason, cards: drawn });
  return drawn;
}

function playCard(s: GameState, index: number, action: Extract<GameAction, { type: "play" }>, events: GameEvent[]): GameResult {
  if (s.phase !== "turn" && s.phase !== "drawn") return fail("You can't play a card right now.");
  const player = s.players[index]!;
  const cardIndex = player.hand.findIndex((c) => c.id === action.cardId);
  if (cardIndex < 0) return fail("That card is not in your hand.");
  const card = player.hand[cardIndex]!;
  if (s.phase === "drawn" && card.id !== s.drawnCardId) {
    return fail("After drawing, you may only play the card you drew.");
  }
  if (!canPlayOn(card, topCard(s), s.activeColor)) {
    return fail("That card doesn't match the color, number, or symbol in play.");
  }
  if (isWild(card) && (!action.color || !COLORS.includes(action.color))) {
    return fail("Choose a color for your Wild card.");
  }

  const previousColor = s.activeColor;
  player.hand.splice(cardIndex, 1);
  s.discardPile.push(card);
  s.drawnCardId = null;
  s.activeColor = isWild(card) ? action.color! : (card.color as Color);
  events.push({ type: "play", playerId: player.id, card, color: s.activeColor });

  const next = nextIndex(s, index);

  if (player.hand.length === 0) {
    if (card.value === "draw2") drawCards(s, next, 2, "draw2", events);
    if (card.value === "draw4") drawCards(s, next, 4, "draw4", events);
    finishRound(s, index, events);
    return { ok: true, state: s, events };
  }

  if (player.hand.length === 1) {
    if (action.callUno) events.push({ type: "uno", playerId: player.id });
    else s.lastCall = { playerId: player.id };
  }

  switch (card.value) {
    case "skip":
      events.push({ type: "skip", playerId: s.players[next]!.id });
      advanceTurn(s, nextIndex(s, index, 2), events);
      break;
    case "reverse":
      s.direction = s.direction === 1 ? -1 : 1;
      events.push({ type: "reverse", direction: s.direction });
      if (s.players.length === 2) {
        events.push({ type: "skip", playerId: s.players[next]!.id });
        advanceTurn(s, index, events);
      } else {
        advanceTurn(s, nextIndex(s, index), events);
      }
      break;
    case "draw2":
      drawCards(s, next, 2, "draw2", events);
      events.push({ type: "skip", playerId: s.players[next]!.id });
      advanceTurn(s, nextIndex(s, index, 2), events);
      break;
    case "draw4": {
      const offenderHand = player.hand.map((c) => ({ ...c }));
      s.challenge = {
        offenderId: player.id,
        victimId: s.players[next]!.id,
        illegal: player.hand.some((c) => c.color === previousColor),
        previousColor,
        offenderHand,
      };
      s.currentIndex = next;
      s.phase = "challenge";
      s.turnSerial++;
      events.push({ type: "turn", playerId: s.players[next]!.id });
      break;
    }
    default:
      advanceTurn(s, next, events);
  }
  return { ok: true, state: s, events };
}

function drawForTurn(s: GameState, index: number, events: GameEvent[]): GameResult {
  if (s.phase !== "turn") {
    return fail(s.phase === "drawn" ? "Play the card you drew, or keep it and pass." : "You can't draw right now.");
  }
  const player = s.players[index]!;
  const [card] = drawCards(s, index, 1, "draw", events);
  if (!card) {
    events.pop();
    events.push({ type: "pass", playerId: player.id, reason: "empty" });
    advanceTurn(s, nextIndex(s, index), events);
    return { ok: true, state: s, events };
  }
  if (canPlayOn(card, topCard(s), s.activeColor)) {
    s.phase = "drawn";
    s.drawnCardId = card.id;
    s.turnSerial++;
  } else {
    events.push({ type: "pass", playerId: player.id, reason: "noPlayable" });
    advanceTurn(s, nextIndex(s, index), events);
  }
  return { ok: true, state: s, events };
}

function resolveChallenge(s: GameState, challenge: boolean, events: GameEvent[]): GameResult {
  const c = s.challenge!;
  const victim = s.players.findIndex((p) => p.id === c.victimId);
  const offender = s.players.findIndex((p) => p.id === c.offenderId);
  s.challenge = null;
  if (!challenge) {
    drawCards(s, victim, 4, "draw4", events);
    events.push({ type: "skip", playerId: c.victimId });
    advanceTurn(s, nextIndex(s, victim), events);
  } else if (c.illegal) {
    events.push({ type: "challenge", challengerId: c.victimId, offenderId: c.offenderId, success: true, offenderHand: c.offenderHand });
    drawCards(s, offender, 4, "challenge", events);
    advanceTurn(s, victim, events);
  } else {
    events.push({ type: "challenge", challengerId: c.victimId, offenderId: c.offenderId, success: false, offenderHand: c.offenderHand });
    drawCards(s, victim, 6, "challenge", events);
    events.push({ type: "skip", playerId: c.victimId });
    advanceTurn(s, nextIndex(s, victim), events);
  }
  return { ok: true, state: s, events };
}

function finishRound(s: GameState, winnerIndex: number, events: GameEvent[]): void {
  const winner = s.players[winnerIndex]!;
  const breakdown: RoundBreakdown[] = s.players
    .filter((p) => p.id !== winner.id)
    .map((p) => ({
      playerId: p.id,
      cards: p.hand.map((c) => ({ ...c })),
      points: p.hand.reduce((sum, c) => sum + cardPoints(c), 0),
    }));
  const points = breakdown.reduce((sum, b) => sum + b.points, 0);
  winner.score += points;
  s.history.push({ round: s.round, winnerId: winner.id, points, breakdown });
  s.roundWinnerId = winner.id;
  s.lastCall = null;
  s.challenge = null;
  s.drawnCardId = null;
  s.turnSerial++;
  events.push({ type: "roundOver", winnerId: winner.id, points });
  if (s.mode === "single" || winner.score >= s.target) {
    s.phase = "matchOver";
    s.matchWinnerId = winner.id;
    events.push({ type: "matchOver", winnerId: winner.id });
  } else {
    s.phase = "roundOver";
  }
}
