import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import starlight from '@astrojs/starlight';
import canonicalPolicy from './plugins/canonical-policy.mjs';
import accessibleTables from './plugins/accessible-tables.mjs';

const ORIGIN = 'https://laptop-to-cluster.org';
const REPOSITORY = 'https://github.com/pnsinha/laptop-to-cluster';

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

/* Two small scripts every page carries. The first opens every closed disclosure in the main
   content before printing and closes it again afterwards, so collapsed material prints. The
   second opens the disclosure that holds a fragment target, so a link into collapsed content
   lands on visible text in every browser. */
const PRINT_DISCLOSURES = "(()=>{let o=[];addEventListener('beforeprint',()=>{o=[...document.querySelectorAll('main details:not([open])')];o.forEach((d)=>{d.open=true})});addEventListener('afterprint',()=>o.forEach((d)=>{d.open=false}))})()";
/* Marks a scripted page (data-l2c-js, which tokens.css needs before it honours Starlight's data-theme="dark"), then keeps the theme-color meta in effect on the page's own canvas: the metas follow the OS by their media queries, and a stored choice can set data-theme the other way. */
const THEME_COLOR_SYNC = "(()=>{const r=document.documentElement;r.dataset.l2cJs='';const f=()=>{const t=r.dataset.theme;if(!t)return;document.querySelectorAll('meta[name=theme-color][media]').forEach((e)=>{e.dataset.media||(e.dataset.media=e.media);e.media=e.dataset.media.includes(t)?'all':'not all'})};f();new MutationObserver(f).observe(r,{attributes:true,attributeFilter:['data-theme']})})()";
const OPEN_FRAGMENT_TARGET = "(()=>{const f=()=>{if(!location.hash)return;const t=document.getElementById(decodeURIComponent(location.hash.slice(1)));if(!t)return;let d=t.closest('details'),n=0;while(d){d.open=true;n++;d=d.parentElement&&d.parentElement.closest('details')}if(n)t.scrollIntoView()};addEventListener('hashchange',f);f()})()";

/* The only two preloads: the serif roman (headings and prose) and Plex Sans Regular (interface). Keep these paths in step with fonts.css. */
const PRELOADED_FONTS = [
  '/fonts/source-serif-4-5.3.0/source-serif-4-latin-wght-normal.woff2',
  '/fonts/ibm-plex-sans-1.1.0/IBMPlexSans-Regular-Latin1.woff2',
];

export default defineConfig({
  site: 'https://laptop-to-cluster.org',
  output: 'static',
  trailingSlash: 'always',
  build: { inlineStylesheets: 'never' },
  integrations: [
    starlight({
      title: 'Laptop-to-Cluster Guide',
      description: 'Translate a multi-service Docker Compose stack to a scheduler-managed HPC allocation with Slurm and Apptainer.',
      social: [{ icon: 'github', label: 'GitHub repository', href: REPOSITORY }],
      customCss: [
        './src/styles/layers.css',
        './src/styles/tokens.css',
        './src/styles/fonts.css',
        './src/styles/starlight-theme.css',
        './src/styles/components.css',
        './src/styles/enhancements.css',
      ],
      tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 3 },
      pagination: true,
      lastUpdated: false,
      credits: false,
      disable404Route: true,
      expressiveCode: false,
      markdown: { headingLinks: false },
      head: [
        { tag: 'link', attrs: { rel: 'alternate', type: 'application/rss+xml', title: 'Laptop-to-Cluster updates', href: `${ORIGIN}/feed.xml` } },
        ...PRELOADED_FONTS.map((href) => ({ tag: 'link', attrs: { rel: 'preload', href, as: 'font', type: 'font/woff2', crossorigin: 'anonymous' } })),
        { tag: 'meta', attrs: { name: 'theme-color', media: '(prefers-color-scheme: light)', content: '#fbf9f4' } },
        { tag: 'meta', attrs: { name: 'theme-color', media: '(prefers-color-scheme: dark)', content: '#131a29' } },
        { tag: 'script', content: THEME_COLOR_SYNC },
        { tag: 'script', content: PRINT_DISCLOSURES },
        { tag: 'script', content: OPEN_FRAGMENT_TARGET },
      ],
      components: {
        Hero: './src/components/starlight/Hero.astro',
        PageTitle: './src/components/starlight/PageTitle.astro',
        Footer: './src/components/starlight/Footer.astro',
      },
    }),
    sitemap(),
    canonicalPolicy(),
    accessibleTables(),
  ],
  markdown: {
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
      defaultColor: false,
      wrap: false,
      langs: ['bash', 'python', 'sh', 'yaml'],
      transformers: [codeContrast],
    },
  },
});
