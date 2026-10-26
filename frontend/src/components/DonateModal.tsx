"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";

import { UpiQr } from "@/components/UpiQr";

interface DonateModalProps {
  open: boolean;
  onClose: () => void;
  upiId: string | null;
  resolvedName: string | null;
}

export function DonateModal({
  open,
  onClose,
  upiId,
  resolvedName,
}: DonateModalProps) {
  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!upiId) return null;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: "spring", stiffness: 460, damping: 40 }}
            onClick={(e) => e.stopPropagation()}
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 px-4"
          >
            <div className="card p-5 sm:p-6 shadow-xl">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[15px] font-semibold text-foreground">
                  Donate to {resolvedName ?? upiId}
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="rounded p-1.5 text-ink-soft hover:bg-surface-alt hover:text-foreground transition-colors"
                >
                  <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                    <path
                      d="M18 6L6 18M6 6l12 12"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>

              <div className="flex flex-col items-center">
                <UpiQr
                  upiId={upiId}
                  payeeName={resolvedName ?? undefined}
                  canTip
                  size={200}
                />
              </div>

              <p className="mt-3 text-center text-[11px] leading-relaxed text-muted">
                Press Esc or click outside to close
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
