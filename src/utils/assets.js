/**
 * Resolve a browser asset beneath Vite's configured base path.
 *
 * Development is served from `/`; the public GitHub Pages build is served
 * from `/civ2/`. Keeping this in one place prevents project-page deployments
 * from accidentally requesting files from the account-site root.
 */
export function assetUrl(path) {
  const relative = String(path).replace(/^\/+/, '');
  return `${import.meta.env.BASE_URL}${relative}`;
}
