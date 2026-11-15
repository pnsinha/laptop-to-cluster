import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { RELEASE_VERSION_PATTERN, resolveReleaseVersion } from './release-version.mjs';

/* Decides what a release.yml run may do. Every later job reads these outputs and nothing else decides where a build goes.
   production : a vX.Y.Z tag (pushed, or a manual run on that tag with preview off). Deploys to main after approval and writes the release record.
   preview    : a manual run with preview on, on any ref. Deploys to the preview alias; no tag, no approval, no record.
   A frozen release is never deployable here.
   `sha` is the commit the workflow checked out. Every later job checks out that exact SHA, so a tag that moves mid-run cannot change what ships. */
export const FROZEN_RELEASES = ['v0.1.0'];

export function planRelease({ eventName, refType, refName, preview = false, fallbackVersion, commitDate, sha }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(commitDate ?? '')) throw new Error('commit date must be YYYY-MM-DD');
  if (!/^[a-f0-9]{40}$/i.test(sha ?? '')) throw new Error('sha must be a full commit SHA');
  const isTag = refType === 'tag' && RELEASE_VERSION_PATTERN.test(refName ?? '');
  if (eventName === 'push') {
    if (!isTag) throw new Error(`${refType} ${refName} is not a release tag (vX.Y.Z)`);
  } else if (eventName === 'workflow_dispatch') {
    if (!preview && !isTag) throw new Error('a production release runs only on a vX.Y.Z tag; choose a tag as the ref, or turn preview on');
  } else {
    throw new Error(`event ${eventName} is not deployable`);
  }
  const mode = eventName === 'push' || !preview ? 'production' : 'preview';
  const version = isTag ? refName : fallbackVersion;
  if (!RELEASE_VERSION_PATTERN.test(version ?? '')) throw new Error('release version must look like v1.2.3');
  if (mode === 'production' && FROZEN_RELEASES.includes(version)) throw new Error(`${version} is frozen and is published only by publication.yml`);
  return { mode, version, date: commitDate, sha, artifactName: `validated-site-${version}-${sha}`, recordArtifactName: `release-record-${version}-${sha}` };
}

export function toOutputLines(plan) {
  const entries = { mode: plan.mode, version: plan.version, date: plan.date, sha: plan.sha, 'artifact-name': plan.artifactName, 'record-artifact-name': plan.recordArtifactName };
  for (const [key, value] of Object.entries(entries)) if (/[\r\n]/.test(value)) throw new Error(`output ${key} contains a line break`);
  return Object.entries(entries).map(([key, value]) => `${key}=${value}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = resolve(process.argv[2] ?? '.');
    const env = process.env;
    const commitDate = env.RELEASE_COMMIT_DATE || execFileSync('git', ['log', '-1', '--format=%cs', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    // The tag, not RELEASE_VERSION, names a release; only a preview of a branch falls back to package.json.
    delete process.env.RELEASE_VERSION;
    const plan = planRelease({
      eventName: env.GITHUB_EVENT_NAME, refType: env.GITHUB_REF_TYPE, refName: env.GITHUB_REF_NAME,
      preview: env.INPUT_PREVIEW === 'true', fallbackVersion: resolveReleaseVersion(root), commitDate, sha: env.RELEASE_SHA || env.GITHUB_SHA,
    });
    console.log(toOutputLines(plan).join('\n'));
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  }
}
