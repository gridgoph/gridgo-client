/**
 * CARTO dark raster tiles for night maps.
 *
 * Same token as Rider and Supplier. Lives in gitignored `.env.local` as
 * `EXPO_PUBLIC_CARTO_API_KEY`. Never commit it. Light maps stay on OSM.
 *
 * Expo inlines `EXPO_PUBLIC_*` only as the literal member expression
 * `process.env.EXPO_PUBLIC_CARTO_API_KEY`. A read off a variable named
 * `env` is never rewritten, so a release bundle would ship keyless.
 */
const DARK_TILE_BASE =
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

export function cartoApiKey(
  raw: string | undefined = process.env.EXPO_PUBLIC_CARTO_API_KEY,
): string | null {
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

export function cartoDarkTileUrl(
  raw: string | undefined = process.env.EXPO_PUBLIC_CARTO_API_KEY,
): string {
  const key = cartoApiKey(raw);
  if (!key) return DARK_TILE_BASE;
  return `${DARK_TILE_BASE}?key=${encodeURIComponent(key)}`;
}
