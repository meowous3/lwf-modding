const BASE = import.meta.env.BASE_URL;

/** Prefix an internal path with the Pages base path. Always use this for internal links. */
export function href(path: string): string {
  const cut = path.search(/[?#]/);
  const route = cut === -1 ? path : path.slice(0, cut);
  const suffix = cut === -1 ? '' : path.slice(cut);
  const joined = `${BASE}/${route}`.replace(/\/{2,}/g, '/');
  const last = joined.split('/').pop() ?? '';
  if (last.includes('.') || joined.endsWith('/')) return joined + suffix;
  return `${joined}/${suffix}`;
}
