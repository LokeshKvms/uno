import type { RoomPreview } from "@uno/protocol";
import { ArrowLeft } from "@phosphor-icons/react";
import { type FormEvent, useEffect, useState } from "react";
import { Card } from "../components/Card.tsx";
import { NameFields } from "../components/NameFields.tsx";
import { api } from "../lib/api.ts";
import { play } from "../lib/sound.ts";
import { useStore } from "../lib/store.ts";

export function JoinGate({ code }: { code: string }) {
  const me = useStore((s) => s.me);
  const setMe = useStore((s) => s.setMe);
  const enterRoom = useStore((s) => s.enterRoom);
  const navigate = useStore((s) => s.navigate);
  const [preview, setPreview] = useState<RoomPreview | null>(null);
  const [missing, setMissing] = useState<string | null>(null);
  const [name, setName] = useState(me.name);
  const [avatar, setAvatar] = useState(me.avatar);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .preview(code)
      .then((p) => alive && setPreview(p))
      .catch((e: Error) => alive && setMissing(e.message));
    return () => {
      alive = false;
    };
  }, [code]);

  const join = async (e: FormEvent) => {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) {
      setError("Enter a name so your friends know who's who.");
      return;
    }
    play("tap");
    setBusy(true);
    try {
      await api.joinRoom(code, clean, avatar);
      setMe(clean, avatar);
      enterRoom(code);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="gate">
      <div className="gate-panel">
        <button className="btn btn-ghost btn-sm gate-back" onClick={() => navigate({ name: "home" })}>
          <ArrowLeft size={16} weight="bold" />
          Home
        </button>
        <div className="gate-cards" aria-hidden="true">
          <div style={{ transform: "rotate(-8deg)" }}>
            <Card back />
          </div>
          <div style={{ transform: "rotate(6deg) translateY(-6px)" }}>
            <Card card={{ id: "g", color: "red", value: "7" }} />
          </div>
        </div>
        {missing ? (
          <>
            <h1 className="gate-title">This table has closed</h1>
            <p className="gate-sub">{missing}</p>
            <button className="btn btn-primary" onClick={() => navigate({ name: "home" })}>
              Start a new table
            </button>
          </>
        ) : (
          <>
            <h1 className="gate-title">{preview ? (preview.hostName ? `${preview.hostName} saved you a seat` : "You're invited") : "You're invited"}</h1>
            <p className="gate-sub">
              Table <strong className="tabular">{code}</strong>
              {preview &&
                (preview.status === "playing"
                  ? ". A game is in progress: you'll watch and get a seat in the next one."
                  : ` · ${preview.players} at the table, ${preview.seatsOpen} seats open.`)}
            </p>
            <form className="gate-form" onSubmit={(e) => void join(e)}>
              <NameFields
                id="gate-name"
                name={name}
                avatar={avatar}
                onName={(v) => {
                  setName(v);
                  setError("");
                }}
                onAvatar={(v) => {
                  if (v !== avatar) play("select");
                  setAvatar(v);
                }}
                error={error}
              />
              <button type="submit" className="btn btn-primary" disabled={busy || !preview}>
                {busy ? "Sitting down..." : preview?.status === "playing" ? "Watch this game" : "Take a seat"}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
