import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "@phosphor-icons/react";
import type { ReactNode } from "react";

interface DialogProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  dismissable?: boolean;
  className?: string;
}

export function Dialog({ open, onOpenChange, title, description, children, dismissable = true, className }: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={(o) => (dismissable || o) && onOpenChange?.(o)}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="overlay" />
        <RadixDialog.Content
          className={`dialog ${className ?? ""}`}
          onEscapeKeyDown={(e) => !dismissable && e.preventDefault()}
          onPointerDownOutside={(e) => !dismissable && e.preventDefault()}
          aria-describedby={description ? undefined : undefined}
        >
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <RadixDialog.Title className="dialog-title">{title}</RadixDialog.Title>
            {dismissable && (
              <RadixDialog.Close className="icon-btn" aria-label="Close" style={{ marginTop: -8, marginRight: -8 }}>
                <X size={18} weight="bold" />
              </RadixDialog.Close>
            )}
          </div>
          {description ? (
            <RadixDialog.Description className="dialog-body" asChild>
              <div>{description}</div>
            </RadixDialog.Description>
          ) : (
            <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
          )}
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
