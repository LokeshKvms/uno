import type { Card as CardData, GameEvent } from "@uno/engine";
import type { SeatInfo } from "@uno/protocol";
import { COLORS, cardLabel, colorName } from "@uno/engine";
import { SortAscending } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useCountdown, useHotkeys, useMedia } from "../../lib/hooks.ts";
import { prefs, type SortMode } from "../../lib/prefs.ts";
import { play } from "../../lib/sound.ts";
import { useStore } from "../../lib/store.ts";
import type { PendingWild } from "../../screens/GameView.tsx";
import { Avatar } from "../Avatar.tsx";
import { Card } from "../Card.tsx";
import { Tip } from "../Tip.tsx";

const VALUE_ORDER = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "skip", "reverse", "draw2", "wild", "draw4"];

function sortHand(cards: CardData[], mode: SortMode): CardData[] {
  if (mode === "none") return cards;
  const colorRank = (c: CardData) => (c.color === "wild" ? 9 : COLORS.indexOf(c.color));
  const valueRank = (c: CardData) => VALUE_ORDER.indexOf(c.value);
  return [...cards].sort((a, b) =>
    mode === "color" ? colorRank(a) - colorRank(b) || valueRank(a) - valueRank(b) : valueRank(a) - valueRank(b) || colorRank(a) - colorRank(b),
  );
}

function valueName(card: CardData): string {
  return card.value === "draw2" ? "a Draw Two" : card.value === "skip" ? "a Skip" : card.value === "reverse" ? "a Reverse" : `a ${card.value}`;
}

export function HandArea({ onWild, catchable, onCatch }: { onWild: (p: PendingWild) => void; catchable?: SeatInfo; onCatch: () => void }) {
  const snap = useStore((s) => s.snap)!;
  const send = useStore((s) => s.send);
  const busy = useStore((s) => s.busy);
  const fresh = useStore((s) => s.fresh);
  const freshKey = useStore((s) => s.freshKey);
  const game = snap.game!;
  const me = snap.seats.find((s) => s.id === snap.selfId)!;
  const myTurn = game.currentId === snap.selfId;
  const [sort, setSort] = useState<SortMode>(prefs.sort());
  const [armed, setArmed] = useState(false);
  const [marker, setMarker] = useState<string | null>(null);
  const secondsLeft = useCountdown(myTurn && !snap.suspended ? snap.deadline : 0);
  const compact = useMedia("(max-width: 760px), (max-height: 560px)");
  const cards = useMemo(() => sortHand(game.hand, sort), [game.hand, sort]);
  const playable = new Set(game.playableIds);
  const canArm = myTurn && game.hand.length === 2 && game.playableIds.length > 0 && game.phase !== "challenge";
  const mustCall = game.lastCallId === snap.selfId;

  useEffect(() => {
    if (!canArm) setArmed(false);
  }, [canArm]);

  useEffect(() => {
    if (catchable) play("catchable");
  }, [catchable?.id]);

  useEffect(() => {
    if (myTurn && secondsLeft > 0 && secondsLeft <= 5) play("tick");
  }, [myTurn, secondsLeft]);

  useEffect(() => {
    const names = new Map(snap.seats.map((s) => [s.id, s.name]));
    const events = fresh.flatMap((e) => (e.kind === "game" ? [e.event] : []));
    let lastPlay: Extract<GameEvent, { type: "play" }> | null = null;
    for (const e of events) {
      if (e.type === "play") lastPlay = e;
      const from = lastPlay && lastPlay.playerId !== snap.selfId ? ` by ${names.get(lastPlay.playerId)}` : "";
      if (e.type === "skip" && e.playerId === snap.selfId) setMarker(`Skipped${from}`);
      if (e.type === "draw" && e.playerId === snap.selfId && (e.reason === "draw2" || e.reason === "draw4")) setMarker(`+${e.count}${from}`);
      if (e.type === "caught" && e.playerId === snap.selfId) setMarker(`Caught by ${names.get(e.byId)}: +2`);
      if (e.type === "challenge" && e.challengerId === snap.selfId) setMarker(e.success ? "Challenge won" : "Challenge lost: +6");
      if (e.type === "roundStart") setMarker(null);
    }
  }, [freshKey]);

  const act = async (action: Parameters<typeof send>[0]) => {
    const ok = await send(action);
    if (ok) setMarker(null);
    return ok;
  };

  const playCard = (card: CardData) => {
    if (busy || !playable.has(card.id)) return;
    const callUno = armed && game.hand.length === 2;
    if (card.color === "wild") {
      onWild({ card, callUno });
      return;
    }
    void act({ type: "play", cardId: card.id, callUno });
  };

  const unoAction = () => {
    if (mustCall) void act({ type: "callUno" });
    else if (canArm) setArmed((a) => !a);
  };

  useHotkeys({
    u: unoAction,
    s: () => {
      const next: SortMode = sort === "color" ? "number" : sort === "number" ? "none" : "color";
      setSort(next);
      prefs.setSort(next);
    },
  });

  const reasonFor = (card: CardData): string => {
    if (playable.has(card.id)) {
      if (card.value === "draw4") return `Wild Draw Four. Legal only if you hold no ${colorName(game.activeColor)} card, and it can be challenged.`;
      if (card.value === "wild") return "Wild. Play it and pick the next color.";
      return `Play ${cardLabel(card)}`;
    }
    if (!myTurn) return cardLabel(card);
    if (game.phase === "drawn") return "After drawing, only the card you drew can be played.";
    if (game.phase === "challenge" || game.phase === "chooseColor") return "Finish the current decision first.";
    return `${cardLabel(card)} doesn't fit. Needs ${colorName(game.activeColor)} or ${valueName(game.top)}.`;
  };

  const timerLow = myTurn && secondsLeft > 0 && secondsLeft <= 10;

  return (
    <div className={`hand-area ${myTurn ? "hand-mine" : ""}`}>
      <div className="hand-bar">
        <div className="hand-me">
          {compact && (
            <>
              <Avatar name={me.name} avatar={me.avatar} size={32} />
              <div className="hand-me-text">
                <strong>{me.name}</strong>
                <span className="tabular">
                  {game.hand.length} {game.hand.length === 1 ? "card" : "cards"}
                  {game.mode === "match" ? ` · ${game.players.find((p) => p.id === snap.selfId)?.score ?? 0} pts` : ""}
                </span>
              </div>
            </>
          )}
          <AnimatePresence>
            {marker && (
              <motion.span className="hand-marker" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                {marker}
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        <div className="hand-actions">
          {timerLow && (
            <span className="hand-timer tabular" role="timer" aria-label={`${secondsLeft} seconds left`}>
              {secondsLeft}s
            </span>
          )}
          <Tip label={`Sort by ${sort === "color" ? "number" : sort === "number" ? "deal order" : "color"}`} kbd="S">
            <button
              className="icon-btn"
              aria-label="Change hand sorting"
              onClick={() => {
                const next: SortMode = sort === "color" ? "number" : sort === "number" ? "none" : "color";
                setSort(next);
                prefs.setSort(next);
              }}
            >
              <SortAscending size={20} weight="bold" />
            </button>
          </Tip>
          {game.canDraw && (
            <Tip label="Draw one card" kbd="D">
              <button className="btn btn-sm" disabled={busy} onClick={() => void act({ type: "draw" })}>
                Draw
              </button>
            </Tip>
          )}
          {game.canPass && (
            <Tip label="Keep the drawn card and end your turn" kbd="K">
              <button className="btn btn-sm" disabled={busy} onClick={() => void act({ type: "pass" })}>
                Keep it
              </button>
            </Tip>
          )}
          {catchable && (
            <Tip label={`${catchable.name} didn't call UNO. Catch them before the next player moves and they draw two.`} kbd="C">
              <button className="btn btn-sm btn-catch" disabled={busy} onClick={onCatch}>
                <span className="btn-catch-label">
                  Catch<span className="hide-phone"> {catchable.name}</span>!
                </span>
              </button>
            </Tip>
          )}
          <Tip
            label={
              mustCall
                ? "Call it now before someone catches you!"
                : canArm
                  ? armed
                    ? "UNO is ready. It's called as you play your next card."
                    : "Down to two: press before you play your next card."
                  : "Press when you're about to play your second-to-last card."
            }
            kbd="U"
          >
            <button
              className={`uno-btn ${armed ? "is-armed" : ""} ${mustCall ? "is-urgent" : ""}`}
              aria-pressed={armed || undefined}
              aria-disabled={!(canArm || mustCall) || busy}
              onClick={unoAction}
            >
              UNO!
            </button>
          </Tip>
        </div>
      </div>
      <Hand cards={cards} playable={playable} myTurn={myTurn} drawnId={game.drawnCardId} reasonFor={reasonFor} onPlay={playCard} />
    </div>
  );
}

interface HandProps {
  cards: CardData[];
  playable: Set<string>;
  myTurn: boolean;
  drawnId: string | null;
  reasonFor: (c: CardData) => string;
  onPlay: (c: CardData) => void;
}

function Hand({ cards, playable, myTurn, drawnId, reasonFor, onPlay }: HandProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const small = useMedia("(max-width: 760px), (max-height: 560px)");
  const reduce = useReducedMotion();
  const cw = small ? 70 : 100;
  const ch = cw * 1.5;

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const n = cards.length;
  const room = Math.max(cw, width - 24);
  const ideal = cw * (n <= 10 ? 0.8 : 0.6);
  const spacing = n > 1 ? Math.max(cw * 0.34, Math.min(ideal, (room - cw) / (n - 1))) : 0;
  const fanWidth = cw + spacing * Math.max(0, n - 1);
  const overflow = fanWidth > room;
  const mid = (n - 1) / 2;
  const angle = small ? Math.min(2, 16 / Math.max(n, 1)) : Math.min(4.5, 46 / Math.max(n, 1));
  const arc = small ? Math.min(0.6, 8 / Math.max(1, mid * mid)) : Math.min(1.6, 24 / Math.max(1, mid * mid));
  const rise = arc * mid * mid;
  const LIFT = 16;
  const dip = Math.ceil((cw / 2) * Math.sin((angle * mid * Math.PI) / 180)) + 6;

  return (
    <div className={`hand ${overflow ? "hand-scroll" : ""}`} ref={wrap} role="toolbar" aria-label="Your hand">
      <div className="hand-fan" style={{ width: fanWidth, height: ch + rise + LIFT + 26 + dip }}>
        {cards.map((card, i) => {
          const offset = i - mid;
          const isPlayable = myTurn && playable.has(card.id);
          const dim = myTurn && !isPlayable;
          const baseY = arc * offset * offset - rise - (isPlayable ? LIFT : 0);
          return (
            <motion.div
              key={card.id}
              layoutId={card.id}
              className={`hand-card ${isPlayable ? "is-playable" : ""} ${dim ? "is-dim" : ""} ${card.id === drawnId ? "is-drawn" : ""}`}
              style={{ left: i * spacing, bottom: dip, width: cw, zIndex: i + 1 }}
              initial={reduce ? false : { opacity: 0, y: -70, scale: 0.85 }}
              animate={{ opacity: 1, y: baseY, rotate: offset * angle, scale: 1 }}
              whileHover={isPlayable && !reduce ? { y: baseY - 12, transition: { duration: 0.15 } } : undefined}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
            >
              <Tip label={reasonFor(card)} side="top">
                <button className="hand-card-btn" aria-label={reasonFor(card)} aria-disabled={!isPlayable} onClick={() => onPlay(card)}>
                  <Card card={card} />
                </button>
              </Tip>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
