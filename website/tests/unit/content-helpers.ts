import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../..', import.meta.url));

/** The repository root: where workflows/, evidence/, .github/ and README.md live. */
export const repoRoot = resolve(root, '..');
const REPO_LEVEL = /^(?:workflows|evidence|\.github)\/|^(?:README\.md|LICENSE)$/;

/** Read a file by path relative to website/, or to the repository root for workflows/, evidence/, .github/ and README.md. */
export const read = (relativePath: string): string => readFileSync(resolve(REPO_LEVEL.test(relativePath) ? repoRoot : root, relativePath), 'utf8');
