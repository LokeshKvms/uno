import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useStore } from "../../lib/store.ts";
import { Card } from "../Card.tsx";

interface Flight {
  id: string;
  from: DOMRect;
  to: DOMRect;
  delay: number;
}

function rectOf(selector: string): DOMRect | null {
  const el = document.querySelector(selector);
  return el ? el.getBoundingClientRect() : null;
}

export function FlyLayer({ compact }: { compact: boolean }) {
  const freshKey = useStore((s) => s.freshKey);
  const fresh = useStore((s) => s.fresh);
  const selfId = useStore((s) => s.snap?.selfId);
  const seatIds = useStore((s) => s.snap?.game?.players.map((p) => p.id).join(",") ?? "");
  const reduce = useReducedMotion();
  const [flights, setFlights] = useState<Flight[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    if (reduce || !fresh.length) return;
    const deck = rectOf('[data-anchor="deck"]');
    if (!deck) return;
    const targetFor = (playerId: string) => (playerId === selfId ? (rectOf(".hand-fan") ?? rectOf(".hand-area")) : rectOf(`[data-seat="${playerId}"]`));

    const next: Flight[] = [];
    let delay = 0;
    for (const entry of fresh) {
      if (entry.kind !== "game") continue;
      const e = entry.event;
      if (e.type === "roundStart") {
        const ids = seatIds.split(",").filter(Boolean);
        for (let round = 0; round < 3; round++) {
          for (const id of ids) {
            const to = targetFor(id);
            if (to) next.push({ id: `f${++seq.current}`, from: deck, to, delay: delay });
            delay += 0.035;
          }
        }
        delay += 0.1;
      }
      if (e.type === "draw" && e.count > 0) {
        const to = targetFor(e.playerId);
        if (!to) continue;
        for (let i = 0; i < Math.min(e.count, 4); i++) {
          next.push({ id: `f${++seq.current}`, from: deck, to, delay: delay + i * 0.08 });
        }
        delay += 0.1;
      }
    }
    if (!next.length) return;
    setFlights((f) => [...f, ...next].slice(-40));
  }, [freshKey]);

  const size = compact ? 44 : 60;
  return (
    <div className="fly-layer" aria-hidden="true">
      {flights.map((f) => {
        const x0 = f.from.left + f.from.width / 2 - size / 2;
        const y0 = f.from.top + f.from.height / 2 - (size * 1.5) / 2;
        const x1 = f.to.left + f.to.width / 2 - size / 2;
        const y1 = f.to.top + f.to.height / 2 - (size * 1.5) / 2;
        return (
          <motion.div
            key={f.id}
            className="fly-card"
            style={{ width: size }}
            initial={{ x: x0, y: y0, rotate: -8, opacity: 1, scale: 1 }}
            animate={{ x: x1, y: y1, rotate: 14, opacity: [1, 1, 0], scale: 0.7 }}
            transition={{ duration: 0.5, delay: f.delay, ease: [0.3, 0.7, 0.2, 1], opacity: { duration: 0.5, delay: f.delay, times: [0, 0.8, 1] } }}
            onAnimationComplete={() => setFlights((all) => all.filter((x) => x.id !== f.id))}
          >
            <Card back />
          </motion.div>
        );
      })}
    </div>
  );
}
