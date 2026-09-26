import type { Card as CardData, Color } from "@uno/engine";
import { colorName } from "@uno/engine";
import type { LogEntry, SeatInfo } from "@uno/protocol";
import { TIMING } from "@uno/protocol/constants";
import { ArrowsClockwise, ArrowsCounterClockwise } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Card } from "../components/Card.tsx";
import { Tip } from "../components/Tip.tsx";
import { ChallengePanel } from "../components/room/ChallengePanel.tsx";
import { ColorWheel } from "../components/room/ColorWheel.tsx";
import { FlyLayer } from "../components/room/FlyLayer.tsx";
import { HandArea } from "../components/room/HandArea.tsx";
import { RoundOver } from "../components/room/RoundOver.tsx";
import { Table } from "../components/room/Table.tsx";
import { useHotkeys, useMedia } from "../lib/hooks.ts";
import { useStore } from "../lib/store.ts";

export const COLOR_VAR: Record<Color, string> = {
  red: "var(--uno-red)",
  yellow: "var(--uno-yellow)",
  green: "var(--uno-green)",
  blue: "var(--uno-blue)",
};

export type PendingWild = { card: CardData; callUno: boolean } | null;

export function GameView() {
  const snap = useStore((s) => s.snap)!;
  const send = useStore((s) => s.send);
  const busy = useStore((s) => s.busy);
  const compact = useMedia("(max-width: 760px), (max-height: 560px)");
  const [pending, setPending] = useState<PendingWild>(null);
  const game = snap.game!;
  const me = snap.seats.find((s) => s.id === snap.selfId);
  const myTurn = game.currentId === snap.selfId;

  useEffect(() => {
    setPending(null);
  }, [game.currentId, game.phase, game.round]);

  const counts = new Map(game.players.map((p) => [p.id, p]));
  const seats = snap.seats.map((seat) => ({ seat, count: counts.get(seat.id)?.count, score: counts.get(seat.id)?.score }));

  const total =
    snap.deadlineKind === "challenge"
      ? TIMING.challengeMs / 1000
      : snap.deadlineKind === "color"
        ? TIMING.colorMs / 1000
        : game.phase === "drawn"
          ? TIMING.drawnMs / 1000
          : TIMING.turnMs / 1000;

  const catchable = snap.role === "player" && game.lastCallId && game.lastCallId !== snap.selfId ? snap.seats.find((s) => s.id === game.lastCallId) : undefined;
  const catchThem = () => catchable && !busy && void send({ type: "catch", targetId: catchable.id });

  useHotkeys(
    {
      d: () => game.canDraw && !busy && void send({ type: "draw" }),
      k: () => game.canPass && !busy && void send({ type: "pass" }),
      c: catchThem,
      t: () => {
        useStore.getState().setPanelOpen(true);
        window.setTimeout(() => document.getElementById("chat-input")?.focus(), 50);
      },
    },
    snap.role === "player",
  );

  const seatExtras = (seat: SeatInfo) =>
    catchable?.id === seat.id ? (
      <Tip label={`${seat.name} is on one card and didn't call UNO. Catch them for +2.`} kbd="C">
        <button className="catch-btn" disabled={busy} onClick={catchThem}>
          Catch!
        </button>
      </Tip>
    ) : null;

  return (
    <div className={`game ${compact ? "game-compact" : ""}`}>
      <Table
        seats={seats}
        viewerId={snap.role === "player" ? snap.selfId : null}
        activeId={game.phase === "roundOver" || game.phase === "matchOver" ? null : game.currentId}
        direction={game.direction}
        showViewer={snap.role !== "player" || !compact}
        compact={compact}
        center={<GameCenter />}
        seatExtras={seatExtras}
        deadline={snap.suspended ? undefined : snap.deadline}
        deadlineTotal={total}
      />
      {snap.role === "player" ? (
        <HandArea onWild={setPending} catchable={catchable} onCatch={catchThem} />
      ) : (
        <div className="hand-area hand-watching">
          <p>You're watching this game. You'll get a seat when the next one starts.</p>
        </div>
      )}
      {me?.away && (
        <div className="banner banner-strong" role="status">
          <span>You're marked away. A bot is playing your turns.</span>
          <button className="btn btn-sm btn-primary" onClick={() => void send({ type: "back" })}>
            I'm back
          </button>
        </div>
      )}
      <ColorWheel pending={pending} opening={myTurn && game.phase === "chooseColor"} onCancel={() => setPending(null)} onChosen={() => setPending(null)} />
      <ChallengePanel />
      <RoundOver />
      <FlyLayer compact={compact} />
    </div>
  );
}

function tiltFor(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((Math.abs(h) % 29) - 14) * 0.9;
}

function GameCenter() {
  const snap = useStore((s) => s.snap)!;
  const fresh = useStore((s) => s.fresh);
  const send = useStore((s) => s.send);
  const busy = useStore((s) => s.busy);
  const reduce = useReducedMotion();
  const game = snap.game!;
  const discardRef = useRef<HTMLDivElement>(null);
  const top = game.top;
  const under = game.discardTrail.slice(0, -1).slice(-3);
  const names = new Map(snap.seats.map((s) => [s.id, s.name]));

  const playedBy = lastPlayer(fresh, top.id);
  let initial: false | { x: number; y: number; rotate: number; scale: number } = false;
  if (!reduce && playedBy && playedBy !== snap.selfId && discardRef.current) {
    const seatEl = document.querySelector(`[data-seat="${playedBy}"]`);
    const to = discardRef.current.getBoundingClientRect();
    const from = seatEl?.getBoundingClientRect();
    if (from) {
      initial = {
        x: from.left + from.width / 2 - (to.left + to.width / 2),
        y: from.top + from.height / 2 - (to.top + to.height / 2),
        rotate: tiltFor(top.id) - 40,
        scale: 0.55,
      };
    }
  }

  const drawLabel = game.canDraw ? "Draw a card" : `Draw pile: ${game.drawCount} ${game.drawCount === 1 ? "card" : "cards"}`;
  const stack = Math.max(1, Math.min(4, Math.ceil(game.drawCount / 25)));

  return (
    <div className="center">
      <div className="piles">
        <Tip label={drawLabel} kbd={game.canDraw ? "D" : undefined}>
          <button
            className={`draw-pile ${game.canDraw ? "is-live" : ""}`}
            data-anchor="deck"
            aria-label={drawLabel}
            aria-disabled={!game.canDraw || busy}
            onClick={() => game.canDraw && !busy && void send({ type: "draw" })}
          >
            {Array.from({ length: stack }, (_, i) => (
              <div key={i} className="pile-layer" style={{ transform: `translate(${-i * 1.5}px, ${-i * 1.5}px)` }}>
                <Card back />
              </div>
            ))}
            <span className="pile-count tabular" aria-hidden="true">
              {game.drawCount}
            </span>
          </button>
        </Tip>

        <Tip label={`${colorName(game.activeColor)} is in play`}>
          <div
            className="discard"
            ref={discardRef}
            data-anchor="discard"
            tabIndex={0}
            aria-label={`Top card ${top.color === "wild" ? top.value : `${top.color} ${top.value}`}. ${colorName(game.activeColor)} in play.`}
          >
            <span className="live-ring" style={{ "--live": COLOR_VAR[game.activeColor] } as React.CSSProperties} aria-hidden="true" />
            {under.map((c) => (
              <div key={c.id} className="discard-card discard-under" style={{ transform: `rotate(${tiltFor(c.id)}deg)` }}>
                <Card card={c} />
              </div>
            ))}
            <motion.div
              key={top.id}
              layoutId={top.id}
              className="discard-card"
              initial={initial}
              animate={{ x: 0, y: 0, rotate: tiltFor(top.id), scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 28, mass: 0.9 }}
            >
              <Card card={top} />
            </motion.div>
          </div>
        </Tip>
      </div>

      <div className="center-status">
        <span className="live-chip" style={{ "--live": COLOR_VAR[game.activeColor] } as React.CSSProperties}>
          <i aria-hidden="true" />
          {colorName(game.activeColor)}
        </span>
        <Tip label={game.direction === 1 ? "Play goes clockwise" : "Play goes counterclockwise"}>
          <span className="direction" tabIndex={0} aria-label={game.direction === 1 ? "Clockwise" : "Counterclockwise"}>
            <motion.span
              key={game.direction}
              initial={reduce ? false : { rotate: game.direction === 1 ? -180 : 180 }}
              animate={{ rotate: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              style={{ display: "inline-grid" }}
            >
              {game.direction === 1 ? <ArrowsClockwise size={18} weight="bold" /> : <ArrowsCounterClockwise size={18} weight="bold" />}
            </motion.span>
          </span>
        </Tip>
      </div>
      <StatusLine names={names} />
    </div>
  );
}

function lastPlayer(fresh: LogEntry[], cardId: string): string | null {
  for (let i = fresh.length - 1; i >= 0; i--) {
    const e = fresh[i]!;
    if (e.kind === "game" && e.event.type === "play" && e.event.card.id === cardId) return e.event.playerId;
  }
  return null;
}

function StatusLine({ names }: { names: Map<string, string> }) {
  const snap = useStore((s) => s.snap)!;
  const game = snap.game!;
  const mine = game.currentId === snap.selfId;
  const who = names.get(game.currentId ?? "") ?? "Someone";
  let text: string;
  if (snap.suspended) text = "Paused while everyone reconnects.";
  else if (game.phase === "roundOver" || game.phase === "matchOver") text = "Round over.";
  else if (mine) {
    if (game.phase === "chooseColor") text = "Pick the first color.";
    else if (game.phase === "challenge") text = "A Wild Draw Four is on you.";
    else if (game.phase === "drawn") text = "Play the card you drew, or keep it.";
    else text = game.playableIds.length ? "Your turn. Play a highlighted card or draw." : "Your turn. Nothing matches, so draw a card.";
  } else if (game.phase === "chooseColor") text = `${who} is picking the first color.`;
  else if (game.phase === "challenge") text = `${who} is deciding whether to challenge.`;
  else text = `${who}'s turn.`;
  return (
    <p className={`status-line ${mine ? "status-mine" : ""}`} aria-live="polite">
      {text}
    </p>
  );
}
