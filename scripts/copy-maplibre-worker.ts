/**
 * Copy MapLibre's web worker into public/ so the browser can load it.
 *
 * MapLibre 6 finds its worker as "./maplibre-gl-worker.mjs" next to its own
 * module. The bundler moves MapLibre's code into a hashed chunk and does not
 * emit the worker beside it, so the worker 404s and the map never finishes
 * loading, with no error shown. The map instead points MapLibre at
 * /maplibre/maplibre-gl-worker.mjs (setWorkerUrl in app/ui/MapApp.tsx). The
 * worker imports ./maplibre-gl-shared.mjs, so both files are copied.
 *
 * Runs before `dev` and `build` (npm pre-scripts), so the copies always match
 * the installed MapLibre version; public/maplibre/ is gitignored.
 */
import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const from = path.join(root, "node_modules", "maplibre-gl", "dist");
const to = path.join(root, "public", "maplibre");
mkdirSync(to, { recursive: true });
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(path.join(from, file), path.join(to, file));
}
console.log("MapLibre worker copied to public/maplibre/");
