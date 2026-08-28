#!/bin/bash
# Regenerate browser media from a legally owned Civ2 MGE installation.
# Requires: ffmpeg, ffprobe, Node.js, and npm dependencies.
#
# Usage:
#   tools/extract-assets.sh "/path/to/Civilization 2"
#   CIV2_MGE_PATH="/path/to/Civilization 2" tools/extract-assets.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE_ARG="${1:-${CIV2_MGE_PATH:-}}"

if [ -z "$SOURCE_ARG" ] || [ ! -d "$SOURCE_ARG" ]; then
  echo "Usage: tools/extract-assets.sh /path/to/Civilization-2-MGE"
  exit 1
fi

CIV2_DIR="$(cd "$SOURCE_ARG" && pwd)"
OUT_DIR="$PROJECT_DIR/public/sprites/extracted"
mkdir -p "$OUT_DIR/intro" "$OUT_DIR/palace" "$OUT_DIR/tiles" \
  "$OUT_DIR/wonders" "$OUT_DIR/video" "$OUT_DIR/heralds"

has_audio_stream() {
  ffprobe -v error -select_streams a:0 -show_entries stream=codec_type \
    -of default=noprint_wrappers=1:nokey=1 "$1" 2>/dev/null | grep -q '^audio$'
}

ensure_webm() {
  local input="$1"
  local output="$2"
  local tmp="${output%.webm}.tmp.webm"

  if [ -f "$output" ]; then
    if has_audio_stream "$input" && ! has_audio_stream "$output"; then
      ffmpeg -y -i "$output" -i "$input" -map 0:v:0 -map 1:a:0 \
        -c:v copy -c:a libopus -b:a 64k -shortest "$tmp" 2>/dev/null
      mv "$tmp" "$output"
      echo "  $(basename "$output") + original audio"
    else
      echo "  $(basename "$output") (already converted)"
    fi
    return
  fi

  ffmpeg -y -i "$input" -map 0:v:0 -map 0:a:0? \
    -c:v libvpx-vp9 -crf 36 -b:v 0 -row-mt 1 \
    -c:a libopus -b:a 64k "$tmp" 2>/dev/null
  mv "$tmp" "$output"
  echo "  $(basename "$output")"
}

echo "=== Extracting MGE interface artwork ==="
node "$SCRIPT_DIR/extract-mge-intro.js" "$CIV2_DIR" "$OUT_DIR/intro"
node "$SCRIPT_DIR/extract-mge-ui-backgrounds.js" "$CIV2_DIR" "$OUT_DIR/tiles"
node "$SCRIPT_DIR/extract-mge-throne-room.js" "$CIV2_DIR" "$OUT_DIR/palace"

echo "=== Converting Wonder movies ==="
VIDEO_DIR="$CIV2_DIR/Video"
for avi in "$VIDEO_DIR"/WONDER*.AVI; do
  [ -f "$avi" ] || continue
  base=$(basename "$avi" .AVI)
  ensure_webm "$avi" "$OUT_DIR/wonders/$base.webm"
done

echo "=== Converting event and council movies ==="
for avi in "$VIDEO_DIR"/OPENING.AVI "$VIDEO_DIR"/WINWIN.AVI "$VIDEO_DIR"/LAUNCH.AVI \
           "$VIDEO_DIR"/COUNCIL*.AVI "$VIDEO_DIR"/ANARCHY*.AVI "$CIV2_DIR"/LOSER.AVI; do
  [ -f "$avi" ] || continue
  base=$(basename "$avi" .AVI)
  ensure_webm "$avi" "$OUT_DIR/video/$base.webm"
done

echo "=== Converting diplomatic heralds ==="
for avi in "$CIV2_DIR"/KINGS/HRLD*.AVI; do
  [ -f "$avi" ] || continue
  base=$(basename "$avi" .AVI)
  ensure_webm "$avi" "$OUT_DIR/heralds/$base.webm"
done

echo "=== Done ==="
echo "Browser assets: $OUT_DIR"
