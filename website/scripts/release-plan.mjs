import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RELEASE_VERSION_PATTERN, resolveReleaseVersion } from './release-version.mjs';

/* Decides what a release.yml run may do. Every later job reads these outputs and nothing else decides where a build goes.
   preview    : branch push to the showcase branch, or a vX.Y.Z-rc.N tag. Deploys to the preview alias. Never writes a release record.
   production : an exact vX.Y.Z tag (or a post-merge dispatch for one). Deploys to main and writes the release record.
   Frozen releases are never deployable from this workflow.
   `sha` is the commit the workflow checked out (RELEASE_SHA, else GITHUB_SHA). Every later job checks out that exact SHA, so a tag that moves mid-run cannot change what ships. */
export const SHOWCASE_BRANCH = 'v0.2.0-showcase';
export const FROZEN_RELEASES = ['v0.1.0'];
const RC_TAG = /^(v\d+\.\d+\.\d+)-rc\.(\d+)$/;

function production(version, candidateVersion, context) {
  if (FROZEN_RELEASES.includes(version)) throw new Error(`${version} is frozen and is published only by publication.yml`);
  if (version !== candidateVersion) throw new Error(`${context} names ${version} but releases/*/release-candidate.json says ${candidateVersion}`);
  return { mode: 'production', version, preview: '', fullGate: true, deployBranch: 'main' };
}

export function planRelease({ eventName, refType, refName, dispatchRelease = '', candidateVersion, commitDate, sha }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(commitDate ?? '')) throw new Error('commit date must be YYYY-MM-DD');
  if (!/^[a-f0-9]{40}$/i.test(sha ?? '')) throw new Error('sha must be a full commit SHA');
  if (!RELEASE_VERSION_PATTERN.test(candidateVersion ?? '')) throw new Error('candidate version must look like v1.2.3');
  let plan;
  if (eventName === 'push' && refType === 'branch') {
    if (refName !== SHOWCASE_BRANCH) throw new Error(`branch ${refName} is not deployable; only ${SHOWCASE_BRANCH} previews`);
    plan = { mode: 'preview', version: candidateVersion, preview: '1', fullGate: false, deployBranch: 'preview' };
  } else if (eventName === 'push' && refType === 'tag') {
    const rc = RC_TAG.exec(refName);
    if (rc) {
      if (rc[1] !== candidateVersion) throw new Error(`tag ${refName} names ${rc[1]} but releases/*/release-candidate.json says ${candidateVersion}`);
      plan = { mode: 'preview', version: rc[1], preview: '1', fullGate: true, deployBranch: 'preview' };
    } else if (RELEASE_VERSION_PATTERN.test(refName)) {
      plan = production(refName, candidateVersion, `tag ${refName}`);
    } else {
      throw new Error(`tag ${refName} is not a release tag (vX.Y.Z or vX.Y.Z-rc.N)`);
    }
  } else if (eventName === 'workflow_dispatch') {
    if (!RELEASE_VERSION_PATTERN.test(dispatchRelease)) throw new Error(`release input ${JSON.stringify(dispatchRelease)} must look like v1.2.3`);
    if (refType !== 'branch' || refName !== 'main') throw new Error('manual dispatch is a post-merge fallback and runs only from main');
    plan = production(dispatchRelease, candidateVersion, `release input ${dispatchRelease}`);
  } else {
    throw new Error(`event ${eventName} on ${refType} ${refName} is not deployable`);
  }
  return {
    ...plan,
    date: commitDate,
    sha,
    artifactName: `validated-site-${plan.version}-${sha}`,
    recordArtifactName: `release-record-${plan.version}-${sha}`,
  };
}

export function toOutputLines(plan) {
  const entries = {
    mode: plan.mode, version: plan.version, date: plan.date, sha: plan.sha, preview: plan.preview, 'full-gate': String(plan.fullGate),
    'deploy-branch': plan.deployBranch, 'artifact-name': plan.artifactName, 'record-artifact-name': plan.recordArtifactName,
  };
  for (const [key, value] of Object.entries(entries)) if (/[\r\n]/.test(value)) throw new Error(`output ${key} contains a line break`);
  return Object.entries(entries).map(([key, value]) => `${key}=${value}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = resolve(process.argv[2] ?? '.');
    const env = { ...process.env };
    const commitDate = env.RELEASE_COMMIT_DATE || execFileSync('git', ['log', '-1', '--format=%cs', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    // RELEASE_VERSION is deliberately ignored here: the plan reads only the record in the checked-out tree.
    delete process.env.RELEASE_VERSION;
    const plan = planRelease({
      eventName: env.GITHUB_EVENT_NAME, refType: env.GITHUB_REF_TYPE, refName: env.GITHUB_REF_NAME,
      dispatchRelease: env.INPUT_RELEASE ?? '', candidateVersion: resolveReleaseVersion(root), commitDate, sha: env.RELEASE_SHA || env.GITHUB_SHA,
    });
    console.log(toOutputLines(plan).join('\n'));
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  }
}
