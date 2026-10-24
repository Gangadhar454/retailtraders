"use client";

import { useState, type ReactNode } from "react";

interface CopyButtonProps {
  value: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
  children?: ReactNode;
}

export function CopyButton({
  value,
  label = "Copy UPI ID",
  copiedLabel = "Copied",
  className = "",
  children,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard API needs a secure context; fall back to a temp selection.
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <button type="button" onClick={copy} className={className || "btn-base btn-ghost"}>
      {copied ? (
        <span className="inline-flex items-center gap-1.5 text-profit">
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
            <path
              d="M5 12.5l4.5 4.5L19 7"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {copiedLabel}
        </span>
      ) : (
        children ?? (
          <span className="inline-flex items-center gap-1.5">
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
              <rect
                x="9"
                y="9"
                width="11"
                height="11"
                rx="2.4"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <path
                d="M5.5 15H5a1.5 1.5 0 01-1.5-1.5V5A1.5 1.5 0 015 3.5h8.5A1.5 1.5 0 0115 5v.5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
            {label}
          </span>
        )
      )}
    </button>
  );
}
