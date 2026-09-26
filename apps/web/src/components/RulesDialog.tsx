import type { Card as CardData } from "@uno/engine";
import { Card } from "./Card.tsx";
import { Dialog } from "./Dialog.tsx";

const RULES: { cards: CardData[]; title: string; body: string }[] = [
  {
    cards: [
      { id: "r1", color: "blue", value: "7" },
      { id: "r2", color: "blue", value: "3" },
    ],
    title: "Match the pile",
    body: "Play a card that matches the top card's color, number or symbol. First to empty their hand wins the round.",
  },
  {
    cards: [{ id: "r3", color: "red", value: "4" }],
    title: "Can't play? Draw one",
    body: "You may draw instead of playing. If the drawn card fits you can play it right away, or keep it and pass. Only that card can be played.",
  },
  {
    cards: [
      { id: "r4", color: "green", value: "skip" },
      { id: "r5", color: "yellow", value: "reverse" },
    ],
    title: "Skip and Reverse",
    body: "Skip jumps the next player. Reverse flips the direction of play. With two players, Reverse works like Skip.",
  },
  {
    cards: [{ id: "r6", color: "red", value: "draw2" }],
    title: "Draw Two",
    body: "The next player draws two and loses their turn. Draw cards can't be stacked.",
  },
  {
    cards: [
      { id: "r7", color: "wild", value: "wild" },
      { id: "r8", color: "wild", value: "draw4" },
    ],
    title: "Wilds and the +4 challenge",
    body: "A Wild picks the next color. A Wild Draw Four also makes the next player draw four and skip, but you may only play it if you have no card of the current color. They can challenge: if you bluffed, you draw four. If you didn't, they draw six.",
  },
  {
    cards: [{ id: "r9", color: "yellow", value: "9" }],
    title: "Call UNO",
    body: "Press UNO! as you play your second-to-last card. If you forget, anyone can catch you before the next player acts, and you draw two. When someone else forgets, hit Catch! (or press C) first.",
  },
  {
    cards: [{ id: "r10", color: "green", value: "5" }],
    title: "Scoring and Race to 500",
    body: "The round winner scores every card left in the other hands: numbers at face value, action cards 20, wilds 50. In Race to 500 the first to 500 wins the game.",
  },
];

export function RulesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="How to play" className="rules-dialog">
      <ul className="rules-list">
        {RULES.map((r) => (
          <li key={r.title}>
            <div className="rules-cards" aria-hidden="true">
              {r.cards.map((c, i) => (
                <div key={c.id} className="rules-card" style={{ transform: `rotate(${(i - (r.cards.length - 1) / 2) * 10}deg)` }}>
                  <Card card={c} />
                </div>
              ))}
            </div>
            <div>
              <h3>{r.title}</h3>
              <p>{r.body}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="rules-foot">
        Turns last 45 seconds. If your connection drops, your seat waits for you: a bot only steps in after a while, and you get your cards back the moment you
        return.
      </p>
    </Dialog>
  );
}
