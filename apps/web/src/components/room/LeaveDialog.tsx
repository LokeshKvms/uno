import { useStore } from "../../lib/store.ts";
import { Dialog } from "../Dialog.tsx";

export function LeaveDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const snap = useStore((s) => s.snap);
  const send = useStore((s) => s.send);
  const exitRoom = useStore((s) => s.exitRoom);
  const navigate = useStore((s) => s.navigate);
  const busy = useStore((s) => s.busy);
  const playing = snap?.status === "playing" && snap.role === "player";

  const leave = async () => {
    const ok = await send({ type: "leave" });
    if (!ok) return;
    onOpenChange(false);
    exitRoom();
    navigate({ name: "home" });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={playing ? "Leave this game?" : "Leave the table?"}
      description={
        playing
          ? "A bot will finish the game in your seat. Changed your mind later? Open the invite link again during this game to take your seat back."
          : "You can come back with the code while the table is open."
      }
    >
      <div className="dialog-actions">
        <button className="btn" onClick={() => onOpenChange(false)}>
          Stay
        </button>
        <button className="btn btn-primary" disabled={busy} onClick={() => void leave()}>
          Leave table
        </button>
      </div>
    </Dialog>
  );
}
