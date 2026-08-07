export type AccessibilityPageFixture = {
  path: string;
  distRoute: string;
  kind: string;
  criticalOutsideDisclosure?: readonly string[];
  focusLandmarks?: readonly string[];
};

export const accessibilityPages: readonly AccessibilityPageFixture[] = [
  { path: '/', distRoute: '', kind: 'home', criticalOutsideDisclosure: ['Tested workflow scope'], focusLandmarks: ['.skip', '.site-nav--wide a', '.hero__actions a', '.applicability-projection a', '.project-links a'] },
  { path: '/resources/', distRoute: 'resources', kind: 'resources', focusLandmarks: ['.skip', '.site-nav--wide a', '.resource-tile'] },
  { path: '/start/', distRoute: 'start', kind: 'start', criticalOutsideDisclosure: ['Confirm these assumptions before execution', 'diagnostic registry', 'report a workflow defect'] },
  { path: '/guide/scheduler-as-orchestrator/', distRoute: 'guide/scheduler-as-orchestrator', kind: 'conceptual module', focusLandmarks: ['.skip', '.site-nav--wide a', '.breadcrumbs a', '.module-pager a', '.sources-scope summary'] },
  { path: '/guide/baseline-single-node-pattern/', distRoute: 'guide/baseline-single-node-pattern', kind: 'runnable module', criticalOutsideDisclosure: ['Prerequisites', 'Tested workflow scope'], focusLandmarks: ['.skip', '.site-nav--wide a', '.breadcrumbs a', '.applicability-projection a', '.module-pager a', '.sources-scope summary'] },
  { path: '/diagnostics/', distRoute: 'diagnostics', kind: 'diagnostics index', criticalOutsideDisclosure: ['report a missing diagnostic', 'Recovery steps', 'Warning:', 'Escalate'] },
  { path: '/applicability/m1-baseline-anvil/', distRoute: 'applicability/m1-baseline-anvil', kind: 'applicability', criticalOutsideDisclosure: ['Assumptions', 'Limitations'] },
  { path: '/milestones/1/', distRoute: 'milestones/1', kind: 'milestone', focusLandmarks: ['.skip', '.site-nav--wide a', '.breadcrumbs a', '.applicability-projection a', '.table-overflow'] },
  { path: '/about/attribution/', distRoute: 'about/attribution', kind: 'attribution-and-licenses' },
  { path: '/about/accessibility/', distRoute: 'about/accessibility', kind: 'accessibility', criticalOutsideDisclosure: ['Report an accessibility barrier', 'support fallback'] },
  { path: '/about/support/', distRoute: 'about/support', kind: 'support', criticalOutsideDisclosure: ['Report a problem', 'If the public issue channel is unavailable'] },
  { path: '/about/glossary/', distRoute: 'about/glossary', kind: 'glossary' },
  { path: '/about/project/', distRoute: 'about/project', kind: 'project' },
  { path: '/404', distRoute: '404', kind: 'not-found', criticalOutsideDisclosure: ['Home', 'Resources'] },
] as const;

export const requiredKinds = ['home', 'resources', 'start', 'conceptual module', 'runnable module', 'diagnostics index', 'applicability', 'milestone', 'attribution-and-licenses', 'accessibility', 'support', 'not-found'] as const;
