import { lstat, readFile, realpath, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RELEASE_FILES } from "./release-files.mjs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

export async function packageRelease({ sourceRoot = projectRoot, destination } = {}) {
  const source = await realpath(sourceRoot);
  const files = [];
  for (const name of RELEASE_FILES) {
    const input = resolve(source, name);
    if (!(await lstat(input)).isFile() || await realpath(input) !== input) {
      throw new Error(`Release input must be a regular, non-symlinked file: ${name}`);
    }
    const bytes = await readFile(input);
    files.push({ name, bytes, sha256: createHash("sha256").update(bytes).digest("hex") });
  }
  const metadata = JSON.parse(files.find(file => file.name === "package.json").bytes.toString("utf8"));
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const output = resolve(destination || join(source, "release", `jev-decision-lab-${metadata.version}-${stamp}`));
  await mkdir(dirname(output), { recursive: true });
  // Fail if the destination already exists; never delete or overwrite its files.
  await mkdir(output);
  for (const file of files) {
    const target = join(output, file.name);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.bytes, { flag: "wx" });
  }
  const manifest = { name: metadata.name, version: metadata.version, files: files.map(({ name, sha256 }) => ({ name, sha256 })) };
  await writeFile(join(output, "RELEASE-MANIFEST.json"), JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
  return { directory: output, manifest };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await packageRelease();
  console.log(`Prepared ${result.manifest.files.length} public files plus RELEASE-MANIFEST.json\n${result.directory}`);
}
