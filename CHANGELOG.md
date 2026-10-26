# Changelog

All notable changes to Parasocial are documented here. Releases are tagged
`v<version-name>` and carry the installable ZIP as their only asset.

## 1.1 — 2026-10-26

Release packaging and metadata cleanup. The extension behaviour is unchanged
from 1.0; this release exists so the project can be distributed through
extensions.gnome.org and from GitHub releases.

- `metadata.json` now follows the extensions.gnome.org rules: the deprecated
  integer `version` field is gone (the site assigns it), and `version-name`
  tracks the release tag.
- `shell-version` claims only the stable Shell series (48, 49, 50). GNOME 51
  will be added once it is released and tested, since an extension must not
  claim support for future Shell versions.
- Added `scripts/package.sh`, which stages and packages the extension into
  `dist/target/Parasocial@corngoblin.github.io.shell-extension.zip` and checks
  the bundle before it can be published.
- Added `.github/workflows/release.yml`: pushing a `v*` tag packages that commit
  and attaches the ZIP to the GitHub release.
- The release ZIP ships the GSettings schema XML only — `schemas/gschemas.compiled`
  is no longer committed, because `gnome-extensions install` and
  extensions.gnome.org compile the schema themselves.
- The release ZIP ships compiled translations only; `.po`/`.pot` sources stay in
  the repository (extensions.gnome.org rejects submissions that bundle them).
- `README.md` gained installation instructions for both distribution channels,
  including the logout/login step and the reason not to unzip the archive by hand.

## 1.0

- Initial release.
