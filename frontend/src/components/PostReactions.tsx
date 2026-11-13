"use client";

import { useEffect, useRef, useState } from "react";
import { publicApi } from "@/lib/api";
import type { ReactionType } from "@/lib/types";

export const EMOJI_MAP: Record<ReactionType, { emoji: string; label: string }> = {
  thumbsup: { emoji: "👍", label: "Thumbs Up" },
  heart: { emoji: "❤️", label: "Heart" },
  wow: { emoji: "😮", label: "Wow" },
  sad: { emoji: "😢", label: "Sad" },
  care: { emoji: "🥰", label: "Care" },
};

const REACTION_KEYS: ReactionType[] = ["thumbsup", "heart", "wow", "sad", "care"];

interface PostReactionsProps {
  recordId: string | null | undefined;
  initialReactions?: Record<string, number> | null;
  initialUserReactions?: string[] | null;
  className?: string;
  size?: "sm" | "md";
}

export function PostReactions({
  recordId,
  initialReactions = {},
  initialUserReactions = [],
  className = "",
  size = "sm",
}: PostReactionsProps) {
  const [reactions, setReactions] = useState<Record<string, number>>(initialReactions || {});
  const [userReactions, setUserReactions] = useState<string[]>(
    Array.isArray(initialUserReactions) ? initialUserReactions : []
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync with prop changes if refreshed from parent
  useEffect(() => {
    if (initialReactions) {
      setReactions(initialReactions);
    }
  }, [initialReactions]);

  useEffect(() => {
    if (initialUserReactions && Array.isArray(initialUserReactions)) {
      setUserReactions(initialUserReactions);
    }
  }, [initialUserReactions]);

  // Close picker on outside click
  useEffect(() => {
    if (!pickerOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [pickerOpen]);

  if (!recordId) {
    return null;
  }

  const safeReactions = reactions || {};
  const safeUserReactions = Array.isArray(userReactions) ? userReactions : [];

  const handleToggle = async (type: ReactionType) => {
    if (isSubmitting) return;

    // Optimistic update
    const hasReacted = safeUserReactions.includes(type);
    const prevReactions = { ...safeReactions };
    const prevUserReactions = [...safeUserReactions];

    const currentCount = safeReactions[type] || 0;
    const newCount = hasReacted ? Math.max(0, currentCount - 1) : currentCount + 1;

    const updatedReactions = { ...safeReactions };
    if (newCount > 0) {
      updatedReactions[type] = newCount;
    } else {
      delete updatedReactions[type];
    }

    const updatedUserReactions = hasReacted
      ? safeUserReactions.filter((r) => r !== type)
      : [...safeUserReactions, type];

    setReactions(updatedReactions);
    setUserReactions(updatedUserReactions);
    setPickerOpen(false);

    try {
      setIsSubmitting(true);
      const summary = await publicApi.toggleReaction(recordId, type);
      setReactions(summary.reactions || {});
      setUserReactions(Array.isArray(summary.user_reactions) ? summary.user_reactions : []);
    } catch (err) {
      // Rollback on failure
      setReactions(prevReactions);
      setUserReactions(prevUserReactions);
      console.error("Failed to toggle reaction:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeReactions = REACTION_KEYS.filter((key) => (safeReactions[key] ?? 0) > 0);

  return (
    <div
      ref={containerRef}
      className={`relative inline-flex flex-wrap items-center gap-1.5 select-none ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Existing Reaction Badges with Counts */}
      {activeReactions.map((key) => {
        const count = safeReactions[key] ?? 0;
        const isReacted = safeUserReactions.includes(key);
        const meta = EMOJI_MAP[key];

        return (
          <button
            key={key}
            type="button"
            title={`${meta.label}: ${count}`}
            onClick={() => handleToggle(key)}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium transition-all duration-150 cursor-pointer ${
              isReacted
                ? "border border-brand/50 bg-brand-soft text-brand font-semibold shadow-2xs scale-[1.02]"
                : "border border-line bg-surface/80 text-ink-soft hover:bg-surface-alt hover:text-foreground hover:border-line-strong"
            }`}
          >
            <span className="text-[12.5px] leading-none">{meta.emoji}</span>
            <span className="numeric text-[11px] leading-none">{count}</span>
          </button>
        );
      })}

      {/* Add Reaction Button (+ Emoji) */}
      <button
        type="button"
        title="React to this post"
        onClick={() => setPickerOpen((prev) => !prev)}
        className="inline-flex items-center justify-center rounded-full border border-line bg-surface/60 px-1.5 py-0.5 text-[11px] text-muted transition-all duration-150 hover:bg-surface-alt hover:text-foreground hover:border-line-strong cursor-pointer"
        aria-label="Add reaction"
      >
        <span className="flex items-center gap-0.5 leading-none">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3 w-3 text-muted group-hover:text-foreground"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M8 14s1.5 2 4 2 4-2 4-2" />
            <line x1="9" y1="9" x2="9.01" y2="9" />
            <line x1="15" y1="9" x2="15.01" y2="9" />
          </svg>
          <span className="text-[10px] font-bold">+</span>
        </span>
      </button>

      {/* Emoji Reaction Popover Tray */}
      {pickerOpen && (
        <div className="absolute left-0 bottom-full mb-1.5 z-30 flex items-center gap-1 rounded-full border border-line-strong bg-surface-raised/95 px-2 py-1 shadow-lg backdrop-blur-md animate-in fade-in zoom-in-95 duration-100">
          {REACTION_KEYS.map((key) => {
            const meta = EMOJI_MAP[key];
            const isReacted = safeUserReactions.includes(key);

            return (
              <button
                key={key}
                type="button"
                title={meta.label}
                onClick={() => handleToggle(key)}
                className={`grid h-7 w-7 place-items-center rounded-full text-base transition-transform duration-100 hover:scale-125 cursor-pointer ${
                  isReacted ? "bg-brand-soft ring-1 ring-brand/40" : "hover:bg-surface-alt"
                }`}
              >
                <span>{meta.emoji}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
