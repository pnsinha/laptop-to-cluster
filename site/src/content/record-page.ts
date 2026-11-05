import { formatMonthYear } from './projections';
import type { ApplicabilityRecord, RepoRef } from './schema';

/* The links and the title of a canonical test-record page, kept out of the template so they
   can be checked without rendering a page. */

const encodePath = (path: string): string => path.split('/').map(encodeURIComponent).join('/');

/** A file in the workflow repository at the release a provenance entry names, with its optional line anchor. */
export function repositoryHref(reference: RepoRef): string {
  return `${reference.repository}/blob/${encodeURIComponent(reference.release)}/${encodePath(reference.path)}${reference.line_anchor ?? ''}`;
}

/** Evidence is linked at the release that ships it: a provenance entry for the same path names that release;
 *  otherwise the workflow revision (true for bundles committed before that revision was tagged). */
export function evidenceRelease(record: ApplicabilityRecord, path: string): string {
  return record.provenance.find(({ reference }) => reference.path === path)?.reference.release ?? record.workflow_revision;
}

export function evidenceHref(record: ApplicabilityRecord, path: string, repository = 'https://github.com/pnsinha/laptop-to-cluster'): string {
  return `${repository}/blob/${encodeURIComponent(evidenceRelease(record, path))}/${encodePath(path)}`;
}

/** The README provenance entry when it predates the current release, so the page can say so and point at the current one. */
export function olderReadme(record: ApplicabilityRecord, currentRelease: string): RepoRef | undefined {
  return record.provenance.map(({ reference }) => reference).find(({ path, release }) => /(?:^|\/)README\.md$/.test(path) && release !== currentRelease);
}

export function currentReadmeHref(reference: RepoRef, currentRelease: string): string {
  return `${reference.repository}/blob/${encodeURIComponent(currentRelease)}/${encodePath(reference.path)}`;
}

/** "Test record: Purdue Anvil, Oct 2026". The record id stays in the kind line above the title. */
export function recordTitle(record: ApplicabilityRecord): string {
  return `Test record: ${record.environment.public_name}, ${formatMonthYear(record.validation_date)}`;
}
