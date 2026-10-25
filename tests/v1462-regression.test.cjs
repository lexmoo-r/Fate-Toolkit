const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const tpl = fs.readFileSync(path.join(root, 'templates/action-widget.hbs'), 'utf8');
for (const key of ['AttackDescription','OvercomeDescription','CreateDescription','DefendDescription']) {
  assert.ok(!tpl.includes(`FAW.Action.${key}`), `action center should not render ${key}`);
}
const css = fs.readFileSync(path.join(root, 'styles/layout-overhaul.css'), 'utf8');
assert.match(css, /v1\.46\.2[\s\S]*min-height:\s*62px !important/, 'action buttons should be compact again');
console.log('v1462-regression.test.cjs OK');
