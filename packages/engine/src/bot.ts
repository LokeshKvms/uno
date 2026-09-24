import { type Card, type Color, COLORS, cardPoints, isWild } from "./cards.ts";
import { type GameAction, type GameState, actorId, dominantColor, playableCardIds, topCard } from "./game.ts";
import { type Rng, nextRandom } from "./rng.ts";

export type BotLevel = "easy" | "normal" | "hard";

interface Tuning {
  callWithPlay: number;
  catchChance: number;
  challengeBias: number;
  bluffChance: number;
}

const TUNING: Record<BotLevel, Tuning> = {
  easy: { callWithPlay: 0.7, catchChance: 0.25, challengeBias: 0, bluffChance: 0 },
  normal: { callWithPlay: 0.95, catchChance: 0.6, challengeBias: 0.6, bluffChance: 0.05 },
  hard: { callWithPlay: 1, catchChance: 0.9, challengeBias: 1, bluffChance: 0.15 },
};

export function chooseBotAction(state: GameState, botId: string, level: BotLevel, rng: Rng): GameAction | null {
  const tuning = TUNING[level];
  const me = state.players.find((p) => p.id === botId);
  if (!me) return null;

  if (state.lastCall?.playerId === botId) return { type: "callUno" };

  if (actorId(state) !== botId) return null;

  switch (state.phase) {
    case "chooseColor":
      return { type: "chooseColor", color: bestColor(me.hand, rng) };
    case "challenge":
      return { type: "challenge", challenge: shouldChallenge(state, tuning, rng) };
    case "drawn": {
      const drawn = me.hand.find((c) => c.id === state.drawnCardId);
      if (!drawn) return { type: "pass" };
      return playAction(state, me.hand, drawn, tuning, rng);
    }
    case "turn": {
      const playable = playableCardIds(state, botId)
        .map((id) => me.hand.find((c) => c.id === id)!)
        .filter(Boolean);
      if (playable.length === 0) return { type: "draw" };
      const card = level === "easy" ? pickRandom(playable, rng) : pickStrategic(state, botId, me.hand, playable, tuning, rng);
      if (!card) return { type: "draw" };
      return playAction(state, me.hand, card, tuning, rng);
    }
    default:
      return null;
  }
}

export function botWantsToCatch(level: BotLevel, rng: Rng): boolean {
  return nextRandom(rng) < TUNING[level].catchChance;
}

function playAction(state: GameState, hand: Card[], card: Card, tuning: Tuning, rng: Rng): GameAction {
  const callUno = hand.length === 2 && nextRandom(rng) < tuning.callWithPlay;
  const color = isWild(card)
    ? bestColor(
        hand.filter((c) => c.id !== card.id),
        rng,
      )
    : undefined;
  return color ? { type: "play", cardId: card.id, color, callUno } : { type: "play", cardId: card.id, callUno };
}

function pickRandom(cards: Card[], rng: Rng): Card | undefined {
  const pool = cards.filter((c) => c.value !== "draw4");
  const from = pool.length > 0 ? pool : cards;
  return from[Math.floor(nextRandom(rng) * from.length)];
}

function pickStrategic(state: GameState, botId: string, hand: Card[], playable: Card[], tuning: Tuning, rng: Rng): Card | undefined {
  const n = state.players.length;
  const myIndex = state.players.findIndex((p) => p.id === botId);
  const nextPlayer = state.players[(((myIndex + state.direction) % n) + n) % n];
  const threat = nextPlayer ? nextPlayer.hand.length : 7;
  const holdsActiveColor = hand.some((c) => c.color === state.activeColor);
  const colorCounts = new Map<Color, number>(COLORS.map((c) => [c, hand.filter((h) => h.color === c).length]));

  let best: Card | undefined;
  let bestScore = -Infinity;
  for (const card of playable) {
    let score = 0;
    if (card.value === "draw4") {
      const illegal = holdsActiveColor;
      if (illegal && nextRandom(rng) >= tuning.bluffChance) continue;
      score = threat <= 2 ? 60 : hand.length <= 2 ? 40 : -40;
    } else if (card.value === "wild") {
      score = threat <= 2 || hand.length <= 2 ? 30 : -25;
    } else {
      score = cardPoints(card);
      if (card.value === "draw2" || card.value === "skip" || card.value === "reverse") {
        score += threat <= 2 ? 45 : 5;
      }
      score += (colorCounts.get(card.color as Color) ?? 0) * 3;
      if (card.color !== state.activeColor && card.value === topCard(state).value) {
        score += ((colorCounts.get(card.color as Color) ?? 0) - (colorCounts.get(state.activeColor) ?? 0)) * 4;
      }
    }
    score += nextRandom(rng) * 2;
    if (score > bestScore) {
      bestScore = score;
      best = card;
    }
  }
  return best ?? playable.find((c) => c.value !== "draw4") ?? playable[0];
}

function shouldChallenge(state: GameState, tuning: Tuning, rng: Rng): boolean {
  if (tuning.challengeBias === 0 || !state.challenge) return false;
  const offender = state.players.find((p) => p.id === state.challenge!.offenderId);
  const handSize = offender?.hand.length ?? 0;
  const suspicion = Math.min(0.55, handSize * 0.06);
  return nextRandom(rng) < suspicion * tuning.challengeBias;
}

function bestColor(hand: Card[], rng: Rng): Color {
  const colored = hand.filter((c) => !isWild(c));
  if (colored.length === 0) return COLORS[Math.floor(nextRandom(rng) * 4)]!;
  return dominantColor(colored, Math.floor(nextRandom(rng) * 4));
}
