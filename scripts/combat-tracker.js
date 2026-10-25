const MODULE_ID = "fate-aspect-widget";
const SYSTEM_ID = "fate-core-official";
const SOCKET = `module.${MODULE_ID}`;

function combatRpc() { return globalThis.FateToolkitRPC; }
async function combatRpcToGM(payload) { return combatRpc().executeAsGM("combat", payload); }
const QUEUE_FLAG = "combatQueue";
const SKILL_FLAG = "combatOrderSkill";

let combatTracker = null;
let trackerCollapsed = false;
let trackerRenderQueued = false;
let participantSearchQuery = "";
let orderSkillSearchQuery = "";

const AppV2 = foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2);

function currentCombat() {
  return game.combat ?? game.combats?.viewed ?? null;
}

function combatContainsActor(actor, combat = currentCombat()) {
  if (!actor || !combat) return false;
  return (combat.combatants?.contents ?? Array.from(combat.combatants ?? []))
    .some(row => row.actor?.uuid === actor.uuid || row.actor?.id === actor.id);
}

function combatContainsToken(tokenDoc, combat = currentCombat()) {
  if (!tokenDoc || !combat) return false;
  return (combat.combatants?.contents ?? Array.from(combat.combatants ?? []))
    .some(row => row.tokenId === tokenDoc.id || row.token?.id === tokenDoc.id || (tokenDoc.actor && row.actor?.uuid === tokenDoc.actor.uuid));
}

function normalizeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function debounceTrackerUi(fn, delay = 75) {
  let timer = null;
  return (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, delay);
  };
}

function getQueue(combat) {
  if (!combat) return [];
  const existing = combat.combatants?.contents ?? Array.from(combat.combatants ?? []);
  const ids = existing.map(c => c.id);
  const stored = combat.getFlag(MODULE_ID, QUEUE_FLAG);
  if (!Array.isArray(stored)) return ids;
  const valid = stored.filter(id => ids.includes(id));
  for (const id of ids) if (!valid.includes(id)) valid.push(id);
  return valid;
}

async function setQueue(combat, queue) {
  if (!game.user.isGM || !combat) return;
  const ids = new Set((combat.combatants?.contents ?? Array.from(combat.combatants ?? [])).map(c => c.id));
  const clean = queue.filter(id => ids.has(id));
  for (const id of ids) if (!clean.includes(id)) clean.push(id);
  await combat.setFlag(MODULE_ID, QUEUE_FLAG, clean);
}

function actorSkillRows(actor) {
  return Object.values(actor?.system?.skills ?? {})
    .filter(skill => skill && skill.name)
    .map(skill => ({ name: String(skill.name), label: globalThis.FateToolkitI18n?.skill?.(skill.name) || String(skill.name), rank: normalizeNumber(skill.rank) }));
}

function skillRank(actor, name) {
  if (!actor || !name) return 0;
  const wanted = String(name).trim().toLocaleLowerCase(game.i18n.lang);
  const found = actorSkillRows(actor).find(skill => skill.name.trim().toLocaleLowerCase(game.i18n.lang) === wanted);
  return found?.rank ?? 0;
}

function activeConsequences(actor) {
  const result = [];
  for (const track of Object.values(actor?.system?.tracks ?? {})) {
    if (!track || track.enabled === false || normalizeNumber(track.harm_can_absorb) <= 0) continue;
    const aspect = track.aspect;
    if (!aspect || typeof aspect !== "object") continue;
    const boxes = Array.isArray(track.box_values) ? track.box_values : [];
    const marked = boxes.some(Boolean);
    let name = "";
    if (aspect.when_marked) {
      name = String(aspect.name ?? "").trim();
      if (boxes.length && !marked) continue;
      if (!boxes.length && !name) continue;
    } else if (aspect.as_name) {
      if (!marked) continue;
      name = (globalThis.FateToolkitI18n?.term?.(String(track.name ?? "")) || String(track.name ?? "")).trim();
    } else continue;
    if (name) result.push({ name, harm: normalizeNumber(track.harm_can_absorb) });
  }
  return result;
}

function boxedTracks(actor) {
  const rows = [];
  for (const track of Object.values(actor?.system?.tracks ?? {})) {
    if (!track || track.enabled === false) continue;
    const values = Array.isArray(track.box_values) ? track.box_values : [];
    if (!values.length) continue;
    const aspect = track.aspect;
    const isConsequence = Boolean(aspect && typeof aspect === "object" && (aspect.when_marked || aspect.as_name));
    rows.push({
      name: globalThis.FateToolkitI18n?.term?.(String(track.name ?? game.i18n.localize("FCT.Track"))) || String(track.name ?? game.i18n.localize("FCT.Track")),
      boxes: values.map((marked, index) => ({ index: index + 1, marked: Boolean(marked) })),
      marked: values.filter(Boolean).length,
      total: values.length,
      isConsequence
    });
  }
  return rows;
}

function canUserOwnActor(user, actor) {
  if (!user || !actor) return false;
  if (user.isGM) return true;
  try {
    if (typeof actor.testUserPermission === "function") return actor.testUserPermission(user, "OWNER");
  } catch (_) {}
  const level = actor.ownership?.[user.id] ?? actor.ownership?.default ?? 0;
  return level >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
}

function primaryActiveGM() {
  return game.users?.activeGM ?? null;
}

function canSeeCombatant(combatant) {
  return game.user.isGM || !combatant.hidden;
}

function nativeTurnIndex(combat, combatantId) {
  return (combat?.turns ?? []).findIndex(c => c.id === combatantId);
}

async function notifyTurn(combatant) {
  const tokenId = combatant?.tokenId ?? combatant?.token?.id;
  if (!tokenId) return;
  try {
    await game.socket.emit(`system.${SYSTEM_ID}`, { yourTurn: true, tokenId });
  } catch (err) {
    console.warn(`${MODULE_ID} | Could not emit Fate yourTurn socket`, err);
  }
}

async function setCurrent(combat, combatantId, { notify = true } = {}) {
  if (!game.user.isGM || !combat) return;
  const combatant = combat.combatants.get(combatantId);
  if (!combatant || combatant.defeated) return;
  const turn = nativeTurnIndex(combat, combatantId);
  if (turn < 0) return;
  const update = { turn };
  if ((combat.round ?? 0) < 1) update.round = 1;
  await combat.update(update);
  if (notify) await notifyTurn(combatant);
}

function nextUnacted(combat, afterId = null) {
  const queue = getQueue(combat);
  if (!queue.length) return null;
  const start = afterId ? Math.max(queue.indexOf(afterId), -1) + 1 : 0;
  const ordered = queue.slice(start).concat(queue.slice(0, start));
  for (const id of ordered) {
    const combatant = combat.combatants.get(id);
    if (!combatant || combatant.defeated) continue;
    if (combatant.getFlag(SYSTEM_ID, "hasActed") === true) continue;
    return combatant;
  }
  return null;
}

const turnFinalization = globalThis.FateToolkitTurnFinalization.create({
  canUserOwnActor,
  pendingDamageForActor: (actorUuid, combat) => game.modules.get(MODULE_ID)?.api?.pendingDamageForActor?.(actorUuid, combat) ?? null,
  nextUnacted,
  setCurrent,
  getMessage: messageId => game.messages.get(messageId),
  appendAudit: async (message, row) => game.modules.get(MODULE_ID)?.api?.appendMessageAudit?.(message, row),
  recordConflictEvent: async (row, combat) => game.modules.get(MODULE_ID)?.api?.recordConflictEvent?.(row, combat),
  unknownLabel: () => game.i18n.localize("FCT.Unknown"),
  eventText: name => game.i18n.format("FCT.EventTurnFinished", { name }),
  systemId: SYSTEM_ID,
  moduleId: MODULE_ID
});

async function finishTurn(combat, combatantId, { messageId = null, userId = game.user?.id ?? null, allowPendingDamage = false } = {}) {
  if (!game.user.isGM || !combat) return { ok:false, code:"not-gm" };
  const user = game.users.get(userId) ?? (game.user?.id === userId ? game.user : null);
  const checked = await turnFinalization.prepare({ combat, combatantId, user, messageId, allowPendingDamage });
  if (!checked?.ok) return checked;
  return turnFinalization.commit(checked);
}

async function requestFinishCurrent(combat, combatantId, { messageId = null } = {}) {
  if (!combat || !combatantId) return;
  const combatant = combat.combatants.get(combatantId);
  if (!combatant?.actor || !canUserOwnActor(game.user, combatant.actor)) {
    return globalThis.FateToolkitUX.warn(game.i18n.localize("FCT.NotYourTurn"));
  }

  const pending = game.modules.get(MODULE_ID)?.api?.pendingDamageForActor?.(combatant.actor.uuid, combat) ?? null;
  if (pending && !game.user.isGM) {
    return globalThis.FateToolkitUX.warn(game.i18n.localize("FCT.PendingDamage"));
  }
  if (pending && game.user.isGM) {
    const confirmed = await globalThis.FateToolkitUX.confirm({
      window: { title: game.i18n.localize("FCT.PendingDamageTitle") },
      content: `<p>${game.i18n.localize("FCT.PendingDamageConfirm")}</p>`,
      modal: true,
      rejectClose: false
    });
    if (!confirmed) return;
  }

  if (game.user.isGM) return finishTurn(combat, combatantId, { messageId, userId: game.user.id, allowPendingDamage: true });
  const gm = primaryActiveGM();
  if (!gm) return globalThis.FateToolkitUX.warn(game.i18n.localize("FCT.NoGM"));
  await combatRpcToGM({
    action: "finishTurn",
    combatId: combat.id,
    combatantId,
    messageId
  });
}

function unresolvedDamageRows(combat) {
  if (!combat) return [];
  const api = game.modules.get(MODULE_ID)?.api;
  const rows = [];
  for (const combatant of (combat.combatants?.contents ?? Array.from(combat.combatants ?? []))) {
    if (!combatant?.actor) continue;
    if (!game.user.isGM && !canUserOwnActor(game.user, combatant.actor)) continue;
    const pending = api?.pendingDamageForActor?.(combatant.actor.uuid, combat) ?? null;
    if (!pending) continue;
    rows.push({
      combatantId: combatant.id,
      actorUuid: combatant.actor.uuid,
      name: combatant.name ?? combatant.actor.name ?? game.i18n.localize("FCT.Unknown"),
      ...pending
    });
  }
  return rows;
}

async function requestAdvanceExchange(combat) {
  if (!game.user.isGM || !combat) return false;
  const pending = unresolvedDamageRows(combat);
  if (pending.length) {
    globalThis.FateToolkitUX.warn(game.i18n.format("FCT.ExchangeBlockedDamage", { count: pending.length }));
    const first = pending[0];
    if (first?.messageId) game.modules.get(MODULE_ID)?.api?.focusChatMessage?.(first.messageId);
    return false;
  }

  const active = (combat.combatants?.contents ?? Array.from(combat.combatants ?? [])).filter(c => c && !c.defeated);
  const unacted = active.filter(c => c.getFlag(SYSTEM_ID, "hasActed") !== true);
  if ((combat.round ?? 0) > 0 && unacted.length) {
    const confirmed = await globalThis.FateToolkitUX.confirm({
      window: { title: game.i18n.localize("FCT.NextExchange") },
      content: `<p>${escapeHtml(game.i18n.format("FCT.ExchangeUnactedConfirm", { count: unacted.length }))}</p>`,
      modal: true,
      rejectClose: false
    });
    if (!confirmed) return false;
  }

  await advanceExchange(combat);
  return true;
}

async function resumeTurn(combat) {
  if (!game.user.isGM || !combat) return false;
  if (combat.combatant && combat.combatant.getFlag(SYSTEM_ID, "hasActed") !== true && !combat.combatant.defeated) return true;
  const next = nextUnacted(combat, combat.combatant?.id ?? null);
  if (!next) return false;
  await setCurrent(combat, next.id, { notify: true });
  return true;
}

async function advanceExchange(combat) {
  if (!game.user.isGM || !combat) return;
  const combatants = combat.combatants?.contents ?? Array.from(combat.combatants ?? []);
  const updates = combatants.map(c => ({ _id: c.id, [`flags.${SYSTEM_ID}.hasActed`]: false }));
  if (updates.length) await combat.updateEmbeddedDocuments("Combatant", updates);
  const nextRound = (combat.round ?? 0) < 1 ? 1 : combat.round + 1;
  const first = getQueue(combat).map(id => combat.combatants.get(id)).find(c => c && !c.defeated) ?? null;
  const turn = first ? nativeTurnIndex(combat, first.id) : null;
  await combat.update({ round: nextRound, turn: turn >= 0 ? turn : null });
  try {
    await game.modules.get(MODULE_ID)?.api?.recordConflictEvent?.({
      type: "exchange",
      actorUuid: null,
      actorName: "",
      text: game.i18n.format("FCT.EventExchangeStarted", { round: nextRound })
    }, combat);
  } catch (_) {}
  if (first) await notifyTurn(first);
}

async function toggleActed(combat, combatantId) {
  if (!game.user.isGM || !combat) return;
  const combatant = combat.combatants.get(combatantId);
  if (!combatant) return;
  const acted = combatant.getFlag(SYSTEM_ID, "hasActed") === true;
  if (!acted && combat.combatant?.id === combatantId) return finishTurn(combat, combatantId);
  await combatant.setFlag(SYSTEM_ID, "hasActed", !acted);
}

async function moveCombatant(combat, combatantId, delta) {
  if (!game.user.isGM || !combat) return;
  const queue = getQueue(combat);
  const index = queue.indexOf(combatantId);
  const next = index + delta;
  if (index < 0 || next < 0 || next >= queue.length) return;
  [queue[index], queue[next]] = [queue[next], queue[index]];
  await setQueue(combat, queue);
}

async function sortBySkill(combat, skillName) {
  if (!game.user.isGM || !combat || !skillName) return;
  const queue = getQueue(combat);
  const order = new Map(queue.map((id, index) => [id, index]));
  queue.sort((aId, bId) => {
    const a = combat.combatants.get(aId);
    const b = combat.combatants.get(bId);
    const rankDiff = skillRank(b?.actor, skillName) - skillRank(a?.actor, skillName);
    return rankDiff || (order.get(aId) ?? 0) - (order.get(bId) ?? 0);
  });
  await combat.setFlag(MODULE_ID, SKILL_FLAG, skillName);
  await setQueue(combat, queue);
}

async function createConflictFromSelected() {
  if (!game.user.isGM) return;
  const scene = canvas?.scene ?? game.scenes?.viewed;
  if (!scene) return globalThis.FateToolkitUX.warn(game.i18n.localize("FCT.NoScene"));
  const selected = canvas?.tokens?.controlled ?? [];
  if (!selected.length) return globalThis.FateToolkitUX.warn(game.i18n.localize("FCT.SelectTokens"));

  const combat = await Combat.create({ scene: scene.id });
  await combat.activate();
  const data = selected.map(token => ({
    tokenId: token.id,
    actorId: token.actor?.id ?? null,
    hidden: Boolean(token.document?.hidden)
  }));
  const created = await combat.createEmbeddedDocuments("Combatant", data);
  await setQueue(combat, created.map(c => c.id));
  await combat.setFlag(SYSTEM_ID, "name", game.i18n.localize("FCT.DefaultConflictName"));
  scheduleCombatTrackerRender({ open: true });
}

async function addSelectedToConflict(combat) {
  if (!game.user.isGM || !combat) return;
  const selected = canvas?.tokens?.controlled ?? [];
  if (!selected.length) return globalThis.FateToolkitUX.warn(game.i18n.localize("FCT.SelectTokens"));
  const existing = new Set((combat.combatants?.contents ?? []).map(c => c.tokenId).filter(Boolean));
  const rows = selected
    .filter(token => !existing.has(token.id))
    .map(token => ({ tokenId: token.id, actorId: token.actor?.id ?? null, hidden: Boolean(token.document?.hidden) }));
  if (!rows.length) return globalThis.FateToolkitUX.info(game.i18n.localize("FCT.AlreadyAdded"));
  const created = await combat.createEmbeddedDocuments("Combatant", rows);
  await setQueue(combat, getQueue(combat).concat(created.map(c => c.id)));
}

async function removeCombatant(combat, combatantId) {
  if (!game.user.isGM || !combat) return;
  await combat.deleteEmbeddedDocuments("Combatant", [combatantId]);
  await setQueue(combat, getQueue(combat).filter(id => id !== combatantId));
}

async function deleteConflict(combat) {
  if (!game.user.isGM || !combat) return;
  const confirmed = await globalThis.FateToolkitUX.confirm({
    window: { title: game.i18n.localize("FCT.EndConflict") },
    content: `<p>${game.i18n.localize("FCT.EndConflictConfirm")}</p>`,
    modal: true,
    rejectClose: false
  });
  if (!confirmed) return;
  if (globalThis.FateToolkitWill?.enabled?.()) {
    try { await globalThis.FateToolkitConcession.finalize(combat); }
    catch (error) { globalThis.FateToolkitUX.error(error?.message || String(error)); return; }
  }
  await combat.delete();
}

function focusCombatant(combatant, { target = false } = {}) {
  const tokenId = combatant?.tokenId ?? combatant?.token?.id;
  const token = tokenId ? canvas?.tokens?.get(tokenId) : null;
  if (!token) {
    if (target) globalThis.FateToolkitUX.warn(game.i18n.localize("FCT.TokenNotOnCanvas"));
    return;
  }
  if (target) {
    canvas.tokens.setTargets?.([tokenId], { mode: "replace" });
    const api = game.modules.get(MODULE_ID)?.api;
    if (api?.openActionWidgetFor) void api.openActionWidgetFor(null, `token:${tokenId}`);
    else api?.openActionWidget?.();
  }
  const center = token.center ?? { x: token.x, y: token.y };
  canvas.animatePan?.({ x: center.x, y: center.y });
}

function setTrackerCollapsed(collapsed) {
  trackerCollapsed = Boolean(collapsed);
  if (!combatTracker?.rendered) return;
  combatTracker.element?.classList.toggle("faw-combat-collapsed", trackerCollapsed);
  const button = combatTracker.element?.querySelector("[data-fct-collapse]");
  if (button) {
    button.innerHTML = trackerCollapsed
      ? '<i class="fa-solid fa-chevron-down" aria-hidden="true"></i>'
      : '<i class="fa-solid fa-chevron-up" aria-hidden="true"></i>';
    button.title = trackerCollapsed ? game.i18n.localize("FCT.Expand") : game.i18n.localize("FCT.Collapse");
    button.setAttribute("aria-label", button.title);
  }
}

function ensureCollapseButton(app) {
  const header = app?.window?.header;
  if (!header) return;
  let button = header.querySelector("[data-fct-collapse]");
  if (!button) {
    button = document.createElement("button");
    button.type = "button";
    button.dataset.fctCollapse = "true";
    button.className = "header-control";
    button.innerHTML = '<i class="fa-solid fa-chevron-up" aria-hidden="true"></i>';
    button.setAttribute("aria-label", game.i18n.localize("FCT.Collapse"));
    const close = app.window?.close;
    // Foundry 13 window controls can inherit an unsupported icon glyph from
    // themes. A textual multiplication sign remains legible in every font.
    if (close && !close.dataset.fawCloseGlyph) {
      close.dataset.fawCloseGlyph = 'true';
      close.textContent = '×';
      close.title = 'Закрыть';
      close.setAttribute('aria-label', 'Закрыть');
      close.classList.add('faw-standard-close');
    }
    if (close?.parentElement === header) header.insertBefore(button, close);
    else header.append(button);
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      setTrackerCollapsed(!trackerCollapsed);
    });
  }
}

function scheduleCombatTrackerRender({ open = false } = {}) {
  if (open && !combatTracker?.rendered) {
    void openCombatTracker();
    return;
  }
  if (!combatTracker?.rendered || trackerRenderQueued) return;
  trackerRenderQueued = true;
  queueMicrotask(() => {
    trackerRenderQueued = false;
    if (combatTracker?.rendered) void combatTracker.render(false);
  });
}

async function openCombatTracker() {
  combatTracker ??= new FateCombatTracker();
  if (!combatTracker.rendered) await combatTracker.render(true);
  setTrackerCollapsed(false);
  combatTracker.bringToFront?.();
}

async function toggleCombatTracker() {
  combatTracker ??= new FateCombatTracker();
  if (!combatTracker.rendered) {
    trackerCollapsed = false;
    await combatTracker.render(true);
    combatTracker.bringToFront?.();
    return;
  }
  setTrackerCollapsed(!trackerCollapsed);
  combatTracker.bringToFront?.();
}

class FateCombatTracker extends AppV2 {
  static DEFAULT_OPTIONS = {
    id: "fate-toolkit-combat-tracker",
    tag: "section",
    classes: ["faw-combat-tracker", "fate"],
    position: { width: 430, height: "auto" },
    window: {
      frame: true,
      icon: "fa-solid fa-list-ol",
      title: "Боевой трекер Fate",
      resizable: true,
      minimizable: false
    }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/combat-tracker.hbs` }
  };

  async _prepareContext(context) {
    const combat = currentCombat();
    const isGM = game.user.isGM;
    if (!combat) {
      return foundry.utils.mergeObject(context, {
        isGM,
        hasCombat: false,
        canCreate: isGM,
        sceneName: canvas?.scene?.name ?? ""
      });
    }

    const queue = getQueue(combat);
    let selectedSkill = combat.getFlag(MODULE_ID, SKILL_FLAG);
    if (selectedSkill === undefined || selectedSkill === null) {
      try {
        const nativeSkill = game.settings.get(SYSTEM_ID, "init_skill");
        selectedSkill = (nativeSkill && nativeSkill !== "None" && nativeSkill !== "Disabled") ? nativeSkill : "";
      } catch (_) {
        selectedSkill = "";
      }
    }
    selectedSkill = String(selectedSkill ?? "");
    const currentId = combat.combatant?.id ?? null;
    const combatants = queue
      .map(id => combat.combatants.get(id))
      .filter(Boolean)
      .filter(canSeeCombatant);

    const skillNames = new Set();
    for (const c of combatants) for (const skill of actorSkillRows(c.actor)) skillNames.add(skill.name);
    const skills = Array.from(skillNames)
      .map(name => ({ name, label: globalThis.FateToolkitI18n?.skill?.(name) || name }))
      .sort((a, b) => a.label.localeCompare(b.label, "ru"))
      .map(row => ({ ...row, selected: row.name === selectedSkill }));

    const rows = combatants.map((combatant, index) => {
      const actor = combatant.actor;
      const tracks = boxedTracks(actor);
      const consequences = activeConsequences(actor);
      const acted = combatant.getFlag(SYSTEM_ID, "hasActed") === true;
      const current = combatant.id === currentId;
      const defeated = Boolean(combatant.defeated);
      const token = combatant.token;
      const pendingDamage = game.modules.get(MODULE_ID)?.api?.pendingDamageForActor?.(actor?.uuid, combat) ?? null;
      const stressTracks = tracks.filter(track => !track.isConsequence);
      const stressMarked = stressTracks.reduce((sum, track) => sum + normalizeNumber(track.marked), 0);
      const stressTotal = stressTracks.reduce((sum, track) => sum + normalizeNumber(track.total), 0);
      const actorRef = combatant.tokenId ? `token:${combatant.tokenId}` : (actor?.id ? `actor:${actor.id}` : "");
      return {
        id: combatant.id,
        index: index + 1,
        name: combatant.name ?? actor?.name ?? game.i18n.localize("FCT.Unknown"),
        img: combatant.img ?? token?.texture?.src ?? actor?.img ?? "icons/svg/mystery-man.svg",
        acted,
        current,
        defeated,
        hidden: Boolean(combatant.hidden),
        hasToken: Boolean(combatant.tokenId),
        actorRef,
        canAct: Boolean(actorRef && !defeated && (isGM || canUserOwnActor(game.user, actor))),
        canFinish: current && !defeated && (isGM || canUserOwnActor(game.user, actor)),
        canManage: isGM,
        canConcede: Boolean(globalThis.FateToolkitWill?.enabled?.() && !defeated && (isGM || canUserOwnActor(game.user, actor)) && !globalThis.FateToolkitConcession?.isConceded?.(combat, combatant.id)),
        skillRank: selectedSkill ? skillRank(actor, selectedSkill) : null,
        skillRankText: selectedSkill ? `${skillRank(actor, selectedSkill) >= 0 ? "+" : ""}${skillRank(actor, selectedSkill)}` : "",
        selectedSkill,
        selectedSkillLabel: selectedSkill ? (globalThis.FateToolkitI18n?.skill?.(selectedSkill) || selectedSkill) : "",
        fatePoints: normalizeNumber(actor?.system?.details?.fatePoints?.current),
        campaignMode: Boolean(globalThis.FateToolkitWill?.enabled?.()),
        campaignMax: globalThis.FateToolkitWill?.enabled?.() ? globalThis.FateToolkitWill.details(actor).max : 0,
        boosts: normalizeNumber(actor?.system?.details?.fatePoints?.boosts),
        tracks,
        stressMarked,
        stressTotal,
        consequences,
        consequenceCount: consequences.length,
        pendingDamage,
        hasPendingDamage: Boolean(pendingDamage),
        hasState: tracks.length > 0 || consequences.length > 0,
        lastEvent: game.modules.get(MODULE_ID)?.api?.getCombatantLastEvent?.(actor?.uuid, combat) ?? null,
        canMoveUp: isGM && index > 0,
        canMoveDown: isGM && index < combatants.length - 1
      };
    });

    const activeRows = rows.filter(row => !row.defeated);
    const unactedCount = activeRows.filter(row => !row.acted).length;
    const currentRow = rows.find(row => row.current) ?? null;
    const timeline = game.modules.get(MODULE_ID)?.api?.getConflictTimeline?.(combat) ?? [];
    const pendingDamage = currentRow?.pendingDamage ?? null;
    const pendingDamageRows = rows.filter(row => row.hasPendingDamage);
    const pendingDamageCount = pendingDamageRows.length;
    const conflictName = String(combat.getFlag(SYSTEM_ID, "name") ?? "").trim()
      || combat.scene?.name
      || game.i18n.localize("FCT.DefaultConflictName");

    return foundry.utils.mergeObject(context, {
      isGM,
      hasCombat: true,
      combatId: combat.id,
      conflictName,
      sceneName: combat.scene?.name ?? canvas?.scene?.name ?? "",
      round: combat.round ?? 0,
      started: (combat.round ?? 0) > 0,
      participantCount: rows.length,
      unactedCount,
      allActed: activeRows.length > 0 && unactedCount === 0,
      hasCurrent: Boolean(currentRow),
      currentName: currentRow?.name ?? "",
      canFinishCurrent: currentRow?.canFinish === true,
      pendingDamage,
      hasPendingDamage: Boolean(pendingDamage),
      pendingDamageRows,
      pendingDamageCount,
      hasAnyPendingDamage: pendingDamageCount > 0,
      canAdvanceExchange: isGM && pendingDamageCount === 0,
      timeline,
      hasTimeline: timeline.length > 0,
      rows,
      skills,
      hasSkills: skills.length > 0,
      selectedSkill,
      canSort: isGM && Boolean(selectedSkill),
      canCreate: isGM,
      showDetailedState: game.settings.get(MODULE_ID, "combatTrackerDetail") !== "summary"
    });
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    ensureCollapseButton(this);
    setTrackerCollapsed(trackerCollapsed);
    globalThis.FateToolkitUX?.bindContextMenus?.(this.element);
    const combat = currentCombat();

    this.element.querySelector("[data-fct-action='create']")?.addEventListener("click", () => void createConflictFromSelected());
    if (!combat) return;

    const participantSearch = this.element.querySelector("[data-fct-participant-search]");
    if (participantSearch) {
      participantSearch.value = participantSearchQuery;
      const applyParticipantSearch = () => {
        participantSearchQuery = String(participantSearch.value || "");
        const query = participantSearchQuery.trim().toLocaleLowerCase(game.i18n.lang);
        this.element.querySelectorAll(".fct-row[data-search]").forEach(row => {
          row.hidden = Boolean(query && !String(row.dataset.search || "").toLocaleLowerCase(game.i18n.lang).includes(query));
        });
      };
      participantSearch.addEventListener("input", debounceTrackerUi(applyParticipantSearch));
      applyParticipantSearch();
    }

    this.element.querySelector("[name='fct-conflict-name']")?.addEventListener("change", async event => {
      if (!game.user.isGM) return;
      await combat.setFlag(SYSTEM_ID, "name", String(event.currentTarget.value ?? "").trim());
    });

    const skillSelect = this.element.querySelector("[name='fct-order-skill']");
    const skillSearch = this.element.querySelector("[data-fct-skill-search]");
    if (skillSelect && skillSearch) {
      const source = [...skillSelect.options].map(option => ({
        value: String(option.value || ""),
        text: String(option.textContent || ""),
        disabled: Boolean(option.disabled)
      }));
      skillSearch.value = orderSkillSearchQuery;
      const applySkillSearch = () => {
        orderSkillSearchQuery = String(skillSearch.value || "");
        const current = String(skillSelect.value || "");
        const query = orderSkillSearchQuery.trim().toLocaleLowerCase(game.i18n.lang);
        const rows = source.filter(row => !row.value || !query || row.text.toLocaleLowerCase(game.i18n.lang).includes(query));
        if (current && !rows.some(row => row.value === current)) {
          const selected = source.find(row => row.value === current);
          if (selected) rows.unshift(selected);
        }
        skillSelect.innerHTML = rows.map(row => `<option value="${escapeHtml(row.value)}" ${row.value === current ? "selected" : ""} ${row.disabled ? "disabled" : ""}>${escapeHtml(row.text)}</option>`).join("");
        if (![...skillSelect.options].some(option => option.value === current)) skillSelect.value = "";
      };
      skillSearch.addEventListener("input", debounceTrackerUi(applySkillSearch));
      applySkillSearch();
    }
    skillSelect?.addEventListener("change", async event => {
      if (!game.user.isGM) return;
      await combat.setFlag(MODULE_ID, SKILL_FLAG, event.currentTarget.value ?? "");
    });

    this.element.querySelector("[data-fct-action='sort-skill']")?.addEventListener("click", () => {
      const name = this.element.querySelector("[name='fct-order-skill']")?.value ?? "";
      void sortBySkill(combat, name);
    });
    this.element.querySelector("[data-fct-action='add-selected']")?.addEventListener("click", () => void addSelectedToConflict(combat));
    this.element.querySelector("[data-fct-action='new-exchange']")?.addEventListener("click", () => void requestAdvanceExchange(combat));
    this.element.querySelector("[data-fct-action='open-first-damage']")?.addEventListener("click", () => {
      const first = unresolvedDamageRows(combat)[0];
      if (first?.messageId) game.modules.get(MODULE_ID)?.api?.focusChatMessage?.(first.messageId);
    });
    this.element.querySelector("[data-fct-action='finish-current']")?.addEventListener("click", () => {
      const id = combat.combatant?.id;
      if (id) void requestFinishCurrent(combat, id);
    });
    this.element.querySelector("[data-fct-action='end-conflict']")?.addEventListener("click", () => void deleteConflict(combat));
    this.element.querySelectorAll("[data-fct-journal-message]").forEach(button => {
      button.addEventListener("click", () => game.modules.get(MODULE_ID)?.api?.focusChatMessage?.(button.dataset.fctJournalMessage));
    });

    this.element.querySelectorAll("[data-fct-row-action]").forEach(button => {
      button.addEventListener("click", event => {
        const id = event.currentTarget.dataset.combatantId;
        const action = event.currentTarget.dataset.fctRowAction;
        const combatant = combat.combatants.get(id);
        if (!combatant) return;
        if (action === "toggle-menu") {
          const row = event.currentTarget.closest(".fct-row");
          const menu = row?.querySelector(".fct-inline-menu");
          const opening = Boolean(menu?.hidden);
          this.element.querySelectorAll(".fct-inline-menu").forEach(other => { if (other !== menu) other.hidden = true; });
          this.element.querySelectorAll("[data-fct-row-action='toggle-menu']").forEach(other => { if (other !== event.currentTarget) other.setAttribute("aria-expanded", "false"); });
          if (menu) menu.hidden = !opening;
          event.currentTarget.setAttribute("aria-expanded", opening ? "true" : "false");
          return;
        }
        if (action === "current") void setCurrent(combat, id);
        else if (action === "acted") void toggleActed(combat, id);
        else if (action === "up") void moveCombatant(combat, id, -1);
        else if (action === "down") void moveCombatant(combat, id, 1);
        else if (action === "remove") void removeCombatant(combat, id);
        else if (action === "concede") {
          void (async () => {
            try {
              const concession = globalThis.FateToolkitConcession;
              if (!concession?.enabled?.()) return;
              const terms = await foundry.applications.api.DialogV2.prompt({
                window: { title: game.i18n.localize("FAW.Campaign.Concede") },
                content: `<div class="faw-toolkit-dialog"><label for="faw-concession-terms">${game.i18n.localize("FAW.Campaign.ConcedeTerms")}</label><textarea id="faw-concession-terms" name="terms" rows="3" maxlength="1000" required></textarea></div>`,
                ok: { label: game.i18n.localize("FAW.Campaign.Concede"), callback: (_event, button) => String(button.form?.elements?.terms?.value ?? "").trim() },
                rejectClose: false
              });
              if (!terms) return;
              await concession.requestConcede(combat, id, terms);
              scheduleCombatTrackerRender();
            } catch (error) { globalThis.FateToolkitUX.error(error?.message || String(error)); }
          })();
        }
        else if (action === "defeated" && game.user.isGM) void combatant.update({ defeated: !combatant.defeated });
        else if (action === "sheet") combatant.actor?.sheet?.render(true);
        else if (action === "focus") focusCombatant(combatant, { target: false });
        else if (action === "target") focusCombatant(combatant, { target: true });
        else if (action === "action") {
          const actorRef = combatant.tokenId ? `token:${combatant.tokenId}` : (combatant.actor?.id ? `actor:${combatant.actor.id}` : "");
          if (actorRef) void game.modules.get(MODULE_ID)?.api?.openActionWidgetFor?.(actorRef);
        } else if (action === "damage") {
          const pending = game.modules.get(MODULE_ID)?.api?.pendingDamageForActor?.(combatant.actor?.uuid, combat) ?? null;
          if (pending?.messageId) game.modules.get(MODULE_ID)?.api?.focusChatMessage?.(pending.messageId);
        }
      });
    });
  }
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "combatTrackerAutoOpen", {
    name: "FCT.AutoOpenName",
    hint: "FCT.AutoOpenHint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "combatTrackerDetail", {
    name: "FCT.DetailModeName",
    hint: "FCT.DetailModeHint",
    scope: "client",
    config: true,
    type: String,
    choices: {
      summary: "FCT.DetailSummary",
      full: "FCT.DetailFull"
    },
    default: "full"
  });
});

Hooks.once("ready", () => {
  if (game.system?.id !== SYSTEM_ID) return;
  combatTracker = new FateCombatTracker();
  const module = game.modules.get(MODULE_ID);
  module.api ??= {};
  Object.assign(module.api, {
    openCombatTracker: () => openCombatTracker(),
    toggleCombatTracker: () => toggleCombatTracker(),
    refreshCombatTracker: () => scheduleCombatTrackerRender(),
    getUnresolvedDamageRows: combat => unresolvedDamageRows(combat ?? currentCombat()),
    requestNextExchange: combat => requestAdvanceExchange(combat ?? currentCombat()),
    resumeConflictTurn: combat => resumeTurn(combat ?? currentCombat()),
    getTurnContext(actorUuid) {
      const combat = currentCombat();
      const current = combat?.combatant ?? null;
      const actor = current?.actor ?? null;
      const matches = Boolean(actorUuid && actor && (actor.uuid === actorUuid || actor.id === actorUuid || String(actorUuid).endsWith(`Actor.${actor.id}`)));
      return { combat, combatant: current, isCurrent: matches, acted: current?.getFlag(SYSTEM_ID, "hasActed") === true };
    },
    async finishCurrentTurnForActor(actorUuid, { messageId = null } = {}) {
      const combat = currentCombat();
      const current = combat?.combatant ?? null;
      const actor = current?.actor ?? null;
      const matches = Boolean(actorUuid && actor && (actor.uuid === actorUuid || actor.id === actorUuid || String(actorUuid).endsWith(`Actor.${actor.id}`)));
      if (!combat || !current || !matches) return false;
      await requestFinishCurrent(combat, current.id, { messageId });
      return true;
    },
    get combatTrackerApp() { return combatTracker; }
  });
  combatRpc().register("combat", async (payload, { senderId } = {}) => {
    if (!game.user.isGM || primaryActiveGM()?.id !== game.user.id) return;
    if (payload?.action !== "finishTurn") return;
    const combat = game.combats.get(payload.combatId);
    const user = game.users.get(String(senderId || ""));
    if (!combat || !user) return;
    const result = await finishTurn(combat, payload.combatantId, { messageId: payload.messageId ?? null, userId: user.id, allowPendingDamage: false });
    if (result?.code === "pending-damage") {
      game.socket.emit(SOCKET, { type: "fawFlowNotice", targetUserIds: [user.id], level: "warn", message: game.i18n.localize("FCT.PendingDamage") });
    }
  });
  if (currentCombat() && game.settings.get(MODULE_ID, "combatTrackerAutoOpen")) void openCombatTracker();
});

Hooks.on("getSceneControlButtons", controls => {
  if (game.system?.id !== SYSTEM_ID) return;
  const tokenControls = controls?.tokens;
  if (!tokenControls?.tools) return;
  tokenControls.tools.fateCombatTracker = {
    name: "fateCombatTracker",
    title: "FCT.ControlTitle",
    icon: "fa-solid fa-list-ol",
    order: Object.keys(tokenControls.tools).length + 20,
    button: true,
    visible: true,
    onChange: () => void toggleCombatTracker()
  };
});

for (const hook of ["createCombat", "updateCombat", "deleteCombat", "createCombatant", "updateCombatant", "deleteCombatant"]) {
  Hooks.on(hook, () => {
    const shouldOpen = Boolean(currentCombat() && game.settings.get(MODULE_ID, "combatTrackerAutoOpen"));
    scheduleCombatTrackerRender({ open: shouldOpen });
  });
}
Hooks.on("updateActor", actor => { if (combatContainsActor(actor)) scheduleCombatTrackerRender(); });
Hooks.on("updateToken", tokenDoc => { if (combatContainsToken(tokenDoc)) scheduleCombatTrackerRender(); });
Hooks.on("canvasReady", () => scheduleCombatTrackerRender());

Hooks.on("updateSetting", setting => {
  const key = String(setting?.key || "");
  if (key === `${MODULE_ID}.combatTrackerDetail` || key === `${MODULE_ID}.uiDensity`) scheduleCombatTrackerRender();
});
