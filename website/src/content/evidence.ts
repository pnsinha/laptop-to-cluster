import type { ApplicabilityRecord } from './schema';

/* The text a Tested badge shows, built only from a test record. TestedBadge and the
   applicability page render it; tests/unit/tested-badge.test.ts checks it against the records. */

const monthYear = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const longDate = new Intl.DateTimeFormat('en-US', { dateStyle: 'long' });

/** '2026-07-25' -> 'Jul 2026'. Month precision only; the exact date stays on the record page. */
export const formatMonthYear = (iso: string): string => monthYear.format(new Date(`${iso}T00:00:00Z`));
/** '2026-07-25' -> 'July 25, 2026'. */
export const formatDate = (iso: string): string => longDate.format(new Date(`${iso}T00:00:00`));

/** A version that already starts with the name ("Apptainer 1.5.3") is kept as recorded. */
export function namedVersion(name: string, version: string): string {
  const lower = version.toLowerCase();
  const n = name.toLowerCase();
  return lower === n || lower.startsWith(`${n} `) ? version : `${name} ${version}`;
}

const LABEL = { validated: 'Tested', stale: 'Review due', failed: 'Last run failed', unvalidated: 'Not yet tested' } as const;

/** The badge word, its where-and-when caption and the one-line sentence ("Tested on Purdue Anvil · Oct 2026"). */
export function badgeParts(record: ApplicabilityRecord): { label: string; context?: string; sentence: string } {
  const where = `${record.environment.public_name} · ${formatMonthYear(record.validation_date)}`;
  switch (record.status) {
    case 'validated': return { label: LABEL.validated, context: where, sentence: `Tested on ${where}` };
    case 'stale': return { label: LABEL.stale, context: `Last tested on ${where}`, sentence: `Review due: last tested on ${where}` };
    case 'failed': return { label: LABEL.failed, sentence: 'Last run failed: see the test record' };
    case 'unvalidated': return { label: LABEL.unvalidated, sentence: 'Not yet tested on a cluster' };
  }
}

/** The three rows: the record's plain-language summary when it has one, else its literal lists. */
export function evidenceRows(record: ApplicabilityRecord): { label: 'Tested' | 'You need' | 'Depends on your center'; items: string[] }[] {
  const plain = record.plain_language;
  return [
    { label: 'Tested', items: plain ? [plain.tested.text] : record.result.checks },
    { label: 'You need', items: plain ? plain.you_need.map(({ text }) => text) : record.assumptions },
    { label: 'Depends on your center', items: plain ? plain.depends_on_center.map(({ text }) => text) : record.portability_boundaries },
  ];
}

/** The evaluation guide's summary: the badge sentence, then scope values taken from the record. */
export function recordSummary(record: ApplicabilityRecord): { tested: string; scope: string[] } {
  return {
    tested: badgeParts(record).sentence,
    scope: [
      `Scheduler: ${namedVersion(record.scheduler.family, record.scheduler.version)}`,
      `Runtime: ${namedVersion(record.runtime.name, record.runtime.version)}`,
      `Workflow revision: ${record.workflow_revision}`,
      ...evidenceRows(record)[0].items,
      ...record.limitations,
    ],
  };
}
