#!/usr/bin/env bash
# Install git-platform MCP server dependencies.
# Run once after installing the plugin; re-run only if deps change.
set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PLUGIN_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is required (>= 18.17) but 'node' was not found on PATH." >&2
  echo "Install Node and re-run this script." >&2
  exit 1
fi

NODE_MAJOR="$(node -e 'console.log(process.versions.node.split(".")[0])')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "Error: Node.js >= 18.17 is required. Detected: $(node -v)" >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is required but was not found on PATH." >&2
  exit 1
fi

echo "Installing git-platform dependencies in: $PLUGIN_DIR"
npm install --no-fund --no-audit
echo ""
echo "Done. git-platform is ready to use."
echo ""
echo "Next steps:"
echo "  - GitHub ops:    gh auth login        (one-time)"
echo "  - GitLab ops:    glab auth login      (one-time)"
echo "  - Bitbucket ops: export BITBUCKET_USERNAME=... BITBUCKET_TOKEN=..."
