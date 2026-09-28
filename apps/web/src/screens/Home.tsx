import type { Card as CardData } from "@uno/engine";
import { ArrowRight, BookOpen, MusicNotes, Robot, SpeakerHigh, SpeakerSlash, Users } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import { type FormEvent, useEffect, useState } from "react";
import { Card, UnoLogo } from "../components/Card.tsx";
import { type LegalPage, LegalDialog } from "../components/LegalDialog.tsx";
import { NameFields } from "../components/NameFields.tsx";
import { RulesDialog } from "../components/RulesDialog.tsx";
import { api } from "../lib/api.ts";
import { MusicNotesSlash } from "../components/MusicNotesSlash.tsx";
import { setMusicEnabled, useMusicEnabled } from "../lib/music.ts";
import { play, setSoundEnabled, soundEnabled } from "../lib/sound.ts";
import { useStore } from "../lib/store.ts";

const HERO: CardData[] = [
  { id: "h1", color: "blue", value: "7" },
  { id: "h2", color: "yellow", value: "reverse" },
  { id: "h3", color: "wild", value: "draw4" },
  { id: "h4", color: "red", value: "skip" },
  { id: "h5", color: "green", value: "2" },
];

const PERKS: { card: CardData; title: string; text: string }[] = [
  { card: { id: "p1", color: "red", value: "skip" }, title: "Skip the sign-up.", text: "No accounts, no downloads. One link and you're in." },
  { card: { id: "p2", color: "yellow", value: "reverse" }, title: "Refresh? Reversed.", text: "Your hand survives refreshes, dead wifi and closed tabs." },
  { card: { id: "p3", color: "green", value: "draw2" }, title: "Rage quit? Covered.", text: "Leave mid-game and a bot plays your hand until you're back." },
  { card: { id: "p4", color: "blue", value: "5" }, title: "First to 500 wins.", text: "A live scoreboard keeps every point of every round." },
];

const FAN_DROP = 5;
const FAN_LIFT = 10.4;

type Busy = null | "create" | "join" | "bots";

export function Home() {
  const me = useStore((s) => s.me);
  const setMe = useStore((s) => s.setMe);
  const navigate = useStore((s) => s.navigate);
  const enterRoom = useStore((s) => s.enterRoom);
  const toast = useStore((s) => s.toast);
  const current = useStore((s) => s.code);
  const [name, setName] = useState(me.name);
  const [avatar, setAvatar] = useState(me.avatar);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [nameError, setNameError] = useState("");
  const [bots, setBots] = useState(3);
  const [level, setLevel] = useState<"easy" | "normal" | "hard">("normal");
  const [rules, setRules] = useState(false);
  const [legal, setLegal] = useState<LegalPage | null>(null);
  const [sound, setSound] = useState(soundEnabled());
  const music = useMusicEnabled();
  const reduce = useReducedMotion();

  useEffect(() => {
    setNameError("");
  }, [name]);

  const requireName = () => {
    const clean = name.trim();
    if (!clean) {
      setNameError("Enter a name so your friends know who's who.");
      document.getElementById("home-name")?.focus();
      return null;
    }
    return clean;
  };

  const go = async (kind: Exclude<Busy, null>, e?: FormEvent) => {
    e?.preventDefault();
    const clean = requireName();
    if (!clean) return;
    if (kind === "join" && code.trim().length !== 6) {
      toast("Room codes are 6 characters, like K7QX2P.");
      return;
    }
    play("tap");
    setBusy(kind);
    try {
      const result =
        kind === "join"
          ? await api.joinRoom(code.trim().toUpperCase(), clean, avatar)
          : await api.createRoom(clean, avatar, kind === "bots" ? { count: bots, level } : undefined);
      setMe(clean, avatar);
      navigate({ name: "room", code: result.code });
      enterRoom(result.code);
    } catch (error) {
      const message = (error as Error).message;
      if (/name/i.test(message)) setNameError(message);
      else toast(message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="home">
      <UnoLogo className="home-mark" />
      <div className="home-audio">
        <button
          type="button"
          className="icon-btn"
          aria-pressed={sound}
          aria-label={sound ? "Mute sounds" : "Turn sounds on"}
          data-sound="none"
          title={sound ? "Mute sounds" : "Turn sounds on"}
          onClick={() => {
            setSoundEnabled(!sound);
            setSound(!sound);
            if (!sound) play("select");
          }}
        >
          {sound ? <SpeakerHigh size={20} weight="bold" /> : <SpeakerSlash size={20} weight="bold" />}
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-pressed={music}
          aria-label={music ? "Turn music off" : "Play background music"}
          title={music ? "Turn music off" : "Play background music"}
          onClick={() => setMusicEnabled(!music)}
        >
          {music ? <MusicNotes size={20} weight="bold" /> : <MusicNotesSlash size={20} />}
        </button>
      </div>

      <section className="home-copy">
        <h1 className="home-title">Deal your friends in.</h1>
        <p className="home-lede">Classic UNO in the browser. Start a table, drop the link in the group chat, and play by the real rules.</p>

        {current && (
          <button className="home-rejoin" onClick={() => navigate({ name: "room", code: current })}>
            <span>
              Your seat at table <strong className="tabular">{current}</strong> is still warm
            </span>
            <ArrowRight size={18} weight="bold" />
          </button>
        )}

        <form className="home-form" onSubmit={(e) => void go("create", e)}>
          <NameFields
            id="home-name"
            name={name}
            avatar={avatar}
            onName={setName}
            onAvatar={(v) => {
              setAvatar(v);
            }}
            error={nameError}
          />

          <div className="home-actions">
            <button type="submit" data-sound="none" className="btn btn-primary home-create" disabled={busy !== null}>
              <Users size={18} weight="bold" />
              {busy === "create" ? "Setting up..." : "Create a table"}
            </button>
          </div>
        </form>

        <form className="home-join" onSubmit={(e) => void go("join", e)}>
          <label className="field-label" htmlFor="home-code">
            Friend already dealing?
          </label>
          <div className="home-join-row">
            <input
              id="home-code"
              className="input code-input"
              value={code}
              onChange={(e) =>
                setCode(
                  e.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, "")
                    .slice(0, 6),
                )
              }
              placeholder="K7QX2P"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              inputMode="text"
              aria-describedby="home-code-help"
            />
            <button type="submit" data-sound="none" className="btn" disabled={busy !== null || code.length !== 6}>
              {busy === "join" ? "Joining..." : "Join"}
            </button>
          </div>
          <p id="home-code-help" className="field-help">
            Type their 6-character code, or just tap the invite link they sent.
          </p>
        </form>

        <div className="home-practice">
          <div className="home-practice-head">
            <Robot size={18} weight="bold" aria-hidden="true" />
            <span>Nobody around? Warm up against bots.</span>
          </div>
          <div className="home-practice-row">
            <div className="segmented" role="radiogroup" aria-label="Number of bots">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={bots === n}
                  onClick={() => {
                    setBots(n);
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="segmented" role="radiogroup" aria-label="Bot difficulty">
              {(["easy", "normal", "hard"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  role="radio"
                  aria-checked={level === l}
                  onClick={() => {
                    setLevel(l);
                  }}
                >
                  {l[0]!.toUpperCase() + l.slice(1)}
                </button>
              ))}
            </div>
            <button type="button" data-sound="none" className="btn btn-sm" disabled={busy !== null} onClick={() => void go("bots")}>
              {busy === "bots" ? "Starting..." : "Start game"}
            </button>
          </div>
        </div>
      </section>

      <section className="home-table" aria-hidden="true">
        <div className="home-felt">
          <div className="home-fan">
            {HERO.map((c, i) => {
              const mid = (HERO.length - 1) / 2;
              const offset = i - mid;
              const rest = Math.abs(offset) * FAN_DROP - FAN_LIFT;
              return (
                <motion.div
                  key={c.id}
                  className="home-fan-card"
                  initial={reduce ? false : { y: "40%", rotate: 0, opacity: 0 }}
                  animate={{ y: `${rest}%`, rotate: offset * 9, opacity: 1 }}
                  whileHover={reduce ? undefined : { y: `${rest - 11}%`, transition: { type: "spring", stiffness: 380, damping: 22 } }}
                  transition={{ type: "spring", stiffness: 140, damping: 18, delay: 0.1 + i * 0.07 }}
                  style={{ zIndex: i }}
                >
                  <Card card={c} />
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      <div className="home-info">
        <ul className="home-perks">
          {PERKS.map((p) => (
            <li key={p.card.id}>
              <span className="home-perk-card" aria-hidden="true">
                <Card card={p.card} />
              </span>
              <span className="home-perk-text">
                <strong>{p.title}</strong>
                <span>{p.text}</span>
              </span>
            </li>
          ))}
        </ul>
        <button className="btn btn-ghost btn-sm home-rules" onClick={() => setRules(true)}>
          <BookOpen size={16} weight="bold" />
          Rusty? Brush up on the rules
        </button>
      </div>

      <footer className="home-foot">
        <span>Made by Loki</span>
        <nav aria-label="About this site">
          <button type="button" data-sound="select" onClick={() => setLegal("privacy")}>
            Privacy
          </button>
          <button type="button" data-sound="select" onClick={() => setLegal("terms")}>
            Terms
          </button>
          <button type="button" data-sound="select" onClick={() => setLegal("credits")}>
            Credits
          </button>
          <a href="https://github.com/LokeshKvms/uno/issues" target="_blank" rel="noopener noreferrer">
            Feedback
          </a>
        </nav>
        <p>UNO is a trademark of Mattel. This fan project is not affiliated with Mattel.</p>
      </footer>

      <RulesDialog open={rules} onOpenChange={setRules} />
      <LegalDialog page={legal} onClose={() => setLegal(null)} />
    </main>
  );
}
