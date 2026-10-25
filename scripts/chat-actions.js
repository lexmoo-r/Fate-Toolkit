const MODULE_ID = "fate-aspect-widget";
const SYSTEM_ID = "fate-core-official";
const SOCKET = `module.${MODULE_ID}`;

const invokeLocks = new Set();
const damageLocks = new Set();
const invokeSourceCache = new Map();
const hashCache = new Map();

function chatRpc() { return globalThis.FateToolkitRPC; }
async function chatRpcToGM(payload) { return chatRpc().executeAsGM("chat", payload); }

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

function int(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clone(value) {
  return foundry.utils.duplicate(value);
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

function rootElement(html) {
  return html instanceof HTMLElement ? html : html?.[0] ?? null;
}

function fateNotify() {
  try { game.socket.emit("system.fate-core-official", { render: true }); } catch (_) {}
  try { game.modules.get(MODULE_ID)?.api?.refresh?.(); } catch (_) {}
}

function tr(key, fallback, data = {}) {
  try {
    const hasData = data && Object.keys(data).length > 0;
    const value = hasData ? game.i18n?.format?.(key, data) : game.i18n?.localize?.(key);
    if (value && value !== key) return String(value);
  } catch (_) {}
  let value = String(fallback ?? key);
  for (const [name, replacement] of Object.entries(data ?? {})) value = value.replaceAll(`{${name}}`, String(replacement));
  return value;
}

function displaySystemTerm(value, fallback = "") {
  const raw = String(value ?? fallback ?? "");
  return globalThis.FateToolkitI18n?.term?.(raw) || raw;
}

function localizeNativeFcoRollUi(message, html) {
  if (!message?.flags?.[MODULE_ID]) return;
  const root = rootElement(html);
  if (!root) return;
  root.classList.add("faw-owned-roll-message");

  const titleByAction = {
    plus1: tr("FRR.Native.PlusOne"),
    plus2free: tr("FRR.Native.FreePlusTwo"),
    reroll: tr("FRR.Native.FreeReroll"),
    manual: tr("FRR.Native.Manual"),
    plus2fp: tr("FRR.Native.PaidPlusTwo"),
    rerollfp: tr("FRR.Native.PaidReroll"),
    manualfp: tr("FRR.Native.PaidManual")
  };
  const rows = new Set();
  root.querySelectorAll('button[name="fco_chat_roll_button"]').forEach(button => {
    const raw = String(button.dataset.roll || "");
    const action = raw.split("_").pop() || "";
    if (titleByAction[action]) {
      button.title = titleByAction[action];
      button.setAttribute("aria-label", titleByAction[action]);
    }
    const row = button.closest("tr") || button.parentElement;
    if (row) rows.add(row);
  });

  for (const row of rows) {
    row.classList?.add("faw-native-roll-actions");
    const buttons = [...row.querySelectorAll?.('button[name="fco_chat_roll_button"]') ?? []];
    const paid = buttons.some(button => /(?:plus2fp|rerollfp|manualfp)$/.test(String(button.dataset.roll || "")));
    const label = [...(row.querySelectorAll?.("div") ?? [])].find(el => !el.querySelector("button") && String(el.textContent || "").trim());
    if (label) {
      const desired = paid ? tr("FRR.Native.FatePoint") : tr("FRR.Native.Free");
      if (String(label.textContent || "").trim() !== desired) label.textContent = desired;
    }
  }

  root.querySelectorAll(".dice-total").forEach(total => {
    const text = String(total.textContent || "").trim();
    const match = text.match(/^(.*)\(([^()]*)\)\s*$/);
    if (!match) return;
    const translated = globalThis.FateToolkitI18n?.rank?.(match[2].trim()) || match[2].trim();
    if (translated !== match[2].trim()) total.textContent = `${match[1]}(${translated})`;
  });
}

function userMayControlActor(user, actor) {
  if (!user || !actor) return false;
  if (user.isGM) return true;
  try { return actor.testUserPermission(user, "OWNER"); } catch (_) { return false; }
}

function permissionApi() {
  return globalThis.FateToolkitPermissions ?? null;
}

function primaryGmExecutor() {
  const api = permissionApi();
  if (api?.isPrimaryGM) return api.isPrimaryGM(game.user);
  if (!game.user?.isGM || !game.user?.active) return false;
  return game.users?.activeGM?.id === game.user.id;
}

async function textHash(text) {
  const input = String(text ?? "");
  if (hashCache.has(input)) return hashCache.get(input);
  let digest;
  try {
    const bytes = new TextEncoder().encode(input);
    const buffer = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    digest = Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, "0")).join("");
  } catch (_) {
    let hash = 2166136261;
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    digest = `fallback-${(hash >>> 0).toString(16).padStart(8, "0")}`;
  }
  hashCache.set(input, digest);
  return digest;
}

async function aspectSignatures(aspects) {
  const counts = new Map();
  const signatures = [];
  for (const aspect of aspects ?? []) {
    const hash = await textHash(aspect?.name ?? "");
    const ordinal = counts.get(hash) ?? 0;
    counts.set(hash, ordinal + 1);
    signatures.push(`${hash}:${ordinal}`);
  }
  return signatures;
}

function moduleVisibility() {
  try {
    const raw = clone(game.settings.get(MODULE_ID, "visibility"));
    return {
      global: Array.isArray(raw?.global) ? raw.global : [],
      scenes: raw?.scenes && typeof raw.scenes === "object" ? raw.scenes : {},
      actors: raw?.actors && typeof raw.actors === "object" ? raw.actors : {}
    };
  } catch (_) {
    return { global: [], scenes: {}, actors: {} };
  }
}

function travellingSignatures() {
  try {
    const raw = clone(game.settings.get(MODULE_ID, "travellingAspects"));
    return Array.isArray(raw) ? raw : [];
  } catch (_) {
    return [];
  }
}

function trackHasAspect(track) {
  const aspect = track?.aspect;
  return Boolean(aspect && typeof aspect === "object" && (aspect.when_marked || aspect.as_name));
}

function trackMarked(track) {
  const boxes = Array.isArray(track?.box_values) ? track.box_values : [];
  if (boxes.length) return boxes.some(Boolean);
  if (track?.aspect?.when_marked) return Boolean(String(track.aspect.name ?? "").trim());
  return false;
}

function consequenceName(track) {
  if (!trackHasAspect(track) || !trackMarked(track)) return "";
  if (track.aspect?.when_marked) return String(track.aspect.name ?? "").trim();
  if (track.aspect?.as_name) return displaySystemTerm(track.name, "").trim();
  return "";
}

function privateOppositionActorUuid(message) {
  if (!game.user?.isGM) return null;
  try {
    return game.modules.get(MODULE_ID)?.api?.getPrivateOppositionActorUuid?.(message) ?? null;
  } catch (_) {
    return null;
  }
}

function currentRollActorUuid(message) {
  const flags = message.flags?.[MODULE_ID] ?? {};
  if (flags.actionOppositionFor) return flags.oppositionActorUuid ?? privateOppositionActorUuid(message) ?? null;
  return flags.actorUuid ?? null;
}


function invocationLockedByDamage(message) {
  const flags = message.flags?.[MODULE_ID] ?? {};
  const state = flags.damageResolution;
  return Boolean(flags.contextResultApplied) || state?.status === "taken-out" || (Array.isArray(state?.selections) && state.selections.length > 0);
}

async function collectActorInvokeSources(actor, { viewer, prefix = "actor" } = {}) {
  if (!actor || actor.type !== SYSTEM_ID) return [];
  const rows = [];
  const visibility = moduleVisibility();
  const hidden = new Set(visibility.actors?.[actor.uuid] ?? []);
  for (const [key, aspect] of Object.entries(actor.system?.aspects ?? {})) {
    if (!viewer?.isGM && hidden.has(key)) continue;
    const name = String(aspect?.value || aspect?.name || "").trim();
    if (!name) continue;
    rows.push({
      id: `${prefix}:aspect:${actor.uuid}:${key}`,
      kind: "actor-aspect",
      filterGroup: prefix === "target" ? "target" : "mine",
      actorUuid: actor.uuid,
      key,
      name,
      scope: actor.name,
      freeUses: 0,
      paidAllowed: true
    });
  }
  for (const [key, track] of Object.entries(actor.system?.tracks ?? {})) {
    if (!trackHasAspect(track) || !trackMarked(track)) continue;
    if (!viewer?.isGM && hidden.has(`track:${key}`)) continue;
    const name = consequenceName(track);
    if (!name) continue;
    rows.push({
      id: `${prefix}:consequence:${actor.uuid}:${key}`,
      kind: "consequence",
      filterGroup: "consequences",
      actorUuid: actor.uuid,
      key,
      name,
      scope: `${actor.name} · ${displaySystemTerm(track.name, tr("FRR.Chat.Consequence"))}`,
      freeUses: 0,
      paidAllowed: true
    });
  }
  return rows;
}

async function collectEnvironmentalInvokeSources(viewer) {
  const rows = [];
  const visibility = moduleVisibility();
  let globalAspects = [];
  try { globalAspects = clone(game.settings.get(SYSTEM_ID, "gameAspects")) ?? []; } catch (_) {}
  if (!Array.isArray(globalAspects)) globalAspects = [];
  const globalSigs = await aspectSignatures(globalAspects);
  const hiddenGlobal = new Set(visibility.global ?? []);
  const travelling = new Set(travellingSignatures());
  globalAspects.forEach((aspect, index) => {
    if (!aspect?.name) return;
    if (!viewer?.isGM && hiddenGlobal.has(globalSigs[index])) return;
    rows.push({
      id: `global:${index}:${globalSigs[index]}`,
      kind: "global",
      filterGroup: "game",
      index,
      signature: globalSigs[index],
      name: String(aspect.name),
      scope: travelling.has(globalSigs[index]) ? tr("FRR.Chat.ScopeTravelling") : tr("FRR.Chat.ScopeGame"),
      freeUses: Math.max(0, int(aspect.free_invokes)),
      paidAllowed: true
    });
  });

  const scene = game.scenes?.viewed ?? canvas?.scene ?? null;
  let sceneAspects = scene ? clone(scene.getFlag(SYSTEM_ID, "situation_aspects")) : [];
  if (!Array.isArray(sceneAspects)) sceneAspects = [];
  const sceneSigs = await aspectSignatures(sceneAspects);
  const hiddenScene = new Set(visibility.scenes?.[scene?.id] ?? []);
  sceneAspects.forEach((aspect, index) => {
    if (!aspect?.name) return;
    if (!viewer?.isGM && hiddenScene.has(sceneSigs[index])) return;
    rows.push({
      id: `scene:${scene?.id ?? ""}:${index}:${sceneSigs[index]}`,
      kind: "scene",
      filterGroup: "scene",
      sceneId: scene?.id ?? null,
      index,
      signature: sceneSigs[index],
      name: String(aspect.name),
      scope: scene?.name ? tr("FRR.Chat.ScopeSceneNamed", null, { name: scene.name }) : tr("FRR.Chat.ScopeScene"),
      freeUses: Math.max(0, int(aspect.free_invokes)),
      paidAllowed: true
    });
  });
  return rows;
}

async function collectInvokeSources(message, { viewerUserId = game.user.id } = {}) {
  const viewer = game.users.get(viewerUserId) ?? game.user;
  const flags = message.flags?.[MODULE_ID] ?? {};
  const rollActor = await actorFromUuid(currentRollActorUuid(message));
  if (!rollActor) return [];

  const rows = [];
  rows.push(...await collectActorInvokeSources(rollActor, { viewer, prefix: "roller" }));

  // Named boosts belong to the rolling character. They are free, one-use invokes.
  const api = game.modules.get(MODULE_ID)?.api;
  try {
    const boosts = await api?.getBoosts?.(rollActor.uuid) ?? [];
    for (const boost of boosts) {
      if (!viewer?.isGM && boost.hidden) continue;
      rows.push({
        id: `boost:${rollActor.uuid}:${boost.id}`,
        kind: "boost",
        filterGroup: "boosts",
        actorUuid: rollActor.uuid,
        boostId: boost.id,
        name: String(boost.name || tr("FRR.Chat.Boost")),
        scope: tr("FRR.Chat.ScopeBoostNamed", null, { name: rollActor.name }),
        freeUses: 1,
        paidAllowed: false
      });
    }
  } catch (_) {}

  // The opposed/target character's visible aspects and consequences can be invoked when relevant.
  const otherUuid = flags.actionOppositionFor
    ? (flags.oppositionAgainstActorUuid || null)
    : (flags.actionTarget?.actorUuid || flags.oppositionActorUuid || privateOppositionActorUuid(message) || null);
  if (otherUuid && otherUuid !== rollActor.uuid) {
    const other = await actorFromUuid(otherUuid);
    rows.push(...await collectActorInvokeSources(other, { viewer, prefix: "target" }));
  }

  rows.push(...await collectEnvironmentalInvokeSources(viewer));

  if (!flags.actionOppositionFor && flags.actionTarget?.type === "marker" && flags.actionTarget?.markerId) {
    const marker = api?.getMarker?.(flags.actionTarget.markerId);
    if (marker && (viewer?.isGM || !marker.hidden)) {
      rows.push({
        id: `marker:${marker.id}`,
        kind: "marker",
        filterGroup: "scene",
        markerId: marker.id,
        name: String(marker.text || tr("FRR.Chat.Aspect")),
        scope: tr("FRR.Chat.ScopeMarker"),
        freeUses: 0,
        paidAllowed: true
      });
    }
  }

  return rows.sort((a, b) => {
    const free = n(b.freeUses) - n(a.freeUses);
    if (free) return free;
    return `${a.scope} ${a.name}`.localeCompare(`${b.scope} ${b.name}`, game.i18n.lang);
  });
}

function invokeSourceRowHtml(source, { fatePoints = 0 } = {}) {
  const freeUses = Math.max(0, n(source?.freeUses));
  const paidAllowed = Boolean(source?.paidAllowed);
  const canPay = paidAllowed && int(fatePoints) > 0;
  const name = String(source?.name || tr("FRR.Chat.Aspect"));
  const scope = String(source?.scope || "");
  const search = `${name} ${scope}`.trim().toLocaleLowerCase(game.i18n?.lang || undefined);
  const freeBadge = freeUses > 0
    ? `<span class="frr-mini-badge is-free" title="${esc(tr("FRR.Chat.FreeInvokes", null, { count: freeUses }))}">${esc(tr("FRR.Chat.FreeShort"))} ${freeUses}</span>`
    : "";
  const paidBadge = paidAllowed
    ? `<span class="frr-mini-badge" title="${esc(tr("FRR.Chat.PaidInvokeHint"))}">1 ЖС</span>`
    : "";
  const buttons = [];
  if (freeUses > 0) {
    buttons.push(`<button type="button" data-invoke-mode="plus2" data-use-free="true" aria-label="${esc(tr("FRR.Chat.InvokePlus2FreeAria", null, { name }))}"><b>+2</b><small>${esc(tr("FRR.Chat.FreeShort"))}</small></button>`);
    buttons.push(`<button type="button" data-invoke-mode="reroll" data-use-free="true" aria-label="${esc(tr("FRR.Chat.InvokeRerollFreeAria", null, { name }))}"><i class="fa-solid fa-dice" aria-hidden="true"></i><small>${esc(tr("FRR.Chat.Reroll"))}</small></button>`);
  }
  if (paidAllowed) {
    const disabled = canPay ? "" : " disabled";
    const title = canPay ? "" : ` title="${esc(tr("FRR.Chat.NoFatePoints"))}"`;
    buttons.push(`<button type="button" data-invoke-mode="plus2" data-use-free="false"${disabled}${title} aria-label="${esc(tr("FRR.Chat.InvokePlus2PaidAria", null, { name }))}"><b>+2</b><small>1 ЖС</small></button>`);
    buttons.push(`<button type="button" data-invoke-mode="reroll" data-use-free="false"${disabled}${title} aria-label="${esc(tr("FRR.Chat.InvokeRerollPaidAria", null, { name }))}"><i class="fa-solid fa-dice" aria-hidden="true"></i><small>${esc(tr("FRR.Chat.Reroll"))}</small></button>`);
  }
  return `<div class="frr-invoke-row" role="listitem" data-invoke-row data-source-id="${esc(source?.id)}" data-filter-group="${esc(source?.filterGroup || "mine")}" data-search="${esc(search)}">
    <div class="frr-invoke-name"><strong>${esc(name)}</strong>${scope ? `<span>${esc(scope)}</span>` : ""}</div>
    <div class="frr-invoke-badges" aria-label="${esc(tr("FRR.Chat.InvokeResources"))}">${freeBadge}${paidBadge}</div>
    <div class="frr-invoke-buttons">${buttons.join("")}</div>
  </div>`;
}

function invokeAuditLine(source, mode, useFree) {
  const safe = String(source.name || tr("FRR.Chat.Aspect")).replace(/[()<>]/g, "").trim() || tr("FRR.Chat.Aspect");
  if (mode === "reroll") return `${useFree ? "FAW_REROLL_FREE" : "FAW_REROLL_PAID"} (${safe})`;
  return `${useFree ? "FAW_INVOKE_FREE" : "FAW_INVOKE_PAID"} +2 (${safe})`;
}

function appendAuditFlavor(flavor, line) {
  const source = String(flavor ?? "");
  return `${source}<br><span class="frr-system-audit" hidden>${esc(line)}</span>`;
}

function currentMathForMessage(message) {
  const flags = message.flags?.[MODULE_ID] ?? {};
  return flags.actionOppositionFor ? flags.oppositionMath : flags.currentMath;
}

function rerollFormulaBase(message) {
  // The actual current Roll is authoritative. currentMath can lag behind after
  // invokes/manual revisions; using it caused rerolls to carry stale modifiers.
  const roll = message.rolls?.[0];
  const dice = (roll?.dice ?? []).flatMap(die =>
    Array.isArray(die?.results) ? die.results.map(result => n(result?.result)) : Array.from(die?.values ?? []).map(n)
  );
  if (roll && Number.isFinite(Number(roll.total))) {
    return n(roll.total) - dice.reduce((sum, value) => sum + value, 0);
  }
  const math = currentMathForMessage(message);
  return n(math?.total) - n(math?.diceTotal);
}

function serializeAdjustedRoll(roll, total) {
  const data = clone(roll);
  data.total = Number(total);
  if (Object.prototype.hasOwnProperty.call(data, "_total")) data._total = Number(total);
  return data;
}

async function buildRerolledRoll(message) {
  const base = rerollFormulaBase(message);
  const formula = base === 0 ? "4dF" : base > 0 ? `4dF + ${base}` : `4dF - ${Math.abs(base)}`;
  const roll = await (new Roll(formula)).roll();
  if (roll.dice?.[0]) roll.dice[0].options.sfx = { id: "fate4df", result: roll.result };
  roll.options.fco_formula = "4dF";
  return clone(roll);
}

async function locateInvokeSource(message, sourceId, viewerUserId) {
  const sources = await collectInvokeSources(message, { viewerUserId });
  return sources.find(source => source.id === sourceId) ?? null;
}

const invokeResource = globalThis.FateToolkitInvokeResource.create({
  actorFromUuid,
  currentRollActorUuid,
  intValue: int,
  numberValue: n,
  clone,
  getGameAspects: () => game.settings.get(SYSTEM_ID, "gameAspects"),
  setGameAspects: value => game.settings.set(SYSTEM_ID, "gameAspects", value),
  getScene: sceneId => game.scenes.get(sceneId),
  getViewedScene: () => game.scenes?.viewed ?? canvas?.scene ?? null,
  removeBoost: async (actorUuid, boostId) => game.modules.get(MODULE_ID)?.api?.removeBoost?.(actorUuid, boostId),
  addBoost: async (actorUuid, name) => game.modules.get(MODULE_ID)?.api?.addBoost?.(actorUuid, name),
  systemId: SYSTEM_ID
});

async function refreshInvokeMathState(message, { roll: nextRoll = null, flavor: nextFlavor = null } = {}) {
  const flags = message.flags?.[MODULE_ID] ?? {};
  const opposition = Boolean(flags.actionOppositionFor);
  const mathKey = opposition ? "oppositionMath" : "currentMath";
  const historyKey = opposition ? "oppositionHistory" : "rollHistory";
  const previous = flags[mathKey] ?? null;
  const skillName = opposition ? flags.oppositionSkillName : flags.skillName;
  const skillRank = opposition ? flags.oppositionSkillRank : flags.skillRank;
  const stunts = Array.isArray(flags.stunts) ? flags.stunts : [];
  const stuntBonus = n(flags.stuntBonus);
  const roll = nextRoll ?? message.rolls?.[0];
  if (!roll) return;
  const presentation = globalThis.FateToolkitRollPresentation;
  const math = presentation.snapshotRollMath(roll, {
    skillName,
    skillRank,
    stunts,
    stuntBonus,
    previousSnapshot: previous,
    previousSources: previous?.modifierSources ?? [],
    flavor: nextFlavor ?? message.flavor ?? ""
  });
  const history = presentation.appendMathHistory(flags[historyKey] ?? [], math);
  const patch = {
    [`flags.${MODULE_ID}.${mathKey}`]: math,
    [`flags.${MODULE_ID}.${historyKey}`]: history
  };
  if (!opposition) patch[`flags.${MODULE_ID}.modifierSources`] = math.modifierSources ?? [];
  await message.update(patch);
}

const invokeResolution = globalThis.FateToolkitInvokeResolution.create({
  getMessage: messageId => game.messages.get(messageId),
  getUser: userId => game.users.get(userId),
  actorFromUuid,
  currentRollActorUuid,
  canUserControlActor: userMayControlActor,
  invocationLockedByDamage,
  getActorCombatState: actorUuid => game.modules.get(MODULE_ID)?.api?.getActorCombatState?.(actorUuid) ?? null,
  locateInvokeSource,
  consumeResource: (message, source, useFree) => invokeResource.consume(message, source, useFree),
  buildRerolledRoll,
  serializeAdjustedRoll,
  currentRollTotal: message => n(message.rolls?.[0]?.total),
  appendAuditFlavor,
  invokeAuditLine,
  updateMessage: (message, patch) => message.update(patch),
  refreshMathState: (message, state) => refreshInvokeMathState(message, state),
  appendAudit: (message, row) => game.modules.get(MODULE_ID)?.api?.appendMessageAudit?.(message, row),
  notify: fateNotify,
  moduleId: MODULE_ID
});

async function applyInvokeOnGm(payload) {
  if (!primaryGmExecutor() || !payload?.messageId || !payload?.sourceId) return;
  if (invokeLocks.has(payload.messageId)) return;
  invokeLocks.add(payload.messageId);
  try {
    const checked = await invokeResolution.prepare(payload);
    if (!checked?.ok) throw new Error(checked?.message || "Не удалось применить призыв аспекта.");
    const committed = await invokeResolution.commit(checked);
    if (!committed?.ok) throw new Error(committed?.message || "Не удалось применить призыв аспекта.");
  } catch (error) {
    globalThis.FateToolkitUX.error(error?.message || "Не удалось применить призыв аспекта.");
  } finally {
    invokeLocks.delete(payload.messageId);
  }
}

async function injectInvokePanel(message, html) {
  const root = rootElement(html);
  if (!root) return;
  root.querySelectorAll(".frr-invoke-panel").forEach(el => el.remove());
  const flags = message.flags?.[MODULE_ID] ?? {};
  if (!(flags.resolved || flags.actionOppositionFor) || !message.rolls?.length) return;

  const actor = await actorFromUuid(currentRollActorUuid(message));
  const allowed = game.user.isGM || userMayControlActor(game.user, actor);
  if (!allowed) return;

  const card = root.querySelector(".frr-chat-result");
  if (!card) return;

  const panel = document.createElement("section");
  panel.className = "frr-invoke-panel is-collapsed";
  panel.setAttribute("aria-label", tr("FRR.Chat.InvokeTitle"));
  const combatState = !flags.actionOppositionFor ? game.modules.get(MODULE_ID)?.api?.getActorCombatState?.(actor?.uuid) : null;
  const lockedMarkup = (icon, note) => `<div class="frr-chat-tool-heading"><span><i class="fa-solid ${icon}" aria-hidden="true"></i> ${esc(tr("FRR.Chat.InvokeTitle"))}</span></div><p class="frr-tool-note">${esc(note)}</p>`;
  if (combatState?.acted) {
    panel.classList.remove("is-collapsed");
    panel.innerHTML = lockedMarkup("fa-lock", tr("FRR.Chat.InvokeLockedTurn"));
    card.append(panel);
    return;
  }
  if (flags.contextResultApplied) {
    panel.classList.remove("is-collapsed");
    panel.innerHTML = lockedMarkup("fa-lock", tr("FRR.Chat.InvokeLockedApplied"));
    card.append(panel);
    return;
  }
  if (invocationLockedByDamage(message)) {
    panel.classList.remove("is-collapsed");
    panel.innerHTML = lockedMarkup("fa-sparkles", tr("FRR.Chat.InvokeLockedDamage"));
    card.append(panel);
    return;
  }

  const fp = int(actor?.system?.details?.fatePoints?.current);
  const detailsId = `frr-invoke-details-${String(message.id).replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  panel.innerHTML = `<button type="button" class="frr-invoke-toggle" data-invoke-toggle aria-expanded="false" aria-controls="${esc(detailsId)}">
      <span><i class="fa-solid fa-sparkles" aria-hidden="true"></i> ${esc(tr("FRR.Chat.InvokeTitle"))}</span>
      <span class="frr-tool-resource" aria-label="${esc(tr("FRR.Chat.FatePointsAria", null, { count: fp }))}"><i class="fa-solid fa-circle" aria-hidden="true"></i> ${esc(tr("FCT.FatePointsShort"))} ${fp}</span>
    </button>
    <div id="${esc(detailsId)}" class="frr-invoke-details" data-invoke-details hidden></div>`;
  card.append(panel);

  const toggle = panel.querySelector("[data-invoke-toggle]");
  const details = panel.querySelector("[data-invoke-details]");
  let loaded = false;

  const buildInvokePicker = async () => {
    if (loaded || !details) return;
    loaded = true;
    toggle?.setAttribute("aria-busy", "true");
    const sources = await collectInvokeSources(message, { viewerUserId: game.user.id });
    const messageKey = message.id;
    for (const key of [...invokeSourceCache.keys()]) if (key.startsWith(`${messageKey}:`)) invokeSourceCache.delete(key);
    for (const source of sources) invokeSourceCache.set(`${messageKey}:${source.id}`, source);

    const groupLabels = {
      mine: tr("FRR.Chat.GroupMine"),
      target: tr("FRR.Chat.GroupTarget"),
      scene: tr("FRR.Chat.GroupScene"),
      game: tr("FRR.Chat.GroupGame"),
      boosts: tr("FRR.Chat.GroupBoosts"),
      consequences: tr("FRR.Chat.GroupConsequences")
    };
    const groupCounts = sources.reduce((map, source) => {
      const key = source.filterGroup || "mine";
      map[key] = (map[key] || 0) + 1;
      return map;
    }, {});
    const filterButtons = Object.entries(groupLabels)
      .filter(([key]) => groupCounts[key])
      .map(([key, label]) => `<button type="button" class="frr-invoke-filter is-active" data-invoke-filter="${key}" aria-pressed="true"><span>${esc(label)}</span><b>${groupCounts[key]}</b></button>`)
      .join("");
    const listId = `frr-invoke-list-${String(message.id).replace(/[^a-zA-Z0-9_-]/g, "-")}`;
    const searchId = `${listId}-search`;
    const countText = tr("FRR.Chat.VisibleCount", null, { visible: sources.length, total: sources.length });

    details.innerHTML = `<p class="frr-tool-note">${esc(tr("FRR.Chat.InvokeSourceHint"))}</p>
      <div class="frr-invoke-toolbar">
        ${filterButtons ? `<div class="frr-invoke-filters" role="group" aria-label="${esc(tr("FRR.Chat.InvokeFilters"))}">${filterButtons}</div>` : ""}
        <output class="frr-invoke-count" data-invoke-count aria-live="polite">${esc(countText)}</output>
      </div>
      ${sources.length > 5 ? `<label class="frr-invoke-search-wrap" for="${esc(searchId)}"><span class="sr-only">${esc(tr("FRR.Chat.InvokeSearch"))}</span><input id="${esc(searchId)}" class="frr-invoke-search" type="search" placeholder="${esc(tr("FRR.Chat.InvokeSearchPlaceholder"))}" autocomplete="off" aria-controls="${esc(listId)}"></label>` : ""}
      <div id="${esc(listId)}" class="frr-invoke-list" role="list">${sources.length ? sources.map(source => invokeSourceRowHtml(source, { fatePoints: fp })).join("") : `<div class="frr-empty-tool">${esc(tr("FRR.Chat.InvokeEmpty"))}</div>`}</div>
      <div class="frr-empty-tool frr-invoke-filter-empty" data-invoke-filter-empty hidden>${esc(tr("FRR.Chat.InvokeNoMatches"))}</div>`;

    const search = details.querySelector(".frr-invoke-search");
    const count = details.querySelector("[data-invoke-count]");
    const filteredEmpty = details.querySelector("[data-invoke-filter-empty]");
    const activeGroups = new Set(Object.keys(groupCounts));
    const applyInvokeFilters = () => {
      const q = String(search?.value || "").trim().toLocaleLowerCase(game.i18n?.lang || undefined);
      let visible = 0;
      details.querySelectorAll("[data-invoke-row]").forEach(row => {
        const group = String(row.dataset.filterGroup || "mine");
        const matchesGroup = activeGroups.has(group);
        const matchesSearch = !q || String(row.dataset.search || "").includes(q);
        row.hidden = !(matchesGroup && matchesSearch);
        if (!row.hidden) visible += 1;
      });
      if (count) count.textContent = tr("FRR.Chat.VisibleCount", null, { visible, total: sources.length });
      if (filteredEmpty) filteredEmpty.hidden = visible > 0 || sources.length === 0;
      panel.classList.toggle("is-filter-empty", visible === 0 && sources.length > 0);
    };
    search?.addEventListener("input", applyInvokeFilters);
    details.querySelectorAll("[data-invoke-filter]").forEach(button => {
      button.addEventListener("click", () => {
        const key = String(button.dataset.invokeFilter || "");
        if (!key) return;
        if (activeGroups.has(key)) activeGroups.delete(key);
        else activeGroups.add(key);
        const active = activeGroups.has(key);
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-pressed", active ? "true" : "false");
        applyInvokeFilters();
      });
    });
    details.querySelectorAll("[data-invoke-mode]").forEach(button => {
      button.addEventListener("click", () => {
        const row = button.closest("[data-source-id]");
        const sourceId = row?.dataset.sourceId;
        if (!sourceId) return;
        const gm = game.users.activeGM;
        if (!gm) return globalThis.FateToolkitUX.error(tr("FRR.Chat.NoActiveGMInvoke"));
        details.querySelectorAll("button").forEach(btn => btn.disabled = true);
        if (toggle) toggle.disabled = true;
        const payload = {
          type: "fawChatInvoke",
          targetUserIds: [gm.id],
          messageId: message.id,
          userId: game.user.id,
          sourceId,
          mode: button.dataset.invokeMode === "reroll" ? "reroll" : "plus2",
          useFree: button.dataset.useFree === "true"
        };
        if (game.user.isGM && gm.id === game.user.id) void applyInvokeOnGm(payload);
        else void chatRpcToGM(payload);
      });
    });
    toggle?.removeAttribute("aria-busy");
  };

  toggle?.addEventListener("click", async () => {
    const opening = details?.hidden !== false;
    if (opening) await buildInvokePicker();
    if (!details) return;
    details.hidden = !opening;
    panel.classList.toggle("is-collapsed", !opening);
    toggle.setAttribute("aria-expanded", opening ? "true" : "false");
  });
}

function damageSpec(message) {
  const flags = message.flags?.[MODULE_ID] ?? {};
  if (!flags.resolved || !Number.isFinite(Number(flags.difference))) return null;
  const diff = Number(flags.difference);
  const traded = Boolean(flags.boostClaimed && flags.boostOpportunity?.tradeShift);
  if (flags.actionType === "attack" && diff > 0) {
    const actorUuid = flags.actionTarget?.actorUuid || flags.oppositionActorUuid || privateOppositionActorUuid(message) || null;
    if (!actorUuid) return null;
    return {
      actorUuid,
      actorName: flags.actionTarget?.actorName || flags.actionTarget?.name || tr("FRR.Chat.Defender"),
      total: Math.max(0, diff - (traded ? 1 : 0)),
      direction: "outgoing"
    };
  }
  if (flags.actionType === "defend" && (flags.defendedAgainst || "attack") === "attack" && diff < 0) {
    return {
      actorUuid: flags.actorUuid || null,
      actorName: flags.actorName || tr("FRR.Chat.Defender"),
      total: Math.max(0, -diff - (traded ? 1 : 0)),
      direction: "incoming"
    };
  }
  return null;
}

function stressCapacity(track, index) {
  if (String(track?.label || "").toLowerCase() === "escalating") return index + 1;
  return Math.max(0, int(track?.harm_can_absorb));
}

function damageSelectionsAbsorbed(state) {
  return (state?.selections ?? []).reduce((sum, row) => sum + Math.max(0, n(row?.capacity)), 0);
}

function normalizedDamageState(message, spec) {
  const raw = clone(message.flags?.[MODULE_ID]?.damageResolution ?? null);
  const selections = Array.isArray(raw?.selections) ? raw.selections : [];
  const absorbed = damageSelectionsAbsorbed({ selections });
  const remaining = Math.max(0, spec.total - absorbed);
  const status = raw?.status === "ignored" ? "ignored" : raw?.status === "taken-out" ? "taken-out" : remaining <= 0 ? "resolved" : "pending";
  return {
    actorUuid: spec.actorUuid,
    actorName: spec.actorName,
    total: spec.total,
    remaining: status === "ignored" ? 0 : remaining,
    status,
    selections,
    takenOut: raw?.takenOut ?? null,
    ignored: raw?.ignored ?? null
  };
}

function damageOptions(actor, state) {
  const options = [];
  const will = globalThis.FateToolkitWill;
  if (will?.enabled?.()) {
    const resource = will.details(actor);
    const available = resource.configured ? Math.min(resource.current, state.remaining) : 0;
    if (available > 0) options.push({ kind: 'will', label: tr('FRR.Chat.DamageWill'), capacity: available });
  }
  const hasStress = state.selections.some(row => row.kind === "stress");
  for (const [trackKey, track] of Object.entries(actor.system?.tracks ?? {})) {
    if (!track || track.enabled === false) continue;
    const boxes = Array.isArray(track.box_values) ? track.box_values : [];
    if (trackHasAspect(track)) {
      const harm = Math.max(0, int(track.harm_can_absorb));
      if (!harm) continue;
      if (track.aspect?.as_name && !boxes.length) continue;
      const alreadyMarked = trackMarked(track);
      if (alreadyMarked) continue;
      options.push({ kind: "consequence", trackKey, label: displaySystemTerm(track.name, tr("FRR.Chat.Consequence")), capacity: harm, needsName: Boolean(track.aspect?.when_marked) });
      continue;
    }
    // Campaign 2012: Will and consequences absorb harm; stress tracks are archival.
    if (globalThis.FateToolkitWill?.enabled?.()) continue;
    if (hasStress || !boxes.length) continue;
    boxes.forEach((marked, index) => {
      if (marked) return;
      const capacity = stressCapacity(track, index);
      if (capacity <= 0) return;
      options.push({ kind: "stress", trackKey, boxIndex: index, label: displaySystemTerm(track.name, tr("FRR.Chat.Stress")), capacity });
    });
  }
  return options.sort((a, b) => a.capacity - b.capacity || a.label.localeCompare(b.label, game.i18n.lang));
}

function damageSelectionHtml(row) {
  const kind = row.kind === "stress" ? tr("FRR.Chat.Stress") : row.kind === 'will' ? tr('FRR.Chat.DamageWill') : tr("FRR.Chat.Consequence");
  const label = displaySystemTerm(row.label, row.label);
  return `<li><span>${esc(kind)}: ${esc(label)}${row.name ? ` — «${esc(row.name)}»` : ""}</span><strong>−${n(row.capacity)}</strong></li>`;
}

async function injectDamagePanel(message, html) {
  const root = rootElement(html);
  if (!root) return;
  root.querySelectorAll(".frr-damage-panel").forEach(el => el.remove());
  const spec = damageSpec(message);
  if (!spec || spec.total <= 0) return;
  const actor = await actorFromUuid(spec.actorUuid);
  if (!actor) return;
  const card = root.querySelector(".frr-chat-result");
  if (!card) return;

  const state = normalizedDamageState(message, spec);
  const allowed = game.user.isGM || userMayControlActor(game.user, actor);
  const options = damageOptions(actor, state);
  const absorbed = damageSelectionsAbsorbed(state);
  const panel = document.createElement("section");
  panel.className = `frr-damage-panel ${state.status === "resolved" ? "is-resolved" : ""} ${state.status === "taken-out" ? "is-taken-out" : state.status === "ignored" ? "is-resolved" : ""}`;
  panel.setAttribute("aria-label", tr("FRR.Chat.DamageTitle", null, { name: actor.name }));
  const selections = state.selections.length
    ? `<ul class="frr-damage-selections" aria-label="${esc(tr("FRR.Chat.DamageSelections"))}">${state.selections.map(damageSelectionHtml).join("")}</ul>`
    : "";
  const controls = allowed && state.status === "pending"
    ? `<div class="frr-damage-options" role="group" aria-label="${esc(tr("FRR.Chat.DamageOptions"))}">${options.map(option => {
        const label = option.kind === "stress"
          ? tr("FRR.Chat.DamageBox", null, { label: option.label, box: Number(option.boxIndex) + 1 })
          : option.label;
        const typeLabel = option.kind === "stress" ? tr("FRR.Chat.Stress") : option.kind === 'will' ? tr('FRR.Chat.DamageWill') : tr("FRR.Chat.Consequence");
        return `<button type="button" data-damage-kind="${option.kind}" ${option.trackKey !== undefined ? `data-track-key="${esc(option.trackKey)}"` : ''} ${option.boxIndex !== undefined ? `data-box-index="${option.boxIndex}"` : ""} data-capacity="${option.capacity}" data-needs-name="${option.needsName ? "true" : "false"}"><span class="frr-damage-option-copy"><b>${esc(label)}</b><small>${esc(typeLabel)} · ${esc(tr("FRR.Chat.AbsorbAmount", null, { count: option.capacity }))}</small></span><strong aria-label="${esc(tr("FRR.Chat.AbsorbAmount", null, { count: option.capacity }))}">−${option.capacity}</strong></button>`;
      }).join("")}</div>`
    : "";
  const shortage = state.status === "pending" && !options.length
    ? `<p class="frr-tool-warning"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> ${esc(tr("FRR.Chat.DamageNoOptions"))}</p>`
    : "";
  const statusMarkup = state.status === "ignored"
    ? `<div class="frr-tool-success"><i class="fa-solid fa-ban" aria-hidden="true"></i> ${esc(tr("FRR.Chat.DamageIgnored"))}</div>`
    : state.status === "resolved"
    ? `<div class="frr-tool-success"><i class="fa-solid fa-check" aria-hidden="true"></i> ${esc(tr("FRR.Chat.DamageResolved"))}</div>`
    : state.status === "taken-out"
      ? `<div class="frr-tool-warning"><i class="fa-solid fa-skull" aria-hidden="true"></i> ${esc(tr("FRR.Chat.DamageTakenOut"))}</div>`
      : controls;
  const takeOutButton = allowed && state.status === "pending"
    ? `<button type="button" class="frr-damage-takeout is-danger" data-action="damage-takeout"><i class="fa-solid fa-skull" aria-hidden="true"></i> ${esc(tr("FRR.Chat.DamageTakeOut"))}</button>`
    : allowed && state.status === "taken-out"
      ? `<button type="button" class="frr-damage-takeout is-undo" data-action="damage-takeout-undo"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i> ${esc(tr("FRR.Chat.DamageUndoTakeOut"))}</button>`
      : "";
  const statusText = state.status === "ignored"
    ? tr("FRR.Chat.DamageIgnoredStatus")
    : state.status === "resolved"
    ? tr("FRR.Chat.DamageAbsorbedStatus")
    : state.status === "taken-out"
      ? tr("FRR.Chat.DamageTakenOutStatus")
      : tr("FRR.Chat.DamageRemainingStatus", null, { count: state.remaining });
  panel.innerHTML = `<div class="frr-chat-tool-heading"><span><i class="fa-solid fa-shield-halved" aria-hidden="true"></i> ${esc(tr("FRR.Chat.DamageTitle", null, { name: actor.name }))}</span><span class="frr-damage-counter ${state.status === "resolved" ? "is-done" : ""}" aria-live="polite">${esc(statusText)}</span></div>
    <div class="frr-damage-meter" role="group" aria-label="${esc(tr("FRR.Chat.DamageSummary"))}"><span>${esc(tr("FRR.Chat.DamageHit"))} <strong>${spec.total}</strong></span><span>${esc(tr("FRR.Chat.DamageAbsorbed"))} <strong>${absorbed}</strong></span><span>${esc(tr("FRR.Chat.DamageRemaining"))} <strong>${state.remaining}</strong></span></div>
    ${state.status === "pending" ? `<p class="frr-damage-instruction">${esc(tr("FRR.Chat.DamageInstruction", null, { count: state.remaining }))}</p>` : ""}
    ${selections}
    ${statusMarkup}
    ${shortage}
    ${takeOutButton}
    ${game.user.isGM && state.status === "pending" ? `<button type="button" class="frr-damage-undo" data-action="damage-ignore-remaining"><i class="fa-solid fa-forward" aria-hidden="true"></i> ${esc(tr("FRR.Chat.DamageIgnoreRemaining"))}</button>` : ""}
    ${game.user.isGM && (state.status !== "ignored" || state.ignored?.mode === "remaining") ? `<button type="button" class="frr-damage-undo" data-action="damage-cancel-all"><i class="fa-solid fa-ban" aria-hidden="true"></i> ${esc(tr("FRR.Chat.DamageCancelAll"))}</button>` : ""}
    ${allowed && state.status !== "taken-out" && state.status !== "ignored" && state.selections.length ? `<button type="button" class="frr-damage-undo" data-action="damage-undo"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i> ${esc(tr("FRR.Chat.DamageUndoLast"))}</button>` : ""}`;
  card.append(panel);

  panel.querySelectorAll("[data-damage-kind]").forEach(button => {
    button.addEventListener("click", async () => {
      let consequenceName = "";
      let willAmount = null;
      if (button.dataset.damageKind === 'will') {
        const available = Number(button.dataset.capacity);
        const label = tr('FRR.Chat.DamageWillAmount');
        const selected = await foundry.applications.api.DialogV2.prompt({
          window: { title: tr('FRR.Chat.DamageWillPrompt') },
          content: `<div class="faw-toolkit-dialog"><div class="form-group"><label for="faw-damage-will-amount">${esc(label)}</label><input type="number" id="faw-damage-will-amount" name="willAmount" aria-label="${esc(label)}" min="1" max="${available}" value="${available}" required></div></div>`,
          ok: { label: tr('FRR.Chat.DamageWillSpend'), callback: (_event, dialogButton) => Number(dialogButton.form?.elements?.willAmount?.value) },
          rejectClose: false
        });
        if (selected === null || selected === undefined) return;
        if (!Number.isInteger(selected) || selected < 1 || selected > available) return globalThis.FateToolkitUX.warn(tr('FRR.Chat.DamageWillInvalid'));
        willAmount = selected;
      }
      if (button.dataset.damageKind === "consequence" && button.dataset.needsName === "true") {
        const consequenceLabel = game.i18n.localize("FAW.ConsequenceText");
        const result = await foundry.applications.api.DialogV2.prompt({
          window: { title: game.i18n.localize("FAW.AddConsequence") },
          content: `<div class="faw-toolkit-dialog"><div class="form-group"><label for="faw-chat-consequence-name">${esc(consequenceLabel)}</label><input id="faw-chat-consequence-name" name="consequenceName" aria-label="${esc(consequenceLabel)}" autofocus placeholder="${esc(game.i18n.localize("FCT.ConsequencePlaceholder"))}"></div></div>`,
          ok: {
            label: game.i18n.localize("FCT.AcceptConsequence"),
            icon: "fa-solid fa-bandage",
            callback: (event, dialogButton) => String(dialogButton.form?.elements?.consequenceName?.value || "").trim()
          },
          rejectClose: false
        });
        if (result === null || result === undefined) return;
        consequenceName = String(result).trim();
        if (!consequenceName) return globalThis.FateToolkitUX.warn(game.i18n.localize("FAW.ConsequenceTextRequired"));
      }
      const gm = game.users.activeGM;
      if (!gm) return globalThis.FateToolkitUX.error(tr("FRR.Chat.NoActiveGMDamage"));
      panel.querySelectorAll("button").forEach(btn => btn.disabled = true);
      const payload = {
        type: "fawDamageApply",
        targetUserIds: [gm.id],
        messageId: message.id,
        userId: game.user.id,
        kind: button.dataset.damageKind,
        trackKey: button.dataset.trackKey,
        boxIndex: button.dataset.boxIndex === undefined ? null : Number(button.dataset.boxIndex),
        name: consequenceName,
        amount: willAmount
      };
      if (game.user.isGM && gm.id === game.user.id) void applyDamageOnGm(payload);
      else void chatRpcToGM(payload);
    });
  });
  panel.querySelector('[data-action="damage-ignore-remaining"]')?.addEventListener("click", async () => {
    if (!game.user.isGM) return;
    const confirmed = await globalThis.FateToolkitUX.confirm({
      title: tr('FRR.Chat.DamageIgnoreRemaining'),
      content: tr('FRR.Chat.DamageIgnoreRemainingConfirm')
    });
    if (!confirmed) return;
    const payload={type:'fawDamageIgnoreRemaining', messageId:message.id, userId:game.user.id};
    if (primaryGmExecutor()) void ignoreRemainingOnGm(payload);
    else void chatRpcToGM(payload);
  });
  panel.querySelector('[data-action="damage-cancel-all"]')?.addEventListener("click", async () => {
    if (!game.user.isGM) return;
    const confirmed = await globalThis.FateToolkitUX.confirm({
      title: tr('FRR.Chat.DamageCancelAll'),
      content: tr('FRR.Chat.DamageCancelAllConfirm')
    });
    if (!confirmed) return;
    const payload={type:'fawDamageCancelAll',messageId:message.id,userId:game.user.id};
    if (primaryGmExecutor()) void cancelAllDamageOnGm(payload);
    else void chatRpcToGM(payload);
  });
  panel.querySelector('[data-action="damage-undo"]')?.addEventListener("click", () => {
    const gm = game.users.activeGM;
    if (!gm) return globalThis.FateToolkitUX.error(tr("FRR.Chat.NoActiveGM"));
    const payload = { type: "fawDamageUndo", targetUserIds: [gm.id], messageId: message.id, userId: game.user.id };
    if (game.user.isGM && gm.id === game.user.id) void undoDamageOnGm(payload);
    else void chatRpcToGM(payload);
  });
  panel.querySelector('[data-action="damage-takeout"]')?.addEventListener("click", async () => {
    const confirmed = await globalThis.FateToolkitUX.confirm({
      window: { title: tr("FRR.Chat.DamageTakeOutTitle") },
      content: `<p>${esc(tr("FRR.Chat.DamageTakeOutConfirm", null, { remaining: state.remaining, name: actor.name }))}</p>`,
      modal: true,
      rejectClose: false
    });
    if (!confirmed) return;
    const gm = game.users.activeGM;
    if (!gm) return globalThis.FateToolkitUX.error(tr("FRR.Chat.NoActiveGM"));
    const payload = { type: "fawDamageTakeOut", targetUserIds: [gm.id], messageId: message.id, userId: game.user.id };
    if (game.user.isGM && gm.id === game.user.id) void takeOutOnGm(payload);
    else void chatRpcToGM(payload);
  });
  panel.querySelector('[data-action="damage-takeout-undo"]')?.addEventListener("click", () => {
    const gm = game.users.activeGM;
    if (!gm) return globalThis.FateToolkitUX.error(tr("FRR.Chat.NoActiveGM"));
    const payload = { type: "fawDamageUndoTakeOut", targetUserIds: [gm.id], messageId: message.id, userId: game.user.id };
    if (game.user.isGM && gm.id === game.user.id) void undoTakeOutOnGm(payload);
    else void chatRpcToGM(payload);
  });
}

function arraysEqual(a, b) {
  return JSON.stringify(Array.isArray(a) ? a : []) === JSON.stringify(Array.isArray(b) ? b : []);
}

const damageResolution = globalThis.FateToolkitDamageResolution.create({
  getMessage: messageId => game.messages.get(messageId),
  getUser: userId => game.users.get(userId),
  actorFromUuid,
  canUserControlActor: userMayControlActor,
  damageSpec,
  normalizedDamageState,
  trackHasAspect,
  trackMarked,
  stressCapacity,
  arraysEqual,
  randomId: () => foundry.utils.randomID(),
  findCombatantForActor,
  getCombat: combatId => game.combats.get(combatId),
  getCurrentCombat: () => game.combat ?? game.combats?.viewed ?? null,
  updateDamageState: async (message, state) => message.update({ [`flags.${MODULE_ID}.damageResolution`]: state }),
  appendAudit: async (message, row) => game.modules.get(MODULE_ID)?.api?.appendMessageAudit?.(message, row),
  recordConflictEvent: async row => game.modules.get(MODULE_ID)?.api?.recordConflictEvent?.(row),
  notify: fateNotify,
  willDetails: actor => globalThis.FateToolkitWill?.details?.(actor),
  willChange: async (actor, delta, eventId, userId, expectedCurrent) => {
    const result = await globalThis.FateToolkitWill.handler({ operation:'change', actorUuid:actor.uuid, delta, eventId, expectedCurrent }, { senderId:userId });
    if (!result?.ok) throw new Error('Не удалось изменить Волю.');
    return result;
  }
});

async function applyDamageOnGm(payload) {
  if (!primaryGmExecutor() || !payload?.messageId) return;
  if (damageLocks.has(payload.messageId)) return;
  damageLocks.add(payload.messageId);
  try {
    const checked = await damageResolution.prepareApply(payload);
    if (!checked?.ok) throw new Error(checked?.message || "Не удалось применить стресс/последствие.");
    const committed = await damageResolution.commitApply(checked);
    if (!committed?.ok) throw new Error(committed?.message || "Не удалось применить стресс/последствие.");
  } catch (error) {
    globalThis.FateToolkitUX.error(error?.message || "Не удалось применить стресс/последствие.");
  } finally {
    damageLocks.delete(payload.messageId);
  }
}

async function restoreDamageSelection(actor, selection, { quiet = false } = {}) {
  if (selection.kind === 'will') {
    const manager = globalThis.FateToolkitWill;
    if (!manager?.enabled?.()) return false;
    const state = manager.details(actor);
    if (!state.configured || state.rawCurrent !== selection.afterWill) {
      if (!quiet) globalThis.FateToolkitUX.warn(tr('FRR.Chat.DamageWillUndoConflict'));
      return false;
    }
    try {
      const eventId = `damage-will:${selection.id}:undo`;
      const result = await manager.handler({ operation:'change', actorUuid:actor.uuid, delta:selection.capacity, expectedCurrent:selection.afterWill, eventId }, { senderId:game.user.id });
      return Boolean(result?.ok);
    } catch (error) {
      if (!quiet) globalThis.FateToolkitUX.warn(error?.message || tr('FRR.Chat.DamageWillUndoConflict'));
      return false;
    }
  }
  const track = actor.system?.tracks?.[selection.trackKey];
  if (!track) return false;
  const currentBoxes = Array.isArray(track.box_values) ? [...track.box_values] : [];
  const currentName = String(track.aspect?.name ?? "");
  const boxesSafe = arraysEqual(currentBoxes, selection.afterBoxes);
  const nameSafe = currentName === String(selection.afterAspectName ?? "");
  if (!boxesSafe || !nameSafe) {
    if (!quiet) globalThis.FateToolkitUX.warn(`Не удалось автоматически отменить «${selection.label}»: трек уже изменён после результата.`);
    return false;
  }
  const update = {};
  if (!arraysEqual(currentBoxes, selection.beforeBoxes)) update[`system.tracks.${selection.trackKey}.box_values`] = selection.beforeBoxes;
  if (currentName !== String(selection.beforeAspectName ?? "")) update[`system.tracks.${selection.trackKey}.aspect.name`] = String(selection.beforeAspectName ?? "");
  if (Object.keys(update).length) await actor.update(update);
  return true;
}

async function undoDamageOnGm(payload) {
  if (!primaryGmExecutor() || !payload?.messageId) return;
  if (damageLocks.has(payload.messageId)) return;
  damageLocks.add(payload.messageId);
  try {
    const message = game.messages.get(payload.messageId);
    const spec = message ? damageSpec(message) : null;
    if (!message || !spec) throw new Error("Результат удара больше недоступен.");
    const actor = await actorFromUuid(spec.actorUuid);
    const user = game.users.get(payload.userId);
    if (!actor || !userMayControlActor(user, actor)) throw new Error("Нет права изменять стресс этого персонажа.");
    const state = normalizedDamageState(message, spec);
    const selection = state.selections.at(-1);
    if (!selection) return;
    const restored = await restoreDamageSelection(actor, selection);
    if (!restored) return;
    state.selections.pop();
    state.remaining = Math.max(0, spec.total - damageSelectionsAbsorbed(state));
    state.status = state.remaining <= 0 ? "resolved" : "pending";
    try {
      await message.update({ [`flags.${MODULE_ID}.damageResolution`]: state });
    } catch (error) {
      // If the chat message could not be updated, reapply the debit/track mark.
      // Otherwise a player could receive a Will refund while the hit remains paid.
      try {
        if (selection.kind === 'will') {
          await globalThis.FateToolkitWill.handler({
            operation:'change', actorUuid:actor.uuid, delta:-selection.capacity,
            expectedCurrent:selection.beforeWill,
            eventId:`damage-will:${selection.id}:undo-rollback`
          }, {senderId:game.user.id});
        } else {
          const track=actor.system?.tracks?.[selection.trackKey];
          if (track && arraysEqual(track.box_values||[],selection.beforeBoxes||[])
              && String(track.aspect?.name||'')===String(selection.beforeAspectName||'')) {
            const redo={};
            if (!arraysEqual(selection.beforeBoxes||[],selection.afterBoxes||[]))
              redo[`system.tracks.${selection.trackKey}.box_values`]=selection.afterBoxes;
            if (String(selection.beforeAspectName||'')!==String(selection.afterAspectName||''))
              redo[`system.tracks.${selection.trackKey}.aspect.name`]=selection.afterAspectName;
            if (Object.keys(redo).length) await actor.update(redo);
          }
        }
      } catch(rollbackError) {
        console.error('Fate Toolkit: damage undo rollback failed',rollbackError);
      }
      throw error;
    }
    try {
      await game.modules.get(MODULE_ID)?.api?.appendMessageAudit?.(message, {
        type: "damage",
        label: "Поглощение отменено",
        detail: `${actor.name}: «${selection.label}» · осталось ${state.remaining}`,
        userId: payload.userId
      });
      await game.modules.get(MODULE_ID)?.api?.recordConflictEvent?.({
        type: "damage", actorUuid: actor.uuid, actorName: actor.name,
        text: `${actor.name}: отменено поглощение «${selection.label}» · осталось ${state.remaining}`,
        messageId: message.id
      });
    } catch (_) {}
    fateNotify();
  } catch (error) {
    globalThis.FateToolkitUX.error(error?.message || "Не удалось отменить поглощение вреда.");
  } finally {
    damageLocks.delete(payload.messageId);
  }
}

async function findCombatantForActor(actor) {
  const combat = game.combat ?? game.combats?.viewed ?? null;
  if (!combat || !actor) return { combat: null, combatant: null };
  const combatant = (combat.combatants?.contents ?? Array.from(combat.combatants ?? []))
    .find(row => row.actor?.uuid === actor.uuid || row.actor?.id === actor.id) ?? null;
  return { combat, combatant };
}

async function takeOutOnGm(payload) {
  if (!primaryGmExecutor() || !payload?.messageId) return;
  if (damageLocks.has(payload.messageId)) return;
  damageLocks.add(payload.messageId);
  try {
    const checked = await damageResolution.prepareTakeOut(payload);
    if (!checked?.ok) throw new Error(checked?.message || "Не удалось отметить выбывание.");
    const committed = await damageResolution.commitTakeOut(checked);
    if (!committed?.ok) throw new Error(committed?.message || "Не удалось отметить выбывание.");
  } catch (error) {
    globalThis.FateToolkitUX.error(error?.message || "Не удалось отметить выбывание.");
  } finally {
    damageLocks.delete(payload.messageId);
  }
}

async function undoTakeOutOnGm(payload) {
  if (!primaryGmExecutor() || !payload?.messageId) return;
  if (damageLocks.has(payload.messageId)) return;
  damageLocks.add(payload.messageId);
  try {
    const checked = await damageResolution.prepareUndoTakeOut(payload);
    if (!checked?.ok) throw new Error(checked?.message || "Не удалось отменить выбывание.");
    const committed = await damageResolution.commitUndoTakeOut(checked);
    if (!committed?.ok) throw new Error(committed?.message || "Не удалось отменить выбывание.");
  } catch (error) {
    globalThis.FateToolkitUX.error(error?.message || "Не удалось отменить выбывание.");
  } finally {
    damageLocks.delete(payload.messageId);
  }
}

// Both actions are GM-only and serialized with absorption / undo on the same chat card.
async function ignoreRemainingOnGm(payload) {
  if (!primaryGmExecutor() || !payload?.messageId) return;
  if (damageLocks.has(payload.messageId)) return;
  damageLocks.add(payload.messageId);
  try {
    const user=game.users.get(payload.userId);
    if (!user?.isGM) throw new Error(tr('FRR.Chat.DamageGmOnly'));
    const message=game.messages.get(payload.messageId);
    const spec=message?damageSpec(message):null;
    if (!spec) throw new Error(tr('FRR.Chat.DamageMissing'));
    const state=normalizedDamageState(message,spec);
    if (state.status !== 'pending') return;
    const remaining=state.remaining;
    await message.update({[`flags.${MODULE_ID}.damageResolution`]:{
      ...state, status:'ignored', ignored:{mode:'remaining',amount:remaining,userId:user.id}
    }});
    await game.modules.get(MODULE_ID)?.api?.appendMessageAudit?.(message,{
      type:'damage',label:tr('FRR.Chat.DamageIgnoreRemaining'),
      detail:`${spec.actorName} · ${remaining}`,userId:user.id
    });
    fateNotify();
  } catch(error) { globalThis.FateToolkitUX.error(error?.message || tr('FRR.Chat.DamageIgnoreFailed')); }
  finally {damageLocks.delete(payload.messageId);}
}

async function cancelAllDamageOnGm(payload) {
  if (!primaryGmExecutor() || !payload?.messageId) return;
  if (damageLocks.has(payload.messageId)) return;
  damageLocks.add(payload.messageId);
  try {
    const user=game.users.get(payload.userId);
    if (!user?.isGM) throw new Error(tr('FRR.Chat.DamageGmOnly'));
    const message=game.messages.get(payload.messageId);
    const spec=message?damageSpec(message):null;
    if (!spec) throw new Error(tr('FRR.Chat.DamageMissing'));
    const state=normalizedDamageState(message,spec);
    if (state.status === 'ignored' && state.ignored?.mode === 'all') return;
    // Never erase a marked consequence or a Will debit without successfully
    // restoring it. The preflight prevents obvious mixed-state cancellations.
    const actor=await actorFromUuid(spec.actorUuid);
    if (!actor) throw new Error(tr('FRR.Chat.DamageMissing'));
    const lastWill=[...state.selections].reverse().find(selection=>selection.kind==='will');
    if (lastWill && globalThis.FateToolkitWill?.details?.(actor)?.rawCurrent !== lastWill.afterWill)
      throw new Error(tr('FRR.Chat.DamageUndoConflict'));
    for (const selection of [...state.selections].reverse()) {
      if (selection.kind !== 'will') {
        const track=actor.system?.tracks?.[selection.trackKey];
        if (!track || !arraysEqual(track.box_values||[],selection.afterBoxes||[])
          || String(track.aspect?.name||'') !== String(selection.afterAspectName||''))
          throw new Error(tr('FRR.Chat.DamageUndoConflict'));
      }
    }
    const finalState={actorUuid:spec.actorUuid,actorName:spec.actorName,total:spec.total,
      remaining:0,status:'ignored',selections:[],takenOut:null,
      ignored:{mode:'all',amount:spec.total,userId:user.id}};
    if (!(await rollbackDamageForMessage(message,finalState))) throw new Error(tr('FRR.Chat.DamageUndoConflict'));
    await game.modules.get(MODULE_ID)?.api?.appendMessageAudit?.(message,{
      type:'damage',label:tr('FRR.Chat.DamageCancelAll'),detail:spec.actorName,userId:user.id
    });
    fateNotify();
  } catch(error) { globalThis.FateToolkitUX.error(error?.message || tr('FRR.Chat.DamageIgnoreFailed')); }
  finally { damageLocks.delete(payload.messageId); }
}

async function rollbackDamageForMessage(message, replacementState = null) {
  if (!game.user.isGM || !message) return true;
  const state = clone(message.flags?.[MODULE_ID]?.damageResolution ?? null);
  if (!state) {
    if (replacementState !== null) await message.update({[`flags.${MODULE_ID}.damageResolution`]:replacementState});
    return true;
  }
  const selections = Array.isArray(state?.selections) ? state.selections : [];
  const actor = await actorFromUuid(state.actorUuid);
  if (!actor) return false;

  if (state.status === "taken-out") {
    const meta = state.takenOut ?? {};
    const combat = meta.combatId ? game.combats.get(meta.combatId) : (game.combat ?? game.combats?.viewed ?? null);
    const combatant = meta.combatantId ? combat?.combatants?.get(meta.combatantId) : null;
    if (combatant && combatant.defeated && !meta.beforeDefeated) await combatant.update({ defeated: false });
  }

  let allRestored = true;
  for (const selection of [...selections].reverse()) {
    const ok = await restoreDamageSelection(actor, selection, { quiet: true });
    if (!ok) allRestored = false;
  }
  if (!allRestored) {
    globalThis.FateToolkitUX.warn(tr('FRR.Chat.DamageUndoConflict'));
    return false;
  }
  await message.update({ [`flags.${MODULE_ID}.damageResolution`]: replacementState });
  fateNotify();
  return allRestored;
}

function damageResolutionStarted(message) {
  const state = message?.flags?.[MODULE_ID]?.damageResolution;
  return state?.status === "taken-out" || state?.status === "ignored" || (Array.isArray(state?.selections) && state.selections.length > 0);
}

async function onChatRpc(payload, { senderId } = {}) {
  if (!payload?.type || !primaryGmExecutor()) return;
  const safe = { ...payload, userId: String(senderId || "") };
  if (payload.type === "fawChatInvoke") return applyInvokeOnGm(safe);
  if (payload.type === "fawDamageApply") return applyDamageOnGm(safe);
  if (payload.type === "fawDamageUndo") return undoDamageOnGm(safe);
  if (payload.type === "fawDamageTakeOut") return takeOutOnGm(safe);
  if (payload.type === "fawDamageUndoTakeOut") return undoTakeOutOnGm(safe);
  if (payload.type === "fawDamageIgnoreRemaining") return ignoreRemainingOnGm(safe);
  if (payload.type === "fawDamageCancelAll") return cancelAllDamageOnGm(safe);
}

Hooks.once("ready", () => {
  if (game.system?.id !== SYSTEM_ID) return;
  chatRpc().register("chat", onChatRpc);
  const module = game.modules.get(MODULE_ID);
  module.api ??= {};
  Object.assign(module.api, {
    rollbackDamageForMessage,
    damageResolutionStarted
  });
});

Hooks.on("renderChatMessage", (message, html) => {
  void (async () => {
    const root = rootElement(html);
    localizeNativeFcoRollUi(message, html);
    let observer = null;
    if (message?.flags?.[MODULE_ID] && root && globalThis.MutationObserver) {
      observer = new MutationObserver(() => localizeNativeFcoRollUi(message, html));
      observer.observe(root, { childList: true, subtree: true });
      setTimeout(() => observer?.disconnect(), 1000);
    }
    await injectInvokePanel(message, html);
    await injectDamagePanel(message, html);
    await game.modules.get(MODULE_ID)?.api?.injectConflictFlow?.(message, html);
    localizeNativeFcoRollUi(message, html);
  })();
});
