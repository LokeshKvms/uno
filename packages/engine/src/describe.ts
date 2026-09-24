import { cardLabel, colorName } from "./cards.ts";
import type { GameEvent } from "./game.ts";

export function describeEvent(event: GameEvent, nameOf: (id: string) => string, you?: string | null): string | null {
  const who = (id: string) => (id === you ? "You" : nameOf(id));
  const plural = (n: number) => (n === 1 ? "card" : "cards");
  switch (event.type) {
    case "roundStart":
      return `Round ${event.round}. ${nameOf(event.dealerId)} dealt, ${cardLabel(event.card)} starts the pile.`;
    case "play":
      return event.card.color === "wild"
        ? `${who(event.playerId)} played ${cardLabel(event.card)} and chose ${colorName(event.color)}.`
        : `${who(event.playerId)} played ${cardLabel(event.card)}.`;
    case "draw": {
      if (event.count === 0) return null;
      const n = `${event.count} ${plural(event.count)}`;
      switch (event.reason) {
        case "draw2":
        case "draw4":
          return `${who(event.playerId)} drew ${n} and lost the turn.`;
        case "challenge":
          return `${who(event.playerId)} drew ${n} from the challenge.`;
        case "caught":
          return `${who(event.playerId)} drew ${n} for not calling UNO.`;
        default:
          return `${who(event.playerId)} drew ${n}.`;
      }
    }
    case "skip":
      return `${who(event.playerId)} ${event.playerId === you ? "are" : "is"} skipped.`;
    case "reverse":
      return `Play reverses, now going ${event.direction === 1 ? "clockwise" : "counterclockwise"}.`;
    case "colorChosen":
      return `${who(event.playerId)} chose ${colorName(event.color)}.`;
    case "challenge":
      return event.success
        ? `${who(event.challengerId)} challenged the Wild Draw Four and won. ${nameOf(event.offenderId)} was bluffing.`
        : `${who(event.challengerId)} challenged the Wild Draw Four and lost. It was legal.`;
    case "uno":
      return `${who(event.playerId)} called UNO!`;
    case "caught":
      return `${who(event.byId)} caught ${event.playerId === you ? "you" : nameOf(event.playerId)} without an UNO call.`;
    case "pass":
      return event.reason === "kept"
        ? `${who(event.playerId)} kept the drawn card.`
        : event.reason === "empty"
          ? `${who(event.playerId)} couldn't draw, the deck is empty.`
          : null;
    case "reshuffle":
      return `The discard pile was shuffled into a fresh deck.`;
    case "turn":
      return null;
    case "roundOver":
      return `${who(event.winnerId)} won the round${event.points ? ` for ${event.points} points` : ""}!`;
    case "matchOver":
      return `${who(event.winnerId)} won the game!`;
  }
}
