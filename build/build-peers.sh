#!/usr/bin/env bash
# Build docs/PEERS-LANDSCAPE.pdf from the markdown source.
# Same pipeline as build-primer.sh / build-report.sh.

set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/docs/PEERS-LANDSCAPE.md"
HTML="$ROOT/docs/PEERS-LANDSCAPE.html"
OUT="$ROOT/docs/PEERS-LANDSCAPE.pdf"

if ! command -v pandoc >/dev/null 2>&1; then
  echo "[build] pandoc not found." >&2
  exit 1
fi

CHROME=""
for c in \
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  "/Applications/Chromium.app/Contents/MacOS/Chromium" \
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
do
  if [[ -n "$c" && -x "$c" ]]; then CHROME="$c"; break; fi
done
[[ -z "$CHROME" ]] && { echo "[build] Chrome not found." >&2; exit 1; }

read -r -d '' CSS <<'CSS' || true
@page { size: A4; margin: 22mm 18mm 22mm 18mm; }
body {
  font-family: -apple-system, "AppleSDGothicNeo-Regular", "Apple SD Gothic Neo",
               "Helvetica Neue", "Noto Sans CJK KR", sans-serif;
  font-size: 10.2pt; line-height: 1.55; color: #222;
  max-width: 760px; margin: 0 auto;
}
h1 { font-size: 19pt; border-bottom: 2px solid #333; padding-bottom: 6px; margin-top: 26pt; page-break-before: always; }
h1:first-of-type { page-break-before: avoid; }
h2 { font-size: 14pt; margin-top: 18pt; color: #1a3d7a; border-bottom: 1px solid #ccd; padding-bottom: 3px; }
h3 { font-size: 12pt; margin-top: 14pt; color: #2a5da6; }
h4 { font-size: 10.5pt; margin-top: 10pt; color: #444; }
p, li { font-size: 10.2pt; }
code { font-family: "SF Mono", Menlo, monospace; font-size: 9.3pt;
       background: #f3f3f3; padding: 1px 4px; border-radius: 3px; }
pre  { background: #f6f6f6; border-left: 3px solid #aaa; padding: 8px 12px;
       font-size: 9pt; line-height: 1.4; overflow-x: auto;
       page-break-inside: avoid; }
pre code { background: transparent; padding: 0; }
table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 9.5pt;
        page-break-inside: avoid; }
th, td { border: 1px solid #bbb; padding: 5px 7px; text-align: left; vertical-align: top; }
th { background: #f0f0f0; }
blockquote { border-left: 3px solid #1a3d7a; margin: 10px 0; padding: 6px 14px;
             color: #333; background: #f5f8fc; font-size: 10.5pt; }
hr { border: none; border-top: 1px solid #ccc; margin: 24px 0; }
strong { color: #111; }
a { color: #1a3d7a; }
em { color: #555; }
CSS

echo "[build] pandoc → HTML"
pandoc \
  --from=markdown \
  --to=html5 \
  --standalone \
  --metadata title="우리 프로젝트의 경쟁/동료 지형" \
  --metadata lang=ko \
  --css="data:text/css;base64,$(printf '%s' "$CSS" | base64 -b 0 2>/dev/null || printf '%s' "$CSS" | base64 -w 0)" \
  -o "$HTML" "$SRC"

echo "[build] Chrome headless → PDF"
"$CHROME" --headless=new --no-pdf-header-footer --no-sandbox --disable-gpu \
  --print-to-pdf="$OUT" --no-margins "file://$HTML" 2>/dev/null

echo "[build] $(du -h "$OUT" | cut -f1) → $OUT"
