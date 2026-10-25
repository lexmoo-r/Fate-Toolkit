const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

for (const rel of ['scripts/chat-actions.js', 'scripts/roll-request.js', 'scripts/conflict-flow.js']) {
  const src = fs.readFileSync(path.join(root, rel), 'utf8');
  assert.ok(!src.includes('{ once: true }'), `${rel}: retryable chat/result controls must not consume their listener on cancel/no-op`);
}

const chat = fs.readFileSync(path.join(root, 'scripts/chat-actions.js'), 'utf8');
assert.match(chat, /if \(result === null \|\| result === undefined\) return;/, 'closing the consequence prompt must leave the choice untouched');
assert.match(chat, /if \(!consequenceName\) return globalThis\.FateToolkitUX\.warn/, 'blank consequence names must abort without committing damage');

const rolls = fs.readFileSync(path.join(root, 'scripts/roll-request.js'), 'utf8');
assert.match(rolls, /const name = await promptCreatedAspectName[\s\S]*?if \(!name\) return;/, 'blank/cancelled created-aspect prompt must remain a no-op');
assert.match(rolls, /const name = await promptBoostName\(\);[\s\S]*?if \(name === null\) return;/, 'cancelled boost prompt must remain a no-op');

console.log('v1463-regression.test.cjs OK');
