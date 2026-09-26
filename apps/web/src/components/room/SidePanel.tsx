import { describeEvent } from "@uno/engine";
import type { LogEntry, RoomSnapshot } from "@uno/protocol";
import { QUICK_CHAT, REACTIONS } from "@uno/protocol/constants";
import { PaperPlaneRight, Smiley, X } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { prefs, type PanelTab } from "../../lib/prefs.ts";
import { useStore } from "../../lib/store.ts";
import { Avatar } from "../Avatar.tsx";
import { Tip } from "../Tip.tsx";

export function SidePanel({ docked }: { docked: boolean }) {
  const open = useStore((s) => s.panelOpen);
  const setOpen = useStore((s) => s.setPanelOpen);
  const snap = useStore((s) => s.snap)!;
  const [tab, setTab] = useState<PanelTab>(prefs.panel());
  const showScore = !!snap.game;
  const active = tab === "score" && !showScore ? "chat" : tab;

  const pick = (t: PanelTab) => {
    setTab(t);
    prefs.setPanel(t);
  };

  const body = (
    <aside className={`panel ${docked ? "panel-docked" : "panel-sheet"}`} aria-label="Table panel">
      <div className="panel-tabs" role="tablist">
        {(["chat", "log", ...(showScore ? (["score"] as const) : [])] as PanelTab[]).map((t) => (
          <button key={t} role="tab" aria-selected={active === t} className="panel-tab" onClick={() => pick(t)}>
            {t === "chat" ? "Chat" : t === "log" ? "Log" : "Score"}
          </button>
        ))}
        {!docked && (
          <button className="icon-btn panel-close" onClick={() => setOpen(false)} aria-label="Close panel">
            <X size={18} weight="bold" />
          </button>
        )}
      </div>
      {snap.spectators.length > 0 && <p className="panel-watchers">Watching: {snap.spectators.map((s) => s.name).join(", ")}</p>}
      <div className="panel-body">
        {active === "chat" && <Chat />}
        {active === "log" && <Log snap={snap} />}
        {active === "score" && <Score snap={snap} />}
      </div>
    </aside>
  );

  if (docked) return body;
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="panel-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
          <motion.div
            className="panel-sheet-wrap"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
          >
            {body}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function Chat() {
  const chat = useStore((s) => s.chat);
  const say = useStore((s) => s.say);
  const react = useStore((s) => s.react);
  const selfId = useStore((s) => s.snap?.selfId);
  const markRead = useStore((s) => s.markChatRead);
  const [text, setText] = useState("");
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
    markRead();
  }, [chat.length, markRead]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText("");
    const ok = await say(t);
    if (!ok) setText(t);
  };

  return (
    <div className="chat">
      <div className="chat-list" ref={list} aria-live="polite">
        {chat.length === 0 ? (
          <p className="panel-empty">No messages yet. Say hi, or react with the buttons below.</p>
        ) : (
          chat.map((m, i) => {
            const prev = chat[i - 1];
            const grouped = prev && prev.fromId === m.fromId && m.at - prev.at < 60_000;
            const mine = m.fromId === selfId;
            return (
              <div key={m.id} className={`chat-msg ${mine ? "chat-mine" : ""} ${grouped ? "chat-grouped" : ""}`}>
                {!grouped && (
                  <div className="chat-head">
                    <Avatar name={m.name} avatar={m.avatar} size={20} />
                    <span className="chat-name">{mine ? "You" : m.name}</span>
                    <time className="chat-time tabular">{new Date(m.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                  </div>
                )}
                <p className={m.quick ? "chat-quick" : ""}>{m.text}</p>
              </div>
            );
          })
        )}
      </div>
      <div className="chat-quickbar">
        {QUICK_CHAT.map((q, i) => (
          <button key={q} className="chip chip-btn" onClick={() => react("quick", i)}>
            {q}
          </button>
        ))}
      </div>
      <form className="chat-form" onSubmit={(e) => void submit(e)}>
        <ReactionPicker onPick={(i) => react("emoji", i)} />
        <input
          id="chat-input"
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 240))}
          placeholder="Message the table"
          autoComplete="off"
          aria-label="Message the table"
        />
        <button className="icon-btn chat-send" type="submit" aria-label="Send" disabled={!text.trim()}>
          <PaperPlaneRight size={18} weight="fill" />
        </button>
      </form>
    </div>
  );
}

function ReactionPicker({ onPick }: { onPick: (index: number) => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div className="reaction-picker" ref={wrap}>
      <Tip label="React at the table">
        <button type="button" className="icon-btn" aria-label="React at the table" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <Smiley size={20} weight="bold" />
        </button>
      </Tip>
      {open && (
        <div className="reaction-pop" role="menu" aria-label="Reactions">
          {REACTIONS.map((r, i) => (
            <button
              key={r}
              type="button"
              role="menuitem"
              className="reaction-btn"
              aria-label={`React ${r}`}
              onClick={() => {
                onPick(i);
                setOpen(false);
              }}
            >
              {r}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function roomLine(e: Extract<LogEntry, { kind: "room" }>): string {
  switch (e.type) {
    case "joined":
      return `${e.name} sat down.`;
    case "watching":
      return `${e.name} is watching.`;
    case "left":
      return `${e.name} left the table.`;
    case "botTookOver":
      return `A bot is playing for ${e.name}.`;
    case "reconnected":
      return `${e.name} is back.`;
    case "disconnected":
      return `${e.name} lost connection. Their seat is held.`;
    case "hostChanged":
      return `${e.name} is now the host.`;
    case "removed":
      return `${e.name} was removed by the host.`;
    case "reclaimed":
      return `${e.name} took their seat back.`;
    case "away":
      return `${e.name} is away. A bot covers until they return.`;
    case "back":
      return `${e.name} is back in control.`;
  }
}

function Log({ snap }: { snap: RoomSnapshot }) {
  const names = new Map([...snap.seats, ...snap.spectators].map((s) => [s.id, s.name]));
  const nameOf = (id: string) => names.get(id) ?? "Someone";
  const lines = snap.log
    .map((e) => ({ id: e.id, at: e.at, text: e.kind === "game" ? describeEvent(e.event, nameOf, snap.selfId) : roomLine(e) }))
    .filter((l): l is { id: number; at: number; text: string } => !!l.text)
    .reverse();
  return (
    <ol className="log">
      {lines.length === 0 && <li className="panel-empty">Everything that happens at the table shows up here.</li>}
      {lines.map((l) => (
        <li key={l.id}>
          <time className="tabular">{new Date(l.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
          <span>{l.text}</span>
        </li>
      ))}
    </ol>
  );
}

function Score({ snap }: { snap: RoomSnapshot }) {
  const game = snap.game!;
  const standings = [...game.players].sort((a, b) => b.score - a.score);
  const seat = new Map(snap.seats.map((s) => [s.id, s]));
  const leader = standings[0]?.score ?? 0;
  return (
    <div className="score">
      <div className="score-head">
        <span>{game.mode === "match" ? `First to ${game.target} wins` : "Quick game: one round"}</span>
        <span className="tabular">Round {game.round}</span>
      </div>
      <ol className="standings">
        {standings.map((p, i) => {
          const s = seat.get(p.id);
          return (
            <li key={p.id} className={p.id === snap.selfId ? "standing-me" : ""}>
              <span className="standing-rank tabular">{i + 1}</span>
              <Avatar name={p.name} avatar={s?.avatar ?? 0} size={26} bot={s?.kind === "bot" || s?.control === "bot"} />
              <span className="standing-name">{p.id === snap.selfId ? `${p.name} (you)` : p.name}</span>
              <span className="standing-points tabular">{p.score}</span>
              {game.mode === "match" && (
                <span className="standing-bar" aria-hidden="true">
                  <span style={{ width: `${Math.min(100, (p.score / game.target) * 100)}%` }} />
                </span>
              )}
              {game.mode === "match" && i > 0 && p.score < leader && <span className="standing-gap tabular">{leader - p.score} behind</span>}
            </li>
          );
        })}
      </ol>
      {game.history.length > 0 && (
        <div className="history">
          <h3>Rounds</h3>
          <table>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Winner</th>
                <th scope="col" className="num">
                  Points
                </th>
              </tr>
            </thead>
            <tbody>
              {[...game.history].reverse().map((r) => (
                <tr key={r.round}>
                  <td className="tabular">{r.round}</td>
                  <td>
                    <Tip
                      label={r.breakdown
                        .map((b) => `${seat.get(b.playerId)?.name ?? "?"}: ${b.points} (${b.cards.length} ${b.cards.length === 1 ? "card" : "cards"})`)
                        .join(", ")}
                    >
                      <span tabIndex={0}>{seat.get(r.winnerId)?.name ?? "?"}</span>
                    </Tip>
                  </td>
                  <td className="num tabular">+{r.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="score-note">Numbers count face value, action cards 20, wilds 50.</p>
    </div>
  );
}
