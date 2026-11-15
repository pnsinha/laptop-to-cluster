import { describe, expect, it } from 'vitest';
import { atLeast, publicReleasePlan } from '../../scripts/check-public-release.mjs';

describe('check-public-release plan', () => {
  it('orders versions numerically', () => {
    expect(atLeast('v0.2.0', 'v0.2.0')).toBe(true);
    expect(atLeast('v0.10.0', 'v0.2.0')).toBe(true);
    expect(atLeast('v0.1.0', 'v0.2.0')).toBe(false);
  });

  it('keeps the v0.1.0 checks and adds the v0.2.0 routes, the release anchor and the version-named tag', () => {
    const v1 = publicReleasePlan('v0.1.0');
    expect(v1.routes).toEqual(['/guide/scheduler-as-orchestrator/', '/guide/baseline-single-node-pattern/', '/start/', '/diagnostics/', '/milestones/1/', '/about/support/']);
    expect(v1.releaseAnchor).toBeUndefined();
    expect(v1.repositoryTagPath).toBe('/releases/tag/v0.1.0');
    const v2 = publicReleasePlan('v0.2.0');
    expect(v2.routes).toEqual(expect.arrayContaining([...v1.routes, '/guide/tour/', '/guide/compose-to-hpc-translation/', '/adoption/evaluate/', '/about/talks-and-papers/', '/milestones/2/']));
    expect(v2.releaseAnchor).toEqual({ route: '/milestones/2/', text: 'id="release-v0-2-0"' });
    expect(v2.repositoryTagPath).toBe('/releases/tag/v0.2.0');
    expect(v2.rootTitle).toBe('Bridging the Laptop-to-Cluster Gap');
  });

  it('checks only the fallback host for a preview deployment', () => {
    const preview = publicReleasePlan('v0.2.0', { preview: true });
    expect([preview.checkApex, preview.checkRedirects, preview.checkDiscovery, preview.requireRecord]).toEqual([false, false, false, false]);
    expect(preview.fallbackText).toBe('Scheduler as Orchestrator');
    const production = publicReleasePlan('v0.2.0');
    expect([production.checkApex, production.checkRedirects, production.checkDiscovery, production.requireRecord]).toEqual([true, true, true, true]);
  });
});
