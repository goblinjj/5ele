#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

echo "▶ Building..."
npm run build

echo "▶ Deploying to Cloudflare Pages..."
npx wrangler pages deploy dist \
  --project-name=5ele \
  --branch=main \
  --commit-message="${1:-deploy}"

echo "✓ Done"
