// The download link is a permanent redirect that GitHub resolves to the newest asset, so a
// player's download can never break and the site never calls the API — not at build time
// either. Nothing here needs to know which version is current, because nothing shows it.

export function downloadUrl(repo: string, dll: string): string {
  return `https://github.com/${repo}/releases/latest/download/${dll}`;
}
