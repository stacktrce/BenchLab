import { RunFilter, RunStatus } from "../../core/models";

/** What the history page filters by. It lives in the URL, so a filtered view survives a reload. */
export interface HistoryFilter {
  text: string;
  suiteId: string;
  status: RunStatus | "";
  /** YYYY-MM-DD, inclusive. */
  from: string;
  to: string;
  tag: string;
  /** 1-based. */
  page: number;
}

export const EMPTY_FILTER: HistoryFilter = { text: "", suiteId: "", status: "", from: "", to: "", tag: "", page: 1 };

const STATUSES: RunStatus[] = ["completed", "partial", "failed"];
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function serializeFilter(f: HistoryFilter): Record<string, string> {
  const params: Record<string, string> = {};
  for (const key of ["text", "suiteId", "status", "from", "to", "tag"] as const) {
    const value = f[key].trim();
    if (value) params[key] = value;
  }
  if (f.page > 1) params["page"] = String(f.page);
  return params;
}

export function parseFilter(params: Record<string, string | undefined>): HistoryFilter {
  const text = (key: string) => (params[key] ?? "").trim();
  const date = (key: string) => (DATE.test(text(key)) ? text(key) : "");
  const status = text("status");
  const page = Number(text("page") || "1");
  return {
    text: text("text"),
    suiteId: text("suiteId"),
    status: STATUSES.includes(status as RunStatus) ? (status as RunStatus) : "",
    from: date("from"),
    to: date("to"),
    tag: text("tag"),
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

/** Midnight at the start of local day `date` (YYYY-MM-DD) plus `days`, as a UTC instant. */
function localMidnight(date: string, days = 0): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d + days).toISOString();
}

/**
 * The filter as the Rust `RunFilter` expects it: absent fields are null. Runs are stored in UTC
 * and shown in local time, so the local days in the filter become UTC instants, the end being
 * the midnight after `to`.
 */
export function toRunFilter(f: HistoryFilter): RunFilter {
  const value = (v: string) => (v.trim() ? v.trim() : null);
  return {
    suiteId: value(f.suiteId),
    status: value(f.status),
    from: f.from ? localMidnight(f.from) : null,
    to: f.to ? localMidnight(f.to, 1) : null,
    text: value(f.text),
    tag: value(f.tag),
  };
}
