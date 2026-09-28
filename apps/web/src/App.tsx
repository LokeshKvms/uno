import { useEffect } from "react";
import { Toasts } from "./components/Toasts.tsx";
import { TipProvider } from "./components/Tip.tsx";
import { resumeMusic } from "./lib/music.ts";
import { type SoundName, play, unlockAudio } from "./lib/sound.ts";
import { useStore } from "./lib/store.ts";
import { Home } from "./screens/Home.tsx";
import { RoomScreen } from "./screens/RoomScreen.tsx";
import { WakeScreen } from "./screens/WakeScreen.tsx";

const HOME_TITLE = "UNO Online with Friends · Free, No Sign-up";

function clickSound(e: MouseEvent) {
  const el = (e.target as Element | null)?.closest<HTMLElement>("button, a[href]");
  if (!el || el.matches(":disabled") || el.getAttribute("aria-disabled") === "true") return;
  const chosen = el.dataset.sound;
  if (chosen === "none") return;
  if (chosen) return play(chosen as SoundName);
  const role = el.getAttribute("role");
  if ((role === "radio" && el.getAttribute("aria-checked") === "true") || (role === "tab" && el.getAttribute("aria-selected") === "true")) return;
  const quiet = role === "radio" || role === "tab" || role === "menuitem" || el.tagName === "A" || el.matches(".icon-btn, .chip, .btn-ghost");
  play(quiet ? "select" : "tap");
}

let lastKeyAt = 0;
function typingSound(e: KeyboardEvent) {
  const el = e.target;
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) || el.readOnly || e.isComposing) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const wide = e.key === " " || e.key === "Enter" || e.key === "Backspace";
  if (!wide && e.key.length !== 1) return;
  const now = performance.now();
  if (now - lastKeyAt < 28) return;
  lastKeyAt = now;
  play(wide ? "keyWide" : "key");
}

export function App() {
  const route = useStore((s) => s.route);
  const booting = useStore((s) => s.booting);
  const boot = useStore((s) => s.boot);

  useEffect(() => {
    void boot();
    const unlock = () => {
      unlockAudio();
      resumeMusic();
    };
    window.addEventListener("pointerdown", unlock, { once: false, passive: true });
    window.addEventListener("keydown", unlock, { passive: true });
    window.addEventListener("keydown", typingSound, { passive: true });
    window.addEventListener("click", clickSound, { capture: true, passive: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("keydown", typingSound);
      window.removeEventListener("click", clickSound, { capture: true });
    };
  }, [boot]);

  useEffect(() => {
    document.title = route.name === "room" ? `UNO · ${route.code}` : HOME_TITLE;
  }, [route]);

  return (
    <TipProvider delayDuration={350} skipDelayDuration={200}>
      {booting ? <WakeScreen /> : route.name === "room" ? <RoomScreen code={route.code} /> : <Home />}
      <Toasts />
    </TipProvider>
  );
}
