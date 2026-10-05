import { PROJECT } from './wording';

export const DESIGNED_NOT_RUN = 'Designed, not run' as const;
export const THEME_STORAGE_KEY = 'l2c-theme' as const;
export type ThemeChoice = 'system' | 'light' | 'dark';

export const NAV_ITEMS = [
  { label: 'Get started', href: '/guide/tour/' },
  { label: 'Guide', href: '/resources/' },
  { label: 'Troubleshooting', href: '/diagnostics/' },
  { label: 'About', href: '/about/project/' },
  { label: 'GitHub (external)', href: PROJECT.repository, external: true },
] as const;

export type ConceptKey = 'step' | 'gate' | 'scratch' | 'net';
export interface Concept { key: ConceptKey; label: string; plain: string; was: string; mark: '■' | '◆' | '▲' | '●' }
export const CONCEPTS: readonly Concept[] = [
  { key: 'step', label: 'Job step', plain: 'a program the scheduler launches and tracks inside your allocation', was: 'a Compose service', mark: '■' },
  { key: 'gate', label: 'Readiness gate', plain: 'a check that the coordinator can really serve before any worker starts', was: 'healthcheck + depends_on', mark: '◆' },
  { key: 'scratch', label: 'Job-scoped scratch', plain: 'temporary job storage', was: 'a named volume', mark: '▲' },
  { key: 'net', label: 'Loopback', plain: 'local-only access', was: 'a published ports entry', mark: '●' },
] as const;

export type StepNumber = 1 | 2 | 3 | 4 | 5 | 6;
export const TIMELINE_STEPS: readonly { n: StepNumber; label: string; concepts: readonly ConceptKey[] }[] = [
  { n: 1, label: 'Get an allocation', concepts: ['scratch'] },
  { n: 2, label: 'Start coordinator', concepts: ['step', 'net'] },
  { n: 3, label: 'Readiness gate', concepts: ['gate'] },
  { n: 4, label: 'Run workers', concepts: ['step'] },
  { n: 5, label: 'Verify results', concepts: [] },
  { n: 6, label: 'Clean up', concepts: [] },
] as const;

export type DoorId = 'understand' | 'translate' | 'evaluate';
export interface Door { id: DoorId; eyebrow: string; title: string; href: string; linkText: string }
export const DOORS: readonly Door[] = [
  { id: 'understand', eyebrow: 'New to clusters? Start here', title: 'Understand the model', href: '/guide/tour/', linkText: 'Take the five-minute tour' },
  { id: 'translate', eyebrow: 'Already have a Compose file?', title: 'Translate it', href: '/guide/compose-to-hpc-translation/', linkText: 'Open the Compose-to-Slurm map' },
  { id: 'evaluate', eyebrow: 'Research software engineers & center staff', title: 'Evaluate and adopt', href: '/adoption/evaluate/', linkText: 'Read the evaluation guide' },
] as const;

/* One label for the talks page: footer, About nav, Guide tile and page title. */
export const TALKS_LABEL = 'Talks & papers' as const;

export const EVIDENCE_ROW_LABELS = ['Tested', 'You need', 'Depends on your center'] as const;
export type EvidenceRowLabel = typeof EVIDENCE_ROW_LABELS[number];
export const UNTESTED_HREF = '/adoption/evaluate/#not-tested' as const;

/* Content item ids in learning order: drives door 1's path, the pager and the Guide page. */
export const LEARNING_PATH = [
  'module-0-orientation', 'module-1-scheduler-orchestrator', 'start-guide',
  'module-2-baseline', 'module-3-compose-to-hpc-translation', 'adoption-evaluate',
] as const;

/* Fragment ids that must exist (FRAGMENT-LINK checks every same-site fragment; these are the contract ones). */
export const REQUIRED_FRAGMENTS = {
  home: ['big-idea', 'doors', 'crosswalk'],
  milestone2: ['release-v0-2-0'],
  evaluate: ['not-tested', 'when-not'],
  attribution: ['licenses'],
  glossary: ['allocation', 'job-step', 'readiness-gate', 'verification', 'job-scoped-scratch', 'loopback', 'ssh-tunnel', 'coordinator', 'worker', 'batch-scheduler'],
} as const;
