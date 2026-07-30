import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import canonicalPolicy from './plugins/canonical-policy.mjs';
import accessibleTables from './plugins/accessible-tables.mjs';

export default defineConfig({
  site: 'https://laptop-to-cluster.org',
  output: 'static',
  trailingSlash: 'always',
  integrations: [sitemap(), canonicalPolicy(), accessibleTables()],
  markdown: {
    shikiConfig: {
      theme: 'github-dark',
      wrap: false,
      langs: ['bash', 'python', 'sh'],
    },
  },
});
