import { BookOpen, ChatCircleText, Check, Copy, CornersIn, CornersOut, MusicNotes, SignOut, SpeakerHigh, SpeakerSlash, UserPlus } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { MusicNotesSlash } from "../MusicNotesSlash.tsx";
import { setMusicEnabled, useMusicEnabled } from "../../lib/music.ts";
import { play, setSoundEnabled, soundEnabled } from "../../lib/sound.ts";
import { useStore } from "../../lib/store.ts";
import { RulesDialog } from "../RulesDialog.tsx";
import { Tip } from "../Tip.tsx";
import { InviteDialog } from "./InviteDialog.tsx";

export function TopBar({ onLeave }: { onLeave: () => void }) {
  const snap = useStore((s) => s.snap)!;
  const navigate = useStore((s) => s.navigate);
  const panelOpen = useStore((s) => s.panelOpen);
  const setPanelOpen = useStore((s) => s.setPanelOpen);
  const unread = useStore((s) => s.unread);
  const [sound, setSound] = useState(soundEnabled());
  const music = useMusicEnabled();
  const [copied, setCopied] = useState(false);
  const [invite, setInvite] = useState(false);
  const [rules, setRules] = useState(false);
  const [full, setFull] = useState(!!document.fullscreenElement);

  useEffect(() => {
    const onChange = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const game = snap.game;
  const status = snap.status === "lobby" ? "Lobby" : game ? `Round ${game.round} · ${game.mode === "match" ? `Race to ${game.target}` : "Quick game"}` : "";

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(snap.code);
      play("copy");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setInvite(true);
    }
  };

  const toggleFull = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      useStore.getState().toast("Fullscreen isn't available in this browser.");
    }
  };

  return (
    <header className="topbar">
      <Tip label="Home. Your seat is kept while you look around." side="bottom">
        <button className="topbar-mark" onClick={() => navigate({ name: "home" })} aria-label="UNO home">
          UNO
        </button>
      </Tip>
      <Tip label={copied ? "Copied" : "Copy the table code"} side="bottom">
        <button className="code-chip tabular" onClick={() => void copyCode()} aria-label={`Table code ${snap.code}. Copy`}>
          {snap.code}
          {copied ? <Check size={14} weight="bold" /> : <Copy size={14} weight="bold" />}
        </button>
      </Tip>
      <span className="topbar-status">{status}</span>
      {snap.role === "spectator" && <span className="chip">Watching</span>}

      <div className="topbar-actions">
        <Tip label="Invite friends" side="bottom">
          <button className="icon-btn" onClick={() => setInvite(true)} aria-label="Invite friends">
            <UserPlus size={20} weight="bold" />
          </button>
        </Tip>
        <Tip label="How to play" side="bottom">
          <button className="icon-btn" onClick={() => setRules(true)} aria-label="How to play">
            <BookOpen size={20} weight="bold" />
          </button>
        </Tip>
        <Tip label={sound ? "Mute sounds" : "Turn sounds on"} side="bottom">
          <button
            className="icon-btn"
            aria-pressed={sound}
            aria-label={sound ? "Mute sounds" : "Turn sounds on"}
            onClick={() => {
              setSoundEnabled(!sound);
              setSound(!sound);
            }}
          >
            {sound ? <SpeakerHigh size={20} weight="bold" /> : <SpeakerSlash size={20} weight="bold" />}
          </button>
        </Tip>
        <Tip label={music ? "Turn music off" : "Play background music"} side="bottom">
          <button
            className="icon-btn"
            aria-pressed={music}
            aria-label={music ? "Turn music off" : "Play background music"}
            onClick={() => setMusicEnabled(!music)}
          >
            {music ? <MusicNotes size={20} weight="bold" /> : <MusicNotesSlash size={20} />}
          </button>
        </Tip>
        {document.fullscreenEnabled && (
          <Tip label={full ? "Exit fullscreen" : "Fullscreen"} side="bottom">
            <button className="icon-btn hide-phone" onClick={() => void toggleFull()} aria-label={full ? "Exit fullscreen" : "Fullscreen"}>
              {full ? <CornersIn size={20} weight="bold" /> : <CornersOut size={20} weight="bold" />}
            </button>
          </Tip>
        )}
        <Tip label={panelOpen ? "Hide chat and scores" : "Chat, log and scores"} side="bottom">
          <button className="icon-btn panel-toggle" aria-pressed={panelOpen} aria-label="Chat, log and scores" onClick={() => setPanelOpen(!panelOpen)}>
            <ChatCircleText size={20} weight="bold" />
            {unread > 0 && <span className="badge tabular">{unread > 9 ? "9+" : unread}</span>}
          </button>
        </Tip>
        <Tip label="Leave the table" side="bottom">
          <button className="icon-btn" onClick={onLeave} aria-label="Leave the table">
            <SignOut size={20} weight="bold" />
          </button>
        </Tip>
      </div>
      <InviteDialog open={invite} onOpenChange={setInvite} code={snap.code} />
      <RulesDialog open={rules} onOpenChange={setRules} />
    </header>
  );
}
