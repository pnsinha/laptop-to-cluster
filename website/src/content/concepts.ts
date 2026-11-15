/* The four ideas that change meaning between Compose and a cluster. Each keeps one colour and
   one shape across the site; the concept map, the crosswalk and the timeline read them from here.
   `note` is trusted, hand-authored HTML (text and glossary links only). */
export type ConceptKey = 'step' | 'gate' | 'scratch' | 'net';
export interface Concept { key: ConceptKey; label: string; was: string; mark: '■' | '◆' | '▲' | '●'; note: string }

export const CONCEPTS: readonly Concept[] = [
  { key: 'step', label: 'Job step', was: 'a Compose service', mark: '■',
    note: 'A program the scheduler launches and tracks inside your allocation (a <a href="/about/glossary/#job-step">job step</a>).' },
  { key: 'gate', label: 'Readiness gate', was: 'healthcheck + depends_on', mark: '◆',
    note: 'A check that the coordinator can really serve before any worker starts (a <a href="/about/glossary/#readiness-gate">readiness gate</a>). It does not establish that results are correct.' },
  { key: 'scratch', label: 'Job-scoped scratch', was: 'a named volume', mark: '▲',
    note: 'Temporary job storage (<a href="/about/glossary/#job-scoped-scratch">job-scoped scratch</a>). It may remain until your center clears it; copy out what you need before the job ends.' },
  { key: 'net', label: 'Loopback', was: 'a published ports entry', mark: '●',
    note: 'Local-only access (<a href="/about/glossary/#loopback">loopback</a>). It is not an isolation boundary; access beyond the node requires center approval.' },
] as const;
