import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import canonicalPolicy from './plugins/canonical-policy.mjs';
import accessibleTables from './plugins/accessible-tables.mjs';
import rehypeReleaseRefs from './plugins/release-refs.mjs';
import { resolveReleaseVersion } from '../scripts/release-version.mjs';

/* github-light and github-dark are kept, except for the few colours that fall under 4.5:1 on the
   code surface (--surface in both themes). Those are swapped for a darker or lighter neighbour. */
export const CODE_CONTRAST = {
  light: { '#6A737D': '#57606A', '#22863A': '#116329', '#D73A49': '#B31D28', '#E36209': '#953800' },
  dark: { '#6A737D': '#8B949E' },
};

export const codeContrast = {
  name: 'l2c-code-contrast',
  span(node) {
    const style = node.properties?.style;
    if (typeof style !== 'string') return;
    node.properties.style = style.replace(/--shiki-(light|dark):(#[0-9a-fA-F]{6})\b/g, (match, theme, colour) => {
      const swap = CODE_CONTRAST[theme][colour.toUpperCase()];
      return swap ? `--shiki-${theme}:${swap}` : match;
    });
  },
};

export default defineConfig({
  site: 'https://laptop-to-cluster.org',
  output: 'static',
  trailingSlash: 'always',
  integrations: [sitemap(), canonicalPolicy(), accessibleTables()],
  markdown: {
    rehypePlugins: [rehypeReleaseRefs({ version: resolveReleaseVersion(fileURLToPath(new URL('..', import.meta.url))) })],
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
      defaultColor: false,
      wrap: false,
      langs: ['bash', 'python', 'sh', 'yaml'],
      transformers: [codeContrast],
    },
  },
});
