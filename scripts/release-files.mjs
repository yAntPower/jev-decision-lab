// Explicit public files only; never discover or read environment files or reports.
export const RELEASE_FILES = Object.freeze([
  ".gitignore", ".github/workflows/ci.yml",
  "LICENSE", "README.md", "README.zh-CN.md", "CONTRIBUTING.md", "SECURITY.md", "CODE_OF_CONDUCT.md",
  "package.json", "server.mjs",
  "docs/typesafe-guide.md", "docs/templates.md", "docs/deployment.md", "docs/deployment.en.md", "docs/roadmap.md",
  "dist/index.html", "dist/styles.css", "dist/app.js", "dist/core.js", "dist/presets.js", "dist/i18n.js",
  "dist/favicon.svg", "dist/privacy.html", "dist/privacy.js", "dist/examples/proposal.md", "dist/examples/proposal.en.md",
  "scripts/package-release.mjs", "scripts/release-files.mjs",
  "test/core.test.mjs", "test/server.test.mjs", "test/release.test.mjs", "test/templates.test.mjs",
]);
