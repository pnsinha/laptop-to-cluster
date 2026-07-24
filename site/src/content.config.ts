import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import {
  applicabilityRecordSchema,
  attributionSchema,
  contentItemSchema,
  evidenceManifestReferenceSchema,
  feedbackRecordSchema,
  milestoneRecordSchema,
  redirectRecordSchema,
  releaseRecordSchema,
} from './content/schema.js';

const structured = (base: string) => glob({ pattern: '**/*.{json,yaml,yml}', base });

export const collections = {
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
};