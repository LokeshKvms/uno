import type { SeatInfo } from "@uno/protocol";
import { MAX_SEATS } from "@uno/protocol/constants";
import { Check, Copy, Plus, Robot, X } from "@phosphor-icons/react";
import { useState } from "react";
import { Tip } from "../components/Tip.tsx";
import { Table } from "../components/room/Table.tsx";
import { useMedia } from "../lib/hooks.ts";
import { useStore } from "../lib/store.ts";

export function LobbyView() {
  const snap = useStore((s) => s.snap)!;
  const send = useStore((s) => s.send);
  const busy = useStore((s) => s.busy);
  const compact = useMedia("(max-width: 760px), (max-height: 520px)");
  const [copied, setCopied] = useState(false);
  const [botLevel, setBotLevel] = useState<"easy" | "normal" | "hard">("normal");
  const isHost = snap.hostId === snap.selfId;
  const me = snap.seats.find((s) => s.id === snap.selfId);
  const waiting = snap.seats.filter((s) => s.kind === "human" && !s.ready && s.id !== snap.hostId);
  const full = snap.seats.length >= MAX_SEATS;
  const canStart = isHost && snap.seats.length >= 2 && waiting.length === 0;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${location.origin}/room/${snap.code}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      useStore.getState().toast("Couldn't copy. Use Invite in the top bar instead.");
    }
  };

  const startHint = !isHost
    ? me?.ready
      ? "Waiting for the host to deal."
      : "Tap Ready when you're set."
    : snap.seats.length < 2
      ? "Invite a friend or add a bot to start."
      : waiting.length
        ? `Waiting for ${waiting.map((s) => s.name).join(", ")}.`
        : "Everyone's ready.";

  const center = (
    <div className="lobby-center">
      <p className="lobby-label">Table code</p>
      <button className="lobby-code tabular" onClick={() => void copyLink()} aria-label={`Table code ${snap.code}. Copy invite link`}>
        {snap.code}
      </button>
      <button className="btn btn-sm lobby-copy" onClick={() => void copyLink()}>
        {copied ? <Check size={16} weight="bold" /> : <Copy size={16} weight="bold" />}
        {copied ? "Link copied" : "Copy invite link"}
      </button>

      <div className="lobby-mode" role="radiogroup" aria-label="Game length">
        {(["single", "match"] as const).map((m) => (
          <Tip
            key={m}
            label={
              m === "single"
                ? "One round. First to empty their hand wins."
                : "Several rounds. The round winner scores the cards left in everyone's hands; first to 500 wins."
            }
            side="bottom"
          >
            <button role="radio" aria-checked={snap.mode === m} disabled={!isHost || busy} onClick={() => void send({ type: "settings", mode: m })}>
              {m === "single" ? "Quick game" : "Race to 500"}
            </button>
          </Tip>
        ))}
      </div>

      {snap.role === "player" &&
        (isHost ? (
          <button className="btn btn-primary lobby-start" disabled={!canStart || busy} onClick={() => void send({ type: "start" })}>
            Deal the cards
          </button>
        ) : (
          <button
            className={`btn lobby-start ${me?.ready ? "" : "btn-primary"}`}
            disabled={busy}
            onClick={() => void send({ type: "ready", ready: !me?.ready })}
          >
            {me?.ready ? "Not ready" : "Ready"}
          </button>
        ))}
      {snap.role === "spectator" && !full && (
        <button className="btn btn-primary lobby-start" disabled={busy} onClick={() => void send({ type: "takeSeat" })}>
          Take a seat
        </button>
      )}
      <p className="lobby-hint">{startHint}</p>

      {isHost && !full && (
        <div className="lobby-bots">
          <div className="segmented segmented-sm" role="radiogroup" aria-label="Bot difficulty">
            {(["easy", "normal", "hard"] as const).map((l) => (
              <button key={l} role="radio" aria-checked={botLevel === l} onClick={() => setBotLevel(l)}>
                {l[0]!.toUpperCase() + l.slice(1)}
              </button>
            ))}
          </div>
          <Tip label="Fill an empty seat with a computer player" side="bottom">
            <button className="btn btn-sm" disabled={busy} onClick={() => void send({ type: "addBot", level: botLevel })}>
              <Robot size={16} weight="bold" />
              Add bot
            </button>
          </Tip>
        </div>
      )}
    </div>
  );

  const seatExtras = (seat: SeatInfo) =>
    isHost && seat.id !== snap.selfId ? (
      <Tip label={seat.kind === "bot" ? "Remove this bot" : `Remove ${seat.name} from the table`}>
        <button
          className="seat-remove"
          aria-label={seat.kind === "bot" ? `Remove ${seat.name}` : `Remove ${seat.name}`}
          onClick={(e) => {
            e.stopPropagation();
            void send({ type: "removeSeat", seatId: seat.id });
          }}
        >
          <X size={12} weight="bold" />
        </button>
      </Tip>
    ) : null;

  return (
    <div className="lobby">
      <Table
        seats={snap.seats.map((seat) => ({ seat }))}
        viewerId={snap.role === "player" ? snap.selfId : null}
        activeId={null}
        direction={1}
        showViewer
        compact={compact}
        center={center}
        seatExtras={seatExtras}
        extraSlots={
          !full && compact ? (
            <button className="strip-open" onClick={() => void copyLink()}>
              <Plus size={16} weight="bold" />
              Invite
            </button>
          ) : null
        }
      />
    </div>
  );
}
