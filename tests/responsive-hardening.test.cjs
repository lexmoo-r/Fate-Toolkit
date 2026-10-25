const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'styles/ui-polish.css'), 'utf8');
const moduleJson = JSON.parse(fs.readFileSync(path.join(root, 'module.json'), 'utf8'));

assert.ok(moduleJson.esmodules.includes('scripts/ui-runtime-diagnostic.js'), 'runtime UI diagnostic missing from manifest');
assert.match(css, /\.frr-request-form,.frr-sound-settings[\s\S]*?min-width:\s*0/, 'request/sound surfaces must allow narrow layouts');
assert.match(css, /@media \(max-width:\s*420px\)/, '420px narrow-window hardening missing');
assert.match(css, /html\.faw-density-compact[\s\S]*?min-height:\s*30px/, 'compact mode must preserve usable control height');
assert.match(css, /\.faw-ui-audit-highlight/, 'runtime UI highlight style missing');
assert.match(css, /\.fct-order-number\s*\{\s*display:\s*none/, 'ultra-narrow combat layout must reclaim order-number column');

console.log('responsive-hardening.test.cjs OK');
