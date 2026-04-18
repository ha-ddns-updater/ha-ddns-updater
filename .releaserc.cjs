module.exports = {
  branches: ["main"],
  tagFormat: "${version}",
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
        prepareCmd: "node .github/scripts/prepare-addon-release.mjs ${nextRelease.version}",
      },
    ],
    [
      "@semantic-release/git",
      {
        assets: ["ddns-updater/config.yaml", "ddns-updater/CHANGELOG.md"],
        message: "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}",
      },
    ],
    "@semantic-release/github",
  ],
};
