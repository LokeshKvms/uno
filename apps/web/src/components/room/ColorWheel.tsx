import type { Color } from "@uno/engine";
import { COLORS, colorName } from "@uno/engine";
import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";
import { useCountdown, useHotkeys } from "../../lib/hooks.ts";
import { useStore } from "../../lib/store.ts";
import type { PendingWild } from "../../screens/GameView.tsx";
import { Card } from "../Card.tsx";

const SWATCH: Record<Color, string> = {
  red: "var(--uno-red)",
  yellow: "var(--uno-yellow)",
  green: "var(--uno-green)",
  blue: "var(--uno-blue)",
};

interface ColorWheelProps {
  pending: PendingWild;
  opening: boolean;
  onCancel: () => void;
  onChosen: () => void;
}

export function ColorWheel({ pending, opening, onCancel, onChosen }: ColorWheelProps) {
  const snap = useStore((s) => s.snap)!;
  const send = useStore((s) => s.send);
  const busy = useStore((s) => s.busy);
  const open = !!pending || opening;
  const game = snap.game!;
  const left = useCountdown(open ? snap.deadline : 0);
  const counts = COLORS.map((c) => game.hand.filter((h) => h.color === c).length);
  const bluff = pending?.card.value === "draw4" && game.hand.some((h) => h.color === game.activeColor);

  const choose = async (color: Color) => {
    if (busy) return;
    const ok = pending ? await send({ type: "play", cardId: pending.card.id, color, callUno: pending.callUno }) : await send({ type: "chooseColor", color });
    if (ok) onChosen();
  };

  useHotkeys(
    {
      "1": () => void choose("red"),
      "2": () => void choose("yellow"),
      "3": () => void choose("green"),
      "4": () => void choose("blue"),
      escape: () => pending && onCancel(),
    },
    open,
  );

  useEffect(() => {
    if (open) window.setTimeout(() => document.querySelector<HTMLButtonElement>(".wheel-swatch")?.focus(), 60);
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="wheel-layer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={(e) => e.target === e.currentTarget && pending && onCancel()}
        >
          <motion.div
            className="wheel"
            role="dialog"
            aria-modal="true"
            aria-label="Pick a color"
            initial={{ scale: 0.92, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
          >
            <div className="wheel-head">
              {pending && (
                <div className="wheel-card" aria-hidden="true">
                  <Card card={pending.card} />
                </div>
              )}
              <div>
                <h2 className="wheel-title">{opening ? "Pick the first color" : "Pick the next color"}</h2>
                <p className="wheel-sub">
                  {left > 0 ? `${left}s. ` : ""}
                  Your hand has the most {colorName(COLORS[counts.indexOf(Math.max(...counts))]!)}.
                </p>
              </div>
            </div>
            <div className="wheel-grid">
              {COLORS.map((c, i) => (
                <button
                  key={c}
                  className="wheel-swatch"
                  style={{ "--swatch": SWATCH[c] } as React.CSSProperties}
                  disabled={busy}
                  onClick={() => void choose(c)}
                  aria-label={`${colorName(c)}, you hold ${counts[i]}`}
                >
                  <span className="wheel-name">{colorName(c)}</span>
                  <span className="wheel-count tabular">
                    {counts[i]} in hand
                    <kbd>{i + 1}</kbd>
                  </span>
                </button>
              ))}
            </div>
            {bluff && (
              <p className="wheel-warn">You hold a {colorName(game.activeColor)} card, so this +4 is a bluff. If they challenge, you draw four instead.</p>
            )}
            {pending && (
              <button className="btn btn-ghost btn-sm wheel-cancel" onClick={onCancel}>
                Keep the card
              </button>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
