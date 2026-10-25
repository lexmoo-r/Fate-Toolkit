const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'styles/ui-polish.css'), 'utf8');

assert.match(css, /@media \(hover:\s*none\),\s*\(pointer:\s*coarse\)/, 'coarse-pointer media query missing');
assert.match(css, /\.faw-context-secondary[\s\S]*?opacity:\s*1[\s\S]*?pointer-events:\s*auto/, 'secondary actions must remain visible on touch');
assert.match(css, /min-width:\s*38px[\s\S]*?min-height:\s*38px/, 'touch targets must be enlarged');
assert.match(css, /@media \(forced-colors:\s*active\)/, 'forced-colors support missing');
assert.match(css, /outline:\s*2px solid Highlight/, 'forced-colors focus indicator missing');
assert.match(css, /forced-color-adjust:\s*none/, 'selected states must remain visible in forced-colors mode');

console.log('input-modality.test.cjs OK');
