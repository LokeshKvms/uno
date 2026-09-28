import { Check, Copy, ShareNetwork } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { play } from "../../lib/sound.ts";
import { Dialog } from "../Dialog.tsx";

export function InviteDialog({ open, onOpenChange, code }: { open: boolean; onOpenChange: (o: boolean) => void; code: string }) {
  const link = `${location.origin}/room/${code}`;
  const canvas = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator.share === "function";

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      void import("qrcode").then(({ default: QRCode }) => {
        if (canvas.current) {
          void QRCode.toCanvas(canvas.current, link, { width: 168, margin: 1, color: { dark: "#141816", light: "#f4f1ea" } });
        }
      });
    }, 30);
    return () => window.clearTimeout(t);
  }, [open, link]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      play("copy");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      document.getElementById("invite-link")?.focus();
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Invite friends"
      description="Anyone with this link or code can join. Up to 10 players, and more can watch."
    >
      <div className="invite">
        <div className="field">
          <label className="field-label" htmlFor="invite-link">
            Invite link
          </label>
          <div className="invite-row">
            <input id="invite-link" className="input" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
            <button className="btn btn-primary" onClick={() => void copy()}>
              {copied ? <Check size={18} weight="bold" /> : <Copy size={18} weight="bold" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
        <div className="invite-lower">
          <canvas ref={canvas} className="invite-qr" aria-label="QR code for the invite link" />
          <div className="invite-code">
            <span className="field-label">Or share the code</span>
            <span className="invite-code-value tabular">{code}</span>
            {canShare && (
              <button
                className="btn btn-sm"
                onClick={() => void navigator.share({ title: "Play UNO with me", text: `Join my UNO table: ${code}`, url: link }).catch(() => {})}
              >
                <ShareNetwork size={16} weight="bold" />
                Share
              </button>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
