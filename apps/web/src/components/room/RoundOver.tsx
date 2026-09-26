import { cardPoints } from "@uno/engine";
import { AnimatePresence, motion } from "motion/react";
import { useCountdown } from "../../lib/hooks.ts";
import { useStore } from "../../lib/store.ts";
import { Avatar } from "../Avatar.tsx";
import { Card } from "../Card.tsx";

export function RoundOver() {
  const snap = useStore((s) => s.snap)!;
  const send = useStore((s) => s.send);
  const busy = useStore((s) => s.busy);
  const game = snap.game!;
  const open = game.phase === "roundOver" || game.phase === "matchOver";
  const left = useCountdown(open && game.phase === "roundOver" && !snap.suspended ? snap.deadline : 0);
  const last = game.history.at(-1);
  const isHost = snap.hostId === snap.selfId;
  const seat = new Map(snap.seats.map((s) => [s.id, s]));
  const matchOver = game.phase === "matchOver";
  const winnerId = matchOver ? game.matchWinnerId : game.roundWinnerId;
  const winnerName = winnerId === snap.selfId ? "You" : (seat.get(winnerId ?? "")?.name ?? "Someone");
  const title = matchOver
    ? game.mode === "single"
      ? `${winnerName} ${winnerId === snap.selfId ? "win" : "wins"}!`
      : `${winnerName} ${winnerId === snap.selfId ? "win" : "wins"} the game!`
    : `${winnerName} ${winnerId === snap.selfId ? "take" : "takes"} round ${game.round}`;
  const standings = [...game.players].sort((a, b) => b.score - a.score);

  return (
    <AnimatePresence>
      {open && last && (
        <motion.div className="roundover-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.section
            className="roundover"
            role="dialog"
            aria-modal="true"
            aria-labelledby="roundover-title"
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 28, delay: 0.35 }}
          >
            <header className="roundover-head">
              <Avatar name={seat.get(winnerId ?? "")?.name ?? "?"} avatar={seat.get(winnerId ?? "")?.avatar ?? 0} size={48} />
              <div>
                <h2 id="roundover-title">{title}</h2>
                <p className="roundover-points tabular">+{last.points} points from the cards left in everyone's hands</p>
              </div>
            </header>

            <ul className="breakdown" aria-label="Cards left in hands">
              {last.breakdown
                .slice()
                .sort((a, b) => b.points - a.points)
                .map((b) => {
                  const s = seat.get(b.playerId);
                  return (
                    <li key={b.playerId}>
                      <span className="breakdown-name">{b.playerId === snap.selfId ? "You" : s?.name}</span>
                      <span className="breakdown-cards" aria-label={`${b.cards.length} cards`}>
                        {b.cards.slice(0, 10).map((c) => (
                          <span key={c.id} className="breakdown-card" title={`${cardPoints(c)}`}>
                            <Card card={c} />
                          </span>
                        ))}
                        {b.cards.length > 10 && <span className="breakdown-more tabular">+{b.cards.length - 10}</span>}
                        {b.cards.length === 0 && <span className="breakdown-more">No cards</span>}
                      </span>
                      <span className="breakdown-points tabular">{b.points}</span>
                    </li>
                  );
                })}
            </ul>

            {game.mode === "match" && (
              <div className="roundover-standings">
                <h3>{matchOver ? "Final standings" : `Race to ${game.target}`}</h3>
                <ol>
                  {standings.map((p, i) => (
                    <li key={p.id}>
                      <span className="tabular standing-rank">{i + 1}</span>
                      <span className="standing-name">{p.id === snap.selfId ? `${p.name} (you)` : p.name}</span>
                      <span className="standing-bar" aria-hidden="true">
                        <motion.span
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(100, (p.score / game.target) * 100)}%` }}
                          transition={{ delay: 0.6 + i * 0.05, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                        />
                      </span>
                      <span className="tabular standing-points">{p.score}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <footer className="roundover-actions">
              {matchOver ? (
                isHost ? (
                  <button className="btn btn-primary" disabled={busy} onClick={() => void send({ type: "toLobby" })}>
                    Back to the lobby
                  </button>
                ) : (
                  <p className="roundover-wait">Waiting for the host to start a new game.</p>
                )
              ) : (
                <>
                  <p className="roundover-wait tabular">{left > 0 ? `Next round in ${left}s` : "Dealing..."}</p>
                  {isHost && (
                    <button className="btn btn-primary" disabled={busy} onClick={() => void send({ type: "nextRound" })}>
                      Deal now
                    </button>
                  )}
                </>
              )}
            </footer>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
