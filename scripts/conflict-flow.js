const MODULE_ID = "fate-aspect-widget";
const SYSTEM_ID = "fate-core-official";
const SOCKET = `module.${MODULE_ID}`;
const JOURNAL_FLAG = "conflictJournal";
const ROLL_INDEX_FLAG = "conflictRollIndex";
const JOURNAL_LIMIT = 60;
const INDEX_LIMIT = 120;

const combatQueues = new Map();

function currentCombat() {
  return game.combat ?? game.combats?.viewed ?? null;
}

function primaryActiveGM() {
  return game.users?.activeGM ?? null;
}

function privateOppositionActorUuid(message) {
  if (!game.user?.isGM) return null;
  try {
    return game.modules.get(MODULE_ID)?.api?.getPrivateOppositionActorUuid?.(message) ?? null;
  } catch (_) {
    return null;
  }
}

function isPrimaryGM() {
  return Boolean(game.user.isGM && primaryActiveGM()?.id === game.user.id);
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function n(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clone(value) {
  return foundry.utils.duplicate(value);
}

function matchesActorUuid(actor, uuid) {
  if (!actor || !uuid) return false;
  const value = String(uuid);
  return actor.uuid === value || actor.id === value || value.endsWith(`Actor.${actor.id}`);
}

function combatantForActorUuid(combat, actorUuid) {
  if (!combat || !actorUuid) return null;
  return (combat.combatants?.contents ?? Array.from(combat.combatants ?? []))
    .find(combatant => matchesActorUuid(combatant.actor, actorUuid)) ?? null;
}

function getActorCombatState(actorUuid, combat = currentCombat()) {
  const combatant = combatantForActorUuid(combat, actorUuid);
  return {
    combat,
    combatant,
    inCombat: Boolean(combatant),
    current: Boolean(combatant && combat?.combatant?.id === combatant.id),
    acted: combatant?.getFlag(SYSTEM_ID, "hasActed") === true,
    defeated: Boolean(combatant?.defeated)
  };
}

function actionLabel(type) {
  const key = type === "create" ? "caa" : type;
  const i18nKey = `FMS.Action.${key}`;
  const localized = game.i18n.localize(i18nKey);
  if (localized !== i18nKey) return localized;
  return ({ overcome: "Преодоление", create: "Создание преимущества", attack: "Атака", defend: "Защита" })[type] ?? "Бросок";
}

function outcomeLabel(key) {
  const i18nKey = `FCT.Outcome.${key || "unknown"}`;
  const localized = game.i18n.localize(i18nKey);
  if (localized !== i18nKey) return localized;
  return ({ failure: "Провал", tie: "Ничья", success: "Успех", style: "Успех со стилем" })[key] ?? "Результат";
}

function eventIcon(type) {
  return ({
    roll: "fa-solid fa-dice",
    revision: "fa-solid fa-rotate",
    invoke: "fa-solid fa-sparkles",
    damage: "fa-solid fa-shield-halved",
    consequence: "fa-solid fa-bandage",
    boost: "fa-solid fa-bolt",
    takenout: "fa-solid fa-skull",
    turn: "fa-solid fa-check",
    exchange: "fa-solid fa-repeat"
  })[type] ?? "fa-solid fa-circle";
}

function eventClass(type) {
  return `is-${String(type || "event").replace(/[^a-z0-9_-]/gi, "")}`;
}

function formatTime(timestamp) {
  try {
    return new Intl.DateTimeFormat(game.i18n.lang || undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp));
  } catch (_) {
    return "";
  }
}

function getRawJournal(combat) {
  const raw = combat?.getFlag(MODULE_ID, JOURNAL_FLAG);
  return Array.isArray(raw) ? clone(raw) : [];
}

function queueCombatWrite(combat, callback) {
  if (!combat) return Promise.resolve();
  const key = combat.id;
  const previous = combatQueues.get(key) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(callback).finally(() => {
    if (combatQueues.get(key) === next) combatQueues.delete(key);
  });
  combatQueues.set(key, next);
  return next;
}

async function recordConflictEvent(event, combat = currentCombat()) {
  if (!isPrimaryGM() || !combat || !event?.text) return false;
  return queueCombatWrite(combat, async () => {
    if (!game.combats?.get(combat.id)) return false;
    const journal = getRawJournal(combat);
    const row = {
      id: foundry.utils.randomID(),
      timestamp: Date.now(),
      round: combat.round ?? 0,
      type: event.type || "event",
      actorUuid: event.actorUuid ?? null,
      actorName: event.actorName ?? "",
      targetName: event.targetName ?? "",
      text: String(event.text),
      messageId: event.messageId ?? null
    };
    journal.push(row);
    const trimmed = journal.slice(-JOURNAL_LIMIT);
    await combat.update({ [`flags.${MODULE_ID}.${JOURNAL_FLAG}`]: trimmed });
    game.modules.get(MODULE_ID)?.api?.refreshCombatTracker?.();
    return true;
  });
}

function getConflictTimeline(combat = currentCombat(), limit = 12) {
  let rows = getRawJournal(combat);
  if (!game.user.isGM && combat) {
    rows = rows.filter(row => {
      if (!row.actorUuid) return true;
      const combatant = combatantForActorUuid(combat, row.actorUuid);
      return !combatant?.hidden;
    });
  }
  return rows.slice(-Math.max(1, limit)).reverse().map(row => ({
    ...row,
    icon: eventIcon(row.type),
    cssClass: eventClass(row.type),
    time: formatTime(row.timestamp),
    hasMessage: Boolean(row.messageId)
  }));
}

function getCombatantLastEvent(actorUuid, combat = currentCombat()) {
  if (!actorUuid || !combat) return null;
  const row = [...getRawJournal(combat)].reverse().find(entry => entry.actorUuid && String(entry.actorUuid) === String(actorUuid));
  if (!row) return null;
  return { ...row, icon: eventIcon(row.type), cssClass: eventClass(row.type), time: formatTime(row.timestamp) };
}

function damageSpec(message) {
  const flags = message?.flags?.[MODULE_ID] ?? {};
  if (!flags.resolved || !Number.isFinite(Number(flags.difference))) return null;
  const diff = Number(flags.difference);
  const traded = Boolean(flags.boostClaimed && flags.boostOpportunity?.tradeShift);
  if (flags.actionType === "attack" && diff > 0) {
    const actorUuid = flags.actionTarget?.actorUuid || flags.oppositionActorUuid || privateOppositionActorUuid(message) || null;
    if (!actorUuid) return null;
    return {
      actorUuid,
      actorName: flags.actionTarget?.actorName || flags.actionTarget?.name || "Защищающийся",
      total: Math.max(0, diff - (traded ? 1 : 0))
    };
  }
  if (flags.actionType === "defend" && (flags.defendedAgainst || "attack") === "attack" && diff < 0) {
    return {
      actorUuid: flags.actorUuid || null,
      actorName: flags.actorName || "Защищающийся",
      total: Math.max(0, -diff - (traded ? 1 : 0))
    };
  }
  return null;
}

function latestActionMessageForActor(actorUuid, combat = currentCombat()) {
  if (!actorUuid || !combat) return null;
  const currentRound = combat.round ?? 0;
  const journal = getRawJournal(combat);
  const event = [...journal].reverse().find(row =>
    row.actorUuid === actorUuid && row.messageId && row.round === currentRound && ["roll", "revision", "invoke"].includes(row.type)
  );
  if (event?.messageId) return game.messages.get(event.messageId) ?? null;

  // Once this combat has journal history for the actor, do not let an unresolved
  // hit from an earlier exchange block a fresh turn. The fallback below exists
  // only for worlds upgraded mid-conflict before v0.15 had written journal rows.
  if (journal.some(row => row.actorUuid === actorUuid)) return null;

  return [...(game.messages?.contents ?? [])].reverse().find(message => {
    const flags = message.flags?.[MODULE_ID] ?? {};
    return flags.resolved && !flags.actionOppositionFor && flags.actorUuid === actorUuid;
  }) ?? null;
}

function pendingDamageForActor(actorUuid, combat = currentCombat()) {
  const message = latestActionMessageForActor(actorUuid, combat);
  if (!message) return null;
  const spec = damageSpec(message);
  if (!spec || spec.total <= 0) return null;
  const state = message.flags?.[MODULE_ID]?.damageResolution ?? null;
  if (state?.status === "resolved" || state?.status === "taken-out" || state?.status === "ignored") return null;
  const absorbed = Array.isArray(state?.selections)
    ? state.selections.reduce((sum, row) => sum + Math.max(0, n(row?.capacity)), 0)
    : 0;
  return {
    messageId: message.id,
    total: spec.total,
    absorbed,
    remaining: Math.max(0, spec.total - absorbed),
    targetActorUuid: spec.actorUuid,
    targetActorName: spec.actorName
  };
}

function rollSummary(flags) {
  const actorName = flags.actorName || "Персонаж";
  const action = actionLabel(flags.actionType);
  const outcome = outcomeLabel(flags.outcome);
  const shift = Number.isFinite(Number(flags.difference)) && Number(flags.difference) !== 0
    ? ` · ${Math.abs(Number(flags.difference))} ${game.i18n.localize("FCT.ShiftsShort")}`
    : "";
  return `${actorName}: ${action} → ${outcome}${shift}`;
}

async function processRollMessage(message) {
  if (!isPrimaryGM() || !message) return;
  const flags = message.flags?.[MODULE_ID] ?? {};
  if (!flags.resolved || flags.actionOppositionFor || !flags.actorUuid) return;
  const combat = currentCombat();
  if (!combat || !combatantForActorUuid(combat, flags.actorUuid)) return;

  await queueCombatWrite(combat, async () => {
    if (!game.combats?.get(combat.id)) return;
    const rawIndex = clone(combat.getFlag(MODULE_ID, ROLL_INDEX_FLAG) ?? {});
    const journal = getRawJournal(combat);
    const previous = rawIndex[message.id] ?? { historyLength: 0, initial: false };
    const history = Array.isArray(flags.rollHistory) ? flags.rollHistory : [];
    let changed = false;

    if (!previous.initial) {
      journal.push({
        id: foundry.utils.randomID(),
        timestamp: Date.now(),
        round: combat.round ?? 0,
        type: "roll",
        actorUuid: flags.actorUuid,
        actorName: flags.actorName ?? "",
        targetName: flags.actionTarget?.name || "",
        text: rollSummary(flags),
        messageId: message.id
      });
      previous.initial = true;
      changed = true;
    }

    if (history.length > previous.historyLength) {
      const start = Math.max(previous.historyLength, 1); // #1 is the initial roll already represented above.
      for (const revision of history.slice(start)) {
        const label = String(revision?.revisionLabel || game.i18n.localize("FCT.ResultChanged"));
        const total = Number.isFinite(Number(revision?.total)) ? ` → ${Number(revision.total) >= 0 ? "+" : ""}${Number(revision.total)}` : "";
        journal.push({
          id: foundry.utils.randomID(),
          timestamp: Date.now(),
          round: combat.round ?? 0,
          type: "revision",
          actorUuid: flags.actorUuid,
          actorName: flags.actorName ?? "",
          targetName: flags.actionTarget?.name || "",
          text: `${flags.actorName || "Персонаж"}: ${label}${total}`,
          messageId: message.id
        });
        changed = true;
      }
    }

    previous.historyLength = Math.max(previous.historyLength, history.length);
    previous.updatedAt = Date.now();
    rawIndex[message.id] = previous;
    const indexEntries = Object.entries(rawIndex).sort((a, b) => n(b[1]?.updatedAt) - n(a[1]?.updatedAt)).slice(0, INDEX_LIMIT);
    const cleanIndex = Object.fromEntries(indexEntries);

    if (changed || history.length !== (rawIndex[message.id]?.historyLength ?? 0)) {
      await combat.update({
        [`flags.${MODULE_ID}.${JOURNAL_FLAG}`]: journal.slice(-JOURNAL_LIMIT),
        [`flags.${MODULE_ID}.${ROLL_INDEX_FLAG}`]: cleanIndex
      });
      game.modules.get(MODULE_ID)?.api?.refreshCombatTracker?.();
    } else if (JSON.stringify(cleanIndex) !== JSON.stringify(rawIndex)) {
      await combat.update({ [`flags.${MODULE_ID}.${ROLL_INDEX_FLAG}`]: cleanIndex });
    }
  });
}

function flowStatus(message, combat) {
  const flags = message.flags?.[MODULE_ID] ?? {};
  const actorUuid = flags.actorUuid ?? null;
  const combatant = combatantForActorUuid(combat, actorUuid);
  const history = Array.isArray(flags.rollHistory) ? flags.rollHistory : [];
  const revisions = Math.max(0, history.length - 1);
  const changes = revisions + (flags.boostClaimed ? 1 : 0);
  const spec = damageSpec(message);
  const damageState = flags.damageResolution ?? null;
  let damage = { state: "none", label: game.i18n.localize("FCT.FlowNotRequired") };
  if (flags.actionType === "attack" && !Number.isFinite(Number(flags.difference))) {
    damage = { state: "waiting", label: game.i18n.localize("FCT.FlowDamageHidden") };
  } else if (spec?.total > 0) {
    if (damageState?.status === "ignored") damage = { state: "done", label: game.i18n.localize("FRR.Chat.DamageIgnored") };
    if (damageState?.status === "resolved") damage = { state: "done", label: game.i18n.localize("FCT.FlowDamageResolved") };
    else if (damageState?.status === "taken-out") damage = { state: "done", label: game.i18n.localize("FCT.FlowTakenOut") };
    else {
      const absorbed = Array.isArray(damageState?.selections)
        ? damageState.selections.reduce((sum, row) => sum + Math.max(0, n(row?.capacity)), 0)
        : 0;
      damage = {
        state: "pending",
        label: game.i18n.format("FCT.FlowDamagePending", { remaining: Math.max(0, spec.total - absorbed) })
      };
    }
  }
  const acted = combatant?.getFlag(SYSTEM_ID, "hasActed") === true;
  const current = combat?.combatant?.id === combatant?.id;
  return { flags, actorUuid, combatant, history, revisions, changes, spec, damage, acted, current };
}

function stepHtml(icon, title, detail, state = "done") {
  return `<div class="frr-flow-step is-${esc(state)}"><i class="${esc(icon)}" aria-hidden="true"></i><span><b>${esc(title)}</b><small>${esc(detail)}</small></span></div>`;
}

async function actorFromUuid(uuid) {
  if (!uuid) return null;
  try {
    const doc = await fromUuid(uuid);
    if (doc instanceof TokenDocument) return doc.actor ?? null;
    return doc?.actor ?? doc ?? null;
  } catch (_) {
    return game.actors?.get(uuid) ?? null;
  }
}

function mayControl(user, actor) {
  if (!user || !actor) return false;
  if (user.isGM) return true;
  try { return actor.testUserPermission(user, "OWNER"); } catch (_) { return false; }
}

async function injectConflictFlow(message, html) {
  const root = html instanceof HTMLElement ? html : html?.[0] ?? null;
  if (!root) return;
  root.querySelectorAll(".frr-flow-panel").forEach(el => el.remove());
  const flags = message.flags?.[MODULE_ID] ?? {};
  if (!flags.resolved || flags.actionOppositionFor || !flags.actorUuid) return;
  const combat = currentCombat();
  if (!combat) return;
  const status = flowStatus(message, combat);
  if (!status.combatant) return;
  const card = root.querySelector(".frr-chat-result");
  if (!card) return;

  const actor = await actorFromUuid(status.actorUuid);
  const allowed = mayControl(game.user, actor);
  const panel = document.createElement("section");
  panel.className = "frr-flow-panel";

  const revisionDetail = status.changes
    ? game.i18n.format("FCT.FlowRevisionsCount", { count: status.changes })
    : game.i18n.localize("FCT.FlowNoRevisions");
  const resultDetail = outcomeLabel(flags.outcome);
  const turnState = flags.turnFinalized || status.acted ? "done" : status.current ? "current" : "waiting";
  const turnDetail = flags.turnFinalized || status.acted
    ? game.i18n.localize("FCT.FlowTurnDone")
    : status.current ? game.i18n.localize("FCT.FlowTurnCurrent") : game.i18n.localize("FCT.FlowTurnWaiting");

  panel.innerHTML = `<div class="frr-chat-tool-heading"><span><i class="fa-solid fa-route" aria-hidden="true"></i> ${esc(game.i18n.localize("FCT.FlowTitle"))}</span><button type="button" class="frr-flow-open-tracker" data-flow-open-tracker title="${esc(game.i18n.localize("FCT.FlowOpenTracker"))}" aria-label="${esc(game.i18n.localize("FCT.FlowOpenTracker"))}"><i class="fa-solid fa-list-ol" aria-hidden="true"></i></button></div>
    <div class="frr-flow-steps">
      ${stepHtml("fa-solid fa-dice", game.i18n.localize("FCT.FlowRoll"), game.i18n.localize("FCT.FlowRollDone"), "done")}
      ${stepHtml("fa-solid fa-sparkles", game.i18n.localize("FCT.FlowChanges"), revisionDetail, status.changes ? "done" : "muted")}
      ${stepHtml("fa-solid fa-scale-balanced", game.i18n.localize("FCT.FlowResult"), resultDetail, "done")}
      ${stepHtml("fa-solid fa-shield-halved", game.i18n.localize("FCT.FlowDamage"), status.damage.label, status.damage.state)}
      ${stepHtml("fa-solid fa-forward-step", game.i18n.localize("FCT.FlowTurn"), turnDetail, turnState)}
    </div>
    <div class="frr-flow-actions"></div>`;
  card.append(panel);

  panel.querySelector("[data-flow-open-tracker]")?.addEventListener("click", () => game.modules.get(MODULE_ID)?.api?.openCombatTracker?.());
  const actions = panel.querySelector(".frr-flow-actions");
  if (!actions) return;

  if (status.current && !status.acted && !flags.turnFinalized && allowed) {
    if (status.damage.state === "pending") {
      actions.innerHTML = `<span class="frr-tool-warning"><i class="fa-solid fa-hourglass-half" aria-hidden="true"></i> ${esc(game.i18n.localize("FCT.FlowResolveDamageFirst"))}</span>`;
    } else {
      actions.innerHTML = `<button type="button" class="frr-flow-finish" data-flow-finish><i class="fa-solid fa-check" aria-hidden="true"></i> ${esc(game.i18n.localize("FCT.FinishTurn"))}</button>`;
      actions.querySelector("[data-flow-finish]")?.addEventListener("click", async buttonEvent => {
        const button = buttonEvent.currentTarget;
        button.disabled = true;
        const ok = await game.modules.get(MODULE_ID)?.api?.finishCurrentTurnForActor?.(status.actorUuid, { messageId: message.id });
        if (!ok) button.disabled = false;
      });
    }
  }
}

async function focusChatMessage(messageId) {
  if (!messageId) return;
  try { await ui.sidebar?.activateTab?.("chat"); } catch (_) {}
  const locate = () => document.querySelector(`[data-message-id="${CSS.escape(String(messageId))}"]`);
  let element = locate();
  if (!element) {
    await new Promise(resolve => setTimeout(resolve, 40));
    element = locate();
  }
  if (!element) return globalThis.FateToolkitUX.info(game.i18n.localize("FCT.MessageNotVisible"));
  element.scrollIntoView({ behavior: "smooth", block: "center" });
  element.classList.add("faw-chat-highlight");
  setTimeout(() => element?.classList.remove("faw-chat-highlight"), 1400);
}

function socketNotice(payload) {
  if (payload?.type !== "fawFlowNotice") return;
  if (Array.isArray(payload.targetUserIds) && !payload.targetUserIds.includes(game.user.id)) return;
  const fn = payload.level === "error" ? "error" : payload.level === "info" ? "info" : "warn";
  ui.notifications?.[fn]?.(payload.message || "");
}

Hooks.once("ready", () => {
  if (game.system?.id !== SYSTEM_ID) return;
  const module = game.modules.get(MODULE_ID);
  module.api ??= {};
  Object.assign(module.api, {
    recordConflictEvent,
    getConflictTimeline,
    getCombatantLastEvent,
    getActorCombatState,
    pendingDamageForActor,
    injectConflictFlow,
    focusChatMessage
  });
  module.api.refreshCombatTracker?.();
  game.socket.on(SOCKET, socketNotice);
});

Hooks.on("createChatMessage", message => void processRollMessage(message));
Hooks.on("updateChatMessage", message => void processRollMessage(message));
