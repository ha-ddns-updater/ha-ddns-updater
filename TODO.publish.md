# TODO.publish.md

This file captures the full technical context and decisions needed to recreate the CI/CD conversation about release ordering for this repository.

## 1) Original problem statement

Current release behavior:

1. `semantic-release` runs on push to `main`.
2. It updates `ddns-updater/config.yaml` + `ddns-updater/CHANGELOG.md` and pushes them to `main`.
3. A release tag is created.
4. Build workflow runs and publishes container images.

Problem:

- Home Assistant reads `ddns-updater/config.yaml` from the repository to detect updates.
- Because `config.yaml` is updated before the Docker Hub image is available, users can see an update that is not yet pullable.
- If image build/push fails, `config.yaml` still advertises a non-existing version.

Goal requested in the conversation:

1. Detect whether a release is needed; stop if not.
2. Calculate next version from commits (major/minor/patch) and create a release MR/PR.
3. Build and push image tagged with the new version.
4. Merge version bump to default branch only after successful image publication.

---

## 2) Repository context used in the discussion

Workspace root:

- `/home/user/workspace/ha-ddns-updater/ha-ddns-updater`

Relevant files read during the conversation:

- `.github/workflows/release.yaml`
- `.github/workflows/build.yaml`
- `.releaserc.cjs`
- `.github/scripts/prepare-addon-release.mjs`
- `.github/scripts/ensure-release-baseline-tag.mjs`
- `ddns-updater/config.yaml`
- `AGENTS.md`
- `TODO.md`
- `package.json`

Versioning model (from `AGENTS.md`):

- Addon version format: `<upstream>-ha<addon>` (example: `2.9.0-ha1.7.1`).
- Upstream part tracks `qdm12/ddns-updater`.
- Addon semver bump is CI-driven.
- Note in `AGENTS.md`: agents must not manually bump addon versions.

---

## 3) Current behavior confirmed from workflow files

### `.github/workflows/release.yaml`

- Trigger: push to `main`.
- Runs `npm run release` (`semantic-release`).
- Then detects release tag on `HEAD`.
- If tag exists, dispatches `build.yaml`.

### `.github/workflows/build.yaml`

- Triggers on workflow dispatch and on tag push (`X.Y.Z-haA.B.C`).
- Reads release version from `ddns-updater/config.yaml`.
- Builds multi-arch image to GHCR.
- Publishes manifest.
- Copies image + `latest` to Docker Hub.

### `.releaserc.cjs`

- `tagFormat: "2.9.0-ha${version}"`.
- Uses commit analyzer + notes generator + changelog + exec prepare + git + github plugins.
- `@semantic-release/git` commits `ddns-updater/config.yaml` and `ddns-updater/CHANGELOG.md` to `main`.

Consequence:

- Source advertises new version before Docker Hub publish is guaranteed.

---

## 4) Solution direction discussed

Initial direction:

- Split release into a prepare phase and a finalize phase to avoid early `main` updates.

Then a refined proposal from user:

- Use MR/PR auto-merge with fast-forward semantics so the same commit built is the one on `main`, preserving tag/source alignment.

Key question answered:

- On GitHub, rebase merge does create new commit SHA(s) even when FF appears possible.
- Therefore rebase auto-merge does not preserve the original tagged SHA on `main`.

---

## 5) Important GitHub platform conclusions

1. GitHub PR auto-merge does not provide true ff-only behavior like GitLab ff-only merge.
2. GitHub rebase merge rewrites commits -> new SHA(s).
3. If strict SHA preservation is required (build commit == tagged commit == commit moved to `main`), direct ref fast-forward update is the reliable mechanism.

Recommended mechanism discussed:

- After successful image push, update `refs/heads/main` to release branch tip via GitHub API (`force=false`) to enforce fast-forward semantics.

---

## 6) Proposed target pipeline (conversation outcome)

### Phase A: Prepare release candidate

1. Detect if release needed from commit history (`semantic-release` dry-run or analyzer path).
2. If none needed, exit cleanly.
3. If needed:
   - create release branch `release/<full-version>`
   - update `ddns-updater/config.yaml` and `ddns-updater/CHANGELOG.md`
   - commit `chore(release): <full-version>`
   - create tag `<full-version>` on this release commit
   - open PR from release branch to `main`

### Phase B: Build + publish from release branch commit

1. Trigger build workflow on `release/**` push (or PR head).
2. Read version from `ddns-updater/config.yaml` on that exact commit.
3. Build multi-arch image.
4. Push to GHCR and copy/sync to Docker Hub with exact release tag.

### Phase C: Move `main` only on success

1. Only after successful Docker Hub publication, fast-forward `main` ref to release branch tip SHA.
2. Close/merge PR by policy (or let FF movement supersede merge action).
3. Ensure release artifacts (tag + GitHub release visibility) align with final published image.

Invariant this design preserves:

- The same commit SHA is used for versioned source, tag, and image build input.

---

## 7) Failure mode discussed and handling

Rare but possible case:

- Build/push fails, PR stays unmerged, version on `main` remains old.
- New commits arrive on `main`.
- Previously computed release version could conflict with already-created tag/artifacts.

Mitigations discussed:

1. Add a preflight build (for `latest` or candidate path) before release preparation.
2. Keep release unpublished/draft until publish+FF success (optional strategy).
3. On failed release candidate, perform cleanup before retry:
   - delete temporary release branch
   - delete tag if already created
   - delete/close draft GitHub release if created
   - rerun after fixes

---

## 8) Files expected to change for implementation

Primary:

- `.github/workflows/release.yaml` (or split into prepare/finalize style workflows)
- `.github/workflows/build.yaml` (add release-branch trigger + post-publish FF step)
- `.releaserc.cjs` (prepare vs publish behavior, plugin sequencing)
- `.github/scripts/prepare-addon-release.mjs` (if needed for branch-based flow)
- `.github/scripts/ensure-release-baseline-tag.mjs` (verify compatibility with new flow)
- `AGENTS.md` (document new release workflow and operational rules)

Potential additions:

- new workflow for automated ref update / PR handling
- new script to compute next release version without publishing

---

## 9) Checks and constraints captured from maintainer guide

From `AGENTS.md` relevant to this topic:

- CI controls version bumps.
- Keep addon versioning schema consistent with upstream prefix.
- Do not manually bump addon versions outside automated process.
- Validate `ddns-updater/config.yaml` syntax after changes.

Validation command referenced in docs:

```bash
python -c "import yaml, pathlib; yaml.safe_load(pathlib.Path('ddns-updater/config.yaml').read_text()); print('config.yaml OK')"
```

---

## 10) Practical implementation checklist

- [ ] Confirm release trigger entrypoint (`release.yaml`) only prepares release candidate branch/PR.
- [ ] Ensure no direct version bump commit is pushed to `main` before image publish.
- [ ] Trigger `build.yaml` from candidate release branch commit.
- [ ] Publish image with tag from candidate `config.yaml` version.
- [ ] Perform final `main` update via fast-forward ref update (`force=false`) only after successful image push.
- [ ] Verify branch protection/token permissions allow this ref update path.
- [ ] Add failure cleanup procedure documentation.
- [ ] Update maintainer docs (`AGENTS.md`) with new flow.

---

## 11) Conversation resolution snapshot

Final technical answer in the conversation:

- Rebase auto-merge on GitHub does not preserve commit SHA/tag identity.
- If commit/tag/image SHA identity is required, use direct fast-forward ref update after successful build/publish.
- The divergence risk (someone pushes to `main` during workflow) exists and should be handled operationally; it does not make rebase preferable for this requirement.
