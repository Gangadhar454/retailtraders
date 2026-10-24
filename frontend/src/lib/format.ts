const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const inrPrecise = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const compact = new Intl.NumberFormat("en-IN", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatINR(value: number, precise = false): string {
  if (!Number.isFinite(value)) return "₹0";
  return precise ? inrPrecise.format(value) : inr.format(value);
}

export function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return compact.format(value);
}

/** Signed rupee string used by the ticker, e.g. "-₹12,450" / "+₹8,100". */
export function formatSignedINR(value: number, precise = false): string {
  if (!Number.isFinite(value)) return "₹0";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatINR(Math.abs(value), precise)}`;
}

export function formatSignedCompact(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}₹${compact.format(Math.abs(value))}`;
}

export function formatPercent(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "0%";
  return `${value.toFixed(digits)}%`;
}

export function formatDate(iso: string): string {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
  });
}

export function formatDateLong(iso: string): string {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Parses an API timestamp. The API sends UTC; a value without an offset is
 * read as UTC too, so it never slips into local time by accident.
 */
function parseApiDate(iso: string): Date {
  const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso);
  return new Date(hasOffset ? iso : `${iso}Z`);
}

export function formatRelative(iso: string | null): string {
  if (!iso) return "never";
  const then = parseApiDate(iso).getTime();
  if (Number.isNaN(then)) return "never";
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDateLong(iso);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/** Deterministic avatar tint from the user's seed. */
export function avatarTint(seed: string): string {
  return `hsl(${avatarHue(seed)} 42% 92%)`;
}

/** Foreground that stays legible on the matching avatar tint. */
export function avatarInk(seed: string): string {
  return `hsl(${avatarHue(seed)} 45% 28%)`;
}

function avatarHue(seed: string): number {
  return seed
    .split("")
    .reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) % 360, 7);
}

export function pnlTone(value: number): "profit" | "loss" | "flat" {
  if (value > 0) return "profit";
  if (value < 0) return "loss";
  return "flat";
}
