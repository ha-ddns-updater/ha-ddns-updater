const { readFileSync } = require("node:fs");

const CONFIG_PATH = "ddns-updater/config.yaml";

function parseConfigVersion() {
  const config = readFileSync(CONFIG_PATH, "utf8");
  const match = config.match(/^version:\s*"(\d+\.\d+\.\d+)-ha(\d+\.\d+\.\d+)"$/m);

  if (!match) {
    throw new Error(`Could not parse version from ${CONFIG_PATH}; expected format X.Y.Z-haA.B.C`);
  }

  return {
    upstream: match[1],
    addon: match[2],
  };
}

function toFullVersion(nextReleaseVersion, current) {
  const fullMatch = /^(\d+\.\d+\.\d+)-ha(\d+\.\d+\.\d+)$/.exec(nextReleaseVersion);
  if (fullMatch) {
    return `${current.upstream}-ha${fullMatch[2]}`;
  }

  const addonOnlyMatch = /^(\d+\.\d+\.\d+)$/.exec(nextReleaseVersion);
  if (!addonOnlyMatch) {
    throw new Error(`Unexpected semantic-release version ${JSON.stringify(nextReleaseVersion)}`);
  }

  return `${current.upstream}-ha${addonOnlyMatch[1]}`;
}

module.exports = {
  verifyRelease: async (pluginConfig, context) => {
    const current = parseConfigVersion();
    const fullVersion = toFullVersion(context.nextRelease.version, current);

    context.nextRelease.version = fullVersion;
    context.nextRelease.gitTag = fullVersion;
    context.nextRelease.name = fullVersion;
  },
};
