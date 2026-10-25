const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

const ru = JSON.parse(fs.readFileSync(path.join(root, 'lang/ru.json'), 'utf8'));
const en = JSON.parse(fs.readFileSync(path.join(root, 'lang/en.json'), 'utf8'));
const uiFiles = [
  'scripts/action-opposition-ui.js',
  'scripts/player-opposition-ui.js',
  'scripts/defend-choice-ui.js',
  'scripts/roll-request-ui.js',
  'scripts/sound-settings-ui.js'
];

for (const rel of uiFiles) {
  const source = fs.readFileSync(path.join(root, rel), 'utf8');
  assert.ok(!/[А-Яа-яЁё]/.test(source), `${rel}: dynamic UI service contains authored Cyrillic copy`);
  const keys = [...source.matchAll(/(?:localize|\bt)\(\s*["']([^"']+)["']/g)].map(m => m[1]);
  for (const key of keys) {
    assert.ok(Object.prototype.hasOwnProperty.call(ru, key), `${rel}: missing Russian localization ${key}`);
    assert.ok(Object.prototype.hasOwnProperty.call(en, key), `${rel}: missing English localization ${key}`);
  }
}

const rollSource = fs.readFileSync(path.join(root, 'scripts/roll-request.js'), 'utf8');
for (const legacy of [
  'window: { title: "Создание преимущества"',
  'window: { title: "Преодолеть аспект"',
  'window: { title: "Создать аспект"',
  'window: { title: "Добавить усиление"',
  '<span>Навык</span>',
  'label: "Продолжить"'
]) {
  assert.ok(!rollSource.includes(legacy), `roll-request.js still contains legacy dialog copy: ${legacy}`);
}
for (const key of [...rollSource.matchAll(/uiText\(\s*["'](FRR\.Dialog\.[^"']+)["']/g)].map(m => m[1])) {
  assert.ok(Object.prototype.hasOwnProperty.call(ru, key), `roll-request.js: missing Russian localization ${key}`);
  assert.ok(Object.prototype.hasOwnProperty.call(en, key), `roll-request.js: missing English localization ${key}`);
}
assert.match(rollSource, /data-stunt-search[^>]+aria-label=/, 'generated stunt search must have an accessible label');
assert.match(rollSource, /data-skill-search[^>]+aria-label=/, 'generated skill search must have an accessible label');

const css = fs.readFileSync(path.join(root, 'styles/ui-polish.css'), 'utf8');
assert.match(css, /\.application:has\(\.frr-opposition-prompt\)/, 'DialogV2 windows must inherit toolkit visual tokens');
assert.match(css, /\.frr-action-summary/, 'dynamic dialogs need a visual action summary');
assert.match(css, /\.frr-dialog-field/, 'dynamic dialogs need standardized fields');
assert.match(css, /\.frr-stunt-picker/, 'dynamic dialogs need a standardized stunt picker');
assert.match(css, /\.frr-rule-suggestion/, 'dynamic dialogs need standardized rule callouts');
assert.match(css, /\.frr-confirm-prompt/, 'confirmation dialogs need a standardized confirmation surface');

console.log('dialog-ui.test.cjs OK');
