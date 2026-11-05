import { defineCollection, z } from 'astro:content';
import { file, glob } from 'astro/loaders';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';
import {
  applicabilityRecordSchema,
  attributionSchema,
  contentItemSchema,
  evidenceManifestReferenceSchema,
  feedbackRecordSchema,
  milestoneRecordSchema,
  redirectRecordSchema,
  releaseRecordSchema,
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

export const collections = {
  /* Starlight's own collection. The site renders its pages from contentItems through
     StarlightPage, so this collection stays empty; Starlight still requires it. */
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema({ extend: pageChromeSchema }) }),
  contentItems: defineCollection({
    loader: glob({ pattern: '**/*.{md,mdx,json,yaml,yml}', base: './src/content/content-items' }),
    schema: contentItemSchema,
  }),
  applicability: defineCollection({ loader: structured('./src/content/applicability'), schema: applicabilityRecordSchema }),
  releases: defineCollection({ loader: structured('./src/content/releases'), schema: releaseRecordSchema }),
  redirects: defineCollection({ loader: structured('./src/content/redirects'), schema: redirectRecordSchema }),
  milestones: defineCollection({ loader: structured('./src/content/milestones'), schema: milestoneRecordSchema }),
  feedback: defineCollection({ loader: structured('./src/content/feedback'), schema: feedbackRecordSchema }),
  attribution: defineCollection({ loader: structured('./src/content/attribution'), schema: attributionSchema }),
  evidenceReferences: defineCollection({ loader: structured('./src/content/evidence-references'), schema: evidenceManifestReferenceSchema }),
  talks: defineCollection({ loader: file('./src/content/talks.yml'), schema: talkSchema }),
};
