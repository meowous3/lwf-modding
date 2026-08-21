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

const mods = defineCollection({
  loader: glob({ pattern: '*.md', base: './mods' }),
  schema: z.object({
    title: z.string(),
    repo: z.string(),
    dll: z.string(),
    summary: z.string(),
    gameVersion: z.string(),
    version: z.string().optional(),
  }),
});

const pages = defineCollection({
  loader: glob({ pattern: '*.md', base: './pages' }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
  }),
});

export const collections = { guides, mods, pages };
