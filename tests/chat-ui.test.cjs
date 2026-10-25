const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'scripts/chat-actions.js'), 'utf8');
const ru = JSON.parse(fs.readFileSync(path.join(root, 'lang/ru.json'), 'utf8'));
const en = JSON.parse(fs.readFileSync(path.join(root, 'lang/en.json'), 'utf8'));

for (const key of [
  'FRR.Chat.InvokeTitle','FRR.Chat.InvokeFilters','FRR.Chat.InvokeSearch','FRR.Chat.InvokeEmpty',
  'FRR.Chat.InvokeNoMatches','FRR.Chat.VisibleCount','FRR.Chat.DamageTitle','FRR.Chat.DamageSummary',
  'FRR.Chat.DamageTakeOutConfirm','FRR.Chat.NoActiveGM'
]) {
  assert.ok(ru[key], `RU localization missing ${key}`);
  assert.ok(en[key], `EN localization missing ${key}`);
}

const functionBlock = (name, next) => {
  const start = source.indexOf(`async function ${name}`) >= 0 ? source.indexOf(`async function ${name}`) : source.indexOf(`function ${name}`);
  assert.ok(start >= 0, `${name} missing`);
  const end = source.indexOf(next, start);
  assert.ok(end > start, `${name} terminator missing`);
  return source.slice(start, end);
};
const invokeBlock = functionBlock('injectInvokePanel', '\nfunction damageSpec');
const damageBlock = functionBlock('injectDamagePanel', '\nfunction arraysEqual');
assert.doesNotMatch(invokeBlock, /[А-Яа-яЁё]/, 'invoke panel must not contain authored Russian UI text');
assert.doesNotMatch(damageBlock, /[А-Яа-яЁё]/, 'damage panel must not contain authored Russian UI text');
assert.match(invokeBlock, /class=\"frr-invoke-toggle\"/, 'invoke chooser must expose a compact launcher');
assert.match(invokeBlock, /data-invoke-details hidden/, 'invoke chooser details must be collapsed by default');
assert.ok(invokeBlock.indexOf('const sources = await collectInvokeSources') > invokeBlock.indexOf('const buildInvokePicker'), 'invoke candidates must be collected lazily only when the chooser opens');
assert.match(invokeBlock, /data-invoke-count[^>]*aria-live="polite"/, 'invoke panel needs live result feedback');
assert.match(invokeBlock, /aria-controls=/, 'invoke search must identify its result list');
assert.match(invokeBlock, /role="list"/, 'invoke result collection must use list semantics');
assert.match(damageBlock, /role="group"[^>]*aria-label=/, 'damage metrics/actions need grouped semantics');
assert.match(damageBlock, /class="frr-damage-takeout is-danger"/, 'take-out action must be explicitly destructive');
assert.match(damageBlock, /aria-label="\$\{esc\(consequenceLabel\)\}"/, 'consequence name input must have an accessible name');

class HTMLElement {}
class TokenDocument {}
const context = {
  console,
  HTMLElement,
  TokenDocument,
  fromUuid: async () => null,
  canvas: { scene: null },
  Roll: class {},
  game: {
    i18n: {
      lang: 'en',
      localize: key => en[key] ?? key,
      format: (key, data = {}) => {
        let value = en[key] ?? key;
        for (const [name, replacement] of Object.entries(data)) value = value.replaceAll(`{${name}}`, String(replacement));
        return value;
      }
    },
    settings: { get() { return []; }, set() {} },
    users: { get() { return null; }, activeGM: null },
    actors: { get() { return null; } },
    scenes: { get() { return null; }, viewed: null },
    combats: { get() { return null; }, viewed: null },
    messages: { get() { return null; } },
    modules: { get() { return { api: {} }; } },
    socket: { emit() {} },
    system: { id: 'fate-core-official' },
    user: { id: 'u1', isGM: false, active: true }
  },
  foundry: { utils: { duplicate: value => value == null ? value : JSON.parse(JSON.stringify(value)), randomID: () => 'id' } },
  Hooks: { once() {}, on() {} },
  FateToolkitInvokeResource: { create() { return {}; } },
  FateToolkitInvokeResolution: { create() { return {}; } },
  FateToolkitDamageResolution: { create() { return {}; } },
  FateToolkitPermissions: null,
  FateToolkitRPC: { executeAsGM() {}, register() {} },
  FateToolkitUX: { error() {}, warn() {}, confirm: async () => false }
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(`${source}\n;globalThis.__fawChatUiTest={invokeSourceRowHtml,tr};`, context, { filename: 'chat-actions.js' });
const row = context.__fawChatUiTest.invokeSourceRowHtml;
assert.equal(typeof row, 'function', 'invoke row generator must exist at runtime');

const paidNoFp = row({ id:'a', filterGroup:'mine', name:'High Concept', scope:'Hero', freeUses:0, paidAllowed:true }, { fatePoints:0 });
assert.equal((paidNoFp.match(/data-invoke-mode=/g) || []).length, 2, 'paid-only aspect must have +2 and reroll actions');
assert.equal((paidNoFp.match(/disabled/g) || []).length, 2, 'paid actions must disable when Fate Points are unavailable');
assert.match(paidNoFp, /role="listitem"/, 'invoke source row must expose list-item semantics');
assert.match(paidNoFp, /aria-label=/, 'invoke actions must have accessible names');

const freeAndPaid = row({ id:'b', filterGroup:'scene', name:'On Fire', scope:'Scene', freeUses:2, paidAllowed:true }, { fatePoints:3 });
assert.equal((freeAndPaid.match(/data-invoke-mode=/g) || []).length, 4, 'free+paid aspect must expose both +2/reroll resource routes');
assert.match(freeAndPaid, /беспл\. 2/, 'free invoke count should remain visible in the row');
assert.ok(!/disabled/.test(freeAndPaid), 'paid actions must remain enabled when Fate Points exist');

const boost = row({ id:'c', filterGroup:'boosts', name:'Off Balance', scope:'Hero · boost', freeUses:1, paidAllowed:false }, { fatePoints:5 });
assert.equal((boost.match(/data-invoke-mode=/g) || []).length, 2, 'boost must expose free +2/reroll only');
assert.ok(!boost.includes('1 FP'), 'boost must not offer paid invocation');

const css = fs.readFileSync(path.join(root, 'styles/chat-actions.css'), 'utf8');
assert.match(css, /\.frr-invoke-count/, 'invoke live-count styling missing');
assert.match(css, /min-height:\s*32px/, 'desktop chat action target floor missing');
assert.match(css, /@media \(hover: none\), \(pointer: coarse\)/, 'touch chat-action hardening missing');
assert.match(css, /min-height:\s*40px/, 'touch chat action target floor missing');

console.log('chat-ui.test.cjs OK');
