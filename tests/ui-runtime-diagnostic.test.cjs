const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'scripts/ui-runtime-diagnostic.js'), 'utf8');

const context = {
  console,
  globalThis: {},
  Hooks: { once() {} }
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: 'ui-runtime-diagnostic.js' });

const api = context.FateToolkitUiDiagnostic;
assert.ok(api, 'runtime UI diagnostic global missing');
assert.equal(typeof api.run, 'function');
assert.equal(typeof api.clearHighlights, 'function');
assert.equal(typeof api.contrastRatio, 'function');
assert.equal(typeof api.parseColor, 'function');

const black = api.parseColor('rgb(0, 0, 0)');
const white = api.parseColor('rgb(255 255 255)');
assert.ok(black && white, 'rgb parser failed');
assert.ok(Math.abs(api.contrastRatio(black, white) - 21) < 0.001, 'black/white contrast must be 21:1');
const alpha = api.parseColor('rgba(12, 34, 56, 0.5)');
assert.equal(alpha.a, 0.5);
assert.equal(api.parseColor('transparent').a, 0);

assert.match(source, /horizontal-overflow/, 'runtime audit must check horizontal overflow');
assert.match(source, /small-target/, 'runtime audit must check interaction target size');
assert.match(source, /accessible-name/, 'runtime audit must check accessible names');
assert.match(source, /contrast/, 'runtime audit must check contrast');
assert.match(source, /input:not\(\[type=\"hidden\"\]\),select,textarea/, 'runtime audit must include visible form controls');
assert.match(source, /tab-state/, 'runtime audit must validate semantic tab state');
assert.match(source, /toggle-state/, 'runtime audit must validate aria-pressed values');
assert.match(source, /small-text/, 'runtime audit must report sub-floor text sizes');
assert.match(source, /components,/, 'runtime audit report must include component inventory counts');

assert.match(source, /module\.api\.runUiDiagnostic/, 'module API registration missing');
assert.ok(!source.includes('game.socket.emit'), 'UI diagnostic must not use raw sockets');
assert.ok(!source.includes('.setFlag('), 'UI diagnostic must remain read-only');
assert.ok(!source.includes('.update('), 'UI diagnostic must remain read-only');

console.log('ui-runtime-diagnostic.test.cjs OK');
