const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const moduleJson = JSON.parse(read('module.json'));
const packageJson = JSON.parse(read('package.json'));
assert.equal(moduleJson.version, '1.50.0-preview.9.7', 'reference-parity release version mismatch');
assert.equal(packageJson.version, moduleJson.version, 'package/module versions must stay synchronized');

const templateDir = path.join(root, 'templates');
for (const file of fs.readdirSync(templateDir).filter(name => name.endsWith('.hbs'))) {
  const source = fs.readFileSync(path.join(templateDir, file), 'utf8');
  for (const match of source.matchAll(/<button\b([^>]*)>/g)) {
    assert.match(match[1], /\btype=["']button["']/, `${file}: every button must declare type=button`);
  }
  for (const match of source.matchAll(/<i\b([^>]*)>/g)) {
    assert.match(match[1], /\baria-hidden=["']true["']/, `${file}: decorative icon must be hidden from accessibility tree`);
  }
  assert.ok(!/<(?:input|select|textarea)\b[^>]*\baria-hidden=["']true["']/.test(source), `${file}: form control must not be aria-hidden`);
}

const scriptDir = path.join(root, 'scripts');
for (const file of fs.readdirSync(scriptDir).filter(name => name.endsWith('.js'))) {
  const source = fs.readFileSync(path.join(scriptDir, file), 'utf8');
  for (const match of source.matchAll(/<button\b([^>]*)>/g)) {
    assert.match(match[1], /\btype=["']button["']/, `${file}: JS-generated button must declare type=button`);
  }
  for (const match of source.matchAll(/<i\b([^>]*)>/g)) {
    assert.match(match[1], /\baria-hidden=["']true["']/, `${file}: JS-generated decorative icon must be aria-hidden`);
  }
  assert.ok(!/<(?:input|select|textarea)\b[^>]*\baria-hidden=["']true["']/.test(source), `${file}: JS-generated form control must not be aria-hidden`);
}

const sheet = read('templates/character-sheet.hbs');
assert.match(sheet, /role="tab" tabindex="\{\{#if playActive\}\}0\{\{else\}\}-1/, 'Play tab needs roving tabindex');
assert.match(sheet, /role="tab" tabindex="\{\{#if storyActive\}\}0\{\{else\}\}-1/, 'Story tab needs roving tabindex');
assert.match(sheet, /fts-option-group" role="group" aria-label="\{\{localize 'FAW\.Sheet\.Density'\}\}"/, 'density choices must be a named group');
assert.match(sheet, /fts-option-group" role="group" aria-label="\{\{localize 'FAW\.Sheet\.Theme'\}\}"/, 'theme choices must be a named group');
assert.doesNotMatch(sheet, /fts-action-bar" role="group"/, 'action buttons must stay only in standalone compact widget');

const sheetJs = read('scripts/character-sheet.js');
for (const key of ['ArrowRight', 'ArrowLeft', 'Home', 'End']) assert.ok(sheetJs.includes(`event.key === "${key}"`), `tab keyboard support missing ${key}`);
assert.match(sheetJs, /_bindTabs\(root\)/, 'tab keyboard binding must run on render');
assert.match(sheetJs, /_pendingTabFocus/, 'tab focus must be restored after ApplicationV2 rerender');

const widget = read('templates/widget.hbs');
assert.match(widget, /faw-toolbar-tools" role="toolbar"/, 'aspect filters must be a toolbar');
assert.doesNotMatch(widget, /faw-gm-fp" role="group"/, 'unused GM Fate Point pool must not be visible');
const actionWidget = read('templates/action-widget.hbs');
assert.match(actionWidget, /faw-action-selectors" role="group"/, 'action context controls must be grouped');
assert.match(actionWidget, /faw-action-grid" role="group"/, 'Fate action choices must be grouped');

const request = read('templates/request-dialog.hbs');
assert.match(request, /frr-list-toolbar" role="toolbar"/, 'request target tools must be a toolbar');
for (const hook of ['data-request-target-status', 'data-select-search-status="skillName"', 'data-select-search-status="opponentActor"', 'data-opponent-skill-search-status']) {
  assert.ok(request.includes(hook), `request search status hook missing: ${hook}`);
}
const requestUi = read('scripts/roll-request-ui.js');
assert.match(requestUi, /status\.textContent = query \? `\$\{visible\}\/\$\{rows\.length\}` : ""/, 'target search must report visible/total');
assert.match(requestUi, /skills\.length\}\/\$\{allSkills\.length\}/, 'opponent skill search must report visible/total');
const roll = read('scripts/roll-request.js');
assert.match(roll, /data-stunt-search-status aria-live="polite"/, 'stunt search must expose a live status');
assert.match(roll, /data-skill-search-status aria-live="polite"/, 'action skill search must expose a live status');
assert.match(roll, /data-select-search-status/, 'select search helper must update live status');

const audit = read('docs/UI-REFERENCE-PARITY-v1.44.md');
for (const reference of ['foundryvtt/pf2e', 'foundryvtt/dnd5e', 'kgar/foundry-vtt-tidy-5e-sheets', 'Fate Core Official']) {
  assert.ok(audit.includes(reference), `reference parity document must name ${reference}`);
}

console.log('reference-parity.test.cjs OK');
