#!/usr/bin/env bash
#
# Build Parasocial into a release ZIP that both `gnome-extensions install` and
# extensions.gnome.org accept.
#
#   scripts/package.sh
#   -> dist/target/Parasocial@corngoblin.github.io.shell-extension.zip
#
# Nothing is compiled: the sources are shipped as-is. What matters is *which*
# files end up in the archive and their layout (everything at the root, never
# inside a folder), so this script stages the bundle explicitly instead of
# zipping the working tree.
set -euo pipefail

ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT"

die() { printf 'error: %s\n' "$*" >&2; exit 1; }

for tool in python3 zip unzip glib-compile-schemas; do
    command -v "$tool" >/dev/null || die "required tool not found: $tool"
done

meta() { python3 -c 'import json,sys;print(json.load(open("metadata.json"))[sys.argv[1]])' "$1"; }

UUID=$(meta uuid)
SCHEMA=$(meta settings-schema)
VERSION_NAME=$(meta version-name)

# Runtime files the Shell and the preferences window actually load.
FILES=(
    metadata.json
    extension.js
    prefs.js
    prefs.xml
    stylesheet.css
    api.js
    icons.js
    games.js
    menu_items.js
    topbar.js
    oauth_receive.py
    LICENSE.md
)
DIRS=(providers livestreamer-icons)

# ---------------------------------------------------------------- validation
python3 - <<'PY'
import json, sys

m = json.load(open("metadata.json"))

required = ["uuid", "name", "description", "shell-version", "url"]
missing = [k for k in required if not m.get(k)]
if missing:
    sys.exit("metadata.json is missing required keys: " + ", ".join(missing))

# extensions.gnome.org assigns this itself; shipping it is a review defect.
if "version" in m:
    sys.exit("metadata.json must not contain 'version' (extensions.gnome.org sets it)")

if not isinstance(m["shell-version"], list) or not m["shell-version"]:
    sys.exit("metadata.json 'shell-version' must be a non-empty list")

if not m["settings-schema"].startswith("org.gnome.shell.extensions."):
    sys.exit("settings-schema must start with org.gnome.shell.extensions.")
PY

for f in "${FILES[@]}"; do
    [[ -f $f ]] || die "missing runtime file: $f"
done
for d in "${DIRS[@]}"; do
    [[ -d $d ]] || die "missing runtime directory: $d"
done
[[ -f "schemas/${SCHEMA}.gschema.xml" ]] || die "missing schemas/${SCHEMA}.gschema.xml"

# ------------------------------------------------------------------- staging
OUT_DIR="dist/target"
ZIP="${OUT_DIR}/${UUID}.shell-extension.zip"
rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT

cp -- "${FILES[@]}" "$STAGE"/
for d in "${DIRS[@]}"; do
    cp -R -- "$d" "$STAGE/$d"
done

mkdir -p "$STAGE/schemas"
cp -- "schemas/${SCHEMA}.gschema.xml" "$STAGE/schemas/"

# Translations: compiled catalogues only. The .po/.pot sources stay in the repo,
# because extensions.gnome.org rejects submissions that bundle them.
shopt -s nullglob
mo_files=(locale/*/LC_MESSAGES/*.mo)
shopt -u nullglob
for mo in "${mo_files[@]}"; do
    install -D -m644 -- "$mo" "$STAGE/$mo"
done

# Prove the schema XML is valid, then remove the binary again: it is compiled
# by `gnome-extensions install` and server-side by extensions.gnome.org.
glib-compile-schemas --strict "$STAGE/schemas"
rm -f "$STAGE/schemas/gschemas.compiled"

find "$STAGE" -type f -exec chmod 644 {} +

# ----------------------------------------------------------------------- zip
( cd "$STAGE" && zip -q -X -r "$OLDPWD/$ZIP" . )

# ------------------------------------------------------------------ verify
unzip -Z1 "$ZIP" | grep -qx 'metadata.json' \
    || die "metadata.json is not at the archive root"

if unzip -Z1 "$ZIP" | grep -Eq '\.(po|pot)$|(^|/)gschemas\.compiled$'; then
    die "archive contains .po/.pot or a precompiled schema"
fi

for f in metadata.json extension.js prefs.js stylesheet.css "schemas/${SCHEMA}.gschema.xml"; do
    unzip -Z1 "$ZIP" | grep -qx "$f" || die "archive is missing: $f"
done

printf '\nPackaged %s %s\n' "$(meta name)" "$VERSION_NAME"
printf '  %s\n' "$ZIP"
printf '  entries: %s   size: %s   sha256: %s\n' \
    "$(unzip -Z1 "$ZIP" | wc -l)" \
    "$(du -h "$ZIP" | cut -f1)" \
    "$(sha256sum "$ZIP" | cut -d' ' -f1)"
