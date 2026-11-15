import { fileURLToPath } from 'node:url';

/** The Astro project (this directory's parent: website/). */
export const WEBSITE_ROOT = fileURLToPath(new URL('..', import.meta.url));
/** The repository root: where evidence/, workflows/, README.md, .github/ and git history live. */
export const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
