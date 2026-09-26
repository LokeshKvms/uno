import type { SeatInfo } from "@uno/protocol";
import { REACTIONS } from "@uno/protocol/constants";
import { animate, AnimatePresence, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { onEllipse, rotateToViewer, seatAngles, travelTo } from "../../lib/geometry.ts";
import { useStore } from "../../lib/store.ts";
import { SeatPlate } from "./SeatPlate.tsx";

export interface TableSeat {
  seat: SeatInfo;
  count?: number;
  score?: number;
}

interface TableProps {
  seats: TableSeat[];
  viewerId: string | null;
  activeId: string | null;
  direction: 1 | -1;
  showViewer: boolean;
  compact: boolean;
  center: ReactNode;
  extraSlots?: ReactNode;
  seatExtras?: (seat: SeatInfo) => ReactNode;
  deadline?: number;
  deadlineTotal?: number;
}

export function Table(props: TableProps) {
  const { seats, viewerId, activeId, direction, showViewer, compact, center, extraSlots, seatExtras, deadline, deadlineTotal } = props;
  const ordered = rotateToViewer(
    seats.map((s) => ({ ...s, id: s.seat.id })),
    viewerId,
  );
  const angles = seatAngles(ordered.length);
  const angleOf = new Map(ordered.map((s, i) => [s.id, angles[i]!]));

  if (compact) {
    const others = ordered.filter((s) => showViewer || s.id !== viewerId);
    return (
      <div className="table table-compact">
        <div className="seat-strip-wrap">
          <div className="seat-strip" role="list" aria-label="Players">
            {others.map((s) => (
              <StripSeat key={s.id} s={s} active={s.id === activeId} extras={seatExtras?.(s.seat)} deadline={deadline} deadlineTotal={deadlineTotal} />
            ))}
            {extraSlots}
          </div>
        </div>
        <CompactFelt activeId={activeId} viewerId={viewerId}>
          {center}
        </CompactFelt>
      </div>
    );
  }

  return (
    <div className="table">
      <div className="felt">
        <div className="rail" aria-hidden="true" />
        <ChaseLight angle={activeId ? angleOf.get(activeId) : undefined} direction={direction} mine={!!viewerId && activeId === viewerId} />
        <div className="felt-center">{center}</div>
        <div className="seats" role="list" aria-label="Players">
          {ordered.map((s) => {
            if (!showViewer && s.id === viewerId) return null;
            const angle = angleOf.get(s.id)!;
            const pos = onEllipse(angle, 50, 50);
            return (
              <div key={s.id} className={`seat-anchor ${pos.top < 40 ? "seat-high" : ""}`} style={{ left: `${pos.left}%`, top: `${pos.top}%` }} role="listitem">
                <SeatPlate
                  seat={s.seat}
                  count={s.count}
                  score={s.score}
                  active={s.id === activeId}
                  self={s.id === viewerId}
                  deadline={s.id === activeId ? deadline : undefined}
                  deadlineTotal={deadlineTotal}
                >
                  {seatExtras?.(s.seat)}
                </SeatPlate>
                <Reactions seatId={s.id} />
              </div>
            );
          })}
          {extraSlots}
        </div>
      </div>
    </div>
  );
}

function CompactFelt({ activeId, viewerId, children }: { activeId: string | null; viewerId: string | null; children: ReactNode }) {
  const felt = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const mine = !!viewerId && activeId === viewerId;
  useLayoutEffect(() => {
    const el = felt.current;
    if (!el || !activeId) {
      setPos(null);
      return;
    }
    const update = () => {
      const fr = el.getBoundingClientRect();
      if (activeId === viewerId) {
        setPos({ left: fr.width / 2, top: fr.height });
        return;
      }
      const seat = document.querySelector(`.seat-strip [data-seat="${activeId}"]`);
      if (!seat) return setPos(null);
      const r = seat.getBoundingClientRect();
      setPos({ left: Math.min(fr.width - 14, Math.max(14, r.left + r.width / 2 - fr.left)), top: 0 });
    };
    update();
    const strip = document.querySelector(".seat-strip");
    strip?.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    const settle = window.setTimeout(update, 450);
    return () => {
      strip?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.clearTimeout(settle);
    };
  }, [activeId, viewerId]);
  return (
    <div className="felt felt-compact" ref={felt}>
      {pos && (
        <motion.div
          className={`chase-light ${mine ? "is-mine" : ""}`}
          initial={false}
          animate={{ left: pos.left, top: pos.top }}
          transition={{ type: "spring", stiffness: 240, damping: 30 }}
          aria-hidden="true"
        />
      )}
      <div className="felt-center">{children}</div>
    </div>
  );
}

function StripSeat({
  s,
  active,
  extras,
  deadline,
  deadlineTotal,
}: {
  s: TableSeat & { id: string };
  active: boolean;
  extras?: ReactNode;
  deadline?: number;
  deadlineTotal?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [active]);
  return (
    <div ref={ref} className="strip-seat" role="listitem">
      <SeatPlate
        seat={s.seat}
        count={s.count}
        score={s.score}
        active={active}
        self={false}
        compact
        deadline={active ? deadline : undefined}
        deadlineTotal={deadlineTotal}
      >
        {extras}
      </SeatPlate>
      <Reactions seatId={s.id} />
    </div>
  );
}

function ChaseLight({ angle, direction, mine }: { angle: number | undefined; direction: 1 | -1; mine: boolean }) {
  const theta = useMotionValue(angle ?? 90);
  const reduce = useReducedMotion();
  const first = useRef(true);
  useEffect(() => {
    if (angle === undefined) return;
    if (first.current || reduce) {
      first.current = false;
      theta.set(angle);
      return;
    }
    const target = travelTo(theta.get(), angle, direction);
    const distance = Math.abs(target - theta.get());
    const controls = animate(theta, target, { duration: Math.min(0.9, 0.28 + distance / 400), ease: [0.33, 0, 0.2, 1] });
    return () => controls.stop();
  }, [angle, direction, reduce, theta]);
  const left = useTransform(theta, (t) => `${50 + Math.cos((t * Math.PI) / 180) * 50}%`);
  const top = useTransform(theta, (t) => `${50 + Math.sin((t * Math.PI) / 180) * 50}%`);
  if (angle === undefined) return null;
  return <motion.div className={`chase-light ${mine ? "is-mine" : ""}`} style={{ left, top }} aria-hidden="true" />;
}

function Reactions({ seatId }: { seatId: string }) {
  const all = useStore((s) => s.reactions);
  const reactions = all.filter((r) => r.fromId === seatId);
  return (
    <div className="reaction-float" aria-hidden="true">
      <AnimatePresence>
        {reactions.map((r, i) => (
          <motion.span
            key={r.id}
            initial={{ opacity: 0, y: 6, scale: 0.6 }}
            animate={{ opacity: 1, y: -34 - i * 6, scale: 1 }}
            exit={{ opacity: 0, y: -52 }}
            transition={{ type: "spring", stiffness: 260, damping: 18 }}
          >
            {REACTIONS[r.index]}
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
}
