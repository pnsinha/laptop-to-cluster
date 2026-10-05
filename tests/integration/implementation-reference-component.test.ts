import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { beforeAll, describe, expect, it } from 'vitest';
import ImplementationReferenceView from '../../site/src/components/ImplementationReference.astro';
import { IMPLEMENTATION_REFERENCE } from '../../site/src/content/implementation';

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});

describe('ImplementationReference component', () => {
  it('renders each excerpt with its source link and no expected-output figure', async () => {
    const html = await container.renderToString(ImplementationReferenceView, { props: { reference: IMPLEMENTATION_REFERENCE } });
    expect(html.match(/<figure class="technical-figure source-excerpt">/g)).toHaveLength(IMPLEMENTATION_REFERENCE.excerpts.length);
    expect(html).not.toContain('source-excerpt--expected');
    expect(html).not.toContain('Expected success result');
    expect(html).not.toMatch(/[a-f0-9]{64}/);
    for (const excerpt of IMPLEMENTATION_REFERENCE.excerpts) expect(html).toContain(`href="${excerpt.sourceUrl}"`);
  });

  it('gives the section the id that the start guide links to', async () => {
    const html = await container.renderToString(ImplementationReferenceView, { props: { reference: IMPLEMENTATION_REFERENCE } });
    expect(html).toContain('<section class="implementation-reference" id="implementation-reference" aria-labelledby="implementation-reference-heading">');
  });
});
