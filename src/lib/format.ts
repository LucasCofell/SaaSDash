const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** $12,345 */
export function money(cents: number | null): string {
  if (cents === null) return "—";
  return usd0.format(cents / 100);
}

/** $12.3K / $1.24M for tiles. */
export function moneyShort(cents: number | null): string {
  if (cents === null) return "—";
  const d = cents / 100;
  const a = Math.abs(d);
  const sign = d < 0 ? "-" : "";
  if (a >= 1_000_000) return `${sign}$${(a / 1_000_000).toFixed(2)}M`;
  if (a >= 10_000) return `${sign}$${(a / 1_000).toFixed(0)}K`;
  if (a >= 1_000) return `${sign}$${(a / 1_000).toFixed(1)}K`;
  return `${sign}$${a.toFixed(0)}`;
}

export function pct(x: number | null, digits = 1): string {
  return x === null ? "—" : `${(x * 100).toFixed(digits)}%`;
}

export function num(x: number | null, digits = 1, suffix = ""): string {
  return x === null ? "—" : `${x.toFixed(digits)}${suffix}`;
}

/** "2025-03" -> "Mar '25" */
export function monthLabel(m: string): string {
  const [y, mm] = m.split("-").map(Number);
  const name = new Date(Date.UTC(y, mm - 1, 1)).toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  return `${name} '${String(y).slice(2)}`;
}
