const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'scripts/main.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles/ui-polish.css'), 'utf8');
const ru = JSON.parse(fs.readFileSync(path.join(root, 'lang/ru.json'), 'utf8'));
const en = JSON.parse(fs.readFileSync(path.join(root, 'lang/en.json'), 'utf8'));

assert.match(main, /register\(MODULE_ID,\s*["']uiDensityProfile["'][\s\S]*?scope:\s*["']user["']/, 'density profile must be user-scoped');
assert.match(main, /register\(MODULE_ID,\s*["']uiTextScale["'][\s\S]*?scope:\s*["']user["']/, 'text scale must be user-scoped');
assert.match(main, /comfortable:\s*["']FAW\.UiDensityComfortable["']/, 'comfortable density choice missing');
assert.match(main, /small:\s*["']FAW\.UiTextScaleSmall["'][\s\S]*?large:\s*["']FAW\.UiTextScaleLarge["']/, 'text scale choices missing');
assert.match(main, /migrateLegacyUiProfile\(/, 'legacy density migration missing');
assert.match(main, /classList\.toggle\(["']faw-density-comfortable["']/, 'comfortable density class missing');
assert.match(main, /classList\.toggle\(["']faw-text-large["']/, 'large text class missing');
assert.match(main, /classList\.toggle\(["']faw-text-small["']/, 'small text class missing');

assert.match(css, /html\.faw-density-comfortable/, 'comfortable density CSS missing');
assert.match(css, /html\.faw-text-small/, 'small text CSS missing');
assert.match(css, /html\.faw-text-large/, 'large text CSS missing');
assert.match(css, /min-height:\s*36px/, 'comfortable controls must retain larger targets');

for (const key of [
  'FAW.UiDensityComfortable','FAW.UiTextScaleName','FAW.UiTextScaleHint',
  'FAW.UiTextScaleSmall','FAW.UiTextScaleStandard','FAW.UiTextScaleLarge'
]) {
  assert.ok(ru[key], `missing ru localization ${key}`);
  assert.ok(en[key], `missing en localization ${key}`);
}

console.log('ui-personalization.test.cjs OK');
