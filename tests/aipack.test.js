const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const adapter = path.join(repoRoot, 'hooks', 'ponytail-aipack.cjs');

function runAdapter(event, payload, configHome) {
  const result = spawnSync(process.execPath, [adapter, event], {
    cwd: repoRoot,
    env: {
      ...process.env,
      XDG_CONFIG_HOME: configHome,
      PONYTAIL_DEFAULT_MODE: 'full',
    },
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('AIPack startup hook emits Codex-compatible native context', (t) => {
  const configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ponytail-aipack-'));
  t.after(() => fs.rmSync(configHome, { recursive: true, force: true }));

  const output = runAdapter('run.start', {}, configHome);
  assert.deepEqual(Object.keys(output), ['hookSpecificOutput']);
  assert.equal(output.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(output.hookSpecificOutput.additionalContext, /PONYTAIL MODE ACTIVE/);
});

test('AIPack prompt hook switches Ponytail mode', (t) => {
  const configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ponytail-aipack-'));
  t.after(() => fs.rmSync(configHome, { recursive: true, force: true }));

  const output = runAdapter('prompt.submit', { prompt: '/ponytail ultra' }, configHome);
  assert.deepEqual(Object.keys(output), ['hookSpecificOutput']);
  assert.equal(output.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.match(output.hookSpecificOutput.additionalContext, /level: ultra/);
});
