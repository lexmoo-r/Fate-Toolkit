const MODULE_ID = "fate-aspect-widget";
const SYSTEM_ID = "fate-core-official";
const SOCKET = `module.${MODULE_ID}`;
const SESSION_SETTING = "milestoneSession";
const CAP_SETTING = "campaignSkillCap";
const HISTORY_FLAG = "milestoneHistory";
const BANK_FLAG = "milestoneSkillPoints";
const DRAFTS_FLAG = "milestoneDraftsV2";
const TIMELINE_SETTING = "milestoneCampaignTimelineV1";
const PLAY_SESSION_SETTING = "campaignSessionCounterV1";

function milestoneRpc() { return globalThis.FateToolkitRPC; }
async function milestoneRpcToGM(payload) { return milestoneRpc().executeAsGM("milestone", payload); }
async function milestoneRpcToUser(userId, payload) { return milestoneRpc().executeAsUser("milestone", userId, payload); }
async function milestoneRpcToUsers(userIds, payload) { return milestoneRpc().executeForUsers("milestone", userIds, payload); }

const AppV2 = foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2);

let milestoneManager = null;
const milestoneApps = new Map();
const milestoneProcessing = new Set();
let lastAutoOpenedSessionId = null;

function clone(value) {
  return foundry.utils.deepClone ? foundry.utils.deepClone(value) : foundry.utils.duplicate(value);
}

function n(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function signed(value) {
  const number = n(value);
  return `${number >= 0 ? "+" : ""}${number}`;
}

function escapeHtml(value) {
  const text = String(value ?? "");
  return text.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

function getSession() {
  const session = clone(game.settings.get(MODULE_ID, SESSION_SETTING));
  return session && session.id ? session : null;
}

async function setSession(session) {
  if (!game.user.isGM) return;
  await game.settings.set(MODULE_ID, SESSION_SETTING, session ?? {});
}

// Campaign events are public, while player explanations and exact before/after
// snapshots stay on the owning Actor. Drafts remain browser-private.
function campaignTimeline() {
  const raw = game.settings.get(MODULE_ID, TIMELINE_SETTING);
  return Array.isArray(raw) ? clone(raw) : [];
}

function playSession() {
  const value=game.settings.get(MODULE_ID, PLAY_SESSION_SETTING);
  return value && Number.isInteger(Number(value.number)) ? value : null;
}
async function beginPlaySession() {
  if(!game.user?.isGM)throw new Error('Начать сессию может только ведущий.');
  const existing=playSession();
  if(existing && !existing.endedAt)return existing;
  const number=suggestedSessionNumber();
  const result={number,startedAt:Date.now(),endedAt:null};
  await game.settings.set(MODULE_ID,PLAY_SESSION_SETTING,result);
  return result;
}
async function endPlaySession() {
  if(!game.user?.isGM)throw new Error('Завершить сессию может только ведущий.');
  if(getSession())throw new Error('Сначала завершите открытую веху, затем сессию.');
  const active=playSession();
  if(!active||active.endedAt)throw new Error('Нет текущей сессии.');
  const finished={...active,endedAt:Date.now()};
  await game.settings.set(MODULE_ID,PLAY_SESSION_SETTING,finished);
  const hasMinor=campaignTimeline().some(event=>String(event.sessionNumber)===String(active.number)&&event.type==='minor');
  if(!hasMinor){
    const yes=await foundry.applications.api.DialogV2.confirm({
      window:{title:'Завершение сессии'},content:`<p>Сессия № ${Number(active.number)} завершена. Объявить малую веху участникам?</p>`,rejectClose:false
    });
    if(yes){
      openMilestoneManager();
      milestoneManager.sessionNumber=String(active.number);
      milestoneManager.type='minor';
      milestoneManager.draftTitle=`Завершение сессии № ${active.number}`;
      await milestoneManager.render(false);
    }
  }
  return finished;
}
function suggestedSessionNumber() {
  const active=playSession();
  if(active && !active.endedAt)return String(active.number);
  const numeric=campaignTimeline().map(event=>Number.parseInt(event.sessionNumber,10)).filter(n=>Number.isInteger(n)&&n>=0);
  const running=getSession();const current=Number.parseInt(running?.sessionNumber,10);
  if(Number.isInteger(current)&&current>=0)numeric.push(current);
  const last=Number.parseInt(active?.number,10);if(Number.isInteger(last)&&last>=0)numeric.push(last);
  return String(Math.max(0,...numeric)+1);
}
function normaliseWorldDate(value) {
  const digits=String(value||'').replace(/\D/g,'').slice(0,8);
  return [digits.slice(0,2),digits.slice(2,4),digits.slice(4,8)].filter(Boolean).join('.');
}
function isValidWorldDate(value) {
  if(!value)return true;
  if(!/^\d{2}\.\d{2}\.\d{4}$/.test(value))return false;
  const [d,m,y]=value.split('.').map(Number);const date=new Date(y,m-1,d);
  return date.getFullYear()===y&&date.getMonth()===m-1&&date.getDate()===d;
}
function publicMilestoneEvent(session, { closedAt = null } = {}) {
  return {
    id: String(session.id), type: String(session.type),
    title: String(session.title || ""), note: String(session.note || ""),
    createdAt: n(session.createdAt), createdBy: String(session.createdBy || ""),
    sessionNumber: String(session.sessionNumber || ""),
    gameDate: String(session.gameDate || ""),
    closedAt: closedAt ?? session.closedAt ?? null,
    participants: Object.values(session.actors ?? {}).map(row => ({
      actorId: String(row.actorId),
      actorName: game.actors?.get?.(row.actorId)?.name || row.actorName || String(row.actorId),
      status: row.status === "completed" ? "completed" : "pending",
      completedAt: row.completedAt ?? null,
      changes: row.status === "completed" ? (row.summary ?? []).map(String) : []
    }))
  };
}

async function syncCampaignTimeline(session, options = {}) {
  if (!game.user?.isGM || !session?.id) return;
  const archive = campaignTimeline();
  const event = publicMilestoneEvent(session, options);
  const index = archive.findIndex(row => row.id === event.id);
  if (index === -1) archive.push(event);
  else archive[index] = {
    ...archive[index], ...event,
    // Closing a session is irreversible for the event log.
    closedAt: event.closedAt ?? archive[index].closedAt ?? null
  };
  await game.settings.set(MODULE_ID, TIMELINE_SETTING, archive);
}

function historyForActor(actor) {
  const history = actor?.getFlag?.(MODULE_ID, HISTORY_FLAG);
  return Array.isArray(history) ? clone(history) : [];
}

function developmentForActor(actor) {
  const session = getSession();
  const mine = session?.actors?.[actor?.id];
  const history = historyForActor(actor);
  const events = campaignTimeline().filter(row => (row.participants ?? []).some(p => p.actorId === actor?.id));
  const completedIds = new Set([
    ...history.map(row => row.id).filter(Boolean),
    ...events.filter(event => event.participants.some(p => p.actorId === actor.id && p.status === "completed")).map(row => row.id)
  ]);
  const types = new Map();
  for (const row of history) if (row.id) types.set(row.id, row.type);
  for (const row of events) if (completedIds.has(row.id)) types.set(row.id, row.type);
  const stage = 1 + [...types.entries()].filter(([id, type]) => completedIds.has(id) && ["significant", "major"].includes(type)).length;
  const counts = { minor: 0, significant: 0, major: 0 };
  for (const [id, type] of types) if (completedIds.has(id) && Object.hasOwn(counts, type)) counts[type]++;
  const entries = [...history].sort((a,b) => n(b.at)-n(a.at)).map(row => ({
    ...row,
    typeLabel: milestoneLabel(row.type),
    dateLabel: row.gameDate || (row.at ? new Date(row.at).toLocaleDateString(game.i18n.lang) : ""),
    hasChanges: !!row.changes?.length,
    sessionLabel: row.sessionNumber ? `${game.i18n.localize("FMS.Timeline.Session")} ${row.sessionNumber}` : ""
  }));
  const assigned = mine && (game.user?.isGM || mine.userIds?.includes(game.user?.id));
  return {
    stage, counts, bank: getSkillBank(actor), entries,
    active: assigned ? {
      id: session.id, title: session.title, typeLabel: milestoneLabel(session.type),
      completed: mine.status === "completed", status: mine.status,
      sessionNumber: session.sessionNumber || ""
    } : null,
    hasHistory: entries.length > 0
  };
}

function isFateActor(actor) {
  return actor?.type === SYSTEM_ID;
}

function ownersForActor(actor, { activeOnly = false } = {}) {
  return game.users.contents.filter(user => {
    if (user.isGM || (activeOnly && !user.active)) return false;
    try {
      if (typeof actor.testUserPermission === "function") return actor.testUserPermission(user, "OWNER");
    } catch (_) {}
    const level = actor.ownership?.[user.id] ?? actor.ownership?.default ?? 0;
    return level >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
  });
}

function userOwnsActor(user, actor) {
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

function getSkillBank(actor) {
  return Math.max(0, Math.trunc(n(actor?.getFlag(MODULE_ID, BANK_FLAG), 0)));
}

async function setSkillBank(actor, value) {
  await actor.setFlag(MODULE_ID, BANK_FLAG, Math.max(0, Math.trunc(n(value, 0))));
}

function refreshValue(actor) {
  const own = actor?.system?.details?.fatePoints?.refresh;
  if (own !== null && own !== undefined && Number.isFinite(Number(own))) return Math.max(1, Math.trunc(Number(own)));
  try {
    return Math.max(1, Math.trunc(n(game.settings.get(SYSTEM_ID, "refreshTotal"), 3)));
  } catch (_) {
    return 3;
  }
}

function currentFatePoints(actor) {
  return Math.max(0, Math.trunc(n(actor?.system?.details?.fatePoints?.current, 0)));
}

function worldRefreshAllowance() {
  try {
    return Math.max(1, Math.trunc(n(game.settings.get(SYSTEM_ID, "refreshTotal"), 3)));
  } catch (_) {
    return 3;
  }
}

function worldSkillAllowance() {
  try {
    return Math.max(0, Math.trunc(n(game.settings.get(SYSTEM_ID, "skillTotal"), 0)));
  } catch (_) {
    return 0;
  }
}

function nativeSkillTotal(actor) {
  if (!actor) return 0;
  let total = Object.values(actor.system?.skills ?? {}).reduce((sum, skill) => sum + Math.trunc(n(skill?.rank, 0)), 0);
  for (const item of actor.items?.contents ?? actor.items ?? []) {
    if (!item?.system?.active) continue;
    for (const skill of Object.values(item.system.skills ?? {})) {
      if (!item.system.countSkills && !skill?.countMe) total -= Math.trunc(n(skill?.rank, 0));
    }
  }
  return Math.max(0, total);
}

function nativeRefreshSpent(actor) {
  if (!actor) return 0;
  const paidTracks = Object.values(actor.system?.tracks ?? {}).filter(track => track?.paid).length;
  let paidStunts = Object.values(actor.system?.stunts ?? {}).reduce((sum, stunt) => sum + Math.max(0, Math.trunc(n(stunt?.refresh_cost, 0))), 0);
  try { paidStunts -= Math.max(0, Math.trunc(n(game.settings.get(SYSTEM_ID, "freeStunts"), 0))); } catch (_) {}
  let paidExtras = 0;
  for (const item of actor.items?.contents ?? actor.items ?? []) {
    if (!item?.system?.active) continue;
    const cost = Number.parseInt(item.system.refresh, 10);
    if (Number.isFinite(cost)) paidExtras += cost;
  }
  return paidTracks + paidStunts + paidExtras;
}

function systemAllowances(actor) {
  const override = actor?.system?.override ?? {};
  const active = Boolean(override.active);
  const inferredRefresh = Math.max(worldRefreshAllowance(), refreshValue(actor) + nativeRefreshSpent(actor));
  const inferredSkills = Math.max(worldSkillAllowance(), nativeSkillTotal(actor));
  const refresh = active && n(override.refresh, 0) > 0
    ? Math.max(inferredRefresh, Math.trunc(n(override.refresh, inferredRefresh)))
    : inferredRefresh;
  const skillPoints = active && n(override.skillPoints, 0) > 0
    ? Math.max(inferredSkills, Math.trunc(n(override.skillPoints, inferredSkills)))
    : inferredSkills;
  return { active, refresh, skillPoints };
}

function milestoneAllowanceUpdate(actor, type) {
  const current = systemAllowances(actor);
  const grantsSkill = type === "significant" || type === "major";
  const grantsRefresh = type === "major";
  if (!grantsSkill && !grantsRefresh) return null;
  return {
    "system.override.active": true,
    "system.override.refresh": current.refresh + (grantsRefresh ? 1 : 0),
    "system.override.skillPoints": current.skillPoints + (grantsSkill ? 1 : 0)
  };
}

function milestoneSkillLabel(name) {
  return globalThis.FateToolkitI18n?.skill?.(String(name ?? "")) || String(name ?? "");
}

function skillEntries(actor) {
  return Object.entries(actor?.system?.skills ?? {}).map(([key, skill]) => ({
    key,
    name: String(skill?.name ?? key),
    label: milestoneSkillLabel(skill?.name ?? key),
    rank: Math.trunc(n(skill?.rank, 0)),
    data: skill
  }));
}

function skillRanks(actor) {
  return Object.fromEntries(skillEntries(actor).map(row => [row.key, row.rank]));
}

function aspectEntries(actor) {
  return Object.entries(actor?.system?.aspects ?? {}).map(([key, aspect]) => ({
    key,
    name: String(aspect?.name ?? key),
    value: String(aspect?.value ?? ""),
    data: aspect,
    highConcept: isHighConcept(key, aspect)
  }));
}

function isHighConcept(key, aspect) {
  const values = [key, aspect?.name, aspect?.original_name]
    .filter(Boolean)
    .map(value => String(value).trim().toLocaleLowerCase("en"));
  return values.includes("high concept") || values.includes("high-concept");
}

function highConceptEntry(actor) {
  return aspectEntries(actor).find(row => row.highConcept) ?? aspectEntries(actor)[0] ?? null;
}

function stuntEntries(actor) {
  return Object.entries(actor?.system?.stunts ?? {}).map(([key, stunt]) => ({
    key,
    name: String(stunt?.name ?? key),
    data: stunt,
    cost: Math.max(0, Math.trunc(n(stunt?.refresh_cost, 1)))
  }));
}

function stuntSignature(stunt) {
  if (!stunt) return "";
  const normalized = normalizeStuntData(stunt, { fallbackName: String(stunt?.name ?? "") });
  return JSON.stringify({
    name: normalized.name,
    description: normalized.description,
    notes: normalized.notes,
    linked_skill: normalized.linked_skill,
    refresh_cost: normalized.refresh_cost,
    overcome: normalized.overcome,
    caa: normalized.caa,
    attack: normalized.attack,
    defend: normalized.defend,
    bonus: normalized.bonus,
    boxes: normalized.boxes,
    box_values: normalized.box_values,
    macro: normalized.macro ?? null
  });
}

function stuntSnapshot(actor) {
  return Object.fromEntries(Object.entries(actor?.system?.stunts ?? {}).map(([key, stunt]) => [key, stuntSignature(stunt)]));
}

function sameStuntMap(actor, baseline) {
  const now = stuntSnapshot(actor);
  const keys = new Set([...Object.keys(now), ...Object.keys(baseline ?? {})]);
  for (const key of keys) if ((now[key] ?? null) !== (baseline?.[key] ?? null)) return false;
  return true;
}

function activeConsequenceEntries(actor) {
  const rows = [];
  for (const [key, track] of Object.entries(actor?.system?.tracks ?? {})) {
    if (!track || track.enabled === false) continue;
    const harm = Math.trunc(n(track.harm_can_absorb, 0));
    if (harm < 4) continue;
    const boxes = Array.isArray(track.box_values) ? track.box_values : [];
    const marked = boxes.some(Boolean);
    const aspect = track.aspect;
    if (!marked || !aspect || typeof aspect !== "object") continue;
    if (aspect.when_marked) {
      rows.push({
        key,
        label: globalThis.FateToolkitI18n?.term?.(String(track.name ?? key)) || String(track.name ?? key),
        name: String(aspect.name ?? ""),
        harm,
        editable: true
      });
    } else if (aspect.as_name) {
      rows.push({
        key,
        label: globalThis.FateToolkitI18n?.term?.(String(track.name ?? key)) || String(track.name ?? key),
        name: globalThis.FateToolkitI18n?.term?.(String(track.name ?? "")) || String(track.name ?? ""),
        harm,
        editable: false
      });
    }
  }
  return rows;
}

function rankWord(rank) {
  const keys = {
    8: "Legendary",
    7: "Epic",
    6: "Fantastic",
    5: "Superb",
    4: "Great",
    3: "Good",
    2: "Fair",
    1: "Average",
    0: "Mediocre",
    "-1": "Poor",
    "-2": "Terrible"
  };
  const key = keys[rank];
  if (!key) return "";
  return globalThis.FateToolkitI18n?.rank?.(key) || key;
}

function rankLabel(rank) {
  const word = rankWord(rank);
  return word ? `${signed(rank)} · ${word}` : signed(rank);
}

function getWorldDataActor() {
  try {
    const uuid = game.settings.get(SYSTEM_ID, "wid");
    if (!uuid) return null;
    return fromUuidSync(uuid) ?? null;
  } catch (_) {
    return null;
  }
}

function worldSkillLibrary(actor) {
  const map = new Map();
  for (const [key, skill] of Object.entries(getWorldDataActor()?.system?.skills ?? {})) {
    if (!skill?.name || skill.pc === false) continue;
    map.set(String(skill.name).toLocaleLowerCase(game.i18n.lang), { key, data: clone(skill) });
  }
  for (const row of skillEntries(actor)) {
    const lookup = row.name.toLocaleLowerCase(game.i18n.lang);
    if (!map.has(lookup)) map.set(lookup, { key: row.key, data: clone(row.data) });
  }
  return Array.from(map.values()).map(row => row.data).sort((a, b) => String(a.name).localeCompare(String(b.name), game.i18n.lang));
}

function worldStuntLibrary() {
  const source = getWorldDataActor()?.system?.stunts ?? {};
  return Object.entries(source)
    .filter(([, stunt]) => stunt?.name)
    .map(([key, stunt]) => ({ key, name: String(stunt.name), data: clone(stunt), cost: Math.max(0, Math.trunc(n(stunt.refresh_cost, 1))) }))
    .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
}

function safeKey(text) {
  const bytes = new TextEncoder().encode(String(text ?? ""));
  return btoa(String.fromCodePoint(...bytes)).replaceAll("=", "");
}

function uniqueObjectKey(object, preferred, name) {
  if (!Object.prototype.hasOwnProperty.call(object, preferred)) return preferred;
  let index = 2;
  while (Object.prototype.hasOwnProperty.call(object, `${preferred}_${index}`)) index += 1;
  return `${preferred}_${index}`;
}


function normalizeStuntData(data, { fallbackName = "Новый трюк", preserveCost = null } = {}) {
  const result = {
    name: String(data?.name ?? fallbackName).trim() || fallbackName,
    description: String(data?.description ?? ""),
    notes: String(data?.notes ?? ""),
    linked_skill: String(data?.linked_skill ?? "None") || "None",
    refresh_cost: preserveCost === null ? Math.max(0, Math.trunc(n(data?.refresh_cost, 1))) : Math.max(0, Math.trunc(n(preserveCost, 1))),
    overcome: Boolean(data?.overcome),
    caa: Boolean(data?.caa),
    attack: Boolean(data?.attack),
    defend: Boolean(data?.defend),
    bonus: Math.trunc(n(data?.bonus, 0)),
    boxes: Math.max(0, Math.trunc(n(data?.boxes, 0))),
    box_values: Array.isArray(data?.box_values) ? clone(data.box_values) : [],
    macro: data?.macro ?? null
  };
  if (data?.extra_id) result.extra_id = data.extra_id;
  if (data?.original_name) result.original_name = data.original_name;
  while (result.box_values.length < result.boxes) result.box_values.push(false);
  if (result.box_values.length > result.boxes) result.box_values.length = result.boxes;
  return result;
}

function defaultCustomStunt() {
  return normalizeStuntData({ name: "", refresh_cost: 1, linked_skill: "None" }, { fallbackName: "" });
}

function skillColumnCounts(ranks) {
  const counts = new Map();
  for (const rank of Object.values(ranks)) {
    const value = Math.trunc(n(rank, 0));
    if (value <= 0) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function validateSkillColumns(ranks) {
  const counts = skillColumnCounts(ranks);
  const max = Math.max(1, ...counts.keys());
  for (let rank = 2; rank <= max; rank += 1) {
    const here = counts.get(rank) ?? 0;
    const below = counts.get(rank - 1) ?? 0;
    if (here > below) {
      return {
        valid: false,
        rank,
        here,
        below,
        message: game.i18n.format("FMS.ColumnError", { high: rankLabel(rank), highCount: here, low: rankLabel(rank - 1), lowCount: below })
      };
    }
  }
  return { valid: true, message: "" };
}

function applyMinorSkillSwap(ranks, minor) {
  const result = { ...ranks };
  if (minor?.type !== "skills") return result;
  const a = minor.skillA;
  const b = minor.skillB;
  if (!a || !b || a === b || !(a in result) || !(b in result)) return result;
  [result[a], result[b]] = [result[b], result[a]];
  return result;
}

function validateMinorSkillSwap(ranks, minor) {
  if (minor?.type !== "skills") return { valid: true };
  const a = minor.skillA;
  const b = minor.skillB;
  if (!a || !b || a === b || !(a in ranks) || !(b in ranks)) return { valid: false, message: game.i18n.localize("FMS.ChooseTwoSkills") };
  const ar = Math.trunc(n(ranks[a], 0));
  const br = Math.trunc(n(ranks[b], 0));
  if (ar === 0 || br === 0) {
    const positive = Math.max(ar, br);
    if (positive !== 1) return { valid: false, message: game.i18n.localize("FMS.AverageReplacementOnly") };
  }
  return { valid: true };
}

function snapshotActor(actor) {
  const allowance = systemAllowances(actor);
  return {
    refresh: refreshValue(actor),
    allowedRefresh: allowance.refresh,
    allowedSkillTotal: allowance.skillPoints,
    skillBank: getSkillBank(actor),
    skills: skillRanks(actor),
    aspects: Object.fromEntries(aspectEntries(actor).map(row => [row.key, row.value])),
    stunts: stuntSnapshot(actor),
    consequences: Object.fromEntries(activeConsequenceEntries(actor).map(row => [row.key, row.name]))
  };
}

function milestoneLabel(type) {
  return game.i18n.localize(`FMS.Type.${type}`);
}

function milestoneRuleText(type) {
  return game.i18n.localize(`FMS.Rules.${type}`);
}

function eligibleActors() {
  return game.actors.contents
    .filter(actor => isFateActor(actor) && ownersForActor(actor).length > 0)
    .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
}

async function confirmDialog(title, content) {
  return globalThis.FateToolkitUX.confirm({ window: { title }, content, modal: true, rejectClose: false });
}

function broadcastToUsers(payload, userIds) {
  const targets = Array.from(new Set(userIds.filter(Boolean)));
  if (!targets.length) return;
  void milestoneRpcToUsers(targets, payload);
}

async function announceMilestone(session) {
  if (!session.postToChat) return;
  const names = Object.keys(session.actors).map(id => game.actors.get(id)?.name).filter(Boolean).join(", ");
  const content = `<div class="fms-chat"><h3><i class="fa-solid fa-road" aria-hidden="true"></i> ${escapeHtml(session.title || milestoneLabel(session.type))}</h3><p><strong>${escapeHtml(milestoneLabel(session.type))}</strong></p><p>${escapeHtml(milestoneRuleText(session.type))}</p><p><strong>${escapeHtml(game.i18n.localize("FMS.Characters"))}:</strong> ${escapeHtml(names)}</p>${session.note ? `<p>${escapeHtml(session.note)}</p>` : ""}</div>`;
  await ChatMessage.create({ content, speaker: ChatMessage.getSpeaker({ user: game.user }) });
}

async function startMilestone({ type, title, note, actorIds, strictColumns = true, postToChat = true, baseSkillCap = 4, sessionNumber = "", gameDate = "" }) {
  if (!game.user.isGM) return;
  if (!Array.isArray(actorIds) || !actorIds.length) return globalThis.FateToolkitUX.warn(game.i18n.localize("FMS.SelectActors"));
  const existing = getSession();
  if (existing) {
    globalThis.FateToolkitUX.warn(game.i18n.localize("FMS.ReplaceActiveText"));
    milestoneManager?.render(false);
    return;
  }

  const safeType = ["minor", "significant", "major"].includes(type) ? type : "minor";
  const cap = Math.max(1, Math.trunc(n(baseSkillCap, 4)));
  await game.settings.set(MODULE_ID, CAP_SETTING, cap);

  const session = {
    id: foundry.utils.randomID(),
    type: safeType,
    title: String(title ?? "").trim() || milestoneLabel(safeType),
    note: String(note ?? "").trim(),
    sessionNumber: String(sessionNumber ?? "").trim().slice(0, 40),
    gameDate: String(gameDate ?? "").trim().slice(0, 80),
    createdAt: Date.now(),
    createdBy: game.user.id,
    baseSkillCap: cap,
    strictColumns: Boolean(strictColumns),
    postToChat: Boolean(postToChat),
    actors: {}
  };

  const candidates = actorIds.map(actorId => game.actors.get(actorId)).filter(actor => isFateActor(actor) && ownersForActor(actor).length > 0);
  if (!candidates.length) return globalThis.FateToolkitUX.warn(game.i18n.localize("FMS.NoEligibleActors"));

  const rollback = [];
  try {
    for (const actor of candidates) {
      const ownerIds = ownersForActor(actor).map(user => user.id);
      const before = snapshotActor(actor);
      const oldBankFlag = actor.getFlag(MODULE_ID, BANK_FLAG);
      const oldRefresh = actor.system.details.fatePoints.refresh;
      const oldOverride = clone(actor.system.override ?? {});
      rollback.push({ actor, oldBankFlag, oldRefresh, oldOverride });

      const auto = { skillPoints: 0, refresh: 0 };
      const actorUpdates = {};
      const allowanceUpdates = milestoneAllowanceUpdate(actor, safeType);
      if (allowanceUpdates) Object.assign(actorUpdates, allowanceUpdates);

      if (safeType === "significant" || safeType === "major") {
        await setSkillBank(actor, getSkillBank(actor) + 1);
        auto.skillPoints = 1;
      }
      if (safeType === "major") {
        actorUpdates["system.details.fatePoints.refresh"] = refreshValue(actor) + 1;
        auto.refresh = 1;
      }
      if (Object.keys(actorUpdates).length) await actor.update(actorUpdates);

      session.actors[actor.id] = {
        actorId: actor.id,
        actorName: actor.name,
        before,
        userIds: ownerIds,
        status: "pending",
        auto,
        baseline: snapshotActor(actor),
        completedAt: null,
        completedBy: null,
        summary: []
      };
    }

    await setSession(session);
  } catch (err) {
    console.error(`${MODULE_ID} | Failed to start milestone, rolling back automatic awards`, err);
    for (const state of rollback.reverse()) {
      try {
        await state.actor.update({
          "system.details.fatePoints.refresh": state.oldRefresh,
          "system.override": state.oldOverride
        });
        if (state.oldBankFlag === undefined || state.oldBankFlag === null) await state.actor.unsetFlag(MODULE_ID, BANK_FLAG);
        else await state.actor.setFlag(MODULE_ID, BANK_FLAG, state.oldBankFlag);
      } catch (rollbackErr) {
        console.error(`${MODULE_ID} | Milestone rollback failed for ${state.actor?.name}`, rollbackErr);
      }
    }
    return globalThis.FateToolkitUX.error(err?.message || game.i18n.localize("FMS.StartFailed"));
  }

  try { await syncCampaignTimeline(session); } catch (err) {
    console.warn(`${MODULE_ID} | Timeline sync will be retried on session update`, err);
  }
  await announceMilestone(session);

  const targets = Object.values(session.actors).flatMap(row => row.userIds);
  broadcastToUsers({ type: "fawMilestoneOffer", sessionId: session.id }, targets);
  globalThis.FateToolkitUX.info(game.i18n.format("FMS.Started", { type: milestoneLabel(safeType) }));
  milestoneManager?.render(false);
}

async function finishMilestoneSession() {
  if (!game.user.isGM) return;
  const session = getSession();
  if (!session) return;
  const pending = Object.values(session.actors).filter(row => row.status !== "completed").length;
  if (pending) {
    const ok = await confirmDialog(game.i18n.localize("FMS.FinishSession"), `<p>${game.i18n.format("FMS.PendingWarning", { count: pending })}</p>`);
    if (!ok) return;
  }
  try { await syncCampaignTimeline(session, { closedAt: Date.now() }); }
  catch (err) {
    console.error(`${MODULE_ID} | Cannot close milestone without archiving it`, err);
    globalThis.FateToolkitUX.error(game.i18n.localize("FMS.Timeline.SaveFailed"));
    return;
  }
  await setSession({});
  broadcastToUsers({ type: "fawMilestoneClosed", sessionId: session.id }, Object.values(session.actors).flatMap(row => row.userIds));
  milestoneManager?.render(false);
}

function stuntDraftFromData(data) {
  const stunt = normalizeStuntData(data, { fallbackName: "" });
  return {
    libraryKey: "",
    name: stunt.name,
    description: stunt.description,
    linked_skill: stunt.linked_skill,
    bonus: stunt.bonus,
    refresh_cost: Math.max(0, Math.trunc(n(stunt.refresh_cost, 1))),
    overcome: stunt.overcome,
    caa: stunt.caa,
    attack: stunt.attack,
    defend: stunt.defend
  };
}

function blankDraft(actor, session) {
  const hc = highConceptEntry(actor);
  return {
    minor: {
      type: "none",
      skillA: "",
      skillB: "",
      aspectKey: "",
      aspectValue: "",
      stuntOldKey: "",
      stunt: stuntDraftFromData(defaultCustomStunt()),
      buyStunt: stuntDraftFromData(defaultCustomStunt())
    },
    skillRanks: {},
    skillReason: "",
    minorReason: "",
    highConceptValue: hc?.value ?? "",
    highConceptChanged: false,
    highConceptReason: "",
    majorStuntEnabled: false,
    majorStunt: stuntDraftFromData(defaultCustomStunt()),
    extremeAspectKey: "",
    extremeAspectValue: "",
    extremeReason: "",
    recoveries: {},
    recoveryReason: "",
    storyNote: ""
  };
}


function wizardStepDefinitions(session, hasRecoveries) {
  const defs = [
    { id: "overview", label: game.i18n.localize("FMS.WizardOverview") },
    { id: "minor", label: game.i18n.localize("FMS.MinorBenefit") }
  ];
  if (session?.type === "significant" || session?.type === "major") defs.push({ id: "skills", label: game.i18n.localize("FMS.SkillGrowth") });
  if (session?.type === "major") defs.push({ id: "major", label: game.i18n.localize("FMS.MajorBenefits") });
  if (hasRecoveries) defs.push({ id: "recovery", label: game.i18n.localize("FMS.Recovery") });
  defs.push({ id: "review", label: game.i18n.localize("FMS.WizardReview") });
  return defs;
}

function milestoneDraftKey(sessionId, actorId) {
  return `${sessionId ?? "none"}:${actorId ?? "none"}`;
}

function milestoneDraftStore() {
  let raw = globalThis.FateToolkitPrivateStorage?.readPrivateClientValue?.(DRAFTS_FLAG, undefined);
  if (raw === undefined) {
    // Upgrade continuity only: schema 5 removes the synchronized legacy flag.
    // Runtime never writes drafts back to User.flags.
    try { raw = game.user?.getFlag?.(MODULE_ID, DRAFTS_FLAG); } catch (_) {}
  }
  return raw && typeof raw === "object" && !Array.isArray(raw) ? clone(raw) : {};
}

function mergeDraft(actor, session, persisted) {
  const base = blankDraft(actor, session);
  if (!persisted || typeof persisted !== "object") return base;
  try {
    return foundry.utils.mergeObject(base, clone(persisted), { inplace: false, insertKeys: true, overwrite: true, recursive: true });
  } catch (_) {
    return Object.assign(base, clone(persisted));
  }
}

function loadMilestoneDraftState(actor, session) {
  if (!actor || !session?.id) return null;
  const entry = milestoneDraftStore()[milestoneDraftKey(session.id, actor.id)];
  if (!entry || entry.sessionId !== session.id || entry.actorId !== actor.id) return null;
  return entry;
}

async function saveMilestoneDraftState(actor, session, draft, currentStep) {
  if (!game.user || !actor || !session?.id) return;
  const store = milestoneDraftStore();
  const key = milestoneDraftKey(session.id, actor.id);
  store[key] = {
    sessionId: session.id,
    actorId: actor.id,
    draft: clone(draft),
    currentStep: String(currentStep || "overview"),
    updatedAt: Date.now()
  };
  const entries = Object.entries(store).sort((a, b) => n(b[1]?.updatedAt, 0) - n(a[1]?.updatedAt, 0));
  const trimmed = Object.fromEntries(entries.slice(0, 20));
  globalThis.FateToolkitPrivateStorage?.writePrivateClientValue?.(DRAFTS_FLAG, trimmed);
}

async function clearMilestoneDraftState(actor, sessionId = getSession()?.id) {
  if (!game.user || !actor || !sessionId) return;
  const store = milestoneDraftStore();
  const key = milestoneDraftKey(sessionId, actor.id);
  if (!(key in store)) return;
  delete store[key];
  globalThis.FateToolkitPrivateStorage?.writePrivateClientValue?.(DRAFTS_FLAG, Object.keys(store).length ? store : null);
}


function writePath(object, path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  let cursor = object;
  for (const key of keys) cursor = cursor[key] ??= {};
  cursor[last] = value;
}

function boolValue(input) {
  return input.type === "checkbox" ? input.checked : input.value;
}

function proposedBaseRanks(actor, sessionRow, draft) {
  const base = { ...(sessionRow?.baseline?.skills ?? skillRanks(actor)) };
  return applyMinorSkillSwap(base, draft.minor);
}

function proposedRanks(actor, sessionRow, draft) {
  const result = proposedBaseRanks(actor, sessionRow, draft);
  for (const [key, value] of Object.entries(draft.skillRanks ?? {})) {
    if (!(key in result)) result[key] = 0;
    result[key] = Math.max(result[key], Math.trunc(n(value, result[key])));
  }
  return result;
}

function skillSpend(actor, sessionRow, draft) {
  const base = proposedBaseRanks(actor, sessionRow, draft);
  const proposed = proposedRanks(actor, sessionRow, draft);
  let spent = 0;
  for (const key of new Set([...Object.keys(base), ...Object.keys(proposed)])) {
    spent += Math.max(0, Math.trunc(n(proposed[key], 0)) - Math.trunc(n(base[key], 0)));
  }
  return spent;
}

function maxAllowedSkillRank(session) {
  return session.type === "major" ? session.baseSkillCap + 1 : session.baseSkillCap;
}

function exceedsSkillCapOnAdvance(actor, session, row, draft) {
  const base = proposedBaseRanks(actor, row, draft);
  const cap = maxAllowedSkillRank(session);
  for (const [key, targetRaw] of Object.entries(draft?.skillRanks ?? {})) {
    const before = Math.trunc(n(base[key], 0));
    const target = Math.trunc(n(targetRaw, before));
    if (target > before && target > cap) return true;
  }
  return false;
}

function simulateRaise(actor, session, row, draft, key) {
  const base = proposedBaseRanks(actor, row, draft);
  const ranks = proposedRanks(actor, row, draft);
  const current = Math.trunc(n(ranks[key], 0));
  const available = Math.max(0, getSkillBank(actor) - skillSpend(actor, row, draft));
  if (available < 1) return { ok: false, reason: game.i18n.localize("FMS.NoSkillPoints") };
  const next = current + 1;
  if (next > maxAllowedSkillRank(session)) return { ok: false, reason: game.i18n.format("FMS.SkillCapBlocked", { cap: rankLabel(maxAllowedSkillRank(session)) }) };
  ranks[key] = next;
  if (session.strictColumns) {
    const columns = validateSkillColumns(ranks);
    if (!columns.valid) return { ok: false, reason: columns.message };
  }
  return { ok: true, reason: "", next, baseRank: base[key] ?? 0 };
}

function stuntCost(draft) {
  return Math.max(0, Math.trunc(n(draft?.refresh_cost, 1)));
}

function refreshProjection(actor, session, draft) {
  // Fate Core Official validates refresh as: current refresh + refresh spent <= allowed refresh.
  // Its refresh-spent value includes paid tracks, extras and stunt costs after freeStunts.
  // We mirror that validation instead of blindly charging one point for every newly-added stunt.
  const current = refreshValue(actor);
  const allowed = systemAllowances(actor).refresh;
  const spentBefore = nativeRefreshSpent(actor);

  const extraCostFor = addedNativeCost => {
    const beforeOver = Math.max(0, current + spentBefore - allowed);
    const afterOver = Math.max(0, current + spentBefore + addedNativeCost - allowed);
    return Math.max(0, afterOver - beforeOver);
  };

  // Replacing a stunt is a Fate minor-milestone exchange. Its existing refresh slot is preserved
  // by applyProposal, so only genuinely new stunts can lower refresh here.
  const minorNative = draft?.minor?.type === "buy-stunt" ? stuntCost(draft.minor.buyStunt) : 0;
  const minorCost = extraCostFor(minorNative);

  const afterMinorOver = Math.max(0, current + spentBefore + minorNative - allowed);
  const majorNative = session?.type === "major" && draft?.majorStuntEnabled ? stuntCost(draft.majorStunt) : 0;
  const afterAllOver = Math.max(0, current + spentBefore + minorNative + majorNative - allowed);
  const majorCost = Math.max(0, afterAllOver - afterMinorOver);
  const effectiveCost = minorCost + majorCost;

  return {
    current,
    allowed,
    spentBefore,
    minorNative,
    majorNative,
    minorCost,
    majorCost,
    effectiveCost,
    finalRefresh: current - effectiveCost
  };
}

function buildCustomStunt(draft) {
  return normalizeStuntData({
    name: String(draft?.name ?? "").trim(),
    description: String(draft?.description ?? ""),
    notes: "",
    linked_skill: String(draft?.linked_skill ?? "None") || "None",
    refresh_cost: stuntCost(draft),
    overcome: Boolean(draft?.overcome),
    caa: Boolean(draft?.caa),
    attack: Boolean(draft?.attack),
    defend: Boolean(draft?.defend),
    bonus: Math.trunc(n(draft?.bonus, 0)),
    boxes: 0,
    box_values: [],
    macro: null
  }, { fallbackName: "" });
}

function validateStuntDraft(draft) {
  const name = String(draft?.name ?? "").trim();
  if (!name) return { valid: false, message: game.i18n.localize("FMS.StuntNameRequired") };
  return { valid: true };
}

function boughtStuntSummary(name, cost) {
  return cost > 0
    ? game.i18n.format("FMS.SummaryBoughtStunt", { name, cost })
    : game.i18n.format("FMS.SummaryBoughtStuntFree", { name });
}

function validateDraftForDisplay(actor, session, row, draft, refreshPlan = refreshProjection(actor, session, draft), columnsOkay = true) {
  const fail = message => ({ valid: false, message });
  const minor = draft?.minor ?? { type: "none" };
  const allowedMinorTypes = ["none", "skills", "aspect", "stunt", "buy-stunt"];
  if (!allowedMinorTypes.includes(minor.type)) return fail(game.i18n.localize("FMS.InvalidMinorChoice"));

  if (minor.type === "skills") {
    const swap = validateMinorSkillSwap(row?.baseline?.skills ?? skillRanks(actor), minor);
    if (!swap.valid) return fail(swap.message);
  }
  if (minor.type === "aspect") {
    const aspect = actor.system?.aspects?.[minor.aspectKey];
    if (!minor.aspectKey || !aspect || isHighConcept(minor.aspectKey, aspect)) return fail(game.i18n.localize("FMS.ChooseAspect"));
    if (!String(minor.aspectValue ?? "").trim()) return fail(game.i18n.localize("FMS.AspectRequired"));
  }
  if (minor.type === "stunt") {
    const stunts = actor.system?.stunts ?? {};
    if (!minor.stuntOldKey || !stunts[minor.stuntOldKey]) return fail(game.i18n.localize("FMS.ChooseStunt"));
    const check = validateStuntDraft(minor.stunt);
    if (!check.valid) return fail(check.message);
    if (!verifyUniqueStuntName(stunts, minor.stunt.name, minor.stuntOldKey)) return fail(game.i18n.localize("FMS.DuplicateStunt"));
  }
  if (minor.type === "buy-stunt") {
    const check = validateStuntDraft(minor.buyStunt);
    if (!check.valid) return fail(check.message);
    if (!verifyUniqueStuntName(actor.system?.stunts ?? {}, minor.buyStunt.name)) return fail(game.i18n.localize("FMS.DuplicateStunt"));
  }

  if (session.type === "significant" || session.type === "major") {
    const spent = skillSpend(actor, row, draft);
    if (spent > getSkillBank(actor)) return fail(game.i18n.localize("FMS.NotEnoughSkillPoints"));
    if (exceedsSkillCapOnAdvance(actor, session, row, draft)) {
      return fail(game.i18n.localize("FMS.SkillCapExceeded"));
    }
    if (!columnsOkay) return fail(validateSkillColumns(proposedRanks(actor, row, draft)).message || game.i18n.localize("FMS.ColumnsInvalid"));
  } else if (Object.keys(draft.skillRanks ?? {}).length) {
    return fail(game.i18n.localize("FMS.NoSkillAdvanceMinor"));
  }

  if (session.type === "major") {
    if (draft.highConceptChanged && !String(draft.highConceptValue ?? "").trim()) return fail(game.i18n.localize("FMS.AspectRequired"));
    if (draft.majorStuntEnabled) {
      const check = validateStuntDraft(draft.majorStunt);
      if (!check.valid) return fail(check.message);
      if (!verifyUniqueStuntName(actor.system?.stunts ?? {}, draft.majorStunt.name)) return fail(game.i18n.localize("FMS.DuplicateStunt"));
    }
    if (draft.extremeAspectKey) {
      const aspect = actor.system?.aspects?.[draft.extremeAspectKey];
      if (!aspect || isHighConcept(draft.extremeAspectKey, aspect)) return fail(game.i18n.localize("FMS.InvalidExtremeAspect"));
      if (!String(draft.extremeAspectValue ?? "").trim()) return fail(game.i18n.localize("FMS.AspectRequired"));
      if (minor.type === "aspect" && minor.aspectKey === draft.extremeAspectKey) return fail(game.i18n.localize("FMS.SameAspectTwice"));
    }
  } else if (draft.highConceptChanged || draft.majorStuntEnabled || draft.extremeAspectKey) {
    return fail(game.i18n.localize("FMS.MajorOnly"));
  }

  for (const [trackKey, value] of Object.entries(draft.recoveries ?? {})) {
    const consequence = activeConsequenceEntries(actor).find(item => item.key === trackKey);
    if (!consequence || !consequence.editable || !allowedRecoveryHarm(session.type, consequence.harm)) return fail(game.i18n.localize("FMS.InvalidRecovery"));
    if (!String(value ?? "").trim()) return fail(game.i18n.localize("FMS.RecoveryNameRequired"));
  }

  if (refreshPlan.finalRefresh < 1) return fail(game.i18n.localize("FMS.RefreshFloor"));
  return { valid: true, message: game.i18n.localize("FMS.ReadyToApply") };
}

function validateWizardStep(actor, session, row, draft, stepId) {
  if (stepId === "overview") return { valid: true, message: game.i18n.localize("FMS.ReadyToApply") };
  const scoped = clone(draft);
  if (stepId === "minor") {
    scoped.skillRanks = {};
    scoped.highConceptChanged = false;
    scoped.majorStuntEnabled = false;
    scoped.extremeAspectKey = "";
    scoped.recoveries = {};
  } else if (stepId === "skills") {
    scoped.highConceptChanged = false;
    scoped.majorStuntEnabled = false;
    scoped.extremeAspectKey = "";
    scoped.recoveries = {};
  } else if (stepId === "major") {
    scoped.recoveries = {};
  }
  const refreshPlan = refreshProjection(actor, session, scoped);
  const spent = skillSpend(actor, row, scoped);
  const columnsOkay = !session.strictColumns || spent === 0 || validateSkillColumns(proposedRanks(actor, row, scoped)).valid;
  return validateDraftForDisplay(actor, session, row, scoped, refreshPlan, columnsOkay);
}


function assignedActorsForUser(session = getSession()) {
  if (!session) return [];
  return Object.values(session.actors)
    .filter(row => game.user.isGM || row.userIds?.includes(game.user.id))
    .map(row => game.actors.get(row.actorId))
    .filter(Boolean);
}

function summarizeDraft(actor, session, row, draft) {
  const summary = [];
  const refreshPlan = refreshProjection(actor, session, draft);
  const baseRanks = row.baseline.skills;
  const swapped = proposedBaseRanks(actor, row, draft);
  const finalRanks = proposedRanks(actor, row, draft);

  if (draft.minor.type === "skills") {
    const a = skillEntries(actor).find(skill => skill.key === draft.minor.skillA);
    const b = skillEntries(actor).find(skill => skill.key === draft.minor.skillB);
    if (a && b) summary.push(game.i18n.format("FMS.SummarySkillSwap", { a: a.name, ar: signed(baseRanks[a.key] ?? 0), b: b.name, br: signed(baseRanks[b.key] ?? 0) }));
  }
  if (draft.minor.type === "aspect") {
    const aspect = aspectEntries(actor).find(item => item.key === draft.minor.aspectKey);
    if (aspect) summary.push(game.i18n.format("FMS.SummaryAspect", { name: aspect.name, value: draft.minor.aspectValue }));
  }
  if (draft.minor.type === "stunt") {
    const old = stuntEntries(actor).find(item => item.key === draft.minor.stuntOldKey);
    summary.push(game.i18n.format("FMS.SummaryStuntSwap", { old: old?.name ?? "?", next: draft.minor.stunt.name || "?" }));
  }
  if (draft.minor.type === "buy-stunt") summary.push(boughtStuntSummary(draft.minor.buyStunt.name || "?", refreshPlan.minorCost));

  for (const key of Object.keys(finalRanks)) {
    const before = Math.trunc(n(swapped[key], 0));
    const after = Math.trunc(n(finalRanks[key], 0));
    if (after <= before) continue;
    const skill = skillEntries(actor).find(item => item.key === key);
    summary.push(game.i18n.format("FMS.SummarySkillRaise", { name: milestoneSkillLabel(skill?.name ?? key), before: signed(before), after: signed(after) }));
  }

  if (session.type === "major" && draft.highConceptChanged) {
    summary.push(game.i18n.format("FMS.SummaryHighConcept", { value: draft.highConceptValue }));
  }
  if (session.type === "major" && draft.majorStuntEnabled) {
    summary.push(boughtStuntSummary(draft.majorStunt.name || "?", refreshPlan.majorCost));
  }
  if (session.type === "major" && draft.extremeAspectKey) {
    const aspect = aspectEntries(actor).find(item => item.key === draft.extremeAspectKey);
    summary.push(game.i18n.format("FMS.SummaryExtreme", { name: aspect?.name ?? "?", value: draft.extremeAspectValue }));
  }
  for (const [trackKey, value] of Object.entries(draft.recoveries ?? {})) {
    if (!String(value ?? "").trim()) continue;
    const track = activeConsequenceEntries(actor).find(item => item.key === trackKey);
    if (track) summary.push(game.i18n.format("FMS.SummaryRecovery", { name: track.label, value }));
  }
  return summary;
}

function proposalFromDraft(actor, session, row, draft) {
  return {
    sessionId: session.id,
    actorId: actor.id,
    minor: clone(draft.minor),
    skillRanks: clone(draft.skillRanks),
    skillReason: String(draft.skillReason ?? "").trim(),
    minorReason: String(draft.minorReason ?? "").trim(),
    highConceptValue: String(draft.highConceptValue ?? "").trim(),
    highConceptChanged: Boolean(draft.highConceptChanged),
    highConceptReason: String(draft.highConceptReason ?? "").trim(),
    majorStuntEnabled: Boolean(draft.majorStuntEnabled),
    majorStunt: clone(draft.majorStunt),
    extremeAspectKey: String(draft.extremeAspectKey ?? ""),
    extremeAspectValue: String(draft.extremeAspectValue ?? "").trim(),
    extremeReason: String(draft.extremeReason ?? "").trim(),
    recoveries: clone(draft.recoveries),
    recoveryReason: String(draft.recoveryReason ?? "").trim(),
    storyNote: String(draft.storyNote ?? "").trim(),
    preview: summarizeDraft(actor, session, row, draft)
  };
}

function currentSkillMapForValidation(actor, baseline) {
  const now = skillRanks(actor);
  const keys = new Set([...Object.keys(now), ...Object.keys(baseline ?? {})]);
  for (const key of keys) {
    if (Math.trunc(n(now[key], 0)) !== Math.trunc(n(baseline?.[key], 0))) return false;
  }
  return true;
}

function allowedRecoveryHarm(type, harm) {
  if (harm === 4) return true;
  if ((type === "significant" || type === "major") && harm === 6) return true;
  return false;
}

function verifyUniqueStuntName(stunts, name, ignoreKey = null) {
  const wanted = String(name).trim().toLocaleLowerCase(game.i18n.lang);
  return !Object.entries(stunts).some(([key, stunt]) => key !== ignoreKey && String(stunt?.name ?? "").trim().toLocaleLowerCase(game.i18n.lang) === wanted);
}

async function applyProposal(payload) {
  if (!game.user.isGM || primaryActiveGM()?.id !== game.user.id) return;
  const session = getSession();
  const proposal = payload?.proposal;
  const user = game.users.get(payload?.userId);
  if (!session || !proposal || proposal.sessionId !== session.id) return;
  const row = session.actors?.[proposal.actorId];
  const actor = game.actors.get(proposal.actorId);
  if (!row || !actor || !user || (!user.isGM && !userOwnsActor(user, actor))) return;
  if (row.status === "completed") {
    return sendProposalResult(user.id, actor.id, false, game.i18n.localize("FMS.AlreadyCompleted"));
  }
  const lockKey = `${session.id}:${actor.id}`;
  if (milestoneProcessing.has(lockKey)) {
    return sendProposalResult(user.id, actor.id, false, game.i18n.localize("FMS.AlreadyProcessing"));
  }
  milestoneProcessing.add(lockKey);

  try {
    const baseline = row.baseline;
    const minor = proposal.minor ?? { type: "none" };
    const baseSkillRanks = { ...(baseline.skills ?? {}) };
    if (!currentSkillMapForValidation(actor, baseSkillRanks)) throw new Error(game.i18n.localize("FMS.SkillsChangedExternally"));

    const skills = clone(actor.system.skills ?? {});
    const aspects = clone(actor.system.aspects ?? {});
    const stunts = clone(actor.system.stunts ?? {});
    const tracks = clone(actor.system.tracks ?? {});
    const touchesStunts = minor.type === "stunt" || minor.type === "buy-stunt" || (session.type === "major" && proposal.majorStuntEnabled);
    if (touchesStunts && !sameStuntMap(actor, baseline.stunts)) throw new Error(game.i18n.localize("FMS.StuntsChangedExternally"));

    const refreshPlan = refreshProjection(actor, session, proposal);
    let finalRefresh = refreshPlan.finalRefresh;
    let skillBank = getSkillBank(actor);
    const reasons = [];
    const changes = [];
    if (row.auto?.skillPoints) changes.push(game.i18n.format("FMS.SummaryAutoSkillPoint", { count: row.auto.skillPoints }));
    if (row.auto?.refresh) changes.push(game.i18n.format("FMS.SummaryAutoRefresh", { count: row.auto.refresh }));

    const allowedMinorTypes = ["none", "skills", "aspect", "stunt", "buy-stunt"];
    if (!allowedMinorTypes.includes(minor.type)) throw new Error(game.i18n.localize("FMS.InvalidMinorChoice"));

    const swapCheck = validateMinorSkillSwap(baseSkillRanks, minor);
    if (!swapCheck.valid) throw new Error(swapCheck.message);
    if (minor.type === "skills") {
      const a = minor.skillA;
      const b = minor.skillB;
      const aRank = Math.trunc(n(skills[a]?.rank, 0));
      const bRank = Math.trunc(n(skills[b]?.rank, 0));
      skills[a].rank = bRank;
      skills[b].rank = aRank;
      changes.push(game.i18n.format("FMS.SummarySkillSwap", { a: skills[a]?.name ?? a, ar: signed(aRank), b: skills[b]?.name ?? b, br: signed(bRank) }));
    } else if (minor.type === "aspect") {
      const aspectKey = String(minor.aspectKey ?? "");
      const value = String(minor.aspectValue ?? "").trim();
      if (!aspectKey || !aspects[aspectKey] || isHighConcept(aspectKey, aspects[aspectKey])) throw new Error(game.i18n.localize("FMS.HighConceptMinorForbidden"));
      if (!value) throw new Error(game.i18n.localize("FMS.AspectRequired"));
      if (baseline.aspects?.[aspectKey] !== String(actor.system.aspects?.[aspectKey]?.value ?? "")) throw new Error(game.i18n.localize("FMS.AspectChangedExternally"));
      aspects[aspectKey].value = value;
      changes.push(game.i18n.format("FMS.SummaryAspect", { name: aspects[aspectKey].name ?? aspectKey, value }));
    } else if (minor.type === "stunt") {
      const oldKey = String(minor.stuntOldKey ?? "");
      if (!oldKey || !stunts[oldKey]) throw new Error(game.i18n.localize("FMS.ChooseStunt"));
      const check = validateStuntDraft(minor.stunt);
      if (!check.valid) throw new Error(check.message);
      if (!verifyUniqueStuntName(stunts, minor.stunt.name, oldKey)) throw new Error(game.i18n.localize("FMS.DuplicateStunt"));
      const oldName = String(stunts[oldKey].name ?? oldKey);
      const oldCost = Math.max(0, Math.trunc(n(stunts[oldKey].refresh_cost, 1)));
      stunts[oldKey] = normalizeStuntData(buildCustomStunt(minor.stunt), { preserveCost: oldCost });
      changes.push(game.i18n.format("FMS.SummaryStuntSwap", { old: oldName, next: stunts[oldKey].name }));
    } else if (minor.type === "buy-stunt") {
      const check = validateStuntDraft(minor.buyStunt);
      if (!check.valid) throw new Error(check.message);
      if (!verifyUniqueStuntName(stunts, minor.buyStunt.name)) throw new Error(game.i18n.localize("FMS.DuplicateStunt"));
      const stunt = buildCustomStunt(minor.buyStunt);
      const key = uniqueObjectKey(stunts, safeKey(stunt.name), stunt.name);
      stunts[key] = stunt;
      changes.push(boughtStuntSummary(stunt.name, refreshPlan.minorCost));
    }
    if (proposal.minorReason) reasons.push(`${game.i18n.localize("FMS.MinorBenefit")}: ${proposal.minorReason}`);

    const afterMinor = Object.fromEntries(Object.entries(skills).map(([key, skill]) => [key, Math.trunc(n(skill?.rank, 0))]));
    if (session.type === "significant" || session.type === "major") {
      const requested = proposal.skillRanks ?? {};
      let spent = 0;
      for (const [key, targetRaw] of Object.entries(requested)) {
        if (!skills[key]) {
          const library = worldSkillLibrary(actor).find(skill => safeKey(skill.name) === key || String(skill.name) === key);
          if (!library) continue;
          skills[key] = clone(library);
          skills[key].rank = 0;
          afterMinor[key] = 0;
        }
        const before = Math.trunc(n(afterMinor[key], 0));
        const target = Math.trunc(n(targetRaw, before));
        if (target < before) throw new Error(game.i18n.localize("FMS.AdvancementCannotLower"));
        if (target > before && target > maxAllowedSkillRank(session)) throw new Error(game.i18n.localize("FMS.SkillCapExceeded"));
        spent += target - before;
        skills[key].rank = target;
      }
      if (spent > skillBank) throw new Error(game.i18n.localize("FMS.NotEnoughSkillPoints"));
      const finalRanks = Object.fromEntries(Object.entries(skills).map(([key, skill]) => [key, Math.trunc(n(skill?.rank, 0))]));
      if (session.strictColumns && spent > 0) {
        const columns = validateSkillColumns(finalRanks);
        if (!columns.valid) throw new Error(columns.message);
      }
      if (spent > 0) {
        for (const [key, skill] of Object.entries(skills)) {
          const before = Math.trunc(n(afterMinor[key], 0));
          const after = Math.trunc(n(skill.rank, 0));
          if (after > before) changes.push(game.i18n.format("FMS.SummarySkillRaise", { name: milestoneSkillLabel(skill.name ?? key), before: signed(before), after: signed(after) }));
        }
        skillBank -= spent;
      }
      if (proposal.skillReason) reasons.push(`${game.i18n.localize("FMS.SkillGrowth")}: ${proposal.skillReason}`);
    } else if (Object.keys(proposal.skillRanks ?? {}).length) {
      throw new Error(game.i18n.localize("FMS.NoSkillAdvanceMinor"));
    }

    if (session.type === "major") {
      if (proposal.highConceptChanged) {
        const hc = Object.entries(aspects).find(([key, aspect]) => isHighConcept(key, aspect));
        if (!hc) throw new Error(game.i18n.localize("FMS.NoHighConcept"));
        const [key, aspect] = hc;
        const value = String(proposal.highConceptValue ?? "").trim();
        if (!value) throw new Error(game.i18n.localize("FMS.AspectRequired"));
        if (baseline.aspects?.[key] !== String(actor.system.aspects?.[key]?.value ?? "")) throw new Error(game.i18n.localize("FMS.AspectChangedExternally"));
        aspect.value = value;
        changes.push(game.i18n.format("FMS.SummaryHighConcept", { value }));
        if (proposal.highConceptReason) reasons.push(`${game.i18n.localize("FMS.HighConcept")}: ${proposal.highConceptReason}`);
      }

      if (proposal.majorStuntEnabled) {
        const check = validateStuntDraft(proposal.majorStunt);
        if (!check.valid) throw new Error(check.message);
        if (!verifyUniqueStuntName(stunts, proposal.majorStunt.name)) throw new Error(game.i18n.localize("FMS.DuplicateStunt"));
        const stunt = buildCustomStunt(proposal.majorStunt);
        const key = uniqueObjectKey(stunts, safeKey(stunt.name), stunt.name);
        stunts[key] = stunt;
        changes.push(boughtStuntSummary(stunt.name, refreshPlan.majorCost));
      }

      if (proposal.extremeAspectKey) {
        const key = String(proposal.extremeAspectKey);
        const value = String(proposal.extremeAspectValue ?? "").trim();
        if (!aspects[key] || isHighConcept(key, aspects[key])) throw new Error(game.i18n.localize("FMS.InvalidExtremeAspect"));
        if (!value) throw new Error(game.i18n.localize("FMS.AspectRequired"));
        if (proposal.highConceptChanged && isHighConcept(key, aspects[key])) throw new Error(game.i18n.localize("FMS.InvalidExtremeAspect"));
        if (minor.type === "aspect" && minor.aspectKey === key) throw new Error(game.i18n.localize("FMS.SameAspectTwice"));
        aspects[key].value = value;
        changes.push(game.i18n.format("FMS.SummaryExtreme", { name: aspects[key].name ?? key, value }));
        if (proposal.extremeReason) reasons.push(`${game.i18n.localize("FMS.ExtremeRecovery")}: ${proposal.extremeReason}`);
      }
    } else if (proposal.highConceptChanged || proposal.majorStuntEnabled || proposal.extremeAspectKey) {
      throw new Error(game.i18n.localize("FMS.MajorOnly"));
    }

    for (const [trackKey, newNameRaw] of Object.entries(proposal.recoveries ?? {})) {
      const newName = String(newNameRaw ?? "").trim();
      if (!newName) continue;
      const track = tracks[trackKey];
      const current = activeConsequenceEntries(actor).find(item => item.key === trackKey);
      if (!track || !current || !current.editable || !allowedRecoveryHarm(session.type, current.harm)) throw new Error(game.i18n.localize("FMS.InvalidRecovery"));
      track.aspect.name = newName;
      changes.push(game.i18n.format("FMS.SummaryRecovery", { name: current.label, value: newName }));
    }
    if (proposal.recoveryReason) reasons.push(`${game.i18n.localize("FMS.Recovery")}: ${proposal.recoveryReason}`);
    if (proposal.storyNote) reasons.push(`${game.i18n.localize("FMS.StoryNote")}: ${proposal.storyNote}`);

    if (finalRefresh < 1) throw new Error(game.i18n.localize("FMS.RefreshFloor"));

    const updates = {
      "system.skills": skills,
      "system.aspects": aspects,
      "system.stunts": stunts,
      "system.tracks": tracks,
      "system.details.fatePoints.refresh": finalRefresh
    };
    await actor.update(updates);
    await setSkillBank(actor, skillBank);

    const finalMax = Math.max(0, ...Object.values(skillRanks(actor)));
    if (session.type === "major" && finalMax > session.baseSkillCap) {
      const worldCap = Math.max(1, Math.trunc(n(game.settings.get(MODULE_ID, CAP_SETTING), session.baseSkillCap)));
      if (finalMax > worldCap) await game.settings.set(MODULE_ID, CAP_SETTING, finalMax);
    }

    const entries = historyForActor(actor);
    entries.push({
      id: session.id,
      type: session.type,
      title: session.title,
      sessionNumber: session.sessionNumber || "",
      gameDate: session.gameDate || "",
      at: Date.now(),
      before: row.before ?? row.baseline,
      after: snapshotActor(actor),
      choice: {
        minor: clone(proposal.minor), skillRanks: clone(proposal.skillRanks),
        highConceptChanged: !!proposal.highConceptChanged,
        majorStuntEnabled: !!proposal.majorStuntEnabled,
        extremeAspectKey: proposal.extremeAspectKey ?? "",
        recoveries: clone(proposal.recoveries ?? {}),
        storyNote: String(proposal.storyNote ?? "")
      },
      changes,
      reasons,
      refresh: finalRefresh,
      skillBank
    });
    await actor.setFlag(MODULE_ID, HISTORY_FLAG, entries);

    const latest = getSession();
    if (!latest || latest.id !== session.id) throw new Error(game.i18n.localize("FMS.SessionEnded"));
    latest.actors[actor.id].status = "completed";
    latest.actors[actor.id].completedAt = Date.now();
    latest.actors[actor.id].completedBy = user.id;
    latest.actors[actor.id].summary = changes;
    latest.actors[actor.id].reasons = reasons;
    latest.actors[actor.id].finalRefresh = finalRefresh;
    latest.actors[actor.id].finalSkillBank = skillBank;
    await setSession(latest);
    try { await syncCampaignTimeline(latest); }
    catch (timelineError) { console.warn(`${MODULE_ID} | Timeline update pending retry`, timelineError); }

    try { game.socket.emit(`system.${SYSTEM_ID}`, { render: true }); } catch (_) {}
    if (latest.postToChat) await postCompletionToChat(actor, latest, changes, reasons);
    sendProposalResult(user.id, actor.id, true, game.i18n.localize("FMS.Saved"));
    milestoneManager?.render(false);
  } catch (err) {
    console.error(`${MODULE_ID} | Milestone proposal rejected`, err);
    sendProposalResult(user.id, actor.id, false, err?.message || game.i18n.localize("FMS.SaveFailed"));
  } finally {
    milestoneProcessing.delete(lockKey);
  }
}

function sendProposalResult(userId, actorId, ok, message) {
  if (userId === game.user.id) handleProposalResult({ actorId, ok, message });
  else void milestoneRpcToUser(userId, { type: "fawMilestoneResult", actorId, ok, message });
}

async function postCompletionToChat(actor, session, changes, reasons) {
  const changeHtml = changes.length ? `<ul>${changes.map(line => `<li>${escapeHtml(line)}</li>`).join("")}</ul>` : `<p>${game.i18n.localize("FMS.NoOptionalChanges")}</p>`;
  const reasonHtml = reasons.length ? `<details><summary>${game.i18n.localize("FMS.StoryExplanation")}</summary><ul>${reasons.map(line => `<li>${escapeHtml(line)}</li>`).join("")}</ul></details>` : "";
  const allowances = systemAllowances(actor);
  const content = `<div class="fms-chat"><h3><i class="fa-solid fa-road" aria-hidden="true"></i> ${escapeHtml(actor.name)} — ${escapeHtml(milestoneLabel(session.type))}</h3>${changeHtml}${reasonHtml}<p class="fms-chat-meta">${game.i18n.localize("FMS.Refresh")}: ${refreshValue(actor)} / ${allowances.refresh} · ${game.i18n.localize("FMS.AllowedSkillTotal")}: ${allowances.skillPoints} · ${game.i18n.localize("FMS.SkillPointsBank")}: ${getSkillBank(actor)}</p></div>`;
  await ChatMessage.create({ content, speaker: ChatMessage.getSpeaker({ actor }) });
}

function handleProposalResult(payload) {
  const app = milestoneApps.get(payload.actorId);
  if (payload.ok) {
    globalThis.FateToolkitUX.info(payload.message);
    if (app) {
      void clearMilestoneDraftState(app.actor, app.sessionId);
      app.currentStep = "review";
    }
    app?.render(false);
  } else {
    globalThis.FateToolkitUX.error(payload.message);
    if (app) {
      app.submitting = false;
      app.render(false);
    }
  }
}

async function sendProposal(actor, draft) {
  const session = getSession();
  const row = session?.actors?.[actor.id];
  if (!session || !row) return globalThis.FateToolkitUX.warn(game.i18n.localize("FMS.NoActiveForActor"));
  const proposal = proposalFromDraft(actor, session, row, draft);
  const gm = primaryActiveGM();
  if (!gm) return globalThis.FateToolkitUX.warn(game.i18n.localize("FMS.NoGM"));
  if (game.user.isGM && gm.id === game.user.id) {
    return applyProposal({ proposal, userId: game.user.id });
  }
  await milestoneRpcToGM({ type: "fawMilestoneSubmit", proposal });
}

function openMilestoneForActor(actorId) {
  const actor = game.actors.get(actorId);
  const session = getSession();
  if (!actor || !session?.actors?.[actorId]) return;
  if (!game.user.isGM && !session.actors[actorId].userIds?.includes(game.user.id)) return;
  let app = milestoneApps.get(actorId);
  if (!app) {
    app = new MilestonePlayerApp(actor);
    milestoneApps.set(actorId, app);
  }
  return app.render(true);
}

function openAssignedMilestones() {
  const actors = assignedActorsForUser();
  if (!actors.length) return globalThis.FateToolkitUX.info(game.i18n.localize("FMS.NoActiveForUser"));
  for (const actor of actors) openMilestoneForActor(actor.id);
}

function openMilestoneManager() {
  if (!game.user.isGM) return openAssignedMilestones();
  milestoneManager ??= new MilestoneManagerApp();
  return milestoneManager.render(true);
}

class MilestoneManagerApp extends AppV2 {
  constructor(...args) {
    super(...args);
    this.selectedActorIds = new Set(eligibleActors().map(actor => actor.id));
    this.type = "minor";
    this.draftTitle = "";
    this.draftNote = "";
    this.sessionNumber = suggestedSessionNumber();
    this.gameDate = "";
    this.draftCap = null;
    this.strictColumns = true;
    this.postToChat = true;
  }

  _captureSetup() {
    if (!this.element) return;
    this.draftTitle = this.element.querySelector("[name='title']")?.value ?? this.draftTitle;
    this.draftNote = this.element.querySelector("[name='note']")?.value ?? this.draftNote;
    this.sessionNumber = this.element.querySelector("[name='sessionNumber']")?.value ?? this.sessionNumber;
    this.gameDate = this.element.querySelector("[name='gameDate']")?.value ?? this.gameDate;
    this.draftCap = this.element.querySelector("[name='cap']")?.value ?? this.draftCap;
    this.strictColumns = this.element.querySelector("[name='strictColumns']")?.checked ?? this.strictColumns;
    this.postToChat = this.element.querySelector("[name='postToChat']")?.checked ?? this.postToChat;
  }

  static DEFAULT_OPTIONS = {
    id: "fate-milestone-manager",
    classes: ["fate", "fms-window", "fms-manager-window"],
    window: { title: "FMS.ManagerTitle", icon: "fa-solid fa-road", resizable: true },
    position: { width: 650, height: 720 }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/milestone-manager.hbs`, scrollable: [".fms-scroll"] }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const session = getSession();
    if (session) {
      const rows = Object.values(session.actors).map(row => {
        const actor = game.actors.get(row.actorId);
        return {
          actorId: row.actorId,
          name: actor?.name ?? row.actorId,
          img: actor?.img ?? "icons/svg/mystery-man.svg",
          owners: (row.userIds ?? []).map(id => game.users.get(id)?.name).filter(Boolean).join(", "),
          completed: row.status === "completed",
          pending: row.status !== "completed",
          summary: row.summary ?? [],
          hasSummary: (row.summary ?? []).length > 0,
          refresh: actor ? refreshValue(actor) : row.finalRefresh,
          allowedRefresh: actor ? systemAllowances(actor).refresh : row.baseline?.allowedRefresh,
          allowedSkillTotal: actor ? systemAllowances(actor).skillPoints : row.baseline?.allowedSkillTotal,
          bank: actor ? getSkillBank(actor) : row.finalSkillBank
        };
      });
      return foundry.utils.mergeObject(context, {
        active: true,
        session,
        typeLabel: milestoneLabel(session.type),
        ruleText: milestoneRuleText(session.type),
        rows,
        completedCount: rows.filter(row => row.completed).length,
        totalCount: rows.length
      });
    }

    const actors = eligibleActors().map(actor => ({
      id: actor.id,
      name: actor.name,
      img: actor.img,
      owners: ownersForActor(actor).map(user => user.name).join(", "),
      selected: this.selectedActorIds.has(actor.id),
      refresh: refreshValue(actor),
      allowedRefresh: systemAllowances(actor).refresh,
      allowedSkillTotal: systemAllowances(actor).skillPoints,
      bank: getSkillBank(actor)
    }));
    const configuredCap = Math.max(1, Math.trunc(n(game.settings.get(MODULE_ID, CAP_SETTING), 4)));
    const observedCap = Math.max(1, ...eligibleActors().flatMap(actor => Object.values(skillRanks(actor))).map(rank => Math.trunc(n(rank, 0))));
    const inferredCap = Math.max(configuredCap, observedCap);
    const cap = Math.max(1, Math.trunc(n(this.draftCap, inferredCap)));
    return foundry.utils.mergeObject(context, {
      active: false,
      actors,
      hasActors: actors.length > 0,
      cap,
      draftTitle: this.draftTitle,
      draftNote: this.draftNote,
      sessionNumber: this.sessionNumber,
      gameDate: this.gameDate,
      strictColumns: this.strictColumns,
      postToChat: this.postToChat,
      type: this.type,
      minorSelected: this.type === "minor",
      significantSelected: this.type === "significant",
      majorSelected: this.type === "major",
      ruleText: milestoneRuleText(this.type)
    });
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const session = getSession();
    if (session) {
      this.element.querySelectorAll("[data-fms-open-actor]").forEach(button => button.addEventListener("click", event => openMilestoneForActor(event.currentTarget.dataset.fmsOpenActor)));
      this.element.querySelectorAll("[data-fms-remind]").forEach(button => button.addEventListener("click", event => {
        const actorId = event.currentTarget.dataset.fmsRemind;
        const row = getSession()?.actors?.[actorId];
        if (!row) return;
        broadcastToUsers({ type: "fawMilestoneOffer", sessionId: session.id, actorId }, row.userIds ?? []);
        globalThis.FateToolkitUX.info(game.i18n.localize("FMS.ReminderSent"));
      }));
      this.element.querySelector("[data-fms-finish-session]")?.addEventListener("click", () => void finishMilestoneSession());
      return;
    }

    this.element.querySelectorAll("input[name='actorId']").forEach(input => input.addEventListener("change", event => {
      if (event.currentTarget.checked) this.selectedActorIds.add(event.currentTarget.value);
      else this.selectedActorIds.delete(event.currentTarget.value);
    }));
    this.element.querySelectorAll("[data-fms-type]").forEach(button => button.addEventListener("click", event => {
      this._captureSetup();
      this.type = String(event.currentTarget.dataset.fmsType || "minor");
      void this.render(false);
    }));
    for (const selector of ["[name='title']", "[name='note']", "[name='cap']", "[name='strictColumns']", "[name='postToChat']", "[name='sessionNumber']", "[name='gameDate']"]) {
      const input = this.element.querySelector(selector);
      input?.addEventListener("input", () => this._captureSetup());
      input?.addEventListener("change", () => this._captureSetup());
    }
    this.element.querySelector("[data-fms-select-all]")?.addEventListener("click", () => {
      this.selectedActorIds = new Set(eligibleActors().map(actor => actor.id));
      void this.render(false);
    });
    this.element.querySelector("[data-fms-select-none]")?.addEventListener("click", () => {
      this.selectedActorIds.clear();
      void this.render(false);
    });
    this.element.querySelector('[name="gameDate"]')?.addEventListener('input',event=>{
      const normalized=normaliseWorldDate(event.currentTarget.value);
      if(event.currentTarget.value!==normalized)event.currentTarget.value=normalized;
      this.gameDate=normalized;
    });
    this.element.querySelector("[data-fms-start]")?.addEventListener("click", () => {
      this._captureSetup();
      if(!isValidWorldDate(this.gameDate)){
        ui.notifications.error('Проверьте дату игрового мира: ДД.ММ.ГГГГ.');return;
      }
      const type = this.element.querySelector("[name='type']")?.value ?? this.type;
      const title = this.draftTitle;
      const note = this.draftNote;
      const cap = this.draftCap ?? 4;
      void startMilestone({ type, title, note, actorIds: Array.from(this.selectedActorIds), strictColumns: this.strictColumns, postToChat: this.postToChat, baseSkillCap: cap, sessionNumber: this.sessionNumber, gameDate: this.gameDate });
    });
  }
}

class MilestonePlayerApp extends AppV2 {
  constructor(actor, ...args) {
    super(...args);
    this.actor = actor;
    const session = getSession();
    this.sessionId = session?.id ?? null;
    const persisted = loadMilestoneDraftState(actor, session);
    this.draft = mergeDraft(actor, session, persisted?.draft);
    this.currentStep = persisted?.currentStep ?? "overview";
    this.submitting = false;
    this._draftSaveTimer = null;
  }

  static DEFAULT_OPTIONS = {
    classes: ["fate", "fms-window", "fms-player-window"],
    window: { icon: "fa-solid fa-road", resizable: true },
    position: { width: 780, height: 820 }
  };

  get id() { return `fate-milestone-${this.actor.id}`; }
  get title() { return `${game.i18n.localize("FMS.PlayerTitle")}: ${this.actor.name}`; }

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/milestone-player.hbs`, scrollable: [".fms-scroll"] }
  };

  _ensureSessionDraft() {
    const session = getSession();
    if (session?.id !== this.sessionId) {
      this.sessionId = session?.id ?? null;
      const persisted = loadMilestoneDraftState(this.actor, session);
      this.draft = mergeDraft(this.actor, session, persisted?.draft);
      this.currentStep = persisted?.currentStep ?? "overview";
    }
    return session;
  }

  _scheduleDraftSave() {
    if (this._draftSaveTimer) clearTimeout(this._draftSaveTimer);
    this._draftSaveTimer = setTimeout(() => {
      this._draftSaveTimer = null;
      const session = getSession();
      if (session?.id === this.sessionId && session?.actors?.[this.actor.id]?.status !== "completed") {
        void saveMilestoneDraftState(this.actor, session, this.draft, this.currentStep).catch(err => console.warn(`${MODULE_ID} | Could not autosave milestone draft`, err));
      }
    }, 450);
  }

  async _persistDraftNow() {
    if (this._draftSaveTimer) {
      clearTimeout(this._draftSaveTimer);
      this._draftSaveTimer = null;
    }
    const session = getSession();
    if (session?.id === this.sessionId && session?.actors?.[this.actor.id]?.status !== "completed") {
      try {
        await saveMilestoneDraftState(this.actor, session, this.draft, this.currentStep);
      } catch (err) {
        console.warn(`${MODULE_ID} | Could not persist milestone draft`, err);
      }
    }
  }

  async close(options) {
    try {
      if (this.element && getSession()?.actors?.[this.actor.id]?.status !== "completed") this._captureInputs();
      await this._persistDraftNow();
    } catch (err) {
      console.warn(`${MODULE_ID} | Could not persist milestone draft on close`, err);
    }
    return super.close(options);
  }

  _stuntLibraryContext(selectedKey = "") {
    return worldStuntLibrary().map(row => ({ key: row.key, name: row.name, cost: row.cost, selected: row.key === selectedKey }));
  }

  _skillContext(session, row) {
    const baseAfterMinor = proposedBaseRanks(this.actor, row, this.draft);
    const ranks = proposedRanks(this.actor, row, this.draft);
    const bank = getSkillBank(this.actor);
    const spent = skillSpend(this.actor, row, this.draft);
    const remaining = Math.max(0, bank - spent);
    const byKey = new Map(skillEntries(this.actor).map(item => [item.key, item]));
    const world = worldSkillLibrary(this.actor);
    for (const skill of world) {
      const existing = Array.from(byKey.values()).find(item => item.name.toLocaleLowerCase(game.i18n.lang) === String(skill.name).toLocaleLowerCase(game.i18n.lang));
      if (!existing) {
        const key = safeKey(skill.name);
        byKey.set(key, { key, name: String(skill.name), rank: 0, data: skill });
        baseAfterMinor[key] ??= 0;
        ranks[key] ??= 0;
      }
    }

    const rows = Array.from(byKey.values()).map(skill => {
      const baseRank = Math.trunc(n(baseAfterMinor[skill.key], 0));
      const target = Math.trunc(n(ranks[skill.key], baseRank));
      const raise = simulateRaise(this.actor, session, row, this.draft, skill.key);
      return {
        key: skill.key,
        name: skill.label || milestoneSkillLabel(skill.name),
        baseRank,
        target,
        targetLabel: rankLabel(target),
        changed: target !== baseRank,
        canRaise: raise.ok,
        raiseReason: raise.reason,
        canUndo: target > baseRank,
        inactive: target <= 0
      };
    }).sort((a, b) => Number(b.changed) - Number(a.changed) || Number(b.canRaise) - Number(a.canRaise) || (b.target - a.target) || a.name.localeCompare(b.name, game.i18n.lang));
    const finalColumns = validateSkillColumns(ranks);
    return { rows, bank, spent, remaining, finalColumns, ranks, raiseableCount: rows.filter(row => row.canRaise).length };
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const session = this._ensureSessionDraft();
    const row = session?.actors?.[this.actor.id];
    if (!session || !row) return foundry.utils.mergeObject(context, { missing: true, actor: this.actor });
    const completed = row.status === "completed";
    const skillContext = this._skillContext(session, row);
    const aspects = aspectEntries(this.actor);
    const hc = aspects.find(item => item.highConcept) ?? null;
    const normalAspects = aspects.filter(item => !item.highConcept).map(item => ({
      ...item,
      selectedMinor: this.draft.minor.aspectKey === item.key,
      selectedExtreme: this.draft.extremeAspectKey === item.key
    }));
    const skillsForSelect = skillEntries(this.actor).sort((a, b) => (b.rank - a.rank) || a.name.localeCompare(b.name, game.i18n.lang)).map(item => ({
      ...item,
      label: `${item.label || milestoneSkillLabel(item.name)} ${signed(item.rank)}`,
      selectedA: this.draft.minor.skillA === item.key,
      selectedB: this.draft.minor.skillB === item.key
    }));
    const stunts = stuntEntries(this.actor).map(item => ({ ...item, selected: this.draft.minor.stuntOldKey === item.key }));
    const recoveries = activeConsequenceEntries(this.actor).map(item => {
      const allowed = allowedRecoveryHarm(session.type, item.harm);
      return {
        ...item,
        allowed,
        checked: Object.prototype.hasOwnProperty.call(this.draft.recoveries, item.key),
        draftName: this.draft.recoveries[item.key] ?? item.name,
        severity: item.harm === 4 ? game.i18n.localize("FMS.Moderate") : item.harm === 6 ? game.i18n.localize("FMS.Severe") : game.i18n.localize("FMS.Extreme")
      };
    });
    const stuntLibraryMinorStunt = this._stuntLibraryContext(this.draft.minor.stunt.libraryKey);
    const stuntLibraryMinorBuy = this._stuntLibraryContext(this.draft.minor.buyStunt.libraryKey);
    const stuntLibraryMajor = this._stuntLibraryContext(this.draft.majorStunt.libraryKey);
    const refreshPlan = refreshProjection(this.actor, session, this.draft);
    const finalRefresh = refreshPlan.finalRefresh;
    const preview = summarizeDraft(this.actor, session, row, this.draft);
    const columnsOkay = !session.strictColumns || skillContext.spent === 0 || skillContext.finalColumns.valid;
    const validation = validateDraftForDisplay(this.actor, session, row, this.draft, refreshPlan, columnsOkay);
    const canSubmit = !completed && !this.submitting && validation.valid;
    const wizardDefs = wizardStepDefinitions(session, recoveries.some(item => item.allowed));
    let currentIndex = wizardDefs.findIndex(step => step.id === this.currentStep);
    if (currentIndex < 0) {
      currentIndex = 0;
      this.currentStep = wizardDefs[0]?.id ?? "overview";
    }
    const wizardSteps = wizardDefs.map((step, index) => ({
      ...step,
      number: index + 1,
      active: index === currentIndex,
      complete: index < currentIndex,
      clickable: index <= currentIndex
    }));
    const currentStepLabel = wizardDefs[currentIndex]?.label ?? "";
    const wizardProgressText = game.i18n.format("FMS.StepProgress", { current: currentIndex + 1, total: wizardDefs.length });
    const currentStepValidation = validateWizardStep(this.actor, session, row, this.draft, this.currentStep);

    return foundry.utils.mergeObject(context, {
      missing: false,
      actor: this.actor,
      actorName: this.actor.name,
      actorImg: this.actor.img,
      session,
      row,
      completed,
      pending: !completed,
      typeLabel: milestoneLabel(session.type),
      ruleText: milestoneRuleText(session.type),
      isMinor: session.type === "minor",
      isSignificant: session.type === "significant",
      isMajor: session.type === "major",
      refresh: refreshValue(this.actor),
      allowedRefresh: systemAllowances(this.actor).refresh,
      allowedSkillTotal: systemAllowances(this.actor).skillPoints,
      currentFatePoints: currentFatePoints(this.actor),
      finalRefresh,
      refreshPlan,
      refreshOkay: finalRefresh >= 1,
      autoRefresh: row.auto?.refresh ?? 0,
      autoSkillPoints: row.auto?.skillPoints ?? 0,
      skillContext,
      showSkillAdvance: session.type === "significant" || session.type === "major",
      cap: session.baseSkillCap,
      maxCap: maxAllowedSkillRank(session),
      strictColumns: session.strictColumns,
      skillsForSelect,
      normalAspects,
      highConcept: hc,
      stunts,
      stuntLibraryMinorStunt,
      stuntLibraryMinorBuy,
      stuntLibraryMajor,
      stuntSkillsMinor: skillEntries(this.actor).map(row=>({name:row.name,label:row.label,selected:row.name===this.draft.minor.stunt.linked_skill})),
      stuntSkillsBuy: skillEntries(this.actor).map(row=>({name:row.name,label:row.label,selected:row.name===this.draft.minor.buyStunt.linked_skill})),
      stuntSkillsMajor: skillEntries(this.actor).map(row=>({name:row.name,label:row.label,selected:row.name===this.draft.majorStunt.linked_skill})),
      minorStuntLinkedSkill: this.draft.minor.stunt.linked_skill === "None" ? "" : String(this.draft.minor.stunt.linked_skill || ""),
      minorBuyStuntLinkedSkill: this.draft.minor.buyStunt.linked_skill === "None" ? "" : String(this.draft.minor.buyStunt.linked_skill || ""),
      majorStuntLinkedSkill: this.draft.majorStunt.linked_skill === "None" ? "" : String(this.draft.majorStunt.linked_skill || ""),
      recoveries,
      hasRecoveries: recoveries.some(item => item.allowed),
      draft: this.draft,
      minorNone: this.draft.minor.type === "none",
      minorSkills: this.draft.minor.type === "skills",
      minorAspect: this.draft.minor.type === "aspect",
      minorStunt: this.draft.minor.type === "stunt",
      minorBuyStunt: this.draft.minor.type === "buy-stunt",
      preview,
      hasPreview: preview.length > 0,
      validation,
      canSubmit,
      submitting: this.submitting,
      wizardSteps,
      currentStepLabel,
      wizardProgressText,
      currentStepValidation,
      hasPreviousStep: currentIndex > 0,
      hasNextStep: currentIndex < wizardDefs.length - 1,
      canAdvanceStep: currentStepValidation.valid,
      stepOverview: this.currentStep === "overview",
      stepMinor: this.currentStep === "minor",
      stepSkills: this.currentStep === "skills",
      stepMajor: this.currentStep === "major",
      stepRecovery: this.currentStep === "recovery",
      stepReview: this.currentStep === "review",
      summary: row.summary ?? [],
      hasSummary: (row.summary ?? []).length > 0,
      reasons: row.reasons ?? [],
      hasReasons: (row.reasons ?? []).length > 0
    });
  }

  _captureInputs() {
    this.element.querySelectorAll("[data-fms-path]").forEach(input => {
      const path = input.dataset.fmsPath;
      let value = boolValue(input);
      if (input.type === "number") value = n(value, 0);
      writePath(this.draft, path, value);
    });
  }

  _updateLiveValidation() {
    const session = getSession();
    const row = session?.actors?.[this.actor.id];
    if (!session || !row || row.status === "completed") return;
    const refreshPlan = refreshProjection(this.actor, session, this.draft);
    const spent = skillSpend(this.actor, row, this.draft);
    const columnsOkay = !session.strictColumns || spent === 0 || validateSkillColumns(proposedRanks(this.actor, row, this.draft)).valid;
    const validation = validateDraftForDisplay(this.actor, session, row, this.draft, refreshPlan, columnsOkay);

    const box = this.element?.querySelector(".fms-submit-validation");
    if (box) {
      box.classList.toggle("good", validation.valid);
      box.classList.toggle("bad", !validation.valid);
      const icon = box.querySelector("i");
      if (icon) icon.className = validation.valid ? "fa-solid fa-circle-check" : "fa-solid fa-triangle-exclamation";
      const text = box.querySelector("span");
      if (text) text.textContent = validation.message;
    }

    const button = this.element?.querySelector("[data-fms-submit]");
    if (button && !this.submitting) button.disabled = !validation.valid;
    const nextButton = this.element?.querySelector("[data-fms-next]");
    const stepValidation = validateWizardStep(this.actor, session, row, this.draft, this.currentStep);
    if (nextButton) {
      nextButton.disabled = !stepValidation.valid;
      nextButton.title = stepValidation.valid ? "" : stepValidation.message;
    }
    const stepBox = this.element?.querySelector(".fms-step-validation");
    if (stepBox) {
      stepBox.hidden = stepValidation.valid;
      const stepText = stepBox.querySelector("span");
      if (stepText) stepText.textContent = stepValidation.message;
    }
  }

  _fillStunt(slot, libraryKey) {
    const lib = worldStuntLibrary().find(item => item.key === libraryKey);
    if (!lib) return;
    const next = stuntDraftFromData(lib.data);
    next.libraryKey = libraryKey;
    // A minor milestone exchanges one stunt for another. Keep the refresh slot of
    // the stunt being replaced even when the world library template has a custom cost.
    if (slot === "minor.stunt" && this.draft.minor.stuntOldKey) {
      const old = this.actor.system?.stunts?.[this.draft.minor.stuntOldKey];
      if (old) next.refresh_cost = Math.max(0, Math.trunc(n(old.refresh_cost, 1)));
    }
    writePath(this.draft, slot, next);
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    if (context.missing || context.completed) return;

    const navigate = async delta => {
      this._captureInputs();
      const session = getSession();
      const row = session?.actors?.[this.actor.id];
      if (!session || !row) return;
      const recoveries = activeConsequenceEntries(this.actor).some(item => allowedRecoveryHarm(session.type, item.harm));
      const defs = wizardStepDefinitions(session, recoveries);
      let index = defs.findIndex(step => step.id === this.currentStep);
      if (index < 0) index = 0;
      if (delta > 0) {
        const validation = validateWizardStep(this.actor, session, row, this.draft, this.currentStep);
        if (!validation.valid) return globalThis.FateToolkitUX.warn(validation.message);
      }
      const next = Math.max(0, Math.min(defs.length - 1, index + delta));
      this.currentStep = defs[next]?.id ?? "overview";
      await this._persistDraftNow();
      void this.render(false);
    };

    this.element.querySelector("[data-fms-previous]")?.addEventListener("click", () => void navigate(-1));
    this.element.querySelector("[data-fms-next]")?.addEventListener("click", () => void navigate(1));
    this.element.querySelectorAll("[data-fms-goto-step]").forEach(button => button.addEventListener("click", async event => {
      if (event.currentTarget.disabled) return;
      this._captureInputs();
      this.currentStep = event.currentTarget.dataset.fmsGotoStep || this.currentStep;
      await this._persistDraftNow();
      void this.render(false);
    }));
    this.element.querySelector("[data-fms-restart]")?.addEventListener("click", async () => {
      const ok = await confirmDialog(game.i18n.localize("FMS.RestartWizard"), `<p>${game.i18n.localize("FMS.RestartWizardText")}</p>`);
      if (!ok) return;
      this.draft = blankDraft(this.actor, getSession());
      this.currentStep = "overview";
      await clearMilestoneDraftState(this.actor, this.sessionId);
      void this.render(false);
    });

    this.element.querySelectorAll("[data-fms-path]").forEach(input => {
      const update = () => {
        let value = boolValue(input);
        if (input.type === "number") value = n(value, 0);
        writePath(this.draft, input.dataset.fmsPath, value);
        this._updateLiveValidation();
        this._scheduleDraftSave();
      };
      input.addEventListener("input", update);
      input.addEventListener("change", update);
    });

    this.element.querySelector("[name='minorType']")?.addEventListener("change", event => {
      this._captureInputs();
      this.draft.minor.type = event.currentTarget.value;
      this.draft.skillRanks = {};
      this._scheduleDraftSave();
      void this.render(false);
    });
    this.element.querySelector("[name='minorSkillA']")?.addEventListener("change", event => {
      this._captureInputs();
      this.draft.minor.skillA = event.currentTarget.value;
      this.draft.skillRanks = {};
      this._scheduleDraftSave();
      void this.render(false);
    });
    this.element.querySelector("[name='minorSkillB']")?.addEventListener("change", event => {
      this._captureInputs();
      this.draft.minor.skillB = event.currentTarget.value;
      this.draft.skillRanks = {};
      this._scheduleDraftSave();
      void this.render(false);
    });

    this.element.querySelectorAll("[data-fms-raise]").forEach(button => button.addEventListener("click", event => {
      this._captureInputs();
      const key = event.currentTarget.dataset.fmsRaise;
      const row = getSession()?.actors?.[this.actor.id];
      const base = proposedBaseRanks(this.actor, row, this.draft);
      const current = Math.trunc(n(this.draft.skillRanks[key], base[key] ?? 0));
      this.draft.skillRanks[key] = current + 1;
      this._scheduleDraftSave();
      void this.render(false);
    }));
    this.element.querySelectorAll("[data-fms-undo-skill]").forEach(button => button.addEventListener("click", event => {
      this._captureInputs();
      const key = event.currentTarget.dataset.fmsUndoSkill;
      const row = getSession()?.actors?.[this.actor.id];
      const base = proposedBaseRanks(this.actor, row, this.draft);
      const current = Math.trunc(n(this.draft.skillRanks[key], base[key] ?? 0));
      const next = Math.max(base[key] ?? 0, current - 1);
      if (next === (base[key] ?? 0)) delete this.draft.skillRanks[key];
      else this.draft.skillRanks[key] = next;
      this._scheduleDraftSave();
      void this.render(false);
    }));

    this.element.querySelector(`[data-fms-path='minor.stuntOldKey']`)?.addEventListener("change", event => {
      this._captureInputs();
      const key = event.currentTarget.value;
      this.draft.minor.stuntOldKey = key;
      const old = this.actor.system?.stunts?.[key];
      if (old) {
        this.draft.minor.stunt = stuntDraftFromData(old);
        this.draft.minor.stunt.libraryKey = "";
      }
      this._scheduleDraftSave();
      void this.render(false);
    });

    this.element.querySelectorAll("[data-fms-stunt-library]").forEach(select => select.addEventListener("change", event => {
      this._captureInputs();
      const slot = event.currentTarget.dataset.fmsStuntLibrary;
      const key = event.currentTarget.value;
      if (key) this._fillStunt(slot, key);
      else writePath(this.draft, `${slot}.libraryKey`, "");
      this._scheduleDraftSave();
      void this.render(false);
    }));

    this.element.querySelector(`[data-fms-path='minor.aspectKey']`)?.addEventListener("change", event => {
      const key = event.currentTarget.value;
      this.draft.minor.aspectKey = key;
      const aspect = aspectEntries(this.actor).find(item => item.key === key);
      this.draft.minor.aspectValue = aspect?.value ?? "";
      this._scheduleDraftSave();
      void this.render(false);
    });

    for (const path of ["highConceptChanged", "majorStuntEnabled"]) {
      this.element.querySelector(`[data-fms-path='${path}']`)?.addEventListener("change", event => {
        const value = boolValue(event.currentTarget);
        writePath(this.draft, path, value);
        this._scheduleDraftSave();
        void this.render(false);
      });
    }

    this.element.querySelector(`[data-fms-path='extremeAspectKey']`)?.addEventListener("change", event => {
      const key = event.currentTarget.value;
      this.draft.extremeAspectKey = key;
      const aspect = aspectEntries(this.actor).find(item => item.key === key);
      this.draft.extremeAspectValue = aspect?.value ?? "";
      this._scheduleDraftSave();
      void this.render(false);
    });

    this.element.querySelectorAll("[data-fms-recovery-toggle]").forEach(input => input.addEventListener("change", event => {
      this._captureInputs();
      const key = event.currentTarget.dataset.fmsRecoveryToggle;
      const consequence = activeConsequenceEntries(this.actor).find(item => item.key === key);
      if (event.currentTarget.checked) this.draft.recoveries[key] = consequence?.name ?? "";
      else delete this.draft.recoveries[key];
      this._scheduleDraftSave();
      void this.render(false);
    }));
    this.element.querySelectorAll("[data-fms-recovery-name]").forEach(input => input.addEventListener("input", event => {
      this.draft.recoveries[event.currentTarget.dataset.fmsRecoveryName] = event.currentTarget.value;
      this._updateLiveValidation();
      this._scheduleDraftSave();
    }));

    this.element.querySelector("[data-fms-submit]")?.addEventListener("click", async () => {
      this._captureInputs();
      const session = getSession();
      const row = session?.actors?.[this.actor.id];
      if (!session || !row) return;
      const swap = validateMinorSkillSwap(row.baseline.skills, this.draft.minor);
      if (!swap.valid) return globalThis.FateToolkitUX.warn(swap.message);
      const refreshPlan = refreshProjection(this.actor, session, this.draft);
      const columnsOkay = !session.strictColumns || skillSpend(this.actor, row, this.draft) === 0 || validateSkillColumns(proposedRanks(this.actor, row, this.draft)).valid;
      const validation = validateDraftForDisplay(this.actor, session, row, this.draft, refreshPlan, columnsOkay);
      if (!validation.valid) return globalThis.FateToolkitUX.warn(validation.message);
      const ok = await confirmDialog(game.i18n.localize("FMS.ConfirmSubmitTitle"), `<p>${game.i18n.localize("FMS.ConfirmSubmitText")}</p>`);
      if (!ok) return;
      this.submitting = true;
      await this._persistDraftNow();
      void this.render(false);
      await sendProposal(this.actor, this.draft);
    });
  }
}

let timelineApp = null;
function openCampaignTimeline() {
  if (game.system?.id !== SYSTEM_ID) return;
  timelineApp ??= new MilestoneCampaignTimelineApp();
  return timelineApp.render(true);
}

class MilestoneCampaignTimelineApp extends AppV2 {
  static DEFAULT_OPTIONS = {
    id: "fate-milestone-campaign-timeline",
    classes: ["fate", "fms-window", "fms-timeline-window"],
    window: { title: "FMS.Timeline.Title", icon: "fa-solid fa-timeline", resizable: true },
    position: { width: 750, height: 720 }
  };
  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/milestone-timeline.hbs`, scrollable: [".fms-scroll"] }
  };
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const archive = campaignTimeline();
    const session = getSession();
    const events = archive.map(event => (session?.id === event.id ? publicMilestoneEvent(session) : event));
    if (session && !events.some(event => event.id === session.id)) events.push(publicMilestoneEvent(session));
    events.sort((a,b) => n(b.createdAt)-n(a.createdAt));
    const visible = events.map(event => {
      const participants = (event.participants ?? []).map(row => ({
        ...row,
        completed: row.status === "completed",
        owned: game.user.isGM || userOwnsActor(game.user, game.actors.get(row.actorId)),
        hasChanges: Array.isArray(row.changes) && row.changes.length > 0
      }));
      return {
        ...event, participants,
        typeLabel: milestoneLabel(event.type),
        active: session?.id === event.id && !event.closedAt,
        dateLabel: event.gameDate || new Date(event.createdAt || Date.now()).toLocaleDateString(game.i18n.lang),
        completedCount: participants.filter(row=>row.completed).length,
        totalCount: participants.length,
        hasParticipants: participants.length>0,
        sessionLabel: event.sessionNumber ? `${game.i18n.localize("FMS.Timeline.Session")} ${event.sessionNumber}` : ""
      };
    });
    const currentPlay=playSession();
    return { ...context, isGM: game.user.isGM, hasActive: !!session, hasEvents: !!visible.length, events: visible,
      playSessionActive:Boolean(currentPlay&&!currentPlay.endedAt),playSessionNumber:currentPlay?.number||'',
      playSessionDate:currentPlay?.startedAt?new Date(currentPlay.startedAt).toLocaleDateString('ru-RU'):'' };
  }
  async _onRender(context, options) {
    await super._onRender(context, options);
    this.element?.querySelector("[data-fms-new-milestone]")?.addEventListener("click", () => openMilestoneManager());
    this.element?.querySelector("[data-fms-start-play]")?.addEventListener('click',async()=>{
      try{await beginPlaySession();this.render(false);}catch(error){ui.notifications.error(String(error.message||error));}
    });
    this.element?.querySelector("[data-fms-end-play]")?.addEventListener('click',async()=>{
      try{await endPlaySession();this.render(false);}catch(error){ui.notifications.error(String(error.message||error));}
    });
    this.element?.querySelectorAll("[data-fms-open-choice]").forEach(button => button.addEventListener("click", event => {
      const actorId = event.currentTarget.dataset.fmsOpenChoice;
      if (getSession()?.actors?.[actorId]) openMilestoneForActor(actorId);
      else {
        const actor = game.actors?.get(actorId);
        const open = game.modules?.get(MODULE_ID)?.api?.openCharacterDevelopment;
        if (typeof open === "function") void open(actor);
        else actor?.sheet?.render(true);
      }
    }));
  }
}

function addMilestoneControl(controls) {
  if (game.system?.id !== SYSTEM_ID) return;
  const tokenControls = controls.tokens;
  if (!tokenControls?.tools) return;
  const session = getSession();
  const assigned = session && assignedActorsForUser(session).length > 0;
  tokenControls.tools.fateMilestoneTimeline = {
    name: "fateMilestoneTimeline",
    title: game.i18n.localize("FMS.Timeline.Title"),
    icon: "fa-solid fa-timeline", order: Object.keys(tokenControls.tools).length + 29,
    button: true, visible: true, onChange: () => openCampaignTimeline()
  };
  // The campaign timeline is the single entry point for milestone management.
}

function maybeAutoOpenPlayerMilestone({ force = false } = {}) {
  const session = getSession();
  if (!session || game.user.isGM) return;
  if (!force && lastAutoOpenedSessionId === session.id) return;
  lastAutoOpenedSessionId = session.id;
  const assigned = assignedActorsForUser(session).filter(actor => session.actors[actor.id]?.status !== "completed");
  for (const actor of assigned) openMilestoneForActor(actor.id);
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, PLAY_SESSION_SETTING, {scope:"world", config:false, type:Object, default:{}, restricted:true});
  game.settings.register(MODULE_ID, TIMELINE_SETTING, {
    scope: "world", config: false, type: Array, default: [], restricted: true
  });
  game.settings.register(MODULE_ID, SESSION_SETTING, {
    scope: "world", config: false, type: Object, default: {}, restricted: true
  });
  game.settings.register(MODULE_ID, CAP_SETTING, {
    name: "FMS.CapSettingName",
    hint: "FMS.CapSettingHint",
    scope: "world",
    config: true,
    type: Number,
    default: 4,
    restricted: true
  });
});

Hooks.once("ready", () => {
  if (game.system?.id !== SYSTEM_ID) return;
  const module = game.modules.get(MODULE_ID);
  module.api ??= {};
  Object.assign(module.api, {
    openMilestoneManager,
    openAssignedMilestones,
    openMilestoneForActor,
    openCampaignTimeline,
    beginPlaySession, endPlaySession, getPlaySession: playSession,
    developmentForActor,
    getCampaignTimeline: campaignTimeline,
    getMilestoneSession: () => getSession(),
    getMilestoneSkillPoints: actor => getSkillBank(actor)
  });

  milestoneRpc().register("milestone", async (payload, { senderId } = {}) => {
    if (!payload?.type) return;
    if (["fawMilestoneOffer", "fawMilestoneResult", "fawMilestoneClosed"].includes(payload.type)) {
      milestoneRpc().assertGM(senderId);
    }
    if (payload.type === "fawMilestoneOffer") {
      if (game.user.isGM) milestoneManager?.render(false);
      else if (payload.actorId) {
        openMilestoneForActor(payload.actorId);
        setTimeout(() => openMilestoneForActor(payload.actorId), 250);
      } else {
        maybeAutoOpenPlayerMilestone({ force: true });
        setTimeout(() => maybeAutoOpenPlayerMilestone({ force: true }), 250);
      }
    } else if (payload.type === "fawMilestoneSubmit") {
      return applyProposal({ ...payload, userId: String(senderId || "") });
    } else if (payload.type === "fawMilestoneResult") {
      handleProposalResult(payload);
    } else if (payload.type === "fawMilestoneClosed") {
      lastAutoOpenedSessionId = null;
      for (const app of milestoneApps.values()) {
        void clearMilestoneDraftState(app.actor, payload.sessionId);
        app.close();
      }
      milestoneApps.clear();
    }
  });

  if (game.user.isGM && getSession()) {
    void syncCampaignTimeline(getSession()).catch(err => console.warn(`${MODULE_ID} | Timeline catch-up failed`, err));
  }
  setTimeout(() => maybeAutoOpenPlayerMilestone(), 500);
});

Hooks.on("getSceneControlButtons", addMilestoneControl);
Hooks.on("updateSetting", setting => {
  if (setting?.key === `${MODULE_ID}.${PLAY_SESSION_SETTING}`) {timelineApp?.render(false);milestoneManager?.render(false);return;}
  if (setting?.key === `${MODULE_ID}.${TIMELINE_SETTING}`) {
    timelineApp?.render(false);
    return;
  }
  if (setting?.key !== `${MODULE_ID}.${SESSION_SETTING}`) return;
  timelineApp?.render(false);
  const session = getSession();
  milestoneManager?.render(false);
  for (const [actorId, app] of milestoneApps) {
    if (!session?.actors?.[actorId]) {
      app.close();
      milestoneApps.delete(actorId);
    } else {
      // Preserve text the player is currently typing if another character completes
      // their milestone and the shared session setting updates.
      try { app._captureInputs?.(); } catch (_) {}
      app.render(false);
    }
  }
  if (!session) lastAutoOpenedSessionId = null;
  else if (!game.user.isGM) setTimeout(() => maybeAutoOpenPlayerMilestone(), 50);
  try { ui.controls?.render?.(); } catch (_) {}
});
