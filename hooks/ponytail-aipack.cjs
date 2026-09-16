#!/usr/bin/env node
// AIPack hook adapter for Ponytail.
//
// AIPack renders one command into several harnesses. Claude and Codex consume
// hookSpecificOutput.additionalContext. OpenCode ignores command stdout, so
// keep the output to the native hook shape accepted by Claude and Codex.

const fs = require('fs');
const path = require('path');
const {
  getConfigDir,
  getDefaultMode,
  isDeactivationCommand,
  normalizeMode,
  getPonytailInstructions,
} = (() => {
  const config = require('./ponytail-config.cjs');
  return {
    ...config,
    getPonytailInstructions: require('./ponytail-instructions.cjs').getPonytailInstructions,
  };
})();

const event = process.argv[2];
const statePath = path.join(getConfigDir(), '.ponytail-aipack-active');

function readMode() {
  try {
    const mode = fs.readFileSync(statePath, 'utf8').trim();
    return normalizeMode(mode) || null;
  } catch (_) {
    return null;
  }
}

function setMode(mode) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, mode, 'utf8');
}

function clearMode() {
  try { fs.unlinkSync(statePath); } catch (_) {}
}

function inputPrompt(payload) {
  if (typeof payload.prompt === 'string') return payload.prompt;
  if (payload.input && typeof payload.input.prompt === 'string') return payload.input.prompt;
  if (payload.message && typeof payload.message.prompt === 'string') return payload.message.prompt;
  return '';
}

function nativeEventName(name) {
  return {
    'run.start': 'SessionStart',
    'prompt.submit': 'UserPromptSubmit',
    'compact.before': 'PreCompact',
  }[name] || name;
}

function emit(context) {
  if (!context) {
    process.stdout.write('{}\n');
    return;
  }
  const native = {
    hookEventName: nativeEventName(event),
    additionalContext: context,
  };
  process.stdout.write(JSON.stringify({ hookSpecificOutput: native }) + '\n');
}

function instructionsFor(mode) {
  if (!mode || mode === 'off') return '';
  return getPonytailInstructions(mode);
}

function handleStart() {
  const mode = readMode() || getDefaultMode();
  if (mode === 'off') {
    clearMode();
    emit('');
    return;
  }
  setMode(mode);
  emit(instructionsFor(mode));
}

function handlePrompt(payload) {
  const prompt = inputPrompt(payload).trim().toLowerCase();
  let mode = readMode() || getDefaultMode();

  if (isDeactivationCommand(prompt) || /^[/@$]ponytail\s+off$/.test(prompt)) {
    clearMode();
    emit('PONYTAIL MODE OFF');
    return;
  }

  const command = prompt.match(/^[/@$]ponytail(?:\s+(lite|full|ultra))?$/);
  if (command) {
    mode = command[1] || mode;
    if (!normalizeMode(mode) || mode === 'off') {
      clearMode();
      emit('PONYTAIL MODE OFF');
      return;
    }
    setMode(mode);
    emit('PONYTAIL MODE CHANGED — level: ' + mode + '\n\n' + instructionsFor(mode));
    return;
  }

  if (/^[/@$]ponytail-review$/.test(prompt)) {
    emit('PONYTAIL MODE ACTIVE — level: review. Behavior defined by /ponytail-review skill.');
  }
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => {
  let payload = {};
  try { payload = JSON.parse(raw || '{}'); } catch (_) {}

  if (event === 'run.start' || event === 'compact.before') {
    handleStart();
  } else if (event === 'prompt.submit') {
    handlePrompt(payload);
  } else {
    emit('');
  }
});
