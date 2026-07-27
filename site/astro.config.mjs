import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import canonicalPolicy from './plugins/canonical-policy.mjs';

export default defineConfig({
  site: 'https://laptop-to-cluster.org',
  output: 'static',
  trailingSlash: 'always',
  integrations: [sitemap(), canonicalPolicy()],
  markdown: {
    shikiConfig: {
      theme: 'github-dark',
      wrap: false,
      langs: ['bash', 'python', 'sh'],
    },
  },
});
