const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const hookOnce = new Map();
const registrations = new Map();
const calls = [];
const users = [
  { id: 'gm-main', active: true, isGM: true },
  { id: 'gm-assistant', active: true, isGM: true },
  { id: 'player-real', active: true, isGM: false },
  { id: 'player-forged', active: true, isGM: false }
];
const fakeSocket = {
  register(name, fn) { registrations.set(name, fn); },
  async executeAsGM(name, payload) { calls.push(['gm', name, payload]); return 'remote-gm'; },
  async executeAsUser(name, userId, payload) { calls.push(['user', name, userId, payload]); return 'remote-user'; }
};
const context = {
  console,
  globalThis: null,
  Hooks: { once(name, fn) { hookOnce.set(name, fn); } },
  game: {
    user: users[2],
    users: { contents: users, activeGM: users[0], get: id => users.find(u => u.id === id) || null }
  },
  socketlib: { registerModule(id) { assert.equal(id, 'fate-aspect-widget'); return fakeSocket; } }
};
context.globalThis = context;
vm.createContext(context);
const code = fs.readFileSync(path.join(__dirname, '../scripts/rpc.js'), 'utf8');
vm.runInContext(code, context, { filename: 'scripts/rpc.js' });
assert.equal(context.FateToolkitRPC.ready, false);
assert.equal(context.FateToolkitRPC.primaryActiveGM().id, 'gm-main', 'RPC authority must use Foundry activeGM');

let observed = null;
context.FateToolkitRPC.register('security', async (payload, meta) => {
  observed = { payload, meta };
  return meta.senderId;
});
hookOnce.get('socketlib.ready')();
assert.equal(context.FateToolkitRPC.ready, true);
assert.ok(registrations.has('faw:security'));

(async () => {
const remoteHandler = registrations.get('faw:security');
const sender = await remoteHandler.call({ socketdata: { userId: 'player-real' } }, { userId: 'player-forged', mutation: 'x' });
assert.equal(sender, 'player-real');
assert.equal(observed.meta.senderId, 'player-real', 'authenticated sender must come from socket transport');
assert.equal(observed.payload.userId, 'player-forged', 'forged payload remains merely data and cannot redefine sender metadata');
assert.throws(() => context.FateToolkitRPC.assertSender('player-real', 'player-forged'));
assert.doesNotThrow(() => context.FateToolkitRPC.assertSender('player-real', 'player-real'));
assert.throws(() => context.FateToolkitRPC.assertGM('player-real'));
assert.doesNotThrow(() => context.FateToolkitRPC.assertGM('gm-main'));

const remoteResult = await context.FateToolkitRPC.executeAsGM('security', { hello: 1 });
assert.equal(remoteResult, 'remote-gm');
assert.deepEqual(calls[0], ['gm', 'faw:security', { hello: 1 }]);

context.game.user = users[0];
observed = null;
const localResult = await context.FateToolkitRPC.executeAsGM('security', { hello: 2 });
assert.equal(localResult, 'gm-main');
assert.equal(observed.meta.senderId, 'gm-main', 'local GM execution must preserve authenticated local user');
observed = null;
await context.FateToolkitRPC.executeLocal('security', { hello: 3 }, 'player-forged');
assert.equal(observed.meta.senderId, 'gm-main', 'public local helper must not accept a forged sender id');

console.log('rpc.test.cjs OK');

})().catch(error => { console.error(error); process.exit(1); });
