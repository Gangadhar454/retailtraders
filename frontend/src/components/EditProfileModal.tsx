"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "motion/react";

import { useAuth } from "@/components/AuthProvider";
import { avatarInk, avatarTint, initials } from "@/lib/format";
import { ApiError, authApi } from "@/lib/api";
import { updateUserCardCache } from "@/components/UserHoverCard";
import type { CurrentUser } from "@/lib/types";

interface EditProfileModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: (user: CurrentUser) => void;
}

export function EditProfileModal({
  open,
  onClose,
  onSuccess,
}: EditProfileModalProps) {
  const { user, refresh } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);

  // Sync state when opened or user changes
  useEffect(() => {
    if (open && user) {
      setDisplayName(user.display_name || "");
      setBio(user.bio || "");
      setMessage(null);
    }
  }, [open, user]);

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
    setMessage(null);
    onClose();
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setMessage(null);

    const cleanName = displayName.trim();
    if (cleanName.length < 2) {
      setMessage({
        kind: "error",
        text: "Display name must be at least 2 characters",
      });
      return;
    }

    const cleanBio = bio.trim();

    setBusy(true);
    try {
      const updatedUser = await authApi.updateProfile({
        display_name: cleanName,
        bio: cleanBio.length > 0 ? cleanBio : null,
      });

      // Update in-memory hover card cache for instant sync
      updateUserCardCache(user.username, (prev) => ({
        ...prev,
        display_name: cleanName,
        bio: cleanBio.length > 0 ? cleanBio : null,
      }));

      // Broadcast profile update event across active components
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("netpnl:profile_updated", { detail: updatedUser }),
        );
      }

      await refresh();
      onSuccess?.(updatedUser);
      handleClose();
    } catch (err) {
      setMessage({
        kind: "error",
        text:
          err instanceof ApiError ? err.message : "Failed to update profile",
      });
    } finally {
      setBusy(false);
    }
  }

  if (!open || !user) return null;

  const seed = user.avatar_seed || user.username;
  const isChanged =
    displayName.trim() !== (user.display_name || "") ||
    bio.trim() !== (user.bio || "");

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={handleClose}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs"
        />

        {/* Modal Dialog */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="card relative z-10 w-full max-w-lg overflow-hidden p-6 shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-profile-title"
        >
          {/* Header */}
          <div className="flex items-start justify-between border-b border-line pb-4">
            <div>
              <h2
                id="edit-profile-title"
                className="text-lg font-semibold tracking-tight text-foreground"
              >
                Edit Profile
              </h2>
              <p className="mt-1 text-[13px] text-ink-soft">
                Update how your trader persona appears publicly to the community.
              </p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="grid h-8 w-8 place-items-center rounded-lg text-ink-soft hover:bg-surface-sunken hover:text-foreground transition-colors cursor-pointer select-none"
              aria-label="Close"
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                <path
                  d="M6 18L18 6M6 6l12 12"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          <form onSubmit={onSubmit} className="mt-5 space-y-4">
            {/* Avatar & Username Preview */}
            <div className="flex items-center gap-3.5 rounded-lg border border-line/60 bg-surface-alt/70 p-3">
              <span
                className="grid h-12 w-12 shrink-0 place-items-center rounded-lg text-base font-bold shadow-2xs"
                style={{
                  background: avatarTint(seed),
                  color: avatarInk(seed),
                }}
              >
                {initials(displayName || user.display_name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-foreground truncate">
                  {displayName || user.display_name}
                </p>
                <p className="font-mono text-[12px] text-muted">
                  @{user.username}
                </p>
              </div>
              <span className="rounded bg-surface-sunken border border-line px-2 py-0.5 text-[11px] font-medium text-muted">
                Trader Handle
              </span>
            </div>

            {/* Display Name Field */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="profileDisplayName"
                  className="block text-[12px] font-medium text-foreground"
                >
                  Display Name <span className="text-loss">*</span>
                </label>
                <span className="font-mono text-[11px] text-muted">
                  {displayName.length}/64
                </span>
              </div>
              <input
                id="profileDisplayName"
                type="text"
                required
                minLength={2}
                maxLength={64}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="input-base"
                placeholder="Your display name"
              />
              <p className="mt-1 text-[11px] text-muted">
                Visible on the leaderboard, recent tape, and your trader page.
              </p>
            </div>

            {/* Bio Field */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="profileBio"
                  className="block text-[12px] font-medium text-foreground"
                >
                  Bio / Trading Philosophy
                </label>
                <span className="font-mono text-[11px] text-muted">
                  {bio.length}/280
                </span>
              </div>
              <textarea
                id="profileBio"
                rows={3}
                maxLength={280}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="input-base resize-none py-2 leading-relaxed"
                placeholder="e.g. Price action trader. Nifty 50 momentum buyer. Strict 1:2 risk-reward with trailing stop loss."
              />
              <p className="mt-1 text-[11px] text-muted">
                Briefly introduce your trading style, instruments, or risk rules.
              </p>
            </div>

            {/* Status Message */}
            <AnimatePresence>
              {message && (
                <motion.p
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className={`rounded border px-3 py-2 text-[12.5px] ${
                    message.kind === "ok"
                      ? "border-profit/25 bg-profit-soft text-profit"
                      : "border-loss/25 bg-loss-soft text-loss"
                  }`}
                >
                  {message.text}
                </motion.p>
              )}
            </AnimatePresence>

            {/* Footer Actions */}
            <div className="mt-6 flex items-center justify-end gap-2.5 border-t border-line pt-4">
              <button
                type="button"
                onClick={handleClose}
                className="btn-base btn-secondary py-2 text-[13px]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || !isChanged || displayName.trim().length < 2}
                className="btn-base btn-primary py-2 text-[13px]"
              >
                {busy ? "Saving changes…" : "Save changes"}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
