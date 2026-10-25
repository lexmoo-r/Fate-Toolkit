const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

const sheet = fs.readFileSync(path.join(root, 'templates/character-sheet.hbs'), 'utf8');
const js = fs.readFileSync(path.join(root, 'scripts/character-sheet.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles/layout-overhaul.css'), 'utf8');

// Native Fate Core Official long-form fields must be bound directly, not copied into module flags.
for (const field of ['system.details.description.value','system.details.biography.value','system.details.notes.value']) {
  assert.ok(sheet.includes(`name="${field}"`), `missing native long-form field binding: ${field}`);
}
assert.ok(sheet.includes('data-document-u-u-i-d="{{actor.uuid}}"'), 'Foundry/FCO ProseMirror document binding must match the native sheet pattern');
assert.ok(sheet.includes('collaborate="true"'), 'long-form native editors must preserve native collaborative ProseMirror behavior');
assert.ok(sheet.includes('class="fts-story-stack"'), 'story tab must be a dedicated one-column long-form stack');
assert.ok(!/fts-story-stack[\s\S]{0,120}grid-template-columns:\s*repeat/.test(css), 'story long-form layout must not collapse into card columns');
assert.match(css, /\.fts-story-biography \.fts-rich-editor[\s\S]*?min-height:\s*380px/, 'biography editor must have a real long-form working height');
assert.match(css, /max-height:\s*none\s*!important/, 'long-form editors must not be trapped in a small inner scroll pane');

// Data that existed in the stock sheet must remain visible in the custom one.
assert.ok(sheet.includes('system.details.fatePoints.boosts'), 'boosts from the native header must be represented');
assert.ok(sheet.includes('this.descriptionEnriched'), 'rich descriptions must render as rich text');
assert.ok(sheet.includes('this.notesEnriched'), 'rich notes must render as rich text');
assert.ok(sheet.includes('this.recoveryConditionsEnriched'), 'track recovery conditions must be represented');
assert.ok(sheet.includes('this.whenMarkedEnriched'), 'track when-marked instructions must be represented');
assert.match(js, /nativeDetailText\(actor, "description"/, 'description must resolve canonical native details first');
assert.match(js, /nativeDetailText\(actor, "biography"/, 'biography must resolve canonical native details first');
assert.match(js, /nativeDetailText\(actor, "notes"/, 'notes must resolve canonical native details first');

console.log('v147-regression.test.cjs OK');
