const FAW_DATA_MODULE_ID = "fate-aspect-widget";
const FAW_DATA_SCHEMA_SETTING = "dataSchemaVersion";
const FAW_DATA_REPORT_SETTING = "dataMigrationReport";
const FAW_CURRENT_DATA_SCHEMA = 5;

const FAW_PRIVATE_USER_ARRAY_FLAGS = Object.freeze({
  persistentRollRequests: { kind: "playerRollRequests", limit: 50, idPath: ["id"] }
});
const FAW_PRIVATE_USER_SINGLE_FLAGS = Object.freeze([
  "persistentActionDraftV1",
  "persistentPendingActionV1"
]);
const FAW_PRIVATE_USER_QUEUE_FLAGS = Object.freeze({
  persistentOppositionQueueV1: { kind: "persistentOppositionQueueV1", limit: 20, idPath: ["proposal", "id"] }
});
const FAW_USER_QUEUE_FLAGS = Object.freeze({
  persistentActionHandoffsV1: { limit: 10, idPath: ["request", "id"] }
});
const FAW_LEGACY_SECRET_USER_FLAGS = Object.freeze({
  persistentGmRollRequests: { kind: "gmRollRequests", limit: 50, idPath: ["id"] },
  persistentAuthenticatedActionProposalsV1: { kind: "authenticatedActionProposals", limit: 20, idPath: ["id"] }
});
const FAW_MILESTONE_DRAFT_FLAG = "milestoneDraftsV2";

function fawDataClone(value) {
  try {
    if (globalThis.foundry?.utils?.deepClone) return foundry.utils.deepClone(value);
    if (globalThis.foundry?.utils?.duplicate) return foundry.utils.duplicate(value);
    return structuredClone(value);
  } catch (_) {
    return value;
  }
}

function fawDataObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function fawDataNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function fawDataInt(value, fallback = 0, minimum = 0) {
  return Math.max(minimum, Math.trunc(fawDataNumber(value, fallback)));
}

function fawDataStrings(value, limit = Infinity) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => String(item ?? "").trim()).filter(Boolean))].slice(0, limit);
}

function fawDataPath(value, path) {
  let cursor = value;
  for (const key of path) cursor = cursor?.[key];
  return cursor;
}

function fawDataEqual(a, b) {
  try { return JSON.stringify(a) === JSON.stringify(b); } catch (_) { return a === b; }
}

function fawDataPrimaryGM() {
  return game.users?.activeGM ?? null;
}


function fawDataPrivateClientKey(kind, userId = game.user?.id) {
  return `${FAW_DATA_MODULE_ID}.private.${game.world?.id ?? "world"}.${userId ?? "user"}.${String(kind)}`;
}

function fawDataReadPrivateClientRows(kind, userId = game.user?.id) {
  try {
    const store = game.settings?.storage?.get?.("client");
    const raw = store?.getItem?.(fawDataPrivateClientKey(kind, userId));
    if (!raw) return [];
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value : [];
  } catch (_) {
    return [];
  }
}

function fawDataWritePrivateClientRows(kind, rows, userId = game.user?.id) {
  try {
    const store = game.settings?.storage?.get?.("client");
    if (!store?.setItem) return false;
    const key = fawDataPrivateClientKey(kind, userId);
    if (!Array.isArray(rows) || rows.length === 0) store.removeItem?.(key);
    else store.setItem(key, JSON.stringify(rows));
    return true;
  } catch (_) {
    return false;
  }
}

function fawDataReadPrivateClientValue(kind, fallback = undefined, userId = game.user?.id) {
  try {
    const store = game.settings?.storage?.get?.("client");
    const raw = store?.getItem?.(fawDataPrivateClientKey(kind, userId));
    if (raw === null || raw === undefined || raw === "") return fallback;
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

function fawDataWritePrivateClientValue(kind, value, userId = game.user?.id) {
  try {
    const store = game.settings?.storage?.get?.("client");
    if (!store?.setItem) return false;
    const key = fawDataPrivateClientKey(kind, userId);
    if (value === null || value === undefined) store.removeItem?.(key);
    else store.setItem(key, JSON.stringify(value));
    return true;
  } catch (_) {
    return false;
  }
}

function fawDataReport(from = null, to = FAW_CURRENT_DATA_SCHEMA) {
  return {
    from,
    to,
    startedAt: Date.now(),
    finishedAt: null,
    changed: 0,
    removed: 0,
    checked: 0,
    errors: 0,
    notes: []
  };
}


function fawDataError(report, label, error) {
  report.errors += 1;
  report.notes.push(`${label}: ${String(error?.message || error || "unknown error")}`);
  console.warn(`${FAW_DATA_MODULE_ID} | Data repair failed for ${label}`, error);
}

async function fawDataSetFlag(document, key, value, report, label) {
  try {
    const current = document.getFlag(FAW_DATA_MODULE_ID, key);
    report.checked += 1;
    if (value === undefined) {
      if (current !== undefined) {
        await document.unsetFlag(FAW_DATA_MODULE_ID, key);
        report.removed += 1;
      }
      return;
    }
    if (!fawDataEqual(current, value)) {
      await document.setFlag(FAW_DATA_MODULE_ID, key, value);
      report.changed += 1;
    }
  } catch (error) {
    fawDataError(report, label, error);
  }
}

async function fawDataSetSetting(key, value, report, label) {
  try {
    const current = game.settings.get(FAW_DATA_MODULE_ID, key);
    report.checked += 1;
    if (!fawDataEqual(current, value)) {
      await game.settings.set(FAW_DATA_MODULE_ID, key, value);
      report.changed += 1;
    }
  } catch (error) {
    fawDataError(report, label, error);
  }
}

function fawDataSanitizePublicOpposition(value) {
  if (!fawDataObject(value)) return value;
  if (value.hidden === true) {
    return { mode: String(value.mode || "fixed"), hidden: true, kind: "hidden" };
  }
  return fawDataClone(value);
}

function fawDataSanitizeRequest(value) {
  if (!fawDataObject(value)) return value;
  const copy = fawDataClone(value);
  if (copy.opposition !== undefined) copy.opposition = fawDataSanitizePublicOpposition(copy.opposition);
  return copy;
}

function fawDataNormalizeRequestRows(value, limit) {
  if (!Array.isArray(value)) return [];
  const byId = new Map();
  for (const row of value) {
    if (!fawDataObject(row) || !row.id) continue;
    const copy = fawDataSanitizeRequest(row);
    copy.id = String(copy.id);
    if (copy.createdAt !== undefined) copy.createdAt = fawDataNumber(copy.createdAt, 0);
    byId.set(copy.id, copy);
  }
  return [...byId.values()]
    .sort((a, b) => fawDataNumber(a.createdAt, 0) - fawDataNumber(b.createdAt, 0))
    .slice(-limit);
}

function fawDataNormalizePrivateRows(value, { limit, idPath = ["id"] }) {
  if (!Array.isArray(value)) return [];
  const byId = new Map();
  for (const row of value) {
    if (!fawDataObject(row)) continue;
    const id = String(fawDataPath(row, idPath) ?? "").trim();
    if (!id) continue;
    const copy = fawDataClone(row);
    copy.id ??= id;
    if (copy.createdAt !== undefined) copy.createdAt = fawDataNumber(copy.createdAt, 0);
    byId.set(id, copy);
  }
  return [...byId.values()]
    .sort((a, b) => fawDataNumber(a.createdAt, 0) - fawDataNumber(b.createdAt, 0))
    .slice(-limit);
}

function fawDataNormalizeQueueRows(value, { limit, idPath }) {
  if (!Array.isArray(value)) return [];
  const byId = new Map();
  for (const row of value) {
    if (!fawDataObject(row)) continue;
    const id = String(fawDataPath(row, idPath) ?? "").trim();
    if (!id) continue;
    const copy = fawDataClone(row);
    if (fawDataObject(copy.request)) copy.request = fawDataSanitizeRequest(copy.request);
    byId.set(id, copy);
  }
  return [...byId.values()].slice(-limit);
}

function fawDataNormalizeActionDraft(value) {
  if (!fawDataObject(value)) return undefined;
  const actorRef = String(value.actorRef ?? "");
  const targetRef = String(value.targetRef ?? "");
  const sceneId = value.sceneId ? String(value.sceneId) : null;
  if (!actorRef && !targetRef) return undefined;
  return {
    actorRef,
    targetRef,
    sceneId,
    updatedAt: fawDataNumber(value.updatedAt, Date.now())
  };
}

function fawDataNormalizePendingAction(value) {
  if (!fawDataObject(value) || !fawDataObject(value.proposal) || !value.proposal.id) return undefined;
  return {
    proposal: fawDataClone(value.proposal),
    status: String(value.status || "waiting"),
    updatedAt: fawDataNumber(value.updatedAt, Date.now())
  };
}

function fawDataNormalizeMilestoneDrafts(value) {
  if (!fawDataObject(value)) return {};
  const entries = [];
  for (const [key, row] of Object.entries(value)) {
    if (!fawDataObject(row) || !row.sessionId || !row.actorId || !fawDataObject(row.draft)) continue;
    entries.push([String(key), {
      sessionId: String(row.sessionId),
      actorId: String(row.actorId),
      draft: fawDataClone(row.draft),
      currentStep: String(row.currentStep || "overview"),
      updatedAt: fawDataNumber(row.updatedAt, 0)
    }]);
  }
  entries.sort((a, b) => b[1].updatedAt - a[1].updatedAt);
  return Object.fromEntries(entries.slice(0, 20));
}

async function fawRepairUser(user, report) {
  if (!user) return;

  // User documents are synchronized world data, so legacy GM-private queues must
  // not remain in User.flags. Preserve only the current client's own GM state in
  // browser-local storage, then remove the network-visible legacy flags.
  for (const [flag, options] of Object.entries(FAW_LEGACY_SECRET_USER_FLAGS)) {
    const raw = user.getFlag(FAW_DATA_MODULE_ID, flag);
    if (raw === undefined) { report.checked += 1; continue; }
    const clean = fawDataNormalizePrivateRows(raw, options);
    if (String(user.id) === String(game.user?.id || "") && game.user?.isGM && clean.length) {
      const existing = fawDataReadPrivateClientRows(options.kind, user.id);
      const merged = fawDataNormalizePrivateRows([...existing, ...clean], options);
      if (fawDataWritePrivateClientRows(options.kind, merged, user.id)) {
        report.notes.push(`Migrated ${flag} to private client storage for ${user.id}.`);
      } else {
        // Privacy fails closed: never keep a GM secret in a synchronized User flag
        // merely because local persistence is unavailable.
        report.notes.push(`Could not preserve ${flag} locally for ${user.id}; legacy network-visible flag was removed.`);
      }
    }
    await fawDataSetFlag(user, flag, undefined, report, `User ${user.id} legacy secret ${flag}`);
  }
  for (const [flag, options] of Object.entries(FAW_PRIVATE_USER_ARRAY_FLAGS)) {
    const raw = user.getFlag(FAW_DATA_MODULE_ID, flag);
    if (raw === undefined) { report.checked += 1; continue; }
    const clean = fawDataNormalizeRequestRows(raw, options.limit);
    if (String(user.id) === String(game.user?.id || "") && clean.length) {
      const existing = fawDataReadPrivateClientRows(options.kind, user.id);
      const merged = fawDataNormalizeRequestRows([...existing, ...clean], options.limit);
      if (fawDataWritePrivateClientRows(options.kind, merged, user.id)) report.notes.push(`Migrated ${flag} to private client storage for ${user.id}.`);
    }
    await fawDataSetFlag(user, flag, undefined, report, `User ${user.id} private ${flag}`);
  }

  for (const flag of FAW_PRIVATE_USER_SINGLE_FLAGS) {
    const raw = user.getFlag(FAW_DATA_MODULE_ID, flag);
    if (raw === undefined) { report.checked += 1; continue; }
    const clean = flag === "persistentActionDraftV1" ? fawDataNormalizeActionDraft(raw) : fawDataNormalizePendingAction(raw);
    if (String(user.id) === String(game.user?.id || "") && clean !== undefined) {
      const existing = fawDataReadPrivateClientValue(flag, undefined, user.id);
      const chosen = existing === undefined ? clean : existing;
      if (fawDataWritePrivateClientValue(flag, chosen, user.id)) report.notes.push(`Migrated ${flag} to private client storage for ${user.id}.`);
    }
    await fawDataSetFlag(user, flag, undefined, report, `User ${user.id} private ${flag}`);
  }

  for (const [flag, options] of Object.entries(FAW_PRIVATE_USER_QUEUE_FLAGS)) {
    const raw = user.getFlag(FAW_DATA_MODULE_ID, flag);
    if (raw === undefined) { report.checked += 1; continue; }
    const clean = fawDataNormalizeQueueRows(raw, options);
    if (String(user.id) === String(game.user?.id || "") && clean.length) {
      const existingRaw = fawDataReadPrivateClientValue(options.kind, [], user.id);
      const existing = fawDataNormalizeQueueRows(existingRaw, options);
      const merged = fawDataNormalizeQueueRows([...existing, ...clean], options);
      if (fawDataWritePrivateClientValue(options.kind, merged, user.id)) report.notes.push(`Migrated ${flag} to private client storage for ${user.id}.`);
    }
    await fawDataSetFlag(user, flag, undefined, report, `User ${user.id} private ${flag}`);
  }

  for (const [flag, options] of Object.entries(FAW_USER_QUEUE_FLAGS)) {
    const raw = user.getFlag(FAW_DATA_MODULE_ID, flag);
    if (raw === undefined) { report.checked += 1; continue; }
    const clean = fawDataNormalizeQueueRows(raw, options);
    await fawDataSetFlag(user, flag, clean.length ? clean : undefined, report, `User ${user.id} ${flag}`);
  }

  const draftsRaw = user.getFlag(FAW_DATA_MODULE_ID, FAW_MILESTONE_DRAFT_FLAG);
  if (draftsRaw !== undefined) {
    const clean = fawDataNormalizeMilestoneDrafts(draftsRaw);
    if (String(user.id) === String(game.user?.id || "") && Object.keys(clean).length) {
      const existing = fawDataReadPrivateClientValue(FAW_MILESTONE_DRAFT_FLAG, {}, user.id);
      const merged = fawDataNormalizeMilestoneDrafts({ ...clean, ...(fawDataObject(existing) ? existing : {}) });
      if (fawDataWritePrivateClientValue(FAW_MILESTONE_DRAFT_FLAG, merged, user.id)) report.notes.push(`Migrated ${FAW_MILESTONE_DRAFT_FLAG} to private client storage for ${user.id}.`);
    }
    await fawDataSetFlag(user, FAW_MILESTONE_DRAFT_FLAG, undefined, report, `User ${user.id} private ${FAW_MILESTONE_DRAFT_FLAG}`);
  } else report.checked += 1;
}

function fawDataNormalizeBoosts(actor, value) {
  const nativeCount = fawDataInt(actor.system?.details?.fatePoints?.boosts, 0, 0);
  const source = Array.isArray(value) ? value : [];
  const rows = source.slice(0, nativeCount).map((row, index) => ({
    id: String(row?.id || `boost-${index}`),
    name: String(row?.name || game.i18n.localize("FAW.UnnamedBoost") || "Boost"),
    hidden: row?.hidden === true
  }));
  while (rows.length < nativeCount) {
    rows.push({
      id: foundry.utils.randomID(),
      name: game.i18n.localize("FAW.UnnamedBoost") || "Boost",
      hidden: false
    });
  }
  return rows;
}

function fawDataNormalizeMilestoneHistory(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(row => fawDataObject(row) && row.id).slice(-20).map(row => ({
    ...fawDataClone(row),
    id: String(row.id),
    at: fawDataNumber(row.at, 0),
    changes: Array.isArray(row.changes) ? fawDataClone(row.changes) : [],
    reasons: Array.isArray(row.reasons) ? fawDataClone(row.reasons) : []
  }));
}

async function fawRepairActor(actor, report) {
  if (!actor) return;
  const boostsRaw = actor.getFlag(FAW_DATA_MODULE_ID, "boosts");
  if (boostsRaw !== undefined || fawDataInt(actor.system?.details?.fatePoints?.boosts, 0, 0) > 0) {
    const clean = fawDataNormalizeBoosts(actor, boostsRaw);
    await fawDataSetFlag(actor, "boosts", clean.length ? clean : undefined, report, `Actor ${actor.id} boosts`);
  } else report.checked += 1;

  const bankRaw = actor.getFlag(FAW_DATA_MODULE_ID, "milestoneSkillPoints");
  if (bankRaw !== undefined) {
    const clean = fawDataInt(bankRaw, 0, 0);
    await fawDataSetFlag(actor, "milestoneSkillPoints", clean, report, `Actor ${actor.id} milestoneSkillPoints`);
  } else report.checked += 1;

  const historyRaw = actor.getFlag(FAW_DATA_MODULE_ID, "milestoneHistory");
  if (historyRaw !== undefined) {
    const clean = fawDataNormalizeMilestoneHistory(historyRaw);
    await fawDataSetFlag(actor, "milestoneHistory", clean.length ? clean : undefined, report, `Actor ${actor.id} milestoneHistory`);
  } else report.checked += 1;
}

function fawDataNormalizeMarker(row) {
  if (!fawDataObject(row)) return null;
  const x = Number(row.x);
  const y = Number(row.y);
  const text = String(row.text ?? "").trim();
  if (!Number.isFinite(x) || !Number.isFinite(y) || !text) return null;
  return {
    id: String(row.id || foundry.utils.randomID()),
    x,
    y,
    text,
    meta: String(row.meta ?? ""),
    hidden: row.hidden === true,
    source: fawDataObject(row.source) ? fawDataClone(row.source) : null
  };
}

async function fawRepairScene(scene, report) {
  if (!scene) return;
  const raw = scene.getFlag(FAW_DATA_MODULE_ID, "aspectMarkers");
  if (raw === undefined) { report.checked += 1; return; }
  const clean = (Array.isArray(raw) ? raw : []).map(fawDataNormalizeMarker).filter(Boolean);
  await fawDataSetFlag(scene, "aspectMarkers", clean.length ? clean : undefined, report, `Scene ${scene.id} aspectMarkers`);
}

function fawDataNormalizeJournal(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(row => fawDataObject(row) && row.text).slice(-60).map(row => ({
    ...fawDataClone(row),
    id: String(row.id || foundry.utils.randomID()),
    timestamp: fawDataNumber(row.timestamp, Date.now()),
    round: fawDataInt(row.round, 0, 0),
    type: String(row.type || "event"),
    actorUuid: row.actorUuid ? String(row.actorUuid) : null,
    actorName: String(row.actorName || ""),
    targetName: String(row.targetName || ""),
    text: String(row.text),
    messageId: row.messageId ? String(row.messageId) : null
  }));
}

async function fawRepairCombat(combat, report) {
  if (!combat) return;
  const combatants = combat.combatants?.contents ?? Array.from(combat.combatants ?? []);
  const ids = combatants.map(row => String(row.id));
  const queueRaw = combat.getFlag(FAW_DATA_MODULE_ID, "combatQueue");
  if (queueRaw !== undefined) {
    const queue = fawDataStrings(queueRaw).filter(id => ids.includes(id));
    for (const id of ids) if (!queue.includes(id)) queue.push(id);
    await fawDataSetFlag(combat, "combatQueue", queue, report, `Combat ${combat.id} combatQueue`);
  } else report.checked += 1;

  const skillRaw = combat.getFlag(FAW_DATA_MODULE_ID, "combatOrderSkill");
  if (skillRaw !== undefined) {
    const clean = String(skillRaw ?? "").trim();
    await fawDataSetFlag(combat, "combatOrderSkill", clean || undefined, report, `Combat ${combat.id} combatOrderSkill`);
  } else report.checked += 1;

  const journalRaw = combat.getFlag(FAW_DATA_MODULE_ID, "conflictJournal");
  if (journalRaw !== undefined) {
    const clean = fawDataNormalizeJournal(journalRaw);
    await fawDataSetFlag(combat, "conflictJournal", clean.length ? clean : undefined, report, `Combat ${combat.id} conflictJournal`);
  } else report.checked += 1;

  const indexRaw = combat.getFlag(FAW_DATA_MODULE_ID, "conflictRollIndex");
  if (indexRaw !== undefined) {
    const clean = fawDataObject(indexRaw) ? fawDataClone(indexRaw) : {};
    await fawDataSetFlag(combat, "conflictRollIndex", Object.keys(clean).length ? clean : undefined, report, `Combat ${combat.id} conflictRollIndex`);
  } else report.checked += 1;
}

function fawDataNormalizeAudit(value) {
  if (!Array.isArray(value)) return [];
  // Audit entries are intentionally whitelisted. Older versions briefly stored
  // GM-only detail in public ChatMessage flags; schema 2 scrubs all unknown fields.
  return value.filter(row => fawDataObject(row) && (row.label || row.type)).slice(-60).map(row => ({
    id: String(row.id || foundry.utils.randomID()),
    type: String(row.type || "event"),
    label: String(row.label || "Событие"),
    detail: String(row.detail || ""),
    userId: row.userId ? String(row.userId) : null,
    userName: String(row.userName || ""),
    timestamp: fawDataNumber(row.timestamp, Date.now()),
    fingerprint: String(row.fingerprint || "")
  }));
}

function fawDataNormalizeDamageState(value) {
  if (value === null || value === undefined) return null;
  if (!fawDataObject(value)) return null;
  const selections = Array.isArray(value.selections)
    ? value.selections.filter(row => fawDataObject(row) && row.kind).map(row => fawDataClone(row))
    : [];
  return {
    ...fawDataClone(value),
    actorUuid: value.actorUuid ? String(value.actorUuid) : null,
    actorName: String(value.actorName || ""),
    total: fawDataInt(value.total, 0, 0),
    remaining: fawDataInt(value.remaining, 0, 0),
    status: ["pending", "resolved", "taken-out"].includes(value.status) ? value.status : "pending",
    selections,
    takenOut: value.takenOut ?? null
  };
}

async function fawRepairMessage(message, report) {
  const flags = message?.flags?.[FAW_DATA_MODULE_ID];
  if (!fawDataObject(flags)) return;
  report.checked += 1;

  if (flags.auditTrail !== undefined) {
    const clean = fawDataNormalizeAudit(flags.auditTrail);
    await fawDataSetFlag(message, "auditTrail", clean.length ? clean : undefined, report, `ChatMessage ${message.id} auditTrail`);
  }

  if (flags.damageResolution !== undefined) {
    const clean = fawDataNormalizeDamageState(flags.damageResolution);
    await fawDataSetFlag(message, "damageResolution", clean, report, `ChatMessage ${message.id} damageResolution`);
  }

  const hiddenOpposition = flags.oppositionHidden === true
    || (Boolean(flags.oppositionActorUuid || flags.oppositionMessageId)
      && flags.resolved === true
      && flags.oppositionTotal === undefined);
  if (hiddenOpposition) {
    await fawDataSetFlag(message, "oppositionHidden", true, report, `ChatMessage ${message.id} oppositionHidden`);
    await fawDataSetFlag(message, "oppositionActorUuid", undefined, report, `ChatMessage ${message.id} oppositionActorUuid`);
    await fawDataSetFlag(message, "oppositionMessageId", undefined, report, `ChatMessage ${message.id} oppositionMessageId`);
    await fawDataSetFlag(message, "oppositionHistory", undefined, report, `ChatMessage ${message.id} oppositionHistory`);
  }

  for (const key of ["rollHistory", "oppositionHistory"]) {
    if (flags[key] === undefined) continue;
    const clean = Array.isArray(flags[key]) ? flags[key].filter(Boolean).slice(-30).map(row => fawDataClone(row)) : [];
    await fawDataSetFlag(message, key, clean.length ? clean : undefined, report, `ChatMessage ${message.id} ${key}`);
  }
}

function fawDataNormalizeVisibility(value) {
  const row = fawDataObject(value) ? value : {};
  const scenes = {};
  const actors = {};
  if (fawDataObject(row.scenes)) {
    for (const [id, list] of Object.entries(row.scenes)) {
      const clean = fawDataStrings(list);
      if (clean.length) scenes[String(id)] = clean;
    }
  }
  if (fawDataObject(row.actors)) {
    for (const [id, list] of Object.entries(row.actors)) {
      const clean = fawDataStrings(list);
      if (clean.length) actors[String(id)] = clean;
    }
  }
  return { global: fawDataStrings(row.global), scenes, actors };
}

function fawDataNormalizeMilestoneSession(value) {
  if (!fawDataObject(value) || !value.id) return {};
  const clean = fawDataClone(value);
  clean.id = String(clean.id);
  clean.type = ["minor", "significant", "major"].includes(clean.type) ? clean.type : "minor";
  clean.title = String(clean.title || "");
  clean.note = String(clean.note || "");
  clean.createdAt = fawDataNumber(clean.createdAt, 0);
  clean.createdBy = clean.createdBy ? String(clean.createdBy) : null;
  clean.baseSkillCap = fawDataInt(clean.baseSkillCap, 4, 1);
  clean.strictColumns = clean.strictColumns !== false;
  clean.postToChat = clean.postToChat === true;
  clean.actors = fawDataObject(clean.actors) ? clean.actors : {};
  for (const [actorId, row] of Object.entries(clean.actors)) {
    if (!fawDataObject(row)) {
      delete clean.actors[actorId];
      continue;
    }
    row.actorId = String(row.actorId || actorId);
    row.userIds = fawDataStrings(row.userIds);
    row.status = ["pending", "submitted", "completed"].includes(row.status) ? row.status : "pending";
    row.summary = Array.isArray(row.summary) ? row.summary : [];
    row.reasons = Array.isArray(row.reasons) ? row.reasons : [];
  }
  return clean;
}

async function fawRepairWorldSettings(report) {
  await fawDataSetSetting("visibility", fawDataNormalizeVisibility(game.settings.get(FAW_DATA_MODULE_ID, "visibility")), report, "world visibility");
  await fawDataSetSetting("travellingAspects", fawDataStrings(game.settings.get(FAW_DATA_MODULE_ID, "travellingAspects")), report, "world travellingAspects");
  await fawDataSetSetting("milestoneSession", fawDataNormalizeMilestoneSession(game.settings.get(FAW_DATA_MODULE_ID, "milestoneSession")), report, "world milestoneSession");
  await fawDataSetSetting("campaignSkillCap", fawDataInt(game.settings.get(FAW_DATA_MODULE_ID, "campaignSkillCap"), 4, 1), report, "world campaignSkillCap");
}

function fawDataNormalizeActionPrefs(value) {
  if (!fawDataObject(value)) return {};
  const clean = {};
  for (const [actorId, raw] of Object.entries(value)) {
    if (!fawDataObject(raw)) continue;
    const usageBySkill = {};
    if (fawDataObject(raw.usageBySkill)) {
      for (const [name, count] of Object.entries(raw.usageBySkill)) {
        const amount = fawDataInt(count, 0, 0);
        if (name && amount) usageBySkill[String(name)] = amount;
      }
    }
    clean[String(actorId)] = {
      favorites: fawDataStrings(raw.favorites),
      lastByAction: fawDataObject(raw.lastByAction)
        ? Object.fromEntries(Object.entries(raw.lastByAction).map(([key, name]) => [String(key), String(name || "")]))
        : {},
      recentSkills: fawDataStrings(raw.recentSkills, 6),
      usageBySkill
    };
  }
  return clean;
}

function fawDataReadLegacyClientSetting(key) {
  try {
    const store = game.settings?.storage?.get?.("client");
    const raw = store?.getItem?.(`${FAW_DATA_MODULE_ID}.${key}`);
    if (raw === null || raw === undefined || raw === "") return undefined;
    try { return JSON.parse(raw); } catch (_) { return raw; }
  } catch (_) {
    return undefined;
  }
}

function fawDataClearLegacyClientSetting(key) {
  try { game.settings?.storage?.get?.("client")?.removeItem?.(`${FAW_DATA_MODULE_ID}.${key}`); } catch (_) {}
}

async function fawDataMigrateUserPreference(key, normalize, report) {
  const current = normalize(game.settings.get(FAW_DATA_MODULE_ID, key));
  const legacyRaw = fawDataReadLegacyClientSetting(key);
  const legacy = legacyRaw === undefined ? undefined : normalize(legacyRaw);
  const currentEmpty = Array.isArray(current) ? current.length === 0 : (fawDataObject(current) ? Object.keys(current).length === 0 : !current);
  const legacyUseful = legacy !== undefined && (Array.isArray(legacy) ? legacy.length > 0 : (fawDataObject(legacy) ? Object.keys(legacy).length > 0 : Boolean(legacy)));
  const value = currentEmpty && legacyUseful ? legacy : current;
  await fawDataSetSetting(key, value, report, `user ${key}`);
  if (legacyRaw !== undefined) fawDataClearLegacyClientSetting(key);
}

async function fawRepairClientSettings(report) {
  const objectSettings = ["widgetPosition", "actionWidgetPosition", "sectionOpenState"];
  for (const key of objectSettings) {
    try {
      const raw = game.settings.get(FAW_DATA_MODULE_ID, key);
      const clean = fawDataObject(raw) ? raw : {};
      await fawDataSetSetting(key, clean, report, `client ${key}`);
    } catch (_) {}
  }
  try {
    const raw = game.settings.get(FAW_DATA_MODULE_ID, "sectionFilters");
    const defaults = { global: true, scene: true, travelling: true, boosts: true, consequences: true, characters: true };
    const clean = { ...defaults };
    if (fawDataObject(raw)) for (const key of Object.keys(defaults)) if (typeof raw[key] === "boolean") clean[key] = raw[key];
    await fawDataSetSetting("sectionFilters", clean, report, "client sectionFilters");
  } catch (_) {}
  try {
    await fawDataMigrateUserPreference("aspectFavorites", value => fawDataStrings(value), report);
  } catch (_) {}
  try {
    await fawDataMigrateUserPreference("actionSkillPreferences", fawDataNormalizeActionPrefs, report);
  } catch (_) {}
}

async function fawRepairWorldData(report) {
  await fawRepairWorldSettings(report);
  for (const user of game.users?.contents ?? []) await fawRepairUser(user, report);
  for (const actor of game.actors?.contents ?? []) await fawRepairActor(actor, report);
  for (const scene of game.scenes?.contents ?? []) await fawRepairScene(scene, report);
  for (const combat of game.combats?.contents ?? []) await fawRepairCombat(combat, report);
  for (const message of game.messages?.contents ?? []) await fawRepairMessage(message, report);
}

async function fawRunDataRepair({ forceWorld = false, notify = false } = {}) {
  const storedVersion = fawDataInt(game.settings.get(FAW_DATA_MODULE_ID, FAW_DATA_SCHEMA_SETTING), 0, 0);
  const report = fawDataReport(storedVersion, FAW_CURRENT_DATA_SCHEMA);

  await fawRepairClientSettings(report);
  if (!game.user?.isGM) {
    await fawRepairUser(game.user, report);
    report.finishedAt = Date.now();
    return report;
  }

  const primary = fawDataPrimaryGM();
  if (primary && primary.id !== game.user.id && !forceWorld) {
    report.notes.push(`World repair delegated to active GM ${primary.id}.`);
    report.finishedAt = Date.now();
    return report;
  }

  if (forceWorld || storedVersion < FAW_CURRENT_DATA_SCHEMA) {
    await fawRepairWorldData(report);
    if (!report.errors) {
      await game.settings.set(FAW_DATA_MODULE_ID, FAW_DATA_SCHEMA_SETTING, FAW_CURRENT_DATA_SCHEMA);
    }
    report.finishedAt = Date.now();
    try { await game.settings.set(FAW_DATA_MODULE_ID, FAW_DATA_REPORT_SETTING, report); } catch (_) {}
    if (notify && globalThis.FateToolkitUX) {
      const message = `Fate Toolkit: проверка данных завершена. Изменено: ${report.changed}, удалено: ${report.removed}, ошибок: ${report.errors}.`;
      if (report.errors) globalThis.FateToolkitUX.warn(message);
      else globalThis.FateToolkitUX.info(message);
    }
  } else {
    // Even after the world schema is current, the current client's own flags/settings may
    // have been created on another device or damaged independently.
    await fawRepairUser(game.user, report);
    report.finishedAt = Date.now();
  }
  return report;
}

Hooks.once("init", () => {
  game.settings.register(FAW_DATA_MODULE_ID, FAW_DATA_SCHEMA_SETTING, {
    scope: "world",
    config: false,
    type: Number,
    default: 0,
    restricted: true
  });
  game.settings.register(FAW_DATA_MODULE_ID, FAW_DATA_REPORT_SETTING, {
    scope: "world",
    config: false,
    type: Object,
    default: {},
    restricted: true
  });
});

Hooks.once("ready", async () => {
  if (game.system?.id !== "fate-core-official") return;
  const module = game.modules.get(FAW_DATA_MODULE_ID);
  module.api ??= {};
  Object.assign(module.api, {
    dataSchemaVersion: FAW_CURRENT_DATA_SCHEMA,
    getDataMigrationReport: () => fawDataClone(game.settings.get(FAW_DATA_MODULE_ID, FAW_DATA_REPORT_SETTING)),
    repairData: options => fawRunDataRepair({ forceWorld: Boolean(options?.forceWorld), notify: options?.notify !== false })
  });
  try {
    const report = await fawRunDataRepair();
    console.info(`${FAW_DATA_MODULE_ID} | Data schema ${FAW_CURRENT_DATA_SCHEMA} ready`, report);
  } catch (error) {
    console.error(`${FAW_DATA_MODULE_ID} | Data migration failed`, error);
    globalThis.FateToolkitUX?.warn?.("Fate Toolkit: миграция данных не завершена. Старые данные оставлены для повторной проверки при следующем запуске.");
  }
});
