import { ArrowsClockwise, WifiSlash } from "@phosphor-icons/react";
import { LayoutGroup } from "motion/react";
import { useEffect, useState } from "react";
import { LeaveDialog } from "../components/room/LeaveDialog.tsx";
import { SidePanel } from "../components/room/SidePanel.tsx";
import { TopBar } from "../components/room/TopBar.tsx";
import { useMedia } from "../lib/hooks.ts";
import { useStore } from "../lib/store.ts";
import { GameView } from "./GameView.tsx";
import { JoinGate } from "./JoinGate.tsx";
import { LobbyView } from "./LobbyView.tsx";

export function RoomScreen({ code }: { code: string }) {
  const storeCode = useStore((s) => s.code);
  const snap = useStore((s) => s.snap);
  const conn = useStore((s) => s.conn);
  const takeOver = useStore((s) => s.takeOver);
  const panelOpen = useStore((s) => s.panelOpen);
  const setPanelOpen = useStore((s) => s.setPanelOpen);
  const [leaving, setLeaving] = useState(false);
  const wide = useMedia("(min-width: 1100px)");

  useEffect(() => {
    setPanelOpen(wide);
  }, [wide, setPanelOpen]);

  if (storeCode !== code || conn === "idle") return <JoinGate code={code} />;

  if (!snap || snap.code !== code) {
    return (
      <main className="room-loading">
        <p className="wake-title">Finding your seat</p>
        <p className="wake-sub">{conn === "offline" ? "Reconnecting to the table..." : "Pulling up a chair."}</p>
      </main>
    );
  }

  return (
    <div className={`room ${wide ? "room-wide" : ""} ${panelOpen && !wide ? "room-panel-open" : ""}`}>
      <TopBar onLeave={() => setLeaving(true)} />
      <LayoutGroup>
        <div className="room-stage">{snap.status === "lobby" ? <LobbyView /> : <GameView />}</div>
      </LayoutGroup>
      <SidePanel docked={wide} />

      {conn === "offline" && (
        <div className="banner" role="status">
          <WifiSlash size={18} weight="bold" />
          <span>Connection lost. Your seat is safe while we reconnect.</span>
        </div>
      )}
      {conn === "replaced" && (
        <div className="banner banner-strong" role="status">
          <span>This table is open in another tab or device.</span>
          <button className="btn btn-sm btn-primary" onClick={takeOver}>
            <ArrowsClockwise size={16} weight="bold" />
            Use this tab
          </button>
        </div>
      )}
      <LeaveDialog open={leaving} onOpenChange={setLeaving} />
    </div>
  );
}
