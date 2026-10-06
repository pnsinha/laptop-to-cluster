import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { serveDist } from './support/serve-dist';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const root = fileURLToPath(new URL('../..', import.meta.url));
const dist = resolve(root, 'site/dist');
let server: Awaited<ReturnType<typeof serveDist>>;
let browser: Browser;
beforeAll(async () => {
  if (!existsSync(resolve(dist, 'index.html'))) throw new Error('site/dist is missing; run npm run build first');
  server = await serveDist(dist);
  browser = await chromium.launch({ headless: true });
});
afterAll(async () => { await browser?.close(); await server?.close(); });

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];
const violations = async (route: string, scheme: 'light' | 'dark', act?: (page: import('playwright').Page) => Promise<void>) => {
  const context = await browser.newContext({ colorScheme: scheme });
  const page = await context.newPage();
  page.setDefaultTimeout(5_000);
  await page.goto(`${server.origin}${route}`);
  await act?.(page);
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  await context.close();
  return results.violations.map(({ id, nodes }) => `${id} x${nodes.length}`);
};

for (const scheme of ['light', 'dark'] as const) {
  describe(`axe, ${scheme} theme`, () => {
    it('finds nothing on the home page with the highlight idle', async () => {
      expect(await violations('/', scheme)).toEqual([]);
    });
    it('finds nothing on the home page with a term selected', async () => {
      const select = async (page: import('playwright').Page) => {
        await page.locator('.crosswalk__term[data-concept="gate"] button').focus();
        await page.keyboard.press('Enter');
      };
      expect(await violations('/', scheme, select)).toEqual([]);
    });
    it('finds nothing on the cheat sheet', async () => {
      expect(await violations('/about/cheat-sheet/', scheme)).toEqual([]);
    });
  });
}
