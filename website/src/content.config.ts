import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { file, glob } from 'astro/loaders';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';
import { applicabilityRecordSchema, talkSchema } from './content/schema.js';

/* Every page is a Starlight docs entry under src/content/docs/. Besides Starlight's own fields, a
   page may set a kind line above its title ("Module 2 · Hands-on · about 30 min") and a one-sentence
   lede below it; the PageTitle override shows both. */
const pageChromeSchema = z.object({
  l2c: z.object({
    kindLine: z.string().optional(),
    lede: z.string().optional(),
  }).optional(),
});

export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema({ extend: pageChromeSchema }) }),
  /* Test records: each drives its /applicability/<id>/ page and every Tested badge that cites it. */
  applicability: defineCollection({ loader: glob({ pattern: '**/*.{yaml,yml}', base: './src/content/applicability' }), schema: applicabilityRecordSchema }),
  talks: defineCollection({ loader: file('./src/content/talks.yml'), schema: talkSchema }),
};
