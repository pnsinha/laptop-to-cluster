export type TokenMap = Record<string, string>;
export interface ThemeBlocks { light: TokenMap; dark: TokenMap; darkMedia: TokenMap; print: TokenMap; forced: TokenMap }
export type PairState = 'rest' | 'hover' | 'focus-visible' | 'selected' | 'visited';
export interface Pair { fg: string; bg: string; min: number; use: string; state: PairState }
export type Rgb = [number, number, number];

const TEXT = 4.5;
const UI = 3;
const SURFACES = ['canvas', 'surface', 'raised'] as const;
const CONCEPT_KEYS = ['step', 'gate', 'scratch', 'net'] as const;
export const ALIAS_LITERALS = { 'text-base': '1rem', 'text-supporting': '.875rem', 'leading-base': '1.45' } as const;

interface CssNode { prelude: string; body: string; children: CssNode[] }

function parseNodes(css: string): CssNode[] {
  const nodes: CssNode[] = [];
  let index = 0;
  while (index < css.length) {
    const open = css.indexOf('{', index);
    if (open < 0) break;
    const head = css.slice(index, open);
    const prelude = head.slice(Math.max(head.lastIndexOf(';'), head.lastIndexOf('}')) + 1).trim();
    let depth = 1;
    let cursor = open + 1;
    while (cursor < css.length && depth > 0) {
      if (css[cursor] === '{') depth += 1;
      else if (css[cursor] === '}') depth -= 1;
      cursor += 1;
    }
    const body = css.slice(open + 1, cursor - 1);
    nodes.push({ prelude, body, children: prelude.startsWith('@') && body.includes('{') ? parseNodes(body) : [] });
    index = cursor;
  }
  return nodes;
}

const declarations = (body: string): TokenMap => {
  const map: TokenMap = {};
  for (const match of body.matchAll(/(--[\w-]+|color-scheme)\s*:\s*([^;}]+)/g)) map[match[1].replace(/^--/, '')] = match[2].trim().toLowerCase();
  return map;
};

/** Split a stylesheet into the theme blocks the design system defines. Quotes in attribute selectors are optional (minified output drops them). */
export function parseThemeBlocks(css: string): ThemeBlocks {
  const blocks: ThemeBlocks = { light: {}, dark: {}, darkMedia: {}, print: {}, forced: {} };
  const walk = (nodes: CssNode[], media: string) => {
    for (const node of nodes) {
      if (node.children.length) { walk(node.children, `${media} ${node.prelude}`); continue; }
      if (node.prelude.startsWith('@')) continue;
      const decl = declarations(node.body);
      for (const selector of node.prelude.split(',').map((part) => part.trim())) {
        if (!selector.startsWith(':root')) continue;
        if (/forced-colors/.test(media)) Object.assign(blocks.forced, decl);
        else if (/\bprint\b/.test(media)) Object.assign(blocks.print, decl);
        else if (/\[data-theme=("?)dark\1\]/.test(selector)) Object.assign(blocks.dark, decl);
        else if (/prefers-color-scheme:\s*dark/.test(media) && /:not\(\[data-theme=("?)light\1\]\)/.test(selector)) Object.assign(blocks.darkMedia, decl);
        else if (selector === ':root' && !/@media/.test(media)) Object.assign(blocks.light, decl);
        else if (/\[data-theme=("?)light\1\]/.test(selector) && !/@media/.test(media)) blocks.light['color-scheme:light'] = decl['color-scheme'] ?? '';
      }
    }
  };
  walk(parseNodes(css.replace(/\/\*[\s\S]*?\*\//g, '')), '');
  return blocks;
}

export function parseColor(value: string): Rgb {
  const text = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(text)) return [1, 3, 5].map((offset) => Number.parseInt(text.slice(offset, offset + 2), 16)) as Rgb;
  if (/^#[0-9a-f]{3}$/i.test(text)) return [...text.slice(1)].map((digit) => Number.parseInt(digit + digit, 16)) as Rgb;
  const channels = text.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  if (text.startsWith('rgb') && channels?.length === 3) return channels as Rgb;
  throw new Error(`Unsupported colour: ${value}`);
}
export const relativeLuminance = (color: Rgb): number => color.map((channel) => {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(parseColor(a)), relativeLuminance(parseColor(b))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** The pair list: a port of assets/contrast_check.py, with the interactive states tagged. `--link-visited` is checked only when a theme declares it. */
export function buildPairs(tokens: TokenMap): Pair[] {
  const pairs: Pair[] = [];
  const add = (fg: string, bg: string, min: number, use: string, state: PairState = 'rest') => pairs.push({ fg, bg, min, use, state });
  for (const bg of SURFACES) {
    add('text', bg, TEXT, 'body text and code');
    add('muted', bg, TEXT, 'captions, tagline, line numbers');
    add('primary', bg, TEXT, 'links, headings, wordmark');
    add('accent', bg, TEXT, 'eyebrows and kickers');
    add('border', bg, UI, 'control and badge outlines');
    add('focus', bg, UI, 'focus ring', 'focus-visible');
    add('primary-hover', bg, TEXT, 'link text on hover', 'hover');
    if ('link-visited' in tokens) add('link-visited', bg, TEXT, 'visited link text', 'visited');
  }
  add('primary', 'canvas', UI, 'primary button fill against the page');
  add('on-primary', 'primary', TEXT, 'primary button label');
  add('on-primary', 'primary-hover', TEXT, 'primary button label on hover', 'hover');
  add('on-primary', 'primary', TEXT, 'selected theme choice', 'selected');
  for (const status of ['warning', 'danger', 'success']) {
    add(status, `${status}-surface`, TEXT, `${status} label in its callout`);
    add('text', `${status}-surface`, TEXT, `body text in the ${status} callout`);
    add(status, 'canvas', TEXT, `${status} text on the page`);
  }
  for (const key of CONCEPT_KEYS) {
    add(`c-${key}`, `c-${key}-bg`, TEXT, `${key}: concept chip text on its tint`);
    add(`c-${key}`, `c-${key}-bg`, TEXT, `${key}: selected term in the crosswalk legend`, 'selected');
    add('text', `c-${key}-bg`, TEXT, `${key}: code text on a tagged line`);
    add('muted', `c-${key}-bg`, TEXT, `${key}: line number on a tagged line`);
    add(`c-${key}`, 'canvas', UI, `${key}: timeline bar and marker on the page`);
    add(`c-${key}`, 'surface', UI, `${key}: line rule and gutter shape beside code`);
    add(`c-${key}`, 'canvas', TEXT, `${key}: concept words in prose and the legend`);
  }
  for (const [a, b] of [['scratch', 'step'], ['net', 'step'], ['step', 'scratch'], ['step', 'net']]) {
    add(`c-${a}`, `c-${b}-bg`, UI, `${a} shape on a line tinted for ${b}`);
  }
  return pairs;
}

export const pairTokenNames = (tokens: TokenMap = {}): string[] =>
  [...new Set(buildPairs(tokens).flatMap(({ fg, bg }) => [fg, bg]))].sort();

/** Audit one resolved token map. `restraint` enforces the scanner rule that decorative borders stay below 4.5:1 on the surface. */
export function auditTokenMap(tokens: TokenMap, label: string, options: { restraint?: boolean } = {}): string[] {
  const issues: string[] = [];
  const missing = new Set<string>();
  for (const { fg, bg, min, use, state } of buildPairs(tokens)) {
    if (!(fg in tokens) || !(bg in tokens)) { for (const name of [fg, bg]) if (!(name in tokens)) missing.add(name); continue; }
    const ratio = contrastRatio(tokens[fg], tokens[bg]);
    if (ratio < min) issues.push(`${label}: --${fg} on --${bg} is ${ratio.toFixed(2)}:1, below ${min}:1 (${state}; ${use})`);
  }
  for (const name of [...missing].sort()) issues.push(`${label}: token --${name} is not defined`);
  if (options.restraint !== false && tokens.border && tokens.surface) {
    const ratio = contrastRatio(tokens.border, tokens.surface);
    if (ratio < 1.5 || ratio >= 4.5) issues.push(`${label}: --border on --surface is ${ratio.toFixed(2)}:1, outside the 1.5:1 to 4.5:1 restraint band`);
  }
  return issues;
}

const normalise = (value: string | undefined) => (value ?? '').trim().toLowerCase().replace(/^0\./, '.');

/** Audit a stylesheet's theme blocks: pairs, dark parity, compatibility aliases. */
export function auditTokens(css: string): string[] {
  const blocks = parseThemeBlocks(css);
  const issues: string[] = [];
  for (const name of ['light', 'dark', 'darkMedia', 'print'] as const) {
    if (!Object.keys(blocks[name]).length) issues.push(`${name}: theme block is missing`);
  }
  if (issues.length) return issues;
  issues.push(...auditTokenMap(blocks.light, 'light'), ...auditTokenMap(blocks.dark, 'dark'), ...auditTokenMap(blocks.print, 'print', { restraint: false }));
  for (const key of Object.keys({ ...blocks.dark, ...blocks.darkMedia })) {
    if (key.startsWith('color-scheme')) continue;
    if (blocks.dark[key] !== blocks.darkMedia[key]) issues.push(`dark: --${key} differs between the data-theme block and the OS-preference block`);
  }
  for (const name of ['light', 'dark', 'darkMedia', 'print'] as const) {
    const block = blocks[name];
    for (const [alias, literal] of Object.entries(ALIAS_LITERALS)) {
      if (normalise(block[alias]) !== literal) issues.push(`${name}: --${alias} must be the literal ${literal}`);
    }
    if (block.shell !== block.canvas) issues.push(`${name}: --shell must equal --canvas`);
    if (block['shell-text'] !== block.text) issues.push(`${name}: --shell-text must equal --text`);
  }
  return issues;
}

/** Declared color-scheme per block, for the scanner's base-declaration check. */
export function declaredColorSchemes(css: string): { base: string; light: string; dark: string; darkMedia: string } {
  const blocks = parseThemeBlocks(css);
  return { base: blocks.light['color-scheme'] ?? '', light: blocks.light['color-scheme:light'] ?? '', dark: blocks.dark['color-scheme'] ?? '', darkMedia: blocks.darkMedia['color-scheme'] ?? '' };
}
