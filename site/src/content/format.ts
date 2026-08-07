/**
 * Human-facing date formatting for ISO date strings.
 *
 * The site stores dates as ISO 8601 (`YYYY-MM-DD`) in content and emits them in
 * the machine-readable `datetime` attribute of `<time>` elements. The visible
 * text of those elements should be a locale-formatted date, not the raw ISO
 * string, so that validation records and release dates read naturally.
 *
 * Resolved at build time (Astro static render), so `Intl.DateTimeFormat` runs
 * once per date during the build — no client cost.
 */

const dateFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'long' });

/** Format an ISO date string as a long-form US English date (e.g. "July 25, 2026").
 *  Falls back to the raw string if it cannot be parsed, so a malformed value
 *  degrades to showing itself rather than crashing the build. An undefined
 *  argument (an optional date field that was not supplied) formats to an empty
 *  string, since callers always pair this with a `<time>` element whose text is
 *  only meaningful when a date exists. */
export const formatDate = (iso: string | undefined): string => {
  if (iso === undefined) return '';
  const parsed = new Date(`${iso}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? iso : dateFormatter.format(parsed);
};
