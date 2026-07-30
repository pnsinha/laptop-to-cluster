import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, it } from 'vitest';
import ApplicabilityProjectionView from '../../site/src/components/ApplicabilityProjection.astro';
import Attribution from '../../site/src/components/Attribution.astro';
import Breadcrumbs from '../../site/src/components/Breadcrumbs.astro';
import ContentHeader from '../../site/src/components/ContentHeader.astro';
import DiagnosticApplicabilityContextView from '../../site/src/components/DiagnosticApplicabilityContext.astro';
import ModulePager from '../../site/src/components/ModulePager.astro';
import SiteHeader from '../../site/src/components/SiteHeader.astro';
import SourcesAndScope from '../../site/src/components/SourcesAndScope.astro';
import StatusBadge from '../../site/src/components/StatusBadge.astro';
import SupportState from '../../site/src/components/SupportState.astro';
import TableOverflow from '../../site/src/components/TableOverflow.astro';
import UnvalidatedNotice from '../../site/src/components/UnvalidatedNotice.astro';
import WorkflowFigure from '../../site/src/components/WorkflowFigure.astro';

let container: AstroContainer;

beforeAll(async () => {
  container = await AstroContainer.create();
});

const render = (component: Parameters<AstroContainer['renderToString']>[0], props = {}) =>
  container.renderToString(component, { props });

describe('Astro semantic components', () => {
  it('renders global attribution as a named link and the full approved role statement', async () => {
    const compact = await render(Attribution, { compact: true });
    const full = await render(Attribution);

    expect(compact).toContain('<a href="/about/attribution/">Attribution and funding</a>');
    expect(full).toContain('<section aria-labelledby="attribution-heading">');
    expect(full).toContain('Parmanand Sinha');
    expect(full).toContain('2026 BSSw Fellow');
    expect(full).toContain('University of Chicago');
    expect(full).toContain('ParaTools, Inc.');
    expect(full).toContain('U.S. Department of Energy');
    expect(full).toContain('National Science Foundation');
    expect(full).toContain('do not imply endorsement');
  });

  it('places source roles after content in a native disclosure', async () => {
    const html = await render(SourcesAndScope, {
      references: [
        { kind: 'sow', citation: 'Fellowship SOW', scope: 'Publish the module.' },
        { kind: 'official-guidance', citation: 'BSSw program', scope: 'Publish an artifact.' },
        { kind: 'inferred-practice', citation: 'Prior fellows', scope: 'Use short lessons.' },
        { kind: 'project-decision', citation: 'Architecture', scope: 'Use static HTML.' },
      ],
    });

    expect(html).toContain('<h2 id="sources-scope-heading">Sources and scope</h2>');
    expect(html).toContain('<details>');
    for (const label of ['SOW commitment', 'Official guidance', 'Project-adopted practice', 'Project decision']) expect(html).toContain(`<strong>${label}:</strong>`);
    expect(html).toContain('are not BSSw Fellowship Program requirements');
  });
});

describe('Astro status components', () => {
  it('renders only title, summary, and actionable warning states', async () => {
    const fixture = {
      artifact_type: 'learning-module', milestone: 1, title: 'Fixture module',
      summary: 'A component fixture.', applicable_release: 'v0.1.0', last_reviewed: '2026-07-25',
      validation_date: '2026-07-25',
    };
    const published = await render(ContentHeader, { item: { ...fixture, status: 'published', validation_status: 'validated' } });
    expect(published).toContain('<h1>Fixture module</h1>');
    expect(published).toContain('<p class="lede">A component fixture.</p>');
    expect(published).not.toMatch(/<aside|Applicable release|Last reviewed|<dt>Status|Milestone 1/);

    for (const [status, label] of [['draft', 'Draft:'], ['superseded', 'Superseded:'], ['archived', 'Archived:']] as const) {
      const html = await render(ContentHeader, { item: { ...fixture, status, validation_status: 'validated' } });
      expect(html, status).toContain(`<strong>${label}</strong>`);
      expect(html.match(/<aside class="notice" role="note">/g), status).toHaveLength(1);
    }
    for (const validationStatus of ['failed', 'unvalidated', 'stale'] as const) {
      const html = await render(ContentHeader, { item: { ...fixture, status: 'published', validation_status: validationStatus } });
      expect(html, validationStatus).toContain(`<strong>${validationStatus}:</strong>`);
      expect(html, validationStatus).not.toMatch(/Applicable release|Last reviewed|<dt>Status|Milestone 1/);
    }
  });

  it('renders explicit status text independently of its visual tone', async () => {
    const html = await render(StatusBadge, {
      status: 'Validated', label: 'Validation', tone: 'success',
    });

    expect(html).toContain('class="status-badge status-badge--success"');
    expect(html).toContain('<span class="status-badge__label">Validation: </span>');
    expect(html).toContain('<span class="status-badge__text">Validated</span>');
    expect(html).toContain('aria-hidden="true"');
  });

  it('keeps a slotted table native inside a labelled keyboard-reachable overflow region', async () => {
    const html = await container.renderToString(TableOverflow, {
      props: { label: 'Validation evidence', instruction: 'Scroll to compare environments.' },
      slots: { default: '<table><caption>Runs</caption><thead><tr><th scope="col">Environment</th></tr></thead><tbody><tr><td>Anvil</td></tr></tbody></table>' },
    });

    expect(html).toContain('role="region" aria-label="Validation evidence" tabindex="0"');
    expect(html).toContain('Scroll to compare environments.');
    expect(html).toContain('<table><caption>Runs</caption><thead>');
    expect(html).toContain('<th scope="col">Environment</th>');
  });

  it('identifies each unvalidated scope beside a link to the affected content', async () => {
    const html = await render(UnvalidatedNotice, {
      scopes: [{ anchor: 'procedure', reason: 'Representative execution is pending.' }],
    });

    expect(html).toContain('role="note"');
    expect(html).toContain('aria-labelledby="unvalidated-heading"');
    expect(html).toContain('<h2 id="unvalidated-heading">Unvalidated content</h2>');
    expect(html).toContain('<a href="#procedure">procedure</a>: Representative execution is pending.');
  });

  it('suppresses healthy support state and renders active degradation details', async () => {
    expect(await render(SupportState)).not.toContain('support-state');
    await expect(render(SupportState, { state: 'degraded', artifact: 'Workflow archive' }))
      .rejects.toThrow(/requires scope, recovery, validatedAt/);
    for (const state of ['degraded', 'unavailable'] as const) {
      const html = await render(SupportState, {
        state, artifact: 'Workflow archive', scope: 'Module 2 downloads',
        recovery: 'Use the retained release artifact while service is restored.', validatedAt: '2026-07-31T12:00Z',
      });
      expect(html).toContain(`class="support-state ${state}"`);
      expect(html).toContain('role="status"');
      expect(html).toContain(`Public artifact status: ${state}`);
      expect(html).toContain('<dt>Artifact</dt><dd>Workflow archive</dd>');
      expect(html).toContain('<dt>Affected scope</dt><dd>Module 2 downloads</dd>');
      expect(html).toContain('<dt>Validated</dt>');
      expect(html).toContain('Open an issue');
      expect(html).toContain('email the maintainer');
    }
  });
});

describe('Astro navigation components', () => {
  it('derives the active primary link and provides native narrow navigation', async () => {
    const html = await render(SiteHeader, { currentPath: '/resources/' });

    expect(html).toContain('Laptop');
    expect(html).toContain('→');
    expect(html).toContain('Cluster');
    expect(html).toContain('<details class="site-nav--compact">');
    expect(html).toContain('<summary>Navigation</summary>');
    expect(html.match(/href="\/resources\/" aria-current="page"/g)).toHaveLength(2);
    expect(html).toContain('Companion repository<span class="external-label"> (external)</span>');
    expect(html).not.toMatch(/<script\b|onclick=/i);
  });

  it('renders sequence-projected previous and next module links as ordinary links', async () => {
    const html = await render(ModulePager, {
      navigation: {
        previous: { id: 'module-1', title: 'Understand the model', url: '/guide/model/' },
        next: { id: 'module-3', title: 'Adapt the workflow', url: '/guide/adaptation/' },
      },
    });

    expect(html).toContain('<nav class="module-pager" aria-label="Learning module navigation">');
    expect(html).toContain('<a rel="prev" href="/guide/model/">');
    expect(html).toContain('<span>Understand the model</span>');
    expect(html).toContain('<a rel="next" href="/guide/adaptation/">');
    expect(html).toContain('<span>Adapt the workflow</span>');
    expect(html).not.toMatch(/<button\b|onclick=|<script\b/i);
  });

  it('renders a labelled ordered breadcrumb trail with a current text item', async () => {
    const html = await render(Breadcrumbs, {
      currentPath: '/guide/scheduler-as-orchestrator/',
      currentTitle: 'Scheduler as Orchestrator',
    });

    expect(html).toContain('<nav class="breadcrumbs" aria-label="Breadcrumb">');
    expect(html).toContain('<ol>');
    expect(html).toContain('<li><a href="/">Home</a></li>');
    expect(html).toContain('<li><a href="/resources/">Resources</a></li>');
    expect(html).toContain('<li aria-current="page"><span>Scheduler as Orchestrator</span></li>');
  });
});


describe('finalized presentation: header identity, nav, release, support, SectionNav, and 404', () => {
  it('renders the exact two-line site identity: "laptop → cluster" and "multi-service stacks under the scheduler"', async () => {
    const html = await render(SiteHeader, { currentPath: '/' });
    expect(html).toContain('<span class="site-identity__line1">laptop → cluster</span>');
    expect(html).toContain('<span class="site-identity__line2">multi-service stacks under the scheduler</span>');
  });

  it('includes the "Troubleshooting" nav label linking to /diagnostics/', async () => {
    const html = await render(SiteHeader, { currentPath: '/' });
    expect(html).toMatch(/href="\/diagnostics\/"[^>]*>Troubleshooting/);
  });

  it('shows only v0.1.0 as the release identifier with no "publication candidate" language', async () => {
    const html = await render(SiteHeader, { currentPath: '/' });
    expect(html).toContain('v0.1.0');
    expect(html.toLowerCase()).not.toContain('publication candidate');
    expect(html.toLowerCase()).not.toContain('release candidate');
  });

  it('renders the healthy support action "Found a problem? Open an issue." without a status panel', async () => {
    const healthy = await render(SupportState);
    expect(healthy).not.toContain('support-state');
    expect(healthy).not.toContain('Public artifact status');
  });

  it('renders SectionNav as text-only links with aria-current="page" and ▸ prefix for active', async () => {
    const SectionNav = (await import('../../site/src/components/SectionNav.astro')).default;
    const html = await render(SectionNav, {
      items: [
        { label: 'Project', href: '/about/project/' },
        { label: 'Support', href: '/about/support/' },
        { label: 'Accessibility', href: '/about/accessibility/' },
      ],
      currentPath: '/about/support/',
      label: 'About sections',
    });
    expect(html).toContain('aria-label="About sections"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('section-nav__link--active');
    // Text-only links (no images, no icons beyond CSS)
    expect(html).not.toMatch(/<img\b/);
    expect(html).not.toMatch(/<svg\b/);
  });
});

describe('concise applicability and workflow components', () => {
  it('renders only generated applicability fields and one canonical link', async () => {
    const html = await render(ApplicabilityProjectionView, { projection: {
      projectionId: 'landing:m1', consumer: 'landing', recordId: 'm1', canonicalPath: '/applicability/m1/',
      testedScope: 'The workflow was validated on a named system.', supplement: { kind: 'boundary', text: 'Adapt the partition.' },
    } });
    expect(html).toContain('data-projection-id="landing:m1"');
    expect(html).toContain('data-source-id="m1"');
    expect(html).toContain('href="/applicability/m1/"');
    expect(html).not.toMatch(/submission|digest|integrity|provenance|checks/i);
  });

  it('renders only the authorized diagnostic discriminator and link', async () => {
    const html = await render(DiagnosticApplicabilityContextView, { context: {
      projectionId: 'diagnostic:BSSW-X:m1', diagnosticId: 'BSSW-X', recordId: 'm1',
      canonicalPath: '/applicability/m1/', discriminator: 'runtime: Apptainer',
    } });
    expect(html).toContain('runtime: Apptainer');
    expect(html).toContain('href="/applicability/m1/"');
  });

  it('keeps the captioned allocation-to-verification sequence and hides only decorative connectors', async () => {
    const html = await render(WorkflowFigure);
    expect(html).toContain('<figure class="workflow-figure">');
    expect(html).toContain('<figcaption>One allocation, five ordered responsibilities</figcaption>');
    expect(html).toContain('<ol>');
    const labels = [...html.matchAll(/<strong>([^<]+)<\/strong>/g)].map((match) => match[1]);
    expect(labels).toEqual(['Allocation', 'Coordinator', 'Readiness gate', 'Workers', 'Verification']);
    expect(html.match(/<i aria-hidden="true">↓<\/i>/g)).toHaveLength(4);
    expect(html).toContain('<li class="workflow-figure__gate"><strong>Readiness gate</strong>');
    const verification = html.slice(html.indexOf('<strong>Verification</strong>'));
    expect(verification).toContain('before success is recorded');
    expect(verification).not.toContain('<i');
    expect(html.indexOf('Readiness gate')).toBeLessThan(html.indexOf('Workers'));
    expect(html.indexOf('Verification')).toBeGreaterThan(html.indexOf('Workers'));
  });
});
