import { mkdtempSync, readFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const runner = join(root, 'tests/fixtures/baseline-fake-runtime/run-scenario.sh');
const mappings: Record<string, string> = {
  'invalid-input': 'BSSW-PREQ-INPUT',
  'early-coordinator-exit': 'BSSW-COORDINATOR-EXIT',
  'worker-failure': 'BSSW-WORKER-EXIT',
  'checksum-mismatch': 'BSSW-INTEGRITY-INPUT',
  'verification-failure': 'BSSW-VERIFY-RESULT',
  'cleanup-failure': 'BSSW-CLEANUP-CHILD',
  'readiness-timeout': 'BSSW-READY-TIMEOUT',
};

function run(scenario: string) {
  const output = mkdtempSync(join(tmpdir(), `bssw-${scenario}-`));
  const process = spawnSync('bash', [runner, scenario, output], { encoding: 'utf8' });
  return {
    ...process,
    combined: `${process.stdout}${process.stderr}`,
    runtime: join(output, 'scratch/bssw-4242'),
  };
}

describe('single-node baseline deterministic fixtures', () => {
  it('produces one verified unique result per task after readiness', () => {
    const execution = run('success');
    expect(execution.status, execution.combined).toBe(0);
    const result = JSON.parse(readFileSync(join(execution.runtime, 'result.json'), 'utf8'));
    expect(result).toMatchObject({ schemaVersion: 1, status: 'success', taskCount: 4 });
    expect(new Set(result.results.map((item: { taskId: string }) => item.taskId)).size).toBe(4);
    const events = readFileSync(join(execution.runtime, 'events.jsonl'), 'utf8');
    expect(events.indexOf('coordinator-ready')).toBeLessThan(events.indexOf('worker-start'));
    for (const name of ['coordinator.log', 'readiness.log', 'worker-01.log', 'worker-02.log', 'verification.log']) {
      expect(statSync(join(execution.runtime, 'logs', name)).isFile()).toBe(true);
    }
  });

  for (const [scenario, diagnostic] of Object.entries(mappings)) {
    it(`maps ${scenario} to ${diagnostic} without a success marker`, () => {
      const execution = run(scenario);
      expect(execution.status).not.toBe(0);
      expect(execution.combined).toContain(`\"diagnosticId\":\"${diagnostic}\"`);
      expect(existsSync(join(execution.runtime, 'result.json'))).toBe(false);
      expect(execution.combined).not.toContain('SECRET_FIXTURE_VALUE');
      if (scenario === 'readiness-timeout' && existsSync(join(execution.runtime, 'events.jsonl'))) {
        expect(readFileSync(join(execution.runtime, 'events.jsonl'), 'utf8')).not.toContain('worker-start');
      }
    });
  }
});
