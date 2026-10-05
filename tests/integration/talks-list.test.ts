import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, it } from 'vitest';
import TalksList from '../../site/src/components/TalksList.astro';

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});

const talks = [
  { id: 'usrse26-talk', kind: 'talk', title: 'From Laptop to Cluster: HPC Translation Patterns for AI Stacks', venue: "US-RSE'26", event_date: '2026-10-20', location: 'San Jose, CA', featured: true,
    links: [{ label: 'Conference program', href: 'https://us-rse.org/usrse26/program/' }] },
  { id: 'iguide-forum-2026-poster', kind: 'poster', title: 'I-GUIDE Forum 2026 poster', venue: 'I-GUIDE Forum 2026', event_date: '2026-08-05', featured: false,
    links: [{ label: 'Poster and companion page', href: '/events/iguide-forum-2026/' }] },
];

describe('TalksList', () => {
  it('renders the C2 markup: a role=list of li.talk with id, kind, h3, meta and links', async () => {
    const html = await container.renderToString(TalksList, { props: { talks } });
    expect(html).toContain('<ul class="talks" role="list">');
    expect(html.match(/<li class="talk" id="[a-z0-9-]+">/g)).toHaveLength(2);
    expect(html).toContain('<li class="talk" id="usrse26-talk">');
    expect(html).toContain('<p class="talk__kind">Talk</p>');
    expect(html).toContain('<p class="talk__kind">Poster</p>');
    expect(html).toContain('<h3>From Laptop to Cluster: HPC Translation Patterns for AI Stacks</h3>');
    expect(html).toMatch(/<p class="talk__meta">US-RSE(?:'|&#39;)26 · October 20, 2026 · San Jose, CA<\/p>/);
    expect(html).toContain('<ul class="talk__links">');
  });

  it('marks external links and leaves site paths plain', async () => {
    const html = await container.renderToString(TalksList, { props: { talks } });
    expect(html).toMatch(/<a href="https:\/\/us-rse\.org\/usrse26\/program\/" rel="external">Conference program<span class="external-label"> \(external\)<\/span><\/a>/);
    expect(html).toMatch(/<a href="\/events\/iguide-forum-2026\/">Poster and companion page<\/a>/);
  });

  it('puts no heading above h3 and no inline style or script in the list', async () => {
    const html = await container.renderToString(TalksList, { props: { talks } });
    expect(html).not.toMatch(/<h[12]\b|style=|<script/);
  });
});
