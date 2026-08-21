import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const guides = defineCollection({
  loader: glob({ pattern: '*.md', base: './guides' }),
  schema: z.object({
    title: z.string(),
    blurb: z.string(),
    order: z.number(),
  }),
});

export const collections = { guides };
