import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
/** RELEASE_VERSION env wins; otherwise the newest releases/<v>/release-candidate.json version. Never defaults to v0.1.0. */
export function currentReleaseVersion(root = process.cwd().endsWith('/site') ? '..' : '.'): string {
  const fromEnv = process.env.RELEASE_VERSION?.trim();
  if (fromEnv) return fromEnv;
  const dir = join(root, 'releases');
  const versions = existsSync(dir) ? readdirSync(dir).filter((v) => /^v\d+\.\d+\.\d+(?:-[A-Za-z0-9.]+)?$/.test(v) && existsSync(join(dir, v, 'release-candidate.json'))) : [];
  const cmp = (a: string, b: string) => { const pa = a.slice(1).split(/[.-]/).map((x) => Number(x) || 0); const pb = b.slice(1).split(/[.-]/).map((x) => Number(x) || 0); for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pb[i] - pa[i]; return 0; };
  const newest = versions.sort(cmp)[0];
  if (!newest) throw new Error('currentReleaseVersion: set RELEASE_VERSION or add releases/<version>/release-candidate.json');
  return JSON.parse(readFileSync(join(dir, newest, 'release-candidate.json'), 'utf8')).version ?? newest;
}

/** Content writes learner links to the package that ships with this release as `.../blob/@release/...`.
 *  They resolve here to the current release tag. Provenance links stay pinned to the release a run used. */
export const RELEASE_REF_TOKEN = '@release';

/** Replaces the release token inside href attributes only. */
export function resolveReleaseRefs(html: string, version: string): string {
  if (!version) throw new Error('resolveReleaseRefs: a release version is required');
  return html.replace(/href="([^"]*)"/g, (attribute, href: string) => (
    href.includes(`/${RELEASE_REF_TOKEN}/`) ? `href="${href.replaceAll(`/${RELEASE_REF_TOKEN}/`, `/${version}/`)}"` : attribute
  ));
}
