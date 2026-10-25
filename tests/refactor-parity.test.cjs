const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.join(__dirname, '..');

function sha(rel) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex');
}

// RPC and permission boundaries remain byte-identical to the hardened 1.0.1 baseline.
// Data migrations intentionally advance in 1.30 to remove synchronized private workflow state.
assert.equal(sha('scripts/rpc.js'), '4ae33c4cad7d3aa91e18ba4123bb055f7fc071e9c4aa657b9b74abc8bdc6e7d6');
assert.equal(sha('scripts/permissions.js'), '534f5612ba3028ae083a540993102c8aead5b89e7fdf0d1dd5cf5e8b591f2c17');
const migrations = fs.readFileSync(path.join(root, 'scripts/data-migrations.js'), 'utf8');
assert.ok(Number(migrations.match(/FAW_CURRENT_DATA_SCHEMA\s*=\s*(\d+)/)?.[1]) >= 5);

const expectedPersistentKeys = [
  'persistentActionDraftV1',
  'persistentActionHandoffsV1',
  'persistentAuthenticatedActionProposalsV1',
  'persistentGmRollRequests',
  'persistentOppositionQueueV1',
  'persistentPendingActionV1',
  'persistentRollRequests'
];
const scripts = fs.readdirSync(path.join(root, 'scripts')).filter(name => name.endsWith('.js'));
const source = scripts.map(name => fs.readFileSync(path.join(root, 'scripts', name), 'utf8')).join('\n');
const persistentKeys = [...new Set([...source.matchAll(/"(persistent[A-Za-z0-9]+(?:V\d+)?)"/g)].map(match => match[1]))].sort();
assert.deepEqual(persistentKeys, [...expectedPersistentKeys].sort());

const roll = fs.readFileSync(path.join(root, 'scripts/roll-request.js'), 'utf8');
const apiBlocks = [...roll.matchAll(/Object\.assign\(module\.api,\s*\{([\s\S]*?)\}\);/g)].map(match => match[1]);
assert.equal(apiBlocks.length, 2, 'roll-request public API block count changed');
function apiKeys(block) {
  const keys = [];
  for (const line of block.split(/\r?\n/)) {
    let match = line.match(/^\s*([A-Za-z_$][\w$]*)\s*:/);
    if (!match) match = line.match(/^\s*([A-Za-z_$][\w$]*)\s*,?\s*$/);
    if (match) keys.push(match[1]);
  }
  return keys;
}
assert.deepEqual(apiKeys(apiBlocks[0]), [
  'openActionWidget','openActionWidgetFor','toggleActionWidget','refreshActionWidget','setActionTargetMarker',
  'getActionTarget','getPendingActionState','getOppositionQueueState','getPrivateOppositionActorUuid',
  'resumePendingAction','resumeOppositionQueue','initiateAction','initiateActionAtTarget'
]);
assert.deepEqual(apiKeys(apiBlocks[1]), [
  'openRollRequests','openPlayerRequests','openSoundSettings','pendingRollRequests','gmRollRequests',
  'getPendingRollRequestRows','getGmRollRequestRows','appendMessageAudit'
]);

console.log('refactor-parity.test.cjs OK');
