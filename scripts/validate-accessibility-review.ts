import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';

const file = resolve(process.argv[2] ?? 'releases/v0.1.0/accessibility-review.yml');
const requireComplete = process.argv.includes('--require-complete');
const record = parse(readFileSync(file, 'utf8')) as Record<string, any>;
const required = ['keyboard', 'headings-landmarks', 'zoom-reflow', 'link-purpose', 'tables', 'alternatives', 'media-captions-transcripts'];
const errors: string[] = [];
if (record.schemaVersion !== 1) errors.push(`${file}:schemaVersion [A11Y-REVIEW] must be 1`);
if (record.release !== 'v0.1.0') errors.push(`${file}:release [A11Y-REVIEW] must identify v0.1.0`);
const checks = new Map((record.checks ?? []).map((check: any) => [check.id, check]));
for (const id of required) {
  const check = checks.get(id) as any;
  if (!check) errors.push(`${file}:checks.${id} [A11Y-REVIEW] required review check is missing`);
  else if (!['pending', 'pass', 'not-applicable'].includes(check.result) || !check.notes?.trim()) errors.push(`${file}:checks.${id} [A11Y-REVIEW] result and notes are required`);
  else if (requireComplete && check.result === 'pending') errors.push(`${file}:checks.${id} [A11Y-REVIEW] must be completed before release`);
}
if (requireComplete && (record.releaseReady !== true || record.reviewer === 'EXTERNAL_REQUIRED' || record.reviewedAt === 'EXTERNAL_REQUIRED')) errors.push(`${file}:releaseReady [A11Y-REVIEW] reviewer, review date, and approval are required before release`);
if (errors.length) {
  console.error(errors.map((error) => `ERROR: ${error}`).join('\n'));
  process.exit(1);
}
console.log(requireComplete ? 'Accessibility release review is complete.' : 'Accessibility release-review evidence template is structurally valid.');
