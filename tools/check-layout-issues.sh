#!/bin/bash
# Run multi-language layout inspections and produce human-readable summary.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPORT_DIR="$ROOT_DIR/build/reports"

echo "🔍 Generating extension build for layout inspection..."
cd "$ROOT_DIR"
npm run build:dev >/dev/null

echo "🧪 Inspecting layout across supported languages..."
npm run test:i18n:layout

npm run report:layout >/dev/null

echo "✅ Layout inspection completed. Summary available at $(realpath "$REPORT_DIR/layout-summary.html")"
