import { LEARNING_PATH, TALKS_LABEL } from './contracts';
import { canonicalPath } from './registry';
import type { ApplicabilityRecord, ContentItem } from './schema';
import { RECORD_LINK_TEXT } from './wording';

/* The Starlight sidebar, built from the content collection so page titles stay in one place.
   Groups follow the reading order: the learning path first, then what a reader needs mid-task,
   then reference, then the project record. Starlight marks the current page itself and derives
   the previous and next links from this order. */
export interface SidebarLink { label: string; href: string }
export type SidebarGroup = { label: string; items: SidebarLink[]; collapsed?: boolean };
export type SidebarConfig = Array<SidebarLink | SidebarGroup>;

const link = (item: ContentItem | undefined, label?: string): SidebarLink[] =>
  item && item.status === 'published' ? [{ label: label ?? item.title, href: canonicalPath(item) }] : [];

export function buildSidebar(items: readonly ContentItem[], record?: ApplicabilityRecord): SidebarConfig {
  const byId = new Map(items.map((item) => [item.id, item]));
  const path = LEARNING_PATH.flatMap((id) => link(byId.get(id)));
  return [
    { label: 'Guide', href: '/resources/' },
    { label: 'Learning path', items: path },
    { label: 'While you run it', items: [
      { label: 'Troubleshooting', href: '/diagnostics/' },
      ...link(byId.get('cheat-sheet'), 'Cheat sheet'),
      ...link(byId.get('glossary')),
    ] },
    { label: 'Evidence', items: [
      ...(record ? [{ label: RECORD_LINK_TEXT, href: `/applicability/${record.id}/` }] : []),
      ...link(byId.get('milestone-1'), 'Milestone 1'),
      ...link(byId.get('milestone-2'), 'Milestone 2'),
    ] },
    { label: 'Project', collapsed: true, items: [
      ...link(byId.get('about-project'), 'About the project'),
      ...link(byId.get('talks-and-papers'), TALKS_LABEL),
      ...link(byId.get('attribution-statement'), 'Attribution and licenses'),
      ...link(byId.get('accessibility-statement'), 'Accessibility'),
      ...link(byId.get('support-and-recovery'), 'Support'),
    ] },
  ];
}

/** Starlight's sidebar item shape (label plus link, or label plus items). */
export function toStarlightSidebar(config: SidebarConfig) {
  return config.map((entry) => ('href' in entry
    ? { label: entry.label, link: entry.href }
    : { label: entry.label, collapsed: entry.collapsed ?? false, items: entry.items.map(({ label, href }) => ({ label, link: href })) }));
}
