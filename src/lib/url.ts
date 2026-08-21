const BASE = import.meta.env.BASE_URL;

/** Prefix an internal path with the Pages base path. Always use this for internal links. */
export function href(path: string): string {
  const joined = `${BASE}/${path}`.replace(/\/{2,}/g, '/');
  if (joined.includes('.') || joined.endsWith('/')) return joined;
  return `${joined}/`;
}
