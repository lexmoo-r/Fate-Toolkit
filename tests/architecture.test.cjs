const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const moduleJson = JSON.parse(fs.readFileSync(path.join(root, 'module.json'), 'utf8'));
const esmodules = moduleJson.esmodules;
const rollIndex = esmodules.indexOf('scripts/roll-request.js');
for (const dependency of ['scripts/window-runtime.js', 'scripts/private-storage.js', 'scripts/roll-presentation.js', 'scripts/outcome-sounds.js', 'scripts/fate-rules.js', 'scripts/action-state.js', 'scripts/result-rules.js', 'scripts/sound-settings-ui.js', 'scripts/roll-request-ui.js', 'scripts/opposition-public.js', 'scripts/request-state.js', 'scripts/request-builder.js', 'scripts/request-result-validation.js', 'scripts/request-result-compute.js', 'scripts/boost-claim-plan.js', 'scripts/boost-claim-commit.js', 'scripts/opposition-revision.js', 'scripts/result-action-plan.js', 'scripts/result-action-commit.js', 'scripts/roll-revision.js', 'scripts/opposition-refresh-compute.js', 'scripts/action-opposition.js', 'scripts/action-opposition-ui.js', 'scripts/player-opposition-ui.js', 'scripts/defend-choice-ui.js', 'scripts/player-opposition-roll.js', 'scripts/runtime-contracts.js']) {
  const index = esmodules.indexOf(dependency);
  assert.ok(index >= 0, `${dependency} missing from manifest`);
  assert.ok(index < rollIndex, `${dependency} must load before roll-request.js`);
}

const roll = fs.readFileSync(path.join(root, 'scripts/roll-request.js'), 'utf8');
const rollLines = roll.split(/\r?\n/).length;
assert.ok(rollLines < 3035, `roll-request.js regressed to ${rollLines} lines; extracted services are leaking back into the controller`);
for (const forbidden of [
  'function readPrivateClientRows(',
  'function writePrivateClientRows(',
  'function snapshotRollMath(',
  'function appendMessageAudit(',
  'function registerSoundSettings(',
  'function dispatchOutcomeSound(',
  'function actorSkills(',
  'function coreAllowsAction(',
  'function suggestedOppositionSkill(',
  'function pendingActionState(',
  'function persistActionHandoff(',
  'function actorActionPrefs(',
  'function outcomeFor(',
  'function boostOpportunityFor(',
  'function contextualResultOpportunity(',
  'function fawViewport(',
  'class FawSafeWindow',
  'class RollSoundSettingsApp',
  'class RollRequestApp',
  'class PlayerRollRequestsApp',
  'function makePublicOpposition(',
  'function publicOppositionText(',
  'function savePlayerPending(',
  'function loadPlayerPending(',
  'function saveGmRequests(',
  'function loadGmRequests(',
  'revisionLabel: opponentKind === \"roll\"'
]) {
  assert.ok(!roll.includes(forbidden), `extracted implementation returned to roll-request.js: ${forbidden}`);
}
assert.match(roll, /globalThis\.FateToolkitPrivateStorage/, 'roll controller must consume private-storage service');
assert.match(roll, /globalThis\.FateToolkitRollPresentation/, 'roll controller must consume presentation service');
assert.match(roll, /globalThis\.FateToolkitOutcomeSounds/, 'roll controller must consume sound service');
assert.match(roll, /globalThis\.FateToolkitRules/, 'roll controller must consume Fate rules service');
assert.match(roll, /globalThis\.FateToolkitActionState/, 'roll controller must consume action-state service');
assert.match(roll, /globalThis\.FateToolkitResultRules/, 'roll controller must consume result-rules service');
assert.match(roll, /FateToolkitRuntimeContracts\.assertReady\(\)/, 'roll controller must fail fast on incomplete service contracts');
assert.match(roll, /FateToolkitWindowRuntime/, 'roll controller must consume shared window runtime');
assert.match(roll, /FateToolkitSoundSettingsUI/, 'roll controller must consume isolated sound settings UI');
assert.match(roll, /FateToolkitRollRequestUI/, 'roll controller must consume isolated roll request UI');
assert.match(roll, /FateToolkitOppositionPublic/, 'roll controller must consume explicit opposition privacy boundary');
assert.match(roll, /FateToolkitRequestState/, 'roll controller must consume isolated request persistence');
assert.match(roll, /FateToolkitRequestBuilder/, 'roll controller must consume isolated request builder');
assert.match(roll, /FateToolkitRequestResultValidation/, 'roll controller must consume isolated authoritative request validation');
assert.match(roll, /FateToolkitRequestResultCompute/, 'roll controller must consume isolated request result computation');
assert.match(roll, /FateToolkitBoostClaimPlan/, 'roll controller must consume isolated boost claim plan');
assert.match(roll, /FateToolkitBoostClaimCommit/, 'roll controller must consume isolated boost commit service');
assert.match(roll, /FateToolkitOppositionRevision/, 'roll controller must consume isolated opposition revision service');
assert.match(roll, /FateToolkitResultActionPlan/, 'roll controller must consume isolated result action authorization plan');
assert.match(roll, /FateToolkitResultActionCommit/, 'roll controller must consume isolated result action world-commit');
assert.match(roll, /FateToolkitRollRevision/, 'roll controller must consume shared roll revision service');
assert.match(roll, /FateToolkitOppositionRefreshCompute/, 'roll controller must consume opposition refresh projection');
assert.match(roll, /FateToolkitActionOpposition/, 'roll controller must consume isolated action opposition orchestrator');
assert.match(roll, /FateToolkitActionOppositionUI/, 'roll controller must consume isolated GM opposition UI');
assert.match(roll, /FateToolkitPlayerOppositionUI/, 'roll controller must consume isolated player opposition UI');
assert.match(roll, /FateToolkitDefendChoiceUI/, 'roll controller must consume isolated defend choice UI');
assert.match(roll, /FateToolkitPlayerOppositionRoll/, 'roll controller must consume isolated player opposition roll service');

const requestBuilder = fs.readFileSync(path.join(root, 'scripts/request-builder.js'), 'utf8');
assert.match(requestBuilder, /FateToolkitRequestBuilder\s*=\s*Object\.freeze/, 'request builder API missing');
assert.ok(!/gmRequests|pendingRequests|rollRpcTo|FateToolkitUX/.test(requestBuilder), 'request builder must remain free of UI, request maps and RPC transport');
const requestState = fs.readFileSync(path.join(root, 'scripts/request-state.js'), 'utf8');
assert.match(requestState, /FateToolkitRequestState\s*=\s*Object\.freeze/, 'request state API missing');
assert.ok(!requestState.includes('rollRpcTo'), 'request persistence must not own RPC transport');
assert.ok(!/setFlag\?\.\(moduleId, [^,]*gm/i.test(requestState), 'GM-private request persistence must not use User flags');
const oppositionPublic = fs.readFileSync(path.join(root, 'scripts/opposition-public.js'), 'utf8');
assert.match(oppositionPublic, /FateToolkitOppositionPublic\s*=\s*Object\.freeze/, 'opposition public API missing');
assert.match(oppositionPublic, /Fail closed/, 'opposition privacy boundary must remain explicitly fail-closed');
const rollRequestUi = fs.readFileSync(path.join(root, 'scripts/roll-request-ui.js'), 'utf8');
assert.match(rollRequestUi, /FateToolkitRollRequestUI\s*=\s*Object\.freeze/, 'roll request UI API missing');
assert.ok(!/gmRequests|pendingRequests|rollRpcTo/.test(rollRequestUi), 'roll request UI must not own request maps or RPC transport');
const soundSettingsUi = fs.readFileSync(path.join(root, 'scripts/sound-settings-ui.js'), 'utf8');
assert.match(soundSettingsUi, /FateToolkitSoundSettingsUI\s*=\s*Object\.freeze/, 'sound settings UI API missing');
const windowRuntime = fs.readFileSync(path.join(root, 'scripts/window-runtime.js'), 'utf8');
assert.match(windowRuntime, /FateToolkitWindowRuntime\s*=\s*Object\.freeze/, 'window runtime API missing');
const privateStorage = fs.readFileSync(path.join(root, 'scripts/private-storage.js'), 'utf8');
assert.match(privateStorage, /FateToolkitPrivateStorage\s*=\s*Object\.freeze/, 'private storage API missing');
const presentation = fs.readFileSync(path.join(root, 'scripts/roll-presentation.js'), 'utf8');
assert.match(presentation, /FateToolkitRollPresentation\s*=\s*Object\.freeze/, 'roll presentation API missing');
const sounds = fs.readFileSync(path.join(root, 'scripts/outcome-sounds.js'), 'utf8');
assert.match(sounds, /FateToolkitOutcomeSounds\s*=\s*Object\.freeze/, 'outcome sound API missing');
const rules = fs.readFileSync(path.join(root, 'scripts/fate-rules.js'), 'utf8');
assert.match(rules, /FateToolkitRules\s*=\s*Object\.freeze/, 'Fate rules API missing');
const actionState = fs.readFileSync(path.join(root, 'scripts/action-state.js'), 'utf8');
assert.match(actionState, /FateToolkitActionState\s*=\s*Object\.freeze/, 'action-state API missing');
const resultRules = fs.readFileSync(path.join(root, 'scripts/result-rules.js'), 'utf8');
assert.match(resultRules, /FateToolkitResultRules\s*=\s*Object\.freeze/, 'result-rules API missing');

console.log('architecture.test.cjs OK');

const actionOpposition = fs.readFileSync(path.join(root, 'scripts/action-opposition.js'), 'utf8');
assert.match(actionOpposition, /FateToolkitActionOpposition\s*=\s*Object\.freeze/, 'action opposition API missing');
assert.ok(!/rollRpcTo|DialogV2|pendingRequests|gmRequests/.test(actionOpposition), 'action opposition service must remain free of UI, request maps and RPC transport');

const actionOppositionUi = fs.readFileSync(path.join(root, 'scripts/action-opposition-ui.js'), 'utf8');
assert.match(actionOppositionUi, /FateToolkitActionOppositionUI\s*=\s*Object\.freeze/, 'action opposition UI API missing');
assert.ok(!/rollRpcTo|pendingRequests|gmRequests|finalizePlayerActionProposal/.test(actionOppositionUi), 'action opposition UI must remain free of RPC, request maps and finalization');

const playerOppositionUi = fs.readFileSync(path.join(root, 'scripts/player-opposition-ui.js'), 'utf8');
assert.match(playerOppositionUi, /FateToolkitPlayerOppositionUI\s*=\s*Object\.freeze/, 'player opposition UI API missing');
assert.ok(!/rollRpcTo|pendingRequests|gmRequests|ChatMessage/.test(playerOppositionUi), 'player opposition UI must remain free of RPC, request maps and message mutation');

const playerOppositionRoll = fs.readFileSync(path.join(root, 'scripts/player-opposition-roll.js'), 'utf8');
assert.match(playerOppositionRoll, /FateToolkitPlayerOppositionRoll\s*=\s*Object\.freeze/, 'player opposition roll API missing');
assert.ok(!/rollRpcTo|DialogV2|pendingRequests|gmRequests/.test(playerOppositionRoll), 'player opposition roll must remain free of UI, request maps and RPC transport');

const requestResultValidation = fs.readFileSync(path.join(root, 'scripts/request-result-validation.js'), 'utf8');
assert.match(requestResultValidation, /FateToolkitRequestResultValidation\s*=\s*Object\.freeze/, 'request result validation API missing');
assert.ok(!/message\.update|rollRpcTo|DialogV2|saveGmRequests/.test(requestResultValidation), 'request result validation must remain read-only and transport-free');

const requestResultCompute = fs.readFileSync(path.join(root, 'scripts/request-result-compute.js'), 'utf8');
assert.match(requestResultCompute, /FateToolkitRequestResultCompute\s*=\s*Object\.freeze/, 'request result compute API missing');
assert.ok(!/message\.update|rollRpcTo|DialogV2|saveGmRequests|game\.modules/.test(requestResultCompute), 'request result compute must remain pure/document-free');

const boostClaimPlan = fs.readFileSync(path.join(root, 'scripts/boost-claim-plan.js'), 'utf8');
assert.match(boostClaimPlan, /FateToolkitBoostClaimPlan\s*=\s*Object\.freeze/, 'boost claim plan API missing');
assert.ok(!/addBoost|message\.update|rollRpcTo|appendMessageAudit/.test(boostClaimPlan), 'boost claim plan must remain authorization/read-only planning');

const oppositionRevision = fs.readFileSync(path.join(root, 'scripts/opposition-revision.js'), 'utf8');
assert.match(oppositionRevision, /FateToolkitOppositionRevision\s*=\s*Object\.freeze/, 'opposition revision API missing');
assert.ok(!/saveGmRequests|refreshResolvedMessageForOpposition|rollRpcTo|message\.update/.test(oppositionRevision), 'opposition revision service must remain validation/rebuild only');

const resultActionPlan = fs.readFileSync(path.join(root, 'scripts/result-action-plan.js'), 'utf8');
assert.match(resultActionPlan, /FateToolkitResultActionPlan\s*=\s*Object\.freeze/, 'result action plan API missing');
assert.ok(!/addSceneAspect|adjustAspectFreeInvokes|removeAspect|message\.update|rollRpcTo/.test(resultActionPlan), 'result action plan must remain authorization-only');

const defendChoiceUi = fs.readFileSync(path.join(root, 'scripts/defend-choice-ui.js'), 'utf8');
assert.match(defendChoiceUi, /FateToolkitDefendChoiceUI\s*=\s*Object\.freeze/, 'defend choice UI API missing');
assert.ok(!/rollRpcTo|pendingRequests|gmRequests|message\.update/.test(defendChoiceUi), 'defend choice UI must remain interaction-only');

const rollRevision = fs.readFileSync(path.join(root, 'scripts/roll-revision.js'), 'utf8');
assert.match(rollRevision, /FateToolkitRollRevision\s*=\s*Object\.freeze/, 'roll revision API missing');
assert.ok(!/message\.update|rollRpcTo|saveGmRequests/.test(rollRevision), 'roll revision service must remain detection/math only');

const oppositionRefreshCompute = fs.readFileSync(path.join(root, 'scripts/opposition-refresh-compute.js'), 'utf8');
assert.match(oppositionRefreshCompute, /FateToolkitOppositionRefreshCompute\s*=\s*Object\.freeze/, 'opposition refresh compute API missing');
assert.ok(!/message\.update|rollRpcTo|rollbackDamage|saveGmRequests/.test(oppositionRefreshCompute), 'opposition refresh compute must remain pure projection');

const boostClaimCommit = fs.readFileSync(path.join(root, 'scripts/boost-claim-commit.js'), 'utf8');
assert.match(boostClaimCommit, /FateToolkitBoostClaimCommit\s*=\s*Object\.freeze/, 'boost claim commit API missing');
assert.ok(!/canUserControlActor|damageResolutionStarted|gmRequests|getUser\(/.test(boostClaimCommit), 'boost commit must not duplicate authorization or request-map ownership');

const resultActionCommit = fs.readFileSync(path.join(root, 'scripts/result-action-commit.js'), 'utf8');
assert.match(resultActionCommit, /FateToolkitResultActionCommit\s*=\s*Object\.freeze/, 'result action commit API missing');
assert.ok(!/canUserControlActor|getUser\(|gmRequests|rollRpcTo|FateToolkitUX/.test(resultActionCommit), 'result action commit must remain mutation-only and free of authorization/UI/RPC');

const chatIndex = esmodules.indexOf('scripts/chat-actions.js');
const damageIndex = esmodules.indexOf('scripts/damage-resolution.js');
assert.ok(damageIndex >= 0 && chatIndex >= 0 && damageIndex < chatIndex, 'damage-resolution.js must load before chat-actions.js');
const damageResolution = fs.readFileSync(path.join(root, 'scripts/damage-resolution.js'), 'utf8');
assert.match(damageResolution, /FateToolkitDamageResolution\s*=\s*Object\.freeze/, 'damage resolution API missing');
assert.ok(!/FateToolkitUX|chatRpcToGM|game\.socket|DialogV2/.test(damageResolution), 'damage resolution service must remain free of UI/RPC transport');

const trackerIndex = esmodules.indexOf('scripts/combat-tracker.js');
const turnFinalizationIndex = esmodules.indexOf('scripts/turn-finalization.js');
assert.ok(turnFinalizationIndex >= 0 && trackerIndex >= 0 && turnFinalizationIndex < trackerIndex, 'turn-finalization.js must load before combat-tracker.js');
const turnFinalization = fs.readFileSync(path.join(root, 'scripts/turn-finalization.js'), 'utf8');
assert.match(turnFinalization, /FateToolkitTurnFinalization\s*=\s*Object\.freeze/, 'turn finalization API missing');
assert.ok(!/DialogV2|FateToolkitUX|executeAsGM|game\.socket/.test(turnFinalization), 'turn finalization must remain free of UI/RPC transport');

const chatActionsIndex129 = esmodules.indexOf('scripts/chat-actions.js');
for (const rel of ['scripts/invoke-resource.js','scripts/invoke-resolution.js']) {
  const idx=esmodules.indexOf(rel);
  assert.ok(idx>=0 && idx<chatActionsIndex129, `${rel} must load before chat-actions.js`);
}
const invokeResource = fs.readFileSync(path.join(root,'scripts/invoke-resource.js'),'utf8');
assert.match(invokeResource,/FateToolkitInvokeResource\s*=\s*Object\.freeze/,'invoke resource API missing');
assert.ok(!/FateToolkitUX|executeAsGM|game\.socket|DialogV2/.test(invokeResource),'invoke resource must remain free of UI/RPC');
const invokeResolution = fs.readFileSync(path.join(root,'scripts/invoke-resolution.js'),'utf8');
assert.match(invokeResolution,/FateToolkitInvokeResolution\s*=\s*Object\.freeze/,'invoke resolution API missing');
assert.ok(!/FateToolkitUX|executeAsGM|game\.socket|DialogV2/.test(invokeResolution),'invoke resolution must remain free of UI/RPC');
