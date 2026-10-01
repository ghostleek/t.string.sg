#!/bin/bash
# PostToolUse: after the agent edits a .ts file, typecheck the project and feed any
# errors straight back to it. Exit 2 = "show stderr to the agent"; exit 0 = silent.
set -uo pipefail

file=$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).tool_input?.file_path??"")}catch{}})')
case "$file" in
  *.ts) ;;
  *) exit 0 ;;
esac

cd "$CLAUDE_PROJECT_DIR"
if ! out=$(npx tsc --noEmit 2>&1); then
  echo "Typecheck failed after editing $file:" >&2
  echo "$out" >&2
  exit 2
fi
