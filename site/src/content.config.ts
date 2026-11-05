import { defineCollection, z } from 'astro:content';
import { file, glob } from 'astro/loaders';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';
import {
  applicabilityRecordSchema,
  attributionSchema,
  contentItemSchema,
  milestoneRecordSchema,
  talkSchema,
} from './content/schema.js';

const structured = (base: string) => glob({ pattern: '**/*.{json,yaml,yml}', base });

/* Page chrome the layouts hand to Starlight's title panel: a kind line above the title
   ("Module 2 · Hands-on · about 30 min"), the one-sentence lede below it, and any status
   notice. Pages set these through StarlightPage frontmatter; authors never write them. */
const pageChromeSchema = z.object({
  l2c: z.object({
    kindLine: z.string().optional(),
    lede: z.string().optional(),
    notices: z.array(z.object({
      type: z.enum(['note', 'tip', 'caution', 'danger']),
      title: z.string(),
      text: z.string(),
    })).optional(),
  }).optional(),
});

/* Release, redirect, feedback and evidence-reference records have schemas in schema.ts and are
   validated by the registry when they exist, but none is published as content yet. Add a
   collection here, with its folder under src/content/, when the first record is written. */
export const collections = {
  /* Starlight's own collection. The site renders its pages from contentItems through
     StarlightPage, so this collection stays empty; Starlight still requires it. */
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema({ extend: pageChromeSchema }) }),
  contentItems: defineCollection({
    loader: glob({ pattern: '**/*.{md,mdx,json,yaml,yml}', base: './src/content/content-items' }),
    schema: contentItemSchema,
  }),
  applicability: defineCollection({ loader: structured('./src/content/applicability'), schema: applicabilityRecordSchema }),
  milestones: defineCollection({ loader: structured('./src/content/milestones'), schema: milestoneRecordSchema }),
  attribution: defineCollection({ loader: structured('./src/content/attribution'), schema: attributionSchema }),
  talks: defineCollection({ loader: file('./src/content/talks.yml'), schema: talkSchema }),
};
