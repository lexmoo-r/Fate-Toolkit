const MODULE_ID = "fate-aspect-widget";
const SYSTEM_ID = "fate-core-official";
const MILESTONE_SETTING = "milestoneSession";

const AppV2 = foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2);
let workflowCenter = null;
let renderQueued = false;
let autoOpenDebounce = null;

function currentCombat() {
  return game.combat ?? game.combats?.viewed ?? null;
}

function ownsActor(user, actor) {
  if (!user || !actor) return false;
  if (user.isGM) return true;
  try { return actor.testUserPermission(user, "OWNER"); } catch (_) { return false; }
}

function hasActivePlayerOwner(actor) {
  if (!actor) return false;
  return (game.users?.contents ?? []).some(user => {
    if (!user.active || user.isGM) return false;
    try { return actor.testUserPermission(user, "OWNER"); } catch (_) { return false; }
  });
}

function localize(key, fallback = key) {
  const value = game.i18n.localize(key);
  return value === key ? fallback : value;
}

function milestoneSession() {
  try {
    const session = foundry.utils.duplicate(game.settings.get(MODULE_ID, MILESTONE_SETTING));
    return session?.id ? session : null;
  } catch (_) {
    return null;
  }
}

function milestoneContext() {
  const session = milestoneSession();
  if (!session) return { active: false };
  const rows = Object.entries(session.actors ?? {});
  if (game.user.isGM) {
    const total = rows.length;
    const completed = rows.filter(([, row]) => row?.status === "completed").length;
    const submitted = rows.filter(([, row]) => row?.status === "submitted").length;
    return {
      active: true,
      gm: true,
      title: session.title || localize("FWC.Milestone", "Веха"),
      type: session.type || "",
      total,
      completed,
      submitted,
      pending: Math.max(0, total - completed),
      status: game.i18n.format("FWC.MilestoneGmStatus", { completed, total, submitted })
    };
  }

  const assigned = rows.filter(([, row]) => Array.isArray(row?.userIds) && row.userIds.includes(game.user.id));
  const pending = assigned.filter(([, row]) => row?.status !== "completed");
  if (!assigned.length) return { active: false };
  return {
    active: true,
    gm: false,
    title: session.title || localize("FWC.Milestone", "Веха"),
    count: pending.length,
    completed: pending.length === 0,
    status: pending.length
      ? game.i18n.format("FWC.MilestonePlayerPending", { count: pending.length })
      : localize("FWC.MilestonePlayerDone", "Веха завершена")
  };
}

function requestContext() {
  const api = game.modules.get(MODULE_ID)?.api;
  if (game.user.isGM) {
    const requests = api?.getGmRollRequestRows?.() ?? [];
    let totalTargets = 0;
    let pending = 0;
    let rolled = 0;
    let declined = 0;
    for (const request of requests) {
      for (const target of request.targets ?? []) {
        totalTargets += 1;
        const status = target.status ?? "pending";
        if (status === "rolled") rolled += 1;
        else if (status === "declined") declined += 1;
        else pending += 1;
      }
    }
    return {
      gm: true,
      count: requests.length,
      pending,
      rolled,
      declined,
      has: requests.length > 0,
      status: requests.length
        ? game.i18n.format("FWC.RequestsGmStatus", { requests: requests.length, pending, rolled, declined, total: totalTargets })
        : localize("FWC.NoRequests", "Нет ожидающих запросов")
    };
  }
  const requests = api?.getPendingRollRequestRows?.() ?? [];
  return {
    gm: false,
    count: requests.length,
    has: requests.length > 0,
    status: requests.length
      ? game.i18n.format("FWC.RequestsPlayerStatus", { count: requests.length })
      : localize("FWC.NoRequests", "Нет ожидающих запросов")
  };
}


function actionProcessContext() {
  const api = game.modules.get(MODULE_ID)?.api;
  const pending = api?.getPendingActionState?.() ?? null;
  const queue = api?.getOppositionQueueState?.() ?? [];
  const oppositionCount = Array.isArray(queue) ? queue.length : 0;
  const proposal = pending?.proposal ?? null;
  const hasPending = Boolean(proposal?.id);
  const actionName = proposal?.actionLabel || localize("FWC.Action", "Действие Fate");
  const actorName = proposal?.actorName || "";
  const targetName = proposal?.target?.name || "";
  let status = "";
  if (oppositionCount) status = game.i18n.format("FWC.OppositionPending", { count: oppositionCount });
  else if (hasPending) status = game.i18n.format("FWC.ActionWaiting", { action: actionName });
  return {
    active: hasPending || oppositionCount > 0,
    hasPending,
    oppositionCount,
    needsAttention: oppositionCount > 0,
    actionName,
    actorName,
    targetName,
    status
  };
}

function combatContext() {
  const combat = currentCombat();
  if (!combat) return { active: false };
  const api = game.modules.get(MODULE_ID)?.api;
  const combatants = combat.combatants?.contents ?? Array.from(combat.combatants ?? []);
  const visible = combatants.filter(c => game.user.isGM || (!c.hidden && ownsActor(game.user, c.actor)));
  const current = combat.combatant ?? null;
  const currentVisible = current && (game.user.isGM || (!current.hidden && ownsActor(game.user, current.actor)));
  const myRows = game.user.isGM ? visible : visible.filter(c => ownsActor(game.user, c.actor));
  const myCurrent = currentVisible ? current : null;
  const pendingRows = [];
  for (const combatant of myRows) {
    if (!combatant?.actor) continue;
    const pending = api?.pendingDamageForActor?.(combatant.actor.uuid, combat) ?? null;
    if (!pending) continue;
    pendingRows.push({
      combatantId: combatant.id,
      actorUuid: combatant.actor.uuid,
      name: combatant.name ?? combatant.actor.name ?? localize("FCT.Unknown", "Неизвестный участник"),
      remaining: pending.remaining,
      messageId: pending.messageId
    });
  }
  const pendingDamage = myCurrent?.actor
    ? api?.pendingDamageForActor?.(myCurrent.actor.uuid, combat) ?? null
    : null;
  const acted = myCurrent?.getFlag(SYSTEM_ID, "hasActed") === true;
  const canFinish = Boolean(myCurrent && !acted && !myCurrent.defeated && ownsActor(game.user, myCurrent.actor) && !pendingDamage);
  const activeRows = visible.filter(c => !c.defeated);
  const unactedCount = activeRows.filter(c => c.getFlag(SYSTEM_ID, "hasActed") !== true).length;
  const allActed = activeRows.length > 0 && unactedCount === 0;
  const started = (combat.round ?? 0) > 0;
  const exchangeReady = Boolean(game.user.isGM && pendingRows.length === 0 && activeRows.length > 0 && (!started || allActed));
  const needsTurnAssignment = Boolean(game.user.isGM && started && !current && unactedCount > 0);
  const currentNeedsGm = Boolean(game.user.isGM && myCurrent && !acted && !myCurrent.defeated && !hasActivePlayerOwner(myCurrent.actor));

  let status;
  if (myCurrent) {
    if (myCurrent.defeated) status = game.i18n.format("FWC.CurrentDefeated", { name: myCurrent.name ?? myCurrent.actor?.name ?? "" });
    else if (pendingDamage) status = game.i18n.format("FWC.CurrentDamage", { name: myCurrent.name ?? myCurrent.actor?.name ?? "", remaining: pendingDamage.remaining });
    else status = game.i18n.format("FWC.CurrentTurn", { name: myCurrent.name ?? myCurrent.actor?.name ?? "" });
  } else if (!game.user.isGM && myRows.length) {
    const notActed = myRows.filter(c => c.getFlag(SYSTEM_ID, "hasActed") !== true && !c.defeated).length;
    status = notActed
      ? game.i18n.format("FWC.WaitingTurn", { count: notActed })
      : localize("FWC.AllTurnsDone", "В этом обмене вы уже походили");
  } else {
    status = game.user.isGM
      ? (current ? game.i18n.format("FWC.GmCurrentTurn", { name: current.name ?? current.actor?.name ?? "" }) : localize("FWC.NoCurrentTurn", "Текущий ход не назначен"))
      : localize("FWC.NotInConflict", "Ваш персонаж не участвует в текущем конфликте");
  }

  return {
    active: true,
    combatId: combat.id,
    round: combat.round ?? 0,
    started,
    name: String(combat.getFlag(SYSTEM_ID, "name") ?? "").trim() || combat.scene?.name || localize("FCT.DefaultConflictName", "Конфликт"),
    status,
    current: Boolean(myCurrent),
    currentName: myCurrent?.name ?? myCurrent?.actor?.name ?? "",
    acted,
    canFinish,
    pendingDamage,
    hasPendingDamage: Boolean(pendingDamage),
    pendingMessageId: pendingDamage?.messageId ?? null,
    pendingRows,
    pendingCount: pendingRows.length,
    hasAnyPendingDamage: pendingRows.length > 0,
    unactedCount,
    allActed,
    exchangeReady,
    needsTurnAssignment,
    currentNeedsGm,
    needsAttention: game.user.isGM
      ? Boolean(pendingRows.length || currentNeedsGm || exchangeReady || needsTurnAssignment)
      : Boolean((myCurrent && !acted) || pendingDamage),
    ownedCount: myRows.length
  };
}

async function gmDashboardContext() {
  if (!game.user.isGM) return { active: false };
  const api = game.modules.get(MODULE_ID)?.api;
  const scene = game.scenes?.viewed ?? canvas?.scene ?? null;
  const sceneAspectsRaw = scene ? foundry.utils.duplicate(scene.getFlag(SYSTEM_ID, "situation_aspects") ?? []) : [];
  const sceneAspects = (Array.isArray(sceneAspectsRaw) ? sceneAspectsRaw : [])
    .filter(row => String(row?.name || "").trim())
    .map((row, index) => ({
      index,
      name: String(row.name),
      freeInvokes: Math.max(0, Number.parseInt(row.free_invokes, 10) || 0)
    }));

  const actors = [];
  const seen = new Set();
  for (const token of scene?.tokens?.contents ?? []) {
    const actor = token?.actor;
    if (!actor || seen.has(actor.uuid)) continue;
    seen.add(actor.uuid);
    actors.push(actor);
  }
  const boosts = [];
  for (const actor of actors) {
    let rows = [];
    try { rows = await api?.getBoosts?.(actor.uuid) ?? []; } catch (_) {}
    for (const boost of rows) {
      boosts.push({
        actorUuid: actor.uuid,
        actorName: actor.name,
        name: String(boost?.name || localize("FAW.Boost", "Усиление")),
        hidden: boost?.hidden === true
      });
    }
  }
  const fatePoints = Math.max(0, Number.parseInt(game.user.getFlag(SYSTEM_ID, "gmfatepoints"), 10) || 0);
  return {
    active: true,
    sceneId: scene?.id ?? null,
    sceneName: scene?.name ?? "",
    fatePoints,
    campaignMode: Boolean(globalThis.FateToolkitWill?.enabled?.()),
    sceneAspects,
    aspectCount: sceneAspects.length,
    boosts,
    boostCount: boosts.length
  };
}

function actionableCount(context) {
  let count = 0;
  if (context.actionProcess?.needsAttention) count += Math.max(1, context.actionProcess.oppositionCount || 1);
  if (context.requests?.has) count += context.requests.gm ? Math.max(0, context.requests.pending) : context.requests.count;
  if (context.milestone?.active) {
    if (context.milestone.gm) count += Math.max(0, context.milestone.pending || 0);
    else if (!context.milestone.completed) count += Math.max(1, context.milestone.count || 1);
  }
  if (context.combat?.active) {
    if (context.combat.hasAnyPendingDamage) count += context.combat.pendingCount;
    if (game.user.isGM) {
      if (context.combat.currentNeedsGm && !context.combat.hasPendingDamage) count += 1;
      if (context.combat.exchangeReady) count += 1;
      if (context.combat.needsTurnAssignment) count += 1;
    } else if (context.combat.current && !context.combat.acted && !context.combat.hasPendingDamage) count += 1;
  }
  return count;
}

function shouldAutoOpen(context) {
  if (!game.settings.get(MODULE_ID, "workflowCenterAutoOpen")) return false;
  if (game.user.isGM) return false;
  return actionableCount(context) > 0;
}

class FateWorkflowCenter extends AppV2 {
  static DEFAULT_OPTIONS = {
    id: "faw-workflow-center",
    classes: ["fate", "fwc-window"],
    window: {
      title: "FWC.Title",
      icon: "fa-solid fa-list-check",
      resizable: true,
      minimizable: false
    },
    position: { width: 460, height: "auto" }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/workflow-center.hbs`, scrollable: [".fwc-body"] }
  };

  async _prepareContext() {
    const combat = combatContext();
    const requests = requestContext();
    const milestone = milestoneContext();
    const actionProcess = actionProcessContext();
    const gmDashboard = await gmDashboardContext();
    const gmFocus = game.user.isGM && game.settings.get(MODULE_ID, "workflowCenterGmFocus");
    const context = { combat, requests, milestone, actionProcess, gmDashboard, isGM: game.user.isGM, gmFocus };
    context.actionable = actionableCount(context);
    context.showActionProcess = actionProcess.active && (!gmFocus || actionProcess.needsAttention);
    context.showCombat = combat.active && (!gmFocus || combat.needsAttention);
    context.showRequests = !gmFocus || (requests.has && requests.pending > 0);
    context.showMilestone = milestone.active && (!gmFocus || (milestone.gm ? milestone.pending > 0 : !milestone.completed));
    context.showGmDashboard = gmDashboard.active && !gmFocus;
    context.empty = !context.showActionProcess && !context.showCombat && !context.showRequests && !context.showMilestone && !context.showGmDashboard;
    return context;
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const api = game.modules.get(MODULE_ID)?.api;
    this.element.querySelector("[data-fwc-action='toggle-gm-focus']")?.addEventListener("click", async () => {
      if (!game.user.isGM) return;
      await game.settings.set(MODULE_ID, "workflowCenterGmFocus", !game.settings.get(MODULE_ID, "workflowCenterGmFocus"));
      await this.render({ force: true });
    });
    this.element.querySelector("[data-fwc-action='gm-fp-dec']")?.addEventListener("click", async () => {
      if (!game.user.isGM) return;
      const current = Math.max(0, Number.parseInt(game.user.getFlag(SYSTEM_ID, "gmfatepoints"), 10) || 0);
      await game.user.setFlag(SYSTEM_ID, "gmfatepoints", Math.max(0, current - 1));
      await this.render({ force: true });
    });
    this.element.querySelector("[data-fwc-action='gm-fp-inc']")?.addEventListener("click", async () => {
      if (!game.user.isGM) return;
      const current = Math.max(0, Number.parseInt(game.user.getFlag(SYSTEM_ID, "gmfatepoints"), 10) || 0);
      await game.user.setFlag(SYSTEM_ID, "gmfatepoints", current + 1);
      await this.render({ force: true });
    });
    this.element.querySelector("[data-fwc-action='aspects']")?.addEventListener("click", () => api?.open?.());
    this.element.querySelector("[data-fwc-action='combat']")?.addEventListener("click", () => api?.openCombatTracker?.());
    this.element.querySelector("[data-fwc-action='requests']")?.addEventListener("click", () => game.user.isGM ? api?.openRollRequests?.() : api?.openPlayerRequests?.());
    this.element.querySelector("[data-fwc-action='milestone']")?.addEventListener("click", () => game.user.isGM ? api?.openMilestoneManager?.() : api?.openAssignedMilestones?.());
    this.element.querySelector("[data-fwc-action='action']")?.addEventListener("click", () => api?.openActionWidget?.());
    this.element.querySelector("[data-fwc-action='resume-opposition']")?.addEventListener("click", () => api?.resumeOppositionQueue?.());
    this.element.querySelector("[data-fwc-action='damage']")?.addEventListener("click", () => {
      const messageId = context.combat?.pendingMessageId ?? context.combat?.pendingRows?.[0]?.messageId;
      if (messageId) api?.focusChatMessage?.(messageId);
    });
    this.element.querySelectorAll("[data-fwc-damage-message]").forEach(button => {
      button.addEventListener("click", () => api?.focusChatMessage?.(button.dataset.fwcDamageMessage));
    });
    this.element.querySelector("[data-fwc-action='next-exchange']")?.addEventListener("click", async event => {
      const button = event.currentTarget;
      button.disabled = true;
      const ok = await api?.requestNextExchange?.();
      if (!ok) button.disabled = false;
    });
    this.element.querySelector("[data-fwc-action='resume-turn']")?.addEventListener("click", async event => {
      const button = event.currentTarget;
      button.disabled = true;
      const ok = await api?.resumeConflictTurn?.();
      if (!ok) button.disabled = false;
    });
    this.element.querySelector("[data-fwc-action='finish-turn']")?.addEventListener("click", async event => {
      const button = event.currentTarget;
      button.disabled = true;
      const combat = currentCombat();
      const actorUuid = combat?.combatant?.actor?.uuid;
      const ok = actorUuid ? await api?.finishCurrentTurnForActor?.(actorUuid) : false;
      if (!ok) button.disabled = false;
    });
  }
}

function ensureApp() {
  workflowCenter ??= new FateWorkflowCenter();
  return workflowCenter;
}

async function openWorkflowCenter() {
  const app = ensureApp();
  if (app.rendered) {
    await app.render({ force: true });
    app.bringToFront?.();
    return;
  }
  await app.render({ force: true });
}

function refreshWorkflowCenter({ allowAutoOpen = false } = {}) {
  if (renderQueued) return;
  renderQueued = true;
  queueMicrotask(async () => {
    renderQueued = false;
    const app = ensureApp();
    // A rendered Application prepares its own context during render. Do not build
    // the expensive GM dashboard twice for the same hook burst.
    if (app.rendered) {
      void app.render({ force: true });
      return;
    }
    if (!allowAutoOpen) return;
    let context = null;
    try { context = await app._prepareContext({}); } catch (_) {}
    if (context && shouldAutoOpen(context)) {
      if (autoOpenDebounce) clearTimeout(autoOpenDebounce);
      autoOpenDebounce = setTimeout(() => {
        autoOpenDebounce = null;
        void openWorkflowCenter();
      }, 120);
    }
  });
}

function workflowActorRelevant(actor) {
  if (!actor) return false;
  const combat = currentCombat();
  if ((combat?.combatants?.contents ?? Array.from(combat?.combatants ?? [])).some(row => row.actor?.uuid === actor.uuid || row.actor?.id === actor.id)) return true;
  const scene = game.scenes?.viewed ?? canvas?.scene ?? null;
  if ((scene?.tokens?.contents ?? []).some(token => token.actor?.uuid === actor.uuid || token.actor?.id === actor.id)) return true;
  const session = milestoneSession();
  return Boolean(session?.actors?.[actor.id] || session?.actors?.[actor.uuid]);
}

function workflowSceneRelevant(scene) {
  const current = game.scenes?.viewed ?? canvas?.scene ?? null;
  return !scene || !current || scene.id === current.id;
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "workflowCenterAutoOpen", {
    name: "FWC.AutoOpenName",
    hint: "FWC.AutoOpenHint",
    scope: "client",
    config: true,
    type: Boolean,
    default: false
  });
  game.settings.register(MODULE_ID, "workflowCenterGmFocus", {
    name: "FWC.GmFocusName",
    hint: "FWC.GmFocusHint",
    scope: "client",
    config: true,
    type: Boolean,
    default: false
  });
});

Hooks.once("ready", () => {
  if (game.system?.id !== SYSTEM_ID) return;
  ensureApp();
  const module = game.modules.get(MODULE_ID);
  module.api ??= {};
  Object.assign(module.api, {
    openWorkflowCenter,
    refreshWorkflowCenter: options => refreshWorkflowCenter(options)
  });
  refreshWorkflowCenter({ allowAutoOpen: true });
});

Hooks.on("getSceneControlButtons", controls => {
  if (game.system?.id !== SYSTEM_ID) return;
  const tokenControls = controls?.tokens;
  if (!tokenControls?.tools) return;
  tokenControls.tools.fateWorkflowCenter = {
    name: "fateWorkflowCenter",
    title: "FWC.ControlTitle",
    icon: "fa-solid fa-list-check",
    order: Object.keys(tokenControls.tools).length + 40,
    button: true,
    visible: true,
    onChange: () => void openWorkflowCenter()
  };
});

for (const hook of ["createCombat", "updateCombat", "deleteCombat", "createCombatant", "updateCombatant", "deleteCombatant"]) {
  Hooks.on(hook, () => refreshWorkflowCenter({ allowAutoOpen: true }));
}
Hooks.on("updateActor", actor => { if (workflowActorRelevant(actor)) refreshWorkflowCenter({ allowAutoOpen: true }); });
Hooks.on("updateUser", user => { if (user?.id === game.user.id || game.user.isGM) refreshWorkflowCenter({ allowAutoOpen: true }); });
Hooks.on("updateScene", scene => { if (workflowSceneRelevant(scene)) refreshWorkflowCenter({ allowAutoOpen: true }); });
for (const hook of ["createChatMessage", "updateChatMessage", "deleteChatMessage"]) {
  Hooks.on(hook, message => { if (message?.flags?.[MODULE_ID]) refreshWorkflowCenter({ allowAutoOpen: true }); });
}
Hooks.on("updateSetting", setting => {
  const key = String(setting?.key ?? setting?.id ?? "");
  if (key.includes(`${MODULE_ID}.${MILESTONE_SETTING}`) || key.includes(`${MODULE_ID}.workflowCenterGmFocus`) || key.includes(`${MODULE_ID}.workflowCenterAutoOpen`) || key.includes(`${SYSTEM_ID}.gameAspects`)) {
    refreshWorkflowCenter({ allowAutoOpen: true });
  }
});
Hooks.on("canvasReady", () => refreshWorkflowCenter());
