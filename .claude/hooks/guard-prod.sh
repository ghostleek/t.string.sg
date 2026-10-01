#!/bin/bash
# PreToolUse on Bash: block commands that could touch production or local secrets.
# Permission deny rules only match command prefixes, so they miss other invocation
# forms (npm exec, ./node_modules/.bin/wrangler) and flags in any position; this
# checks the whole command string instead. Exit 2 = block and tell the agent why.
set -uo pipefail

cmd=$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).tool_input?.command??"")}catch{}})')

block() {
  echo "Blocked by .claude/hooks/guard-prod.sh: $1" >&2
  echo "Production is off-limits to agents (see CLAUDE.md). Give the user the exact command to run." >&2
  echo "If this is a false positive (e.g. the words appear in a commit message), put the text in a file instead." >&2
  exit 2
}

# Any wrangler invocation that deploys, manages secrets, or targets remote resources.
if grep -Eq '(^|[^[:alnum:]_-])wrangler([^[:alnum:]_-]|$)' <<<"$cmd" &&
   grep -Eq '(^|[[:space:]])(deploy|publish|secret|rollback|versions)([[:space:]]|$)|--remote([[:space:]=]|$)' <<<"$cmd"; then
  block "wrangler deploy/secret/--remote command"
fi

# npm scripts that wrap production operations, however they're invoked.
if grep -Eq '(^|[^[:alnum:]_:-])(deploy|db:migrate:remote)([^[:alnum:]_:-]|$)' <<<"$cmd" &&
   grep -Eq '(^|[^[:alnum:]_-])(npm|pnpm|yarn|bun)([^[:alnum:]_-]|$)' <<<"$cmd"; then
  block "npm script that deploys or migrates production"
fi

# The local admin password, read by any shell route (cat, grep, node, globs).
if grep -Eq '\.dev(\.|\*|\?|\[)' <<<"$cmd"; then
  block "reads .dev.vars (local secrets)"
fi

exit 0
