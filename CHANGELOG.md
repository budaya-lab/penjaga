# Changelog

## [3.4.0](https://github.com/budaya-lab/penjaga/compare/v3.3.0...v3.4.0) (2026-11-27)


### Features

* **steward:** highlight JSON previews and simplify diffs ([4675fa6](https://github.com/budaya-lab/penjaga/commit/4675fa666a2c67b41a00114e5d57e20eb6943ce8))


### Bug Fixes

* **portal:** keep resource diffs stable and highlight JSON ([6cf9a93](https://github.com/budaya-lab/penjaga/commit/6cf9a93f88fd8e44fdd87198bb6fc029806fdbb2))
* **portal:** preserve bucket position and align resource fields ([335b1c1](https://github.com/budaya-lab/penjaga/commit/335b1c1cd536c648571c923c52a3d59cbb485dbd))

## [3.3.0](https://github.com/budaya-lab/penjaga/compare/v3.2.0...v3.3.0) (2026-11-27)


### Features

* **steward:** add explicit dataset and portal publishing workflows ([006aa54](https://github.com/budaya-lab/penjaga/commit/006aa54429c622b8926e7bed7ba16b13e83177f1))
* **steward:** commit and push saved dataset metadata ([1d054d8](https://github.com/budaya-lab/penjaga/commit/1d054d8dc79277e03be555dd0df8f9fac60df95d))
* **steward:** guide metadata publishing with explicit workflow states ([79bf8aa](https://github.com/budaya-lab/penjaga/commit/79bf8aa4465fbed3ae9037c69d76f0c79322d5b1))
* **steward:** prepare source-verified portal proposals ([ddfbab8](https://github.com/budaya-lab/penjaga/commit/ddfbab875bf75d53466db840a9b16bd0d25713fb))
* **steward:** show dataset branch and metadata Git status ([3df13fc](https://github.com/budaya-lab/penjaga/commit/3df13fc58ca0e3b53379cd891f7bb0f1a800fcd7))
* **steward:** submit reviewed portal catalogue pull requests ([9e237c3](https://github.com/budaya-lab/penjaga/commit/9e237c3aa4f8f53cb17599fe83847d8897a78c4a))

## [3.2.0](https://github.com/budaya-lab/penjaga/compare/v3.1.1...v3.2.0) (2026-11-23)


### Features

* **steward:** chart buckets in the readme view ([4e624a1](https://github.com/budaya-lab/penjaga/commit/4e624a1e85adfe3697d680647495f6fb20d65d53))
* **steward:** chart buckets in the readme view ([2319298](https://github.com/budaya-lab/penjaga/commit/2319298ce15ae6491f285c895d336f8fb119a570))

## [3.1.1](https://github.com/budaya-lab/penjaga/compare/v3.1.0...v3.1.1) (2026-11-23)


### Bug Fixes

* **steward:** omit hidden entries from directory counts ([ad2c734](https://github.com/budaya-lab/penjaga/commit/ad2c734b8bf0066ec0ef6f96d2ff114f1d32f7ea))
* **steward:** omit hidden entries from directory counts ([3ace781](https://github.com/budaya-lab/penjaga/commit/3ace7812a1c719f27f850e6cf1aeaf8baefc5509))

## [3.1.0](https://github.com/budaya-lab/penjaga/compare/v3.0.0...v3.1.0) (2026-11-23)


### Features

* **steward:** add demo datasets and widen README tables ([7f15239](https://github.com/budaya-lab/penjaga/commit/7f15239bb474acf2082717cb7c81cf1acd19294f))
* **steward:** add demo datasets and widen README tables ([4e5736a](https://github.com/budaya-lab/penjaga/commit/4e5736aa2329630e59f0e0b467722d774d5a8ff5))

## [3.0.0](https://github.com/budaya-lab/penjaga/compare/v2.0.0...v3.0.0) (2026-11-23)


### ⚠ BREAKING CHANGES

* parseBuckets now returns valueColumn and BucketRow no longer guarantees a count property.

### Features

* accept arbitrary non-negative bucket metrics ([0526f3c](https://github.com/budaya-lab/penjaga/commit/0526f3ccbbaa58f0983630927c9392d8eb2c5367))

## [2.0.0](https://github.com/budaya-lab/penjaga/compare/v1.1.0...v2.0.0) (2026-11-20)


### ⚠ BREAKING CHANGES

* new packages use @penjaga/validator and the penjaga-validate CLI instead of the former package scope and command.

### Features

* **steward:** generate dataset readmes on save ([ea1e508](https://github.com/budaya-lab/penjaga/commit/ea1e508d008a14c6d91a638666ce36ad4cc60bc8))
* **steward:** generate dataset readmes on save ([f2d7fb3](https://github.com/budaya-lab/penjaga/commit/f2d7fb3cfb40855be14cea3cb7f7b38aa6b2a810))


### Code Refactoring

* rename project to penjaga ([d1c2e2f](https://github.com/budaya-lab/penjaga/commit/d1c2e2fd84451abae80bb76eb09cf7b18f057e1d))

## [1.1.0](https://github.com/budaya-lab/lazydata/compare/v1.0.1...v1.1.0) (2026-11-20)


### Features

* **steward:** add contributor rows ([385075b](https://github.com/budaya-lab/lazydata/commit/385075b026db73b9c4e1bc3aa421b7008241af53))
* **steward:** add filtered dataset dashboard navigation ([939473d](https://github.com/budaya-lab/lazydata/commit/939473d8fe9c22f5db65a0795d0dc9f64d53ee24))
* **steward:** add local license tags ([bd46afb](https://github.com/budaya-lab/lazydata/commit/bd46afb062bcc650dde568153a8c3ea5819ca6da))
* **steward:** add local metadata editing and save ([cb48e66](https://github.com/budaya-lab/lazydata/commit/cb48e66b4d32f54c15e4e6d2a5be2fa44e58d39a))
* **steward:** add local metadata keyword fields ([3e1c5f7](https://github.com/budaya-lab/lazydata/commit/3e1c5f7d863759f833a9047cafc8aff4b5287300))
* **steward:** add local resource rows and counts ([ae6bf24](https://github.com/budaya-lab/lazydata/commit/ae6bf24bed04653d62c99c9168d1844e7657ff24))
* **steward:** add local source rows ([54ce204](https://github.com/budaya-lab/lazydata/commit/54ce2044c061ec5fa3146e1edfd86c228f2cbee3))
* **steward:** add read-only dataset discovery ([600a19d](https://github.com/budaya-lab/lazydata/commit/600a19d7671d997f153757afeb733910d890ce07))
* **steward:** add version and created overview fields ([720a072](https://github.com/budaya-lab/lazydata/commit/720a0728fcae67440671f0adfdbc88ae3b96dbe6))
* **steward:** inspect metadata and show validation status ([de84aec](https://github.com/budaya-lab/lazydata/commit/de84aec319b6385eed4e74c5c71c2e32bf23a460))
* **steward:** prefill required metadata overview fields ([2024ec3](https://github.com/budaya-lab/lazydata/commit/2024ec3a7d4a2d6583205d643b9679abf1cbcb42))
* **steward:** recheck metadata drafts after edits ([8642990](https://github.com/budaya-lab/lazydata/commit/86429907b4cb86f0ca24d1976d45aadef5d3106b))
* **steward:** render dataset README files safely ([eae449a](https://github.com/budaya-lab/lazydata/commit/eae449aaf9138f379cbefc31373fba6966c02827))
* **steward:** save metadata draft ([ffe74a5](https://github.com/budaya-lab/lazydata/commit/ffe74a5487621a8c41756d51125d8b9c88eb10e3))
* **steward:** synchronize metadata through one object draft ([998c797](https://github.com/budaya-lab/lazydata/commit/998c79762f31b5743a8b120e83bb42ea6abfb8b6))


### Bug Fixes

* **steward:** pin local HTTP request origins ([20db769](https://github.com/budaya-lab/lazydata/commit/20db76952ec7b4ad2d588b98792e0de54e5f6d30))

## [1.0.1](https://github.com/budaya-lab/lazydata/compare/v1.0.0...v1.0.1) (2026-11-16)


### Bug Fixes

* **metadata:** avoid coercing invalid resource names ([208ee13](https://github.com/budaya-lab/lazydata/commit/208ee13ced36071937c8914582b80f03a2dcb6fc))
* **metadata:** avoid coercing invalid resource names ([dc2decc](https://github.com/budaya-lab/lazydata/commit/dc2decc6ebcc44358d7ad7bafc1617ea717c4858))

## [1.0.0](https://github.com/budaya-lab/lazydata/compare/v0.1.0...v1.0.0) (2026-11-16)


### ⚠ BREAKING CHANGES

* **node:** require node 24 lts

### Features

* **release:** publish installable validator archives ([a5053b6](https://github.com/budaya-lab/lazydata/commit/a5053b6856afef73eaa84c008452804d790047e4))


### Build System

* **node:** require node 24 lts ([0235c40](https://github.com/budaya-lab/lazydata/commit/0235c40e33ff88ee3bf719071bedfb5bff071843))

## 0.1.0 (2026-11-13)


### Features

* **validation:** add shared read-only dataset validator ([80796ab](https://github.com/budaya-lab/lazydata/commit/80796abe97c1108f529f3915181183f1937397d1))
* **validation:** bootstrap shared validator and CI ([73da717](https://github.com/budaya-lab/lazydata/commit/73da7172d9131b88d91cd582d46d97e541a9b8b2))
