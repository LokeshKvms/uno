import { colorName } from "@uno/engine";
import { useCountdown } from "../../lib/hooks.ts";
import { useStore } from "../../lib/store.ts";
import { Card } from "../Card.tsx";
import { Dialog } from "../Dialog.tsx";

export function ChallengePanel() {
  const snap = useStore((s) => s.snap)!;
  const send = useStore((s) => s.send);
  const busy = useStore((s) => s.busy);
  const game = snap.game!;
  const challenge = game.challenge;
  const open = game.phase === "challenge" && challenge?.victimId === snap.selfId;
  const left = useCountdown(open ? snap.deadline : 0);
  const offender = snap.seats.find((s) => s.id === challenge?.offenderId)?.name ?? "They";
  const prev = challenge ? colorName(challenge.previousColor) : "";

  return (
    <Dialog
      open={open}
      dismissable={false}
      title={`${offender} played a Wild Draw Four`}
      description={
        <>
          <p>
            It's only legal if {offender} had no {prev} card. Think they bluffed? Challenge: if you're right they draw four; if not, you draw six.
          </p>
        </>
      }
    >
      <div className="challenge-cards" aria-hidden="true">
        <div className="challenge-card">
          <Card card={game.top} />
        </div>
      </div>
      <div className="dialog-actions">
        <span className="challenge-timer tabular">{left > 0 ? `${left}s` : ""}</span>
        <button className="btn" data-sound="none" disabled={busy} onClick={() => void send({ type: "challenge", challenge: false })}>
          Take four
        </button>
        <button className="btn btn-move" data-sound="none" disabled={busy} onClick={() => void send({ type: "challenge", challenge: true })}>
          Challenge
        </button>
      </div>
    </Dialog>
  );
}
