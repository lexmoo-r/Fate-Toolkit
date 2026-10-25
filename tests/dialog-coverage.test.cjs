const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const ux = read('scripts/ux.js');
assert.match(ux, /faw-toolkit-confirm/, 'all FateToolkitUX confirmations must use the toolkit dialog shell');

const main = read('scripts/main.js');
assert.ok((main.match(/faw-compact-dialog/g) || []).length >= 2, 'aspect/consequence editor dialogs must use compact toolkit surfaces');

const sheet = read('scripts/character-sheet.js');
assert.match(sheet, /standard-form faw-toolkit-dialog faw-custom-field-dialog/, 'custom field editor must use the toolkit dialog shell');

const chat = read('scripts/chat-actions.js');
assert.match(chat, /class="faw-toolkit-dialog"/, 'chat consequence prompt must use the toolkit dialog shell');
assert.ok(!chat.includes('window: { title: "Последствие" }'), 'consequence prompt title must be localized');
assert.ok(!chat.includes('label: "Принять последствие"'), 'consequence prompt primary action must be localized');

const roll = read('scripts/roll-request.js');
assert.ok((roll.match(/frr-opposition-prompt/g) || []).length >= 5, 'roll workflow dialogs must use the roll-request dialog shell');

const help = read('scripts/help.js');
assert.match(help, /window:\s*\{\s*title:\s*"FAW\.Help"/, 'help window title must use a localization key');

const css = read('styles/ui-polish.css');
for (const token of ['.faw-toolkit-confirm', '.faw-toolkit-dialog', '.faw-compact-dialog', '.faw-custom-field-dialog']) {
  assert.ok(css.includes(token), `ui-polish.css does not cover ${token}`);
}
assert.match(css, /\.application:has\(\.faw-toolkit-confirm, \.faw-toolkit-dialog, \.faw-compact-dialog\)/,
  'remaining DialogV2 windows must inherit the common toolkit shell');

console.log('dialog-coverage.test.cjs OK');
