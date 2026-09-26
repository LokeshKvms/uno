import { useEffect } from "react";
import { Toasts } from "./components/Toasts.tsx";
import { TipProvider } from "./components/Tip.tsx";
import { unlockAudio } from "./lib/sound.ts";
import { useStore } from "./lib/store.ts";
import { Home } from "./screens/Home.tsx";
import { RoomScreen } from "./screens/RoomScreen.tsx";
import { WakeScreen } from "./screens/WakeScreen.tsx";

export function App() {
  const route = useStore((s) => s.route);
  const booting = useStore((s) => s.booting);
  const boot = useStore((s) => s.boot);

  useEffect(() => {
    void boot();
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: false, passive: true });
    window.addEventListener("keydown", unlock, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [boot]);

  useEffect(() => {
    document.title = route.name === "room" ? `UNO · ${route.code}` : "UNO";
  }, [route]);

  return (
    <TipProvider delayDuration={350} skipDelayDuration={200}>
      {booting ? <WakeScreen /> : route.name === "room" ? <RoomScreen code={route.code} /> : <Home />}
      <Toasts />
    </TipProvider>
  );
}
