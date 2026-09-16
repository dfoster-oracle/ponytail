const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const repoRoot = path.resolve(process.env.PONYTAIL_TEST_PACK_ROOT || path.join(__dirname, '..'));
const adapter = path.join(repoRoot, 'hooks', 'ponytail-aipack.cjs');

function run(event, payload, env) {
  const result = spawnSync(process.execPath, [adapter, event], {
    env, input: JSON.stringify(payload), encoding: 'utf8', timeout: 5000,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout ? JSON.parse(result.stdout) : null;
}

function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ponytail-aipack-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const env = { ...process.env, XDG_CONFIG_HOME: dir, PONYTAIL_DEFAULT_MODE: 'full',
    CODEX_HOME: path.join(dir, 'custom-codex'), CLAUDE_CONFIG_DIR: path.join(dir, 'claude') };
  for (const key of ['CODEX_THREAD_ID', 'PLUGIN_DATA', 'COPILOT_PLUGIN_DATA',
    'CLAUDE_PLUGIN_ROOT', 'CURSOR_VERSION', 'QODER_SESSION_ID']) delete env[key];
  return { dir, env };
}

test('AIPack runs native Codex activation, commands and post-compaction startup', (t) => {
  const { dir, env } = setup(t);
  const start = { hook_event_name: 'SessionStart', source: 'startup',
    transcript_path: path.join(env.CODEX_HOME, 'sessions', 'rollout-test.jsonl') };
  let output = run('run.start', start, env);
  assert.equal(output.systemMessage, 'PONYTAIL:FULL');
  assert.equal(output.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(output.hookSpecificOutput.additionalContext, /PONYTAIL MODE ACTIVE/);
  assert.doesNotMatch(output.hookSpecificOutput.additionalContext, /STATUSLINE SETUP/);
  const state = path.join(dir, 'ponytail', 'codex', '.ponytail-active');
  assert.equal(fs.readFileSync(state, 'utf8'), 'full');

  const prompt = (text) => run('prompt.submit',
    { hook_event_name: 'UserPromptSubmit', turn_id: 'test-turn', prompt: text }, env);
  output = prompt('/ponytail:ponytail ultra');
  assert.equal(output.systemMessage, 'PONYTAIL:ULTRA');
  assert.equal(fs.readFileSync(state, 'utf8'), 'ultra');
  assert.match(prompt('/ponytail').hookSpecificOutput.additionalContext, /MODE ACTIVE.*ultra/);
  assert.equal(prompt('add a normal mode toggle'), null);
  assert.equal(fs.readFileSync(state, 'utf8'), 'ultra');
  prompt('/ponytail-review');
  assert.equal(fs.readFileSync(state, 'utf8'), 'review');
  prompt('stop ponytail');
  assert.equal(fs.existsSync(state), false);
  prompt('/ponytail default lite');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'ponytail', 'config.json'))).defaultMode, 'lite');

  // Match native activation semantics: SessionStart loads the configured default.
  const configured = { ...env };
  delete configured.PONYTAIL_DEFAULT_MODE;
  output = run('run.start', { ...start, source: 'compact' }, configured);
  assert.equal(output.systemMessage, 'PONYTAIL:LITE');
  assert.match(output.hookSpecificOutput.additionalContext, /level: lite/);
  assert.equal(run('compact.before', { hook_event_name: 'PreCompact' }, env), null);
  const descriptor = fs.readFileSync(path.join(repoRoot, 'hooks/ponytail-aipack/HOOK.yaml'), 'utf8');
  assert.doesNotMatch(descriptor, /compact.before/);
});

test('AIPack preserves native plugin state and Claude output; ignores unsupported envelopes', (t) => {
  const { dir, env } = setup(t);
  const pluginEnv = { ...env, PLUGIN_DATA: path.join(dir, 'plugin') };
  assert.equal(run('run.start', { hook_event_name: 'SessionStart' }, pluginEnv).systemMessage, 'PONYTAIL:FULL');
  assert.equal(fs.readFileSync(path.join(pluginEnv.PLUGIN_DATA, '.ponytail-active'), 'utf8'), 'full');

  const result = spawnSync(process.execPath, [adapter, 'run.start'], {
    env, input: JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup' }), encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^PONYTAIL MODE ACTIVE/);
  assert.equal(fs.readFileSync(path.join(env.CLAUDE_CONFIG_DIR, '.ponytail-active'), 'utf8'), 'full');
  assert.equal(run('run.start', { event: 'run.start', input: {}, output: {} }, env), null);
});
