import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultPdfToText, runBoundaryScan } from './boundary.mjs';

export const CANONICAL_ORIGIN = 'https://laptop-to-cluster.org';
export const REDIRECT_HOSTS = Object.freeze([
  'www.laptop-to-cluster.org',
  'laptoptocluster.org',
  'laptop-to-cluster.pnsinha.com',
]);
const FORBIDDEN_ORIGIN = /https:\/\/(?:www\.laptop-to-cluster\.org|laptoptocluster\.org|laptop-to-cluster\.pnsinha\.com|[^/\s"'<>]+\.pages\.dev)/i;
const SHA256 = /^[a-f0-9]{64}$/;
export const FONT_FAMILIES = Object.freeze(['Source Serif 4', 'IBM Plex Sans', 'IBM Plex Mono', 'L2C Marks']);
const REMOTE_FONT = /@import\s+url|fonts\.(?:googleapis|gstatic)|use\.typekit\.net|fonts\.bunny\.net|cdn\.jsdelivr\.net\/fontsource/i;
const SRC_ENTRY = /^(?:local\(\s*(?:["'][^"']+["']|[A-Za-z][A-Za-z0-9 -]*)\s*\)|url\(\s*["']?\/fonts\/[a-z0-9.-]+\/[A-Za-z0-9._-]+\.woff2["']?\s*\)\s*format\(\s*["']woff2["']\s*\))$/;
const FONT_LEAD = String.raw`(?:"?(?:Source Serif 4|IBM Plex Sans|IBM Plex Mono|L2C Marks)(?: Fallback)?"?\s*,\s*)*`;
// Motion that is actually motion: `transition: none` and `animation: none` are the reduced-motion resets and stay legal.
const MOTION = /@keyframes|animation-name\s*:(?!\s*none(?![\w-]))|animation\s*:(?!\s*none(?![\w-]))|transition\s*:(?!\s*none(?![\w-]))|scroll-timeline|parallax/i;
/** REMOTE-FONT: third-party hosts and @import url are forbidden; every @font-face is an allowlisted family served from /fonts/*.woff2 (or local()), with font-display: swap for downloads. */
export function fontFaceIssues(text) {
  const issues = REMOTE_FONT.test(text) ? ['third-party font hosts and @import url are forbidden'] : [];
  for (const block of text.match(/@font-face\s*\{[^}]*\}/gi) ?? []) {
    const family = block.match(/font-family\s*:\s*["']?([^;"'}]+)/i)?.[1]?.trim() ?? '';
    const entries = (block.match(/\bsrc\s*:\s*([^;}]+)/i)?.[1] ?? '').split(/,(?![^()]*\))/).map((entry) => entry.trim()).filter(Boolean);
    const known = FONT_FAMILIES.some((name) => family === name || family === `${name} Fallback`);
    if (!known || !entries.length || !entries.every((entry) => SRC_ENTRY.test(entry))) {
      issues.push(`@font-face "${family || '<unnamed>'}" must be an allowlisted family served from /fonts/*.woff2 or local()`);
    } else if (entries.some((entry) => entry.startsWith('url(')) && !/font-display\s*:\s*swap/i.test(block)) {
      issues.push(`@font-face "${family}" must use font-display: swap`);
    }
  }
  return issues;
}
const occurrences = (text, pattern) => text.match(pattern)?.length ?? 0;
const stripTags = (value = '') => value.replace(/<[^>]+>/g, '').replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&#x27;', "'").replaceAll('&middot;', '·').replaceAll('&#183;', '·').replaceAll('&#xB7;', '·').replaceAll('&nbsp;', ' ').trim();

export function topLevelCalls(text) {
  const start = text.indexOf('[');
  if (start < 0) return [];
  const calls = [];
  let depth = 0;
  let word = '';
  for (let index = start + 1; index < text.length; index += 1) {
    const char = text[index];
    if (depth === 0) {
      if (/[A-Za-z0-9_$]/.test(char)) { word += char; continue; }
      if (char === '(' && word) calls.push(word);
      if (char === ']') break;
      if (char !== '(') word = '';
    }
    if (char === '(' || char === '[' || char === '{') { depth += 1; word = ''; }
    else if (char === ')' || char === ']' || char === '}') depth -= 1;
  }
  return calls;
}

export function validateFrontendPolicy(manifest, astroConfig, sourceEntries = []) {
  const errors = [];
  const expectedDependencies = { '@astrojs/sitemap': '3.7.4', '@astrojs/starlight': '0.42.9', astro: '7.4.5' };
  if (JSON.stringify(manifest.dependencies ?? {}) !== JSON.stringify(expectedDependencies)) {
    errors.push(diagnostic('package.json', 'dependencies', 'DEPENDENCY-EXCLUSION', 'production dependencies must remain the pinned Astro, Starlight and sitemap closed set'));
  }
  const integrationCalls = topLevelCalls(astroConfig.slice(astroConfig.search(/integrations\s*:\s*\[/)));
  const expectedIntegrations = ['starlight', 'sitemap', 'canonicalPolicy', 'accessibleTables'];
  if (integrationCalls.join(',') !== expectedIntegrations.join(',')) errors.push(diagnostic('astro.config.mjs', 'integrations', 'INTEGRATION-EXCLUSION', `only Starlight, sitemap and the repository-owned canonical policy and accessible tables integrations are allowed, in that order; found ${integrationCalls.join(', ') || '<none>'}`));
  if (/ViewTransitions|adapter|server\s*:|session|auth/i.test(astroConfig)) errors.push(diagnostic('astro.config.mjs', 'configuration', 'TECHNOLOGY-EXCLUSION', 'view transitions, adapters, server state, sessions, and authentication are forbidden'));
  for (const { path, text } of sourceEntries) {
    for (const issue of fontFaceIssues(text)) errors.push(diagnostic(path, 'font', 'REMOTE-FONT', issue));
    if (MOTION.test(text) || /autoplay|from\s+['"](?:react|vue|svelte|@astrojs\/(?:react|vue|svelte))['"]/i.test(text)) {
      // Progressive-enhancement policy (2026-08-16): client directives are permitted
      // for bounded Astro islands; decorative motion and UI-framework imports remain forbidden.
      errors.push(diagnostic(path, 'source', 'TECHNOLOGY-EXCLUSION', 'decorative motion and UI frameworks are forbidden'));
    }
  }
  return errors;
}

export function diagnostic(source, field, check, message) {
  return `${source}:${field} [${check}] ${message}`;
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function filesUnder(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(absolute) : [absolute];
  }).sort();
}

export function createArtifactManifest(directory) {
  const root = resolve(directory);
  const files = filesUnder(root).map((absolute) => {
    const path = relative(root, absolute).replaceAll('\\', '/');
    const content = readFileSync(absolute);
    return { path, bytes: content.byteLength, sha256: sha256(content) };
  });
  const normalized = files.map(({ path, bytes, sha256: digest }) => `${path}\0${bytes}\0${digest}\n`).join('');
  const fileManifest = JSON.stringify({ schemaVersion: 1, files }, null, 2) + '\n';
  return {
    schemaVersion: 1,
    algorithm: 'sha256',
    files,
    artifactSha256: sha256(normalized),
    artifactFileManifestSha256: sha256(fileManifest),
  };
}
export function verifyArtifactManifest(directory, expected) {
  const errors = [];
  const actual = createArtifactManifest(directory);
  if (expected.schemaVersion !== 1 || expected.algorithm !== 'sha256') {
    errors.push(diagnostic('artifact-manifest.json', 'schemaVersion', 'ARTIFACT-IDENTITY', 'unsupported manifest format'));
  }
  if (expected.artifactSha256 !== actual.artifactSha256) {
    errors.push(diagnostic('dist', 'artifactSha256', 'ARTIFACT-IDENTITY', `expected ${expected.artifactSha256}, received ${actual.artifactSha256}`));
  }
  if (expected.artifactFileManifestSha256 !== actual.artifactFileManifestSha256) {
    errors.push(diagnostic('dist', 'artifactFileManifestSha256', 'ARTIFACT-IDENTITY', `expected ${expected.artifactFileManifestSha256}, received ${actual.artifactFileManifestSha256}`));
  }
  const expectedFiles = new Map((expected.files ?? []).map((file) => [file.path, file]));
  for (const file of actual.files) {
    const wanted = expectedFiles.get(file.path);
    if (!wanted) errors.push(diagnostic(file.path, 'path', 'ARTIFACT-IDENTITY', 'unexpected upload file'));
    else if (wanted.sha256 !== file.sha256 || wanted.bytes !== file.bytes) {
      errors.push(diagnostic(file.path, 'sha256', 'ARTIFACT-IDENTITY', 'file checksum or size differs'));
    }
    expectedFiles.delete(file.path);
  }
  for (const path of expectedFiles.keys()) errors.push(diagnostic(path, 'path', 'ARTIFACT-IDENTITY', 'retained upload file is missing'));
  return errors;
}

export function validateCanonicalConfig(configText) {
  const errors = [];
  const literals = configText.match(/\bsite\s*:\s*['"][^'"]+['"]/g) ?? [];
  if (literals.length !== 1 || literals[0] !== "site: 'https://laptop-to-cluster.org'") {
    errors.push(diagnostic('astro.config.mjs', 'site', 'CANONICAL-CONFIG', `must contain exactly literal site: '${CANONICAL_ORIGIN}'`));
  }
  if (/\bbase\s*:/.test(configText)) errors.push(diagnostic('astro.config.mjs', 'base', 'CANONICAL-CONFIG', 'production base paths are forbidden'));
  if (/process\.env|import\.meta\.env|loadEnv/.test(configText)) {
    errors.push(diagnostic('astro.config.mjs', 'site', 'CANONICAL-CONFIG', 'environment substitution is forbidden'));
  }
  return errors;
}

function publicPathForFile(dist, file) {
  const path = relative(dist, file).replaceAll('\\', '/');
  if (path === 'index.html') return '/';
  return `/${path.replace(/index\.html$/, '')}`;
}

function internalTargetExists(dist, href) {
  const path = decodeURI(href.split(/[?#]/, 1)[0]);
  if (!path.startsWith('/')) return true;
  if (path === '/') return existsSync(join(dist, 'index.html'));
  const relativePath = path.replace(/^\//, '');
  return existsSync(join(dist, relativePath)) || existsSync(join(dist, relativePath, 'index.html')) || existsSync(join(dist, `${relativePath}.html`));
}
export function validateBuiltOutput(dist) {
  const errors = [];
  const htmlFiles = filesUnder(dist).filter((file) => file.endsWith('.html'));
  if (!htmlFiles.length) return [diagnostic('dist', 'html', 'BUILD-OUTPUT', 'no generated HTML files were found')];
  const builtPages = htmlFiles.map((file) => ({ file, source: publicPathForFile(dist, file), html: readFileSync(file, 'utf8') }));
  const canonicalUrls = new Set();
  for (const { source, html } of builtPages) {
    const canonical = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i)?.[1];
    const openGraph = html.match(/<meta\s+property="og:url"\s+content="([^"]+)"/i)?.[1];
    const expected = new URL(source, CANONICAL_ORIGIN).href;
    if (canonical !== expected) errors.push(diagnostic(source, 'canonical', 'CANONICAL-OUTPUT', `expected ${expected}, received ${canonical ?? '<missing>'}`));
    if (openGraph !== expected) errors.push(diagnostic(source, 'og:url', 'CANONICAL-OUTPUT', `expected ${expected}, received ${openGraph ?? '<missing>'}`));
    if (canonical && source !== '/404.html') canonicalUrls.add(canonical);
    if (FORBIDDEN_ORIGIN.test(html)) errors.push(diagnostic(source, 'html', 'CANONICAL-OUTPUT', 'redirect or pages.dev hostname leaked into built HTML'));
    const links = [...html.matchAll(/\b(?:href|src)="([^"]+)"/g)].map((match) => match[1]);
    for (const href of links) {
      if ((href.startsWith('/') || href.startsWith(CANONICAL_ORIGIN)) && !internalTargetExists(dist, href.replace(CANONICAL_ORIGIN, ''))) {
        errors.push(diagnostic(source, 'href', 'INTERNAL-LINK', `target does not exist: ${href}`));
      }
    }
  }

  errors.push(...validateAcknowledgments(dist, builtPages), ...validateBudgets(dist, builtPages), ...validateFragmentLinks(builtPages), ...validateRequiredFragments(builtPages));

  for (const name of ['sitemap-index.xml', 'sitemap-0.xml', 'feed.xml', 'url-manifest.json']) {
    const file = join(dist, name);
    if (!existsSync(file)) errors.push(diagnostic(name, 'path', 'DISCOVERY-OUTPUT', 'required file is missing'));
    else {
      const text = readFileSync(file, 'utf8');
      if (FORBIDDEN_ORIGIN.test(text)) errors.push(diagnostic(name, 'origin', 'CANONICAL-OUTPUT', 'noncanonical hostname is forbidden'));
      for (const match of text.matchAll(/https:\/\/[^\s"'<>]+/g)) {
        // The canonical origin itself (no trailing path) is valid; only reject
        // URLs that use a different host or a non-apex path prefix.
        if (match[0] !== CANONICAL_ORIGIN && !match[0].startsWith(`${CANONICAL_ORIGIN}/`)) errors.push(diagnostic(name, 'url', 'CANONICAL-OUTPUT', `non-apex URL ${match[0]}`));
      }
    }
  }
  const sitemap = existsSync(join(dist, 'sitemap-0.xml')) ? readFileSync(join(dist, 'sitemap-0.xml'), 'utf8') : '';
  const sitemapUrls = new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]));
  let manifestUrls = new Set();
  try {
    const manifest = JSON.parse(readFileSync(join(dist, 'url-manifest.json'), 'utf8'));
    if (manifest.canonical_origin !== CANONICAL_ORIGIN) errors.push(diagnostic('url-manifest.json', 'canonical_origin', 'CANONICAL-OUTPUT', 'must equal canonical apex'));
    manifestUrls = new Set((manifest.records ?? []).map((record) => record.url));
  } catch (error) {
    errors.push(diagnostic('url-manifest.json', 'json', 'DISCOVERY-OUTPUT', `cannot parse: ${error.message}`));
  }
  for (const url of new Set([...canonicalUrls, ...sitemapUrls, ...manifestUrls])) {
    if (!canonicalUrls.has(url) || !sitemapUrls.has(url) || !manifestUrls.has(url)) errors.push(diagnostic(url, 'url', 'DISCOVERY-AGREEMENT', 'canonical, sitemap, and URL manifest disagree'));
  }
  errors.push(...validateStylesheets(dist));
  return errors;
}
/** SEMANTIC-TOKENS, size tokens, colour scheme and font stacks for the stylesheet that defines the :root tokens. */
export function validateTokenStylesheet(cssPath, css) {
  const errors = [];
  if (!/color-scheme\s*:\s*light dark/.test(css)) errors.push(diagnostic(cssPath, 'css', 'COLOR-SCHEME', 'color-scheme must advertise light and dark support'));
  // Literal aliases (--shell, --shell-text, --text-base, --text-supporting) are defined in every theme block.
  for (const token of ['canvas', 'surface', 'raised', 'text', 'muted', 'primary', 'accent', 'shell', 'shell-text', 'border', 'warning']) {
    if (!new RegExp(`--${token}\\s*:`).test(css)) errors.push(diagnostic(cssPath, `--${token}`, 'SEMANTIC-TOKENS', 'semantic role must be defined'));
  }
  const stack = (name, tail) => new RegExp(`--${name}:\\s*${FONT_LEAD}${tail}`).test(css);
  if (!stack('font-display', '(?:ui-serif|system-ui|Georgia)') || !stack('font-reading', '(?:ui-serif|Georgia)') || !stack('font-body', 'system-ui')
    || !stack('font-technical', 'ui-monospace') || !/--font-marks:\s*"?L2C Marks"?\s*,/.test(css)
    || !/--text-base:\s*1rem/.test(css) || !/--text-supporting:\s*0?\.875rem/.test(css)) {
    errors.push(diagnostic(cssPath, 'typography', 'SYSTEM-TYPOGRAPHY', 'allowlisted self-hosted families that fall back to system serif, sans and mono stacks, the L2C Marks stack, and literal 16px/14px size tokens are required'));
  }
  return errors;
}

/** Every emitted stylesheet: fonts, gradients, motion and font files; exactly one stylesheet, and it defines the tokens; no inline <style> blocks in built HTML. */
export function validateStylesheets(dist) {
  const errors = [];
  // Pagefind's search bundle (dist/pagefind/) ships its own interface styles and is not a page stylesheet.
  const files = filesUnder(dist).filter((candidate) => candidate.endsWith('.css') && !/(?:^|[\\/])pagefind[\\/]/.test(relative(dist, candidate)));
  const tokenSheets = [];
  for (const file of files) {
    const css = readFileSync(file, 'utf8');
    const cssPath = relative(dist, file);
    for (const issue of fontFaceIssues(css)) errors.push(diagnostic(cssPath, 'css', 'VISUAL-DEPENDENCY', issue));
    for (const [, fontPath] of css.matchAll(/url\(\s*["']?(\/fonts\/[^"')\s]+)["']?\s*\)/g)) {
      if (!existsSync(join(dist, fontPath))) errors.push(diagnostic(cssPath, 'font', 'INTERNAL-LINK', `font file missing: ${fontPath}`));
    }
    // Starlight's search dialog blurs its backdrop; the site's own styles (checked at the source) draw no gradients or glass effects.
    if (/linear-gradient|radial-gradient/i.test(css)) errors.push(diagnostic(cssPath, 'css', 'VISUAL-DEPENDENCY', 'gradients and textures are forbidden'));
    // Starlight's own styles carry two short transitions; the reduced-motion reset in custom.css neutralises them for readers who ask. Keyframe animation and parallax stay forbidden.
    if (/@keyframes|animation-name\s*:(?!\s*none(?![\w-]))|animation\s*:(?!\s*none(?![\w-]))|scroll-timeline|parallax/i.test(css)) errors.push(diagnostic(cssPath, 'css', 'MOTION-EXCLUSION', 'decorative animation and parallax are forbidden'));
    if (/transition\s*:(?!\s*none(?![\w-]))/i.test(css) && !/prefers-reduced-motion\s*:\s*reduce[\s\S]*?transition\s*:\s*none/i.test(css)) errors.push(diagnostic(cssPath, 'css', 'MOTION-EXCLUSION', 'a stylesheet with transitions must carry the prefers-reduced-motion reset'));
    if (/--canvas\s*:/.test(css)) {
      tokenSheets.push(cssPath);
      errors.push(...validateTokenStylesheet(cssPath, css));
    }
  }
  for (const page of filesUnder(dist).filter((candidate) => candidate.endsWith('.html'))) {
    if (/<style\b/i.test(readFileSync(page, 'utf8'))) errors.push(diagnostic(relative(dist, page), 'html', 'STYLESHEET-SPLIT', 'inline <style> blocks are forbidden; component styles go in the stylesheets under website/src/styles'));
  }
  if (files.length && tokenSheets.length !== 1) {
    errors.push(diagnostic('dist', 'css', 'STYLESHEET-SPLIT', `exactly one stylesheet that defines the :root tokens is required; found ${files.length} stylesheet(s), ${tokenSheets.length} with tokens`));
  }
  return errors;
}

/* ACK-VERBATIM. The text lives only in website/src/content/acknowledgment.ts; this is the SHA-256 of its 605-character statement + " " + disclaimer. A unit test keeps the two in step. */
export const ACKNOWLEDGMENT_SHA256 = '408cbbb41af6fe9b3ddfa9f90aedc6a91e2a24d967362aa75f51e357203f8ea9';
const normalizeSpace = (value) => value.replace(/\s+/g, ' ').trim();
const acknowledgmentHash = (inner) => sha256(normalizeSpace(stripTags(inner)));

/* Hosted PDFs that may keep their own wording, because the page that links them carries the verbatim event acknowledgment beside the link.
   Anything not listed here must itself carry the verbatim text and never the retired phrase. */
export const PDF_ACK_EXEMPT = Object.freeze({
  'iguide-forum-2026-poster.pdf': 'presented as delivered; the event page carries the verbatim acknowledgment and disclaimer beside the download link',
});
const RETIRED_PHRASE = 'Scientific Computing Research';

export function validateAcknowledgments(dist, builtPages, { pdfToText = defaultPdfToText, strict = process.env.CI === 'true' } = {}) {
  const errors = [];
  for (const { source, html } of builtPages) {
    const footer = html.match(/<footer\b[^>]*\bclass="[^"]*\bl2c-footer\b[^"]*"[\s\S]*?<\/footer>/)?.[0] ?? '';
    const paragraphs = [...footer.matchAll(/<p class="acknowledgment">([\s\S]*?)<\/p>/g)];
    if (paragraphs.length !== 1 || acknowledgmentHash(paragraphs[0][1]) !== ACKNOWLEDGMENT_SHA256) {
      errors.push(diagnostic(source, 'footer', 'ACK-VERBATIM', 'the footer needs exactly one acknowledgment paragraph that matches the approved text'));
    }
    const events = [...html.matchAll(/<section class="event-acknowledgment"[^>]*>([\s\S]*?)<\/section>/g)];
    const wrongEvent = events.some((event) => {
      const inner = [...event[1].matchAll(/<p>([\s\S]*?)<\/p>/g)];
      return inner.length !== 1 || acknowledgmentHash(inner[0][1]) !== ACKNOWLEDGMENT_SHA256;
    });
    if (events.length > 1 || wrongEvent) errors.push(diagnostic(source, 'event', 'ACK-VERBATIM', 'the event acknowledgment must be one paragraph that matches the approved text'));
  }
  for (const file of filesUnder(dist).filter((candidate) => /\.(?:html|xml|json|txt)$/i.test(candidate))) {
    if (/Scientific Computing Research/.test(readFileSync(file, 'utf8'))) {
      errors.push(diagnostic(relative(dist, file).replaceAll('\\', '/'), 'text', 'ACK-VERBATIM', 'the phrase "Scientific Computing Research" is not part of the approved acknowledgment'));
    }
  }
  errors.push(...validateHostedPdfAcknowledgments(dist, builtPages, pdfToText, strict));
  return errors;
}

/** ACK-VERBATIM for hosted PDFs (the verbatim text belongs in any hosted PDF). In CI, a missing pdftotext is an error, not a skip. */
function validateHostedPdfAcknowledgments(dist, builtPages, pdfToText, strict) {
  const errors = [];
  const pdfs = filesUnder(dist).filter((candidate) => /\.pdf$/i.test(candidate));
  if (!pdfs.length) return errors;
  // The approved text, taken from a built footer that already matched its recorded hash.
  const approved = builtPages.map(({ html }) => html.match(/<footer\b[^>]*\bclass="[^"]*\bl2c-footer\b[^"]*"[\s\S]*?<\/footer>/)?.[0] ?? '')
    .flatMap((footer) => [...footer.matchAll(/<p class="acknowledgment">([\s\S]*?)<\/p>/g)])
    .map((match) => normalizeSpace(stripTags(match[1])))
    .find((text) => sha256(text) === ACKNOWLEDGMENT_SHA256);
  for (const file of pdfs) {
    const path = relative(dist, file).replaceAll('\\', '/');
    const text = pdfToText(file);
    if (text === null || text === undefined) {
      if (strict) errors.push(diagnostic(path, 'pdf', 'ACK-VERBATIM', 'pdftotext is unavailable, so the hosted PDF acknowledgment could not be checked; install poppler-utils'));
      continue;
    }
    if (Object.hasOwn(PDF_ACK_EXEMPT, path)) {
      const linked = builtPages.some(({ html }) => html.includes(`href="/${path}"`) && /<section class="event-acknowledgment"/.test(html));
      if (!linked) errors.push(diagnostic(path, 'pdf', 'ACK-VERBATIM', 'an exempt PDF needs a linking page that carries the verbatim event acknowledgment'));
      continue;
    }
    const normalized = normalizeSpace(text);
    if (normalized.includes(RETIRED_PHRASE)) errors.push(diagnostic(path, 'pdf', 'ACK-VERBATIM', `the phrase "${RETIRED_PHRASE}" is not part of the approved acknowledgment`));
    else if (approved && !normalized.includes(approved)) errors.push(diagnostic(path, 'pdf', 'ACK-VERBATIM', 'a hosted PDF must carry the approved acknowledgment and disclaimer verbatim'));
  }
  return errors;
}

/* BUDGET: fonts <= 140 KiB per page, <= 2 font preloads, inline + external JS <= 2 KiB, no third-party requests. */
export const BUDGETS = Object.freeze({ fontBytes: 140000, fontPreloads: 2, scriptBytes: 32768 });
const unicodeRanges = (value) => value.split(',').map((range) => range.trim()).filter(Boolean).map((range) => {
  const match = /^U\+([0-9A-F?]+)(?:-([0-9A-F]+))?$/i.exec(range);
  if (!match) return undefined;
  if (match[1].includes('?')) return [parseInt(match[1].replaceAll('?', '0'), 16), parseInt(match[1].replaceAll('?', 'F'), 16)];
  return [parseInt(match[1], 16), parseInt(match[2] ?? match[1], 16)];
}).filter(Boolean);
/** Font files a browser would download for a page: faces without a unicode-range, plus faces whose range covers a character on the page. */
export function fontFilesForPage(css, pageText) {
  const codepoints = [...new Set([...pageText].map((character) => character.codePointAt(0)))];
  const files = new Set();
  for (const block of css.match(/@font-face\s*\{[^}]*\}/gi) ?? []) {
    const urls = [...block.matchAll(/url\(\s*["']?(\/fonts\/[^"')\s]+)["']?\s*\)/g)].map((match) => match[1]);
    if (!urls.length) continue;
    const range = block.match(/unicode-range\s*:\s*([^;}]+)/i)?.[1];
    const ranges = range ? unicodeRanges(range) : undefined;
    if (!ranges || codepoints.some((point) => ranges.some(([from, to]) => point >= from && point <= to))) urls.forEach((url) => files.add(url));
  }
  return [...files];
}
const isThirdParty = (url) => /^(?:https?:)?\/\//i.test(url) && !url.startsWith(CANONICAL_ORIGIN);
const localSize = (dist, url) => {
  const file = join(dist, decodeURI(url.split(/[?#]/, 1)[0]).replace(/^\//, ''));
  return existsSync(file) ? readFileSync(file).byteLength : 0;
};
export function validateBudgets(dist, builtPages) {
  const errors = [];
  for (const { source, html } of builtPages) {
    const text = stripTags(html.replace(/<(script|style)\b[\s\S]*?<\/\1>/g, ' '));
    const sheets = (html.match(/<link\b[^>]*\brel="stylesheet"[^>]*>/g) ?? []).map((tag) => tag.match(/\bhref="([^"]+)"/)?.[1]).filter(Boolean);
    const fonts = new Set();
    for (const sheet of sheets) {
      if (isThirdParty(sheet)) continue;
      const file = join(dist, decodeURI(sheet.split(/[?#]/, 1)[0]).replace(/^\//, ''));
      if (!existsSync(file)) continue;
      const css = readFileSync(file, 'utf8');
      fontFilesForPage(css, text).forEach((url) => fonts.add(url));
      if (/url\(\s*["']?(?:https?:)?\/\/(?!laptop-to-cluster\.org)/i.test(css) || /@import\s+["']?(?:https?:)?\/\//i.test(css)) {
        errors.push(diagnostic(source, sheet, 'BUDGET', 'third-party request: the stylesheet loads a remote resource'));
      }
    }
    const fontBytes = [...fonts].reduce((total, url) => total + localSize(dist, url), 0);
    if (fontBytes > BUDGETS.fontBytes) errors.push(diagnostic(source, 'fonts', 'BUDGET', `fonts total ${fontBytes} bytes; the limit is ${BUDGETS.fontBytes}`));
    const preloads = occurrences(html, /<link\b[^>]*\brel="preload"[^>]*\bas="font"|<link\b[^>]*\bas="font"[^>]*\brel="preload"/g);
    if (preloads > BUDGETS.fontPreloads) errors.push(diagnostic(source, 'preload', 'BUDGET', `${preloads} font preloads; the limit is ${BUDGETS.fontPreloads}`));
    let scriptBytes = 0;
    for (const [, attributes, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
      const src = attributes.match(/\bsrc="([^"]+)"/)?.[1];
      const type = attributes.match(/\btype="([^"]*)"/)?.[1];
      if (src) scriptBytes += isThirdParty(src) ? 0 : localSize(dist, src);
      else if (!type || /^(?:module|text\/javascript)$/i.test(type)) scriptBytes += Buffer.byteLength(body);
    }
    if (scriptBytes > BUDGETS.scriptBytes) errors.push(diagnostic(source, 'scripts', 'BUDGET', `client JavaScript totals ${scriptBytes} bytes; the limit is ${BUDGETS.scriptBytes}`));
    const requests = [
      ...(html.match(/<(?:script|img|iframe|source|video|audio|embed|track)\b[^>]*>/g) ?? []).flatMap((tag) => [tag.match(/\bsrc="([^"]+)"/)?.[1], ...(tag.match(/\bsrcset="([^"]+)"/)?.[1] ?? '').split(',').map((candidate) => candidate.trim().split(/\s+/)[0])]),
      ...(html.match(/<link\b[^>]*>/g) ?? []).filter((tag) => /\brel="[^"]*\b(?:stylesheet|preload|modulepreload|prefetch|preconnect|dns-prefetch|icon|manifest|apple-touch-icon)\b/.test(tag)).map((tag) => tag.match(/\bhref="([^"]+)"/)?.[1]),
    ].filter((url) => url && isThirdParty(url));
    if (requests.length) errors.push(diagnostic(source, 'requests', 'BUDGET', `third-party request: ${requests.length} resource(s) load from another origin`));
  }
  return errors;
}

/* FRAGMENT-LINK. Fragment ids that other pages and published links rely on, keyed by route. */
export const REQUIRED_FRAGMENTS = Object.freeze({
  '/': ['big-idea', 'doors', 'crosswalk'],
  '/milestones/2/': ['release-v0-2-0'],
  '/adoption/evaluate/': ['not-tested', 'when-not'],
  '/about/attribution/': ['licenses'],
  '/about/glossary/': ['allocation', 'job-step', 'readiness-gate', 'verification', 'job-scoped-scratch', 'loopback', 'ssh-tunnel', 'coordinator', 'worker', 'batch-scheduler'],
});
const pageIds = (html) => new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
export function validateFragmentLinks(builtPages) {
  const errors = [];
  const ids = new Map(builtPages.map(({ source, html }) => [source, pageIds(html)]));
  for (const { source, html } of builtPages) {
    for (const [, href] of html.matchAll(/<a\b[^>]*\shref="([^"]*#[^"]*)"/g)) {
      const [pathPart, rawFragment] = [href.slice(0, href.indexOf('#')), href.slice(href.indexOf('#') + 1)];
      if (!rawFragment || rawFragment.startsWith(':~:')) continue;
      if (/^(?:mailto:|tel:)/i.test(pathPart) || (/^https?:\/\//i.test(pathPart) && !pathPart.startsWith(CANONICAL_ORIGIN))) continue;
      let target = source;
      if (pathPart) {
        const path = decodeURI(new URL(pathPart.replace(CANONICAL_ORIGIN, ''), `${CANONICAL_ORIGIN}${source}`).pathname);
        target = path.endsWith('/') || path.endsWith('.html') ? path : `${path}/`;
      }
      const targetIds = ids.get(target);
      if (!targetIds) continue;
      let fragment = rawFragment;
      try { fragment = decodeURIComponent(rawFragment); } catch { /* keep the raw fragment */ }
      if (!targetIds.has(fragment)) errors.push(diagnostic(source, href, 'FRAGMENT-LINK', `the fragment does not exist on ${target}`));
    }
  }
  return errors;
}
export function validateRequiredFragments(builtPages) {
  const errors = [];
  for (const [route, required] of Object.entries(REQUIRED_FRAGMENTS)) {
    const page = builtPages.find(({ source }) => source === route);
    if (!page) {
      errors.push(diagnostic(route, 'page', 'FRAGMENT-LINK', 'a page that must carry contract fragments is missing'));
      continue;
    }
    const present = pageIds(page.html);
    for (const id of required) if (!present.has(id)) errors.push(diagnostic(route, `#${id}`, 'FRAGMENT-LINK', 'required fragment id is missing'));
  }
  return errors;
}

export function validateHostnamePolicy(policy) {
  const errors = [];
  if (policy.schemaVersion !== 1) errors.push(diagnostic('hostname-redirects.v1.json', 'schemaVersion', 'REDIRECT-POLICY', 'must be 1'));
  if (policy.canonicalOrigin !== CANONICAL_ORIGIN) errors.push(diagnostic('hostname-redirects.v1.json', 'canonicalOrigin', 'REDIRECT-POLICY', 'must be the apex origin'));
  const rules = policy.rules ?? [];
  if (rules.length !== REDIRECT_HOSTS.length) errors.push(diagnostic('hostname-redirects.v1.json', 'rules', 'REDIRECT-POLICY', 'must contain exactly three rules'));
  const seen = new Set();
  for (const [index, rule] of rules.entries()) {
    const source = `hostname-redirects.v1.json:rules[${index}]`;
    if (!REDIRECT_HOSTS.includes(rule.sourceHostname)) errors.push(diagnostic(source, 'sourceHostname', 'REDIRECT-POLICY', 'hostname is not in the exact closed set'));
    if (seen.has(rule.sourceHostname)) errors.push(diagnostic(source, 'sourceHostname', 'REDIRECT-POLICY', 'duplicate hostname'));
    seen.add(rule.sourceHostname);
    if (rule.targetOrigin !== CANONICAL_ORIGIN) errors.push(diagnostic(source, 'targetOrigin', 'REDIRECT-POLICY', 'multi-hop or non-apex target is forbidden'));
    if (rule.status !== 301) errors.push(diagnostic(source, 'status', 'REDIRECT-POLICY', 'must be permanent HTTP 301'));
    for (const field of ['subpathMatching', 'preservePathSuffix', 'preserveQueryString']) {
      if (rule[field] !== true) errors.push(diagnostic(source, field, 'REDIRECT-POLICY', 'must be true'));
    }
  }
  for (const host of REDIRECT_HOSTS) if (!seen.has(host)) errors.push(diagnostic('hostname-redirects.v1.json', 'rules', 'REDIRECT-POLICY', `missing exact host ${host}`));
  return errors;
}

export function redirectLocation(policy, incoming) {
  const url = new URL(incoming);
  const rule = (policy.rules ?? []).find(({ sourceHostname }) => sourceHostname === url.hostname);
  if (!rule) throw new Error(`No redirect policy for exact hostname ${url.hostname}`);
  return `${rule.targetOrigin}${url.pathname}${url.search}`;
}

export function validateCloudflareReadiness(input) {
  const errors = [];
  for (const field of ['accountId', 'zoneId', 'pagesProjectName', 'customDomainId', 'redirectListId', 'redirectRuleId']) {
    if (typeof input[field] !== 'string' || !input[field].trim() || input[field] === 'EXTERNAL_REQUIRED') errors.push(diagnostic('cloudflare-readiness.json', field, 'CLOUDFLARE-READINESS', 'external identifier is required'));
  }
  if (input.customDomainHostname !== 'laptop-to-cluster.org') errors.push(diagnostic('cloudflare-readiness.json', 'customDomainHostname', 'CLOUDFLARE-READINESS', 'must be canonical apex'));
  if (input.customDomainStatus !== 'active') errors.push(diagnostic('cloudflare-readiness.json', 'customDomainStatus', 'CLOUDFLARE-READINESS', 'custom domain and certificate must be active'));
  if (input.redirectRuleStatus !== 'active') errors.push(diagnostic('cloudflare-readiness.json', 'redirectRuleStatus', 'CLOUDFLARE-READINESS', 'redirect rule must be active'));
  for (const host of REDIRECT_HOSTS) {
    const dns = (input.dns ?? []).find((record) => record.hostname === host);
    if (!dns || dns.proxied !== true || dns.status !== 'active') errors.push(diagnostic('cloudflare-readiness.json', `dns.${host}`, 'CLOUDFLARE-READINESS', 'active proxied DNS is required'));
  }
  return errors;
}
export function validateDeploymentRecord(record, manifest) {
  const errors = [];
  const required = ['release', 'sourceCommit', 'cloudflareDeploymentId', 'artifactSha256', 'artifactFileManifestSha256', 'pagesDevFallbackUrl'];
  for (const field of required) if (typeof record[field] !== 'string' || !record[field]) errors.push(diagnostic('deployment-record.json', field, 'DEPLOYMENT-RECORD', 'is required'));
  if (!/^[a-f0-9]{40}$/i.test(record.sourceCommit ?? '')) errors.push(diagnostic('deployment-record.json', 'sourceCommit', 'DEPLOYMENT-RECORD', 'must be a full commit SHA'));
  if (!SHA256.test(record.artifactSha256 ?? '') || record.artifactSha256 !== manifest.artifactSha256) errors.push(diagnostic('deployment-record.json', 'artifactSha256', 'DEPLOYMENT-RECORD', 'must match validated artifact'));
  if (!SHA256.test(record.artifactFileManifestSha256 ?? '') || record.artifactFileManifestSha256 !== manifest.artifactFileManifestSha256) errors.push(diagnostic('deployment-record.json', 'artifactFileManifestSha256', 'DEPLOYMENT-RECORD', 'must match validated file manifest'));
  if (record.canonicalOrigin !== CANONICAL_ORIGIN) errors.push(diagnostic('deployment-record.json', 'canonicalOrigin', 'DEPLOYMENT-RECORD', 'must equal canonical apex'));
  if (!/^https:\/\/[^/]+\.pages\.dev\/?$/.test(record.pagesDevFallbackUrl ?? '')) errors.push(diagnostic('deployment-record.json', 'pagesDevFallbackUrl', 'DEPLOYMENT-RECORD', 'must be an HTTPS pages.dev deployment URL'));
  if (record.builtOnce !== true) errors.push(diagnostic('deployment-record.json', 'builtOnce', 'DEPLOYMENT-RECORD', 'must be true'));
  if (record.deployedVia !== 'cloudflare-pages-direct-upload') errors.push(diagnostic('deployment-record.json', 'deployedVia', 'DEPLOYMENT-RECORD', 'must identify Direct Upload'));
  return errors;
}

export function validateReleaseManifest(record, artifactManifest) {
  const errors = validateDeploymentRecord(record.deployment, artifactManifest);
  for (const field of ['version', 'publishedAt', 'repositoryTag', 'urlManifestSha256']) {
    if (typeof record[field] !== 'string' || !record[field]) errors.push(diagnostic('release-manifest.json', field, 'RELEASE-RECORD', 'is required'));
  }
  if (record.version !== record.deployment.release || record.repositoryTag !== record.version) errors.push(diagnostic('release-manifest.json', 'version', 'RELEASE-RECORD', 'release and immutable repository tag must agree'));
  if (!SHA256.test(record.urlManifestSha256 ?? '')) errors.push(diagnostic('release-manifest.json', 'urlManifestSha256', 'RELEASE-RECORD', 'must be SHA-256'));
  if (!Array.isArray(record.evidenceIds) || record.evidenceIds.length === 0) errors.push(diagnostic('release-manifest.json', 'evidenceIds', 'RELEASE-RECORD', 'at least one evidence identifier is required'));
  if (!Array.isArray(record.changes) || record.changes.length === 0) errors.push(diagnostic('release-manifest.json', 'changes', 'RELEASE-RECORD', 'classified changes are required'));
  return errors;
}

export function validateDeploymentWorkflow(workflowText, file = '.github/workflows/publication.yml', jobName = 'deploy') {
  const errors = [];
  const where = `jobs.${jobName}`;
  const deploy = jobBlock(workflowText, jobName);
  if (!deploy) return [diagnostic(file, where, 'BUILD-ONCE', 'deployment job is missing')];
  for (const pattern of [/npm\s+(?:ci|install)/i, /astro\s+(?:build|sync|check)/i, /npm\s+run\s+build/i, />\s*(?:website|site)\/dist|cp\s+.*(?:website|site)\/dist|mv\s+.*(?:website|site)\/dist/i]) {
    if (pattern.test(deploy)) errors.push(diagnostic(file, where, 'BUILD-ONCE', `forbidden deployment operation: ${pattern}`));
  }
  if (!/actions\/download-artifact@/.test(deploy)) errors.push(diagnostic(file, where, 'BUILD-ONCE', 'must download the retained artifact'));
  if (!/cloudflare\/wrangler-action@/.test(deploy) || !/pages deploy (?:website|site)\/dist/.test(deploy)) errors.push(diagnostic(file, where, 'DIRECT-UPLOAD', 'must invoke wrangler Pages Direct Upload'));
  if (!/publication\.mjs verify/.test(deploy)) errors.push(diagnostic(file, where, 'ARTIFACT-IDENTITY', 'must verify checksums immediately before upload'));
  return errors;
}

/** The one release-version rule: RELEASE_VERSION, else the newest releases/<v>/release-candidate.json. Never defaults to v0.1.0. The site build reads it through website/plugins/release-refs.mjs. */
export function resolveReleaseVersion(root = '.', env = process.env) {
  const fromEnv = env.RELEASE_VERSION?.trim();
  if (fromEnv) return fromEnv;
  const directory = join(root, 'releases');
  const versions = existsSync(directory) ? readdirSync(directory).filter((name) => /^v\d+\.\d+\.\d+(?:-[A-Za-z0-9.]+)?$/.test(name) && existsSync(join(directory, name, 'release-candidate.json'))) : [];
  const parts = (version) => version.slice(1).split(/[.-]/).map((part) => Number(part) || 0);
  const newest = versions.sort((a, b) => { const pa = parts(a); const pb = parts(b); for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pb[i] - pa[i]; return 0; })[0];
  if (!newest) throw new Error('resolveReleaseVersion: set RELEASE_VERSION or add releases/<version>/release-candidate.json');
  return JSON.parse(readFileSync(join(directory, newest, 'release-candidate.json'), 'utf8')).version ?? newest;
}

/** GitHub Actions tag filter semantics for the characters we use: * (no slash), ** (anything), ? and + (as in a regular expression), [] classes. */
export function tagPatternMatches(pattern, tag) {
  let source = '';
  for (let index = 0; index < pattern.length; index++) {
    const character = pattern[index];
    if (character === '*') {
      if (pattern[index + 1] === '*') { source += '.*'; index++; } else source += '[^/]*';
    } else if (character === '?' || character === '+') source += character;
    else if (character === '[') {
      const end = pattern.indexOf(']', index);
      if (end < 0) return false;
      source += pattern.slice(index, end + 1);
      index = end;
    } else source += character.replace(/[.\\^$(){}|]/g, '\\$&');
  }
  return new RegExp(`^${source}$`).test(tag);
}
/** Ordered include/!-exclude evaluation: the last matching pattern decides. */
export function tagTriggers(patterns, tag) {
  let triggers = false;
  for (const pattern of patterns) {
    if (pattern.startsWith('!')) { if (tagPatternMatches(pattern.slice(1), tag)) triggers = false; }
    else if (tagPatternMatches(pattern, tag)) triggers = true;
  }
  return triggers;
}
function jobBlock(text, name) {
  return text.match(new RegExp(`\\n  ${name}:[\\s\\S]*?(?=\\n  [a-zA-Z][\\w-]*:|$)`))?.[0] ?? '';
}
function workflowList(text, key) {
  const flow = text.match(new RegExp(`\\n\\s+${key}:[ \\t]*\\[([^\\n]*)\\][ \\t]*(?=\\n|$)`))?.[1];
  const raw = flow ?? text.match(new RegExp(`\\n\\s+${key}:[ \\t]*((?:\\n\\s+- [^\\n]+)+)`))?.[1] ?? '';
  return raw.split(flow === undefined ? /\n/ : /,/).map((item) => item.replace(/^\s*-\s*/, '').trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
}
/** Reads a single-line flow list up to the last ] on its line (character classes contain ]), or a block list. */
export function workflowTagPatterns(text) {
  return workflowList(text, 'tags');
}
function jobNeeds(block) {
  const match = block.match(/\n    needs:[ \t]*([^\n]*)((?:\n      - [^\n]+)*)/);
  if (!match) return [];
  return `${match[1]},${match[2].replace(/\n\s+- /g, ',')}`.replace(/[\[\]]/g, '').split(',').map((item) => item.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
}
function jobGate(block) {
  const condition = (block.match(/\n    if:[ \t]*([^\n]+)/)?.[1] ?? '').replace(/\$\{\{|\}\}/g, '').replace(/\s+/g, '');
  return /^needs\.plan\.outputs\.mode==['"]?preview['"]?$/.test(condition) ? 'preview' : /^needs\.plan\.outputs\.mode==['"]?production['"]?$/.test(condition) ? 'production' : 'other';
}
const artifactName = (output) => new RegExp(`^\\$\\{\\{\\s*needs\\.plan\\.outputs\\.${output}\\s*\\}\\}$`);

/** The release workflow: the properties the policy gate requires of it. */
export function validateReleaseWorkflow(text, file = '.github/workflows/release.yml') {
  const errors = [];
  const fail = (field, check, message) => errors.push(diagnostic(file, field, check, message));
  const patterns = workflowTagPatterns(text);
  if (!patterns.length) fail('on.push.tags', 'RELEASE-WORKFLOW', 'tag triggers are required');
  for (const tag of ['v0.2.0', 'v0.2.0-rc.1']) if (!tagTriggers(patterns, tag)) fail('on.push.tags', 'RELEASE-WORKFLOW', `no tag pattern triggers ${tag}`);
  if (tagTriggers(patterns, 'v0.1.0')) fail('on.push.tags', 'RELEASE-WORKFLOW', 'the tag patterns match the frozen v0.1.0 tag; add a !v0.1.0 filter');
  if (/v0\.1\.0/.test(text.replace(/!v0\.1\.0/g, ''))) fail('release', 'RELEASE-WORKFLOW', 'v0.1.0 may appear only inside the !v0.1.0 filter');
  if (!workflowList(text, 'branches').includes('v0.2.0-showcase')) fail('on.push.branches', 'RELEASE-WORKFLOW', 'the preview trigger on branch v0.2.0-showcase is required');
  if (!/^permissions:\s*\n\s+contents:\s*read\s*$/m.test(text)) fail('permissions', 'RELEASE-WORKFLOW', 'top-level permissions must be contents: read');
  if (!/L2C_BOUNDARY_PATTERN:\s*\$\{\{\s*secrets\.L2C_BOUNDARY_PATTERN\s*\}\}/.test(text)) fail('env', 'RELEASE-WORKFLOW', 'L2C_BOUNDARY_PATTERN must be mapped from the secret of the same name');
  for (const secret of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_ZONE_ID']) if (!new RegExp(`secrets\\.${secret}\\b`).test(text)) fail('secrets', 'RELEASE-WORKFLOW', `secrets.${secret} must be used`);
  const plan = jobBlock(text, 'plan');
  if (!/\n    outputs:\s*\n(?:\s+[a-z]+:[^\n]*\n)*?\s+version:/.test(`${plan}\n`)) fail('jobs.plan', 'RELEASE-WORKFLOW', 'the plan job must output the release version');
  if (!plan) fail('jobs.plan', 'RELEASE-WORKFLOW', 'the plan job is missing');
  const build = jobBlock(text, 'build-once');
  if (!build) fail('jobs.build-once', 'BUILD-ONCE', 'the build-once job is missing');
  else {
    if (!/fetch-depth:\s*0/.test(build)) fail('jobs.build-once', 'RELEASE-WORKFLOW', 'checkout needs fetch-depth: 0 for the history scan');
    if (!jobNeeds(build).includes('plan')) fail('jobs.build-once', 'BUILD-ONCE', 'build-once must need plan');
    if (!/npm run validate(?![:\w-])/.test(build)) fail('jobs.build-once', 'RELEASE-WORKFLOW', 'the full npm run validate chain is required');
    const artifact = build.match(/actions\/upload-artifact@[\s\S]*?\bname:\s*([^\n]+)/)?.[1] ?? '';
    if (!artifactName('artifact-name').test(artifact.trim())) fail('jobs.build-once', 'BUILD-ONCE', 'the retained artifact name must be ${{ needs.plan.outputs.artifact-name }} (validated-site-<version>-<sha> from the plan job)');
  }
  for (const [index, step] of [...text.matchAll(/actions\/checkout@[^\n]*\n([\s\S]*?)(?=\n      - |\n  [a-zA-Z]|$)/g)].entries()) if (!/fetch-depth:\s*0/.test(step[1])) fail('jobs', 'RELEASE-WORKFLOW', `checkout step ${index + 1} needs fetch-depth: 0`);
  for (const name of ['CLOUDFLARE_PAGES_PROJECT', 'CLOUDFLARE_CUSTOM_DOMAIN_ID', 'CLOUDFLARE_REDIRECT_LIST_ID', 'CLOUDFLARE_REDIRECT_RULE_ID']) if (!new RegExp(`vars\\.${name}\\b`).test(text)) fail('vars', 'RELEASE-WORKFLOW', `vars.${name} must be used as in publication.yml`);
  const preview = jobBlock(text, 'deploy-preview');
  const production = jobBlock(text, 'deploy');
  errors.push(...validateDeploymentWorkflow(text, file, 'deploy-preview'), ...validateDeploymentWorkflow(text, file, 'deploy'));
  for (const [name, block] of [['deploy-preview', preview], ['deploy', production]]) {
    if (block && jobGate(block) !== (name === 'deploy' ? 'production' : 'preview')) fail(`jobs.${name}`, 'RELEASE-WORKFLOW', `${name} must be gated on the plan mode output (${name === 'deploy' ? "== 'production'" : "== 'preview'"})`);
    if (block && !jobNeeds(block).includes('build-once')) fail(`jobs.${name}`, 'BUILD-ONCE', `${name} must need build-once`);
  }
  const count = (block, needle) => block.split(needle).length - 1;
  if (count(text, '--branch=preview') !== count(preview, '--branch=preview') || !count(preview, '--branch=preview')) fail('jobs.deploy-preview', 'DIRECT-UPLOAD', '--branch=preview must appear only in deploy-preview, and there it is required');
  if (count(text, '--branch=main') !== count(production, '--branch=main') || !count(production, '--branch=main')) fail('jobs.deploy', 'DIRECT-UPLOAD', '--branch=main must appear only in deploy, and there it is required');
  for (const script of ['generate-release-record.mjs', 'update-recovery-index.mjs']) {
    if (count(text, script) !== count(production, script)) fail('jobs.deploy-preview', 'RELEASE-WORKFLOW', `${script} belongs to the production job only`);
    if (!production.includes(script)) fail('jobs.deploy', 'RELEASE-WORKFLOW', `${script} must run in the deploy job`);
  }
  const post = jobBlock(text, 'post-deploy-release-checks');
  const releaseRecord = production.match(/actions\/upload-artifact@[\s\S]*?\bname:\s*([^\n]+)/)?.[1] ?? '';
  if (!artifactName('record-artifact-name').test(releaseRecord.trim())) fail('jobs.deploy', 'RELEASE-WORKFLOW', 'the release record artifact name must be ${{ needs.plan.outputs.record-artifact-name }} (release-record-<version>-<sha> from the plan job)');
  if (!jobNeeds(post).includes('deploy') || !/check-public-release\.mjs/.test(post)) fail('jobs.post-deploy-release-checks', 'RELEASE-WORKFLOW', 'a post-deploy job that needs deploy and runs check-public-release.mjs is required');
  return errors;
}

/** publication.yml stays frozen for v0.1.0: its tag trigger and every checkout are pinned to that tag. */
export function validateFrozenPublicationWorkflow(text, file = '.github/workflows/publication.yml') {
  const errors = [];
  if (workflowTagPatterns(text).join('|') !== 'v0.1.0') errors.push(diagnostic(file, 'on.push.tags', 'FROZEN-RELEASE', 'the tag trigger must be exactly v0.1.0'));
  const checkouts = text.split(/\n      - /).filter((step) => step.startsWith('uses: actions/checkout@'));
  if (!checkouts.length || checkouts.some((step) => !/\bref:\s*(?:refs\/tags\/)?v0\.1\.0(?=\s*(?:[,}]|$))/m.test(step))) errors.push(diagnostic(file, 'jobs', 'FROZEN-RELEASE', 'every checkout must be pinned with ref: v0.1.0 so a manual dispatch cannot deploy another revision'));
  return errors;
}
function printErrors(errors) {
  if (errors.length) {
    console.error(errors.map((error) => `ERROR: ${error}`).join('\n'));
    process.exitCode = 1;
  }
  return errors.length === 0;
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'manifest') {
    const [directory, output] = args;
    const manifest = createArtifactManifest(directory);
    writeFileSync(output, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`Artifact manifest written: ${output}\nartifactSha256=${manifest.artifactSha256}\nartifactFileManifestSha256=${manifest.artifactFileManifestSha256}`);
  } else if (command === 'verify') {
    const [directory, input] = args;
    const manifest = JSON.parse(readFileSync(input, 'utf8'));
    if (printErrors(verifyArtifactManifest(directory, manifest))) console.log('Retained site artifact identity verified.');
  } else if (command === 'built-output') {
    if (printErrors(validateBuiltOutput(args[0]))) console.log('Built HTML, links, canonical metadata, sitemap, feed, and URL manifest are valid.');
  } else if (command === 'policy') {
    const root = resolve(args[0] ?? '.');
    const policy = JSON.parse(readFileSync(join(root, 'website/infrastructure/cloudflare/hostname-redirects.v1.json'), 'utf8'));
    const policySourceFiles = [
      ...filesUnder(join(root, 'website/src')),
      ...filesUnder(join(root, 'website/plugins')),
    ].filter((file) => /\.(?:astro|css|mjs|ts)$/.test(file));
    const packageManifest = JSON.parse(readFileSync(join(root, 'website/package.json'), 'utf8'));
    const astroConfig = readFileSync(join(root, 'website/astro.config.mjs'), 'utf8');
    const errors = [
      ...validateCanonicalConfig(astroConfig),
      ...validateHostnamePolicy(policy),
      ...validateDeploymentWorkflow(readFileSync(join(root, '.github/workflows/publication.yml'), 'utf8')),
      ...validateFrontendPolicy(packageManifest, astroConfig, policySourceFiles.map((file) => ({
        path: relative(root, file).replaceAll('\\', '/'), text: readFileSync(file, 'utf8'),
      }))),
    ];
    for (const file of filesUnder(join(root, 'website/src/content/redirects'))) {
      const text = readFileSync(file, 'utf8');
      if (REDIRECT_HOSTS.some((host) => text.includes(host))) errors.push(diagnostic(relative(root, file), 'hostname', 'REDIRECT-POLICY', 'hostname rules must remain outside content redirects'));
    }
    const requireRelease = args.includes('--require-release-workflow') || process.env.CI === 'true';
    const releasePath = join(root, '.github/workflows/release.yml');
    const releaseErrors = existsSync(releasePath)
      ? validateReleaseWorkflow(readFileSync(releasePath, 'utf8'))
      : [diagnostic('.github/workflows/release.yml', 'file', 'RELEASE-WORKFLOW', 'the release workflow is missing')];
    const frozenErrors = validateFrozenPublicationWorkflow(readFileSync(join(root, '.github/workflows/publication.yml'), 'utf8'));
    if (requireRelease) errors.push(...releaseErrors, ...frozenErrors);
    else for (const message of [...releaseErrors, ...frozenErrors]) console.error(`WARNING: ${message}`);
    if (printErrors(errors)) console.log('Canonical, Cloudflare redirect, and build-once deployment policies are valid.');
  } else if (command === 'cloudflare-readiness') {
    const input = JSON.parse(readFileSync(args[0], 'utf8'));
    if (printErrors(validateCloudflareReadiness(input))) console.log('Cloudflare identifiers, DNS, certificate, and rule readiness are valid.');
  } else if (command === 'release-version') {
    try {
      console.log(resolveReleaseVersion(resolve(args[0] ?? '.')));
    } catch (error) {
      console.error(`ERROR: ${error.message}`);
      process.exitCode = 1;
    }
  } else if (command === 'boundary') {
    const historyAt = args.indexOf('--history');
    const history = historyAt >= 0 ? args[historyAt + 1] : undefined;
    if (historyAt >= 0 && (!history || history.startsWith('--'))) {
      console.error('Usage: publication.mjs boundary <root> [--require] [--history <ref>]');
      process.exitCode = 2;
    } else {
      const root = resolve(args[0] && !args[0].startsWith('--') ? args[0] : '.');
      const result = runBoundaryScan({ root, require: args.includes('--require'), history });
      for (const line of result.stdout) console.log(line);
      for (const line of result.stderr) console.error(line);
      process.exitCode = result.exitCode;
    }
  } else {
    console.error('Usage: publication.mjs manifest <dist> <output> | verify <dist> <manifest> | built-output <dist> | policy <root> | cloudflare-readiness <input> | boundary <root> [--require] [--history <ref>] | release-version [<root>]');
    process.exitCode = 2;
  }
}
