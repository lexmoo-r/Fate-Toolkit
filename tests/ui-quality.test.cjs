const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

const moduleJson = JSON.parse(fs.readFileSync(path.join(root, 'module.json'), 'utf8'));
assert.ok(moduleJson.styles.includes('styles/ui-polish.css'), 'UI polish stylesheet must be registered');
assert.ok(moduleJson.styles.includes('styles/component-audit.css'), 'component audit stylesheet must be registered');
assert.ok(moduleJson.styles.includes('styles/layout-overhaul.css'), 'layout overhaul stylesheet must be registered');
assert.equal(moduleJson.styles.at(-1), 'styles/unified-dock.css', 'new personal dock must be the last stylesheet');
assert.ok(moduleJson.styles.indexOf('styles/layout-overhaul.css') < moduleJson.styles.indexOf('styles/compact-actions.css'), 'compact widget rules must override legacy large widget layout');
assert.ok(moduleJson.styles.indexOf('styles/component-audit.css') < moduleJson.styles.indexOf('styles/layout-overhaul.css'), 'component audit must load before the final layout correction layer');

const ru = JSON.parse(fs.readFileSync(path.join(root, 'lang/ru.json'), 'utf8'));
const en = JSON.parse(fs.readFileSync(path.join(root, 'lang/en.json'), 'utf8'));
const templates = fs.readdirSync(path.join(root, 'templates')).filter(name => name.endsWith('.hbs'));

for (const file of templates) {
  const source = fs.readFileSync(path.join(root, 'templates', file), 'utf8');
  const keys = [...source.matchAll(/localize\s+["']([^"']+)["']/g)].map(match => match[1]);
  for (const key of keys) {
    assert.ok(Object.prototype.hasOwnProperty.call(ru, key), `${file}: missing Russian localization ${key}`);
    assert.ok(Object.prototype.hasOwnProperty.call(en, key), `${file}: missing English localization ${key}`);
  }

  // Templates are now language-neutral. Dynamic user data can of course contain Cyrillic,
  // but authored UI copy belongs in localization dictionaries.
  assert.ok(!/[А-Яа-яЁё]/.test(source), `${file}: authored Cyrillic UI copy must be localized`);

  for (const match of source.matchAll(/<input\b([^>]*type=["']search["'][^>]*)>/g)) {
    assert.ok(/aria-label=/.test(match[1]), `${file}: search input missing aria-label`);
  }

  for (const match of source.matchAll(/<button\b([^>]*)>\s*<i\b[^>]*><\/i>\s*<\/button>/gs)) {
    assert.ok(/(?:title|aria-label)=/.test(match[1]), `${file}: icon-only button missing accessible name`);
  }
}

const css = fs.readFileSync(path.join(root, 'styles/ui-polish.css'), 'utf8');
for (const cls of [
  '.fate-aspect-widget', '.fate-action-widget', '.faw-combat-tracker', '.fwc-window',
  '.fms-window', '.frr-request-app', '.frr-player-requests-app', '.frr-sound-settings-app',
  '.faw-help-window', '.fate-toolkit-character-sheet'
]) {
  assert.ok(css.includes(cls), `ui-polish.css does not cover ${cls}`);
}
assert.match(css, /prefers-reduced-motion:\s*reduce/, 'UI must respect reduced motion');
assert.match(css, /prefers-contrast:\s*more/, 'UI must provide a high-contrast adaptation');
assert.ok((css.match(/@media \(max-width:/g) || []).length >= 2, 'UI must include multiple responsive breakpoints');
assert.match(css, /:focus-visible/, 'UI must define keyboard focus treatment');

console.log('ui-quality.test.cjs OK');
