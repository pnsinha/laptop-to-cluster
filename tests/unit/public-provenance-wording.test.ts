import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8');
const unwrap = (text: string) => text.replace(/\s+/g, ' ');

describe('layered-install-trees PROVENANCE.md', () => {
  const text = unwrap(read('workflows/layered-install-trees/PROVENANCE.md'));

  it('no longer says the imported files are otherwise unchanged', () => {
    expect(text).not.toContain('otherwise unchanged');
  });

  it('names the later edits and says the listed jobs ran the earlier scripts', () => {
    expect(text).toContain('Later edits: version-capture lines (`BSSW_VERSIONS`, 2026-09-27) were added to each sbatch script, and two comments were corrected');
    expect(text).toContain('All jobs listed below ran the scripts as they were before these edits.');
  });
});

describe('layered-install-trees README intro', () => {
  const intro = unwrap(read('workflows/layered-install-trees/README.md').split('\n## ')[0]);

  it('bounds the Charliecloud claim to the recorded gate result', () => {
    expect(intro).not.toContain('under Apptainer or Charliecloud');
    expect(intro).toContain('then composes both trees at runtime under Apptainer.');
    expect(intro).toContain('its recorded compose run does not pass its own gate (see stage 4)');
  });

  it('scopes the LD_LIBRARY_PATH sentence to Apptainer', () => {
    expect(intro).toMatch(/under Apptainer the `DT_RPATH` entries resolve within the provider tree or the base image without `LD_LIBRARY_PATH`/);
  });

  it('agrees with the stage notes it points to', () => {
    const readme = unwrap(read('workflows/layered-install-trees/README.md'));
    expect(readme).toContain('printed `GATE: FAIL (1 unresolved deps)`. The stage does not pass its own gate.');
  });
});

describe('evidence/README.md', () => {
  const text = unwrap(read('evidence/README.md'));

  it('lists both bundle pairs, and every bundle it names exists', () => {
    for (const bundle of ['anvil-baseline-20261007-success', 'anvil-baseline-20261007-readiness-timeout', 'anvil-v0-1-0-success-20260725', 'anvil-v0-1-0-readiness-timeout-20260725']) {
      expect(text, bundle).toContain(`\`${bundle}/\``);
      expect(existsSync(`${root}/evidence/${bundle}`), bundle).toBe(true);
    }
  });

  it('says October backs the current Module 2 record and July backs the earlier one', () => {
    expect(text).toContain('October 2026 (current evidence for Module 2).');
    expect(text).toContain('`applicability/m2-baseline-anvil-2026-10.yml` (Slurm 26.05.4, Apptainer 1.5.3, the same image digest as July)');
    expect(text).toContain('July 2026 (release v0.1.0).');
    expect(text).toContain('`applicability/m1-baseline-anvil.yml`, which the October record supersedes');
    expect(text).not.toContain('back release v0.1.0:');
  });
});
