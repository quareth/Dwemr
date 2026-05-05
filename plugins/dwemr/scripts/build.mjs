import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outdir = path.join(pluginRoot, "dist");

await rm(outdir, { recursive: true, force: true });

await build({
  entryPoints: [path.join(pluginRoot, "index.ts")],
  outfile: path.join(outdir, "index.js"),
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  packages: "external",
  sourcemap: false,
  logLevel: "info",
});
