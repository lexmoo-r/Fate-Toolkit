const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const sheet = read('templates/character-sheet.hbs');
const js = read('scripts/character-sheet.js');

assert.match(sheet, /<img[^>]+class="fts-portrait profile-img fco_popviewable"[^>]+data-edit="img"[^>]+data-action="editImage"/, 'portrait must mirror native ActorSheet image markup');
assert.ok(!sheet.includes('data-action="editPortrait"'), 'custom portrait action must not intercept native image editing');
assert.ok(!sheet.includes('data-action="toggleArtwork"'), 'portrait/token mode switch must not replace native actor portrait semantics');
assert.match(js, /game\.modules\?\.get\?\.\("vtta-tokenizer"\)/, 'custom sheet must explicitly discover Tokenizer');
assert.match(js, /api\.tokenizeActor\(this\.document\)/, 'custom sheet must launch Tokenizer through its public API when automatic sheet discovery misses it');
assert.match(js, /disable-avatar-click-user/, 'Tokenizer click preference must be respected');
assert.match(js, /event\.stopImmediatePropagation\(\)/, 'direct Tokenizer bridge must prevent duplicate image actions');

console.log('v1481-tokenizer.test.cjs OK');
