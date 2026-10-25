const MODULE_ID = "fate-aspect-widget";
const SYSTEM_ID = "fate-core-official";
const TARGET_SYSTEM_VERSION = "4.7.13.6";
const TARGET_FOUNDRY_VERSION = "13.351";
const MARKER_FLAG = "aspectMarkers";
const MARKER_OPEN_MS = 4500;
const ACTION_DRAG_MIME = "application/x-fate-action";
const DEFAULT_SECTION_FILTERS = Object.freeze({
  global: true,
  scene: true,
  travelling: true,
  boosts: true,
  consequences: true,
  characters: true
});

let widget;
let renderQueued = false;
let widgetRenderPending = false;
let positionWriteTimer;
let widgetCollapsed = false;
let markerLayer;
let markerPositionFrame;
const markerOpenTimers = new Map();
const hashCache = new Map();

const clone = value => foundry.utils.duplicate(value ?? []);
const viewedScene = () => game.scenes?.viewed ?? canvas?.scene ?? null;

function getUiDensity() {
  try {
    const profile = String(game.settings.get(MODULE_ID, "uiDensityProfile") || "standard");
    return ["compact", "standard", "comfortable"].includes(profile) ? profile : "standard";
  } catch (_) {
    return "standard";
  }
}

function getUiTextScale() {
  try {
    const scale = String(game.settings.get(MODULE_ID, "uiTextScale") || "standard");
    return ["small", "standard", "large"].includes(scale) ? scale : "standard";
  } catch (_) {
    return "standard";
  }
}

async function migrateLegacyUiProfile() {
  let migrated = false;
  try { migrated = Boolean(game.settings.get(MODULE_ID, "uiProfileMigrated")); } catch (_) {}
  if (migrated) return;
  let legacy = "standard";
  try { legacy = game.settings.get(MODULE_ID, "uiDensity") === "compact" ? "compact" : "standard"; } catch (_) {}
  try { await game.settings.set(MODULE_ID, "uiDensityProfile", legacy); } catch (_) {}
  try { await game.settings.set(MODULE_ID, "uiProfileMigrated", true); } catch (_) {}
}

function applyUiPreferences() {
  const root = document.documentElement;
  if (!root) return;
  const density = getUiDensity();
  const textScale = getUiTextScale();
  root.dataset.fawDensity = density;
  root.dataset.fawTextScale = textScale;
  root.classList.toggle("faw-density-compact", density === "compact");
  root.classList.toggle("faw-density-comfortable", density === "comfortable");
  root.classList.toggle("faw-text-small", textScale === "small");
  root.classList.toggle("faw-text-large", textScale === "large");
}

function refreshToolkitUi() {
  scheduleRender();
  const api = game.modules.get(MODULE_ID)?.api;
  api?.refreshActionWidget?.();
  api?.refreshCombatTracker?.();
  api?.refreshWorkflowCenter?.();
}

function normalizeCounter(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function getSectionFilters() {
  const stored = clone(game.settings.get(MODULE_ID, "sectionFilters"));
  const filters = { ...DEFAULT_SECTION_FILTERS };
  if (stored && !Array.isArray(stored) && typeof stored === "object") {
    for (const key of Object.keys(filters)) {
      if (typeof stored[key] === "boolean") filters[key] = stored[key];
    }
  }
  return filters;
}

function getSectionOpenState() {
  const stored = clone(game.settings.get(MODULE_ID, "sectionOpenState"));
  if (!stored || Array.isArray(stored) || typeof stored !== "object") return {};
  return stored;
}

function getAspectFavorites() {
  const stored = clone(game.settings.get(MODULE_ID, "aspectFavorites"));
  return new Set(Array.isArray(stored) ? stored.map(String) : []);
}

async function toggleAspectFavorite(key) {
  const value = String(key || "");
  if (!value) return false;
  const favorites = getAspectFavorites();
  if (favorites.has(value)) favorites.delete(value);
  else favorites.add(value);
  await game.settings.set(MODULE_ID, "aspectFavorites", [...favorites]);
  scheduleRender();
  return favorites.has(value);
}

function favoriteFirst(rows) {
  return [...rows].sort((a, b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)));
}

async function addSceneAspect(sceneOrId, name, freeInvokes = 0, options = {}) {
  const scene = typeof sceneOrId === "string" ? game.scenes.get(sceneOrId) : (sceneOrId || viewedScene());
  if (!scene || !canModifyScene(scene)) return null;
  const text = String(name || "").trim();
  if (!text) return null;
  const aspects = clone(scene.getFlag(SYSTEM_ID, "situation_aspects"));
  const list = Array.isArray(aspects) ? aspects : [];
  const id = options.id || foundry.utils.randomID();
  const row = {
    name: text,
    free_invokes: normalizeCounter(freeInvokes),
    _faw_id: id
  };
  list.push(row);
  await scene.setFlag(SYSTEM_ID, "situation_aspects", list);
  notifyFateUtilities();
  scheduleRender();
  return { id, sceneId: scene.id, index: list.length - 1, name: text, freeInvokes: row.free_invokes };
}

async function removeSceneAspect(sceneOrId, aspectId) {
  const scene = typeof sceneOrId === "string" ? game.scenes.get(sceneOrId) : (sceneOrId || viewedScene());
  if (!scene || !aspectId || !canModifyScene(scene)) return false;
  const aspects = clone(scene.getFlag(SYSTEM_ID, "situation_aspects"));
  if (!Array.isArray(aspects)) return false;
  const index = aspects.findIndex(row => String(row?._faw_id || "") === String(aspectId));
  if (index < 0) return false;
  aspects.splice(index, 1);
  await scene.setFlag(SYSTEM_ID, "situation_aspects", aspects);
  notifyFateUtilities();
  scheduleRender();
  return true;
}


function sourceAspectIndex(aspects, source, expectedName = "") {
  if (!Array.isArray(aspects)) return -1;
  const raw = Number(source?.index);
  const expected = String(expectedName || "").trim();
  if (Number.isInteger(raw) && raw >= 0 && raw < aspects.length) {
    if (!expected || String(aspects[raw]?.name || "") === expected) return raw;
  }
  if (expected) return aspects.findIndex(row => String(row?.name || "") === expected);
  return -1;
}

async function adjustAspectFreeInvokes(source, delta, expectedName = "") {
  const amount = Number(delta) || 0;
  if (!amount || !source) return null;
  if (source.kind === "game") {
    if (!game.user.isGM) return null;
    const aspects = clone(game.settings.get(SYSTEM_ID, "gameAspects"));
    const index = sourceAspectIndex(aspects, source, expectedName);
    if (index < 0) return null;
    const before = normalizeCounter(aspects[index]?.free_invokes);
    aspects[index].free_invokes = Math.max(0, before + amount);
    await game.settings.set(SYSTEM_ID, "gameAspects", aspects);
    notifyFateUtilities(); scheduleRender();
    return { kind: "game", index, name: aspects[index].name, before, after: aspects[index].free_invokes };
  }
  if (source.kind === "scene") {
    const scene = game.scenes.get(source.sceneId) ?? viewedScene();
    if (!scene || !canModifyScene(scene)) return null;
    const aspects = clone(scene.getFlag(SYSTEM_ID, "situation_aspects"));
    const index = sourceAspectIndex(aspects, source, expectedName);
    if (index < 0) return null;
    const before = normalizeCounter(aspects[index]?.free_invokes);
    aspects[index].free_invokes = Math.max(0, before + amount);
    await scene.setFlag(SYSTEM_ID, "situation_aspects", aspects);
    notifyFateUtilities(); scheduleRender();
    return { kind: "scene", sceneId: scene.id, index, name: aspects[index].name, before, after: aspects[index].free_invokes };
  }
  return null;
}

async function removeAspectSource(source, expectedName = "") {
  if (!source) return null;
  if (source.kind === "game") {
    if (!game.user.isGM) return null;
    const aspects = clone(game.settings.get(SYSTEM_ID, "gameAspects"));
    const index = sourceAspectIndex(aspects, source, expectedName);
    if (index < 0) return null;
    const visibility = getVisibility();
    const hiddenBefore = await hiddenStatuses(aspects, hiddenBucket(visibility, "global"));
    const travellingBefore = await travellingStatuses(aspects);
    const [removed] = aspects.splice(index, 1);
    hiddenBefore.statuses.splice(index, 1);
    travellingBefore.statuses.splice(index, 1);
    await game.settings.set(SYSTEM_ID, "gameAspects", aspects);
    await persistListHidden("global", null, aspects, hiddenBefore.statuses);
    await persistTravelling(aspects, travellingBefore.statuses);
    notifyFateUtilities(); scheduleRender();
    return { kind: "game", index, name: removed?.name || expectedName };
  }
  if (source.kind === "scene") {
    const scene = game.scenes.get(source.sceneId) ?? viewedScene();
    if (!scene || !canModifyScene(scene)) return null;
    const aspects = clone(scene.getFlag(SYSTEM_ID, "situation_aspects"));
    const index = sourceAspectIndex(aspects, source, expectedName);
    if (index < 0) return null;
    const visibility = getVisibility();
    const hiddenBefore = await hiddenStatuses(aspects, hiddenBucket(visibility, "scene", scene.id));
    const [removed] = aspects.splice(index, 1);
    hiddenBefore.statuses.splice(index, 1);
    await scene.setFlag(SYSTEM_ID, "situation_aspects", aspects);
    await persistListHidden("scene", scene.id, aspects, hiddenBefore.statuses);
    notifyFateUtilities(); scheduleRender();
    return { kind: "scene", sceneId: scene.id, index, name: removed?.name || expectedName };
  }
  return null;
}

async function removeAspectMarker(markerId, sceneId = null, { confirm = false } = {}) {
  const scene = (sceneId && game.scenes.get(sceneId)) || viewedScene();
  if (!scene || !canModifyScene(scene)) return false;
  if (confirm && !(await confirmMarkerDelete())) return false;
  const markers = getAspectMarkers(scene);
  const next = markers.filter(marker => marker?.id !== markerId);
  if (next.length === markers.length) return false;
  await setAspectMarkers(scene, next);
  if (scene.id === viewedScene()?.id) renderAspectMarkers();
  return true;
}

function emptyVisibility() {
  return { global: [], scenes: {}, actors: {} };
}

function getVisibility() {
  const stored = clone(game.settings.get(MODULE_ID, "visibility"));
  if (!stored || Array.isArray(stored) || typeof stored !== "object") return emptyVisibility();
  stored.global = Array.isArray(stored.global) ? stored.global : [];
  stored.scenes = stored.scenes && typeof stored.scenes === "object" ? stored.scenes : {};
  stored.actors = stored.actors && typeof stored.actors === "object" ? stored.actors : {};
  return stored;
}

async function setVisibility(visibility) {
  if (!game.user.isGM) return;
  await game.settings.set(MODULE_ID, "visibility", visibility);
}

async function hashText(text) {
  const input = String(text ?? "");
  if (hashCache.has(input)) return hashCache.get(input);

  let digest;
  try {
    const bytes = new TextEncoder().encode(input);
    const buffer = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    digest = Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, "0")).join("");
  } catch (_) {
    // Fallback is only an opaque identifier; it is not used for security decisions.
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
    const hash = await hashText(aspect?.name ?? "");
    const ordinal = counts.get(hash) ?? 0;
    counts.set(hash, ordinal + 1);
    signatures.push(`${hash}:${ordinal}`);
  }

  return signatures;
}

function hiddenBucket(visibility, scope, sceneId = null) {
  if (scope === "global") return Array.isArray(visibility.global) ? visibility.global : [];
  if (scope === "scene") return Array.isArray(visibility.scenes?.[sceneId]) ? visibility.scenes[sceneId] : [];
  return [];
}

function setHiddenBucket(visibility, scope, values, sceneId = null) {
  if (scope === "global") {
    visibility.global = values;
    return;
  }
  if (scope === "scene") {
    visibility.scenes ??= {};
    if (values.length) visibility.scenes[sceneId] = values;
    else delete visibility.scenes[sceneId];
  }
}

async function hiddenStatuses(aspects, hiddenSignatures) {
  const signatures = await aspectSignatures(aspects);
  const hidden = new Set(hiddenSignatures ?? []);
  return { signatures, statuses: signatures.map(signature => hidden.has(signature)) };
}

async function persistListHidden(scope, sceneId, aspects, statuses) {
  if (!game.user.isGM) return;
  const visibility = getVisibility();
  const signatures = await aspectSignatures(aspects);
  const next = signatures.filter((signature, index) => statuses[index] === true);
  setHiddenBucket(visibility, scope, next, sceneId);
  await setVisibility(visibility);
}

function getTravellingSignatures() {
  const stored = clone(game.settings.get(MODULE_ID, "travellingAspects"));
  return Array.isArray(stored) ? stored : [];
}

async function travellingStatuses(aspects) {
  const signatures = await aspectSignatures(aspects);
  const travelling = new Set(getTravellingSignatures());
  return { signatures, statuses: signatures.map(signature => travelling.has(signature)) };
}

async function persistTravelling(aspects, statuses) {
  if (!game.user.isGM) return;
  const signatures = await aspectSignatures(aspects);
  const next = signatures.filter((signature, index) => statuses[index] === true);
  await game.settings.set(MODULE_ID, "travellingAspects", next);
}

function boostRecords(actor) {
  const nativeCount = normalizeCounter(actor.system?.details?.fatePoints?.boosts);
  let records = clone(actor.getFlag(MODULE_ID, "boosts"));
  if (!Array.isArray(records)) records = [];

  records = records.slice(0, nativeCount).map((record, index) => ({
    id: record?.id || `boost-${index}`,
    name: String(record?.name ?? ""),
    hidden: record?.hidden === true
  }));

  while (records.length < nativeCount) {
    records.push({
      id: `legacy-${records.length}`,
      name: game.i18n.localize("FAW.UnnamedBoost"),
      hidden: false
    });
  }
  return records;
}

async function persistBoostRecords(actor, records) {
  const clean = records.map((record, index) => ({
    id: record?.id || foundry.utils.randomID(),
    name: String(record?.name || game.i18n.localize("FAW.UnnamedBoost")),
    hidden: record?.hidden === true
  }));
  await actor.setFlag(MODULE_ID, "boosts", clean);
  await actor.update({ "system.details.fatePoints.boosts": clean.length });
}

async function syncBoostNamesToNative(actor) {
  if (!actor) return;
  const nativeCount = normalizeCounter(actor.system?.details?.fatePoints?.boosts);
  let stored = clone(actor.getFlag(MODULE_ID, "boosts"));
  if (!Array.isArray(stored)) stored = [];
  if (stored.length === nativeCount) return;

  stored = stored.slice(0, nativeCount).map((record, index) => ({
    id: record?.id || `boost-${index}`,
    name: String(record?.name || game.i18n.localize("FAW.UnnamedBoost")),
    hidden: record?.hidden === true
  }));
  while (stored.length < nativeCount) {
    stored.push({ id: foundry.utils.randomID(), name: game.i18n.localize("FAW.UnnamedBoost"), hidden: false });
  }
  await actor.setFlag(MODULE_ID, "boosts", stored);
}

async function resolveActorReference(actorOrUuid) {
  if (!actorOrUuid) return null;
  let actor = actorOrUuid;
  if (typeof actorOrUuid === "string") {
    try { actor = await fromUuid(actorOrUuid); } catch (_) { actor = null; }
    if (!actor) actor = game.actors?.get(actorOrUuid) ?? null;
  }
  if (actor instanceof TokenDocument) actor = actor.actor;
  return actor?.actor ?? actor;
}

async function addNamedBoost(actorOrUuid, name = "", options = {}) {
  const actor = await resolveActorReference(actorOrUuid);
  if (!actor || actor.type !== SYSTEM_ID) return null;
  if (!(game.user.isGM || actor.isOwner)) return null;

  const records = boostRecords(actor);
  const record = {
    id: foundry.utils.randomID(),
    name: String(name || game.i18n.localize("FAW.UnnamedBoost")).trim() || game.i18n.localize("FAW.UnnamedBoost"),
    hidden: options?.hidden === true
  };
  records.push(record);
  await persistBoostRecords(actor, records);
  notifyFateUtilities();
  scheduleRender();
  return { ...record, actorUuid: actor.uuid };
}

async function removeNamedBoost(actorOrUuid, boostId) {
  const actor = await resolveActorReference(actorOrUuid);
  if (!actor || actor.type !== SYSTEM_ID || !boostId) return false;
  if (!(game.user.isGM || actor.isOwner)) return false;

  const records = boostRecords(actor);
  const index = records.findIndex(record => record.id === boostId);
  if (index < 0) return false;
  records.splice(index, 1);
  await persistBoostRecords(actor, records);
  notifyFateUtilities();
  scheduleRender();
  return true;
}

function trackIsMarked(track) {
  const boxes = Array.isArray(track?.box_values) ? track.box_values : [];
  return boxes.length > 0 && boxes.some(Boolean);
}

function consequenceFromTrack(key, track, hiddenKeys) {
  if (!track || track.enabled === false || normalizeCounter(track.harm_can_absorb) <= 0) return null;
  const aspect = track.aspect;
  if (!aspect || typeof aspect !== "object") return null;

  const boxes = Array.isArray(track.box_values) ? track.box_values : [];
  const marked = trackIsMarked(track);
  if (boxes.length > 0 && !marked) return null;

  let value = "";
  let editable = false;
  if (aspect.when_marked) {
    value = String(aspect.name ?? "");
    editable = true;
    if (boxes.length === 0 && !value.trim()) return null;
  } else if (aspect.as_name) {
    if (!marked) return null;
    value = globalThis.FateToolkitI18n?.term?.(String(track.name ?? "")) || String(track.name ?? "");
  } else {
    return null;
  }

  return {
    key,
    label: globalThis.FateToolkitI18n?.term?.(String(track.name ?? game.i18n.localize("FAW.Consequences"))) || String(track.name ?? game.i18n.localize("FAW.Consequences")),
    value,
    harm: normalizeCounter(track.harm_can_absorb),
    editable,
    hidden: hiddenKeys.has(`track:${key}`)
  };
}

function availableConsequenceFromTrack(key, track) {
  if (!track || track.enabled === false || normalizeCounter(track.harm_can_absorb) <= 0) return null;
  const aspect = track.aspect;
  if (!aspect || typeof aspect !== "object" || (!aspect.when_marked && !aspect.as_name)) return null;
  const boxes = Array.isArray(track.box_values) ? track.box_values : [];
  const marked = boxes.some(Boolean);
  if (aspect.when_marked) {
    if ((boxes.length > 0 && marked) || (boxes.length === 0 && String(aspect.name ?? "").trim())) return null;
  } else if (aspect.as_name) {
    if (!boxes.length || marked) return null;
  }
  return {
    key,
    label: globalThis.FateToolkitI18n?.term?.(String(track.name ?? game.i18n.localize("FAW.Consequences"))) || String(track.name ?? game.i18n.localize("FAW.Consequences")),
    harm: normalizeCounter(track.harm_can_absorb),
    needsName: Boolean(aspect.when_marked)
  };
}

function fateObjectKey(text) {
  const bytes = new TextEncoder().encode(String(text ?? ""));
  return btoa(String.fromCodePoint(...bytes)).replaceAll("=", "");
}


function canModifyScene(scene) {
  return !!scene?.canUserModify?.(game.user, "update");
}

function getAspectMarkers(scene = viewedScene()) {
  if (!scene) return [];
  const stored = clone(scene.getFlag(MODULE_ID, MARKER_FLAG));
  return Array.isArray(stored) ? stored : [];
}

async function setAspectMarkers(scene, markers) {
  if (!scene || !canModifyScene(scene)) return false;
  await scene.setFlag(MODULE_ID, MARKER_FLAG, markers);
  return true;
}

function clearAspectMarkerLayer() {
  if (markerPositionFrame) cancelAnimationFrame(markerPositionFrame);
  markerPositionFrame = undefined;
  for (const timer of markerOpenTimers.values()) clearTimeout(timer);
  markerOpenTimers.clear();
  markerLayer?.remove();
  markerLayer = undefined;
}

function ensureAspectMarkerLayer() {
  if (markerLayer?.isConnected) return markerLayer;
  markerLayer = document.createElement("div");
  markerLayer.className = "faw-canvas-marker-layer";
  document.body.append(markerLayer);
  return markerLayer;
}

function positionAspectMarkers() {
  markerPositionFrame = undefined;
  if (!markerLayer?.isConnected || !canvas?.ready || !canvas?.stage) return;
  const view = canvas.app?.canvas ?? canvas.app?.view;
  if (!view?.getBoundingClientRect) return;
  const rect = view.getBoundingClientRect();

  for (const element of markerLayer.querySelectorAll(".faw-canvas-marker")) {
    const x = Number(element.dataset.x);
    const y = Number(element.dataset.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    let point;
    try {
      point = canvas.stage.worldTransform.apply({ x, y });
    } catch (_) {
      continue;
    }
    element.style.left = `${rect.left + point.x}px`;
    element.style.top = `${rect.top + point.y}px`;
  }
}

function scheduleMarkerPosition() {
  if (markerPositionFrame) return;
  markerPositionFrame = requestAnimationFrame(positionAspectMarkers);
}

async function confirmMarkerDelete() {
  return globalThis.FateToolkitUX.confirm({
    window: { title: game.i18n.localize("FAW.DeleteMarker") },
    content: `<p>${game.i18n.localize("FAW.DeleteMarkerConfirm")}</p>`,
    modal: true,
    rejectClose: false
  });
}

async function deleteAspectMarker(markerId) {
  const scene = viewedScene();
  if (!scene || !canModifyScene(scene) || !(await confirmMarkerDelete())) return;
  const markers = getAspectMarkers(scene);
  const next = markers.filter(marker => marker?.id !== markerId);
  if (next.length === markers.length) return;
  await setAspectMarkers(scene, next);
  renderAspectMarkers();
}

function renderAspectMarkers() {
  if (!canvas?.ready || !viewedScene()) {
    clearAspectMarkerLayer();
    return;
  }

  const root = ensureAspectMarkerLayer();
  for (const timer of markerOpenTimers.values()) clearTimeout(timer);
  markerOpenTimers.clear();
  root.replaceChildren();
  const scene = viewedScene();
  const markers = getAspectMarkers(scene);

  for (const marker of markers) {
    if (!marker || (marker.hidden && !game.user.isGM)) continue;

    const element = document.createElement("div");
    element.className = `faw-canvas-marker${marker.hidden ? " faw-canvas-marker-hidden" : ""}`;
    element.dataset.markerId = marker.id;
    element.dataset.x = String(marker.x ?? 0);
    element.dataset.y = String(marker.y ?? 0);

    element.addEventListener("dragover", event => {
      if (!Array.from(event.dataTransfer?.types ?? []).includes(ACTION_DRAG_MIME)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      element.classList.add("faw-action-drop-hover");
    });
    element.addEventListener("dragleave", event => {
      if (!element.contains(event.relatedTarget)) element.classList.remove("faw-action-drop-hover");
    });
    element.addEventListener("drop", event => {
      const raw = event.dataTransfer?.getData(ACTION_DRAG_MIME);
      if (!raw) return;
      event.preventDefault();
      event.stopPropagation();
      element.classList.remove("faw-action-drop-hover");
      let payload;
      try { payload = JSON.parse(raw); } catch (_) { return; }
      if (payload?.type !== "FateAspectAction") return;
      const api = game.modules.get(MODULE_ID)?.api;
      if (!api?.initiateActionAtTarget) {
        globalThis.FateToolkitUX.warn(game.i18n.localize("FAW.ActionWidgetUnavailable"));
        return;
      }
      void api.initiateActionAtTarget(payload.actionType, payload.actorRef, `marker:${marker.id}`);
    });

    const button = document.createElement("button");
    button.type = "button";
    button.className = "faw-canvas-marker-button";
    button.setAttribute("aria-label", marker.text || game.i18n.localize("FAW.Aspect"));
    button.innerHTML = '<i class="fa-solid fa-tag" aria-hidden="true"></i>';

    const card = document.createElement("div");
    card.className = "faw-canvas-marker-card";

    const text = document.createElement("div");
    text.className = "faw-canvas-marker-text";
    text.textContent = marker.text || game.i18n.localize("FAW.Aspect");
    card.append(text);

    if (marker.meta) {
      const meta = document.createElement("div");
      meta.className = "faw-canvas-marker-meta";
      meta.textContent = marker.meta;
      card.append(meta);
    }

    const actionTarget = document.createElement("button");
    actionTarget.type = "button";
    actionTarget.className = "faw-marker-target-button";
    actionTarget.title = game.i18n.localize("FAW.UseAsActionTarget");
    actionTarget.setAttribute("aria-label", actionTarget.title);
    actionTarget.innerHTML = '<i class="fa-solid fa-crosshairs" aria-hidden="true"></i>';
    actionTarget.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      const api = game.modules.get(MODULE_ID)?.api;
      if (api?.setActionTargetMarker) {
        api.setActionTargetMarker(marker.id);
        globalThis.FateToolkitUX.info(game.i18n.format("FAW.ActionTargetSelected", { name: marker.text || game.i18n.localize("FAW.Aspect") }));
      } else {
        globalThis.FateToolkitUX.warn(game.i18n.localize("FAW.ActionWidgetUnavailable"));
      }
    });
    card.append(actionTarget);

    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      element.classList.add("faw-marker-open");
      const existing = markerOpenTimers.get(marker.id);
      if (existing) clearTimeout(existing);
      markerOpenTimers.set(marker.id, setTimeout(() => {
        element.classList.remove("faw-marker-open");
        markerOpenTimers.delete(marker.id);
      }, MARKER_OPEN_MS));
    });

    if (canModifyScene(scene)) {
      button.addEventListener("contextmenu", event => {
        event.preventDefault();
        event.stopPropagation();
        void deleteAspectMarker(marker.id);
      });
    }

    element.append(button, card);
    root.append(element);
  }

  scheduleMarkerPosition();
}

async function createAspectMarkerFromDrop(data) {
  const scene = viewedScene();
  if (!scene || !canModifyScene(scene)) {
    globalThis.FateToolkitUX.warn(game.i18n.localize("FAW.MarkerPermission"));
    return;
  }

  const x = Number(data?.x);
  const y = Number(data?.y);
  const text = String(data?.text ?? "").trim();
  if (!Number.isFinite(x) || !Number.isFinite(y) || !text) return;

  const markers = getAspectMarkers(scene);
  markers.push({
    id: foundry.utils.randomID(),
    x,
    y,
    text,
    meta: String(data?.meta ?? ""),
    hidden: data?.hidden === true || data?.hidden === "true",
    source: data?.source && typeof data.source === "object" ? data.source : null
  });
  await setAspectMarkers(scene, markers);
  renderAspectMarkers();
}

function scheduleRender() {
  if (!widget?.rendered || renderQueued) return;
  renderQueued = true;
  queueMicrotask(async () => {
    renderQueued = false;
    if (!widget?.rendered) return;
    await widget.render(false);
  });
}

function setWidgetCollapsed(collapsed) {
  widgetCollapsed = Boolean(collapsed);
  if (!widget?.rendered) return;
  widget.element?.classList.toggle("faw-safe-collapsed", widgetCollapsed);
  const button = widget.element?.querySelector('[data-faw-safe-collapse]');
  if (button) {
    button.innerHTML = widgetCollapsed
      ? '<i class="fa-solid fa-chevron-down" aria-hidden="true"></i>'
      : '<i class="fa-solid fa-chevron-up" aria-hidden="true"></i>';
    button.title = game.i18n.localize(widgetCollapsed ? "FCT.Expand" : "FCT.Collapse");
    button.setAttribute("aria-label", button.title);
  }
}

function ensureSafeCollapseButton(app, onToggle) {
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
      onToggle();
    });
  }
}

async function openWidget() {
  if (!widget) widget = new FateAspectWidget();
  if (!widget.rendered) await widget.render(true);
  setWidgetCollapsed(false);
  widget.bringToFront?.();
}

async function toggleWidget() {
  if (!widget) widget = new FateAspectWidget();
  if (!widget.rendered) {
    widgetCollapsed = false;
    await widget.render(true);
    widget.bringToFront?.();
    return;
  }
  setWidgetCollapsed(!widgetCollapsed);
  widget.bringToFront?.();
}


function notifyFateUtilities() {
  try {
    game.socket?.emit(`system.${SYSTEM_ID}`, { render: true });
  } catch (err) {
    console.debug(`${MODULE_ID} | Fate Utilities socket refresh skipped`, err);
  }
}

function actorHiddenKeys(visibility, actorUuid) {
  const values = visibility.actors?.[actorUuid];
  return new Set(Array.isArray(values) ? values : []);
}

async function confirmDelete() {
  return globalThis.FateToolkitUX.confirm({
    window: { title: game.i18n.localize("FAW.Delete") },
    content: `<p>${game.i18n.localize("FAW.DeleteConfirm")}</p>`,
    modal: true,
    rejectClose: false
  });
}

async function confirmBoostDelete() {
  return globalThis.FateToolkitUX.confirm({
    window: { title: game.i18n.localize("FAW.Delete") },
    content: `<p>${game.i18n.localize("FAW.DeleteBoostConfirm")}</p>`,
    modal: true,
    rejectClose: false
  });
}


const { FawSafeWindow } = globalThis.FateToolkitWindowRuntime;

class FateAspectWidget extends FawSafeWindow {
  static FAW_GEOMETRY = { defaultWidth: 420, defaultHeight: 700, maxWidth: 840 };

  static DEFAULT_OPTIONS = {
    id: "fate-aspect-widget",
    tag: "section",
    classes: ["fate-aspect-widget", "fate"],
    position: {
      width: 420,
      height: 700
    },
    window: {
      frame: true,
      icon: "fa-solid fa-tags",
      title: "FAW.Title",
      resizable: true,
      minimizable: false
    }
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/widget.hbs`,
      scrollable: [".faw-scroll"]
    }
  };

  get title() {
    return game.i18n.localize("FAW.Title");
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const scene = viewedScene();
    const visibility = getVisibility();

    let rawGlobal = [];
    try {
      rawGlobal = clone(game.settings.get(SYSTEM_ID, "gameAspects"));
    } catch (err) {
      console.warn(`${MODULE_ID} | Could not read Fate gameAspects`, err);
    }
    if (!Array.isArray(rawGlobal)) rawGlobal = [];

    let rawScene = scene ? clone(scene.getFlag(SYSTEM_ID, "situation_aspects")) : [];
    if (!Array.isArray(rawScene)) rawScene = [];

    const globalState = await hiddenStatuses(rawGlobal, hiddenBucket(visibility, "global"));
    const travellingState = await travellingStatuses(rawGlobal);
    const sceneState = await hiddenStatuses(rawScene, hiddenBucket(visibility, "scene", scene?.id));
    const favorites = getAspectFavorites();

    const gameAspectRows = rawGlobal.map((aspect, index) => {
      const favoriteKey = `game:${globalState.signatures[index]}`;
      return {
        index,
        name: aspect?.name ?? "",
        freeInvokes: normalizeCounter(aspect?.free_invokes),
        hidden: globalState.statuses[index] === true,
        travelling: travellingState.statuses[index] === true,
        favoriteKey,
        favorite: favorites.has(favoriteKey)
      };
    });

    const globalAspects = favoriteFirst(gameAspectRows
      .filter(aspect => !aspect.travelling)
      .filter(aspect => game.user.isGM || !aspect.hidden));

    const travellingAspects = favoriteFirst(gameAspectRows
      .filter(aspect => aspect.travelling)
      .filter(aspect => game.user.isGM || !aspect.hidden));

    const sceneAspects = favoriteFirst(rawScene
      .map((aspect, index) => {
        const favoriteKey = `scene:${scene?.id || "none"}:${sceneState.signatures[index]}`;
        return {
          index,
          name: aspect?.name ?? "",
          freeInvokes: normalizeCounter(aspect?.free_invokes),
          hidden: sceneState.statuses[index] === true,
          favoriteKey,
          favorite: favorites.has(favoriteKey)
        };
      })
      .filter(aspect => game.user.isGM || !aspect.hidden));

    const canSeeHiddenTokens = game.user.isGM && game.settings.get(MODULE_ID, "showHiddenTokens");
    const actorEntries = [];
    const seen = new Set();

    if (scene) {
      for (const token of scene.tokens.contents) {
        if (token.hidden && !canSeeHiddenTokens) continue;

        const actor = token.actor;
        if (!actor) continue;
        if (!game.user.isGM && !actor.isOwner) continue;

        const identity = actor.uuid;
        if (seen.has(identity)) continue;
        seen.add(identity);

        const hiddenKeys = actorHiddenKeys(visibility, actor.uuid);
        const aspects = favoriteFirst(Object.entries(actor.system?.aspects ?? {})
          .map(([key, aspect]) => {
            const favoriteKey = `actor:${actor.uuid}:${key}`;
            return {
              key,
              label: aspect?.name ?? game.i18n.localize("FAW.Aspect"),
              value: aspect?.value ?? "",
              hidden: hiddenKeys.has(key),
              favoriteKey,
              favorite: favorites.has(favoriteKey)
            };
          })
          .filter(aspect => game.user.isGM || !aspect.hidden));

        const boosts = boostRecords(actor)
          .map((boost, index) => ({ ...boost, index }))
          .filter(boost => game.user.isGM || !boost.hidden);

        const consequences = favoriteFirst(Object.entries(actor.system?.tracks ?? {})
          .map(([key, track]) => consequenceFromTrack(key, track, hiddenKeys))
          .filter(Boolean)
          .map(consequence => {
            const favoriteKey = `consequence:${actor.uuid}:${consequence.key}`;
            return { ...consequence, favoriteKey, favorite: favorites.has(favoriteKey) };
          })
          .filter(consequence => game.user.isGM || !consequence.hidden));
        const availableConsequences = Object.entries(actor.system?.tracks ?? {})
          .map(([key, track]) => availableConsequenceFromTrack(key, track))
          .filter(Boolean);

        actorEntries.push({
          tokenId: token.id,
          actorUuid: actor.uuid,
          name: token.name || actor.name,
          actorName: actor.name,
          img: token.texture?.src || actor.img,
          canEdit: actor.isOwner,
          canManage: game.user.isGM,
          aspects,
          boosts,
          consequences,
          availableConsequences
        });
      }
    }

    actorEntries.sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));

    const boostActors = actorEntries
      .filter(actor => actor.boosts.length > 0 || actor.canEdit)
      .map(actor => ({
        tokenId: actor.tokenId,
        actorUuid: actor.actorUuid,
        name: actor.name,
        img: actor.img,
        canEdit: actor.canEdit,
        canManage: actor.canManage,
        boosts: actor.boosts
      }));

    const consequenceActors = actorEntries
      .filter(actor => actor.consequences.length > 0 || (actor.canEdit && actor.availableConsequences.length > 0))
      .map(actor => ({
        tokenId: actor.tokenId,
        actorUuid: actor.actorUuid,
        name: actor.name,
        img: actor.img,
        canEdit: actor.canEdit,
        canManage: actor.canManage,
        consequences: actor.consequences,
        availableConsequences: actor.availableConsequences
      }));

    return foundry.utils.mergeObject(context, {
      isGM: game.user.isGM,
      gmFatePoints: game.user.isGM ? normalizeCounter(game.user.getFlag(SYSTEM_ID, "gmfatepoints")) : 0,
      campaignMode: Boolean(globalThis.FateToolkitWill?.enabled?.()),
      sceneName: scene?.name ?? "",
      canEditGlobal: game.user.isGM,
      canEditScene: !!scene && canModifyScene(scene),
      globalAspects,
      travellingAspects,
      sceneAspects,
      boostActors,
      boostCount: boostActors.reduce((total, actor) => total + actor.boosts.length, 0),
      consequenceActors,
      consequenceCount: consequenceActors.reduce((total, actor) => total + actor.consequences.length, 0),
      actors: actorEntries
    }, { inplace: false });
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    ensureSafeCollapseButton(this, () => setWidgetCollapsed(!widgetCollapsed));
    setWidgetCollapsed(widgetCollapsed);

    this.#bindSectionUi();
    this.element.querySelector("[data-action='refresh']")?.addEventListener("click", () => this.render(false));
    this.element.querySelector("[data-action='gm-fp-dec']")?.addEventListener("click", () => this.#changeGmFatePoints(-1));
    this.element.querySelector("[data-action='gm-fp-inc']")?.addEventListener("click", () => this.#changeGmFatePoints(1));
    this.element.querySelector("[data-source='gm-fate-points']")?.addEventListener("change", event => this.#setGmFatePoints(event.currentTarget.value));
    this.element.querySelector("[data-action='add-global']")?.addEventListener("click", () => this.#addGlobal());
    this.element.querySelector("[data-action='add-travelling']")?.addEventListener("click", () => this.#addTravelling());
    this.element.querySelector("[data-action='add-scene']")?.addEventListener("click", () => this.#addScene());

    this.#bindIndexedAction("delete-game", index => this.#deleteGameAspect(index));
    this.#bindIndexedAction("toggle-game-hidden", index => this.#toggleGameHidden(index));
    this.#bindIndexedAction("delete-scene", index => this.#deleteScene(index));
    this.#bindIndexedAction("toggle-scene-hidden", index => this.#toggleSceneHidden(index));

    this.element.querySelectorAll("[data-action='delete-actor']").forEach(element => {
      element.addEventListener("click", event => this.#deleteActorAspect(event.currentTarget));
    });
    this.element.querySelectorAll("[data-action='add-character-aspect']").forEach(element => {
      element.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        void this.#addCharacterAspect(event.currentTarget);
      });
    });
    this.element.querySelectorAll("[data-action='add-consequence']").forEach(element => {
      element.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        void this.#addConsequence(event.currentTarget);
      });
    });
    this.element.querySelectorAll("[data-action='toggle-actor-hidden']").forEach(element => {
      element.addEventListener("click", event => this.#toggleActorHidden(event.currentTarget));
    });
    this.element.querySelectorAll("[data-action='add-boost']").forEach(element => {
      element.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        void this.#addBoost(event.currentTarget);
      });
    });
    this.element.querySelectorAll("[data-action='delete-boost']").forEach(element => {
      element.addEventListener("click", event => this.#deleteBoost(event.currentTarget));
    });
    this.element.querySelectorAll("[data-action='toggle-boost-hidden']").forEach(element => {
      element.addEventListener("click", event => this.#toggleBoostHidden(event.currentTarget));
    });
    this.element.querySelectorAll("[data-action='toggle-consequence-hidden']").forEach(element => {
      element.addEventListener("click", event => this.#toggleConsequenceHidden(event.currentTarget));
    });
    this.element.querySelectorAll("[data-action='toggle-aspect-favorite']").forEach(element => {
      element.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        void toggleAspectFavorite(event.currentTarget.dataset.favoriteKey);
      });
    });

    this.element.querySelectorAll("[data-faw-drag='aspect']").forEach(element => {
      element.setAttribute("draggable", "true");
      element.addEventListener("dragstart", event => this.#startAspectDrag(event.currentTarget, event));
    });
    this.element.querySelectorAll("[data-aspect-drop-target]").forEach(element => {
      element.addEventListener("dragover", event => {
        event.preventDefault();
        element.classList.add("faw-aspect-drop-active");
      });
      element.addEventListener("dragleave", () => element.classList.remove("faw-aspect-drop-active"));
      element.addEventListener("drop", event => void this.#dropAspectIntoSection(element, event));
    });

    this.element.querySelectorAll("input[data-source]").forEach(input => {
      input.addEventListener("change", event => this.#commitInput(event.currentTarget));
      input.addEventListener("keydown", event => {
        if (event.key === "Enter") event.currentTarget.blur();
      });
    });
  }

  async #setGmFatePoints(value) {
    if (!game.user.isGM) return;
    const fatePoints = normalizeCounter(value);
    await game.user.setFlag(SYSTEM_ID, "gmfatepoints", fatePoints);
    notifyFateUtilities();
    await this.render(false);
  }

  async #changeGmFatePoints(delta) {
    if (!game.user.isGM) return;
    const current = normalizeCounter(game.user.getFlag(SYSTEM_ID, "gmfatepoints"));
    await this.#setGmFatePoints(Math.max(0, current + delta));
  }

  #bindSectionUi() {
    const openState = getSectionOpenState();
    const filters = getSectionFilters();

    for (const detail of this.element.querySelectorAll("details[data-block-key]")) {
      const key = detail.dataset.blockKey;
      detail.open = openState[key] === true;
      detail.addEventListener("toggle", () => {
        if (this._bulkSectionToggle) return;
        const next = getSectionOpenState();
        if (detail.open) next[key] = true;
        else delete next[key];
        void game.settings.set(MODULE_ID, "sectionOpenState", next);
      });
    }

    const applyFilter = key => {
      const visible = filters[key] !== false;
      for (const section of this.element.querySelectorAll(`[data-section='${key}']`)) {
        section.hidden = !visible;
      }
      const button = this.element.querySelector(`[data-section-filter='${key}']`);
      if (button) {
        button.classList.toggle("faw-filter-active", visible);
        button.setAttribute("aria-pressed", visible ? "true" : "false");
      }
    };

    for (const key of Object.keys(DEFAULT_SECTION_FILTERS)) applyFilter(key);

    this.element.querySelectorAll("[data-section-filter]").forEach(button => {
      button.addEventListener("click", () => {
        const key = button.dataset.sectionFilter;
        if (!(key in filters)) return;
        filters[key] = !filters[key];
        void game.settings.set(MODULE_ID, "sectionFilters", filters);
        applyFilter(key);
      });
    });

    this.element.querySelector("[data-action='collapse-all']")?.addEventListener("click", () => this.#setAllSectionsOpen(false));
    this.element.querySelector("[data-action='expand-all']")?.addEventListener("click", () => this.#setAllSectionsOpen(true));
  }

  async #setAllSectionsOpen(open) {
    const details = [...this.element.querySelectorAll("details[data-block-key]")].filter(detail => !detail.hidden && !detail.closest("[hidden]"));
    const next = getSectionOpenState();
    this._bulkSectionToggle = true;
    try {
      for (const detail of details) {
        detail.open = open;
        const key = detail.dataset.blockKey;
        if (open) next[key] = true;
        else delete next[key];
      }
      await game.settings.set(MODULE_ID, "sectionOpenState", next);
    } finally {
      this._bulkSectionToggle = false;
    }
  }

  #bindIndexedAction(action, handler) {
    this.element.querySelectorAll(`[data-action='${action}']`).forEach(element => {
      element.addEventListener("click", event => handler(Number(event.currentTarget.dataset.index)));
    });
  }

  #startAspectDrag(element, event) {
    if (!event.dataTransfer) return;
    const sourceType = element.dataset.dragSource || "";
    let source = null;
    if (sourceType === "game") {
      source = { kind: "game", index: Number(element.dataset.dragIndex) };
    } else if (sourceType === "scene") {
      source = { kind: "scene", sceneId: viewedScene()?.id ?? null, index: Number(element.dataset.dragIndex) };
    } else if (sourceType === "actor") {
      const actor = this.#getActorFromElement(element);
      source = { kind: "actor", actorUuid: actor?.uuid ?? null, key: element.dataset.dragKey || null };
    } else if (sourceType === "boost") {
      const actor = this.#getActorFromElement(element);
      source = { kind: "boost", actorUuid: actor?.uuid ?? null, boostId: element.dataset.dragBoostId || null };
    } else if (sourceType === "consequence") {
      const actor = this.#getActorFromElement(element);
      source = { kind: "consequence", actorUuid: actor?.uuid ?? null, key: element.dataset.dragKey || null };
    }

    const payload = {
      type: "FateAspectWidgetAspect",
      text: element.dataset.dragText ?? "",
      meta: element.dataset.dragMeta ?? "",
      hidden: element.dataset.dragHidden === "true",
      freeInvokes: normalizeCounter(element.dataset.dragInvokes),
      source
    };
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("text/plain", JSON.stringify(payload));
  }

  async #dropAspectIntoSection(element, event) {
    event.preventDefault();
    element.classList.remove("faw-aspect-drop-active");
    let payload = null;
    try { payload = JSON.parse(event.dataTransfer?.getData("text/plain") || "null"); } catch (_) {}
    if (payload?.type !== "FateAspectWidgetAspect") return;
    if (["boost"].includes(payload.source?.kind)) return globalThis.FateToolkitUX.warn(game.i18n.localize("FAW.BoostDropNotAspect"));
    const scope = element.dataset.aspectDropTarget;
    if (scope === "scene") {
      const created = await addSceneAspect(viewedScene(), payload.text, payload.freeInvokes);
      if (created) globalThis.FateToolkitUX.info(game.i18n.format("FAW.AspectDropped", { name: created.name }));
      return;
    }
    if (scope === "global" && game.user.isGM) {
      const aspects = clone(game.settings.get(SYSTEM_ID, "gameAspects"));
      const list = Array.isArray(aspects) ? aspects : [];
      list.push({ name: String(payload.text || "").trim(), free_invokes: normalizeCounter(payload.freeInvokes), notes: "" });
      await game.settings.set(SYSTEM_ID, "gameAspects", list);
      notifyFateUtilities();
      await this.render(false);
    }
  }

  async #commitInput(input) {
    const source = input.dataset.source;
    if (source === "game") return this.#updateGameAspect(input);
    if (source === "scene") return this.#updateScene(input);
    if (source === "actor") return this.#updateActor(input);
    if (source === "boost-name") return this.#updateBoostName(input);
    if (source === "consequence") return this.#updateConsequence(input);
  }

  #getActorFromElement(element) {
    const scene = viewedScene();
    const token = scene?.tokens?.get(element.dataset.tokenId);
    return token?.actor ?? null;
  }

  #mayEditActor(actor) {
    return !!actor?.isOwner;
  }

  async #updateGameAspect(input) {
    if (!game.user.isGM) return;
    const index = Number(input.dataset.index);
    const field = input.dataset.field;
    const aspects = clone(game.settings.get(SYSTEM_ID, "gameAspects"));
    if (!Array.isArray(aspects) || !aspects[index]) return;

    const visibility = getVisibility();
    const hiddenBefore = await hiddenStatuses(aspects, hiddenBucket(visibility, "global"));
    const travellingBefore = await travellingStatuses(aspects);

    aspects[index][field] = field === "free_invokes" ? normalizeCounter(input.value) : input.value;
    await game.settings.set(SYSTEM_ID, "gameAspects", aspects);

    if (field === "name") {
      await persistListHidden("global", null, aspects, hiddenBefore.statuses);
      await persistTravelling(aspects, travellingBefore.statuses);
    }
    notifyFateUtilities();
    await this.render(false);
  }

  async #updateScene(input) {
    if (!game.user.isGM) return;
    const scene = viewedScene();
    if (!scene) return;

    const index = Number(input.dataset.index);
    const field = input.dataset.field;
    const aspects = clone(scene.getFlag(SYSTEM_ID, "situation_aspects"));
    if (!Array.isArray(aspects) || !aspects[index]) return;

    const visibility = getVisibility();
    const before = await hiddenStatuses(aspects, hiddenBucket(visibility, "scene", scene.id));

    aspects[index][field] = field === "free_invokes" ? normalizeCounter(input.value) : input.value;
    await scene.setFlag(SYSTEM_ID, "situation_aspects", aspects);

    if (field === "name") await persistListHidden("scene", scene.id, aspects, before.statuses);
    notifyFateUtilities();
    await this.render(false);
  }

  async #updateActor(input) {
    const actor = this.#getActorFromElement(input);
    if (!this.#mayEditActor(actor)) return;

    const key = input.dataset.key;
    if (!key || actor.system?.aspects?.[key] == null) return;

    await actor.update({ [`system.aspects.${key}.value`]: input.value });
    notifyFateUtilities();
    await this.render(false);
  }

  async #updateBoostName(input) {
    const actor = this.#getActorFromElement(input);
    if (!this.#mayEditActor(actor)) return;
    const index = Number(input.dataset.index);
    const records = boostRecords(actor);
    if (!records[index]) return;
    records[index].name = input.value.trim() || game.i18n.localize("FAW.UnnamedBoost");
    await persistBoostRecords(actor, records);
    notifyFateUtilities();
    await this.render(false);
  }

  async #updateConsequence(input) {
    const actor = this.#getActorFromElement(input);
    if (!this.#mayEditActor(actor)) return;
    const key = input.dataset.key;
    const track = actor.system?.tracks?.[key];
    if (!key || !track || !track.aspect?.when_marked) return;
    await actor.update({ [`system.tracks.${key}.aspect.name`]: input.value });
    notifyFateUtilities();
    await this.render(false);
  }

  async #addGlobal() {
    if (!game.user.isGM) return;
    const aspects = clone(game.settings.get(SYSTEM_ID, "gameAspects"));
    const list = Array.isArray(aspects) ? aspects : [];
    list.push({
      name: game.i18n.localize("FAW.NewAspect"),
      free_invokes: 0,
      notes: ""
    });
    await game.settings.set(SYSTEM_ID, "gameAspects", list);
    notifyFateUtilities();
    await this.render(false);
  }

  async #addTravelling() {
    if (!game.user.isGM) return;
    const aspects = clone(game.settings.get(SYSTEM_ID, "gameAspects"));
    const list = Array.isArray(aspects) ? aspects : [];
    const travelling = await travellingStatuses(list);
    list.push({
      name: game.i18n.localize("FAW.NewTravellingAspect"),
      free_invokes: 0,
      notes: ""
    });
    travelling.statuses.push(true);
    await game.settings.set(SYSTEM_ID, "gameAspects", list);
    await persistTravelling(list, travelling.statuses);
    notifyFateUtilities();
    await this.render(false);
  }

  async #deleteGameAspect(index) {
    if (!game.user.isGM || !(await confirmDelete())) return;
    const aspects = clone(game.settings.get(SYSTEM_ID, "gameAspects"));
    if (!Array.isArray(aspects) || !aspects[index]) return;

    const visibility = getVisibility();
    const hiddenBefore = await hiddenStatuses(aspects, hiddenBucket(visibility, "global"));
    const travellingBefore = await travellingStatuses(aspects);
    aspects.splice(index, 1);
    hiddenBefore.statuses.splice(index, 1);
    travellingBefore.statuses.splice(index, 1);

    await game.settings.set(SYSTEM_ID, "gameAspects", aspects);
    await persistListHidden("global", null, aspects, hiddenBefore.statuses);
    await persistTravelling(aspects, travellingBefore.statuses);
    notifyFateUtilities();
    await this.render(false);
  }

  async #toggleGameHidden(index) {
    if (!game.user.isGM) return;
    const aspects = clone(game.settings.get(SYSTEM_ID, "gameAspects"));
    if (!Array.isArray(aspects) || !aspects[index]) return;

    const visibility = getVisibility();
    const state = await hiddenStatuses(aspects, hiddenBucket(visibility, "global"));
    state.statuses[index] = !state.statuses[index];
    await persistListHidden("global", null, aspects, state.statuses);
    await this.render(false);
  }

  async #addCharacterAspect(element) {
    const actor = this.#getActorFromElement(element);
    if (!this.#mayEditActor(actor)) return;
    const result = await foundry.applications.api.DialogV2.wait({
      window: { title: game.i18n.localize("FAW.AddCharacterAspect"), resizable: true, minimizable: false },
      position: { width: 420, height: "auto" },
      content: `<div class="faw-compact-dialog"><label><span>${game.i18n.localize("FAW.AspectSlotName")}</span><input name="slot" value="${game.i18n.localize("FAW.Aspect")}"></label><label><span>${game.i18n.localize("FAW.AspectText")}</span><input name="value" autofocus></label></div>`,
      buttons: [{ action: "add", label: game.i18n.localize("FAW.Add"), icon: "fa-solid fa-plus", default: true, callback: (event, button) => ({ slot: String(button.form?.elements?.slot?.value || "").trim(), value: String(button.form?.elements?.value?.value || "").trim() }) }],
      modal: true,
      rejectClose: false
    });
    if (!result?.slot) return;
    let slot = result.slot;
    const aspects = actor.system?.aspects ?? {};
    let n = 2;
    while (aspects[fateObjectKey(slot)]) slot = `${result.slot} ${n++}`;
    const key = fateObjectKey(slot);
    await actor.update({ [`system.aspects.${key}`]: { name: slot, value: result.value || "", description: "", notes: "" } });
    notifyFateUtilities();
    await this.render(false);
  }

  async #addConsequence(element) {
    const actor = this.#getActorFromElement(element);
    if (!this.#mayEditActor(actor)) return;
    const available = Object.entries(actor.system?.tracks ?? {}).map(([key, track]) => availableConsequenceFromTrack(key, track)).filter(Boolean);
    if (!available.length) return globalThis.FateToolkitUX.info(game.i18n.localize("FAW.NoFreeConsequences"));
    const options = available.map((row, index) => `<option value="${row.key}" ${index === 0 ? "selected" : ""}>${row.label} (${row.harm})</option>`).join("");
    const result = await foundry.applications.api.DialogV2.wait({
      window: { title: game.i18n.localize("FAW.AddConsequence"), resizable: true, minimizable: false },
      position: { width: 420, height: "auto" },
      content: `<div class="faw-compact-dialog"><label><span>${game.i18n.localize("FAW.ConsequenceSlot")}</span><select name="trackKey">${options}</select></label><label><span>${game.i18n.localize("FAW.ConsequenceText")}</span><input name="value" autofocus></label></div>`,
      buttons: [{ action: "add", label: game.i18n.localize("FAW.Add"), icon: "fa-solid fa-plus", default: true, callback: (event, button) => ({ key: String(button.form?.elements?.trackKey?.value || ""), value: String(button.form?.elements?.value?.value || "").trim() }) }],
      modal: true,
      rejectClose: false
    });
    if (!result?.key) return;
    const track = actor.system?.tracks?.[result.key];
    if (!track) return;
    const update = {};
    if (track.aspect?.when_marked) {
      if (!result.value) return globalThis.FateToolkitUX.warn(game.i18n.localize("FAW.ConsequenceTextRequired"));
      update[`system.tracks.${result.key}.aspect.name`] = result.value;
    }
    const boxes = Array.isArray(track.box_values) ? [...track.box_values] : [];
    if (boxes.length > 0 && !boxes.some(Boolean)) {
      const first = boxes.findIndex(value => !value);
      if (first >= 0) boxes[first] = true;
      update[`system.tracks.${result.key}.box_values`] = boxes;
    }
    if (!Object.keys(update).length) return;
    await actor.update(update);
    notifyFateUtilities();
    await this.render(false);
  }

  async #addBoost(element) {
    const actor = this.#getActorFromElement(element);
    if (!this.#mayEditActor(actor)) return;
    const records = boostRecords(actor);
    records.push({ id: foundry.utils.randomID(), name: game.i18n.localize("FAW.NewBoost"), hidden: false });
    await persistBoostRecords(actor, records);
    notifyFateUtilities();
    await this.render(false);
  }

  async #deleteBoost(element) {
    const actor = this.#getActorFromElement(element);
    if (!this.#mayEditActor(actor) || !(await confirmBoostDelete())) return;
    const index = Number(element.dataset.index);
    const records = boostRecords(actor);
    if (!records[index]) return;
    records.splice(index, 1);
    await persistBoostRecords(actor, records);
    notifyFateUtilities();
    await this.render(false);
  }

  async #toggleBoostHidden(element) {
    if (!game.user.isGM) return;
    const actor = this.#getActorFromElement(element);
    const index = Number(element.dataset.index);
    if (!actor) return;
    const records = boostRecords(actor);
    if (!records[index]) return;
    records[index].hidden = !records[index].hidden;
    await persistBoostRecords(actor, records);
    await this.render(false);
  }

  async #toggleConsequenceHidden(element) {
    if (!game.user.isGM) return;
    const actor = this.#getActorFromElement(element);
    const key = element.dataset.key;
    if (!actor || !key || !actor.system?.tracks?.[key]) return;

    const visibility = getVisibility();
    visibility.actors ??= {};
    const hidden = actorHiddenKeys(visibility, actor.uuid);
    const marker = `track:${key}`;
    if (hidden.has(marker)) hidden.delete(marker);
    else hidden.add(marker);
    if (hidden.size) visibility.actors[actor.uuid] = Array.from(hidden);
    else delete visibility.actors[actor.uuid];
    await setVisibility(visibility);
    await this.render(false);
  }

  async #addScene() {
    if (!game.user.isGM) return;
    const scene = viewedScene();
    if (!scene) return;

    const aspects = clone(scene.getFlag(SYSTEM_ID, "situation_aspects"));
    const list = Array.isArray(aspects) ? aspects : [];
    list.push({
      name: game.i18n.localize("FAW.NewAspect"),
      free_invokes: 0
    });
    await scene.setFlag(SYSTEM_ID, "situation_aspects", list);
    notifyFateUtilities();
    await this.render(false);
  }

  async #deleteScene(index) {
    if (!game.user.isGM || !(await confirmDelete())) return;
    const scene = viewedScene();
    if (!scene) return;

    const aspects = clone(scene.getFlag(SYSTEM_ID, "situation_aspects"));
    if (!Array.isArray(aspects) || !aspects[index]) return;

    const visibility = getVisibility();
    const before = await hiddenStatuses(aspects, hiddenBucket(visibility, "scene", scene.id));
    aspects.splice(index, 1);
    before.statuses.splice(index, 1);

    await scene.setFlag(SYSTEM_ID, "situation_aspects", aspects);
    await persistListHidden("scene", scene.id, aspects, before.statuses);
    notifyFateUtilities();
    await this.render(false);
  }

  async #toggleSceneHidden(index) {
    if (!game.user.isGM) return;
    const scene = viewedScene();
    if (!scene) return;

    const aspects = clone(scene.getFlag(SYSTEM_ID, "situation_aspects"));
    if (!Array.isArray(aspects) || !aspects[index]) return;

    const visibility = getVisibility();
    const state = await hiddenStatuses(aspects, hiddenBucket(visibility, "scene", scene.id));
    state.statuses[index] = !state.statuses[index];
    await persistListHidden("scene", scene.id, aspects, state.statuses);
    await this.render(false);
  }

  async #toggleActorHidden(element) {
    if (!game.user.isGM) return;
    const actor = this.#getActorFromElement(element);
    const key = element.dataset.key;
    if (!actor || !key || !actor.system?.aspects?.[key]) return;

    const visibility = getVisibility();
    visibility.actors ??= {};
    const hidden = actorHiddenKeys(visibility, actor.uuid);

    if (hidden.has(key)) hidden.delete(key);
    else hidden.add(key);

    if (hidden.size) visibility.actors[actor.uuid] = Array.from(hidden);
    else delete visibility.actors[actor.uuid];

    await setVisibility(visibility);
    await this.render(false);
  }

  async #deleteActorAspect(element) {
    if (!game.user.isGM || !(await confirmDelete())) return;
    const actor = this.#getActorFromElement(element);
    const key = element.dataset.key;
    if (!actor || !key || !actor.system?.aspects?.[key]) return;

    // This matches the v13.6 system's object-key deletion semantics instead of replacing
    // the whole aspects object and potentially clobbering a simultaneous system update.
    await actor.update({ "system.aspects": { [`-=${key}`]: null } });

    const visibility = getVisibility();
    const hidden = actorHiddenKeys(visibility, actor.uuid);
    if (hidden.delete(key)) {
      if (hidden.size) visibility.actors[actor.uuid] = Array.from(hidden);
      else delete visibility.actors[actor.uuid];
      await setVisibility(visibility);
    }

    notifyFateUtilities();
    await this.render(false);
  }
}


// v0.8.6: recovery for Foundry/Fate windows which remain stuck after native minimization.
Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "autoOpen", {
    name: "FAW.AutoOpenName",
    hint: "FAW.AutoOpenHint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "showHiddenTokens", {
    name: "FAW.ShowHiddenName",
    hint: "FAW.ShowHiddenHint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });

  // Legacy browser-local key retained only so v1.39 can migrate an existing compact preference once.
  game.settings.register(MODULE_ID, "uiDensity", {
    scope: "client",
    config: false,
    type: String,
    choices: {
      standard: "FAW.UiDensityStandard",
      compact: "FAW.UiDensityCompact"
    },
    default: "standard"
  });

  game.settings.register(MODULE_ID, "uiDensityProfile", {
    name: "FAW.UiDensityName",
    hint: "FAW.UiDensityHint",
    scope: "user",
    config: true,
    type: String,
    choices: {
      compact: "FAW.UiDensityCompact",
      standard: "FAW.UiDensityStandard",
      comfortable: "FAW.UiDensityComfortable"
    },
    default: "standard"
  });

  game.settings.register(MODULE_ID, "uiTextScale", {
    name: "FAW.UiTextScaleName",
    hint: "FAW.UiTextScaleHint",
    scope: "user",
    config: true,
    type: String,
    choices: {
      small: "FAW.UiTextScaleSmall",
      standard: "FAW.UiTextScaleStandard",
      large: "FAW.UiTextScaleLarge"
    },
    default: "standard"
  });

  game.settings.register(MODULE_ID, "uiProfileMigrated", {
    scope: "user",
    config: false,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, "chatHistoryDefaultOpen", {
    name: "FAW.ChatHistoryOpenName",
    hint: "FAW.ChatHistoryOpenHint",
    scope: "client",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, "widgetPosition", {
    scope: "client",
    config: false,
    type: Object,
    default: {}
  });

  game.settings.register(MODULE_ID, "windowGeometryRevision", {
    scope: "client",
    config: false,
    type: Number,
    default: 0
  });

  game.settings.register(MODULE_ID, "sectionOpenState", {
    scope: "client",
    config: false,
    type: Object,
    default: {}
  });

  game.settings.register(MODULE_ID, "sectionFilters", {
    scope: "client",
    config: false,
    type: Object,
    default: { ...DEFAULT_SECTION_FILTERS }
  });

  game.settings.register(MODULE_ID, "aspectFavorites", {
    scope: "user",
    config: false,
    type: Object,
    default: []
  });

  game.settings.register(MODULE_ID, "visibility", {
    scope: "world",
    config: false,
    type: Object,
    restricted: true,
    default: emptyVisibility()
  });


  game.settings.register(MODULE_ID, "travellingAspects", {
    scope: "world",
    config: false,
    type: Object,
    restricted: true,
    default: []
  });
});

Hooks.once("ready", async () => {
  if (game.system.id !== SYSTEM_ID) return;
  await migrateLegacyUiProfile();
  applyUiPreferences();

  if (game.system.version !== TARGET_SYSTEM_VERSION) {
    globalThis.FateToolkitUX.warn(game.i18n.format("FAW.VersionWarning", {
      expected: TARGET_SYSTEM_VERSION,
      actual: game.system.version
    }));
  }

  if (game.version !== TARGET_FOUNDRY_VERSION) {
    console.warn(`${MODULE_ID} | Built for Foundry ${TARGET_FOUNDRY_VERSION}; running ${game.version}`);
  }

  // v0.8.3 migration: discard geometry from builds that modified position during minimize/maximize. Native Foundry now owns window geometry.
  // Discard them once instead of trying to infer whether a poisoned value is intentional.
  if (game.settings.get(MODULE_ID, "windowGeometryRevision") < 3) {
    await game.settings.set(MODULE_ID, "widgetPosition", {});
    try { await game.settings.set(MODULE_ID, "actionWidgetPosition", {}); } catch (_) {}
    await game.settings.set(MODULE_ID, "windowGeometryRevision", 3);
  }

  widget = new FateAspectWidget();
  const existingApi = game.modules.get(MODULE_ID).api ?? {};
  game.modules.get(MODULE_ID).api = {
    ...existingApi,
    open: () => openWidget(),
    close: () => widget.close(),
    toggle: () => toggleWidget(),
    refresh: () => scheduleRender(),
    addBoost: (actorOrUuid, name, options) => addNamedBoost(actorOrUuid, name, options),
    removeBoost: (actorOrUuid, boostId) => removeNamedBoost(actorOrUuid, boostId),
    addSceneAspect: (sceneOrId, name, freeInvokes, options) => addSceneAspect(sceneOrId, name, freeInvokes, options),
    removeSceneAspect: (sceneOrId, aspectId) => removeSceneAspect(sceneOrId, aspectId),
    adjustAspectFreeInvokes: (source, delta, expectedName) => adjustAspectFreeInvokes(source, delta, expectedName),
    removeAspectSource: (source, expectedName) => removeAspectSource(source, expectedName),
    removeAspectMarker: (markerId, sceneId, options) => removeAspectMarker(markerId, sceneId, options),
    getBoosts: async actorOrUuid => {
      const actor = await resolveActorReference(actorOrUuid);
      return actor ? boostRecords(actor) : [];
    },
    getMarkers: () => getAspectMarkers(viewedScene()).filter(marker => marker && (game.user.isGM || !marker.hidden)),
    getMarker: markerId => getAspectMarkers(viewedScene()).find(marker => marker?.id === markerId) ?? null,
    renderMarkers: () => renderAspectMarkers(),
    get app() { return widget; }
  };

  if (game.settings.get(MODULE_ID, "autoOpen")) await widget.render(true);
  window.addEventListener("resize", scheduleMarkerPosition);
  renderAspectMarkers();
});

Hooks.on("canvasReady", () => {
  scheduleRender();
  renderAspectMarkers();
});
Hooks.on("canvasPan", () => scheduleMarkerPosition());
Hooks.on("canvasTearDown", () => clearAspectMarkerLayer());
Hooks.on("dropCanvasData", (canvasInstance, data) => {
  if (data?.type !== "FateAspectWidgetAspect") return;
  void createAspectMarkerFromDrop(data);
  return false;
});
Hooks.on("updateActor", (actor, changes) => {
  if (foundry.utils.getProperty(changes, "system.details.fatePoints.boosts") !== undefined) {
    void syncBoostNamesToNative(actor);
  }
  scheduleRender();
});
Hooks.on("createToken", () => scheduleRender());
Hooks.on("updateToken", () => scheduleRender());
Hooks.on("deleteToken", () => scheduleRender());
Hooks.on("updateScene", scene => {
  if (scene.id === viewedScene()?.id) {
    scheduleRender();
    renderAspectMarkers();
  }
});
Hooks.on("updateSetting", setting => {
  const key = String(setting?.key || "");
  if (key === `${MODULE_ID}.uiDensityProfile` || key === `${MODULE_ID}.uiTextScale`) {
    applyUiPreferences();
    refreshToolkitUi();
    return;
  }
  if (key === `${MODULE_ID}.chatHistoryDefaultOpen`) {
    refreshToolkitUi();
    ui.chat?.render?.();
    return;
  }
  if (key === `${SYSTEM_ID}.gameAspects` || key === `${MODULE_ID}.visibility` || key === `${MODULE_ID}.travellingAspects`) {
    scheduleRender();
  }
});
Hooks.on("updateUser", () => scheduleRender());

Hooks.on("getSceneControlButtons", controls => {
  const tokenControls = controls?.tokens;
  if (!tokenControls?.tools) return;

  tokenControls.tools.aspectWidget = {
    name: "aspectWidget",
    title: "FAW.Toggle",
    icon: "fa-solid fa-tags",
    order: Object.keys(tokenControls.tools).length,
    button: true,
    visible: true,
    onChange: () => {
      void toggleWidget();
    }
  };
});
