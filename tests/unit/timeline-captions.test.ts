import { describe, expect, it } from 'vitest';
import { TIMELINE_STEPS } from '../../site/src/content/contracts';
import { TIMELINE_CAPTIONS } from '../../site/src/content/timeline';

describe('timeline captions', () => {
  it('provides one caption per frozen step', () => {
    expect(Object.keys(TIMELINE_CAPTIONS).map(Number)).toEqual(TIMELINE_STEPS.map(({ n }) => n));
    for (const step of TIMELINE_STEPS) expect(TIMELINE_CAPTIONS[step.n].length, step.label).toBeGreaterThan(20);
  });

  it('matches what baseline.sbatch does at each step', () => {
    expect(TIMELINE_CAPTIONS[1]).toMatch(/private/);
    expect(TIMELINE_CAPTIONS[1]).toMatch(/\(job-scoped scratch\)/);
    expect(TIMELINE_CAPTIONS[2]).toMatch(/coordinator/);
    expect(TIMELINE_CAPTIONS[2]).toMatch(/\(a job step\)/);
    expect(TIMELINE_CAPTIONS[2]).toMatch(/\(loopback\)/);
    expect(TIMELINE_CAPTIONS[3]).toMatch(/^Proves the coordinator can serve/);
    expect(TIMELINE_CAPTIONS[3]).toMatch(/before any worker starts/);
    // READINESS_TIMEOUT is configurable (1..300), so the caption names a time limit, not a fixed 30 s.
    expect(TIMELINE_CAPTIONS[3]).toMatch(/time limit \(30 seconds by default\)/);
    expect(TIMELINE_CAPTIONS[3]).not.toMatch(/within 30 seconds/);
    expect(TIMELINE_CAPTIONS[4]).toMatch(/^Only now/);
    expect(TIMELINE_CAPTIONS[4]).toMatch(/waits for every worker/);
    expect(TIMELINE_CAPTIONS[5]).toMatch(/coordinator still running/);
    expect(TIMELINE_CAPTIONS[5]).toMatch(/only a full pass/);
    expect(TIMELINE_CAPTIONS[6]).toMatch(/set up at the start \(an EXIT trap\)/);
    // An untrappable kill bypasses the trap, and that path is Designed, not run, so no caption promises "however it ends".
    expect(TIMELINE_CAPTIONS[6]).toMatch(/when the script exits/);
    expect(TIMELINE_CAPTIONS[6]).not.toMatch(/however|no matter|always|every time/i);
    expect(Object.values(TIMELINE_CAPTIONS).filter((caption) => /\bworkers start\b/.test(caption))).toEqual([TIMELINE_CAPTIONS[4]]);
  });
});
