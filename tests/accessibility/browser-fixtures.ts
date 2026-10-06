import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export type AccessibilityPageFixture = {
  path: string;
  distRoute: string;
  kind: string;
  criticalOutsideDisclosure?: readonly string[];
  focusLandmarks?: readonly string[];
};

/* Record pages are discovered from the build so a newly recorded run is scanned without editing this list. */
const recordDirectory = fileURLToPath(new URL('../../site/dist/applicability', import.meta.url));
const recordIds = existsSync(recordDirectory)
  ? readdirSync(recordDirectory, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
  : [];
const recordPages: AccessibilityPageFixture[] = [...new Set(['m1-baseline-anvil', ...recordIds])].sort().map((id) => ({
  path: `/applicability/${id}/`, distRoute: `applicability/${id}`, kind: 'applicability', criticalOutsideDisclosure: ['Assumptions', 'Limitations'],
}));

export const HOME_PATH = '/';
export const MODULE_2_PATH = '/guide/baseline-single-node-pattern/';
export const recordPaths: readonly string[] = recordPages.map(({ path }) => path);

const moduleLandmarks = ['.skip', '.site-nav--wide a', '.breadcrumbs a', '.module-pager a', '.sources-scope summary'] as const;

export const accessibilityPages: readonly AccessibilityPageFixture[] = [
  { path: '/', distRoute: '', kind: 'home', criticalOutsideDisclosure: ['Tested workflow scope'], focusLandmarks: ['.skip', '.site-nav--wide a', '.hero__actions a', '.applicability-projection a', '.doors a', '.project-links a'] },
  { path: '/resources/', distRoute: 'resources', kind: 'resources', focusLandmarks: ['.skip', '.site-nav--wide a', '.resource-tile'] },
  { path: '/start/', distRoute: 'start', kind: 'start', criticalOutsideDisclosure: ['Confirm these assumptions before you run anything', 'match the ID or symptom you see', 'report a workflow defect'] },
  { path: '/guide/tour/', distRoute: 'guide/tour', kind: 'conceptual module', focusLandmarks: moduleLandmarks },
  { path: '/guide/scheduler-as-orchestrator/', distRoute: 'guide/scheduler-as-orchestrator', kind: 'conceptual module', focusLandmarks: moduleLandmarks },
  { path: MODULE_2_PATH, distRoute: 'guide/baseline-single-node-pattern', kind: 'runnable module', criticalOutsideDisclosure: ['Prerequisites', 'Tested workflow scope'], focusLandmarks: ['.skip', '.site-nav--wide a', '.breadcrumbs a', '.applicability-projection a', '.module-pager a', '.sources-scope summary'] },
  { path: '/guide/compose-to-hpc-translation/', distRoute: 'guide/compose-to-hpc-translation', kind: 'conceptual module', focusLandmarks: moduleLandmarks },
  { path: '/adoption/evaluate/', distRoute: 'adoption/evaluate', kind: 'adoption', criticalOutsideDisclosure: ['Full test record'], focusLandmarks: ['.skip', '.site-nav--wide a', '.breadcrumbs a', '.record-summary a', '.module-pager a'] },
  { path: '/diagnostics/', distRoute: 'diagnostics', kind: 'diagnostics index', criticalOutsideDisclosure: ['report a missing diagnostic', 'Recovery steps', 'Warning:', 'Escalate'] },
  ...recordPages,
  { path: '/milestones/1/', distRoute: 'milestones/1', kind: 'milestone', focusLandmarks: ['.skip', '.site-nav--wide a', '.breadcrumbs a', '.applicability-projection a', '.table-overflow'] },
  { path: '/milestones/2/', distRoute: 'milestones/2', kind: 'milestone', focusLandmarks: ['.skip', '.site-nav--wide a', '.breadcrumbs a', '.applicability-projection a', '.table-overflow'] },
  { path: '/about/attribution/', distRoute: 'about/attribution', kind: 'attribution-and-licenses' },
  { path: '/about/accessibility/', distRoute: 'about/accessibility', kind: 'accessibility', criticalOutsideDisclosure: ['Report an accessibility barrier', 'support fallback'] },
  { path: '/about/support/', distRoute: 'about/support', kind: 'support', criticalOutsideDisclosure: ['Report a problem', 'If the public issue channel is unavailable'] },
  { path: '/about/glossary/', distRoute: 'about/glossary', kind: 'glossary' },
  { path: '/about/project/', distRoute: 'about/project', kind: 'project' },
  { path: '/about/talks-and-papers/', distRoute: 'about/talks-and-papers', kind: 'talks', focusLandmarks: ['.skip', '.site-nav--wide a', '.talk__links a'] },
  { path: '/events/iguide-forum-2026/', distRoute: 'events/iguide-forum-2026', kind: 'event' },
  { path: '/404', distRoute: '404', kind: 'not-found', criticalOutsideDisclosure: ['Home', 'Resources'] },
] as const;

export const requiredKinds = ['home', 'resources', 'start', 'conceptual module', 'runnable module', 'adoption', 'diagnostics index', 'applicability', 'milestone', 'attribution-and-licenses', 'accessibility', 'support', 'talks', 'event', 'not-found'] as const;
