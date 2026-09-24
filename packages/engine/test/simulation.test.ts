import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type BotLevel,
  DECK_SIZE,
  type GameState,
  actorId,
  applyAction,
  botWantsToCatch,
  chooseBotAction,
  createGame,
  startNextRound,
  totalCards,
} from "../src/index.ts";

const LEVELS: BotLevel[] = ["easy", "normal", "hard"];

function simulate(seed: number, playerCount: number, mode: "single" | "match") {
  const players = Array.from({ length: playerCount }, (_, i) => ({ id: `b${i}`, name: `Bot ${i}` }));
  let { state } = createGame({ players, mode, seed });
  const rng = { state: seed ^ 0x9e3779b9 };
  let steps = 0;
  const ids = new Set<string>();

  const check = (s: GameState) => {
    expect(totalCards(s)).toBe(DECK_SIZE);
    ids.clear();
    for (const c of [...s.drawPile, ...s.discardPile, ...s.players.flatMap((p) => p.hand)]) ids.add(c.id);
    expect(ids.size).toBe(DECK_SIZE);
  };
  check(state);

  while (state.phase !== "matchOver") {
    if (++steps > 20000) throw new Error(`game ${seed} did not terminate`);
    if (state.phase === "roundOver") {
      const r = startNextRound(state);
      if (!r.ok) throw new Error(r.error);
      state = r.state;
      check(state);
      continue;
    }
    if (state.lastCall) {
      const catcher = state.players.find((p) => p.id !== state.lastCall!.playerId)!;
      if (botWantsToCatch("normal", rng)) {
        const r = applyAction(state, catcher.id, { type: "catch", targetId: state.lastCall.playerId });
        if (r.ok) {
          state = r.state;
          check(state);
          continue;
        }
      }
    }
    const actor = state.lastCall ? state.lastCall.playerId : actorId(state)!;
    const level = LEVELS[Number(actor.slice(1)) % 3]!;
    const action = chooseBotAction(state, actor, level, rng) ?? chooseBotAction(state, actorId(state)!, level, rng);
    expect(action).not.toBeNull();
    const who = action!.type === "callUno" ? actor : actorId(state)!;
    const r = applyAction(state, who, action!);
    if (!r.ok) throw new Error(`seed ${seed}: bot made an illegal move ${JSON.stringify(action)}: ${r.error}`);
    state = r.state;
    check(state);
  }
  return state;
}

describe("bot simulations", () => {
  it("plays thousands of legal, card-conserving games for 2-10 players", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2 ** 31 }), fc.integer({ min: 2, max: 10 }), (seed, n) => {
        const final = simulate(seed, n, "single");
        expect(final.matchWinnerId).not.toBeNull();
        const winner = final.players.find((p) => p.id === final.matchWinnerId)!;
        expect(winner.hand).toHaveLength(0);
      }),
      { numRuns: 1000 },
    );
  }, 180_000);

  it("finishes Race-to-500 matches with a winner at or above 500", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2 ** 31 }), fc.integer({ min: 2, max: 6 }), (seed, n) => {
        const final = simulate(seed, n, "match");
        const winner = final.players.find((p) => p.id === final.matchWinnerId)!;
        expect(winner.score).toBeGreaterThanOrEqual(500);
        expect(final.history.reduce((s, r) => s + (r.winnerId === winner.id ? r.points : 0), 0)).toBe(winner.score);
      }),
      { numRuns: 100 },
    );
  }, 180_000);
});
