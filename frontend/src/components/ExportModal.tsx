"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { generateUpiQrDataUrl } from "@/lib/qr";
import { formatSignedINR } from "@/lib/format";
import type { PublicUser, UpiStatus } from "@/lib/types";

const CANVAS_W = 1080;
const CANVAS_H = 1350;

interface ExportModalProps {
  open: boolean;
  onClose: () => void;
  user: PublicUser;
  netPnl: number;
  isVerified: boolean;
  upi: UpiStatus;
  tradeCount?: number;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawShield(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  verified: boolean,
) {
  const color = verified ? "#387ed1" : "#8a939e";

  ctx.save();
  ctx.translate(x, y);

  ctx.beginPath();
  ctx.moveTo(0, -size * 0.58);
  ctx.lineTo(size * 0.52, -size * 0.36);
  ctx.lineTo(size * 0.52, size * 0.04);
  ctx.quadraticCurveTo(size * 0.5, size * 0.42, 0, size * 0.58);
  ctx.quadraticCurveTo(-size * 0.5, size * 0.42, -size * 0.52, size * 0.04);
  ctx.lineTo(-size * 0.52, -size * 0.36);
  ctx.closePath();
  ctx.fillStyle = verified ? "rgba(56,126,209,0.1)" : "rgba(138,147,158,0.08)";
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = size * 0.07;
  ctx.lineJoin = "round";
  ctx.stroke();

  ctx.beginPath();
  if (verified) {
    ctx.moveTo(-size * 0.24, size * 0.02);
    ctx.lineTo(-size * 0.06, size * 0.22);
    ctx.lineTo(size * 0.28, -size * 0.24);
  } else {
    ctx.moveTo(-size * 0.2, -size * 0.05);
    ctx.lineTo(size * 0.2, -size * 0.05);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = size * 0.1;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.restore();
}

async function renderCard(
  canvas: HTMLCanvasElement,
  options: {
    user: PublicUser;
    netPnl: number;
    isVerified: boolean;
    upi: UpiStatus;
    tradeCount?: number;
  },
) {
  const { user, netPnl, isVerified, upi, tradeCount = 0 } = options;

  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const profit = netPnl >= 0;
  const accent = profit ? "#0f9960" : "#d64545";
  const INK = "#1e242b";
  const INK_SOFT = "#58616c";
  const MUTED = "#8a939e";
  const LINE = "#e5e8ec";

  // --- background -------------------------------------------------------
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  ctx.fillStyle = "#f7f8fa";
  ctx.fillRect(0, 0, CANVAS_W, 168);

  ctx.strokeStyle = LINE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 169);
  ctx.lineTo(CANVAS_W, 169);
  ctx.stroke();

  // --- header -----------------------------------------------------------
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  ctx.fillStyle = "#387ed1";
  roundRect(ctx, 88, 64, 52, 52, 8);
  ctx.fill();

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(100, 98);
  ctx.lineTo(111, 84);
  ctx.lineTo(119, 92);
  ctx.lineTo(129, 76);
  ctx.stroke();

  ctx.font = "700 30px Inter, system-ui, sans-serif";
  ctx.fillStyle = INK;
  ctx.fillText("NetPnL", 156, 102);

  ctx.font = "600 19px Inter, system-ui, sans-serif";
  ctx.fillStyle = MUTED;
  ctx.textAlign = "right";
  ctx.fillText("INDIA'S RETAIL NET P&L", CANVAS_W - 88, 98);
  ctx.textAlign = "left";

  // --- trader name ------------------------------------------------------
  ctx.font = "700 44px Inter, system-ui, sans-serif";
  ctx.fillStyle = INK;
  ctx.fillText(user.display_name.slice(0, 26), 88, 248);

  ctx.font = "500 25px Roboto Mono, monospace";
  ctx.fillStyle = MUTED;
  ctx.fillText(`@${user.username}`, 88, 290);

  // --- headline figure --------------------------------------------------
  const pnlText = formatSignedINR(netPnl);
  ctx.font = "600 104px Inter, system-ui, sans-serif";
  ctx.fillStyle = accent;
  ctx.fillText(pnlText, 84, 466);

  ctx.font = "500 25px Inter, system-ui, sans-serif";
  ctx.fillStyle = INK_SOFT;
  ctx.fillText("Net P&L today · " + new Date().toLocaleDateString("en-IN"), 88, 512);

  // --- badge row --------------------------------------------------------
  const badgeY = 590;
  drawShield(ctx, 112, badgeY, 78, isVerified);
  ctx.font = "700 29px Inter, system-ui, sans-serif";
  ctx.fillStyle = isVerified ? "#387ed1" : MUTED;
  ctx.fillText(
    isVerified ? "VERIFIED P&L" : "SELF-REPORTED P&L",
    176,
    badgeY + 11,
  );

  ctx.font = "500 22px Inter, system-ui, sans-serif";
  ctx.fillStyle = MUTED;
  ctx.fillText(
        isVerified ? "Fetched from a linked broker" : "Not verified against a broker",
    176,
    badgeY + 46,
  );

  if (tradeCount > 0) {
    ctx.textAlign = "right";
    ctx.font = "500 25px Roboto Mono, monospace";
    ctx.fillStyle = INK_SOFT;
    ctx.fillText(`${tradeCount} trades`, CANVAS_W - 88, badgeY + 11);
    ctx.textAlign = "left";
  }

  // --- divider ----------------------------------------------------------
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(88, 690);
  ctx.lineTo(CANVAS_W - 88, 690);
  ctx.stroke();

  // --- QR block ---------------------------------------------------------
  const qrSize = 300;
  const qrX = 88;
  const qrY = 762;

  if (upi.can_tip && upi.upi_id) {
    const qrUrl = await generateUpiQrDataUrl(
      upi.upi_id,
      upi.resolved_name ?? user.display_name,
      0,
      `Tip for ${user.display_name} on NetPnL`,
      qrSize,
    );

    const image = await loadImage(qrUrl);
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, qrX - 14, qrY - 14, qrSize + 28, qrSize + 28, 12);
    ctx.fill();
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.drawImage(image, qrX, qrY, qrSize, qrSize);

    ctx.font = "700 26px Inter, system-ui, sans-serif";
    ctx.fillStyle = INK;
    ctx.fillText("Support this trader", qrX + qrSize + 46, qrY + 58);

    ctx.font = "500 24px Roboto Mono, monospace";
    ctx.fillStyle = INK_SOFT;
    ctx.fillText(upi.upi_id.slice(0, 26), qrX + qrSize + 46, qrY + 100);

    ctx.font = "400 21px Inter, system-ui, sans-serif";
    ctx.fillStyle = MUTED;
    ctx.fillText("Scan the QR with any UPI app.", qrX + qrSize + 46, qrY + 146);
    ctx.fillText("Transfers are voluntary gifts,", qrX + qrSize + 46, qrY + 180);
    ctx.fillText("paid directly to the trader.", qrX + qrSize + 46, qrY + 214);
  } else {
    ctx.font = "600 26px Inter, system-ui, sans-serif";
    ctx.fillStyle = MUTED;
    ctx.fillText("Tipping is not enabled for this trader.", qrX, qrY + 40);
  }

  // --- watermark --------------------------------------------------------
  ctx.textAlign = "right";
  ctx.font = "700 34px Inter, system-ui, sans-serif";
  ctx.fillStyle = "#c8ced5";
  ctx.fillText("NetPnL", CANVAS_W - 88, CANVAS_H - 118);
  ctx.font = "400 20px Inter, system-ui, sans-serif";
  ctx.fillStyle = MUTED;
  ctx.fillText("netpnl.app", CANVAS_W - 88, CANVAS_H - 86);
  ctx.textAlign = "left";

  // --- disclaimer -------------------------------------------------------
  ctx.font = "500 19px Inter, system-ui, sans-serif";
  ctx.fillStyle = "#a86a12";
  const disclaimer =
    "Not a SEBI registered platform. All transfers are voluntary peer-to-peer gifts.";
  ctx.fillText(disclaimer, 88, CANVAS_H - 86);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load the QR image"));
    image.src = src;
  });
}

export function ExportModal({
  open,
  onClose,
  user,
  netPnl,
  isVerified,
  upi,
  tradeCount = 0,
}: ExportModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<"idle" | "rendering" | "ready" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  const rendering = status === "rendering";
  const ready = status === "ready";

  const draw = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return false;
    await (document.fonts?.ready ?? Promise.resolve());
    await renderCard(canvas, { user, netPnl, isVerified, upi, tradeCount });
    return true;
  }, [user, netPnl, isVerified, upi, tradeCount]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    (async () => {
      // Defer the state updates out of the synchronous effect body.
      await Promise.resolve();
      if (cancelled) return;

      setError(null);
      setStatus("rendering");

      try {
        const ok = await draw();
        if (!cancelled && ok) setStatus("ready");
      } catch {
        if (!cancelled) {
          setStatus("error");
          setError("Could not render the image. Please try again.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, draw]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  function download() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `netpnl-${user.username}-${new Date().toISOString().slice(0, 10)}.png`;
      link.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  async function copyToClipboard() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (!blob) throw new Error("no blob");
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      setError(null);
    } catch {
      setError("Your browser blocked clipboard access. Use Download instead.");
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label="Export your P&L card"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            onClick={(event) => event.stopPropagation()}
            className="card flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden"
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
              <div>
                <h2 className="text-[15px] font-semibold text-foreground">
                  Share your result
                </h2>
                <p className="text-[12px] text-muted">
                  1080 &times; 1350 &middot; ready for X, Reddit or Instagram
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="grid h-8 w-8 place-items-center rounded border border-line bg-surface text-muted transition-colors hover:bg-surface-alt hover:text-foreground"
              >
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                  <path
                    d="M6 6l12 12M18 6L6 18"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="relative mx-auto aspect-[1080/1350] w-full max-w-[340px] overflow-hidden rounded border border-line bg-surface-sunken">
                <canvas
                  ref={canvasRef}
                  className="h-full w-full"
                  aria-label="Shareable P&L card preview"
                />
                {rendering && (
                  <div className="absolute inset-0 grid place-items-center bg-surface/80 text-[12px] text-ink-soft">
                    Rendering…
                  </div>
                )}
              </div>

              {error && (
                <p className="mt-3 rounded border border-loss/25 bg-loss-soft px-3 py-2 text-[12px] text-loss">
                  {error}
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2 border-t border-line px-5 py-3.5">
              <button
                type="button"
                onClick={download}
                disabled={!ready}
                className="btn-base btn-primary flex-1"
              >
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                  <path
                    d="M12 3v12m0 0l-4.5-4.5M12 15l4.5-4.5M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Download PNG
              </button>
              <button
                type="button"
                onClick={copyToClipboard}
                disabled={!ready}
                className="btn-base btn-ghost"
              >
                Copy image
              </button>
              <button type="button" onClick={draw} className="btn-base btn-ghost">
                Redraw
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
