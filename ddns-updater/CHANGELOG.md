## [2.9.0-ha1.2.3](https://github.com/ha-ddns-updater/ha-ddns-updater/compare/2.9.0-ha1.2.2...2.9.0-ha1.2.3) (2026-04-19)

### Bug Fixes

* bring back disabled schema validation ([bfb5c5d](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/bfb5c5d0bc27c91049730ae8a87cbfe8168b0776))

## [2.9.0-ha1.2.2](https://github.com/ha-ddns-updater/ha-ddns-updater/compare/2.9.0-ha1.2.1...2.9.0-ha1.2.2) (2026-04-19)

### Bug Fixes

* add some debug information ([4d1c8f3](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/4d1c8f307b565344345b0d20811363d652b446b3))

## [2.9.0-ha1.2.1](https://github.com/ha-ddns-updater/ha-ddns-updater/compare/2.9.0-ha1.2.0...2.9.0-ha1.2.1) (2026-04-19)

### Bug Fixes

* set user to root to be able to read options.json ([447987d](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/447987dfc93d349f3424ce9c8407841330603c40))

## [2.9.0-ha1.2.0](https://github.com/ha-ddns-updater/ha-ddns-updater/compare/2.9.0-ha1.1.1...2.9.0-ha1.2.0) (2026-04-19)

### Features

* bump upstream ddns-updater to 2.9.0 ([5291261](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/529126136f718576e9b9de050612cbe2d00ce381))

## [2.8.0-ha1.1.1](https://github.com/ha-ddns-updater/ha-ddns-updater/compare/2.8.0-ha1.1.0...2.8.0-ha1.1.1) (2026-04-19)

### Bug Fixes

* don't reset addon-version when upstream-version changes ([1fbf5b2](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/1fbf5b2fb2f7454b515d3757cf10b1e1b189a6f6))
* downgrade to test pipeline ([a87d8d1](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/a87d8d12df3f872ccda56e0a033674191e4dec27))

## [2.9.0-ha1.1.0](https://github.com/ha-ddns-updater/ha-ddns-updater/compare/2.9.0-ha1.0.6...2.9.0-ha1.1.0) (2026-04-19)

### Features

* bump upstream ddns-updater to 2.9.0 ([5790ea8](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/5790ea81fa2f7883119d5706cb325670bbd08578))

### Bug Fixes

* add releaserc to pr ([4b2de7d](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/4b2de7d167e7eff5c71ebedbbbd356da02832161))
* downgrade upstream to test upstream-bump pipeline ([8628cc2](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/8628cc2edbc7c3775208510403109040e0d008a2))

## [2.8.1-ha1.0.1](https://github.com/ha-ddns-updater/ha-ddns-updater/compare/2.8.1-ha1.0.0...2.8.1-ha1.0.1) (2026-04-19)

### Bug Fixes

* add releaserc to pr ([4b2de7d](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/4b2de7d167e7eff5c71ebedbbbd356da02832161))

## 2.8.1-ha1.0.0 (2026-04-19)

### Features

* allow to set any env-variable ([dd2bb77](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/dd2bb777596714f80544b6d852fb0a9d654c3bd7))
* enable dependabot ([d7e20e4](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/d7e20e4a1a25bde074a10ba91367548272e3273b))
* GitHub Actions ([12e4e90](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/12e4e90ec6158f205dd847b889ebdba6c2cb20eb))
* initial version ([68fa39b](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/68fa39b5cfb1a1c7724da9c38e63904d34b80954))
* mount addon-data to /update/data for persistence ([509852c](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/509852c96494fe10cf57e6b98604f47d659a42cc))
* simplify by not rewriting options.json to config.json ([ccd690c](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/ccd690c13d3ce056e3f115d9427caf00b5e54d50))

### Bug Fixes

* allow curl to fail when updating docker.io description ([6abdc0a](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/6abdc0ac350505d47e9f2da21735b7a480a52621))
* Changelog format ([a9bc354](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/a9bc3547c9aa4db9d2618b0908cc8cabb23ced20))
* correct changelog generation ([c48b73d](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/c48b73db1fd48efe56e378bf315fbfa5de182df8))
* dockerhub copy ([30a16a2](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/30a16a287c42ad3eaec997f3b90ddfe74a874a9e))
* downgrade upstream to test upstream-bump pipeline ([8628cc2](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/8628cc2edbc7c3775208510403109040e0d008a2))
* image location ([11d16bf](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/11d16bf54f5301bfc277f4207628b5d976becfbc))
* image name and login to ghcr for dockerhub-push ([9f43b3a](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/9f43b3ac84c850234085466fde2df56ac104726b))
* link to GitHub after migration ([507fbe4](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/507fbe438b1c7d1fa818acd7a1969506925fb158))
* linter findings ([9377698](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/937769861b03cd80ea944c2c7c6edb9aaee32da9))
* permissions for docker.io step ([fbd0cf4](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/fbd0cf43ed135102c2d00ef16a0553c34422e5d4))
* remove `schema:false` because the linter doesn't like it ([65098d4](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/65098d49817079b840fa76ee5ff7f64e9df7f8ba))
* run build on tags instead of release to match with semrel-bot ([3654b69](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/3654b691bd2a97b68bfcc1e30f3768f545d3ba12))
* semantic release bot versioning schema ([13304c1](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/13304c174c7a73d19f5f4bd695c46d5af07545f4))
* semantic release bot versioning schema ([86e48c4](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/86e48c4b0b6c0577e63eefecad8c8a20bda55a5e))
* set the context for image build and disable cosign ([e9c0742](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/e9c0742809f8927b9563e698dd7bb9d5dfc1a31d))
* skopeo command to copy to docker.io ([bd1f275](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/bd1f275b852bf14216443ff774202a6a52f53ff3))
* trigger build when releasing ([2374111](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/2374111da6ba0a5b851ed4a816021008607a9c85))
* upload to dockerhub ([9b0cee5](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/9b0cee5766b17b22cb46198b2058bd12442b5474))
* use skopeo login instead of auth.json ([d898e87](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/d898e87a57cef031e5d2d8be9489a4029d7143fc))

## [2.9.0-ha1.0.6](https://github.com/ha-ddns-updater/ha-ddns-updater/compare/2.9.0-ha1.0.5...2.9.0-ha1.0.6) (2026-04-19)

### Bug Fixes

* allow curl to fail when updating docker.io description ([6abdc0a](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/6abdc0ac350505d47e9f2da21735b7a480a52621))

## [2.9.0-ha1.0.5](https://github.com/ha-ddns-updater/ha-ddns-updater/compare/2.9.0-ha1.0.4...2.9.0-ha1.0.5) (2026-04-19)

### Bug Fixes

* permissions for docker.io step ([fbd0cf4](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/fbd0cf43ed135102c2d00ef16a0553c34422e5d4))

## [2.9.0-ha1.0.4](https://github.com/ha-ddns-updater/ha-ddns-updater/compare/2.9.0-ha1.0.3...2.9.0-ha1.0.4) (2026-04-19)

### Bug Fixes

* use skopeo login instead of auth.json ([d898e87](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/d898e87a57cef031e5d2d8be9489a4029d7143fc))

## [2.9.0-ha1.0.3](https://github.com/ha-ddns-updater/ha-ddns-updater/compare/2.9.0-ha1.0.2...2.9.0-ha1.0.3) (2026-04-18)

### Bug Fixes

* skopeo command to copy to docker.io ([bd1f275](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/bd1f275b852bf14216443ff774202a6a52f53ff3))

## [2.9.0-ha1.0.2](https://github.com/ha-ddns-updater/ha-ddns-updater/compare/2.9.0-ha1.0.1...2.9.0-ha1.0.2) (2026-04-18)

### Bug Fixes

* trigger build when releasing ([2374111](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/2374111da6ba0a5b851ed4a816021008607a9c85))

## [2.9.0-ha1.0.1](https://github.com/ha-ddns-updater/ha-ddns-updater/compare/2.9.0-ha1.0.0...2.9.0-ha1.0.1) (2026-04-18)

### Bug Fixes

* correct changelog generation ([c48b73d](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/c48b73db1fd48efe56e378bf315fbfa5de182df8))
* run build on tags instead of release to match with semrel-bot ([3654b69](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/3654b691bd2a97b68bfcc1e30f3768f545d3ba12))

## 2.9.0-ha1.0.0 (2026-04-18)

### Features

* allow to set any env-variable ([dd2bb77](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/dd2bb777596714f80544b6d852fb0a9d654c3bd7))
* enable dependabot ([d7e20e4](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/d7e20e4a1a25bde074a10ba91367548272e3273b))
* GitHub Actions ([12e4e90](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/12e4e90ec6158f205dd847b889ebdba6c2cb20eb))
* initial version ([68fa39b](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/68fa39b5cfb1a1c7724da9c38e63904d34b80954))
* mount addon-data to /update/data for persistence ([509852c](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/509852c96494fe10cf57e6b98604f47d659a42cc))
* simplify by not rewriting options.json to config.json ([ccd690c](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/ccd690c13d3ce056e3f115d9427caf00b5e54d50))

### Bug Fixes

* Changelog format ([a9bc354](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/a9bc3547c9aa4db9d2618b0908cc8cabb23ced20))
* dockerhub copy ([30a16a2](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/30a16a287c42ad3eaec997f3b90ddfe74a874a9e))
* image location ([11d16bf](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/11d16bf54f5301bfc277f4207628b5d976becfbc))
* image name and login to ghcr for dockerhub-push ([9f43b3a](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/9f43b3ac84c850234085466fde2df56ac104726b))
* link to GitHub after migration ([507fbe4](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/507fbe438b1c7d1fa818acd7a1969506925fb158))
* linter findings ([9377698](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/937769861b03cd80ea944c2c7c6edb9aaee32da9))
* remove `schema:false` because the linter doesn't like it ([65098d4](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/65098d49817079b840fa76ee5ff7f64e9df7f8ba))
* semantic release bot versioning schema ([13304c1](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/13304c174c7a73d19f5f4bd695c46d5af07545f4))
* semantic release bot versioning schema ([86e48c4](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/86e48c4b0b6c0577e63eefecad8c8a20bda55a5e))
* set the context for image build and disable cosign ([e9c0742](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/e9c0742809f8927b9563e698dd7bb9d5dfc1a31d))
* upload to dockerhub ([9b0cee5](https://github.com/ha-ddns-updater/ha-ddns-updater/commit/9b0cee5766b17b22cb46198b2058bd12442b5474))
