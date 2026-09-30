#!/bin/bash
# SessionStart: make a fresh cloud container ready to test before the agent starts.
# Synchronous on purpose, so `npm test` never races a half-finished install.
set -euo pipefail

# Local machines already have node_modules; only cloud sessions start empty.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"
# `npm ci`, not `npm install`: it installs exactly what the lockfile says and never
# rewrites it. The container's npm can be older than the one that wrote the lockfile,
# and `npm install` would then dirty package-lock.json in every session.
npm ci --no-audit --no-fund
