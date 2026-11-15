import { getViteConfig } from 'astro/config';

/* Two projects. unit: workflow and evidence integrity, the excerpt check, the acknowledgment in the
   README, the boundary scan and the release tooling. built: checks on dist after `npm run build`
   (routes, links, acknowledgment on every page, Tested badges against their records). */
export default getViteConfig({
  test: {
    projects: [
      { extends: true, test: { name: 'unit', environment: 'node', globals: true, include: ['tests/unit/**/*.test.ts'] } },
      { extends: true, test: { name: 'built', environment: 'node', include: ['tests/built/**/*.test.ts'] } },
    ],
  },
});
