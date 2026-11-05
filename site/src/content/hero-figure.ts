import { HERO_FIGURE } from './home';

/* The hero figure as an HTML string, because Starlight's hero takes custom markup through
   `hero.image.html`. Every text value is escaped here; the data in HERO_FIGURE is plain text. */
const escape = (value: string): string => value
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

const list = (className: string, items: readonly string[]): string =>
  `<ul class="${className}" role="list">${items.map((item) => `<li${className === 'env__services' ? ' class="env__box"' : ''}>${escape(item)}</li>`).join('')}</ul>`;

export function heroFigureHtml(figure: typeof HERO_FIGURE = HERO_FIGURE): string {
  const { laptop, cluster, services, caption } = figure;
  return [
    '<figure class="hero__figure not-content" aria-labelledby="hero-figure-caption">',
    '<div class="env-pair">',
    '<div class="env">',
    `<p class="env__title">${escape(laptop.title)}</p>`,
    `<p class="env__cmd"><code>${escape(laptop.command)}</code></p>`,
    list('env__services', services),
    list('env__facts', laptop.facts),
    '</div>',
    '<div class="env">',
    `<p class="env__title">${escape(cluster.title)}</p>`,
    `<p class="env__cmd"><code>${escape(cluster.command)}</code></p>`,
    '<div class="env__alloc">',
    `<p class="env__alloc-label">${escape(cluster.allocation)}</p>`,
    list('env__services', services),
    '</div>',
    list('env__facts', cluster.facts),
    '</div>',
    '</div>',
    `<figcaption id="hero-figure-caption">${escape(caption)}</figcaption>`,
    '</figure>',
  ].join('');
}
