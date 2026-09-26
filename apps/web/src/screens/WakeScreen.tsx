import { motion, useReducedMotion } from "motion/react";
import { Card } from "../components/Card.tsx";
import { useStore } from "../lib/store.ts";

export function WakeScreen() {
  const waking = useStore((s) => s.waking);
  const reduce = useReducedMotion();
  return (
    <main className="wake">
      <div className="wake-deck" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="wake-card"
            initial={false}
            animate={reduce ? {} : { rotate: [0, -8 + i * 8, 0], y: [0, -6, 0] }}
            transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.18, ease: "easeInOut" }}
          >
            <Card back />
          </motion.div>
        ))}
      </div>
      <p className="wake-title">{waking ? "Warming up the table" : "Shuffling"}</p>
      {waking && <p className="wake-sub">The server naps when nobody is playing. This can take up to a minute.</p>}
    </main>
  );
}
