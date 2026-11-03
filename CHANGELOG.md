# Changelog

All notable changes to Parasocial are documented here. Releases are tagged
`v<version-name>` and carry the installable ZIP as their only asset.

## 1.2 — 2026-11-03

GNOME Shell 51 support, plus the code changes needed to stay within the
extensions.gnome.org review guidelines.

- Fixed the panel staying on "Update Failed" on GNOME Shell 51. St removed the
  `vertical` property from `St.BoxLayout` in 51 (`src/st/st-box-layout.c` has it
  in 48.0 and 50.0, not in 51.0), so building a streamer row threw
  `No property vertical on StBoxLayout` and the update aborted before any list
  was rendered. The rows now use `orientation`, which exists in 48–51.
- `shell-version` now advertises 51 alongside 48, 49 and 50.
- Streamer avatar icons are created in `shell_icons.js`, a Shell-only module.
  `icons.js` no longer reaches for `imports.gi.St`, so the preferences process
  stops pulling a Shell library (and the legacy `imports` object) into GTK.
- Notifications are attached to the Shell's own message tray instead of a
  second `MessageTray` instance, which was never added to the stage and so could
  not display a banner; the notification source is now destroyed in `disable()`
  together with the menu signal handler the extension kept connected.
- The OAuth callback receiver is a GJS script (`oauth_receive.js`) rather than
  Python, as the review guidelines require helper scripts to be GJS unless
  another language is unavoidable. It binds to 127.0.0.1 only and exits after
  five idle minutes instead of running until it receives a token.
- The authorization page is opened with `Gio.AppInfo.launch_default_for_uri()`
  instead of spawning `xdg-open` through a command line.
- Removed a debug `console.log` that printed the icon settings on every menu
  rebuild.

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
