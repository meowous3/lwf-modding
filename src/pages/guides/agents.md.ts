import type { APIRoute } from 'astro';
import { getEntry } from 'astro:content';

// Static endpoint, prerendered like every other page on this site (`output`
// is the default `static`). Serves the agent protocol guide's own raw
// Markdown so a coding agent can fetch or download it verbatim, rather than
// the rendered HTML the [slug] route produces for the other guides.
export const prerender = true;

export const GET: APIRoute = async () => {
  const guide = await getEntry('guides', 'agents');
  // `body` is the unparsed Markdown the glob loader keeps on the entry
  // (frontmatter already stripped) — reading it here means this route can
  // never drift from the guides collection.
  const body = guide?.body ?? '';
  return new Response(body, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
};
