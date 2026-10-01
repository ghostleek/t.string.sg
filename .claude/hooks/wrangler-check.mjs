// Decides whether a shell command's wrangler usage is allowed. Called by guard-prod.sh
// with the command on stdin; exit 0 = allowed, exit 1 = blocked (reason on stdout).
//
// Text matching isn't enough: "--local" inside a quoted string or a comment, or an
// allowed `wrangler --version` chained before a dangerous call, would all pass a grep.
// So the command is split into separate commands and words the way a shell would,
// and every wrangler call is checked on its own against the verified safe forms.

// Shell-style split: returns one array of words per command. Separators are
// ; & | newline and the substitution/grouping characters $ ( ) `, outside quotes.
// A # starting a word comments out the rest of that line.
function splitCommands(src) {
  const cmds = [];
  let words = [];
  let word = null;
  const endWord = () => {
    if (word !== null) words.push(word);
    word = null;
  };
  const endCmd = () => {
    endWord();
    if (words.length) cmds.push(words);
    words = [];
  };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "'") {
      const j = src.indexOf("'", i + 1);
      word = (word ?? '') + src.slice(i + 1, j === -1 ? src.length : j);
      i = j === -1 ? src.length : j;
    } else if (c === '"') {
      let s = '';
      i++;
      while (i < src.length && src[i] !== '"') {
        if (src[i] === '\\' && i + 1 < src.length) i++;
        s += src[i++];
      }
      word = (word ?? '') + s;
    } else if (c === '\\' && i + 1 < src.length) {
      word = (word ?? '') + src[++i];
    } else if (c === '#' && word === null) {
      while (i < src.length && src[i] !== '\n') i++;
      endCmd();
    } else if (';&|\n$()`'.includes(c)) {
      endCmd();
    } else if (/\s/.test(c)) {
      endWord();
    } else {
      word = (word ?? '') + c;
    }
  }
  endCmd();
  return cmds;
}

// The only wrangler forms an agent may run. Everything else is blocked, because many
// subcommands (d1 delete, d1 list, kv, r2…) act on Cloudflare without any --remote flag.
function allowedCall(args) {
  const remote = args.some((a) => a === '--remote' || a.startsWith('--remote='));
  const local = args.includes('--local');
  if (args.length === 1 && ['--version', '-v', '--help', '-h'].includes(args[0])) return true;
  if (args[0] === 'dev') return !remote;
  if (args[0] === 'd1' && local && !remote) {
    if (args[1] === 'execute') return true;
    if (args[1] === 'migrations' && ['apply', 'list', 'create'].includes(args[2])) return true;
  }
  return false;
}

let src = '';
process.stdin.on('data', (d) => (src += d));
process.stdin.on('end', () => {
  // "wrangler" as a word, but not a filename like wrangler.jsonc.
  const mentions = (src.match(/(?<![\w-])wrangler(?![\w.-])/g) ?? []).length;
  let allowed = 0;
  for (const words of splitCommands(src)) {
    const i = words.findIndex((w) => w === 'wrangler' || w.endsWith('/wrangler'));
    if (i === -1) continue;
    if (!allowedCall(words.slice(i + 1))) {
      console.log(`wrangler ${words.slice(i + 1).join(' ')}`.trim());
      process.exit(1);
    }
    allowed++;
  }
  // A mention that isn't a verified call (e.g. inside bash -c "…" or "$(…)") is
  // treated as a possible hidden call and blocked.
  if (mentions > allowed) {
    console.log('wrangler call inside a string or substitution');
    process.exit(1);
  }
  process.exit(0);
});
