import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { packageRelease } from "../scripts/package-release.mjs";
import { RELEASE_FILES } from "../scripts/release-files.mjs";

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "typesafe-release-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, "source");
  for (const name of RELEASE_FILES) {
    await mkdir(dirname(join(source, name)), { recursive: true });
    await writeFile(join(source, name), name === "package.json" ? '{"name":"fixture","version":"1.0.0"}' : `Public fixture: ${name}\n`);
  }
  return { root, source };
}

test("release allowlist excludes private inputs and records exact file hashes", async (t) => {
  const { root, source } = await fixture(t);
  for (const name of [".env", "artifacts/private-report.md", "dist/examples/private.md", "scripts/private-analysis.mjs", ".git/config"]) {
    await mkdir(dirname(join(source, name)), { recursive: true });
    await writeFile(join(source, name), "PRIVATE-TEST-SENTINEL");
  }
  const { directory, manifest } = await packageRelease({ sourceRoot: source, destination: join(root, "release") });
  assert.deepEqual((await readdir(directory, { recursive: true, withFileTypes: true })).filter(entry => entry.isFile()).map(entry => join(entry.parentPath, entry.name).slice(directory.length + 1).replaceAll("\\", "/")).sort(), [...RELEASE_FILES, "RELEASE-MANIFEST.json"].sort());
  for (const file of manifest.files) {
    const contents = await readFile(join(directory, file.name));
    assert.equal(contents.includes(Buffer.from("PRIVATE-TEST-SENTINEL")), false);
    assert.equal(createHash("sha256").update(contents).digest("hex"), file.sha256);
  }
  await assert.rejects(packageRelease({ sourceRoot: source, destination: directory }), { code: "EEXIST" });
});

test("release packager rejects symlinks instead of following private content", async (t) => {
  const { root, source } = await fixture(t);
  const input = join(source, "README.md");
  const privateFile = join(root, "private-note.md");
  await writeFile(privateFile, "PRIVATE-TEST-SENTINEL");
  await rm(input);
  await symlink(privateFile, input);
  await assert.rejects(packageRelease({ sourceRoot: source, destination: join(root, "release") }), /non-symlinked/);
});
