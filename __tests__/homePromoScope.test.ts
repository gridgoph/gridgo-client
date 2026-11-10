import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

/**
 * Partner promos belong on Home and nowhere else (client#402): never on
 * checkout, payment or order tracking. Every route that draws or loads one
 * is listed here, so a new one has to be argued for.
 */

const ROOT = join(__dirname, "..");
const ALLOWED = new Set(["app/(tabs)/home.tsx"]);
const PROMO_MODULES = /@\/(components\/(HomeRotatingTile|HomePromoTile|PromoSheet)|store\/homePromos|lib\/homePromos)"/;

function routes(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === "__tests__") return [];
    if (statSync(path).isDirectory()) return routes(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

it("loads promos only on Home", () => {
  const users = routes(join(ROOT, "app"))
    .filter((path) => PROMO_MODULES.test(readFileSync(path, "utf8")))
    .map((path) => relative(ROOT, path));
  expect(users).toEqual([...ALLOWED]);
});
