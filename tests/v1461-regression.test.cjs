const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const roll = read('scripts/roll-request.js');
assert.match(roll, /settleResolvedActionWidget/);
assert.match(roll, /flags\.resolved[\s\S]*flags\.origin !== "action-widget"/);
assert.match(roll, /await actionWidget\.close\(\)/);
assert.match(roll, /position:\s*\{\s*width:\s*284/);

const layout = read('styles/layout-overhaul.css');
assert.match(layout, /@container \(max-width: 470px\)[\s\S]*\.faw-action-grid \{ grid-template-columns: 1fr !important; \}/);
assert.match(layout, /overflow-wrap:\s*normal !important/);
assert.ok(!/\.fate-action-widget \.faw-action-choice > span:not\([^)]+\)[\s\S]{0,240}overflow-wrap:\s*anywhere/.test(layout.slice(layout.lastIndexOf('v1.46.1'))), 'final action CSS must not split Russian words anywhere');

const chat = read('scripts/chat-actions.js');
assert.match(chat, /displaySystemTerm\(track\.name, tr\("FRR\.Chat\.Stress"\)\)/);
assert.match(chat, /localizeNativeFcoRollUi/);
assert.match(chat, /faw-native-roll-actions/);
assert.match(chat, /DamageInstruction/);

const css = read('styles/chat-actions.css');
assert.match(css, /\.frr-damage-options[\s\S]*grid-template-columns:\s*1fr !important/);
assert.match(css, /\.frr-damage-options button[\s\S]*height:\s*auto !important[\s\S]*min-height:\s*54px !important/);
assert.match(css, /button\[name="fco_chat_roll_button"\][\s\S]*width:\s*40px !important/);

const ru = JSON.parse(read('lang/ru.json'));
assert.equal(ru['FRR.Native.Free'], 'Бесплатно');
assert.equal(ru['FRR.Native.FatePoint'], 'Жетон судьбы');
assert.ok(ru['FRR.Chat.DamageInstruction']);
assert.ok(ru['FAW.Action.CreateDescription']);

console.log('v1461-regression.test.cjs OK');
