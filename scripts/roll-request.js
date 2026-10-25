const MODULE_ID = "fate-aspect-widget";
const LEGACY_MODULE_ID = "fate-roll-request";
const SYSTEM_ID = "fate-core-official";
const SOCKET = `module.${MODULE_ID}`;
const BLOCK_START = "<!--frr:start-->";
const BLOCK_END = "<!--frr:end-->";
const BOOST_BLOCK_START = "<!--frr:boost:start-->";
const BOOST_BLOCK_END = "<!--frr:boost:end-->";
const ACTION_DRAG_MIME = "application/x-fate-action";
const pendingRequests = new Map();
const gmRequests = new Map();
const OPPOSITION_QUEUE_FLAG = "persistentOppositionQueueV1";
const deferredAppRenders = new WeakSet();
let actionWidgetCollapsed = false;
let resolvingUpdate = false;
const boostClaimLocks = new Set();
const createdAspectClaimLocks = new Set();
const contextualResultLocks = new Set();
const pendingOppositionRevisions = new Map();
let oppositionFlagUpdate = false;

function rollRpc() {
  return globalThis.FateToolkitRPC;
}

async function rollRpcToGM(payload) {
  return rollRpc().executeAsGM("roll", payload);
}

async function rollRpcToUser(userId, payload) {
  return rollRpc().executeAsUser("roll", userId, payload);
}

async function rollRpcToUsers(userIds, payload) {
  return rollRpc().executeForUsers("roll", userIds, payload);
}

function actualRpcUser(payload, senderId) {
  return { ...payload, userId: String(senderId || "") };
}

function uiText(key, fallback = key, data = null) {
  const i18n = globalThis.game?.i18n;
  try {
    const value = data && Object.keys(data).length ? i18n?.format?.(key, data) : i18n?.localize?.(key);
    if (value && value !== key) return String(value);
  } catch (_) {}
  let text = String(fallback ?? key);
  if (data) for (const [name, value] of Object.entries(data)) text = text.replaceAll(`{${name}}`, String(value ?? ""));
  return text;
}

globalThis.FateToolkitRuntimeContracts.assertReady();

const { FawSafeWindow, deferOrRenderApp, restoreApp } = globalThis.FateToolkitWindowRuntime;

const {
  storageKey,
  readPrivateClientRows,
  writePrivateClientRows,
  requestRowsForStorage
} = globalThis.FateToolkitPrivateStorage;

const {
  esc, debounceUi, signed, numberValue, fateDieGlyph, rollDiceValues, diceSignatureFromValues,
  flavorAnnotationLines, trailingParentheticalAfter, localizedSystemLabel, parseFateSystemAnnotations,
  modifierSum, normalizedModifierSources, snapshotRollMath, compactHistory, sameMathSnapshot,
  appendMathHistory, auditUserName, makeAuditEntry, appendActionAudit, auditIcon, auditTime,
  appendMessageAudit, chatHistoryDefaultOpen, injectActionAudit, mathRowsHtml, compactMathFormula,
  historyHtml, revisionBadgeHtml, previousResultHtml, oppositionStandaloneFlavor, plainText, stuntBonusTotal
} = globalThis.FateToolkitRollPresentation;

const {
  registerSettings: registerSoundSettings,
  playLocal: playSoundLocal,
  dispatch: dispatchOutcomeSound
} = globalThis.FateToolkitOutcomeSounds;
const { open: openSoundSettings } = globalThis.FateToolkitSoundSettingsUI;

const {
  getLadder, ladderText, actorSkills, findSkill, actorStunts, stuntActionField, stuntMatchesSkill,
  stuntAllowsAction, applicableStunts, stuntByKey, validateStuntSelection, stuntSummaryText,
  executeStuntMacro, skillKey, coreAllowsAction, skillsForAction, firstExistingSkill, highestCoreSkill,
  oppositionActionType, suggestedOppositionSkill, allSkillNames
} = globalThis.FateToolkitRules;

const { actionLabel, outcomeFor, boostOpportunityFor, contextualResultOpportunity, createdAspectOpportunity } = globalThis.FateToolkitResultRules;
const bargainUi = globalThis.FateToolkitBargainUI.create({uiText,esc});
const { toPublic: makePublicOpposition, publicText: publicOppositionText } = globalThis.FateToolkitOppositionPublic.create({
  esc, stuntSummaryText, ladderText, signed
});

const gmRequestBuilder = globalThis.FateToolkitRequestBuilder.create({
  resolveUser: userId => game.users.get(userId),
  actorFromRef,
  findSkill,
  validateStuntSelection,
  oppositionActionType,
  stuntBonusTotal,
  snapshotRollMath,
  rollFormula: formula => (new Roll(formula)).roll()
});

const gmActionOpposition = globalThis.FateToolkitActionOpposition.create({
  resolveProposalTargetActor,
  gmOppositionTargetOptions,
  proposalTargetForOpponentRef,
  actorSkills,
  findSkill,
  validateStuntSelection,
  oppositionActionType,
  stuntBonusTotal,
  snapshotRollMath,
  rollFormula: async formula => {
    const roll = await (new Roll(formula)).roll();
    if (roll.dice?.[0]) roll.dice[0].options.sfx = { id: "fate4df", result: roll.result };
    roll.options.fco_formula = "4dF";
    return roll;
  },
  postOppositionRoll: async ({ roll, proposal, chosenActor, skill, stunts, stuntBonus, oppositionMath, hidden }) => {
    const speaker = ChatMessage.getSpeaker({ actor: chosenActor });
    speaker.alias = chosenActor.name;
    return roll.toMessage({
      speaker,
      whisper: hidden ? ChatMessage.getWhisperRecipients("GM").map(user => user.id) : undefined,
      flavor: oppositionStandaloneFlavor({ actorName: chosenActor.name, againstName: proposal.actorName, actionLabel: proposal.actionLabel, math: oppositionMath, history: [oppositionMath] }),
      flags: { [MODULE_ID]: {
        actionOppositionFor: proposal.id,
        oppositionUserId: game.user.id,
        oppositionInitiatorUserId: proposal.initiatorUserId,
        oppositionAgainstName: proposal.actorName,
        oppositionAgainstActorUuid: proposal.actorUuid || null,
        oppositionActionLabel: proposal.actionLabel,
        oppositionActorUuid: chosenActor.uuid,
        oppositionActorName: chosenActor.name,
        oppositionSkillName: skill.name,
        oppositionSkillRank: skill.rank,
        stuntKeys: stunts.map(stunt => stunt.key),
        stunts: stunts.map(stunt => ({ key: stunt.key, name: stunt.name, bonus: stunt.bonus, linkedSkill: stunt.linkedSkill })),
        stuntBonus,
        oppositionMath,
        oppositionHistory: [oppositionMath],
        lastOppositionRollSignature: rollSignature(roll)
      } }
    });
  }
});

const gmActionOppositionUi = globalThis.FateToolkitActionOppositionUI.create({
  esc,
  signed,
  stuntSummaryText,
  actorSkills,
  suggestedOppositionSkill,
  stuntPickerHtml,
  bindStuntMacroButtons,
  bindActionSelectSearch,
  localize: uiText,
  waitForDialog: options => foundry.applications.api.DialogV2.wait(options)
});

const playerOppositionUi = globalThis.FateToolkitPlayerOppositionUI.create({
  esc,
  signed,
  stuntSummaryText,
  actionProposalSummary,
  skillOptionsHtml,
  skillSearchControlsHtml,
  stuntPickerHtml,
  bindStuntMacroButtons,
  bindSkillSearchControls,
  localize: uiText,
  waitForDialog: options => foundry.applications.api.DialogV2.wait(options)
});

const defendChoiceUi = globalThis.FateToolkitDefendChoiceUI.create({
  skillOptionsHtml,
  skillSearchControlsHtml,
  stuntPickerHtml,
  bindStuntMacroButtons,
  bindSkillSearchControls,
  localize: uiText,
  waitForDialog: options => foundry.applications.api.DialogV2.wait(options)
});

const requestState = globalThis.FateToolkitRequestState.create({
  moduleId: MODULE_ID,
  pendingRequests,
  gmRequests,
  storageKey,
  requestRowsForStorage,
  readPrivateClientRows,
  writePrivateClientRows,
  refreshWorkflowCenter: () => game.modules.get(MODULE_ID)?.api?.refreshWorkflowCenter?.()
});
const { savePlayerPending, loadPlayerPending, saveGmRequests, loadGmRequests } = requestState;

const requestResultValidation = globalThis.FateToolkitRequestResultValidation.create({
  getRequest: requestId => gmRequests.get(requestId),
  getUser: userId => game.users.get(userId),
  requestTargetsUser: (request, userId) => permissionApi()?.requestTargetsUser?.(request, userId) ?? request.targets?.some(row => row?.userId === userId),
  waitForMessage,
  resultBelongsToUser: (message, userId) => permissionApi()?.resultBelongsToUser?.(message, userId) ?? true,
  actorFromUuid,
  canUserControlActor,
  findSkill,
  validateStuntSelection,
  stuntBonusTotal,
  numberValue,
  snapshotRollMath,
  sameMathSnapshot,
  appendMathHistory,
  compactHistory,
  moduleId: MODULE_ID
});

const requestResultCompute = globalThis.FateToolkitRequestResultCompute.create({
  numberValue,
  outcomeFor,
  boostOpportunityFor,
  renderResolvedBlock: resolvedBlock,
  clone: value => foundry.utils.duplicate(value),
  appendActionAudit,
  makeAuditEntry,
  compactMathFormula,
  signed,
  actionLabel
});

const oppositionRevision = globalThis.FateToolkitOppositionRevision.create({
  getRequest: requestId => gmRequests.get(requestId),
  getUser: userId => game.users.get(userId),
  getMessage: messageId => game.messages.get(messageId),
  waitForMessage,
  messageAuthorId: message => permissionApi()?.messageAuthorId?.(message) ?? null,
  actorFromUuid,
  canUserControlActor,
  findSkill,
  oppositionActionType,
  validateStuntSelection,
  stuntBonusTotal,
  snapshotRollMath,
  appendMathHistory,
  numberValue,
  moduleId: MODULE_ID
});

const resultActionPlan = globalThis.FateToolkitResultActionPlan.create({
  getMessage: messageId => game.messages.get(messageId),
  getUser: userId => game.users.get(userId),
  actorFromUuid,
  userMayControlActor: canUserControlActor,
  contextualResultOpportunity,
  createdAspectOpportunity,
  moduleId: MODULE_ID
});

const resultActionCommit = globalThis.FateToolkitResultActionCommit.create({
  adjustAspectFreeInvokes: async (source, amount, name) => game.modules.get(MODULE_ID)?.api?.adjustAspectFreeInvokes?.(source, amount, name),
  removeAspectSource: async (source, name) => game.modules.get(MODULE_ID)?.api?.removeAspectSource?.(source, name),
  removeAspectMarker: async (markerId, sceneId, options) => game.modules.get(MODULE_ID)?.api?.removeAspectMarker?.(markerId, sceneId, options),
  addSceneAspect: async (sceneId, name, freeInvokes, options) => game.modules.get(MODULE_ID)?.api?.addSceneAspect?.(sceneId, name, freeInvokes, options),
  updateMessage: async (message, patch) => message.update(Object.fromEntries(Object.entries(patch).map(([key, value]) => [`flags.${MODULE_ID}.${key}`, value]))),
  appendAudit: appendMessageAudit,
  recordConflictEvent: async row => game.modules.get(MODULE_ID)?.api?.recordConflictEvent?.(row)
});

const rollRevision = globalThis.FateToolkitRollRevision.create({
  parseAnnotations: parseFateSystemAnnotations,
  rollSignature,
  snapshotRollMath,
  appendMathHistory,
  numberValue
});

const oppositionRefreshCompute = globalThis.FateToolkitOppositionRefreshCompute.create({
  clone: value => foundry.utils.duplicate(value),
  outcomeFor,
  boostOpportunityFor,
  renderResolvedBlock: resolvedBlock,
  appendActionAudit,
  makeAuditEntry,
  signed
});


function stuntPickerHtml(actor, skillName, actionType, selectedKeys = []) {
  const stunts = applicableStunts(actor, skillName, actionType);
  if (!stunts.length) return `<p class="frr-hint frr-stunt-empty">${esc(uiText('FRR.Dialog.NoStunts', 'Для выбранного навыка и действия подходящих трюков не отмечено.'))}</p>`;
  const selected = new Set(selectedKeys.map(String));
  return `<label class="frr-stunt-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input type="search" data-stunt-search placeholder="${esc(uiText('FRR.Dialog.SearchStunt', 'Найти трюк…'))}" aria-label="${esc(uiText('FRR.Dialog.SearchStunt', 'Найти трюк…'))}" autocomplete="off"></label><span class="frr-search-status" data-stunt-search-status aria-live="polite"></span><div class="frr-stunt-list">${stunts.map(stunt => {
    const description = plainText(stunt.description || stunt.notes);
    const boxText = stunt.boxes > 0 ? `<span class="frr-stunt-meta">${esc(uiText('FRR.Dialog.Boxes', 'ячейки'))}: ${stunt.boxValues.filter(Boolean).length}/${stunt.boxes}</span>` : '';
    const macroButton = stunt.macro ? `<button type="button" class="frr-stunt-macro" data-stunt-macro="${esc(stunt.key)}" title="${esc(uiText('FRR.Dialog.RunMacro', 'Запустить связанный макрос'))}" aria-label="${esc(uiText('FRR.Dialog.RunMacro', 'Запустить связанный макрос'))}"><i class="fa-solid fa-play" aria-hidden="true"></i></button>` : '';
    const specialKeys = new Set(['special', 'особый', 'особое', 'любой', 'любой навык']);
    const linkedRaw = specialKeys.has(skillKey(stunt.linkedSkill)) ? uiText('FRR.Dialog.AnySkill', 'любой навык') : stunt.linkedSkill;
    const linked = globalThis.FateToolkitI18n?.skill?.(linkedRaw) || globalThis.FateToolkitI18n?.term?.(linkedRaw) || linkedRaw;
    const searchText = `${stunt.name} ${linked} ${description}`.toLocaleLowerCase(game.i18n?.lang || 'ru');
    return `<div class="frr-stunt-row" data-stunt-row data-search="${esc(searchText)}">
      <label class="frr-stunt-select">
        <input type="checkbox" name="stuntKeys" value="${esc(stunt.key)}" ${selected.has(stunt.key) ? 'checked' : ''}>
        <span class="frr-stunt-main"><span class="frr-stunt-title"><strong>${esc(stunt.name)}</strong>${stunt.bonus ? `<b class="frr-stunt-bonus">${signed(stunt.bonus)}</b>` : `<b class="frr-stunt-bonus frr-stunt-bonus-zero">${esc(uiText('FRR.Dialog.Rule', 'правило'))}</b>`}</span>
        <span class="frr-stunt-meta">${esc(linked)}</span>${boxText}${description ? `<span class="frr-stunt-description">${esc(description)}</span>` : ''}</span>
      </label>${macroButton}
    </div>`;
  }).join('')}</div>`;
}

function bindStuntMacroButtons(root, actor) {
  root?.querySelectorAll?.('[data-stunt-search]').forEach(input => {
    const update = () => {
      const query = String(input.value || '').trim().toLocaleLowerCase(game.i18n?.lang || 'ru');
      const picker = input.closest('.frr-stunt-picker') ?? input.parentElement?.parentElement;
      const rows = Array.from(picker?.querySelectorAll?.('[data-stunt-row]') ?? []);
      let visible = 0;
      for (const row of rows) {
        const checked = row.querySelector('input[name="stuntKeys"]')?.checked === true;
        row.hidden = Boolean(query && !checked && !String(row.dataset.search || '').includes(query));
        if (!row.hidden) visible += 1;
      }
      const status = picker?.querySelector?.('[data-stunt-search-status]');
      if (status) status.textContent = query ? `${visible}/${rows.length}` : '';
    };
    input.addEventListener('input', debounceUi(update, 60));
    input.addEventListener('search', update);
    update();
  });
  root?.querySelectorAll?.('[data-stunt-macro]').forEach(button => {
    button.addEventListener('click', () => {
      const row = button.closest('.frr-stunt-row');
      const checkbox = row?.querySelector('input[name="stuntKeys"]');
      if (checkbox) checkbox.checked = true;
      void executeStuntMacro(actor, button.dataset.stuntMacro);
    });
  });
}


// Fate Core default skill permissions. These are suggestions, not hard locks: stunts,
// extras and the fiction can legitimately allow other skills for an action.


function skillOptionsHtml(actor, actionType, selectedName = "", { query = "", favorites = null } = {}) {
  const prefs = actorActionPrefs(actor);
  const favoriteSet = new Set((favorites ?? prefs.favorites).map(String));
  const needle = String(query || "").trim().toLocaleLowerCase(game.i18n?.lang || "ru");
  const allSkills = skillsForAction(actor, actionType);
  const skills = needle
    ? allSkills.filter(skill => String(skill.name).toLocaleLowerCase(game.i18n?.lang || "ru").includes(needle))
    : allSkills;
  const favorite = skills.filter(s => favoriteSet.has(s.name));
  const recentSet = new Set(prefs.recentSkills.map(String));
  const frequentNames = Object.entries(prefs.usageBySkill)
    .filter(([, count]) => Number(count) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]) || String(a[0]).localeCompare(String(b[0]), game.i18n.lang))
    .slice(0, 6)
    .map(([name]) => String(name));
  const promotedSet = new Set([...prefs.recentSkills, ...frequentNames]);
  const promoted = skills
    .filter(s => !favoriteSet.has(s.name) && promotedSet.has(s.name))
    .sort((a, b) => {
      const recentA = prefs.recentSkills.indexOf(a.name);
      const recentB = prefs.recentSkills.indexOf(b.name);
      const hasRecentA = recentA >= 0;
      const hasRecentB = recentB >= 0;
      if (hasRecentA !== hasRecentB) return hasRecentA ? -1 : 1;
      if (hasRecentA && recentA !== recentB) return recentA - recentB;
      const uses = (Number(prefs.usageBySkill[b.name]) || 0) - (Number(prefs.usageBySkill[a.name]) || 0);
      if (uses) return uses;
      return a.name.localeCompare(b.name, game.i18n.lang);
    });
  const normal = skills.filter(s => !favoriteSet.has(s.name) && !promotedSet.has(s.name));
  const preferred = normal.filter(s => coreAllowsAction(s.name, actionType) === true);
  const custom = normal.filter(s => coreAllowsAction(s.name, actionType) === null);
  const nonstandard = normal.filter(s => coreAllowsAction(s.name, actionType) === false);
  const option = skill => `<option value="${esc(skill.name)}" ${skill.name === selectedName ? "selected" : ""}>${favoriteSet.has(skill.name) ? "★ " : recentSet.has(skill.name) ? "↻ " : ""}${esc(skill.label || globalThis.FateToolkitI18n?.skill?.(skill.name) || skill.name)} (${signed(skill.rank)})</option>`;
  let html = "";
  if (favorite.length) html += `<optgroup label="${esc(uiText('FRR.Dialog.Favorites', 'Избранные'))}">${favorite.map(option).join("")}</optgroup>`;
  if (promoted.length) html += `<optgroup label="${esc(uiText('FRR.Dialog.RecentFrequent', 'Недавние и часто используемые'))}">${promoted.map(option).join("")}</optgroup>`;
  if (preferred.length) html += `<optgroup label="${esc(uiText('FRR.Dialog.PreferredSkills', 'Подходят для этого действия по базовым правилам'))}">${preferred.map(option).join("")}</optgroup>`;
  if (custom.length) html += `<optgroup label="${esc(uiText('FRR.Dialog.CustomSkills', 'Пользовательские навыки'))}">${custom.map(option).join("")}</optgroup>`;
  if (nonstandard.length) html += `<optgroup label="${esc(uiText('FRR.Dialog.NonstandardSkills', 'Обычно не используются для этого действия'))}">${nonstandard.map(option).join("")}</optgroup>`;
  if (html) return html;
  if (needle) return `<option value="" disabled selected>${esc(uiText('FRR.Dialog.NoResults', 'Ничего не найдено'))}</option>`;
  return allSkills.map(option).join("");
}

function skillSearchControlsHtml() {
  return `<div class="frr-skill-tools" role="group" aria-label="${esc(uiText('FRR.Dialog.SearchSkill', 'Найти навык…'))}">
    <label class="frr-skill-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input type="search" data-skill-search placeholder="${esc(uiText('FRR.Dialog.SearchSkill', 'Найти навык…'))}" aria-label="${esc(uiText('FRR.Dialog.SearchSkill', 'Найти навык…'))}" autocomplete="off"></label>
    <span class="frr-search-status" data-skill-search-status aria-live="polite"></span>
    <button type="button" class="frr-skill-favorite" data-skill-favorite title="${esc(uiText('FRR.Dialog.AddFavorite', 'Добавить выбранный навык в избранное'))}" aria-label="${esc(uiText('FRR.Dialog.AddFavorite', 'Добавить выбранный навык в избранное'))}"><i class="fa-regular fa-star" aria-hidden="true"></i></button>
  </div>`;
}

function bindSkillSearchControls(root, actor, actionType, { selectName = "skillName", onChange = null, allowFavorite = true } = {}) {
  const select = root?.querySelector?.(`[name="${selectName}"]`);
  if (!select) return;
  const search = root.querySelector('[data-skill-search]');
  const favorite = root.querySelector('[data-skill-favorite]');

  const syncFavorite = () => {
    if (!favorite) return;
    favorite.hidden = !allowFavorite;
    const name = String(select.value || "");
    const active = actorActionPrefs(actor).favorites.includes(name);
    favorite.classList.toggle('is-active', active);
    favorite.title = active ? uiText('FRR.Dialog.RemoveFavorite', 'Убрать выбранный навык из избранного') : uiText('FRR.Dialog.AddFavorite', 'Добавить выбранный навык в избранное');
    favorite.setAttribute('aria-label', favorite.title);
    favorite.innerHTML = `<i class="${active ? 'fa-solid' : 'fa-regular'} fa-star" aria-hidden="true"></i>`;
  };

  const rebuild = () => {
    const previous = String(select.value || "");
    const query = String(search?.value || "");
    select.innerHTML = skillOptionsHtml(actor, actionType, previous, { query });
    if ([...select.options].some(option => option.value === previous)) select.value = previous;
    else {
      const first = [...select.options].find(option => !option.disabled && option.value);
      if (first) select.value = first.value;
    }
    syncFavorite();
    const status = root.querySelector('[data-skill-search-status]');
    if (status) {
      const total = skillsForAction(actor, actionType).length;
      const visible = [...select.options].filter(option => option.value && !option.disabled).length;
      status.textContent = query.trim() ? `${visible}/${total}` : '';
    }
    onChange?.();
  };

  search?.addEventListener('input', debounceUi(rebuild));
  select.addEventListener('change', () => { syncFavorite(); onChange?.(); });
  favorite?.addEventListener('click', async () => {
    const name = String(select.value || "");
    if (!name) return;
    favorite.disabled = true;
    try { await toggleFavoriteSkill(actor, name); }
    finally { favorite.disabled = false; rebuild(); }
  });
  syncFavorite();
}




function opponentOptions() {
  const options = [];
  const seen = new Set();
  const scene = canvas?.scene;
  if (scene) {
    for (const tokenDoc of scene.tokens) {
      const actor = tokenDoc.actor;
      if (!actor || actor.type !== SYSTEM_ID) continue;
      options.push({ ref: `token:${tokenDoc.id}`, name: `[Сцена] ${tokenDoc.name || actor.name}` });
      seen.add(actor.id);
    }
  }
  for (const actor of game.actors) {
    if (actor.type !== SYSTEM_ID) continue;
    options.push({ ref: `actor:${actor.id}`, name: seen.has(actor.id) ? `[Актёр] ${actor.name}` : actor.name });
  }
  return options.sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
}

function actorFromRef(ref) {
  if (!ref) return null;
  const [kind, id] = String(ref).split(":");
  if (kind === "token") return canvas?.scene?.tokens?.get(id)?.actor ?? null;
  if (kind === "actor") return game.actors.get(id) ?? null;
  return game.actors.get(ref) ?? null;
}

async function actorFromUuid(uuid) {
  if (!uuid) return null;
  try {
    const doc = await fromUuid(uuid);
    if (globalThis.TokenDocument && doc instanceof TokenDocument) return doc.actor ?? null;
    return doc?.actor ?? doc ?? null;
  } catch (_) {
    return game.actors?.get(uuid) ?? null;
  }
}

function permissionApi() {
  return globalThis.FateToolkitPermissions ?? null;
}

function primaryGmExecutor() {
  const api = permissionApi();
  return api ? api.isPrimaryGM(game.user) : Boolean(game.user?.isGM);
}

function canUserControlActor(user, actor) {
  const api = permissionApi();
  if (api) return api.canControlActor(user, actor);
  if (!user || !actor) return false;
  if (user.isGM) return true;
  try { return Boolean(actor.testUserPermission?.(user, "OWNER")); } catch (_) { return false; }
}

function playerTargets() {
  const controlled = canvas?.tokens?.controlled ?? [];
  const preselected = new Set();

  for (const token of controlled) {
    for (const user of game.users) {
      if (user.isGM || !user.active) continue;
      if (token.actor?.testUserPermission(user, "OWNER")) preselected.add(user.id);
    }
  }

  const players = game.users
    .filter(u => u.active && !u.isGM)
    .map(u => ({
      id: u.id,
      name: u.name,
      hasCharacter: Boolean(u.character && u.character.type === SYSTEM_ID),
      characterName: u.character?.name ?? "Персонаж не назначен",
      checked: preselected.has(u.id)
    }));

  if (!preselected.size && players.filter(p => p.hasCharacter).length === 1) {
    const only = players.find(p => p.hasCharacter);
    if (only) only.checked = true;
  }
  return players;
}

function activeGmRequestRows() {
  return [...gmRequests.values()]
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(r => {
      const names = r.targets.map(t => game.users.get(t.userId)?.name ?? t.userId);
      const statuses = r.targets.map(t => t.status ?? "pending");
      const rolled = statuses.filter(s => s === "rolled").length;
      return {
        id: r.id,
        title: r.title,
        targetsText: names.join(", "),
        statusText: rolled ? `бросили ${rolled}/${r.targets.length}` : "ожидается бросок"
      };
    });
}

async function sendGmRollRequestFromForm(element) {
  const fd = new FormData(element);
  const built = await gmRequestBuilder.build({
    targetIds: fd.getAll("targets"),
    title: fd.get("title"),
    description: fd.get("description"),
    actionType: fd.get("actionType"),
    createMode: fd.get("createMode"),
    skillName: fd.get("skillName"),
    oppositionMode: fd.get("oppositionMode"),
    difficulty: fd.get("difficulty"),
    hideOpposition: fd.has("hideOpposition"),
    opponentActorRef: fd.get("opponentActor"),
    opponentSkill: fd.get("opponentSkill"),
    opponentKind: fd.get("opponentKind"),
    hideOpponentResult: fd.has("hideOpponentResult"),
    stuntKeys: fd.getAll("stuntKeys"),
    id: foundry.utils.randomID(),
    sceneId: canvas?.scene?.id ?? null,
    createdAt: Date.now(),
    createdBy: game.user.id
  });
  if (!built.ok) {
    const notify = built.level === "warn" ? globalThis.FateToolkitUX.warn : globalThis.FateToolkitUX.error;
    notify(built.message);
    return false;
  }

  const request = built.request;
  gmRequests.set(request.id, request);
  saveGmRequests();

  for (const target of request.targets) {
    const userId = target.userId;
    const publicRequest = {
      id: request.id,
      title: request.title,
      description: request.description,
      actionType: request.actionType,
      createMode: request.createMode,
      skillName: request.skillName,
      oppositionMode: request.oppositionMode,
      sceneId: request.sceneId ?? null,
      createdAt: request.createdAt,
      gmName: game.user.name,
      targetUserId: userId,
      opposition: makePublicOpposition(request.oppositionByUser[userId])
    };
    void rollRpcToUser(userId, { type: "request", request: publicRequest });
  }

  globalThis.FateToolkitUX.info(`Запрос «${request.title}» отправлен: ${request.targets.length} игрок(а/ов).`);
  return true;
}

function cancelGmRequest(requestId) {
  const request = gmRequests.get(requestId);
  if (!request) return;
  const targetUserIds = request.targets.map(t => t.userId);
  void rollRpcToUsers(targetUserIds, { type: "cancel", requestId });
  gmRequests.delete(requestId);
  saveGmRequests();
  requestUi.refreshGm();
}



function gmRequestContext() {
  return {
    players: playerTargets(),
    skills: allSkillNames(),
    opponents: opponentOptions(),
    activeRequests: activeGmRequestRows()
  };
}

function playerRequestContext() {
  const character = game.user.character;
  const canRoll = Boolean(character && character.type === SYSTEM_ID && character.isOwner);
  const requests = [...pendingRequests.values()]
    .sort((a, b) => a.createdAt - b.createdAt)
    .map(request => ({
      ...request,
      title: String(request.title ?? "Проверка"),
      gmName: String(request.gmName ?? "Мастер"),
      description: String(request.description ?? ""),
      actionLabel: actionLabel(request.actionType),
      skillText: request.skillName ? `Навык: ${request.skillName}` : "Навык выбирает игрок",
      oppositionText: publicOppositionText(request.opposition),
      canRoll
    }));
  return { requests };
}

const requestUi = globalThis.FateToolkitRollRequestUI.create({
  moduleId: MODULE_ID,
  getGmContext: gmRequestContext,
  getPlayerContext: playerRequestContext,
  debounceUi,
  bindActionSelectSearch,
  openSoundSettings,
  cancelGmRequest,
  sendGmRequest: sendGmRollRequestFromForm,
  actorFromRef,
  suggestedOppositionSkill,
  actorSkills,
  signed,
  oppositionActionType,
  stuntPickerHtml,
  bindStuntMacroButtons,
  ladderText,
  rollRequest,
  declineRequest,
  localize: uiText
});

async function openRequestApp() {
  return requestUi.openGm();
}

async function openPlayerRequestApp(options = {}) {
  return requestUi.openPlayer(options);
}

function renderTray({ open = false } = {}) {
  return requestUi.renderPlayerTray({ open, hasRequests: pendingRequests.size > 0 });
}

async function chooseSkill(actor, { actionType = "generic", defaultSkillName = "", title = null } = {}) {
  title ||= uiText("FRR.Dialog.ChooseSkillTitle", "Выберите навык");
  const result = await chooseSkillAndStunts(actor, { actionType, defaultSkillName, title, showStunts: false });
  return result?.skillName ?? null;
}

async function chooseSkillAndStunts(actor, {
  actionType = "generic",
  defaultSkillName = "",
  title = null,
  showStunts = true,
  selectedStuntKeys = []
} = {}) {
  const skills = actorSkills(actor);
  if (!skills.length) return null;
  title ||= uiText("FRR.Dialog.ChooseSkillTitle", "Выберите навык");
  const selectedSkill = findSkill(actor, defaultSkillName)?.name || preferredSkillName(actor, actionType) || skillsForAction(actor, actionType).find(skill => coreAllowsAction(skill.name, actionType) !== false)?.name || skills[0].name;
  const options = skillOptionsHtml(actor, actionType, selectedSkill);
  const remembered = new Set((selectedStuntKeys || []).map(String));

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title, resizable: true, minimizable: false },
    position: { width: 460, height: "auto" },
    content: `<div class="frr-opposition-prompt">
      <label class="frr-dialog-field"><span>${esc(uiText("FRR.Dialog.Skill", "Навык"))}</span>${skillSearchControlsHtml()}<select name="skillName" autofocus>${options}</select></label>
      ${showStunts ? `<section class="frr-stunt-picker"><div class="frr-stunt-picker-head"><strong>${esc(uiText("FRR.Dialog.Stunts", "Трюки"))}</strong><span>${esc(uiText("FRR.Dialog.StuntsCondition", "отметьте только те, чьё условие сейчас выполняется"))}</span></div><div data-stunt-picker></div></section>` : ''}
      <p class="frr-hint">${esc(uiText("FRR.Dialog.StuntHint", "Числовой бонус выбранных трюков будет добавлен к броску. Трюк с нулевым бонусом всё равно можно отметить — он будет зафиксирован в карточке как правило/разрешение. Макрос запускается отдельной кнопкой и его эффект модуль не интерпретирует автоматически."))}</p>
    </div>`,
    buttons: [{
      action: "continue",
      label: uiText("FRR.Dialog.Continue", "Продолжить"),
      icon: "fa-solid fa-arrow-right",
      default: true,
      callback: (event, button) => ({
        skillName: String(button.form?.elements?.skillName?.value || ""),
        stuntKeys: showStunts ? [...button.form.querySelectorAll('input[name="stuntKeys"]:checked')].map(input => input.value) : []
      })
    }],
    modal: true,
    rejectClose: false,
    render: (event, dialog) => {
      const root = dialog.element;
      const skillSelect = root.querySelector('[name="skillName"]');
      const picker = root.querySelector('[data-stunt-picker]');
      const rememberCurrent = () => {
        root.querySelectorAll('input[name="stuntKeys"]:checked').forEach(input => remembered.add(input.value));
      };
      const sync = () => {
        if (!showStunts || !picker) return;
        picker.innerHTML = stuntPickerHtml(actor, skillSelect?.value || "", actionType, [...remembered]);
        bindStuntMacroButtons(picker, actor);
      };
      bindSkillSearchControls(root, actor, actionType, {
        onChange: () => { rememberCurrent(); sync(); }
      });
      sync();
    }
  });
  if (!result?.skillName) return null;
  await rememberSkill(actor, actionType, result.skillName);
  return {
    skillName: result.skillName,
    stuntKeys: validateStuntSelection(actor, result.stuntKeys, result.skillName, actionType).map(stunt => stunt.key)
  };
}

async function chooseStuntsForSkill(actor, skillName, actionType, { title = null, selectedStuntKeys = [] } = {}) {
  title ||= uiText("FRR.Dialog.Stunts", "Трюки");
  const available = applicableStunts(actor, skillName, actionType);
  if (!available.length) return [];
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title, resizable: true, minimizable: false },
    position: { width: 460, height: "auto" },
    content: `<div class="frr-opposition-prompt"><div class="frr-action-summary"><strong>${esc(skillName)}</strong></div><section class="frr-stunt-picker"><div class="frr-stunt-picker-head"><strong>${esc(uiText("FRR.Dialog.Stunts", "Трюки"))}</strong><span>${esc(uiText("FRR.Dialog.MarkApplicableNow", "отметьте применимые сейчас"))}</span></div><div data-stunt-picker>${stuntPickerHtml(actor, skillName, actionType, selectedStuntKeys)}</div></section><p class="frr-hint">${esc(uiText("FRR.Dialog.StuntHint", "Числовой бонус выбранных трюков будет добавлен к броску. Трюк с нулевым бонусом всё равно можно отметить — он будет зафиксирован в карточке как правило/разрешение. Макрос запускается отдельной кнопкой и его эффект модуль не интерпретирует автоматически."))}</p></div>`,
    buttons: [{
      action: "continue",
      label: uiText("FRR.Dialog.Continue", "Продолжить"),
      icon: "fa-solid fa-arrow-right",
      default: true,
      callback: (event, button) => [...button.form.querySelectorAll('input[name="stuntKeys"]:checked')].map(input => input.value)
    }],
    modal: true,
    rejectClose: false,
    render: (event, dialog) => bindStuntMacroButtons(dialog.element, actor)
  });
  if (!Array.isArray(result)) return null;
  return validateStuntSelection(actor, result, skillName, actionType).map(stunt => stunt.key);
}

async function chooseActionSkill(actor, actionType) {
  if (actionType !== "defend") {
    const choice = await chooseSkillAndStunts(actor, { actionType, title: uiText("FRR.Dialog.SkillTitle", "Навык: {action}", { action: actionLabel(actionType) }) });
    return choice ? { ...choice, defendedAgainst: null, defendedCreateMode: null } : null;
  }

  const skills = actorSkills(actor);
  if (!skills.length) return null;
  const selected = preferredSkillName(actor, "defend") || skillsForAction(actor, "defend").find(skill => coreAllowsAction(skill.name, "defend") !== false)?.name || skills[0].name;
  const result = await defendChoiceUi.open({ actor, selected });
  if (!result?.skillName) return null;
  await rememberSkill(actor, "defend", result.skillName);
  result.stuntKeys = validateStuntSelection(actor, result.stuntKeys, result.skillName, "defend").map(stunt => stunt.key);
  return result;
}

function rollSignature(roll) {
  if (!roll) return "";
  try {
    const dice = (roll.dice ?? []).map(die => {
      const results = die.results?.map(r => Number(r.result)) ?? die.values ?? [];
      return Array.from(results).map(Number);
    });
    return JSON.stringify({ formula: roll.formula ?? "", total: Number(roll.total), dice });
  } catch {
    return `${roll.formula ?? ""}|${Number(roll.total)}`;
  }
}

async function performRequestRoll(request, actor, { removePendingId = null } = {}) {
  if (!request || !actor) return null;
  const gm = game.users.activeGM;
  if (!gm) {
    globalThis.FateToolkitUX.error("Сейчас нет активного мастера: запрос нельзя корректно разрешить.");
    return null;
  }
  if (actor.type !== SYSTEM_ID || !(game.user.isGM || actor.isOwner)) {
    globalThis.FateToolkitUX.error("Персонаж Fate Core Official не найден или недоступен.");
    return null;
  }

  let skillName = request.skillName;
  let selectedStuntKeys = Array.isArray(request.stuntKeys) ? [...request.stuntKeys] : null;
  if (!skillName) {
    const choice = await chooseSkillAndStunts(actor, { actionType: request.actionType, title: uiText("FRR.Dialog.SkillTitle", "Навык: {action}", { action: actionLabel(request.actionType) }) });
    if (!choice) return null;
    skillName = choice.skillName;
    selectedStuntKeys = choice.stuntKeys;
  }
  if (!skillName) return null;

  const skill = findSkill(actor, skillName);
  if (!skill) {
    globalThis.FateToolkitUX.error(`У ${actor.name} нет навыка «${skillName}».`);
    return null;
  }

  if (selectedStuntKeys === null) {
    selectedStuntKeys = await chooseStuntsForSkill(actor, skill.name, request.actionType, { title: `Трюки: ${actionLabel(request.actionType)}` });
    if (selectedStuntKeys === null) return null;
  }
  const selectedStunts = validateStuntSelection(actor, selectedStuntKeys, skill.name, request.actionType);
  const stuntBonus = stuntBonusTotal(selectedStunts);

  // Bargains are offered in the roll form, approved by the GM over authenticated
  // RPC and credited before the dice are evaluated. Rejection leaves the roll unchanged.
  const bargain=await bargainUi.confirmRollBargain(actor);
  if (bargain === null) return null;
  const roll = await (new Roll(`4dF + ${skill.rank} + ${stuntBonus} + ${globalThis.FateToolkitExtras?.rollBonus?.(actor,request.actionType,skill.name) || 0}`)).roll();
  if (roll.dice?.[0]) roll.dice[0].options.sfx = { id: "fate4df", result: roll.result };
  roll.options.fco_formula = "4dF";

  const speaker = ChatMessage.getSpeaker({ actor });
  speaker.alias = actor.name;
  const initialMath = snapshotRollMath(roll, {
    skillName: skill.name,
    skillRank: skill.rank,
    stunts: selectedStunts,
    stuntBonus,
    flavor: ""
  });
  const initialHistory = [initialMath];
  const waitingBlock = renderWaitingBlock(request, actor.name, initialMath) +
    (bargain.accepted ? `<p class="frr-bargain-note">${esc(uiText('FAW.Campaign.BargainTitle','Сделка с дьяволом'))}: ${esc(bargain.description)}</p>` : '');

  const message = await roll.toMessage({
    flavor: waitingBlock,
    speaker,
    flags: {
      [MODULE_ID]: {
        requestId: request.id,
        targetUserId: game.user.id,
        actorUuid: actor.uuid,
        actorName: actor.name,
        skillName: skill.name,
        skillRank: skill.rank,
        stuntKeys: selectedStunts.map(stunt => stunt.key),
        stunts: selectedStunts.map(stunt => ({ key: stunt.key, name: stunt.name, bonus: stunt.bonus, linkedSkill: stunt.linkedSkill })),
        stuntBonus,
        currentMath: initialMath,
        rollHistory: initialHistory,
        modifierSources: initialMath.modifierSources,
        devilsBargain: bargain.accepted ? {accepted:true,description:bargain.description,eventId:bargain.eventId} : null,
        auditTrail: [
          ...(bargain.accepted ? [makeAuditEntry('bargain',uiText('FAW.Campaign.BargainTitle','Сделка с дьяволом'),bargain.description,{userId:game.user.id,fingerprint:bargain.eventId})] : []),
          makeAuditEntry("roll", "Бросок", compactMathFormula(initialMath), {
            userId: game.user.id,
            fingerprint: `roll:${request.id}:${initialMath.diceSignature}:${initialMath.total}`
          }),
          ...selectedStunts.map(stunt => makeAuditEntry("stunt", "Трюк", `${stunt.name}${stunt.bonus ? ` · ${signed(stunt.bonus)}` : ""}`, {
            userId: game.user.id,
            fingerprint: `stunt:${request.id}:${stunt.key}`
          }))
        ],
        actionType: request.actionType,
        createMode: request.createMode ?? null,
        defendedAgainst: request.defendedAgainst ?? null,
        defendedCreateMode: request.defendedCreateMode ?? null,
        origin: request.origin ?? null,
        sceneId: request.sceneId ?? canvas?.scene?.id ?? null,
        title: request.title,
        actionTarget: request.actionTarget ?? null,
        resolved: false,
        lastResolvedRollTotal: null,
        lastResolvedRollSignature: null
      }
    }
  });

  if (!message) {
    globalThis.FateToolkitUX.error("Не удалось создать сообщение броска.");
    return null;
  }

  if (removePendingId) {
    pendingRequests.delete(removePendingId);
    savePlayerPending();
    renderTray();
  }

  if (request.origin === "action-widget") resetActionTarget();

  const payload = {
    type: "resolve",
    targetUserIds: [gm.id],
    requestId: request.id,
    messageId: message.id,
    userId: game.user.id,
    actorUuid: actor.uuid,
    actorName: actor.name,
    rollTotal: roll.total,
    rollSignature: rollSignature(roll),
    skillName: skill.name,
    skillRank: skill.rank,
    stunts: selectedStunts.map(stunt => ({ key: stunt.key, name: stunt.name, bonus: stunt.bonus, linkedSkill: stunt.linkedSkill })),
    stuntKeys: selectedStunts.map(stunt => stunt.key),
    stuntBonus,
    mathSnapshot: initialMath,
    rollHistory: initialHistory,
    modifierSources: initialMath.modifierSources
  };

  if (game.user.isGM && gm.id === game.user.id) await resolveOnGm(payload);
  else await rollRpcToGM(payload);
  return message;
}

async function rollRequest(requestId) {
  const request = pendingRequests.get(requestId);
  if (!request) return;

  const actor = game.user.character;
  if (!actor || actor.type !== SYSTEM_ID || !actor.isOwner) {
    return globalThis.FateToolkitUX.error("Назначенный персонаж Fate Core Official не найден или недоступен.");
  }

  await performRequestRoll(request, actor, { removePendingId: requestId });
}

function renderWaitingBlock(request, actorName = "Персонаж", math = null) {
  const opposition = request?.opposition;
  const matchup = resultMatchupText(actorName, request, opposition);
  return `${BLOCK_START}<div class="frr-chat-result frr-resolution-card"><div class="frr-resolution-matchup">${esc(matchup)}</div><div class="frr-resolution-action">${esc(actionLabel(request.actionType))} · бросок ${signed(math?.total ?? 0)}</div><div class="frr-math-grid"><section class="frr-math-side"><h4>${esc(actorName)}${math?.skillName ? ` · ${esc(math.skillName)}` : ""}</h4>${mathRowsHtml(math)}</section>${renderOppositionMath(request, opposition)}</div></div>${BLOCK_END}`;
}

function declineRequest(requestId) {
  const request = pendingRequests.get(requestId);
  if (!request) return;
  pendingRequests.delete(requestId);
  savePlayerPending();
  renderTray();
  const gm = game.users.activeGM;
  if (gm) void rollRpcToGM({ type: "decline", requestId });
}




function boostActionMarkup(opportunity, state = {}) {
  if (!opportunity) return "";
  const claimed = state?.claimed === true;
  const name = String(state?.name || "").trim();

  if (claimed) {
    const trade = opportunity.tradeShift ? " <span class=\"frr-boost-note\">1 сдвиг атаки обменян на усиление.</span>" : "";
    return `${BOOST_BLOCK_START}<div class="frr-boost-created"><i class="fa-solid fa-bolt" aria-hidden="true"></i> Усиление${name ? ` «${esc(name)}»` : ""} добавлено.${trade}</div>${BOOST_BLOCK_END}`;
  }

  let label = opportunity.recipient === "opponent" ? "Добавить усиление сопернику" : "Добавить усиление";
  let hint = "";
  if (opportunity.tradeShift) {
    label = opportunity.recipient === "opponent" ? "Добавить усиление сопернику (−1 сдвиг)" : "Взять усиление (−1 сдвиг)";
    hint = opportunity.recipient === "opponent" ? "Уменьшает эффект успешной атаки соперника на 1 сдвиг." : "Уменьшает эффект попадания на 1 сдвиг.";
  } else if (opportunity.recipient === "opponent") {
    hint = "Усиление получает персонаж, выступавший активной оппозицией.";
  }

  return `${BOOST_BLOCK_START}<div class="frr-boost-action"><button type="button" data-action="frr-create-boost" class="frr-create-boost"><i class="fa-solid fa-bolt" aria-hidden="true"></i> ${esc(label)}</button>${hint ? `<span class="frr-boost-note">${esc(hint)}</span>` : ""}</div>${BOOST_BLOCK_END}`;
}

function replaceBoostBlock(flavor, boostBlock) {
  const source = String(flavor ?? "");
  const start = source.indexOf(BOOST_BLOCK_START);
  const end = source.indexOf(BOOST_BLOCK_END);
  if (start < 0 || end < start) return source;
  return source.slice(0, start) + boostBlock + source.slice(end + BOOST_BLOCK_END.length);
}

function oppositionDisplayName(request, opposition) {
  if (opposition?.mode === "opponent" && opposition.actorName) return opposition.actorName;
  if (request?.actionTarget?.name) return request.actionTarget.name;
  if (opposition?.label && opposition.label !== "Без оппозиции") return opposition.label;
  return "Оппозиция";
}

function renderOppositionMath(request, opposition) {
  if (!opposition || opposition.mode === "none" || opposition.total === null) {
    return `<section class="frr-math-side frr-math-side-opposition"><h4>Оппозиция</h4><div class="frr-math-row"><span>Режим</span><strong>нет</strong></div></section>`;
  }
  if (opposition.hidden) {
    return `<section class="frr-math-side frr-math-side-opposition"><h4>${esc(oppositionDisplayName(request, opposition))}</h4><div class="frr-math-hidden"><i class="fa-solid fa-eye-slash" aria-hidden="true"></i> Математика оппозиции скрыта мастером.</div></section>`;
  }
  if (opposition.mode === "opponent") {
    if (opposition.kind === "rank") {
      const pseudo = opposition.math || {
        skillName: opposition.skillName,
        skillRank: numberValue(opposition.skillRank),
        diceValues: [],
        diceTotal: 0,
        stunts: opposition.stunts || [],
        stuntBonus: numberValue(opposition.stuntBonus),
        modifierSources: [],
        total: numberValue(opposition.total)
      };
      const rows = mathRowsHtml(pseudo).replace('<div class="frr-math-row"><span>Кубики (4dF)</span><strong>[—] = +0</strong></div>', '<div class="frr-math-row"><span>Кубики</span><strong>не бросаются</strong></div>');
      return `<section class="frr-math-side frr-math-side-opposition"><h4>${esc(opposition.actorName || "Оппозиция")} · пассивно</h4>${rows}${previousResultHtml(opposition.history)}</section>`;
    }
    return `<section class="frr-math-side frr-math-side-opposition"><h4>${esc(opposition.actorName || "Оппозиция")}</h4>${mathRowsHtml(opposition.math || {
      skillName: opposition.skillName,
      skillRank: opposition.skillRank,
      stunts: opposition.stunts || [],
      stuntBonus: opposition.stuntBonus,
      diceValues: [],
      diceTotal: numberValue(opposition.total) - numberValue(opposition.skillRank) - numberValue(opposition.stuntBonus),
      modifierSources: [],
      total: opposition.total
    })}${previousResultHtml(opposition.history)}</section>`;
  }
  const passiveLabel = !opposition.label || /^сложность$/i.test(String(opposition.label)) ? "Пассивная сложность" : String(opposition.label);
  return `<section class="frr-math-side frr-math-side-opposition"><h4>Оппозиция</h4><div class="frr-math-row frr-math-total"><span>${esc(passiveLabel)}</span><strong>${signed(opposition.total)}</strong></div></section>`;
}

function oppositionHistoryHtml(opposition) {
  if (!opposition || opposition.mode !== "opponent") return "";
  return historyHtml(opposition.history || [], opposition.actorName || "Оппозиция");
}

function resultWinnerText(initiatorName, request, opposition, difference) {
  if (!opposition || opposition.mode === "none" || opposition.total === null) return "Без оппозиции — победитель не определяется";
  const diff = numberValue(difference);
  if (diff === 0) return "Ничья";
  if (diff > 0) return `Побеждает ${initiatorName}`;
  const opponentName = opposition.mode === "opponent" ? (opposition.actorName || "оппозиция") : "оппозиция";
  return `Побеждает ${opponentName}`;
}

function resultMatchupText(initiatorName, request, opposition) {
  if (!opposition || opposition.mode === "none" || opposition.total === null) return `${initiatorName} · ${actionLabel(request.actionType)} · без оппозиции`;
  if (opposition.mode === "opponent") return `${initiatorName} против ${opposition.actorName || oppositionDisplayName(request, opposition)}`;
  const passiveName = !opposition.label || /^сложность$/i.test(String(opposition.label)) ? "сложности" : String(opposition.label);
  return `${initiatorName} против ${passiveName}`;
}

function resolvedBlock(request, opposition, rollTotal, boostState = {}, mathState = {}) {
  const initiatorName = String(mathState.actorName || request.actorName || game.users.get(request.targets?.[0]?.userId)?.character?.name || "Персонаж");
  const initiatorMath = mathState.math || null;
  const initiatorHistory = mathState.history || [];

  if (!opposition || opposition.mode === "none" || opposition.total === null) {
    return `${BLOCK_START}<div class="frr-chat-result frr-resolution-card">
      <div class="frr-resolution-matchup">${esc(resultMatchupText(initiatorName, request, opposition))}</div>
      ${revisionBadgeHtml(initiatorHistory)}
      <div class="frr-resolution-winner">Без оппозиции</div>
      <div class="frr-resolution-action">${esc(actionLabel(request.actionType))} · без оппозиции</div>
      <div class="frr-math-grid"><section class="frr-math-side"><h4>${esc(initiatorName)}</h4>${mathRowsHtml(initiatorMath)}${previousResultHtml(initiatorHistory)}</section>${renderOppositionMath(request, opposition)}</div>
      <div class="frr-resolution-effect">Исход не определяется автоматически: мастер описывает результат по ситуации.</div>
      ${historyHtml(initiatorHistory, initiatorName)}
    </div>${BLOCK_END}`;
  }

  const difference = Number(rollTotal) - Number(opposition.total);
  const ruleContext = {
    createMode: request.createMode,
    defendedAgainst: request.defendedAgainst,
    defendedCreateMode: request.defendedCreateMode
  };
  const outcome = outcomeFor(request.actionType, difference, ruleContext);
  const boostOpportunity = boostOpportunityFor(request.actionType, difference, opposition, ruleContext);
  const boostMarkup = boostActionMarkup(boostOpportunity, boostState);
  const shiftsVisible = !opposition.hidden;
  const shiftTrade = Boolean(boostOpportunity?.tradeShift && boostState?.claimed);
  const outgoingAttackShifts = request.actionType === "attack" && difference > 0 ? difference : null;
  const incomingAttackShifts = request.actionType === "defend" && (request.defendedAgainst || "attack") === "attack" && difference < 0 ? -difference : null;
  const effectiveOutgoingAttackShifts = outgoingAttackShifts === null ? null : Math.max(0, outgoingAttackShifts - (shiftTrade ? 1 : 0));
  const effectiveIncomingAttackShifts = incomingAttackShifts === null ? null : Math.max(0, incomingAttackShifts - (shiftTrade ? 1 : 0));
  let detail = outcome.detail;
  if (effectiveOutgoingAttackShifts !== null && shiftTrade) {
    detail = `Итоговый удар: ${effectiveOutgoingAttackShifts} сдвига (${outgoingAttackShifts} − 1 за полученное усиление).`;
  }
  if (effectiveIncomingAttackShifts !== null && shiftTrade) {
    detail = `Входящий удар: ${effectiveIncomingAttackShifts} сдвига (${incomingAttackShifts} − 1 за усиление атакующего).`;
  }
  if (opposition.hidden && request.actionType === "attack" && difference > 0) detail = "Атака попадает; величина сопротивления скрыта мастером.";
  if (opposition.hidden && request.actionType === "defend" && incomingAttackShifts !== null) detail = "Защита не удерживает атаку; величина входящего удара скрыта мастером.";

  const comparison = opposition.hidden
    ? "Сравнение скрыто мастером"
    : `${signed(rollTotal)} − ${signed(opposition.total)} = ${signed(difference)} сдвига`;

  return `${BLOCK_START}<div class="frr-chat-result frr-resolution-card">
    <div class="frr-resolution-matchup">${esc(resultMatchupText(initiatorName, request, opposition))}</div>
    ${revisionBadgeHtml(initiatorHistory)}
    <div class="frr-resolution-winner">${esc(resultWinnerText(initiatorName, request, opposition, difference))}${shiftsVisible && difference !== 0 ? ` · ${Math.abs(difference)} сдвига` : ""}</div>
    <div class="frr-resolution-action">${esc(actionLabel(request.actionType))}: <span class="frr-outcome">${esc(outcome.title)}</span></div>
    <div class="frr-math-grid">
      <section class="frr-math-side"><h4>${esc(initiatorName)}</h4>${mathRowsHtml(initiatorMath)}${previousResultHtml(initiatorHistory)}</section>
      ${renderOppositionMath(request, opposition)}
    </div>
    <div class="frr-comparison"><span>Сравнение</span><strong>${esc(comparison)}</strong></div>
    <div class="frr-resolution-effect">${esc(detail)}</div>
    ${boostMarkup}
    <div class="frr-history-group">${historyHtml(initiatorHistory, initiatorName)}${oppositionHistoryHtml(opposition)}</div>
  </div>${BLOCK_END}`;
}


async function waitForMessage(messageId, tries = 30) {
  for (let i = 0; i < tries; i++) {
    const message = game.messages.get(messageId);
    if (message) return message;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return null;
}

async function rollbackSupersededBoost(message, flags) {
  if (!flags?.boostClaimed || !flags?.createdBoostId || !flags?.boostActorUuid) return;
  try {
    await game.modules.get(MODULE_ID)?.api?.removeBoost?.(flags.boostActorUuid, flags.createdBoostId);
  } catch (err) {
    console.warn(`${MODULE_ID} | Could not roll back boost from superseded roll result`, err);
  }
}

async function rollbackSupersededCreatedAspect(message, flags) {
  const created = flags?.createdSceneAspect;
  if (!flags?.createdAspectClaimed || !created?.sceneId || !created?.id) return;
  try {
    await game.modules.get(MODULE_ID)?.api?.removeSceneAspect?.(created.sceneId, created.id);
    await appendMessageAudit(message, {
      type: "aspect",
      label: "Созданный аспект отменён",
      detail: `«${created.name || "Аспект"}» · результат броска изменён`,
      userId: game.user.id
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | Could not roll back aspect from superseded result`, err);
  }
}

async function resolveOnGm(payload) {
  if (!primaryGmExecutor()) return;
  const checked = await requestResultValidation.validate(payload);
  if (!checked?.ok) {
    const notify = checked?.level === "error" ? globalThis.FateToolkitUX.error : globalThis.FateToolkitUX.warn;
    return notify(checked?.message || "Отклонён некорректный результат броска.");
  }

  const { request, user, opposition, message, previousFlags, actor, skill, validatedStunts, stunts, skillRank, stuntBonus, roll, math, history } = checked;

  // If a result was already used to mark stress/consequences and the roll is
  // superseded by a reroll/opposition change, restore only the exact marks made
  // by this chat card before resolving the new result.
  await game.modules.get(MODULE_ID)?.api?.rollbackDamageForMessage?.(message);
  await rollbackSupersededBoost(message, previousFlags);
  await rollbackSupersededCreatedAspect(message, previousFlags);

  const computed = requestResultCompute.compute({
    payload, request, opposition, previousFlags, actor, skill, validatedStunts, stunts, skillRank, stuntBonus, roll, math, history,
    gmUserId: game.user.id
  });
  const { actorName, rollTotal, outcome, flavor, flagUpdate } = computed;

  resolvingUpdate = true;
  try {
    await message.update({ flavor, [`flags.${MODULE_ID}`]: flagUpdate });
  } finally {
    resolvingUpdate = false;
  }

  try {await globalThis.FateToolkitExtras?.consumeRoll?.(actor,request.actionType,skill.name,`roll:${message.id}`);if(!previousFlags.resolved)await globalThis.FateToolkitExtras?.processAfterRoll?.(actor,message.id);}catch(error){console.warn(`${MODULE_ID} | extra roll reactions`,error);}

  if (outcome?.key) dispatchOutcomeSound(outcome.key, payload.userId);

  const target = request.targets.find(t => t.userId === payload.userId);
  if (target) target.status = "rolled";
  saveGmRequests();
  requestUi.refreshGm();

  const userName = game.users.get(payload.userId)?.name ?? "Игрок";
  globalThis.FateToolkitUX.info(`${userName}: ${flagUpdate.skillName} ${signed(rollTotal)}${outcome ? ` — ${outcome.title}` : ""}`);
  void rollRpcToUser(payload.userId, { type: "resolved", requestId: request.id, messageId: message.id });
}

async function maybeReresolve(message, change, userId) {
  if (resolvingUpdate) return;
  const flags = message.getFlag(MODULE_ID, "requestId") ? message.flags?.[MODULE_ID] : null;
  if (!flags?.requestId) return;
  if (flags.contextResultApplied) return;
  if (game.user.id !== flags.targetUserId) return;
  if (!message.rolls?.length) return;

  const revision = rollRevision.player(message, change, flags);
  if (!revision.ok) return;
  const { total, signature, math, history } = revision;
  const gm = game.users.activeGM;
  if (!gm) return;

  const payload = {
    type: "resolve",
    targetUserIds: [gm.id],
    requestId: flags.requestId,
    messageId: message.id,
    userId: game.user.id,
    actorUuid: flags.actorUuid || game.user.character?.uuid || null,
    actorName: flags.actorName || game.user.character?.name || null,
    rollTotal: total,
    rollSignature: signature,
    skillName: flags.skillName,
    skillRank: flags.skillRank,
    stuntKeys: flags.stuntKeys || [],
    stunts: flags.stunts || [],
    stuntBonus: flags.stuntBonus || 0,
    mathSnapshot: math,
    rollHistory: history,
    modifierSources: math.modifierSources || []
  };

  if (game.user.isGM && gm.id === game.user.id) await resolveOnGm(payload);
  else await rollRpcToGM(payload);
}


async function refreshResolvedMessageForOpposition(request, userId, opposition) {
  if (!game.user.isGM || !request) return;
  const message = game.messages.find(entry => entry.flags?.[MODULE_ID]?.requestId === request.id && entry.flags?.[MODULE_ID]?.targetUserId === userId);
  if (!message) return;
  const flags = message.flags?.[MODULE_ID] ?? {};
  if (!flags.resolved || !Number.isFinite(Number(flags.lastResolvedRollTotal))) return;

  await game.modules.get(MODULE_ID)?.api?.rollbackDamageForMessage?.(message);
  await rollbackSupersededBoost(message, flags);
  await rollbackSupersededCreatedAspect(message, flags);

  const computed = oppositionRefreshCompute.compute({
    request, opposition, flags, gmUserId: game.user.id
  });
  const { outcome, flavor: block, nextFlags } = computed;

  resolvingUpdate = true;
  try {
    await message.update({ flavor: block, [`flags.${MODULE_ID}`]: nextFlags });
  } finally {
    resolvingUpdate = false;
  }
  if (outcome?.key) dispatchOutcomeSound(outcome.key, userId);
}

async function reviseOppositionOnGm(payload) {
  if (!primaryGmExecutor() || !payload?.requestId || !payload?.messageId) return;
  const rebuilt = await oppositionRevision.rebuild(payload);
  if (rebuilt?.pending) {
    pendingOppositionRevisions.set(payload.requestId, payload);
    return;
  }
  if (!rebuilt?.ok) return;

  const { request, userId, opposition } = rebuilt;
  request.oppositionByUser[userId] = opposition;
  saveGmRequests();
  requestUi.refreshGm();
  await refreshResolvedMessageForOpposition(request, userId, opposition);
}

async function maybeReresolveOpposition(message, change, userId) {
  if (oppositionFlagUpdate) return;
  const flags = message.flags?.[MODULE_ID] ?? {};
  if (!flags.actionOppositionFor || !flags.oppositionUserId) return;
  if (game.user.id !== flags.oppositionUserId) return;
  if (!message.rolls?.length) return;

  const revision = rollRevision.opposition(message, change, flags);
  if (!revision.ok) return;
  const { total, signature, math, history } = revision;
  const gm = game.users.activeGM;
  if (!gm) return;

  const payload = {
    type: "oppositionRevised",
    targetUserIds: [gm.id],
    requestId: flags.actionOppositionFor,
    messageId: message.id,
    initiatorUserId: flags.oppositionInitiatorUserId || null,
    oppositionUserId: game.user.id,
    total,
    math,
    history
  };

  oppositionFlagUpdate = true;
  try {
    await message.update({
      flavor: oppositionStandaloneFlavor({
        actorName: flags.oppositionActorName || "Оппозиция",
        againstName: flags.oppositionAgainstName || "действия",
        actionLabel: flags.oppositionActionLabel || "Действие",
        math,
        history
      }),
      [`flags.${MODULE_ID}.oppositionMath`]: math,
      [`flags.${MODULE_ID}.oppositionHistory`]: history,
      [`flags.${MODULE_ID}.lastOppositionRollSignature`]: signature
    });
  } finally {
    oppositionFlagUpdate = false;
  }

  if (game.user.isGM && gm.id === game.user.id) await reviseOppositionOnGm(payload);
  else await rollRpcToGM(payload);
}


async function applyContextualResultOnGm(payload) {
  if (!primaryGmExecutor() || !payload?.messageId) return;
  if (contextualResultLocks.has(payload.messageId)) return;
  contextualResultLocks.add(payload.messageId);
  try {
    const checked = await resultActionPlan.contextual(payload);
    if (!checked?.ok) return;
    const { opportunity } = checked;

    if (opportunity.kind !== "add-invokes") {
      const confirmed = await globalThis.FateToolkitUX.confirm({
        window: { title: uiText("FRR.Dialog.OvercomeAspectTitle", "Преодолеть аспект") },
        content: `<div class="frr-opposition-prompt frr-confirm-prompt"><div class="frr-confirm-icon"><i class="fa-solid fa-broom" aria-hidden="true"></i></div><p>${esc(uiText("FRR.Dialog.RemoveAspectQuestion", "Убрать аспект «{name}» как результат этого действия?", { name: opportunity.name }))}</p></div>`,
        modal: true,
        rejectClose: false
      });
      if (!confirmed) return;
    }

    const committed = await resultActionCommit.contextual({ payload, checked });
    if (!committed?.ok) globalThis.FateToolkitUX.error(committed?.message || uiText("FRR.Chat.ResultActionFailed", "Не удалось применить действие результата."));
  } finally {
    contextualResultLocks.delete(payload.messageId);
  }
}

async function requestContextualResultAction(message) {
  const flags = message.flags?.[MODULE_ID] ?? {};
  const opportunity = contextualResultOpportunity(flags);
  if (!opportunity) return;
  const gm = game.users.activeGM;
  if (!gm) return globalThis.FateToolkitUX.error(uiText("FRR.Chat.NoActiveGMResult", "Нет активного мастера: результат нельзя применить."));
  const payload = { type: "applyContextualResult", targetUserIds: [gm.id], messageId: message.id, userId: game.user.id };
  if (game.user.isGM && gm.id === game.user.id) await applyContextualResultOnGm(payload);
  else await rollRpcToGM(payload);
}

async function injectContextualResultAction(message, html) {
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root) return;
  root.querySelectorAll(".frr-context-result-action").forEach(node => node.remove());
  const card = root.querySelector(".frr-chat-result");
  if (!card) return;
  const flags = message.flags?.[MODULE_ID] ?? {};
  if (flags.contextResultApplied) {
    const row = flags.contextResultApplied;
    const panel = document.createElement("div");
    panel.className = "frr-context-result-action is-applied";
    panel.innerHTML = row.kind === "add-invokes"
      ? `<i class="fa-solid fa-circle-plus" aria-hidden="true"></i><span>${esc(uiText("FRR.Chat.FreeInvokesAdded", "«{name}»: добавлено бесплатных призываний — {count}", { name: row.name, count: numberValue(row.amount) }))}</span>`
      : `<i class="fa-solid fa-check" aria-hidden="true"></i><span>${esc(uiText("FRR.Chat.AspectOvercome", "Аспект «{name}» преодолён.", { name: row.name }))}</span>`;
    card.append(panel);
    return;
  }
  const opportunity = contextualResultOpportunity(flags);
  if (!opportunity) return;
  const actor = await actorFromUuid(flags.actorUuid);
  if (!(game.user.isGM || userMayControlActor(game.user, actor))) return;
  const panel = document.createElement("div");
  panel.className = "frr-context-result-action";
  panel.innerHTML = `<button type="button"><i class="fa-solid ${opportunity.kind === "add-invokes" ? "fa-circle-plus" : "fa-broom"}" aria-hidden="true"></i> ${esc(opportunity.label)}</button><span>«${esc(opportunity.name)}»${opportunity.amount ? ` · +${opportunity.amount}` : ""}</span>`;
  panel.querySelector("button")?.addEventListener("click", () => void requestContextualResultAction(message));
  card.append(panel);
}


async function promptCreatedAspectName(freeInvokes) {
  return foundry.applications.api.DialogV2.prompt({
    window: { title: uiText("FRR.Dialog.CreateAspectTitle", "Создать аспект") },
    content: `<div class="frr-opposition-prompt"><label class="frr-dialog-field"><span>${esc(uiText("FRR.Dialog.AspectName", "Название аспекта"))}</span><input type="text" name="aspectName" placeholder="${esc(uiText("FRR.Dialog.AspectPlaceholder", "Например: Прижат к стене"))}" autofocus></label><p class="frr-rule-suggestion"><i class="fa-solid fa-bolt" aria-hidden="true"></i> ${esc(uiText("FRR.Dialog.FreeInvokes", "Бесплатных призываний: {count}", { count: freeInvokes }))}</p></div>`,
    ok: {
      label: uiText("FRR.Dialog.Create", "Создать"),
      icon: "fa-solid fa-tag",
      callback: (event, button) => String(button.form?.elements?.aspectName?.value || "").trim()
    },
    rejectClose: false
  });
}

async function claimCreatedAspectOnGm(payload) {
  if (!primaryGmExecutor() || !payload?.messageId) return;
  if (createdAspectClaimLocks.has(payload.messageId)) return;
  createdAspectClaimLocks.add(payload.messageId);
  try {
    const checked = await resultActionPlan.createdAspect(payload);
    if (!checked?.ok) return;
    const committed = await resultActionCommit.createdAspect({ payload, checked });
    if (!committed?.ok) globalThis.FateToolkitUX.error(committed?.message || uiText("FRR.Chat.CreateSceneAspectFailed", "Не удалось создать аспект сцены."));
  } finally {
    createdAspectClaimLocks.delete(payload.messageId);
  }
}

async function requestCreatedAspectFromResult(message) {
  const flags = message.flags?.[MODULE_ID] ?? {};
  const opportunity = createdAspectOpportunity(flags);
  if (!opportunity) return;
  const name = await promptCreatedAspectName(opportunity.freeInvokes);
  if (!name) return;
  const gm = game.users.activeGM;
  if (!gm) return globalThis.FateToolkitUX.error(uiText("FRR.Chat.NoActiveGMCreateAspect", "Нет активного мастера: аспект сцены нельзя создать."));
  const payload = { type: "claimCreatedAspect", targetUserIds: [gm.id], messageId: message.id, userId: game.user.id, name };
  if (game.user.isGM && gm.id === game.user.id) await claimCreatedAspectOnGm(payload);
  else await rollRpcToGM(payload);
}

async function injectCreatedAspectAction(message, html) {
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root) return;
  root.querySelectorAll(".frr-created-aspect-action").forEach(node => node.remove());
  const card = root.querySelector(".frr-chat-result");
  if (!card) return;
  const flags = message.flags?.[MODULE_ID] ?? {};
  if (flags.createdAspectClaimed && flags.createdSceneAspect) {
    const created = flags.createdSceneAspect;
    const panel = document.createElement("div");
    panel.className = "frr-created-aspect-action is-created";
    panel.innerHTML = `<i class="fa-solid fa-tag" aria-hidden="true"></i><span>${esc(uiText("FRR.Chat.AspectCreated", "Аспект «{name}» создан · бесплатных призываний: {count}", { name: created.name, count: numberValue(created.freeInvokes) }))}</span>`;
    card.append(panel);
    return;
  }
  const opportunity = createdAspectOpportunity(flags);
  if (!opportunity) return;
  const actor = await actorFromUuid(flags.actorUuid);
  if (!(game.user.isGM || userMayControlActor(game.user, actor))) return;
  const panel = document.createElement("div");
  panel.className = "frr-created-aspect-action";
  panel.innerHTML = `<button type="button" data-create-result-aspect><i class="fa-solid fa-tag" aria-hidden="true"></i> ${esc(uiText("FRR.Chat.CreateAspect", "Создать аспект"))}</button><span>${esc(uiText("FRR.Chat.FreeInvokesCount", "Бесплатных призываний: {count}", { count: opportunity.freeInvokes }))}</span>`;
  panel.querySelector("button")?.addEventListener("click", () => void requestCreatedAspectFromResult(message));
  card.append(panel);
}

async function promptBoostName() {
  const DialogV2 = foundry.applications.api.DialogV2;
  return DialogV2.prompt({
    window: { title: uiText("FRR.Dialog.AddBoostTitle", "Добавить усиление") },
    content: `<div class="frr-opposition-prompt"><label class="frr-dialog-field"><span>${esc(uiText("FRR.Dialog.BoostName", "Название усиления"))}</span><input type="text" name="boostName" placeholder="${esc(uiText("FRR.Dialog.BoostPlaceholder", "Например: Выбит из равновесия"))}" autofocus></label></div>`,
    ok: {
      label: uiText("FRR.Dialog.Add", "Добавить"),
      icon: "fa-solid fa-bolt",
      callback: (event, button) => String(button.form?.elements?.boostName?.value || "").trim()
    },
    rejectClose: false
  });
}

function privateOppositionActorUuidForResult(message, flags = message?.flags?.[MODULE_ID] ?? {}) {
  if (!game.user?.isGM) return null;
  if (flags.oppositionActorUuid) return String(flags.oppositionActorUuid);
  const request = gmRequests.get(flags.requestId);
  const row = request?.oppositionByUser?.[flags.targetUserId];
  return row?.actorUuid ? String(row.actorUuid) : null;
}

const boostClaimPlan = globalThis.FateToolkitBoostClaimPlan.create({
  getMessage: messageId => game.messages.get(messageId),
  getUser: userId => game.users.get(userId),
  actorFromUuid,
  canUserControlActor,
  getActorCombatState: actorUuid => game.modules.get(MODULE_ID)?.api?.getActorCombatState?.(actorUuid),
  damageResolutionStarted: message => Boolean(game.modules.get(MODULE_ID)?.api?.damageResolutionStarted?.(message)),
  privateOppositionActorUuid: privateOppositionActorUuidForResult,
  moduleId: MODULE_ID
});

const boostClaimCommit = globalThis.FateToolkitBoostClaimCommit.create({
  addBoost: async (actorUuid, name) => game.modules.get(MODULE_ID)?.api?.addBoost?.(actorUuid, name),
  unnamedBoostName: () => game.i18n.localize("FAW.UnnamedBoost"),
  resolvedFlavor: resolvedBlock,
  replaceBoostBlock,
  boostActionMarkup,
  updateMessage: async (message, patch) => {
    resolvingUpdate = true;
    try {
      await message.update(patch);
    } finally {
      resolvingUpdate = false;
    }
  },
  appendAudit: appendMessageAudit,
  actorFromUuid,
  recordConflictEvent: async row => game.modules.get(MODULE_ID)?.api?.recordConflictEvent?.(row),
  moduleId: MODULE_ID
});

async function claimBoostOnGm(payload) {
  if (!primaryGmExecutor() || !payload?.messageId) return;
  if (boostClaimLocks.has(payload.messageId)) return;
  boostClaimLocks.add(payload.messageId);

  try {
    const checked = await boostClaimPlan.prepare(payload);
    if (!checked?.ok) {
      if (checked?.silent) return;
      const notify = checked?.level === "error" ? globalThis.FateToolkitUX.error : globalThis.FateToolkitUX.warn;
      return notify(checked?.message || "Нельзя создать усиление из этого результата.");
    }

    if (!game.modules.get(MODULE_ID)?.api?.addBoost) {
      globalThis.FateToolkitUX.error("API виджета аспектов недоступен: усиление не создано.");
      return;
    }

    const request = gmRequests.get(checked.flags.requestId);
    const opposition = request?.oppositionByUser?.[checked.flags.targetUserId];
    const committed = await boostClaimCommit.commit({ payload, checked, request, opposition });
    if (!committed?.ok) globalThis.FateToolkitUX.error(committed?.message || "Не удалось создать усиление.");
  } finally {
    boostClaimLocks.delete(payload.messageId);
  }
}

async function requestBoostFromResult(message) {
  const flags = message.flags?.[MODULE_ID] ?? {};
  const opportunity = flags.boostOpportunity;
  if (!opportunity || flags.boostClaimed) return;

  const name = await promptBoostName();
  if (name === null) return;

  const gm = game.users.activeGM;
  if (!gm) return globalThis.FateToolkitUX.error("Нет активного мастера: усиление нельзя связать с результатом броска.");

  const payload = {
    type: "claimBoost",
    targetUserIds: [gm.id],
    messageId: message.id,
    userId: game.user.id,
    name: String(name || "").trim()
  };

  if (game.user.isGM && gm.id === game.user.id) await claimBoostOnGm(payload);
  else await rollRpcToGM(payload);
}

function bindBoostResultButtons(message, html) {
  const flags = message.flags?.[MODULE_ID] ?? {};
  if (!flags.boostOpportunity || flags.boostClaimed) return;

  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root) return;

  const opportunity = flags.boostOpportunity;
  const turnClosed = game.modules.get(MODULE_ID)?.api?.getActorCombatState?.(flags.actorUuid)?.acted === true;
  const allowed = !turnClosed && (game.user.isGM || (opportunity.recipient === "roller" && game.user.id === flags.targetUserId));

  root.querySelectorAll('[data-action="frr-create-boost"]').forEach(button => {
    if (!allowed) {
      button.closest(".frr-boost-action")?.remove();
      return;
    }
    button.addEventListener("click", () => void requestBoostFromResult(message));
  });
}

async function handleActionProposalOnGm(payload, senderId) {
  if (!primaryGmExecutor()) return;
  const user = game.users.get(String(senderId || ""));
  const proposal = foundry.utils.duplicate(payload?.proposal ?? {});
  if (!user || !proposal?.id) throw new Error("Некорректное действие Fate.");
  proposal.initiatorUserId = user.id;
  proposal.initiatorName = user.name;

  let actor = await resolveActionActor(proposal.actorRef);
  if (!actor && proposal.actorUuid) {
    try {
      const doc = await fromUuid(proposal.actorUuid);
      actor = doc?.actor ?? doc;
    } catch (_) {}
  }
  if (!actor || actor.type !== SYSTEM_ID || (!user.isGM && !canUserControlActor(user, actor))) {
    throw new Error("Отклонено действие персонажем без прав владельца.");
  }
  const skill = findSkill(actor, proposal.skillName);
  if (!skill) throw new Error("Выбранный навык больше недоступен.");
  const selectedStunts = validateStuntSelection(actor, proposal.stuntKeys || [], skill.name, proposal.actionType);
  proposal.actorUuid = actor.uuid;
  proposal.actorName = actor.name;
  proposal.skillName = skill.name;
  proposal.skillRank = skill.rank;
  proposal.stuntKeys = selectedStunts.map(stunt => stunt.key);
  proposal.stunts = selectedStunts.map(stunt => ({ key: stunt.key, name: stunt.name, bonus: stunt.bonus, linkedSkill: stunt.linkedSkill }));
  proposal.stuntBonus = stuntBonusTotal(selectedStunts);
  rememberAuthenticatedActionProposal(proposal);

  const targetActor = await resolveProposalTargetActor(proposal);
  const opponentUser = designatedOpponentOwner(targetActor, user.id);
  if (opponentUser) {
    await rollRpcToUser(opponentUser.id, { type: "actionOppositionRequest", resolverRole: "player", proposal });
  } else {
    enqueueActionOpposition({ resolverRole: "gm", proposal });
  }
}

async function onRpc(payload, { senderId } = {}) {
  if (!payload?.type) return;
  const rpc = rollRpc();
  const sender = game.users.get(String(senderId || ""));

  if (["request", "cancel", "actionApproved", "resolved"].includes(payload.type)) {
    rpc.assertGM(senderId);
  }

  if (payload.type === "actionProposal") {
    return handleActionProposalOnGm(payload, senderId);
  }

  if (payload.type === "actionOppositionRequest") {
    rpc.assertGM(senderId);
    enqueueActionOpposition(payload);
    return;
  }

  if (payload.type === "actionOppositionFallback") {
    if (!primaryGmExecutor()) return;
    const trusted = trustedActionProposal(payload?.proposal?.id);
    if (!trusted) throw new Error("Исходное действие больше не подтверждено мастером.");
    const targetActor = await resolveProposalTargetActor(trusted);
    const expected = designatedOpponentOwner(targetActor, trusted.initiatorUserId);
    if (!sender || !expected || String(expected.id) !== String(senderId || "")) {
      throw new Error("Отклонён fallback не от назначенного соперника.");
    }
    enqueueActionOpposition({ resolverRole: "gm", proposal: trusted });
    return;
  }

  if (payload.type === "actionOppositionResult") {
    if (!primaryGmExecutor()) return;
    const trusted = trustedActionProposal(payload?.proposal?.id);
    if (!trusted) throw new Error("Исходное действие больше не подтверждено мастером.");
    const targetActor = await resolveProposalTargetActor(trusted);
    const expected = designatedOpponentOwner(targetActor, trusted.initiatorUserId);
    if (!sender || !expected || String(expected.id) !== String(senderId || "")) {
      throw new Error("Отклонена оппозиция не от назначенного соперника.");
    }
    const opposition = foundry.utils.duplicate(payload.opposition ?? {});
    opposition.oppositionUserId = String(senderId || "");
    return finalizePlayerActionProposal(trusted, opposition, { fromPlayerSocket: true });
  }

  if (payload.type === "actionOppositionDeclined") {
    if (!primaryGmExecutor()) return;
    const trusted = trustedActionProposal(payload?.proposalId);
    if (!trusted) return;
    const targetActor = await resolveProposalTargetActor(trusted);
    const expected = designatedOpponentOwner(targetActor, trusted.initiatorUserId);
    if (!expected || String(expected.id) !== String(senderId || "")) {
      throw new Error("Отклонение пришло не от назначенного соперника.");
    }
    forgetAuthenticatedActionProposal(trusted.id);
    return rollRpcToUser(trusted.initiatorUserId, { type: "actionDeclined", proposalId: trusted.id });
  }

  if (payload.type === "oppositionRevised") {
    if (!primaryGmExecutor()) return;
    return reviseOppositionOnGm({ ...payload, oppositionUserId: String(senderId || "") });
  }

  if (payload.type === "actionApproved") {
    return handleApprovedAction(payload);
  }

  if (payload.type === "actionDeclined") {
    rpc.assertGM(senderId);
    const by = sender?.name || "Мастер";
    await clearPendingAction(payload?.proposalId ?? null);
    globalThis.FateToolkitUX.warn(`${by} отклонил действие Fate.`);
    return;
  }

  if (payload.type === "claimBoost" && primaryGmExecutor()) return claimBoostOnGm(actualRpcUser(payload, senderId));
  if (payload.type === "claimCreatedAspect" && primaryGmExecutor()) return claimCreatedAspectOnGm(actualRpcUser(payload, senderId));
  if (payload.type === "applyContextualResult" && primaryGmExecutor()) return applyContextualResultOnGm(actualRpcUser(payload, senderId));

  if (payload.type === "request" && !game.user.isGM) {
    pendingRequests.set(payload.request.id, payload.request);
    savePlayerPending();
    renderTray({ open: true });
    globalThis.FateToolkitUX.info(`Новый запрос броска: ${payload.request.title}`);
    return;
  }

  if (payload.type === "cancel" && !game.user.isGM) {
    pendingRequests.delete(payload.requestId);
    savePlayerPending();
    renderTray();
    return;
  }

  if (payload.type === "decline" && primaryGmExecutor()) {
    const userId = String(senderId || "");
    const request = gmRequests.get(payload.requestId);
    const target = request?.targets.find(t => t.userId === userId);
    if (!target) throw new Error("Пользователь не является адресатом этого запроса.");
    target.status = "declined";
    saveGmRequests();
    requestUi.refreshGm();
    globalThis.FateToolkitUX.warn(`${game.users.get(userId)?.name ?? "Игрок"} отказался от запроса «${request?.title ?? payload.requestId}».`);
    return;
  }

  if (payload.type === "resolve" && primaryGmExecutor()) {
    return resolveOnGm(actualRpcUser(payload, senderId));
  }
}

function onSocket(payload) {
  // Raw Foundry sockets are kept only for non-authoritative sound playback.
  // All state-changing Fate Toolkit traffic uses authenticated socketlib RPC.
  if (!payload?.type || payload.type !== "playSound") return;
  if (Array.isArray(payload.targetUserIds) && !payload.targetUserIds.includes(game.user.id)) return;
  playSoundLocal(payload.src, payload.volume);
}

// ---------------------------------------------------------------------------
// Player/GM initiated Fate action widget
// ---------------------------------------------------------------------------
let actionWidget = null;
let actionWidgetRenderPending = false;
let actionActorRef = "";
let actionTargetRef = "";
let actionPositionWriteTimer;
let oppositionPersistTimer = null;
const handledActionApprovals = new Set();
const actionOppositionQueue = [];
let activeOppositionPayload = null;

const actionState = globalThis.FateToolkitActionState.create({
  getDraftRefs: () => ({ actorRef: actionActorRef, targetRef: actionTargetRef }),
  setDraftRefs: refs => {
    actionActorRef = String(refs?.actorRef || "");
    actionTargetRef = String(refs?.targetRef || "");
  },
  currentSceneId: () => canvas?.scene?.id ?? null,
  refreshWorkflowCenter: options => game.modules.get(MODULE_ID)?.api?.refreshWorkflowCenter?.(options),
  handleApprovedAction: payload => handleApprovedAction(payload),
  findSkill,
  refreshActionWidget: () => refreshActionWidget()
});

const {
  cloneUserState, userFlag, writeUserFlag, rememberAuthenticatedActionProposal, trustedActionProposal,
  forgetAuthenticatedActionProposal, restoreAuthenticatedActionProposals, actionDraftSnapshot,
  scheduleActionDraftPersist, restoreActionDraft, pendingActionState, setPendingAction, clearPendingAction,
  persistActionHandoff, removeOwnActionHandoff, restoreActionHandoffs, actionPrefs, actorActionPrefs,
  preferredSkillName, rememberSkill, toggleFavoriteSkill
} = actionState;
const ACTION_PREFS_SETTING = actionState.ACTION_PREFS_SETTING;

const playerOppositionRoll = globalThis.FateToolkitPlayerOppositionRoll.create({
  findSkill,
  rememberSkill,
  validateStuntSelection,
  stuntBonusTotal,
  snapshotRollMath,
  rollFormula: async formula => {
    const roll = await (new Roll(formula)).roll();
    if (roll.dice?.[0]) roll.dice[0].options.sfx = { id: "fate4df", result: roll.result };
    roll.options.fco_formula = "4dF";
    return roll;
  },
  postOppositionRoll: async ({ roll, proposal, targetActor, skill, stunts, stuntBonus, oppositionMath }) => {
    const speaker = ChatMessage.getSpeaker({ actor: targetActor });
    speaker.alias = targetActor.name;
    return roll.toMessage({
      speaker,
      flavor: oppositionStandaloneFlavor({ actorName: targetActor.name, againstName: proposal.actorName, actionLabel: proposal.actionLabel, math: oppositionMath, history: [oppositionMath] }),
      flags: { [MODULE_ID]: {
        actionOppositionFor: proposal.id,
        oppositionUserId: game.user.id,
        oppositionInitiatorUserId: proposal.initiatorUserId,
        oppositionAgainstName: proposal.actorName,
        oppositionAgainstActorUuid: proposal.actorUuid || null,
        oppositionActionLabel: proposal.actionLabel,
        oppositionActorUuid: targetActor.uuid,
        oppositionActorName: targetActor.name,
        oppositionSkillName: skill.name,
        oppositionSkillRank: skill.rank,
        stuntKeys: stunts.map(stunt => stunt.key),
        stunts: stunts.map(stunt => ({ key: stunt.key, name: stunt.name, bonus: stunt.bonus, linkedSkill: stunt.linkedSkill })),
        stuntBonus,
        oppositionMath,
        oppositionHistory: [oppositionMath],
        lastOppositionRollSignature: rollSignature(roll)
      } }
    });
  },
  currentUserId: () => game.user.id
});



















function oppositionRowsForStorage() {
  const rows = [];
  if (activeOppositionPayload?.proposal?.id) rows.push(activeOppositionPayload);
  for (const row of actionOppositionQueue) {
    if (!row?.proposal?.id || rows.some(existing => existing.proposal.id === row.proposal.id)) continue;
    rows.push(row);
  }
  return rows.slice(0, 20).map(row => cloneUserState(row, {}));
}

function scheduleOppositionPersist() {
  if (!game.user) return;
  if (oppositionPersistTimer) clearTimeout(oppositionPersistTimer);
  oppositionPersistTimer = setTimeout(() => {
    oppositionPersistTimer = null;
    void writeUserFlag(OPPOSITION_QUEUE_FLAG, oppositionRowsForStorage());
    game.modules.get(MODULE_ID)?.api?.refreshWorkflowCenter?.({ allowAutoOpen: true });
  }, 60);
}

function restoreOppositionQueue() {
  const rows = userFlag(OPPOSITION_QUEUE_FLAG, []);
  if (!Array.isArray(rows)) return 0;
  const now = Date.now();
  let restored = 0;
  for (const row of rows) {
    const proposal = row?.proposal;
    if (!proposal?.id) continue;
    if (Number(proposal.createdAt || 0) && now - Number(proposal.createdAt) > 86400000) continue;
    if (game.user.isGM && gmRequests.has(proposal.id)) continue;
    if (actionOppositionQueue.some(existing => existing?.proposal?.id === proposal.id)) continue;
    actionOppositionQueue.push(cloneUserState(row, {}));
    restored += 1;
  }
  scheduleOppositionPersist();
  return restored;
}








function resetActionTarget({ clearCanvas = true } = {}) {
  actionTargetRef = "";
  if (clearCanvas) canvas?.tokens?.setTargets?.([], { mode: "replace" });
  scheduleActionDraftPersist();
  refreshActionWidget();
}

let actionOppositionDialogRunning = false;

function actionActorOptions() {
  const rows = [];
  const seen = new Set();
  const scene = canvas?.scene;
  if (scene) {
    for (const tokenDoc of scene.tokens) {
      const actor = tokenDoc.actor;
      if (!actor || actor.type !== SYSTEM_ID) continue;
      if (!game.user.isGM && (!actor.isOwner || tokenDoc.hidden)) continue;
      const ref = `token:${tokenDoc.id}`;
      rows.push({ ref, name: tokenDoc.name || actor.name, actorName: actor.name, tokenId: tokenDoc.id });
      seen.add(actor.id);
    }
  }

  if (!game.user.isGM) {
    const assigned = game.user.character;
    if (assigned?.type === SYSTEM_ID && assigned.isOwner && !seen.has(assigned.id)) {
      rows.push({ ref: `actor:${assigned.id}`, name: `${assigned.name} (без токена)`, actorName: assigned.name, tokenId: null });
    }
  }

  return rows.sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
}

function actionTargetOptions(actorRef = actionActorRef) {
  const rows = [];
  const scene = canvas?.scene;
  const actingTokenId = String(actorRef || "").startsWith("token:") ? String(actorRef).slice(6) : null;

  if (scene) {
    for (const tokenDoc of scene.tokens) {
      if (tokenDoc.id === actingTokenId) continue;
      const token = tokenDoc.object;
      const actor = tokenDoc.actor;
      if (!actor || actor.type !== SYSTEM_ID) continue;
      if (!game.user.isGM && (tokenDoc.hidden || (token && !token.isVisible))) continue;
      rows.push({
        ref: `token:${tokenDoc.id}`,
        name: `◉ ${tokenDoc.name || actor.name}`,
        kind: "token"
      });
    }
  }

  const markerApi = game.modules.get(MODULE_ID)?.api;
  const markers = markerApi?.getMarkers?.() ?? [];
  for (const marker of markers) {
    if (!marker?.id) continue;
    rows.push({
      ref: `marker:${marker.id}`,
      name: `◆ ${marker.text || "Аспект"}`,
      kind: "marker"
    });
  }

  return rows.sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
}

function syncActionActorFromCanvas() {
  const candidates = (canvas?.tokens?.controlled ?? []).filter(token => {
    const actor = token.actor;
    return actor?.type === SYSTEM_ID && (game.user.isGM || actor.isOwner);
  });
  if (candidates.length === 1) {
    actionActorRef = `token:${candidates[0].id}`;
    scheduleActionDraftPersist();
  }
}

function syncActionTargetFromCanvas() {
  const targets = [...(game.user?.targets ?? [])].filter(token => token?.actor?.type === SYSTEM_ID);
  if (targets.length === 1) actionTargetRef = `token:${targets[0].id}`;
  else actionTargetRef = "";
  scheduleActionDraftPersist();
}

function validateActionSelections() {
  const actors = actionActorOptions();
  if (!actors.some(row => row.ref === actionActorRef)) {
    syncActionActorFromCanvas();
    if (!actors.some(row => row.ref === actionActorRef)) actionActorRef = actors[0]?.ref ?? "";
  }

  const targets = actionTargetOptions(actionActorRef);
  if (actionTargetRef && !targets.some(row => row.ref === actionTargetRef)) actionTargetRef = "";
  return { actors, targets };
}

async function resolveActionActor(ref) {
  const actor = actorFromRef(ref);
  if (actor) return actor;
  if (String(ref || "").startsWith("actor:")) return game.actors.get(String(ref).slice(6)) ?? null;
  return null;
}

function actionTargetFromRef(ref) {
  const raw = String(ref || "");
  if (raw.startsWith("token:")) {
    const tokenId = raw.slice(6);
    const tokenDoc = canvas?.scene?.tokens?.get(tokenId);
    const actor = tokenDoc?.actor;
    if (!tokenDoc || !actor) return null;
    return {
      type: "token",
      ref: raw,
      sceneId: canvas?.scene?.id ?? null,
      tokenId,
      actorUuid: actor.uuid,
      actorName: actor.name,
      name: tokenDoc.name || actor.name,
      img: tokenDoc.texture?.src || actor.img
    };
  }
  if (raw.startsWith("marker:")) {
    const markerId = raw.slice(7);
    const marker = game.modules.get(MODULE_ID)?.api?.getMarker?.(markerId);
    if (!marker) return null;
    return {
      type: "marker",
      ref: raw,
      sceneId: canvas?.scene?.id ?? null,
      markerId,
      name: String(marker.text || "Аспект"),
      text: String(marker.text || ""),
      meta: String(marker.meta || ""),
      source: marker.source ?? null
    };
  }
  return null;
}

function designatedOpponentOwner(targetActor, initiatorUserId) {
  if (!targetActor) return null;
  try {
    return game.users.getDesignatedUser(user =>
      user.active &&
      !user.isGM &&
      user.id !== initiatorUserId &&
      targetActor.testUserPermission(user, "OWNER")
    );
  } catch (_) {
    return game.users
      .filter(user => user.active && !user.isGM && user.id !== initiatorUserId && targetActor.testUserPermission(user, "OWNER"))
      .sort((a, b) => (b.role ?? 0) - (a.role ?? 0))[0] ?? null;
  }
}

async function chooseCreateMode(target) {
  const existingFirst = target?.type === "marker";
  const result = await foundry.applications.api.DialogV2.input({
    window: { title: uiText("FRR.Dialog.CreateAdvantageTitle", "Создание преимущества"), resizable: true, minimizable: false },
    position: { width: 420, height: "auto" },
    content: `<div class="frr-opposition-prompt"><label class="frr-dialog-field"><span>${esc(uiText("FRR.Dialog.CreateQuestion", "Что вы делаете?"))}</span><select name="createMode"><option value="existing" ${existingFirst ? "selected" : ""}>${esc(uiText("FRR.Dialog.WorkExisting", "Работаю с существующим аспектом"))}</option><option value="new" ${existingFirst ? "" : "selected"}>${esc(uiText("FRR.Dialog.CreateNew", "Создаю новый аспект"))}</option></select></label></div>`,
    ok: { label: uiText("FRR.Dialog.Continue", "Продолжить"), icon: "fa-solid fa-arrow-right" },
    rejectClose: false,
    modal: true
  });
  return result?.get?.("createMode") ?? null;
}

function actionPreparationPlan(actor, actionType, target, { forceConfigure = false } = {}) {
  // A remembered skill is only a default selection. It must never silently skip
  // the choice dialog: hidden Shift/Alt gestures are too easy to miss at the table.
  const rememberedSkillName = preferredSkillName(actor, actionType) || "";
  return {
    rememberedSkillName,
    needsSkillDialog: true,
    createMode: actionType === "create" && !forceConfigure
      ? (target?.type === "marker" ? "existing" : "new")
      : null,
    needsCreateModeDialog: actionType === "create" && forceConfigure
  };
}

async function initiateActionFromWidget(actionType, overrides = {}) {
  const gm = game.users.activeGM;
  if (!gm) return globalThis.FateToolkitUX.error("Нет активного мастера: действие нельзя разрешить.");
  const unfinished = pendingActionState();
  if (unfinished?.proposal?.id) return globalThis.FateToolkitUX.warn("Предыдущее действие ещё ожидает разрешения оппозиции.");

  validateActionSelections();
  const actorRef = String(overrides.actorRef || actionActorRef || "");
  const targetRef = String(overrides.targetRef || actionTargetRef || "");
  const actor = await resolveActionActor(actorRef);
  if (!actor || actor.type !== SYSTEM_ID || !(game.user.isGM || actor.isOwner)) {
    return globalThis.FateToolkitUX.error("Выберите персонажа, которым вы можете действовать.");
  }

  if (actorRef && targetRef && actorRef === targetRef) {
    return globalThis.FateToolkitUX.warn("Нельзя выбрать действующего персонажа целью этого же действия.");
  }

  const target = targetRef ? actionTargetFromRef(targetRef) : null;
  if (targetRef && !target) return globalThis.FateToolkitUX.warn("Выбранная цель больше недоступна.");
  if (target?.type === "token" && target.actorUuid === actor.uuid) {
    return globalThis.FateToolkitUX.warn("Нельзя выбрать действующего персонажа целью этого же действия.");
  }

  actionActorRef = actorRef;
  actionTargetRef = targetRef;
  refreshActionWidget();

  const prep = actionPreparationPlan(actor, actionType, target, { forceConfigure: Boolean(overrides.forceConfigure) });
  // Always show the skill/stunt choice. The last-used skill is preselected by
  // chooseActionSkill(), but the player can change it with an ordinary click.
  const actionChoice = await chooseActionSkill(actor, actionType);
  if (!actionChoice) return;
  const skillName = actionChoice.skillName;
  const skill = findSkill(actor, skillName);
  if (!skill) return globalThis.FateToolkitUX.error(`У ${actor.name} нет навыка «${skillName}».`);
  const selectedStunts = validateStuntSelection(actor, actionChoice.stuntKeys, skill.name, actionType);
  const stuntBonus = stuntBonusTotal(selectedStunts);

  let createMode = prep.createMode;
  if (prep.needsCreateModeDialog) {
    createMode = await chooseCreateMode(target);
    if (!createMode) return;
  }

  const proposal = {
    id: foundry.utils.randomID(),
    initiatorUserId: game.user.id,
    initiatorName: game.user.name,
    actorRef,
    sceneId: canvas?.scene?.id ?? null,
    actorUuid: actor.uuid,
    actorName: actor.name,
    actionType,
    actionLabel: actionLabel(actionType),
    skillName: skill.name,
    skillRank: skill.rank,
    stuntKeys: selectedStunts.map(stunt => stunt.key),
    stunts: selectedStunts.map(stunt => ({ key: stunt.key, name: stunt.name, bonus: stunt.bonus, linkedSkill: stunt.linkedSkill })),
    stuntBonus,
    createMode,
    defendedAgainst: actionChoice.defendedAgainst ?? null,
    defendedCreateMode: actionChoice.defendedCreateMode ?? null,
    target,
    createdAt: Date.now()
  };

  scheduleActionDraftPersist();
  await setPendingAction(proposal, "waiting-opposition");

  if (!(game.user.isGM && gm.id === game.user.id)) {
    // Every player-originated action first crosses the authenticated GM boundary.
    // The GM validates the real sender and actor ownership before any opponent sees it.
    await rollRpcToGM({ type: "actionProposal", proposal });
    globalThis.FateToolkitUX.info(`${proposal.actionLabel}: действие передано мастеру.`);
    return;
  }

  let targetActor = null;
  if (target?.type === "token") targetActor = actorFromRef(`token:${target.tokenId}`);
  const opponentUser = designatedOpponentOwner(targetActor, game.user.id);
  if (opponentUser) {
    rememberAuthenticatedActionProposal(proposal);
    await rollRpcToUser(opponentUser.id, { type: "actionOppositionRequest", resolverRole: "player", proposal });
    globalThis.FateToolkitUX.info(`${proposal.actionLabel}: ожидается выбор оппозиции от ${opponentUser.name}.`);
  } else {
    // DialogV2.wait resolves before the closing transition has completely disappeared.
    await new Promise(resolve => setTimeout(resolve, 180));
    enqueueActionOpposition({ resolverRole: "gm", proposal });
  }
}

function startActionDrag(button, event) {
  if (!event.dataTransfer) return;
  validateActionSelections();
  const actionType = String(button.dataset.fateAction || "");
  if (!["attack", "overcome", "create", "defend"].includes(actionType) || !actionActorRef) {
    event.preventDefault();
    globalThis.FateToolkitUX.warn("Сначала выберите персонажа, который совершает действие.");
    return;
  }
  const payload = {
    type: "FateAspectAction",
    actionType,
    actorRef: actionActorRef,
    sceneId: canvas?.scene?.id ?? null
  };
  const raw = JSON.stringify(payload);
  event.dataTransfer.effectAllowed = "copy";
  event.dataTransfer.setData(ACTION_DRAG_MIME, raw);
  event.dataTransfer.setData("text/plain", raw);
  button.classList.add("faw-action-dragging");
}

function tokenRefAtCanvasPoint(x, y, actorRef = "") {
  if (!canvas?.ready || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const placeables = [...(canvas.tokens?.placeables ?? [])].reverse();
  for (const token of placeables) {
    const actor = token.actor;
    if (!actor || actor.type !== SYSTEM_ID) continue;
    if (!game.user.isGM && (!token.isVisible || token.document.hidden)) continue;
    if (`token:${token.id}` === actorRef) continue;
    const bounds = token.bounds ?? token.getBounds?.();
    if (bounds?.contains?.(x, y)) return `token:${token.id}`;
  }
  return null;
}

async function handleActionCanvasDrop(data) {
  if (data?.type !== "FateAspectAction") return false;
  const x = Number(data.x);
  const y = Number(data.y);
  const targetRef = tokenRefAtCanvasPoint(x, y, String(data.actorRef || "")) || "";
  await initiateActionFromWidget(String(data.actionType || ""), {
    actorRef: String(data.actorRef || ""),
    targetRef
  });
  return true;
}

function actionProposalSummary(proposal) {
  const target = proposal?.target;
  const targetText = target?.type === "marker"
    ? `${target.name}${target.meta ? ` · ${target.meta}` : ""}`
    : (target?.name || "без выбранной цели");
  const defenseContext = proposal?.actionType === "defend"
    ? ` (от ${proposal.defendedAgainst === "create" ? "создания преимущества" : proposal.defendedAgainst === "overcome" ? "преодоления" : "атаки"})`
    : "";
  const stuntText = proposal?.stunts?.length ? ` · ${stuntSummaryText(proposal.stunts)}` : "";
  return `${proposal.actorName}: ${proposal.actionLabel}${defenseContext} → ${targetText}${stuntText}`;
}

async function resolveProposalTargetActor(proposal) {
  const target = proposal?.target;
  if (!target) return null;

  if (target.type === "token") {
    const local = actorFromRef(`token:${target.tokenId}`);
    if (local) return local;
    const sceneActor = game.scenes.get(target.sceneId || proposal.sceneId)?.tokens?.get(target.tokenId)?.actor;
    if (sceneActor) return sceneActor;
  }

  if (target.type === "actor" && target.actorId) {
    const actor = game.actors.get(target.actorId);
    if (actor) return actor;
  }

  if (target.actorUuid) {
    try {
      const doc = await fromUuid(target.actorUuid);
      return doc?.actor ?? doc ?? null;
    } catch (_) {}
  }
  return null;
}

function gmOppositionTargetOptions(proposal) {
  const rows = [];
  const seenActors = new Set();
  const actingUuid = String(proposal?.actorUuid || "");
  const scene = game.scenes.get(proposal?.sceneId) ?? canvas?.scene;

  if (scene) {
    for (const tokenDoc of scene.tokens) {
      const actor = tokenDoc.actor;
      if (!actor || actor.type !== SYSTEM_ID || actor.uuid === actingUuid) continue;
      rows.push({
        ref: `token:${tokenDoc.id}`,
        name: `[Сцена] ${tokenDoc.name || actor.name}`,
        actor
      });
      seenActors.add(actor.id);
    }
  }

  for (const actor of game.actors) {
    if (actor.type !== SYSTEM_ID || actor.uuid === actingUuid || seenActors.has(actor.id)) continue;
    rows.push({ ref: `actor:${actor.id}`, name: actor.name, actor });
  }

  return rows.sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
}

function proposalTargetForOpponentRef(ref, proposal) {
  const raw = String(ref || "");
  if (!raw) return null;

  if (raw.startsWith("token:")) {
    const tokenId = raw.slice(6);
    const scene = game.scenes.get(proposal?.sceneId) ?? canvas?.scene;
    const tokenDoc = scene?.tokens?.get(tokenId);
    const actor = tokenDoc?.actor;
    if (!tokenDoc || !actor) return null;
    return {
      type: "token",
      ref: raw,
      sceneId: scene?.id ?? proposal?.sceneId ?? null,
      tokenId,
      actorUuid: actor.uuid,
      actorName: actor.name,
      name: tokenDoc.name || actor.name,
      img: tokenDoc.texture?.src || actor.img
    };
  }

  if (raw.startsWith("actor:")) {
    const actor = game.actors.get(raw.slice(6));
    if (!actor || actor.type !== SYSTEM_ID) return null;
    return {
      type: "actor",
      ref: raw,
      actorId: actor.id,
      actorUuid: actor.uuid,
      actorName: actor.name,
      name: actor.name,
      img: actor.img
    };
  }

  return null;
}

function enqueueActionOpposition(payload) {
  const proposalId = payload?.proposal?.id;
  if (!proposalId) return;
  if (activeOppositionPayload?.proposal?.id === proposalId || actionOppositionQueue.some(row => row?.proposal?.id === proposalId)) return;
  actionOppositionQueue.push(cloneUserState(payload, {}));
  scheduleOppositionPersist();
  void processActionOppositionQueue();
}

async function processActionOppositionQueue() {
  if (actionOppositionDialogRunning || !actionOppositionQueue.length) return;
  actionOppositionDialogRunning = true;
  try {
    while (actionOppositionQueue.length) {
      activeOppositionPayload = actionOppositionQueue.shift();
      scheduleOppositionPersist();
      const payload = activeOppositionPayload;
      if (!payload?.proposal) { activeOppositionPayload = null; continue; }
      try {
        if (payload.resolverRole === "player") await resolveActionAsOpponentPlayer(payload.proposal);
        else if (game.user.isGM) await resolveActionAsGm(payload.proposal);
      } finally {
        activeOppositionPayload = null;
        scheduleOppositionPersist();
      }
    }
  } finally {
    actionOppositionDialogRunning = false;
    scheduleOppositionPersist();
  }
}

async function resolveActionAsOpponentPlayer(proposal) {
  const targetActor = await resolveProposalTargetActor(proposal);
  if (!targetActor || !targetActor.isOwner) {
    const gm = game.users.activeGM;
    if (gm) {
      await rollRpcToGM({ type: "actionOppositionFallback", proposal });
    }
    globalThis.FateToolkitUX.warn("Цель больше недоступна вам; запрос передан мастеру.");
    return;
  }

  const skills = actorSkills(targetActor);
  if (!skills.length) {
    const gm = game.users.activeGM;
    if (gm) await rollRpcToGM({ type: "actionOppositionFallback", proposal });
    return;
  }

  const oppositionAction = oppositionActionType(proposal);
  const suggestion = suggestedOppositionSkill(proposal, targetActor);
  const oppositionSelected = preferredSkillName(targetActor, oppositionAction) || suggestion.skill?.name || skills[0]?.name || "";
  const result = await playerOppositionUi.open({
    proposal,
    targetActor,
    oppositionAction,
    oppositionSelected,
    suggestion
  });

  if (!result || result.action === "decline") {
    await rollRpcToGM({ type: "actionOppositionDeclined", proposalId: proposal.id });
    return;
  }

  const resolved = await playerOppositionRoll.resolve({ proposal, targetActor, oppositionAction, result });
  if (!resolved?.ok) {
    const notify = resolved?.level === "warn" ? globalThis.FateToolkitUX.warn : globalThis.FateToolkitUX.error;
    return notify(resolved?.message || "Не удалось выполнить бросок оппозиции.");
  }

  const gm = game.users.activeGM;
  if (!gm) return globalThis.FateToolkitUX.error("Мастер отключился до разрешения действия.");
  await rollRpcToGM({
    type: "actionOppositionResult",
    proposal,
    opposition: resolved.opposition
  });

}

async function resolveActionAsGm(proposal) {
  if (!game.user.isGM) return;

  const prepared = await gmActionOpposition.prepare(proposal);
  const result = await gmActionOppositionUi.open(proposal, prepared);

  if (!result || result.action === "reject") {
    await rollRpcToUser(proposal.initiatorUserId, {
      type: "actionDeclined",
      proposalId: proposal.id
    });
    return;
  }

  const resolved = await gmActionOpposition.resolve(proposal, result, prepared);
  if (!resolved?.ok) {
    const notify = resolved?.level === "warn" ? globalThis.FateToolkitUX.warn : globalThis.FateToolkitUX.error;
    return notify(resolved?.message || "Не удалось разрешить оппозицию.");
  }
  if (resolved.assignedTarget && !proposal.target) proposal.target = resolved.assignedTarget;
  await finalizePlayerActionProposal(proposal, resolved.opposition);
}

async function finalizePlayerActionProposal(proposal, opposition, { fromPlayerSocket = false } = {}) {
  if (!primaryGmExecutor() || !proposal?.initiatorUserId) return;

  if (fromPlayerSocket) {
    // Player opposition is always an actual roll. Rebuild it from the authoritative
    // ChatMessage rather than trusting totals, ranks or stunt data sent over socket.
    if (opposition?.mode !== "opponent" || opposition?.kind !== "roll" || !opposition?.messageId) {
      return globalThis.FateToolkitUX.warn("Отклонена некорректная активная оппозиция: нет подтверждённого броска.");
    }
    const oppositionMessage = game.messages.get(opposition.messageId) ?? await waitForMessage(opposition.messageId);
    const oflags = oppositionMessage?.flags?.[MODULE_ID] ?? {};
    if (!oppositionMessage?.rolls?.length || String(oflags.actionOppositionFor || "") !== String(proposal.id)) {
      return globalThis.FateToolkitUX.warn("Отклонена активная оппозиция: ChatMessage не относится к этому действию.");
    }
    if (String(oflags.oppositionInitiatorUserId || "") !== String(proposal.initiatorUserId)) {
      return globalThis.FateToolkitUX.warn("Отклонена активная оппозиция: инициатор действия не совпадает.");
    }
    const oppositionUserId = String(oflags.oppositionUserId || "");
    const opposingUser = game.users.get(oppositionUserId);
    const permissions = permissionApi();
    const authorId = permissions?.messageAuthorId?.(oppositionMessage);
    if (!opposingUser || (authorId && String(authorId) !== oppositionUserId)) {
      return globalThis.FateToolkitUX.warn("Отклонена активная оппозиция: автор броска не подтверждён.");
    }
    const opposingActor = await actorFromUuid(oflags.oppositionActorUuid);
    if (!opposingActor || !canUserControlActor(opposingUser, opposingActor)) {
      return globalThis.FateToolkitUX.warn("Отклонена активная оппозиция: пользователь не владеет персонажем оппозиции.");
    }
    const targetActor = await resolveProposalTargetActor(proposal);
    if (targetActor?.uuid && String(targetActor.uuid) !== String(opposingActor.uuid || "")) {
      return globalThis.FateToolkitUX.warn("Отклонена активная оппозиция: бросок сделан не персонажем-целью.");
    }
    const skill = findSkill(opposingActor, oflags.oppositionSkillName);
    if (!skill) return globalThis.FateToolkitUX.warn("Отклонена активная оппозиция: выбранный навык больше недоступен.");
    const actionType = oppositionActionType(proposal);
    const validatedStunts = validateStuntSelection(opposingActor, oflags.stuntKeys || [], skill.name, actionType);
    const stuntBonus = stuntBonusTotal(validatedStunts);
    const roll = oppositionMessage.rolls[0];
    const math = snapshotRollMath(roll, {
      skillName: skill.name,
      skillRank: skill.rank,
      stunts: validatedStunts,
      stuntBonus,
      previousSnapshot: oflags.oppositionMath || null,
      previousSources: oflags.oppositionMath?.modifierSources || [],
      flavor: oppositionMessage.flavor
    });
    opposition = {
      total: numberValue(roll.total),
      hidden: false,
      mode: "opponent",
      kind: "roll",
      actorId: opposingActor.id,
      actorUuid: opposingActor.uuid,
      actorName: opposingActor.name,
      skillName: skill.name,
      skillRank: skill.rank,
      stuntKeys: validatedStunts.map(stunt => stunt.key),
      stunts: validatedStunts.map(stunt => ({ key: stunt.key, name: stunt.name, bonus: stunt.bonus, linkedSkill: stunt.linkedSkill })),
      stuntBonus,
      math,
      history: appendMathHistory(oflags.oppositionHistory || [], math),
      messageId: oppositionMessage.id,
      oppositionUserId,
      label: opposingActor.name
    };
    pendingOppositionRevisions.delete(proposal.id);
  } else {
    // A local GM resolution may use passive/rank opposition. Never accept a stale
    // queued client revision as authoritative; reviseOppositionOnGm will rebuild it
    // from its ChatMessage after the request exists.
    pendingOppositionRevisions.delete(proposal.id);
  }
  const user = game.users.get(proposal.initiatorUserId);
  if (!user?.active) return globalThis.FateToolkitUX.warn("Инициатор действия больше не подключён.");

  let proposalActor = await resolveActionActor(proposal.actorRef);
  if (!proposalActor && proposal.actorRef?.startsWith("token:")) {
    proposalActor = game.scenes.get(proposal.sceneId)?.tokens?.get(proposal.actorRef.slice(6))?.actor ?? null;
  }
  if (!proposalActor && proposal.actorUuid) {
    try {
      const doc = await fromUuid(proposal.actorUuid);
      proposalActor = doc?.actor ?? doc;
    } catch (_) {}
  }
  if (!proposalActor || proposalActor.type !== SYSTEM_ID) {
    return globalThis.FateToolkitUX.warn("Инициатор действия больше не существует или недоступен.");
  }
  if (!user.isGM && !proposalActor.testUserPermission(user, "OWNER")) {
    return globalThis.FateToolkitUX.warn(`${user.name} попытался инициировать действие персонажем без прав владельца.`);
  }
  if (!findSkill(proposalActor, proposal.skillName)) {
    return globalThis.FateToolkitUX.warn(`У ${proposalActor.name} больше нет навыка «${proposal.skillName}».`);
  }

  const request = {
    id: proposal.id,
    title: proposal.target?.name ? `${proposal.actionLabel}: ${proposal.target.name}` : proposal.actionLabel,
    description: proposal.target?.type === "marker" ? String(proposal.target.meta || "") : "",
    actionType: proposal.actionType,
    createMode: proposal.createMode ?? null,
    defendedAgainst: proposal.defendedAgainst ?? null,
    defendedCreateMode: proposal.defendedCreateMode ?? null,
    origin: "action-widget",
    sceneId: proposal.sceneId ?? null,
    skillName: proposal.skillName,
    stuntKeys: Array.isArray(proposal.stuntKeys) ? proposal.stuntKeys : [],
    oppositionMode: opposition?.mode ?? "none",
    actionTarget: proposal.target ?? null,
    createdAt: proposal.createdAt ?? Date.now(),
    createdBy: game.user.id,
    targets: [{ userId: proposal.initiatorUserId, status: "pending" }],
    oppositionByUser: { [proposal.initiatorUserId]: opposition }
  };

  gmRequests.set(request.id, request);
  saveGmRequests();
  requestUi.refreshGm();

  const publicRequest = {
    id: request.id,
    title: request.title,
    description: request.description,
    actionType: request.actionType,
    createMode: request.createMode,
    defendedAgainst: request.defendedAgainst ?? null,
    defendedCreateMode: request.defendedCreateMode ?? null,
    origin: request.origin ?? null,
    sceneId: request.sceneId ?? null,
    skillName: request.skillName,
    stuntKeys: Array.isArray(request.stuntKeys) ? request.stuntKeys : [],
    oppositionMode: request.oppositionMode,
    actionTarget: request.actionTarget,
    createdAt: request.createdAt,
    gmName: game.user.name,
    targetUserId: proposal.initiatorUserId,
    opposition: makePublicOpposition(opposition)
  };

  if (proposal.initiatorUserId === game.user.id) {
    const actor = await resolveActionActor(proposal.actorRef) ?? await (async () => {
      try { return await fromUuid(proposal.actorUuid); } catch (_) { return null; }
    })();
    await performRequestRoll(publicRequest, actor?.actor ?? actor);
  } else {
    const handoff = {
      type: "actionApproved",
      targetUserIds: [proposal.initiatorUserId],
      actorUuid: proposal.actorUuid,
      actorRef: proposal.actorRef,
      sceneId: proposal.sceneId ?? null,
      request: publicRequest
    };
    await persistActionHandoff(proposal.initiatorUserId, handoff);
    await rollRpcToUser(proposal.initiatorUserId, handoff);
  }
  forgetAuthenticatedActionProposal(proposal.id);
  if (proposal.initiatorUserId === game.user.id) await clearPendingAction(proposal.id);
}

async function handleApprovedAction(payload) {
  const request = payload?.request;
  if (!request?.id) return;
  if (handledActionApprovals.has(request.id)) {
    await removeOwnActionHandoff(request.id);
    await clearPendingAction(request.id);
    return;
  }
  let actor = await resolveActionActor(payload.actorRef);
  if (!actor && payload.actorRef?.startsWith("token:") && payload.sceneId) {
    actor = game.scenes.get(payload.sceneId)?.tokens?.get(payload.actorRef.slice(6))?.actor ?? null;
  }
  if (!actor && payload.actorUuid) {
    try {
      const doc = await fromUuid(payload.actorUuid);
      actor = doc?.actor ?? doc;
    } catch (_) {}
  }
  if (!actor || !actor.isOwner) return globalThis.FateToolkitUX.error("Не удалось найти персонажа, которым было инициировано действие.");
  await performRequestRoll(request, actor);
  handledActionApprovals.add(request.id);
  await removeOwnActionHandoff(request.id);
  await clearPendingAction(request.id);
}

function bindActionSelectSearch(root, inputSelector, selectName, { keepEmpty = false } = {}) {
  const input = root?.querySelector?.(inputSelector);
  const select = root?.querySelector?.(`[name="${selectName}"]`);
  if (!input || !select) return;
  const status = root.querySelector?.(`[data-select-search-status="${selectName}"]`);
  const source = [...select.options].map(option => ({
    value: String(option.value || ""),
    text: String(option.textContent || ""),
    disabled: Boolean(option.disabled)
  }));
  const countableSource = source.filter(row => row.value || !keepEmpty);
  const render = () => {
    const current = String(select.value || "");
    const needle = String(input.value || "").trim().toLocaleLowerCase(game.i18n?.lang || "ru");
    const rows = source.filter(row => {
      if (keepEmpty && !row.value) return true;
      if (!needle) return true;
      return row.text.toLocaleLowerCase(game.i18n?.lang || "ru").includes(needle);
    });
    if (current && !rows.some(row => row.value === current)) {
      const selected = source.find(row => row.value === current);
      if (selected) rows.unshift(selected);
    }
    select.innerHTML = rows.map(row => `<option value="${esc(row.value)}" ${row.value === current ? "selected" : ""} ${row.disabled ? "disabled" : ""}>${esc(row.text)}</option>`).join("");
    if (![...select.options].some(option => option.value === current)) {
      const first = [...select.options].find(option => !option.disabled);
      if (first) select.value = first.value;
    }
    if (status) {
      const visible = rows.filter(row => row.value || !keepEmpty).length;
      status.textContent = needle ? `${visible}/${countableSource.length}` : "";
    }
  };
  input.addEventListener("input", debounceUi(render));
  input.addEventListener("search", render);
  render();
}

function rememberedActionLabel(actor, actionType) {
  const name = preferredSkillName(actor, actionType);
  if (!name) return "";
  const skill = findSkill(actor, name);
  return skill ? `${skill.label || globalThis.FateToolkitI18n?.skill?.(skill.name) || skill.name} ${signed(skill.rank)}` : (globalThis.FateToolkitI18n?.skill?.(name) || name);
}

class FateActionWidget extends FawSafeWindow {
  static FAW_GEOMETRY = { defaultWidth: 284, defaultHeight: 170, maxWidth: 520 };
  static DEFAULT_OPTIONS = {
    id: "fate-action-widget",
    tag: "section",
    classes: ["fate-action-widget", "fate"],
    position: { width: 284, height: "auto" },
    window: {
      frame: true,
      icon: "fa-solid fa-crosshairs",
      title: "Действие Fate",
      resizable: true,
      minimizable: false
    }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/action-widget.hbs` }
  };

  async _prepareContext() {
    const { actors, targets } = validateActionSelections();
    const actor = await resolveActionActor(actionActorRef);
    const pending = pendingActionState();
    const pendingProposal = pending?.proposal ?? null;
    return {
      hasPendingAction: Boolean(pendingProposal?.id),
      pendingAction: pendingProposal?.id ? {
        id: pendingProposal.id,
        actionLabel: pendingProposal.actionLabel || actionLabel(pendingProposal.actionType),
        actorName: pendingProposal.actorName || "",
        targetName: pendingProposal.target?.name || ""
      } : null,
      actors: actors.map(row => ({ ...row, selected: row.ref === actionActorRef })),
      targets: targets.map(row => ({ ...row, selected: row.ref === actionTargetRef })),
      targetSelected: Boolean(actionTargetRef),
      hasActors: actors.length > 0,
      hasTargets: targets.length > 0,
      lastSkills: {
        attack: rememberedActionLabel(actor, "attack"),
        overcome: rememberedActionLabel(actor, "overcome"),
        create: rememberedActionLabel(actor, "create"),
        defend: rememberedActionLabel(actor, "defend")
      },
      favoriteSkills: actor ? actorActionPrefs(actor).favorites
        .map(name => findSkill(actor, name))
        .filter(Boolean)
        .map(skill => ({ name: skill.label || globalThis.FateToolkitI18n?.skill?.(skill.name) || skill.name, rank: signed(skill.rank) })) : []
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    ensureActionSafeCollapseButton(this);
    setActionWidgetCollapsed(actionWidgetCollapsed);
    const actor = this.element.querySelector('[name="actionActor"]');
    const target = this.element.querySelector('[name="actionTarget"]');
    bindActionSelectSearch(this.element, '[data-action-actor-search]', 'actionActor');
    bindActionSelectSearch(this.element, '[data-action-target-search]', 'actionTarget', { keepEmpty: true });
    actor?.addEventListener("change", () => {
      actionActorRef = actor.value;
      scheduleActionDraftPersist();
      const targets = actionTargetOptions(actionActorRef);
      if (!targets.some(row => row.ref === actionTargetRef)) actionTargetRef = "";
      this.render(false);
    });
    target?.addEventListener("change", () => {
      actionTargetRef = target.value;
      scheduleActionDraftPersist();
      if (actionTargetRef.startsWith("token:")) {
        canvas?.tokens?.setTargets?.([actionTargetRef.slice(6)], { mode: "replace" });
      } else {
        canvas?.tokens?.setTargets?.([], { mode: "replace" });
      }
    });

    this.element.querySelectorAll('[data-fate-action]').forEach(button => {
      button.setAttribute("draggable", "true");
      button.addEventListener("click", () => void initiateActionFromWidget(button.dataset.fateAction));
      button.addEventListener("dragstart", event => startActionDrag(button, event));
      button.addEventListener("dragend", () => button.classList.remove("faw-action-dragging"));
    });
    this.element.querySelector('[data-action="use-canvas-target"]')?.addEventListener("click", () => {
      syncActionTargetFromCanvas();
      this.render(false);
    });
  }
}

function setActionWidgetCollapsed(collapsed) {
  actionWidgetCollapsed = Boolean(collapsed);
  if (!actionWidget?.rendered) return;
  actionWidget.element?.classList.toggle("faw-safe-collapsed", actionWidgetCollapsed);
  const button = actionWidget.element?.querySelector('[data-faw-safe-collapse]');
  if (button) {
    button.innerHTML = actionWidgetCollapsed
      ? '<i class="fa-solid fa-chevron-down" aria-hidden="true"></i>'
      : '<i class="fa-solid fa-chevron-up" aria-hidden="true"></i>';
    button.title = game.i18n.localize(actionWidgetCollapsed ? "FCT.Expand" : "FCT.Collapse");
    button.setAttribute("aria-label", button.title);
  }
}

function ensureActionSafeCollapseButton(app) {
  const header = app?.window?.header;
  if (!header) return;
  let button = header.querySelector('[data-faw-safe-collapse]');
  if (!button) {
    button = document.createElement("button");
    button.type = "button";
    button.dataset.fawSafeCollapse = "true";
    button.className = "header-control";
    button.innerHTML = '<i class="fa-solid fa-chevron-up" aria-hidden="true"></i>';
    button.setAttribute("aria-label", game.i18n.localize("FCT.Collapse"));
    const close = app.window?.close;
    if (close?.parentElement === header) header.insertBefore(button, close);
    else header.append(button);
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      setActionWidgetCollapsed(!actionWidgetCollapsed);
    });
  }
}

async function openActionWidget() {
  if (!actionWidget) actionWidget = new FateActionWidget();
  if (!actionWidget.rendered) await actionWidget.render(true);
  setActionWidgetCollapsed(false);
  actionWidget.bringToFront?.();
}

async function openActionWidgetFor(actorRef = null, targetRef = undefined) {
  if (actorRef) actionActorRef = String(actorRef);
  if (targetRef !== undefined) actionTargetRef = String(targetRef || "");
  scheduleActionDraftPersist();
  validateActionSelections();
  if (actionTargetRef?.startsWith("token:")) {
    canvas?.tokens?.setTargets?.([actionTargetRef.slice(6)], { mode: "replace" });
  } else if (targetRef !== undefined) {
    canvas?.tokens?.setTargets?.([], { mode: "replace" });
  }
  refreshActionWidget();
  await openActionWidget();
  if (actionWidget?.rendered) await actionWidget.render(false);
}

async function toggleActionWidget() {
  if (!actionWidget) actionWidget = new FateActionWidget();
  if (!actionWidget.rendered) {
    actionWidgetCollapsed = false;
    await actionWidget.render(true);
    actionWidget.bringToFront?.();
    return;
  }
  setActionWidgetCollapsed(!actionWidgetCollapsed);
  actionWidget.bringToFront?.();
}


function refreshActionWidget() {
  if (!actionWidget?.rendered || actionWidgetRenderPending) return;
  actionWidgetRenderPending = true;
  queueMicrotask(() => {
    actionWidgetRenderPending = false;
    if (actionWidget?.rendered) void actionWidget.render(false);
  });
}

async function settleResolvedActionWidget(message) {
  const flags = message?.flags?.[MODULE_ID] ?? {};
  if (!flags.resolved || flags.origin !== "action-widget" || !flags.requestId) return false;
  const pending = pendingActionState();
  if (!pending?.proposal?.id || String(pending.proposal.id) !== String(flags.requestId)) return false;
  await clearPendingAction(flags.requestId);
  actionWidgetCollapsed = false;
  if (actionWidget?.rendered) {
    try { await actionWidget.close(); } catch (_) { refreshActionWidget(); }
  }
  return true;
}

function actionWidgetUsesActor(actor) {
  if (!actor) return false;
  const uuid = String(actor.uuid || "");
  if (!uuid) return false;
  const actorFromRef = ref => {
    const raw = String(ref || "");
    if (raw.startsWith("actor:")) return game.actors.get(raw.slice(6)) ?? null;
    if (raw.startsWith("token:")) return canvas?.scene?.tokens?.get(raw.slice(6))?.actor ?? null;
    return null;
  };
  return [actionActorRef, actionTargetRef].some(ref => actorFromRef(ref)?.uuid === uuid);
}

function actionWidgetTokenRelevant(tokenDoc) {
  const sceneId = tokenDoc?.parent?.id ?? tokenDoc?.scene?.id ?? null;
  return !sceneId || sceneId === canvas?.scene?.id;
}

function setActionTargetMarker(markerId) {
  if (!markerId) return;
  actionTargetRef = `marker:${markerId}`;
  scheduleActionDraftPersist();
  canvas?.tokens?.setTargets?.([], { mode: "replace" });
  refreshActionWidget();
  void openActionWidget();
}


Hooks.once("init", () => {
  registerSoundSettings();
  game.settings.register(MODULE_ID, "actionWidgetAutoOpen", {
    name: "Автоматически открывать виджет действий Fate",
    hint: "Открывает компактный виджет Атака / Преодоление / Создание преимущества / Защита после загрузки мира.",
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });
  game.settings.register(MODULE_ID, "actionWidgetPosition", {
    scope: "client",
    config: false,
    type: Object,
    default: {}
  });
  game.settings.register(MODULE_ID, ACTION_PREFS_SETTING, {
    scope: "user",
    config: false,
    type: Object,
    default: {}
  });
});

Hooks.once("ready", async () => {
  if (game.system.id !== SYSTEM_ID) {
    globalThis.FateToolkitUX.error("Fate: Запрос броска работает только с системой Fate Core Official.");
    return;
  }

  rollRpc().register("roll", onRpc);
  game.socket.on(SOCKET, onSocket);
  if (game.user.isGM) { loadGmRequests(); restoreAuthenticatedActionProposals(); }
  else {
    loadPlayerPending();
    renderTray({ open: pendingRequests.size > 0 });
  }

  if (!game.user.isGM) await restoreActionHandoffs();

  const restoredDraft = restoreActionDraft();
  if (!restoredDraft) syncActionActorFromCanvas();
  validateActionSelections();
  scheduleActionDraftPersist();
  const restoredOpposition = restoreOppositionQueue();
  if (restoredOpposition) setTimeout(() => void processActionOppositionQueue(), 180);


  actionWidget = new FateActionWidget();
  const module = game.modules.get(MODULE_ID);
  module.api ??= {};
  Object.assign(module.api, {
    openActionWidget: () => openActionWidget(),
    openActionWidgetFor: (actorRef, targetRef) => openActionWidgetFor(actorRef, targetRef),
    toggleActionWidget: () => toggleActionWidget(),
    refreshActionWidget: () => refreshActionWidget(),
    setActionTargetMarker: markerId => setActionTargetMarker(markerId),
    getActionTarget: () => actionTargetRef,
    getPendingActionState: () => cloneUserState(pendingActionState(), null),
    getOppositionQueueState: () => oppositionRowsForStorage(),
    getPrivateOppositionActorUuid: message => privateOppositionActorUuidForResult(message),
    resumePendingAction: () => openActionWidget(),
    resumeOppositionQueue: () => processActionOppositionQueue(),
    initiateAction: actionType => initiateActionFromWidget(actionType),
    initiateActionAtTarget: (actionType, actorRef, targetRef) => initiateActionFromWidget(actionType, { actorRef, targetRef })
  });

  if (game.settings.get(MODULE_ID, "actionWidgetAutoOpen")) await actionWidget.render(true);
});

Hooks.on("getSceneControlButtons", controls => {
  if (game.system?.id !== SYSTEM_ID) return;
  const tokenControls = controls.tokens;
  if (!tokenControls?.tools) return;

  tokenControls.tools.fateActionWidget = {
    name: "fateActionWidget",
    title: "Действие Fate",
    icon: "fa-solid fa-crosshairs",
    order: Object.keys(tokenControls.tools).length + 9,
    button: true,
    visible: true,
    onChange: () => void toggleActionWidget()
  };

  if (game.user?.isGM) {
    tokenControls.tools.fateRollRequest = {
      name: "fateRollRequest",
      title: "Запросить бросок Fate",
      icon: "fa-solid fa-dice-d20",
      order: Object.keys(tokenControls.tools).length + 10,
      button: true,
      visible: true,
      onChange: () => openRequestApp()
    };
  } else {
    tokenControls.tools.fateRollRequestsInbox = {
      name: "fateRollRequestsInbox",
      title: "Открыть запросы бросков Fate",
      icon: "fa-solid fa-inbox",
      order: Object.keys(tokenControls.tools).length + 10,
      button: true,
      visible: true,
      onChange: () => openPlayerRequestApp()
    };
  }
});

Hooks.on("dropCanvasData", (canvasInstance, data) => {
  if (data?.type !== "FateAspectAction") return;
  void handleActionCanvasDrop(data);
  return false;
});

Hooks.on("targetToken", () => {
  syncActionTargetFromCanvas();
  refreshActionWidget();
});
Hooks.on("controlToken", () => {
  syncActionActorFromCanvas();
  refreshActionWidget();
});
Hooks.on("canvasReady", () => {
  if (!restoreActionDraft()) syncActionActorFromCanvas();
  validateActionSelections();
  scheduleActionDraftPersist();
  refreshActionWidget();
});
Hooks.on("createToken", tokenDoc => { if (actionWidgetTokenRelevant(tokenDoc)) refreshActionWidget(); });
Hooks.on("deleteToken", tokenDoc => { if (actionWidgetTokenRelevant(tokenDoc)) refreshActionWidget(); });
Hooks.on("updateToken", tokenDoc => { if (actionWidgetTokenRelevant(tokenDoc)) refreshActionWidget(); });
Hooks.on("updateActor", actor => { if (actionWidgetUsesActor(actor)) refreshActionWidget(); });
Hooks.on("updateScene", scene => {
  if (scene?.id === canvas?.scene?.id) refreshActionWidget();
});

Hooks.on("renderChatMessage", (message, html) => {
  if (!message?.flags?.[MODULE_ID]) return;
  void settleResolvedActionWidget(message);
  bindBoostResultButtons(message, html);
  void injectCreatedAspectAction(message, html);
  void injectContextualResultAction(message, html);
  injectActionAudit(message, html);
});

Hooks.on("updateChatMessage", (message, change, options, userId) => {
  if (!message?.flags?.[MODULE_ID]) return;
  void settleResolvedActionWidget(message);
  void maybeReresolve(message, change, userId);
  void maybeReresolveOpposition(message, change, userId);
});

Hooks.on("deleteChatMessage", message => {
  // Nothing to delete from GM storage automatically: keeping the request lets a player retry if needed.
});

// Minimal public API for macros and debugging.
Hooks.once("ready", () => {
  const module = game.modules.get(MODULE_ID);
  module.api ??= {};
  Object.assign(module.api, {
    openRollRequests: openRequestApp,
    openPlayerRequests: openPlayerRequestApp,
    openSoundSettings,
    pendingRollRequests: pendingRequests,
    gmRollRequests: gmRequests,
    getPendingRollRequestRows: () => [...pendingRequests.values()].map(row => foundry.utils.duplicate(row)),
    getGmRollRequestRows: () => [...gmRequests.values()].map(row => foundry.utils.duplicate(row)),
    appendMessageAudit: (messageOrId, event = {}) => appendMessageAudit(messageOrId, event)
  });

  if (game.modules.get(LEGACY_MODULE_ID)?.active) {
    globalThis.FateToolkitUX.warn("Объединённый Fate Aspect Widget уже содержит «Fate: Запрос броска». Отключите старый отдельный модуль fate-roll-request, чтобы не получать двойные кнопки и запросы.");
  }
});
