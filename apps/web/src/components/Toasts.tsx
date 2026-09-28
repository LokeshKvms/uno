import { X } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useStore } from "../lib/store.ts";

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return (
    <div className="toasts" role="status" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            className="toast"
            layout
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, transition: { duration: 0.15 } }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
          >
            <p>{t.text}</p>
            <button aria-label="Dismiss" data-sound="select" onClick={() => dismiss(t.id)}>
              <X size={16} weight="bold" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
