import type { SeatInfo } from "@uno/protocol";
import { Check, Crown, WifiSlash, Moon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { serverNow, useStore } from "../../lib/store.ts";
import { Avatar } from "../Avatar.tsx";
import { Card } from "../Card.tsx";
import { Tip } from "../Tip.tsx";

interface SeatPlateProps {
  seat: SeatInfo;
  count?: number;
  score?: number;
  active: boolean;
  self: boolean;
  compact?: boolean;
  deadline?: number;
  deadlineTotal?: number;
  children?: ReactNode;
}

type Burst = { id: number; kind: "skip" | "draw" | "uno" | "caught"; text: string };

export function SeatPlate({ seat, count, score, active, self, compact, deadline, deadlineTotal, children }: SeatPlateProps) {
  const hostId = useStore((s) => s.snap?.hostId);
  const mode = useStore((s) => s.snap?.mode);
  const status = useStore((s) => s.snap?.status);
  const bursts = useSeatBursts(seat.id);
  const isHost = hostId === seat.id;
  const inGame = status === "playing";

  const state = seatState(seat, inGame);
  const tip = [
    `${seat.name}${self ? " (you)" : ""}`,
    count !== undefined ? `${count} ${count === 1 ? "card" : "cards"}` : null,
    inGame && mode === "match" && score !== undefined ? `${score} points` : null,
    state?.long,
    isHost ? "Host" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Tip label={tip} side={compact ? "bottom" : "top"}>
      <div
        className={`seat ${active ? "seat-active" : ""} ${active && self ? "seat-mine" : ""} ${compact ? "seat-compact" : ""} ${state?.dim ? "seat-dim" : ""}`}
        data-seat={seat.id}
        tabIndex={0}
        aria-label={tip}
        aria-current={active ? "true" : undefined}
      >
        <div className="seat-avatar">
          <TimerRing deadline={deadline} total={deadlineTotal} />
          <Avatar name={seat.name} avatar={seat.avatar} size={compact ? 34 : 40} bot={seat.kind === "bot" || seat.control === "bot"} dim={state?.dim} />
          {isHost && (
            <span className="seat-host" aria-hidden="true">
              <Crown size={11} weight="fill" />
            </span>
          )}
        </div>
        <div className="seat-body">
          <div className="seat-name">
            <span>{seat.name}</span>
          </div>
          <div className="seat-meta">
            {state ? (
              <span className={`seat-state seat-state-${state.tone}`}>
                {state.icon}
                {state.short}
              </span>
            ) : count !== undefined ? (
              <span className="tabular">
                {count} {count === 1 ? "card" : "cards"}
              </span>
            ) : !inGame ? (
              <span className={seat.ready ? "seat-ready" : "seat-waiting"}>
                {seat.ready && <Check size={11} weight="bold" aria-hidden="true" />}
                {seat.ready ? "Ready" : "Not ready"}
              </span>
            ) : null}
            {inGame && mode === "match" && score !== undefined && <span className="seat-score tabular">{score}</span>}
          </div>
        </div>
        {count !== undefined && count > 0 && !compact && !self && <MiniFan count={count} />}
        {count === 1 && <span className="seat-one">1</span>}
        {children}
        <AnimatePresence>
          {bursts.map((b) => (
            <motion.span
              key={b.id}
              className={`seat-burst seat-burst-${b.kind}`}
              initial={{ opacity: 0, scale: 0.4, rotate: -12 }}
              animate={{ opacity: 1, scale: 1, rotate: -6 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
              transition={{ type: "spring", stiffness: 420, damping: 16 }}
            >
              {b.text}
            </motion.span>
          ))}
        </AnimatePresence>
      </div>
    </Tip>
  );
}

function seatState(seat: SeatInfo, inGame: boolean) {
  if (seat.kind === "bot") return inGame ? null : { short: `Bot · ${seat.botLevel}`, long: `Bot (${seat.botLevel})`, tone: "quiet", icon: null, dim: false };
  if (seat.left) return { short: "Bot playing", long: "Left the game. A bot is playing this seat", tone: "quiet", icon: null, dim: true };
  if (seat.away) return { short: "Away", long: "Away. A bot is covering until they're back", tone: "quiet", icon: <Moon size={12} weight="bold" />, dim: true };
  if (!seat.connected) {
    return {
      short: seat.control === "autopilot" ? "Bot covering" : "Reconnecting",
      long: seat.control === "autopilot" ? "Disconnected. A bot is covering the seat" : "Connection dropped. Their seat is held",
      tone: "warn",
      icon: <WifiSlash size={12} weight="bold" />,
      dim: true,
    };
  }
  return null;
}

function MiniFan({ count }: { count: number }) {
  const shown = Math.min(count, 7);
  return (
    <div className="mini-fan" aria-hidden="true">
      {Array.from({ length: shown }, (_, i) => {
        const offset = i - (shown - 1) / 2;
        return (
          <div key={i} className="mini-fan-card" style={{ transform: `translateX(${offset * 5}px) rotate(${offset * 7}deg)` }}>
            <Card back />
          </div>
        );
      })}
    </div>
  );
}

function TimerRing({ deadline, total = 45 }: { deadline?: number; total?: number }) {
  if (!deadline) return null;
  const remaining = Math.max(0, deadline - serverNow());
  const fraction = Math.min(1, remaining / (total * 1000));
  const r = 25;
  const c = 2 * Math.PI * r;
  return (
    <svg className="timer-ring" viewBox="0 0 56 56" aria-hidden="true" key={deadline}>
      <circle cx="28" cy="28" r={r} className="timer-ring-track" />
      <circle
        cx="28"
        cy="28"
        r={r}
        className="timer-ring-bar"
        strokeDasharray={c}
        style={
          {
            "--from": `${c * (1 - fraction)}`,
            "--to": `${c}`,
            animationDuration: `${remaining}ms`,
          } as React.CSSProperties
        }
      />
    </svg>
  );
}

function useSeatBursts(seatId: string): Burst[] {
  const fresh = useStore((s) => s.fresh);
  const freshKey = useStore((s) => s.freshKey);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  useEffect(() => {
    const next: Burst[] = [];
    for (const entry of fresh) {
      if (entry.kind !== "game") continue;
      const e = entry.event;
      if (e.type === "skip" && e.playerId === seatId) next.push({ id: entry.id, kind: "skip", text: "Skipped" });
      if (e.type === "draw" && e.playerId === seatId && e.reason !== "draw" && e.reason !== "timeout" && e.count > 0)
        next.push({ id: entry.id, kind: "draw", text: `+${e.count}` });
      if (e.type === "uno" && e.playerId === seatId) next.push({ id: entry.id, kind: "uno", text: "UNO!" });
      if (e.type === "caught" && e.playerId === seatId) next.push({ id: entry.id, kind: "caught", text: "Caught!" });
    }
    if (!next.length) return;
    setBursts((b) => [...b, ...next].slice(-2));
    const ids = new Set(next.map((b) => b.id));
    timers.current.push(window.setTimeout(() => setBursts((b) => b.filter((x) => !ids.has(x.id))), 1600));
  }, [freshKey]);
  return bursts;
}
