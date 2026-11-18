/** A calendar month in "YYYY-MM" form. */
export type Month = string;

const MONTH_RE = /^(\d{4})-(\d{2})$/;

export function isMonth(value: string): value is Month {
  const m = MONTH_RE.exec(value);
  if (!m) return false;
  const mm = Number(m[2]);
  return mm >= 1 && mm <= 12;
}

export function addMonths(month: Month, n: number): Month {
  const m = MONTH_RE.exec(month);
  if (!m) throw new Error(`Invalid month: ${month}`);
  const idx = Number(m[1]) * 12 + (Number(m[2]) - 1) + n;
  const y = Math.floor(idx / 12);
  const mm = (idx % 12) + 1;
  return `${String(y).padStart(4, "0")}-${String(mm).padStart(2, "0")}`;
}

/** Inclusive list of months from start to end. */
export function monthRange(start: Month, end: Month): Month[] {
  if (start > end) return [];
  const out: Month[] = [];
  for (let m = start; m <= end; m = addMonths(m, 1)) out.push(m);
  return out;
}

/** Normalize "YYYY-MM", "YYYY-MM-DD", "YYYY/MM/DD" or "M/D/YYYY" into a Month. */
export function toMonth(raw: string): Month | null {
  const s = raw.trim();
  let m = /^(\d{4})[-/](\d{1,2})(?:[-/]\d{1,2})?$/.exec(s);
  if (m) {
    const out = `${m[1]}-${m[2].padStart(2, "0")}`;
    return isMonth(out) ? out : null;
  }
  m = /^(\d{1,2})\/\d{1,2}\/(\d{4})$/.exec(s);
  if (m) {
    const out = `${m[2]}-${m[1].padStart(2, "0")}`;
    return isMonth(out) ? out : null;
  }
  return null;
}
