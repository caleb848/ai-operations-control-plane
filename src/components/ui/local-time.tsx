"use client";

import { useSyncExternalStore } from "react";
import { clockTime, shortDateTime, utcClockTime, utcDateTime } from "@/lib/format";

const noop = () => () => {};

/**
 * A timestamp in the viewer's time zone. The server may run in another zone
 * (UTC on Netlify), so the server render and hydration print UTC and the
 * browser then switches to local time, with no hydration mismatch.
 */
export function LocalTime({ iso, format = "datetime" }: { iso: string; format?: "datetime" | "clock" }) {
  const local = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  const text = format === "clock" ? (local ? clockTime(iso) : utcClockTime(iso)) : local ? shortDateTime(iso) : utcDateTime(iso);
  return <time dateTime={iso}>{text}</time>;
}
