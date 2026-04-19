module.exports = {
  branches: ["main"],
  // tagFormat encodes the upstream image version as a prefix so the full tag
  // is e.g. "2.9.0-ha1.0.5". The ${version} placeholder is the addon semver
  // only (e.g. "1.0.5") and is what semantic-release uses for bumping logic.
  // Keep this prefix in sync with the FROM line in ddns-updater/Dockerfile.
  tagFormat: "2.8.1-ha${version}",
  plugins: [
    [
      "@semantic-release/commit-analyzer",
      {
        preset: "conventionalcommits",
      },
    ],
    [
      "@semantic-release/release-notes-generator",
      {
        preset: "conventionalcommits",
        writerOpts: {
          // Replace the addon-only semver (e.g. "1.0.6") with the full git tag
          // (e.g. "2.9.0-ha1.0.6") in all generated notes so both the CHANGELOG
          // file and the GitHub Release body show the full version.
          finalizeContext(ctx) {
            if (ctx.currentTag) {
              ctx.version = ctx.currentTag;
            }
            return ctx;
          },
        },
      },
    ],
    [
      "@semantic-release/changelog",
      {
        changelogFile: "ddns-updater/CHANGELOG.md",
      },
    ],
    [
      "@semantic-release/exec",
      {
        prepareCmd:
          "node .github/scripts/prepare-addon-release.mjs ${nextRelease.version}",
      },
    ],
    [
      "@semantic-release/git",
      {
        assets: ["ddns-updater/config.yaml", "ddns-updater/CHANGELOG.md"],
        message: "chore(release): ${nextRelease.gitTag}\n\n${nextRelease.notes}",
      },
    ],
    "@semantic-release/github",
  ],
};
