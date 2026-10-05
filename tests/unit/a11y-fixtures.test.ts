import { describe, expect, it } from 'vitest';
import { DOORS, NAV_ITEMS } from '../../site/src/content/contracts';
import { HOME_PATH, MODULE_2_PATH, accessibilityPages, recordPaths, requiredKinds } from '../accessibility/browser-fixtures';

const paths = accessibilityPages.map(({ path }) => path);

describe('accessibility page fixtures', () => {
  it('lists each route once and derives dist routes from paths', () => {
    expect(new Set(paths).size).toBe(paths.length);
    for (const { path, distRoute } of accessibilityPages) {
      expect(distRoute, path).toBe(path === '/404' ? '404' : path.replace(/^\/|\/$/g, ''));
    }
  });

  it('covers the three doors, the internal navigation destinations and the new routes', () => {
    for (const door of DOORS) expect(paths, door.href).toContain(door.href);
    for (const item of NAV_ITEMS) if (!('external' in item)) expect(paths, item.href).toContain(item.href);
    for (const path of ['/guide/tour/', '/guide/compose-to-hpc-translation/', '/adoption/evaluate/', '/about/talks-and-papers/', '/milestones/2/', '/events/iguide-forum-2026/']) {
      expect(paths, path).toContain(path);
    }
    expect(paths).toContain(HOME_PATH);
    expect(paths).toContain(MODULE_2_PATH);
    expect(recordPaths).toContain('/applicability/m1-baseline-anvil/');
  });

  it('covers every required page kind', () => {
    const kinds = new Set(accessibilityPages.map(({ kind }) => kind));
    for (const kind of requiredKinds) expect(kinds.has(kind), kind).toBe(true);
  });

  it('starts every keyboard landmark list with the skip link and keeps the home order of the C2 markup', () => {
    for (const page of accessibilityPages) if (page.focusLandmarks) expect(page.focusLandmarks[0], page.path).toBe('.skip');
    expect(accessibilityPages.find(({ path }) => path === '/')!.focusLandmarks).toEqual(['.skip', '.site-nav--wide a', '.hero__actions a', '.applicability-projection a', '.doors a', '.project-links a']);
  });

  it('keeps the old tour slug out of the fixtures', () => {
    expect(paths.join(' ')).not.toContain('how-to-use-this-guide');
  });
});
