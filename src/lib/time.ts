export const TIME_ZONE = "Australia/Sydney";
export const SLOT_MIN = 30;
export const DAILY_LIMIT_MIN = 120;
export const INVITE_TTL_MS = 30 * 60 * 1000;
export const DEMO_WINDOW_DAYS = 14;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function sydneyToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  return new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export function demoWindow(now: Date = new Date()): { first: string; last: string } {
  const first = sydneyToday(now);
  return { first, last: addDays(first, DEMO_WINDOW_DAYS - 1) };
}

export function inDemoWindow(date: string, now: Date = new Date()): boolean {
  const { first, last } = demoWindow(now);
  return isDate(date) && date >= first && date <= last;
}

export function fmtTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function parseTime(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 24 || m > 59 || (h === 24 && m > 0)) return null;
  return h * 60 + m;
}

export function fmtRange(start: number, end: number): string {
  return `${fmtTime(start)} – ${fmtTime(end)}`;
}

export function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h} hour${h === 1 ? "" : "s"}`);
  if (m || !h) parts.push(`${m} minute${m === 1 ? "" : "s"}`);
  return parts.join(" ");
}

export function fmtDate(date: string, withYear = false): string {
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  })
    .format(new Date(`${date}T00:00:00Z`))
    .replace(/,/g, "");
}
