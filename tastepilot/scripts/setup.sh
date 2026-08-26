#!/usr/bin/env bash
# TastePilot one-time setup. Run from the tastepilot/ folder.
set -euo pipefail

if ! command -v node >/dev/null 2>&1; then
  echo "✗ Node.js 20+ is required. Install it from https://nodejs.org and re-run." >&2
  exit 1
fi

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "✗ Node.js 20+ is required (found $(node --version))." >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "→ Installing pnpm..."
  npm install -g pnpm
fi

echo "→ Installing dependencies..."
pnpm install

echo "→ Installing the rendering browser (Chromium)..."
pnpm exec playwright install chromium

echo "✓ TastePilot is ready. Try: pnpm dev canons"
