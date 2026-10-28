"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "motion/react";

import { ApiError, authApi } from "@/lib/api";

interface ChangePasswordModalProps {
  open: boolean;
  onClose: () => void;
}

export function ChangePasswordModal({ open, onClose }: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function handleClose() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmNewPassword("");
    setMessage(null);
    onClose();
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (newPassword !== confirmNewPassword) {
      setMessage({ kind: "error", text: "New passwords do not match" });
      return;
    }
    if (newPassword.length < 8) {
      setMessage({ kind: "error", text: "New password must be at least 8 characters" });
      return;
    }
    if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setMessage({
        kind: "error",
        text: "New password must contain at least one letter and one number",
      });
      return;
    }

    setBusy(true);
    try {
      await authApi.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setMessage({ kind: "ok", text: "Password updated successfully!" });
      setTimeout(() => {
        handleClose();
      }, 1200);
    } catch (err) {
      setMessage({
        kind: "error",
        text: err instanceof ApiError ? err.message : "Failed to change password",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: "spring", stiffness: 460, damping: 40 }}
            onClick={(e) => e.stopPropagation()}
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 px-4"
          >
            <div className="card p-5 sm:p-6 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[16px] font-semibold text-foreground">
                  Change password
                </h2>
                <button
                  type="button"
                  onClick={handleClose}
                  aria-label="Close"
                  className="grid h-7 w-7 place-items-center rounded text-ink-soft hover:bg-surface-sunken hover:text-foreground text-[18px] leading-none"
                >
                  &times;
                </button>
              </div>

              <p className="text-[13px] text-ink-soft mb-5">
                Enter your current password and choose a new one with at least 8 characters.
              </p>

              <form onSubmit={onSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="modalCurrentPassword"
                    className="mb-1.5 block text-[12px] font-medium text-ink-soft"
                  >
                    Current password
                  </label>
                  <input
                    id="modalCurrentPassword"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="input-base"
                    placeholder="Enter current password"
                  />
                </div>

                <div>
                  <label
                    htmlFor="modalNewPassword"
                    className="mb-1.5 block text-[12px] font-medium text-ink-soft"
                  >
                    New password
                  </label>
                  <input
                    id="modalNewPassword"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="input-base"
                    placeholder="At least 8 characters, with a letter & number"
                  />
                </div>

                <div>
                  <label
                    htmlFor="modalConfirmNewPassword"
                    className="mb-1.5 block text-[12px] font-medium text-ink-soft"
                  >
                    Confirm new password
                  </label>
                  <input
                    id="modalConfirmNewPassword"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    className="input-base"
                    placeholder="Re-enter new password"
                  />
                </div>

                <AnimatePresence>
                  {message && (
                    <motion.p
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className={`rounded border px-3 py-2 text-[13px] ${
                        message.kind === "ok"
                          ? "border-profit/25 bg-profit-soft text-profit"
                          : "border-loss/25 bg-loss-soft text-loss"
                      }`}
                    >
                      {message.text}
                    </motion.p>
                  )}
                </AnimatePresence>

                <div className="mt-6 flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="btn-base btn-secondary py-2 text-[13px]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={busy || !currentPassword || !newPassword || !confirmNewPassword}
                    className="btn-base btn-primary py-2 text-[13px]"
                  >
                    {busy ? "Updating…" : "Update password"}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

