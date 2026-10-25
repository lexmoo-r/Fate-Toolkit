const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const context = { console, globalThis: null };
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'scripts/boost-claim-commit.js'), 'utf8'), context);

const calls = [];
const actors = new Map([['Actor.a', { uuid: 'Actor.a', name: 'Алиса' }]]);
const service = context.FateToolkitBoostClaimCommit.create({
  addBoost: async (actorUuid, name) => { calls.push(['add', actorUuid, name]); return { id: 'b1', actorUuid, name }; },
  unnamedBoostName: () => 'Безымянное усиление',
  resolvedFlavor: (_r,_o,_t, boost) => `resolved:${boost.name}`,
  replaceBoostBlock: (_f, markup) => `fallback:${markup}`,
  boostActionMarkup: (_o, boost) => `boost:${boost.name}`,
  updateMessage: async (_m, patch) => calls.push(['update', patch]),
  appendAudit: async (_m, row) => calls.push(['audit', row]),
  actorFromUuid: async uuid => actors.get(uuid) || null,
  recordConflictEvent: async row => calls.push(['event', row]),
  moduleId: 'fate-aspect-widget'
});

(async () => {
  const message = { id: 'm1', flavor: 'old' };
  const checked = { message, flags: { actorName: 'Алиса', lastResolvedRollTotal: 5, currentMath: {}, rollHistory: [] }, opportunity: { tradeShift: true }, actorUuid: 'Actor.a' };
  const result = await service.commit({ payload: { name: 'Опрокинут', userId: 'u1' }, checked, request: { id: 'r1' }, opposition: null });
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(calls[0], ['add', 'Actor.a', 'Опрокинут']);
  const patch = calls.find(x => x[0] === 'update')[1];
  assert.strictEqual(patch['flags.fate-aspect-widget.boostClaimed'], true);
  assert.strictEqual(patch['flags.fate-aspect-widget.createdBoostId'], 'b1');
  assert.strictEqual(patch.flavor, 'resolved:Опрокинут');
  assert.ok(calls.some(x => x[0] === 'audit' && x[1].fingerprint === 'boost:m1:b1'));
  assert.ok(calls.some(x => x[0] === 'event' && x[1].actorName === 'Алиса'));

  const failed = context.FateToolkitBoostClaimCommit.create({
    addBoost: async () => null,
    unnamedBoostName: () => 'Безымянное усиление',
    resolvedFlavor: () => '', replaceBoostBlock: () => '', boostActionMarkup: () => '',
    updateMessage: async () => { throw new Error('must not update'); },
    appendAudit: async () => {}, actorFromUuid: async () => null, recordConflictEvent: async () => {}, moduleId: 'x'
  });
  const noBoost = await failed.commit({ payload: {}, checked: { message, flags: {}, opportunity: {}, actorUuid: 'Actor.a' } });
  assert.strictEqual(noBoost.ok, false);
  console.log('boost-claim-commit.test.cjs OK');
})().catch(err => { console.error(err); process.exit(1); });
