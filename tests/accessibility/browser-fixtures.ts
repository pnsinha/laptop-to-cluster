export type AccessibilityPageFixture = {
  path: string;
  distRoute: string;
  kind: string;
  criticalOutsideDisclosure?: readonly string[];
  focusLandmarks?: readonly string[];
};

export const accessibilityPages: readonly AccessibilityPageFixture[] = [
  { path: '/', distRoute: '', kind: 'home', criticalOutsideDisclosure: ['Tested workflow scope'], focusLandmarks: ['.skip', '.site-nav--wide a', '.hero__actions a', '.applicability-projection a', '.project-links a', '.site-footer a'] },
  { path: '/resources/', distRoute: 'resources', kind: 'resources', focusLandmarks: ['.skip', '.site-nav--wide a', '.breadcrumbs a', '.resource-card a', '.site-footer a'] },
  { path: '/start/', distRoute: 'start', kind: 'start', criticalOutsideDisclosure: ['Confirm these assumptions before execution', 'diagnostic registry', 'report a workflow defect'] },
  { path: '/guide/scheduler-as-orchestrator/', distRoute: 'guide/scheduler-as-orchestrator', kind: 'conceptual module', focusLandmarks: ['.skip', '.site-nav--wide a', '.breadcrumbs a', '.module-pager a', '.sources-scope summary', '.site-footer a'] },
  { path: '/guide/baseline-single-node-pattern/', distRoute: 'guide/baseline-single-node-pattern', kind: 'runnable module', criticalOutsideDisclosure: ['Before you begin', 'Tested workflow scope', 'Warning:'], focusLandmarks: ['.skip', '.site-nav--wide a', '.breadcrumbs a', '.applicability-projection a', '.module-pager a', '.sources-scope summary', '.site-footer a'] },
  { path: '/diagnostics/', distRoute: 'diagnostics', kind: 'diagnostics index', criticalOutsideDisclosure: ['report a missing diagnostic'] },
  { path: '/diagnostics/bssw-prereq-apptainer/', distRoute: 'diagnostics/bssw-prereq-apptainer', kind: 'diagnostic detail', criticalOutsideDisclosure: ['Recovery steps', 'Warning:', 'Escalate'] },
  { path: '/applicability/m1-baseline-anvil/', distRoute: 'applicability/m1-baseline-anvil', kind: 'applicability', criticalOutsideDisclosure: ['Assumptions', 'Limitations'] },
  { path: '/milestones/1/', distRoute: 'milestones/1', kind: 'milestone', focusLandmarks: ['.skip', '.site-nav--wide a', '.breadcrumbs a', '.applicability-projection a', '.table-overflow', '.site-footer a'] },
  { path: '/releases/v0-1-0/', distRoute: 'releases/v0-1-0', kind: 'release' },
  { path: '/about/attribution/', distRoute: 'about/attribution', kind: 'attribution' },
  { path: '/about/licenses/', distRoute: 'about/licenses', kind: 'licenses' },
  { path: '/about/accessibility/', distRoute: 'about/accessibility', kind: 'accessibility', criticalOutsideDisclosure: ['Report an accessibility barrier', 'support fallback'] },
  { path: '/about/support/', distRoute: 'about/support', kind: 'support', criticalOutsideDisclosure: ['Report a problem', 'Warning — protect sensitive information', 'If the public issue channel is unavailable'] },
  { path: '/about/glossary/', distRoute: 'about/glossary', kind: 'glossary' },
  { path: '/about/project/', distRoute: 'about/project', kind: 'project' },
  { path: '/404', distRoute: '404', kind: 'not-found', criticalOutsideDisclosure: ['Home', 'Resources'] },
] as const;

export const requiredKinds = ['home', 'resources', 'start', 'conceptual module', 'runnable module', 'diagnostics index', 'diagnostic detail', 'applicability', 'milestone', 'release', 'attribution', 'licenses', 'accessibility', 'support', 'not-found'] as const;
