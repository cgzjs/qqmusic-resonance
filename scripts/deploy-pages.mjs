import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.resolve(root, ".wrangler/pages");
// Only replace this script's generated directory; preserve local databases and auth.
if (path.dirname(output) !== path.resolve(root, ".wrangler")) throw new Error("Unexpected Pages output path");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(path.join(root, "dist/client"), output, { recursive: true });
for (const file of ["_worker.js", "_routes.json"]) {
  await cp(path.join(root, "deploy/pages", file), path.join(output, file));
}
// Isolate Pages config discovery from Vite's generated Worker config redirect.
const configDirectory = await mkdtemp(path.join(os.tmpdir(), "resonance-pages-"));
const config = JSON.parse(await readFile(path.join(root, "deploy/pages/wrangler.json"), "utf8"));
config.pages_build_output_dir = output;
await writeFile(path.join(configDirectory, "wrangler.json"), JSON.stringify(config));
const child = spawn(process.execPath, [
  path.join(root, "node_modules/wrangler/bin/wrangler.js"),
  "--cwd", configDirectory, "pages", "deploy", output,
  "--project-name", "qqmusic-resonance", "--branch", "main", "--commit-dirty", "true",
], { cwd: configDirectory, stdio: "inherit" });
const exitCode = await new Promise(resolve => {
  child.on("error", error => { console.error(error.message); resolve(1); });
  child.on("exit", code => resolve(code ?? 1));
});
if (path.dirname(configDirectory) !== path.resolve(os.tmpdir()) || !path.basename(configDirectory).startsWith("resonance-pages-")) throw new Error("Unexpected temporary config path");
await rm(configDirectory, { recursive: true, force: true });
process.exitCode = exitCode;
