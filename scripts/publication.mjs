import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBoundaryScan } from './boundary.mjs';

export const CANONICAL_ORIGIN = 'https://laptop-to-cluster.org';
export const REDIRECT_HOSTS = Object.freeze([
  'www.laptop-to-cluster.org',
  'laptoptocluster.org',
  'laptop-to-cluster.pnsinha.com',
]);
const FORBIDDEN_ORIGIN = /https:\/\/(?:www\.laptop-to-cluster\.org|laptoptocluster\.org|laptop-to-cluster\.pnsinha\.com|[^/\s"'<>]+\.pages\.dev)/i;
const SHA256 = /^[a-f0-9]{64}$/;
// One matcher for the projection section, with or without modifier classes
// (for example applicability-projection--escalated). Used by composition checks and by tests.
export const PROJECTION_SECTION = /<section class="applicability-projection(?: [^"]*)?"/;
export const isProjectionSection = (html) => PROJECTION_SECTION.test(html);
export const EVIDENCE_ROW_LABELS = Object.freeze(['Tested', 'You need', 'Depends on your center']);
export const UNTESTED_HREF = '/adoption/evaluate/#not-tested';
const COMPOSITION_PROFILES = new Set([
  'landing', 'resources', 'learning-conceptual', 'learning-runnable', 'start', 'diagnostic',
  'milestone', 'release', 'about', 'support', 'accessibility', 'applicability', 'event', 'not-found',
  'adoption',
]);
const STANDARD_PROJECTION_CONSUMER = Object.freeze({
  landing: 'landing',
  'learning-runnable': 'runnable-module',
  milestone: 'milestone',
  release: 'release',
});
const CANONICAL_ONLY_PATTERN = /<dt>Submission ID<\/dt>|<dt>Container (?:image )?digest<\/dt>|<h2[^>]*>Result checks<\/h2>|<h2[^>]*>Evidence and integrity<\/h2>|<h2[^>]*>Provenance<\/h2>/i;

const occurrences = (text, pattern) => text.match(pattern)?.length ?? 0;
const stripTags = (value = '') => value.replace(/<[^>]+>/g, '').replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&#x27;', "'").replaceAll('&middot;', '·').replaceAll('&#183;', '·').replaceAll('&#xB7;', '·').replaceAll('&nbsp;', ' ').trim();
const standardProjectionBlocks = (html) => html.match(new RegExp(`${PROJECTION_SECTION.source}[\\s\\S]*?<\\/section>`, 'g')) ?? [];
const diagnosticProjectionBlocks = (html) => html.match(/<aside class="diagnostic-applicability"[\s\S]*?<\/aside>/g) ?? [];
const definitionValue = (html, label) => stripTags(html.match(new RegExp(`<dt>${label}<\\/dt><dd>([\\s\\S]*?)<\\/dd>`, 'i'))?.[1]);
/** ISO date from `<dd><time datetime="ISO">Long date</time></dd>` (the canonical page markup); falls back to the dd text, which must then be bare ISO. */
const definitionDate = (html, label) => html.match(new RegExp(`<dt>${label}<\\/dt><dd>\\s*<time[^>]*\\bdatetime="([^"]+)"`, 'i'))?.[1] ?? definitionValue(html, label);
const sectionList = (html, heading) => [...(html.match(new RegExp(`<h2[^>]*>${heading}<\\/h2><ul>([\\s\\S]*?)<\\/ul>`, 'i'))?.[1] ?? '').matchAll(/<li>([\s\S]*?)<\/li>/g)].map((match) => stripTags(match[1]));
const paragraphs = (html) => [...html.matchAll(/<p(\s[^>]*)?>([\s\S]*?)<\/p>/g)].map((match) => ({ classes: match[1]?.match(/class="([^"]*)"/)?.[1] ?? '', inner: match[2] }));
/** Parses `<dl class="evidence-rows">` into [{ label, items: [{ text, from }] }]; undefined when the list is absent. `from` comes from an optional data-from attribute on each <li>. */
export function evidenceRows(html) {
  const list = html.match(/<dl class="evidence-rows">([\s\S]*?)<\/dl>/)?.[1];
  if (list === undefined) return undefined;
  const rows = [...list.matchAll(/<div class="evidence-row">\s*<dt>([\s\S]*?)<\/dt>\s*<dd>\s*<ul>([\s\S]*?)<\/ul>\s*<\/dd>\s*<\/div>/g)].map((match) => ({
    label: stripTags(match[1]),
    items: [...match[2].matchAll(/<li(\s[^>]*)?>([\s\S]*?)<\/li>/g)].map((item) => ({
      text: stripTags(item[2]),
      from: item[1]?.match(/data-from="([^"]*)"/)?.[1]?.split(/\s+/).filter(Boolean) ?? [],
    })),
  }));
  return occurrences(list, /class="evidence-row"/g) === rows.length ? rows : undefined;
}
export function projectionShapeIssues(block) {
  const issues = [];
  const opening = block.slice(0, block.indexOf('>') + 1);
  const escalated = opening.includes('applicability-projection--escalated');
  const rest = block.slice(opening.length);
  if (/applicability-projection/.test(rest)) issues.push('inner classes must not contain applicability-projection');
  const details = rest.match(/<details[\s\S]*?<\/details>/g) ?? [];
  const outside = details.reduce((text, part) => text.replace(part, ''), rest);
  const outsideParagraphs = paragraphs(outside);
  const linkParagraph = outsideParagraphs[1];
  if (!linkParagraph || linkParagraph.classes !== 'evidence-link' || occurrences(linkParagraph.inner, /<a\s[^>]*href="\/applicability\/[^"]+\/"/g) !== 1) {
    issues.push('the second paragraph must be the single canonical-link paragraph (class evidence-link)');
  }
  const rows = evidenceRows(rest);
  if (!rows || rows.map((row) => row.label).join('|') !== EVIDENCE_ROW_LABELS.join('|') || rows.some((row) => row.items.length === 0)) {
    issues.push(`evidence rows must be exactly ${EVIDENCE_ROW_LABELS.join(' / ')} in order, each with at least one item`);
  }
  if (escalated) {
    if (details.length) issues.push('stale, failed and unvalidated projections must not use a disclosure');
    const badge = outsideParagraphs[0];
    if (!badge || badge.classes !== 'evidence-badge evidence-badge--warning' || !badge.inner.startsWith('<strong>Warning:</strong>')) {
      issues.push('an escalated projection starts with a warning badge (class evidence-badge evidence-badge--warning, label Warning:)');
    }
    const extra = outsideParagraphs[2];
    if (outsideParagraphs.length > 3 || outsideParagraphs.length < 2 || (extra && extra.classes !== 'evidence-untested')) {
      issues.push('an escalated projection permits only the badge, the canonical link, and an optional evidence-untested paragraph');
    }
  } else {
    const badge = outsideParagraphs[0];
    if (!badge || badge.classes !== 'evidence-badge') issues.push('a validated projection starts with the badge paragraph (class evidence-badge)');
    if (outsideParagraphs.length !== 2) issues.push('a validated projection has exactly two top-level paragraphs (badge and canonical link)');
    if (details.length !== 1 || !details[0].startsWith('<details class="evidence-panel">') || !/<summary>[^<]+<\/summary>/.test(details[0])) {
      issues.push('a validated projection has exactly one <details class="evidence-panel"> with a summary');
    } else {
      const untested = paragraphs(details[0].replace(/<dl class="evidence-rows">[\s\S]*?<\/dl>/, ''));
      if (untested.length !== 1 || untested[0].classes !== 'evidence-untested' || !untested[0].inner.includes(`href="${UNTESTED_HREF}"`)) {
        issues.push(`the panel ends with one evidence-untested paragraph linking to ${UNTESTED_HREF}`);
      }
      if (!details[0].includes('<dl class="evidence-rows">')) issues.push('the evidence rows belong inside the panel');
    }
  }
  return issues;
}

export function validatePageComposition(source, html) {
  const errors = [];
  const profile = html.match(/data-composition-profile="([^"]+)"/)?.[1];
  if (!profile || !COMPOSITION_PROFILES.has(profile)) {
    errors.push(diagnostic(source, 'composition', 'COMPOSITION-PROFILE', `known validated composition profile is required; received ${profile ?? '<missing>'}`));
    return errors;
  }

  const standard = standardProjectionBlocks(html);
  const diagnostics = diagnosticProjectionBlocks(html);
  const expectedConsumer = STANDARD_PROJECTION_CONSUMER[profile];
  if (expectedConsumer && standard.length !== 1) {
    errors.push(diagnostic(source, 'applicability', 'APPLICABILITY-OWNERSHIP', `profile ${profile} requires exactly one generated projection`));
  }
  if (!expectedConsumer && standard.length !== 0) {
    errors.push(diagnostic(source, 'applicability', 'APPLICABILITY-OWNERSHIP', `profile ${profile} forbids a standard applicability projection`));
  }
  if (profile === 'diagnostic') {
    if (diagnostics.length > 1) errors.push(diagnostic(source, 'applicability', 'DIAGNOSTIC-CONTEXT', 'diagnostic profile permits at most one typed context'));
  } else if (diagnostics.length) {
    errors.push(diagnostic(source, 'applicability', 'DIAGNOSTIC-CONTEXT', `profile ${profile} forbids diagnostic context`));
  }

  for (const block of standard) {
    const sourceId = block.match(/data-source-id="([^"]+)"/)?.[1];
    const projectionId = block.match(/data-projection-id="([^"]+)"/)?.[1];
    const links = [...block.matchAll(/href="(\/applicability\/([^"]+)\/)"/g)];
    if (!sourceId || projectionId !== `${expectedConsumer}:${sourceId}`) errors.push(diagnostic(source, 'projectionId', 'SOURCE-AGREEMENT', 'projection discriminator must match its profile consumer and source ID'));
    if (links.length !== 1 || links[0]?.[2] !== sourceId) errors.push(diagnostic(source, 'canonicalLink', 'SOURCE-AGREEMENT', 'exactly one canonical applicability link must match the source ID'));
    for (const issue of projectionShapeIssues(block)) errors.push(diagnostic(source, 'projection', 'PROJECTION-SHAPE', issue));
    const headerEnd = html.indexOf('</header>', html.indexOf('<header class="content-header">'));
    if (html.includes('<header class="content-header">') && html.indexOf(block) < headerEnd) {
      errors.push(diagnostic(source, 'projection', 'PROJECTION-SHAPE', 'the projection is placed after the content header'));
    }
    if (CANONICAL_ONLY_PATTERN.test(block)) errors.push(diagnostic(source, 'projection', 'CANONICAL-ONLY', 'concise projection leaked exhaustive applicability detail'));
  }
  for (const block of diagnostics) {
    const sourceId = block.match(/data-source-id="([^"]+)"/)?.[1];
    const projectionId = block.match(/data-projection-id="([^"]+)"/)?.[1];
    const linkId = block.match(/href="\/applicability\/([^"]+)\/"/)?.[1];
    if (!sourceId || !projectionId?.startsWith('diagnostic:') || linkId !== sourceId) errors.push(diagnostic(source, 'diagnostic', 'SOURCE-AGREEMENT', 'typed diagnostic projection ID, source ID, and canonical link must agree'));
    if (occurrences(block, /Relevant discriminator:/g) !== 1 || occurrences(block, /(?:environment|scheduler|runtime):/g) !== 1 || CANONICAL_ONLY_PATTERN.test(block)) {
      errors.push(diagnostic(source, 'diagnostic', 'DIAGNOSTIC-CONTEXT', 'diagnostic context must expose exactly one authorized discriminator and canonical link'));
    }
  }

  if (profile === 'applicability') {
    for (const label of ['Status', 'Environment', 'Environment role', 'Environment scope', 'Scheduler', 'Runtime', 'Workflow revision', 'Container image digest', 'Execution date', 'Validation date', 'Submission ID', 'Terminal result', 'Review after']) {
      if (!new RegExp(`<dt>${label}<\\/dt>`, 'i').test(html)) errors.push(diagnostic(source, label, 'EXHAUSTIVE-APPLICABILITY', 'canonical applicability field is required'));
    }
    for (const heading of ['Result checks', 'Assumptions', 'Limitations', 'Portability boundaries', 'Evidence and integrity', 'Provenance']) {
      if (!new RegExp(`<h2[^>]*>${heading}<\\/h2>`, 'i').test(html)) errors.push(diagnostic(source, heading, 'EXHAUSTIVE-APPLICABILITY', 'canonical applicability section is required'));
    }
  } else if (CANONICAL_ONLY_PATTERN.test(standard.concat(diagnostics).reduce((text, block) => text.replace(block, ''), html)) || /class="applicability-record"/.test(html)) {
    errors.push(diagnostic(source, 'applicability', 'CANONICAL-ONLY', 'exhaustive applicability detail leaked outside its canonical route'));
  }

  const contentHeader = html.match(/<header class="content-header">([\s\S]*?)<\/header>/)?.[1] ?? '';
  if (/<dt>|Applicable release|Last reviewed|<strong>(?:Status|Milestone):<\/strong>/i.test(contentHeader)) {
    errors.push(diagnostic(source, 'contentHeader', 'CONTENT-HEADER', 'routine metadata is forbidden in the direct title and summary header'));
  }
  if (profile !== 'support' && /class="support-state/.test(html)) errors.push(diagnostic(source, 'support', 'SUPPORT-STATE', 'support state is allowed only on the support profile'));
  if (/class="support-state(?![^>]*(?:degraded|unavailable))/.test(html)) errors.push(diagnostic(source, 'support', 'SUPPORT-STATE', 'only an active degraded or unavailable state may render'));

  const details = html.match(/<details[\s\S]*?<\/details>/g) ?? [];
  if (details.some((block) => /Prerequisites|<strong>Warning:<\/strong>|applicability-projection|evidence-badge|Unvalidated content/i.test(block))) {
    errors.push(diagnostic(source, 'visibility', 'CRITICAL-VISIBILITY', 'prerequisites, warnings, validation state, and applicability scope cannot be hidden in a disclosure'));
  }
  const hiddenBlocks = [...html.matchAll(/<(section|aside|article)\b[^>]*(?:\shidden(?=[\s>=])|aria-hidden="true")[^>]*>([\s\S]*?)<\/\1>/gi)].map((match) => match[2]);
  if (hiddenBlocks.some((block) => /Prerequisites|<strong>Warning:<\/strong>|evidence-badge|applicability-projection/i.test(block))) {
    errors.push(diagnostic(source, 'visibility', 'CRITICAL-VISIBILITY', 'critical content cannot be hidden'));
  }

  if (profile === 'learning-runnable') {
    const procedure = html.indexOf('<h2 id="procedure">');
    const projection = html.search(PROJECTION_SECTION);
    if (procedure < 0 || projection < 0 || projection > procedure) {
      errors.push(diagnostic(source, 'procedure', 'SAFE-ORDERING', 'applicability and prerequisites must precede execution'));
    }
  }
  const sources = html.indexOf('class="sources-scope"');
  if (sources >= 0 && sources < html.lastIndexOf('</article>')) errors.push(diagnostic(source, 'sources', 'SOURCE-ORDERING', 'Sources and scope must follow substantive content'));

  if (profile === 'resources') {
    const cards = html.match(/<(?:article|a) class="(?:card )?(?:resource-card|resource-tile)"[^>]*>[\s\S]*?<\/(?:article|a)>/g) ?? [];
    if (!cards.length || cards.some((card) => /resource-card__metadata|<strong>(?:Keywords|Status|Milestone|Environment|Version):/i.test(card) || occurrences(card, /class="resource-(?:qualifier|tile__tag)"/g) > 1)) {
      errors.push(diagnostic(source, 'cards', 'RESOURCE-COMPOSITION', 'resource cards require a title, summary, and at most one choice-relevant qualifier without routine metadata'));
    }
  }

  if (profile === 'landing') {
    const figure = html.match(/<figure class="workflow-figure">([\s\S]*?)<\/figure>/)?.[1] ?? '';
    const labels = [...figure.matchAll(/<strong>([^<]+)<\/strong>/g)].map((match) => match[1]);
    if (!/<figcaption>[^<]+<\/figcaption>/.test(figure) || !/<ol>/.test(figure)
      || labels.join('|') !== 'Allocation|Coordinator|Readiness gate|Workers|Verification'
      || occurrences(figure, /<i aria-hidden="true">/g) !== 4
      || !/Verification<\/strong>\s?<span>[^<]*before success is recorded/.test(figure)) {
      errors.push(diagnostic(source, 'workflowFigure', 'WORKFLOW-SEMANTICS', 'captioned allocation-to-verification ordered semantics and hidden decorative connectors are required'));
    }
  }

  // Progressive-enhancement policy (2026-08-16): bounded inline scripts and small
  // client islands are permitted; canvas, autoplay, and marquee remain forbidden.
  if (/<canvas\b|autoplay|<marquee\b/i.test(html)) errors.push(diagnostic(source, 'html', 'TECHNOLOGY-EXCLUSION', 'canvas, autoplay, and marquee output are forbidden'));
  if (/(?:fonts\.(?:googleapis|gstatic)|use\.typekit\.net|<link[^>]+rel="preconnect"[^>]+font)/i.test(html)) errors.push(diagnostic(source, 'html', 'REMOTE-FONT', 'remote font references are forbidden'));
  return errors;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** '2026-07-25' -> 'Jul 2026' (en-US, UTC, no Intl dependency); undefined for anything else. */
export function formatMonthYear(isoDate) {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(isoDate ?? '');
  const month = Number(match?.[2]);
  return match && month >= 1 && month <= 12 ? `${MONTHS[month - 1]} ${match[1]}` : undefined;
}
/** The C1 badge text for a record status; undefined when a needed value is missing. */
export function evidenceBadgeText(status, environment, validationDate) {
  const when = formatMonthYear(validationDate);
  if (status === 'validated') return environment && when ? `Tested on ${environment} · ${when}` : undefined;
  if (status === 'stale') return environment && when ? `Review due: last tested on ${environment} · ${when}` : undefined;
  if (status === 'failed') return 'Last run failed: see the test record';
  if (status === 'unvalidated') return 'Not yet tested on a cluster';
  return undefined;
}
export const RELATED_EVIDENCE_HEADING = 'Related evidence';
const ROW_SOURCE = Object.freeze({ Tested: 'result.checks', 'You need': 'assumptions', 'Depends on your center': 'portability_boundaries' });
const TRACE_REF = /^(assumptions|portability_boundaries|limitations|result\.checks|related_evidence)(?:\.(\d+))?$/;
/** Items of the canonical page's related-evidence list (A7: `ul.related-evidence`, or the list under `#related-evidence`); never read from an h2. */
const relatedEvidenceItems = (html) => {
  const list = html.match(/<ul[^>]*class="[^"]*\brelated-evidence\b[^"]*"[^>]*>([\s\S]*?)<\/ul>/i)?.[1]
    ?? html.match(/id="related-evidence"[^>]*>[\s\S]*?<ul[^>]*>([\s\S]*?)<\/ul>/i)?.[1] ?? '';
  return [...list.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((match) => stripTags(match[1]));
};
const canonicalLists = (html) => ({
  'result.checks': sectionList(html, 'Result checks'),
  assumptions: sectionList(html, 'Assumptions'),
  limitations: sectionList(html, 'Limitations'),
  portability_boundaries: sectionList(html, 'Portability boundaries'),
  related_evidence: relatedEvidenceItems(html),
});
/** undefined when a data-from reference resolves on the canonical page, otherwise the reason. */
export const traceProblem = (ref, lists) => {
  const match = TRACE_REF.exec(ref);
  const list = match && lists[match[1]];
  if (!match || !list) return `traces to an unknown source ${ref}`;
  return (match[2] === undefined ? list.length === 0 : Number(match[2]) >= list.length) ? `traces to ${ref}, which is not on the canonical record page` : undefined;
};
export { canonicalLists };
/** Messages for rows that do not agree with the canonical record page. */
export function rowAgreementIssues(rows, lists) {
  const issues = [];
  for (const row of rows ?? []) {
    const traced = row.items.filter((item) => item.from.length);
    if (traced.length && traced.length !== row.items.length) {
      issues.push(`row "${row.label}" mixes traced and literal items`);
      continue;
    }
    if (!traced.length) {
      const expected = lists[ROW_SOURCE[row.label]] ?? [];
      if (row.items.map((item) => item.text).join('\n') !== expected.join('\n')) issues.push(`row "${row.label}" must list the record's ${ROW_SOURCE[row.label]} exactly when it has no traces`);
      continue;
    }
    for (const item of traced) {
      if (!item.text) issues.push(`row "${row.label}" has an empty traced item`);
      for (const ref of item.from) {
        const problem = traceProblem(ref, lists);
        if (problem) issues.push(`row "${row.label}" ${problem}`);
      }
    }
  }
  return issues;
}
export function validateProjectionSourceAgreement(source, projectionHtml, canonicalSource, canonicalHtml) {
  const errors = [];
  const sourceId = projectionHtml.match(/data-source-id="([^"]+)"/)?.[1];
  const canonicalId = canonicalHtml.match(/class="applicability-record" data-source-id="([^"]+)"/)?.[1];
  if (!sourceId || sourceId !== canonicalId || canonicalSource !== `/applicability/${sourceId}/`) {
    errors.push(diagnostic(source, 'sourceId', 'SOURCE-AGREEMENT', 'projection source ID must resolve to the matching canonical applicability route'));
    return errors;
  }
  const status = definitionValue(canonicalHtml, 'Status');
  const environment = definitionValue(canonicalHtml, 'Environment');
  const validationDate = definitionDate(canonicalHtml, 'Validation date');
  const linkId = projectionHtml.match(/href="\/applicability\/([^"]+)\/"/)?.[1];
  if (linkId !== sourceId) errors.push(diagnostic(source, 'canonicalLink', 'SOURCE-AGREEMENT', 'projection canonical link must match the source ID'));
  const escalated = projectionHtml.slice(0, projectionHtml.indexOf('>')).includes('applicability-projection--escalated');
  if (escalated !== (status !== 'validated')) errors.push(diagnostic(source, 'projection', 'SOURCE-AGREEMENT', `a ${status || '<missing>'} record ${status === 'validated' ? 'must not render' : 'must render'} the escalated projection`));
  const expectedBadge = evidenceBadgeText(status, environment, validationDate);
  const badge = paragraphs(projectionHtml).find((paragraph) => /(?:^|\s)evidence-badge(?:\s|$)/.test(paragraph.classes));
  const badgeText = badge ? stripTags(badge.inner).replace(/^Warning:\s*/, '') : undefined;
  if (!expectedBadge || badgeText !== expectedBadge) {
    errors.push(diagnostic(source, 'badge', 'SOURCE-AGREEMENT', 'badge text must be generated from the record status, environment public name and validation month'));
  }
  for (const issue of rowAgreementIssues(evidenceRows(projectionHtml), canonicalLists(canonicalHtml))) errors.push(diagnostic(source, 'rows', 'SOURCE-AGREEMENT', issue));
  return errors;
}

export function validateFrontendPolicy(manifest, astroConfig, sourceEntries = []) {
  const errors = [];
  const expectedDependencies = { '@astrojs/sitemap': '3.7.3', astro: '7.1.3' };
  if (JSON.stringify(manifest.dependencies ?? {}) !== JSON.stringify(expectedDependencies)) {
    errors.push(diagnostic('package.json', 'dependencies', 'DEPENDENCY-EXCLUSION', 'production dependencies must remain the pinned Astro and sitemap closed set'));
  }
  const integrations = astroConfig.match(/integrations\s*:\s*\[([^\]]*)\]/s)?.[1]?.replace(/\s/g, '');
  if (!/^sitemap\(\),canonicalPolicy\(\)(?:,accessibleTables\(\))?$/.test(integrations ?? '')) errors.push(diagnostic('site/astro.config.mjs', 'integrations', 'INTEGRATION-EXCLUSION', 'only sitemap and the repository-owned canonical policy and accessible tables integrations are allowed'));
  if (/ViewTransitions|adapter|server\s*:|session|auth/i.test(astroConfig)) errors.push(diagnostic('site/astro.config.mjs', 'configuration', 'TECHNOLOGY-EXCLUSION', 'view transitions, adapters, server state, sessions, and authentication are forbidden'));
  for (const { path, text } of sourceEntries) {
    if (/@font-face|@import\s+url|fonts\.(?:googleapis|gstatic)|use\.typekit\.net/i.test(text)) errors.push(diagnostic(path, 'font', 'REMOTE-FONT', 'system font stacks only; remote and bundled font declarations are forbidden'));
    if (/@keyframes|animation-name\s*:|animation\s*:|transition\s*:|scroll-timeline|parallax|autoplay|from\s+['"](?:react|vue|svelte|@astrojs\/(?:react|vue|svelte))['"]/i.test(text)) {
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
    errors.push(diagnostic('site/dist', 'artifactSha256', 'ARTIFACT-IDENTITY', `expected ${expected.artifactSha256}, received ${actual.artifactSha256}`));
  }
  if (expected.artifactFileManifestSha256 !== actual.artifactFileManifestSha256) {
    errors.push(diagnostic('site/dist', 'artifactFileManifestSha256', 'ARTIFACT-IDENTITY', `expected ${expected.artifactFileManifestSha256}, received ${actual.artifactFileManifestSha256}`));
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
    errors.push(diagnostic('site/astro.config.mjs', 'site', 'CANONICAL-CONFIG', `must contain exactly literal site: '${CANONICAL_ORIGIN}'`));
  }
  if (/\bbase\s*:/.test(configText)) errors.push(diagnostic('site/astro.config.mjs', 'base', 'CANONICAL-CONFIG', 'production base paths are forbidden'));
  if (/process\.env|import\.meta\.env|loadEnv/.test(configText)) {
    errors.push(diagnostic('site/astro.config.mjs', 'site', 'CANONICAL-CONFIG', 'environment substitution is forbidden'));
  }
  return errors;
}

export const recordSummaryBlocks = (html) => html.match(/<section class="record-summary"[\s\S]*?<\/section>/g) ?? [];

/** Facts read from every built canonical applicability page: { byId: Map, errors }. */
export function collectApplicabilityFacts(builtPages) {
  const errors = [];
  const byId = new Map();
  for (const page of builtPages.filter(({ html }) => html.includes('data-composition-profile="applicability"'))) {
    const sourceId = page.html.match(/class="applicability-record" data-source-id="([^"]+)"/)?.[1];
    if (!sourceId || page.source !== `/applicability/${sourceId}/`) {
      errors.push(diagnostic(page.source, 'sourceId', 'SOURCE-AGREEMENT', 'canonical applicability route and source ID must agree'));
      continue;
    }
    const scheduler = definitionValue(page.html, 'Scheduler');
    const runtime = definitionValue(page.html, 'Runtime');
    byId.set(sourceId, {
      sourceId,
      canonicalSource: page.source,
      canonicalHtml: page.html,
      environment: definitionValue(page.html, 'Environment'),
      status: definitionValue(page.html, 'Status'),
      schedulerFamily: scheduler.split(' ')[0],
      schedulerVersion: scheduler.slice(scheduler.indexOf(' ') + 1),
      runtimeName: runtime.split(' ')[0],
      runtimeVersion: runtime.slice(runtime.indexOf(' ') + 1),
      executionDate: definitionValue(page.html, 'Execution date'),
      validationDate: definitionValue(page.html, 'Validation date'),
      validationDateIso: definitionDate(page.html, 'Validation date'),
      submissionId: definitionValue(page.html, 'Submission ID'),
      boundary: sectionList(page.html, 'Portability boundaries')[0],
      checks: sectionList(page.html, 'Result checks'),
      evidenceId: stripTags(page.html.match(/<h2[^>]*>Evidence and integrity<\/h2><p><a[^>]*>([^<]+)<\/a>/i)?.[1]),
      integrity: page.html.match(/sha256:[a-f0-9]{64}/i)?.[0],
    });
  }
  return { byId, errors };
}

/** Messages for one RecordSummary block that disagrees with its canonical record page. */
export function recordSummaryIssues(block, facts, others = []) {
  const issues = [];
  const links = [...block.matchAll(/href="\/applicability\/([^"]+)\/"/g)];
  if (links.length !== 1 || links[0][1] !== facts.sourceId) issues.push('exactly one canonical record link that matches the source ID is required');
  const tested = stripTags(block.match(/<p class="record-summary__tested">([\s\S]*?)<\/p>/)?.[1]);
  if (!tested) issues.push('the tested sentence (record-summary__tested) is required');
  if (/\b\d{4}\b/.test(tested) && !tested.includes(formatMonthYear(facts.validationDateIso ?? facts.validationDate) ?? '\0')) issues.push('the tested sentence states a date that is not the record validation month');
  if (/Tested on|Review due/.test(tested) && !tested.includes(facts.environment)) issues.push('the tested sentence names a different environment from the record');
  const lists = canonicalLists(facts.canonicalHtml);
  const known = new Set(Object.values(lists).flat());
  const scope = block.match(/<ul class="record-summary__scope">([\s\S]*?)<\/ul>/)?.[1] ?? '';
  for (const item of scope.matchAll(/<li(\s[^>]*)?>([\s\S]*?)<\/li>/g)) {
    const refs = item[1]?.match(/data-from="([^"]*)"/)?.[1]?.split(/\s+/).filter(Boolean) ?? [];
    if (!refs.length) {
      const text = stripTags(item[2]);
      const labelled = text.match(/^(Scheduler|Runtime|Workflow revision): (.+)$/);
      const onRecord = labelled !== null && definitionValue(facts.canonicalHtml, labelled[1]) === labelled[2];
      if (!known.has(text) && !onRecord) issues.push('a scope item is neither traced nor an item of the canonical record page');
      continue;
    }
    for (const ref of refs) {
      const problem = traceProblem(ref, lists);
      if (problem) issues.push(`a scope item ${problem}`);
    }
  }
  const own = new Set([facts.environment, facts.schedulerVersion, facts.runtimeVersion, facts.executionDate, facts.validationDate, facts.submissionId]);
  for (const other of others) {
    const foreign = [other.environment, other.schedulerVersion, other.runtimeVersion, other.executionDate, other.validationDate, other.submissionId]
      .filter((value) => typeof value === 'string' && value.length > 3 && !own.has(value));
    if (foreign.some((value) => block.includes(value))) issues.push('the summary repeats a value that belongs to a different record');
  }
  return issues;
}

/** RECORD-SUMMARY: adoption pages only, and every block agrees with its canonical record. */
export function validateRecordSummaries(builtPages, byId) {
  const errors = [];
  for (const page of builtPages) {
    const profile = page.html.match(/data-composition-profile="([^"]+)"/)?.[1];
    for (const block of recordSummaryBlocks(page.html)) {
      if (profile !== 'adoption') errors.push(diagnostic(page.source, 'recordSummary', 'RECORD-SUMMARY', `profile ${profile ?? '<missing>'} forbids a record summary; only the adoption profile may render one`));
      const sourceId = block.match(/data-source-id="([^"]+)"/)?.[1];
      const facts = byId.get(sourceId);
      if (!facts) {
        errors.push(diagnostic(page.source, 'recordSummary', 'RECORD-SUMMARY', `record summary references missing canonical source ${sourceId ?? '<missing>'}`));
        continue;
      }
      for (const issue of recordSummaryIssues(block, facts, [...byId.values()].filter((other) => other !== facts))) errors.push(diagnostic(page.source, 'recordSummary', 'RECORD-SUMMARY', issue));
    }
  }
  return errors;
}

/** SOURCE-DUPLICATION: canonical-only values may appear only in generated projections, record summaries, and the canonical pages. */
export function validateSourceDuplication(builtPages, byId) {
  const errors = [];
  for (const facts of byId.values()) {
    for (const page of builtPages.filter(({ source }) => !source.startsWith('/applicability/'))) {
      const generatedRemoved = [...standardProjectionBlocks(page.html), ...diagnosticProjectionBlocks(page.html), ...recordSummaryBlocks(page.html)]
        .reduce((text, block) => text.replace(block, ''), page.html);
      const forbiddenValues = [facts.environment, facts.schedulerVersion, facts.runtimeVersion, facts.executionDate,
        facts.validationDate, facts.submissionId, facts.evidenceId, facts.integrity, facts.boundary, ...facts.checks]
        .filter((value) => typeof value === 'string' && value.length > 3);
      if (forbiddenValues.some((value) => generatedRemoved.includes(value))) {
        errors.push(diagnostic(page.source, 'applicability', 'SOURCE-DUPLICATION', 'handwritten or canonical-only applicability value appears outside its generated projection'));
      }
    }
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
  if (!htmlFiles.length) return [diagnostic('site/dist', 'html', 'BUILD-OUTPUT', 'no generated HTML files were found')];
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
    errors.push(...validatePageComposition(source, html));
    const links = [...html.matchAll(/\b(?:href|src)="([^"]+)"/g)].map((match) => match[1]);
    for (const href of links) {
      if ((href.startsWith('/') || href.startsWith(CANONICAL_ORIGIN)) && !internalTargetExists(dist, href.replace(CANONICAL_ORIGIN, ''))) {
        errors.push(diagnostic(source, 'href', 'INTERNAL-LINK', `target does not exist: ${href}`));
      }
    }
  }

  const applicability = collectApplicabilityFacts(builtPages);
  errors.push(...applicability.errors);
  const applicabilityById = applicability.byId;
  for (const page of builtPages) {
    for (const block of standardProjectionBlocks(page.html)) {
      const sourceId = block.match(/data-source-id="([^"]+)"/)?.[1];
      const facts = applicabilityById.get(sourceId);
      if (!facts) {
        errors.push(diagnostic(page.source, 'sourceId', 'SOURCE-AGREEMENT', `projection references missing canonical applicability source ${sourceId ?? '<missing>'}`));
        continue;
      }
      errors.push(...validateProjectionSourceAgreement(page.source, block, facts.canonicalSource, facts.canonicalHtml));
    }
    for (const block of diagnosticProjectionBlocks(page.html)) {
      const sourceId = block.match(/data-source-id="([^"]+)"/)?.[1];
      const facts = applicabilityById.get(sourceId);
      const permitted = facts && [`environment: ${facts.environment}`, `scheduler: ${facts.schedulerFamily}`, `runtime: ${facts.runtimeName}`].some((value) => block.includes(value));
      if (!permitted) errors.push(diagnostic(page.source, 'diagnostic', 'SOURCE-AGREEMENT', 'diagnostic discriminator is stale or does not match its canonical source'));
    }
  }
  errors.push(...validateRecordSummaries(builtPages, applicabilityById), ...validateSourceDuplication(builtPages, applicabilityById));

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
  for (const file of filesUnder(dist).filter((candidate) => candidate.endsWith('.css'))) {
    const css = readFileSync(file, 'utf8');
    const cssPath = relative(dist, file);
    if (/@font-face|@import\s+url|fonts\.(?:googleapis|gstatic)|use\.typekit\.net|linear-gradient|radial-gradient|backdrop-filter/i.test(css)) errors.push(diagnostic(cssPath, 'css', 'VISUAL-DEPENDENCY', 'remote or bundled fonts, gradients, textures, and glass effects are forbidden'));
    if (/@keyframes|animation-name\s*:|animation\s*:|transition\s*:|scroll-timeline|parallax/i.test(css)) errors.push(diagnostic(cssPath, 'css', 'MOTION-EXCLUSION', 'decorative animation, transitions, and parallax are forbidden'));
    if (!/color-scheme:light dark/.test(css)) errors.push(diagnostic(cssPath, 'css', 'COLOR-SCHEME', 'color-scheme must advertise light and dark support'));
    for (const token of ['canvas', 'surface', 'raised', 'text', 'muted', 'primary', 'accent', 'shell', 'border', 'warning']) {
      if (!new RegExp(`--${token}:`, '').test(css)) errors.push(diagnostic(cssPath, `--${token}`, 'SEMANTIC-TOKENS', 'semantic role must be defined'));
    }
    if (!/--font-display:\s*(?:ui-serif|system-ui|Georgia)/.test(css) || !/--font-body:\s*system-ui/.test(css) || !/--font-technical:\s*ui-monospace/.test(css)
      || !/--text-base:\s*1rem/.test(css) || !/--text-supporting:\s*0?\.875rem/.test(css)) {
      errors.push(diagnostic(cssPath, 'typography', 'SYSTEM-TYPOGRAPHY', 'system-only serif or sans display, sans body, mono technical with 16px/14px minimum sizes are required'));
    }
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

export function validateDeploymentWorkflow(workflowText) {
  const errors = [];
  const deploy = workflowText.match(/\n  deploy:[\s\S]*?(?=\n  [a-zA-Z][\w-]*:|$)/)?.[0] ?? '';
  if (!deploy) return [diagnostic('.github/workflows/publication.yml', 'jobs.deploy', 'BUILD-ONCE', 'deployment job is missing')];
  for (const pattern of [/npm\s+(?:ci|install)/i, /astro\s+(?:build|sync|check)/i, /npm\s+run\s+build/i, />\s*site\/dist|cp\s+.*site\/dist|mv\s+.*site\/dist/i]) {
    if (pattern.test(deploy)) errors.push(diagnostic('.github/workflows/publication.yml', 'jobs.deploy', 'BUILD-ONCE', `forbidden deployment operation: ${pattern}`));
  }
  if (!/actions\/download-artifact@/.test(deploy)) errors.push(diagnostic('.github/workflows/publication.yml', 'jobs.deploy', 'BUILD-ONCE', 'must download the retained artifact'));
  if (!/cloudflare\/wrangler-action@/.test(deploy) || !/pages deploy site\/dist/.test(deploy)) errors.push(diagnostic('.github/workflows/publication.yml', 'jobs.deploy', 'DIRECT-UPLOAD', 'must invoke wrangler Pages Direct Upload'));
  if (!/publication\.mjs verify/.test(deploy)) errors.push(diagnostic('.github/workflows/publication.yml', 'jobs.deploy', 'ARTIFACT-IDENTITY', 'must verify checksums immediately before upload'));
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
    const policy = JSON.parse(readFileSync(join(root, 'infrastructure/cloudflare/hostname-redirects.v1.json'), 'utf8'));
    const policySourceFiles = [
      ...filesUnder(join(root, 'site/src')),
      ...filesUnder(join(root, 'site/plugins')),
    ].filter((file) => /\.(?:astro|css|mjs|ts)$/.test(file));
    const packageManifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    const astroConfig = readFileSync(join(root, 'site/astro.config.mjs'), 'utf8');
    const errors = [
      ...validateCanonicalConfig(astroConfig),
      ...validateHostnamePolicy(policy),
      ...validateDeploymentWorkflow(readFileSync(join(root, '.github/workflows/publication.yml'), 'utf8')),
      ...validateFrontendPolicy(packageManifest, astroConfig, policySourceFiles.map((file) => ({
        path: relative(root, file).replaceAll('\\', '/'), text: readFileSync(file, 'utf8'),
      }))),
    ];
    for (const file of filesUnder(join(root, 'site/src/content/redirects'))) {
      const text = readFileSync(file, 'utf8');
      if (REDIRECT_HOSTS.some((host) => text.includes(host))) errors.push(diagnostic(relative(root, file), 'hostname', 'REDIRECT-POLICY', 'hostname rules must remain outside content redirects'));
    }
    if (printErrors(errors)) console.log('Canonical, Cloudflare redirect, and build-once deployment policies are valid.');
  } else if (command === 'cloudflare-readiness') {
    const input = JSON.parse(readFileSync(args[0], 'utf8'));
    if (printErrors(validateCloudflareReadiness(input))) console.log('Cloudflare identifiers, DNS, certificate, and rule readiness are valid.');
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
    console.error('Usage: publication.mjs manifest <dist> <output> | verify <dist> <manifest> | built-output <dist> | policy <root> | cloudflare-readiness <input> | boundary <root> [--require] [--history <ref>]');
    process.exitCode = 2;
  }
}
