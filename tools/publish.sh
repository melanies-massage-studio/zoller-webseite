#!/bin/bash
# Baut eine Länderseite und veröffentlicht sie in ihrem eigenen GitHub-Repository (GitHub Pages, Branch main).
#
# Aufruf:  tools/publish.sh ca            ZOLLER Canada -> github.com/mzollercreations/zoller-canada
#          tools/publish.sh mx            ZOLLER México -> github.com/mzollercreations/zoller-mexico
#          tools/publish.sh us            ZOLLER USA -> github.com/mzollercreations/zoller-usa
#          tools/publish.sh ca "Nachricht" mit eigener Commit-Nachricht
#
# Das Ausgabeverzeichnis (dist/<repo>) ist ein Klon des Länder-Repos; build.py lässt .git, fileadmin/ und CNAME stehen.
set -euo pipefail
site="${1:?Länderseite angeben: ca, mx oder us}"
cd "$(dirname "$0")/.."
read -r repo out < <(python3 -c "import json,sys; s=json.load(open('content/sites.json'))['$site']; print(s['repo'], s['out'])")
owner=mzollercreations
url="https://github.com/$owner/$repo.git"

if [ ! -d "$out/.git" ]; then
  tmp="$(mktemp -d)"
  if git clone -q --no-checkout --depth 1 "$url" "$tmp/repo" 2>/dev/null; then
    mkdir -p "$out" && mv "$tmp/repo/.git" "$out/.git"
  else
    mkdir -p "$out" && git -C "$out" init -q -b main && git -C "$out" remote add origin "$url"
  fi
  rm -rf "$tmp"
fi

python3 tools/build.py --site "$site"

src="$(git rev-parse --short HEAD 2>/dev/null || echo lokal)"
msg="${2:-Webseite aktualisiert (zoller-webseite $src)}"
git -C "$out" checkout -q -B main 2>/dev/null || true
git -C "$out" add -A
if git -C "$out" diff --cached --quiet 2>/dev/null && git -C "$out" rev-parse -q --verify HEAD >/dev/null; then
  echo "Keine Änderungen – nichts zu veröffentlichen."
  exit 0
fi
git -C "$out" commit -q -m "$msg"
git -C "$out" push -q -u origin main
echo "Veröffentlicht: https://$owner.github.io/$repo/"
