module.exports = {
  branches: ["main"],
  // tagFormat encodes the upstream image version as a prefix so the full tag
  // is e.g. "2.9.0-ha1.0.5". The ${version} placeholder is the addon semver
  // only (e.g. "1.0.5") and is what semantic-release uses for bumping logic.
  // Keep this prefix in sync with the FROM line in ddns-updater/Dockerfile.
  tagFormat: "2.9.0-ha${version}",
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
        // Receives addon-only version (e.g. "1.0.5") and full gitTag (e.g. "2.9.0-ha1.0.5").
        // Updates config.yaml and patches the CHANGELOG.md header to show the full version.
        prepareCmd:
          "node .github/scripts/prepare-addon-release.mjs ${nextRelease.version} ${nextRelease.gitTag}",
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
