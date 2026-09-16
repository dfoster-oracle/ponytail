#!/usr/bin/env node
// Supply plugin context for AIPack command hooks; native hooks own all behavior.
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { getConfigDir } = require('./ponytail-config.cjs');

const script = {
  'run.start': 'ponytail-activate.js',
  'prompt.submit': 'ponytail-mode-tracker.js',
}[process.argv[2]];

let input = '';
let done = false;
function finish() {
  if (done) return;
  done = true;
  if (!script) return;
  let payload;
  try { payload = JSON.parse(input.replace(/^\uFEFF/, '')); } catch (_) { return; }
  // OpenCode's command-hook runner discards stdout; use Ponytail's native plugin.
  if (!payload.hook_event_name) return;

  const env = { ...process.env };
  const sessions = path.join(env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'sessions') + path.sep;
  if (!env.PLUGIN_DATA && (env.CODEX_THREAD_ID || payload.turn_id ||
      String(payload.transcript_path || '').startsWith(sessions))) {
    env.PLUGIN_DATA = path.join(getConfigDir(), 'codex');
  }
  const result = spawnSync(process.execPath, [path.join(__dirname, script)], {
    env, input, stdio: ['pipe', 'inherit', 'inherit'], timeout: 3000,
  });
  process.exitCode = result.status ?? 1;
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', finish);
process.stdin.on('error', () => { finish(); process.exit(process.exitCode || 0); });
setTimeout(() => { finish(); process.exit(process.exitCode || 0); }, 1000).unref();
