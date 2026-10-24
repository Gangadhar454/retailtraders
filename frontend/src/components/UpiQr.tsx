"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";

import { CopyButton } from "@/components/CopyButton";
import { generateUpiQrDataUrl } from "@/lib/qr";

interface UpiQrProps {
  upiId: string | null;
  payeeName?: string | null;
  amount?: number;
  canTip: boolean;
  size?: number;
  className?: string;
}

export function UpiQr({
  upiId,
  payeeName,
  amount = 0,
  canTip,
  size = 240,
  className = "",
}: UpiQrProps) {
  const [qr, setQr] = useState<{ key: string; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const key = `${upiId ?? ""}|${payeeName ?? ""}|${amount}`;

  useEffect(() => {
    if (!upiId || !canTip) return;

    let cancelled = false;
    generateUpiQrDataUrl(upiId, payeeName ?? undefined, amount)
      .then((url) => {
        if (!cancelled) setQr({ key, url });
      })
      .catch(() => {
        if (!cancelled) setError("Could not generate the QR code");
      });

    return () => {
      cancelled = true;
    };
  }, [upiId, payeeName, amount, canTip, key]);

  // Only show a QR that matches the current inputs.
  const dataUrl = qr && qr.key === key ? qr.url : null;

  if (!upiId || !canTip) {
    return (
      <div
        className={`card flex flex-col items-center justify-center px-6 py-8 text-center ${className}`}
        style={{ minHeight: size }}
      >
        <span className="grid h-11 w-11 place-items-center rounded border border-line bg-surface-alt text-muted">
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
            <rect
              x="3.5"
              y="3.5"
              width="17"
              height="17"
              rx="3"
              stroke="currentColor"
              strokeWidth="1.6"
            />
            <path
              d="M7.5 9h9M7.5 12.5h9M7.5 16h5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              opacity="0.6"
            />
          </svg>
        </span>
        <p className="mt-3 text-[13px] font-semibold text-foreground">
          Tipping is not enabled yet
        </p>
        <p className="mt-1 max-w-56 text-[12px] leading-relaxed text-ink-soft">
          This trader has not completed UPI name verification, so no payment
          details are shown.
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="card p-3">
        <div className="rounded border border-line bg-surface p-3">
          {dataUrl ? (
            <motion.img
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25 }}
              src={dataUrl}
              alt={`UPI QR code for ${upiId}`}
              width={size}
              height={size}
              className="mx-auto"
              style={{ width: size, height: size }}
            />
          ) : (
            <div
              className="mx-auto animate-pulse rounded bg-surface-sunken"
              style={{ width: size, height: size }}
            />
          )}
        </div>

        {error && (
          <p className="mt-2 text-center text-[12px] text-loss">{error}</p>
        )}

        <div className="mt-3 flex flex-col items-center gap-2">
          <p className="numeric text-[13px] font-semibold text-foreground">
            {upiId}
          </p>
          <CopyButton
            value={upiId}
            className="btn-base btn-secondary w-full py-1.5 text-[12px]"
          />
        </div>
      </div>

      <p className="mt-3 text-center text-[11px] leading-relaxed text-muted">
        Scan to send a voluntary gift. Transfers happen directly between your
        UPI app and the trader — the platform never holds funds.
      </p>
    </div>
  );
}
