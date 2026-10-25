const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const migrations = read('scripts/data-migrations.js');
const schema = Number(migrations.match(/FAW_CURRENT_DATA_SCHEMA\s*=\s*(\d+)/)?.[1]);
assert.ok(schema >= 5, 'private player-state cleanup requires schema 5+');

const action = read('scripts/action-state.js');
const request = read('scripts/request-state.js');
const milestone = read('scripts/milestones.js');
const turn = read('scripts/turn-finalization.js');
const roll = read('scripts/roll-request.js');

assert.match(action, /const ACTION_DRAFT_FLAG = [\"']persistentActionDraftV1[\"']/);
assert.match(action, /const PENDING_ACTION_FLAG = [\"']persistentPendingActionV1[\"']/);
assert.match(action, /PRIVATE_LOCAL_USER_FLAGS = new Set\(\[ACTION_DRAFT_FLAG, PENDING_ACTION_FLAG, [\"']persistentOppositionQueueV1[\"']\]\)/, 'draft, pending action and opposition queue must remain browser-private');
assert.ok(!/setFlag\([^\n]*PLAYER_REQUESTS_FLAG/.test(request), 'player request queue must not be written to User.flags');
assert.ok(!/setFlag\([^\n]*DRAFTS_FLAG/.test(milestone), 'milestone drafts must not be written to User.flags');
assert.match(request, /writePrivateClientRows\("playerRollRequests"/, 'player requests must persist browser-privately');
assert.match(milestone, /writePrivateClientValue\?\.\(DRAFTS_FLAG/, 'milestone drafts must persist browser-privately');

assert.match(turn, /flags\.resolved\s*!==\s*true/, 'turn finalization must require a resolved result card');
assert.match(turn, /flags\.actorUuid/, 'turn finalization must bind result card to current actor');
assert.match(turn, /flags\.targetUserId/, 'turn finalization must bind player-owned result card to target user');

assert.match(roll, /const publicRequest\s*=\s*\{[\s\S]*?opposition:\s*makePublicOpposition\(opposition\)/, 'action handoff must be built from a strict public opposition projection');
assert.match(roll, /request:\s*publicRequest/, 'durable handoff must persist only publicRequest');

for (const key of ['persistentRollRequests','persistentActionDraftV1','persistentPendingActionV1','persistentOppositionQueueV1','milestoneDraftsV2']) {
  assert.ok(migrations.includes(key), `schema migration must know legacy private key ${key}`);
}
assert.match(migrations, /await fawDataSetFlag\(user, flag, undefined/, 'legacy synchronized private flags must be removed');

console.log('security-audit.test.cjs OK');
