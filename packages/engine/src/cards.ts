export const COLORS = ["red", "yellow", "green", "blue"] as const;
export type Color = (typeof COLORS)[number];
export type CardColor = Color | "wild";

export const NUMBER_VALUES = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;
export type NumberValue = (typeof NUMBER_VALUES)[number];
export type ActionValue = "skip" | "reverse" | "draw2";
export type WildValue = "wild" | "draw4";
export type CardValue = NumberValue | ActionValue | WildValue;

export interface Card {
  id: string;
  color: CardColor;
  value: CardValue;
}

export const DECK_SIZE = 108;
export const HAND_SIZE = 7;

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const color of COLORS) {
    deck.push({ id: `${color}-0-0`, color, value: "0" });
    for (const value of [...NUMBER_VALUES.slice(1), "skip", "reverse", "draw2"] as const) {
      for (let copy = 0; copy < 2; copy++) {
        deck.push({ id: `${color}-${value}-${copy}`, color, value });
      }
    }
  }
  for (let copy = 0; copy < 4; copy++) {
    deck.push({ id: `wild-wild-${copy}`, color: "wild", value: "wild" });
    deck.push({ id: `wild-draw4-${copy}`, color: "wild", value: "draw4" });
  }
  return deck;
}

export function isWild(card: Card): boolean {
  return card.color === "wild";
}

export function isNumber(card: Card): boolean {
  return (NUMBER_VALUES as readonly string[]).includes(card.value);
}

export function cardPoints(card: Card): number {
  if (isWild(card)) return 50;
  if (isNumber(card)) return Number(card.value);
  return 20;
}

export function canPlayOn(card: Card, top: Card, activeColor: Color): boolean {
  if (isWild(card)) return true;
  return card.color === activeColor || card.value === top.value;
}

const VALUE_NAMES: Record<string, string> = {
  skip: "Skip",
  reverse: "Reverse",
  draw2: "Draw Two",
  wild: "Wild",
  draw4: "Wild Draw Four",
};

export function colorName(color: CardColor): string {
  return color[0]!.toUpperCase() + color.slice(1);
}

export function cardLabel(card: Card): string {
  const value = VALUE_NAMES[card.value] ?? card.value;
  return isWild(card) ? value : `${colorName(card.color)} ${value}`;
}
