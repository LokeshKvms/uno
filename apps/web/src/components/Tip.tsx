import * as Tooltip from "@radix-ui/react-tooltip";
import { type ReactNode, useRef, useState } from "react";

interface TipProps {
  label: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  kbd?: string;
  disabled?: boolean;
}

export function Tip({ label, children, side = "top", kbd, disabled }: TipProps) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);
  const touchOpened = useRef(false);
  if (disabled) return <>{children}</>;

  const clear = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  };

  return (
    <Tooltip.Root open={open} onOpenChange={(o) => !touchOpened.current && setOpen(o)} delayDuration={350}>
      <Tooltip.Trigger
        asChild
        onPointerDown={(e) => {
          if (e.pointerType !== "touch") return;
          clear();
          timer.current = window.setTimeout(() => {
            touchOpened.current = true;
            setOpen(true);
            window.setTimeout(() => {
              touchOpened.current = false;
              setOpen(false);
            }, 2200);
          }, 450);
        }}
        onPointerUp={clear}
        onPointerCancel={clear}
        onPointerLeave={clear}
      >
        {children}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tip" side={side} sideOffset={8} collisionPadding={12}>
          {label}
          {kbd && <kbd>{kbd}</kbd>}
          <Tooltip.Arrow className="tip-arrow" width={10} height={5} />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export const TipProvider = Tooltip.Provider;
