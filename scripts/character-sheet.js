const FATE_SHEET_MODULE_ID = "fate-aspect-widget";
const FATE_SHEET_SYSTEM_ID = "fate-core-official";
const FATE_SHEET_PREFS_KEY = "characterSheetPreferences";
const FATE_SHEET_CUSTOM_FIELDS_KEY = "characterSheetCustomFields";

const FATE_SHEET_PLAY_SECTIONS = Object.freeze(["aspects", "skills", "stunts", "tracks", "extras"]);
const FATE_SHEET_STORY_SECTIONS = Object.freeze(["description", "biography", "notes", "custom"]);
const FATE_SHEET_ALL_SECTIONS = Object.freeze([...FATE_SHEET_PLAY_SECTIONS, ...FATE_SHEET_STORY_SECTIONS]);

const FATE_SHEET_DEFAULT_PREFS = Object.freeze({
  activeTab: "play",
  density: "standard",
  artwork: "portrait",
  theme: "foundry",
  accent: "#c49a57",
  sectionOrder: [...FATE_SHEET_ALL_SECTIONS],
  hiddenSections: [],
  wideSections: ["description", "biography", "notes", "custom"],
  favorites: { aspects: [], skills: [], stunts: [] }
});

function cloneSheetValue(value, fallback = null) {
  if (value == null) return fallback;
  try {
    if (foundry?.utils?.deepClone) return foundry.utils.deepClone(value);
    if (foundry?.utils?.duplicate) return foundry.utils.duplicate(value);
    return JSON.parse(JSON.stringify(value));
  } catch (_) {
    return fallback;
  }
}

function uniqueStrings(values = []) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map(value => String(value || "").trim()).filter(Boolean)));
}

function normaliseSectionOrder(order) {
  const known = new Set(FATE_SHEET_ALL_SECTIONS);
  const requested = uniqueStrings(order).filter(key => known.has(key));
  for (const key of FATE_SHEET_ALL_SECTIONS) if (!requested.includes(key)) requested.push(key);
  return requested;
}

function normaliseFavorites(favorites = {}) {
  return {
    aspects: uniqueStrings(favorites?.aspects),
    skills: uniqueStrings(favorites?.skills),
    stunts: uniqueStrings(favorites?.stunts)
  };
}

function normaliseSheetPrefs(raw = {}) {
  const value = raw && typeof raw === "object" ? raw : {};
  return {
    activeTab: ["play", "story", "development"].includes(value.activeTab) ? value.activeTab : FATE_SHEET_DEFAULT_PREFS.activeTab,
    density: ["standard", "compact", "comfortable"].includes(value.density) ? value.density : FATE_SHEET_DEFAULT_PREFS.density,
    artwork: ["portrait", "token"].includes(value.artwork) ? value.artwork : FATE_SHEET_DEFAULT_PREFS.artwork,
    theme: ["foundry", "paper", "midnight"].includes(value.theme) ? value.theme : FATE_SHEET_DEFAULT_PREFS.theme,
    accent: /^#[0-9a-fA-F]{6}$/.test(String(value.accent || "")) ? String(value.accent).toLowerCase() : FATE_SHEET_DEFAULT_PREFS.accent,
    sectionOrder: normaliseSectionOrder(value.sectionOrder),
    hiddenSections: uniqueStrings(value.hiddenSections).filter(key => FATE_SHEET_ALL_SECTIONS.includes(key)),
    wideSections: uniqueStrings(value.wideSections).filter(key => FATE_SHEET_ALL_SECTIONS.includes(key)),
    favorites: normaliseFavorites(value.favorites)
  };
}

function readPreferenceStore() {
  const raw = game.settings.get(FATE_SHEET_MODULE_ID, FATE_SHEET_PREFS_KEY);
  return raw && typeof raw === "object" && !Array.isArray(raw) ? cloneSheetValue(raw, {}) : {};
}

function actorPreferenceKey(actor) {
  return String(actor?.uuid || actor?.id || "");
}

function getSheetPrefs(actor) {
  const store = readPreferenceStore();
  return normaliseSheetPrefs(store[actorPreferenceKey(actor)] || {});
}

async function setSheetPrefs(actor, nextPrefs) {
  const key = actorPreferenceKey(actor);
  if (!key) return;
  const store = readPreferenceStore();
  store[key] = normaliseSheetPrefs(nextPrefs);
  await game.settings.set(FATE_SHEET_MODULE_ID, FATE_SHEET_PREFS_KEY, store);
}

function plainText(value) {
  const text = String(value ?? "");
  if (!text) return "";
  if (typeof document === "undefined") return text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const div = document.createElement("div");
  div.innerHTML = text;
  return String(div.textContent || "").replace(/\s+/g, " ").trim();
}

function firstSheetText(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.length) return value;
    if (value && typeof value === "object") {
      for (const key of ["value", "content", "text"]) {
        const nested = value[key];
        if (typeof nested === "string" && nested.length) return nested;
      }
    }
  }
  return "";
}

function firstSheetBoolean(...values) {
  for (const value of values) {
    if (typeof value === "boolean") return value;
    if (value === 1 || value === "1" || value === "true") return true;
    if (value === 0 || value === "0" || value === "false") return false;
  }
  return false;
}

async function enrichSheetHtml(actor, value) {
  const source = String(value ?? "");
  if (!source) return "";
  const editor = foundry?.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
  if (!editor?.enrichHTML) return source;
  try {
    return await editor.enrichHTML(source, {
      async: true,
      secrets: Boolean(actor?.isOwner),
      relativeTo: actor
    });
  } catch (_) {
    return source;
  }
}

function sheetDataObject(value) {
  if (!value || typeof value !== "object") return {};
  try {
    if (typeof value.toObject === "function") return value.toObject();
    if (typeof value.toJSON === "function") return value.toJSON();
  } catch (_) {}
  return value;
}

function objectRows(block) {
  return Object.entries(block && typeof block === "object" ? block : {}).map(([key, value]) => ({ key, ...sheetDataObject(value) }));
}

function nativeObjectRows(preparedBlock, sourceBlock) {
  const prepared = preparedBlock && typeof preparedBlock === "object" ? preparedBlock : {};
  const source = sourceBlock && typeof sourceBlock === "object" ? sourceBlock : {};
  const keys = Array.from(new Set([...Object.keys(source), ...Object.keys(prepared)]));
  return keys.map(key => ({
    key,
    ...sheetDataObject(source[key]),
    ...sheetDataObject(prepared[key])
  }));
}

function nativeDetailText(actor, key, ...legacyValues) {
  const prepared = actor?.system?.details?.[key];
  const source = actor?._source?.system?.details?.[key];
  const canonical = firstSheetText(prepared?.value, source?.value);
  if (canonical) return canonical;
  return firstSheetText(prepared, source, ...legacyValues);
}

function stuntDescription(stunt) {
  return firstSheetText(stunt?.description, stunt?.desc, stunt?.value);
}

function stuntNotes(stunt) {
  return firstSheetText(stunt?.notes, stunt?.note);
}

function trackBoxLabel(track, index) {
  if (String(track?.label || "").toLowerCase() === "escalating") return String(index + 1);
  if (String(track?.label || "").toLowerCase() !== "none" && track?.label) return String(track.label);
  const harm = Number(track?.harm_can_absorb || 0);
  return harm > 0 ? String(harm) : String(index + 1);
}

function tokenArtwork(actor) {
  return actor?.prototypeToken?.texture?.src || actor?.prototypeToken?.texture?.source || actor?.img || "icons/svg/mystery-man.svg";
}

function preserveSheetArtworkFormData(actor, formData) {
  const object = formData?.object;
  if (!object || typeof object !== "object") return formData;

  const currentPortrait = String(actor?.img || "").trim();
  const currentToken = String(actor?.prototypeToken?.texture?.src || actor?.prototypeToken?.texture?.source || "").trim();
  const isBlank = value => value == null || String(value).trim() === "";

  // ApplicationV2 form submissions should never erase artwork merely because
  // the sheet does not expose image paths as ordinary form controls.
  if (Object.prototype.hasOwnProperty.call(object, "img") && isBlank(object.img) && currentPortrait) {
    object.img = currentPortrait;
  }
  if (Object.prototype.hasOwnProperty.call(object, "prototypeToken.texture.src")
      && isBlank(object["prototypeToken.texture.src"]) && currentToken) {
    object["prototypeToken.texture.src"] = currentToken;
  }
  if (object.prototypeToken?.texture
      && Object.prototype.hasOwnProperty.call(object.prototypeToken.texture, "src")
      && isBlank(object.prototypeToken.texture.src) && currentToken) {
    object.prototypeToken.texture.src = currentToken;
  }
  return formData;
}

function sectionState(prefs) {
  const order = new Map(prefs.sectionOrder.map((key, index) => [key, index]));
  const hidden = new Set(prefs.hiddenSections);
  const wide = new Set(prefs.wideSections);
  const result = {};
  for (const key of FATE_SHEET_ALL_SECTIONS) {
    result[key] = {
      key,
      order: order.get(key) ?? 999,
      hidden: hidden.has(key),
      wide: wide.has(key)
    };
  }
  return result;
}

function normaliseCustomFields(raw) {
  const fields = Array.isArray(raw) ? raw : [];
  const allowed = new Set(["text", "number", "counter", "toggle"]);
  const seen = new Set();
  const output = [];
  for (const entry of fields) {
    if (!entry || typeof entry !== "object") continue;
    let id = String(entry.id || "").trim();
    if (!id || seen.has(id)) id = foundry?.utils?.randomID?.() || `field-${output.length + 1}`;
    seen.add(id);
    const type = allowed.has(entry.type) ? entry.type : "text";
    const row = {
      id,
      label: String(entry.label || "Поле").trim() || "Поле",
      type,
      value: type === "toggle" ? Boolean(entry.value) : entry.value ?? (type === "number" || type === "counter" ? 0 : ""),
      max: type === "counter" ? Number(entry.max ?? 1) : null,
      placeholder: String(entry.placeholder || ""),
      width: entry.width === "wide" ? "wide" : "normal",
      isWide: entry.width === "wide",
      isText: type === "text",
      isNumber: type === "number",
      isCounter: type === "counter",
      isToggle: type === "toggle"
    };
    output.push(row);
  }
  return output;
}

function readCustomFields(actor) {
  return normaliseCustomFields(actor?.getFlag?.(FATE_SHEET_MODULE_ID, FATE_SHEET_CUSTOM_FIELDS_KEY) ?? actor?.flags?.[FATE_SHEET_MODULE_ID]?.[FATE_SHEET_CUSTOM_FIELDS_KEY]);
}

function sheetLocalize(key) {
  return game?.i18n?.localize?.(key) ?? key;
}

function fateWorldSkills() {
  try {
    const uuid = game?.settings?.get?.(FATE_SHEET_SYSTEM_ID, "wid");
    const worldData = uuid ? globalThis.fromUuidSync?.(uuid) : null;
    return worldData?.system?.skills && typeof worldData.system.skills === "object" ? worldData.system.skills : {};
  } catch (_) {
    return {};
  }
}


function fateWorldData() {
  try {
    const uuid = game?.settings?.get?.(FATE_SHEET_SYSTEM_ID, "wid");
    return uuid ? globalThis.fromUuidSync?.(uuid) : null;
  } catch (_) {
    return null;
  }
}

function resolveFateGlobal(name) {
  const safe = String(name || "").trim();
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(safe)) return null;
  try {
    // Fate Core Official 4.7.13.6 loads its editor classes as classic scripts.
    // They live in the global lexical environment rather than as window properties.
    return globalThis.eval?.(`typeof ${safe} !== "undefined" ? ${safe} : null`) ?? null;
  } catch (_) {
    return null;
  }
}

function fateObjectKey(name) {
  const constants = resolveFateGlobal("fcoConstants");
  try {
    if (constants?.tob64) return constants.tob64(String(name || ""));
  } catch (_) {}
  const source = String(name || "").trim() || foundry?.utils?.randomID?.() || "entry";
  try {
    return btoa(unescape(encodeURIComponent(source))).replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  } catch (_) {
    return source.replace(/[^A-Za-z0-9_-]+/g, "-") || foundry?.utils?.randomID?.() || "entry";
  }
}

function fateEntryByKeyOrName(block, key, name = "") {
  if (key && block?.[key]) return block[key];
  const wanted = String(name || "");
  return Object.values(block || {}).find(entry => String(entry?.name || "") === wanted) || null;
}

function canUseNativeCharacterEditors(actor) {
  if (game?.user?.isGM) return true;
  return Boolean(actor?.isOwner && fateSetting("playersCanEditTheirCharacters", false));
}

const FATE_NATIVE_RU = Object.freeze({
  "Name": "Название", "Description": "Описание", "Notes": "Заметки", "Skill": "Навык", "Linked Skill": "Связанный навык",
  "Bonus": "Бонус", "Refresh Cost": "Цена восстановления", "Refresh": "Восстановление", "Boxes": "Ячейки", "Actions": "Действия",
  "Overcome": "Преодоление", "Create an Advantage": "Создание преимущества", "Create Advantage": "Создание преимущества", "Attack": "Атака", "Defend": "Защита",
  "Save": "Сохранить", "Cancel": "Отмена", "Add": "Добавить", "Delete": "Удалить", "Edit": "Изменить", "Search": "Поиск",
  "None": "Нет", "Special": "Особый", "All": "Все", "Combat": "Конфликт", "Other": "Прочее", "Category": "Категория",
  "Paid": "Платный", "Universal": "Универсальный", "Unique": "Уникальный", "Recovery Type": "Тип восстановления",
  "Fleeting": "Мимолётное", "Sticky": "Устойчивое", "Lasting": "Длительное", "Aspect": "Аспект", "When Marked": "При отметке",
  "How Recover": "Как восстановить", "How to Recover": "Как восстановить", "Box Labels": "Метки ячеек", "Harm": "Поглощение вреда",
  "Rollable": "Можно бросать", "False": "Нет", "Roll Full Boxes": "Бросок заполненных ячеек", "Roll Empty Boxes": "Бросок пустых ячеек",
  "Edit Linked Skills": "Связанные навыки", "Copy": "Копировать", "Export": "Экспорт", "Import": "Импорт", "Filter": "Фильтр",
  "Stunt Name": "Название трюка", "Stunt Database": "База трюков", "Export Stunts": "Экспортировать трюки", "Import Stunts": "Импортировать трюки",
  "Add Stunt": "Добавить трюк", "New Stunt": "Новый трюк", "Macro": "Макрос", "Skill Rank": "Ранг навыка",
  "New Aspect": "Новый аспект", "Aspect Name": "Название аспекта", "Aspect Description": "Описание аспекта", "Aspect Text": "Текст аспекта",
  "Current": "Сейчас", "Present": "Есть", "Number": "Количество", "Enabled": "Включён", "Rank": "Ранг",
  "Select All": "Выбрать все", "Deselect All": "Снять всё", "Add an Ad Hoc Track": "Добавить свой трек",
  "True if costs one refresh": "Отметьте, если стоит 1 восстановление", "Custom": "Своя", "Escalating": "По возрастанию",
  "Label Overrides": "Своя метка ячейки", "How much harm": "Сколько вреда поглощает", "Macro UUID": "UUID макроса"
});

function russianiseNativeText(value) {
  const original = String(value ?? "");
  const trimmed = original.trim();
  if (!trimmed) return original;
  if (FATE_NATIVE_RU[trimmed]) return original.replace(trimmed, FATE_NATIVE_RU[trimmed]);
  const translatedTerm = globalThis.FateToolkitI18n?.term?.(trimmed);
  if (translatedTerm && translatedTerm !== trimmed) return original.replace(trimmed, translatedTerm);
  const translatedSkill = globalThis.FateToolkitI18n?.skill?.(trimmed);
  if (translatedSkill && translatedSkill !== trimmed) return original.replace(trimmed, translatedSkill);
  return original;
}

function russianiseNativeEditorElement(element, kind = "") {
  if (!element) return;
  element.classList?.add?.("faw-native-editor", `faw-native-editor-${String(kind || "generic").toLowerCase()}`);
  const title = element.querySelector?.(".window-title");
  const titles = {
    skills: "Навыки персонажа", aspects: "Аспекты персонажа", tracks: "Стресс и последствия",
    stunt: "Трюк", stuntdb: "База трюков"
  };
  if (title && titles[kind]) title.textContent = titles[kind];

  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    if (node.parentElement?.closest?.("script,style,.editor-content,.ProseMirror")) continue;
    const next = russianiseNativeText(node.nodeValue);
    if (next !== node.nodeValue) node.nodeValue = next;
  }
  for (const field of element.querySelectorAll?.("input,textarea,select,button,[title]") || []) {
    if (field.placeholder) field.placeholder = russianiseNativeText(field.placeholder);
    if (field.title) field.title = russianiseNativeText(field.title);
    if (field.tagName === "SELECT") {
      for (const option of field.options || []) option.textContent = russianiseNativeText(option.textContent);
    }
  }
  // Native editors contain several English-only labels that are easiest to identify by their stable field names.
  const labelBefore = (selector, text) => {
    const field = element.querySelector?.(selector);
    const row = field?.closest?.("tr,.form-group");
    const label = row?.querySelector?.("td:first-child,label");
    if (label) label.textContent = text;
  };
  labelBefore('[name="linked_skill"]', "Связанный навык:");
  labelBefore('[name="description"]', "Описание:");
  labelBefore('[name="macro"]', "Макрос:");
  labelBefore('[name="refresh_cost"]', "Цена восстановления:");
  labelBefore('[name="boxes"]', "Ячейки:");
  labelBefore('#edit_entity_track_recovery_type', "Тип восстановления:");
  labelBefore('#edit_entity_track_aspect', "Аспект:");
  labelBefore('#edit_entity_track_boxes', "Ячейки:");
  labelBefore('#edit_entity_track_harm', "Поглощение вреда:");
  labelBefore('#entity_track_rollable', "Можно бросать:");
  const save = element.querySelector?.('button[type="submit"], button[name="save"], #save_entity_track');
  if (save && /save|сохран/i.test(save.textContent || "")) save.textContent = "Сохранить";

  // Semantic relabeling by stable field/action selectors. Unlike replacing rendered
  // English strings, this stays Russian even when Fate Core Official itself is
  // running in another language.
  const setButton = (selector, text, title = text) => {
    for (const button of element.querySelectorAll?.(selector) || []) {
      if (text && !button.querySelector?.("i")) button.textContent = text;
      if (title) button.title = title;
      button.setAttribute?.("aria-label", title || text || "");
    }
  };
  const setFieldRow = (selector, text) => labelBefore(selector, text.endsWith(":") ? text : `${text}:`);

  setFieldRow('input[name="name"]', "Название");
  setFieldRow('input[name="bonus"]', "Бонус");
  setFieldRow('input[name="macro"]', "Макрос");
  setFieldRow('input[name="refresh_cost"]', "Цена восстановления");
  setFieldRow('input[name="boxes"]', "Ячейки");
  setFieldRow('#edit_entity_track_name', "Название");
  setFieldRow('#edit_entity_track_category', "Категория");
  setFieldRow('#edit_entity_track_paid', "Платный");
  setFieldRow('#edit_entity_track_recovery_type', "Тип восстановления");
  setFieldRow('#edit_entity_track_aspect', "Аспект");
  setFieldRow('.edit_track_when_marked', "При отметке");
  setFieldRow('.edit_track_recovery_conditions', "Как восстановить");
  setFieldRow('#entity_track_label_select', "Метки ячеек");
  setFieldRow('#edit_entity_track_harm', "Поглощение вреда");
  setFieldRow('#entity_track_rollable', "Можно бросать");

  // Aspect editor.
  for (const field of element.querySelectorAll?.('.aspect_name') || []) {
    const row = field.closest?.("tr,.form-group");
    const label = row?.querySelector?.("td:first-child,label");
    if (label) label.textContent = "Название аспекта:";
  }
  for (const field of element.querySelectorAll?.('.aspect_description') || []) {
    const row = field.closest?.("tr,.form-group");
    const label = row?.querySelector?.("td:first-child,label");
    if (label) label.textContent = "Описание аспекта:";
  }
  for (const field of element.querySelectorAll?.('.aspect_value') || []) {
    const row = field.closest?.("tr,.form-group");
    const label = row?.querySelector?.("td:first-child,label");
    if (label) label.textContent = "Текст аспекта:";
  }
  for (const field of element.querySelectorAll?.('.aspect_notes') || []) {
    const row = field.closest?.("tr,.form-group");
    const label = row?.querySelector?.("td:first-child,label");
    if (label) label.textContent = "Заметки:";
  }
  setButton('button[name="new_aspect"]', "Добавить аспект");
  setButton('button[name="remove_aspect"]', "", "Удалить аспект");
  setButton('button[name="aspect_up"]', "", "Поднять аспект");
  setButton('button[name="aspect_down"]', "", "Опустить аспект");

  // Skills editor and its composition editor.
  setButton('button[name="save_player_skills"]', "", "Сохранить навыки");
  setButton('button[name="fatecoreofficial_sort_skills"]', "", "Изменить сортировку");
  setButton('button[name="edit_p_skills"]', "", "Изменить состав навыков");
  setButton('button[name="add_ah_button"]', "", "Добавить свой навык");
  setButton('button[name="select_all_skills_button"]', "Выбрать все");
  setButton('button[name="deselect_all_skills_button"]', "Снять выбор");
  setButton('button[name="add_remove_button"]', "Применить состав навыков");

  // Track manager / entity track editor.
  setButton('button[name="save"]', "Применить треки");
  setButton('button[name="ad_hoc"]', "Добавить свой трек");
  setButton('button[name="edit_entity_tracks"]', "", "Редактировать трек");
  setButton('#save_entity_track', "Сохранить трек");
  setButton('#edit_entity_linked_skills', "Связанные навыки");
  setButton('#copy_entity_track', "", "Копировать трек");
  setButton('#exportEntityTrack', "", "Экспортировать трек");
  setButton('#delete_linked_skill', "", "Удалить связь");
  setButton('#add_linked_skill', "", "Добавить связь");

  // Stunt editor / database.
  for (const checkbox of element.querySelectorAll?.('input[name="overcome"],input[name="caa"],input[name="attack"],input[name="defend"]') || []) {
    const labels = { overcome: "Преодоление", caa: "Создание преимущества", attack: "Атака", defend: "Защита" };
    checkbox.title = labels[checkbox.name] || "";
    checkbox.setAttribute?.("aria-label", labels[checkbox.name] || "");
  }
  setButton('button[name="add_stunt"]', "", "Добавить трюк персонажу");
  setButton('button[name="del_stunt"]', "", "Удалить трюк");
  setButton('button[name="edit_stunt"]', "", "Редактировать трюк");
  setButton('button[name="export_stunt"]', "", "Экспортировать трюк");
  setButton('#export_stunts', "Экспортировать трюки");
  setButton('#import_stunts', "Импортировать трюки");
  setButton('#add_db_stunt', "Добавить трюк");
}

async function openNativeFateEditor(EditorClass, args = [], { kind = "", sheet = null } = {}) {
  if (!EditorClass) return null;
  const editor = new EditorClass(...args);
  editor._fawRussian = true;
  if (sheet && typeof editor.setSheet === "function") editor.setSheet(sheet);
  const nativeRender = editor.render.bind(editor);
  editor.render = async (...renderArgs) => {
    const result = await nativeRender(...renderArgs);
    queueMicrotask(() => russianiseNativeEditorElement(editor.element, kind));
    setTimeout(() => russianiseNativeEditorElement(editor.element, kind), 0);
    setTimeout(() => russianiseNativeEditorElement(editor.element, kind), 80);
    return result;
  };
  await editor.render(true);
  russianiseNativeEditorElement(editor.element, kind);
  try { editor.bringToFront?.(); } catch (_) {}
  return editor;
}

function nativeEditorUnavailable(label) {
  globalThis.FateToolkitUX?.warn?.(`Не удалось открыть системный редактор: ${label}.`);
}

function skillKeyByName(block, name) {
  const wanted = String(name || "");
  return Object.keys(block || {}).find(key => String(block[key]?.name || "") === wanted) || null;
}

function makeCustomSkill(name) {
  return {
    name: String(name || "").trim(),
    category: null,
    description: "",
    overcome: "",
    caa: "",
    attack: "",
    defend: "",
    pc: false,
    rank: 0,
    adhoc: true,
    hidden: false
  };
}

function fateSetting(key, fallback = null) {
  try {
    const value = game?.settings?.get?.(FATE_SHEET_SYSTEM_ID, key);
    return value === undefined ? fallback : value;
  } catch (_) {
    return fallback;
  }
}

function skillEditorPolicy(actor) {
  let allowedTotal = Math.max(0, Math.trunc(Number(fateSetting("skillTotal", 0)) || 0));
  const override = actor?.system?.override || {};
  if (override.active && Number.isFinite(Number(override.skillPoints))) {
    allowedTotal = Math.max(0, Math.trunc(Number(override.skillPoints)));
  }
  const campaign = globalThis.FateToolkitWill?.enabled?.() ? globalThis.FateToolkitWill.details(actor) : null;
  // A freshly created PC uses 21 points / +4 maximum. An explicit FCO actor
  // override still permits milestone advancement and bespoke PCs.
  const startingPc = Boolean(campaign?.configured && campaign.isPc);
  if (startingPc && !override.active) allowedTotal = 21;
  const ladder = fateSetting("ladder", {}) || {};
  const nonNegativeRanks = Object.keys(ladder).map(Number).filter(value => Number.isFinite(value) && value >= 0);
  const maxRank = nonNegativeRanks.length ? Math.max(...nonNegativeRanks) : 10;
  return {
    enforceColumn: startingPc ? true : Boolean(fateSetting("enforceColumn", true)),
    enforceTotal: startingPc ? true : Boolean(fateSetting("enforceSkillTotal", true)),
    allowedTotal,
    startingPc: startingPc && !override.active,
    maxRank: startingPc && !override.active ? 4 : Math.max(1, Math.trunc(maxRank))
  };
}

function actorItemById(actor, id) {
  if (!actor || !id) return null;
  try {
    const direct = actor.items?.get?.(id);
    if (direct) return direct;
  } catch (_) {}
  const items = actor.items?.contents ?? actor.items ?? [];
  try { return Array.from(items).find(item => item?.id === id) || null; } catch (_) { return null; }
}

function countedSkillTotal(actor, skills) {
  let total = 0;
  for (const skill of Object.values(skills || {})) {
    const rank = Math.max(0, Math.trunc(Number(skill?.rank) || 0));
    if (!skill?.extra_id) {
      total += rank;
      continue;
    }
    const extra = actorItemById(actor, skill.extra_id);
    if (extra?.system?.countSkills) total += rank;
  }
  return total;
}

function skillColumnProblems(skills) {
  const counts = new Map();
  let maxRank = 0;
  for (const skill of Object.values(skills || {})) {
    const rank = Math.max(0, Math.trunc(Number(skill?.rank) || 0));
    maxRank = Math.max(maxRank, rank);
    counts.set(rank, (counts.get(rank) || 0) + 1);
  }
  const problems = [];
  for (let rank = maxRank; rank >= 2; rank -= 1) {
    const here = counts.get(rank) || 0;
    const below = counts.get(rank - 1) || 0;
    if (here > below) problems.push({ rank, here, below });
  }
  return problems;
}

function validateSkillConfiguration(actor, skills) {
  const policy = skillEditorPolicy(actor);
  const issues = [];
  for (const skill of Object.values(skills || {})) {
    const rank = Math.trunc(Number(skill?.rank) || 0);
    if (rank < 0 || rank > policy.maxRank) {
      issues.push(sheetLocalize("FAW.Sheet.SkillRankOutOfRange").replace("{max}", String(policy.maxRank)));
      break;
    }
  }
  const total = countedSkillTotal(actor, skills);
  if (policy.enforceTotal && total > policy.allowedTotal) {
    issues.push(sheetLocalize("FAW.Sheet.SkillTotalExceeded")
      .replace("{current}", String(total))
      .replace("{allowed}", String(policy.allowedTotal)));
  }
  if (policy.startingPc && total === 21) {
    const counts = new Map();
    for (const skill of Object.values(skills || {})) {
      if (skill?.extra_id) continue;
      const rank = Math.max(0, Math.trunc(Number(skill?.rank) || 0));
      counts.set(rank, (counts.get(rank)||0)+1);
    }
    if (counts.get(4)!==1 || counts.get(3)!==2 || counts.get(2)!==3 || counts.get(1)!==5) {
      issues.push(sheetLocalize('FAW.Campaign.StartingPyramid'));
    }
  }
  const columnProblems = policy.enforceColumn ? skillColumnProblems(skills) : [];
  if (columnProblems.length) {
    const first = columnProblems[0];
    issues.push(sheetLocalize("FAW.Sheet.SkillColumnViolated")
      .replace("{rank}", String(first.rank))
      .replace("{count}", String(first.here))
      .replace("{below}", String(first.below)));
  }
  return { valid: issues.length === 0, issues, total, policy, columnProblems };
}

async function updateActorSkills(actor, nextSkills) {
  const skills = cloneSheetValue(nextSkills, {});
  let tracks = cloneSheetValue(actor?.system?.tracks, {});
  try {
    if (typeof actor?.setupTracks === "function") tracks = actor.setupTracks(cloneSheetValue(skills, {}), tracks);
  } catch (_) {}
  await actor.update({ "system.skills": skills, "system.tracks": tracks });
}

async function promptSkillEditor(actor) {
  if (!actor?.isOwner) return false;
  const current = cloneSheetValue(actor.system?.skills, {}) || {};
  const world = cloneSheetValue(fateWorldSkills(), {}) || {};
  const policy = skillEditorPolicy(actor);
  const byName = new Map();
  for (const [key, skill] of Object.entries(world)) {
    const name = String(skill?.name || "").trim();
    if (!name) continue;
    byName.set(name, { key, source: skill, currentKey: skillKeyByName(current, name), world: true });
  }
  for (const [key, skill] of Object.entries(current)) {
    const name = String(skill?.name || "").trim();
    if (!name || byName.has(name)) continue;
    byName.set(name, { key, source: skill, currentKey: key, world: false });
  }
  const rows = [...byName.entries()].sort((a,b) => a[0].localeCompare(b[0], "ru"));
  const esc = escapeHtml;
  const rowHtml = rows.map(([name, info]) => {
    const active = Boolean(info.currentKey);
    const skill = active ? current[info.currentKey] : info.source;
    const rank = Math.max(0, Math.trunc(Number(skill?.rank || 0)));
    const translated = globalThis.FateToolkitI18n?.skill?.(name) || name;
    const extraOwned = Boolean(skill?.extra_id);
    return `<label class="fts-skill-editor-row${extraOwned ? " is-system-owned" : ""}" data-skill-editor-row data-search="${esc(`${name} ${translated}`.toLocaleLowerCase())}">
      <input type="checkbox" name="enabled__${esc(info.key)}" data-skill-enabled data-skill-name="${esc(name)}" ${active ? "checked" : ""} ${extraOwned ? "disabled" : ""}>
      <span class="fts-skill-editor-name">${esc(translated)}${extraOwned ? ` <span class="fts-skill-provenance" title="${esc(sheetLocalize("FAW.Sheet.SkillFromExtra"))}" aria-label="${esc(sheetLocalize("FAW.Sheet.SkillFromExtra"))}"><i class="fa-solid fa-link" aria-hidden="true"></i></span>` : ""}</span>
      <input type="number" min="0" max="${policy.maxRank}" step="1" name="rank__${esc(info.key)}" value="${rank}" aria-label="${esc(sheetLocalize("FAW.Sheet.SkillRank"))}: ${esc(translated)}" ${extraOwned ? "disabled" : ""}>
    </label>`;
  }).join("");
  const initialValidation = validateSkillConfiguration(actor, current);
  const restrictionLines = [
    policy.enforceColumn ? sheetLocalize("FAW.Sheet.SkillColumnRuleOn") : sheetLocalize("FAW.Sheet.SkillColumnRuleOff"),
    policy.enforceTotal
      ? sheetLocalize("FAW.Sheet.SkillTotalRuleOn").replace("{allowed}", String(policy.allowedTotal))
      : sheetLocalize("FAW.Sheet.SkillTotalRuleOff"),
    sheetLocalize("FAW.Sheet.SkillRankRange").replace("{max}", String(policy.maxRank))
  ];
  const content = `<div class="faw-skill-editor standard-form">
    <p>${esc(sheetLocalize("FAW.Sheet.EditSkillsHint"))}</p>
    <div class="fts-skill-editor-rules">${restrictionLines.map(line => `<span>${esc(line)}</span>`).join("")}</div>
    <div class="fts-skill-editor-status ${initialValidation.valid ? "is-valid" : "is-invalid"}" data-skill-editor-status aria-live="polite"></div>
    <input type="search" data-skill-editor-search placeholder="${esc(sheetLocalize("FAW.Sheet.SkillEditorSearch"))}" aria-label="${esc(sheetLocalize("FAW.Sheet.SkillEditorSearch"))}">
    <div class="fts-skill-editor-list">${rowHtml || `<p>${esc(sheetLocalize("FAW.Sheet.NoWorldSkills"))}</p>`}</div>
    <div class="fts-skill-editor-custom"><label><span>${esc(sheetLocalize("FAW.Sheet.AddCustomSkill"))}</span><input type="text" name="customSkill" placeholder="${esc(sheetLocalize("FAW.Sheet.CustomSkillName"))}"></label></div>
  </div>`;

  function proposalFromForm(form) {
    const enabled = new Set(Array.from(form?.querySelectorAll?.("[data-skill-enabled]:checked") || []).map(node => String(node.dataset.skillName || "")));
    const ranks = new Map();
    for (const input of Array.from(form?.querySelectorAll?.('input[name^="rank__"]') || [])) {
      const key = String(input.name || "").slice("rank__".length);
      const info = rows.find(([, row]) => row.key === key);
      if (info) ranks.set(info[0], Math.max(0, Math.min(policy.maxRank, Math.trunc(Number(input.value || 0)))));
    }
    const next = {};
    for (const name of enabled) {
      const info = byName.get(name);
      if (!info) continue;
      const source = info.currentKey ? current[info.currentKey] : info.source;
      const key = info.currentKey || info.key || foundry.utils.randomID();
      next[key] = { ...cloneSheetValue(source, {}), rank: ranks.get(name) || 0 };
    }
    // Skills supplied by Extras remain system-owned and must never be removed or edited here.
    for (const [key, skill] of Object.entries(current)) {
      if (skill?.extra_id && !skillKeyByName(next, skill.name)) next[key] = cloneSheetValue(skill, {});
    }
    const customSkill = String(form?.elements?.customSkill?.value || "").trim();
    if (customSkill && !skillKeyByName(next, customSkill)) next[foundry.utils.randomID()] = makeCustomSkill(customSkill);
    return { next, customSkill };
  }

  function updateValidationUi(root) {
    const form = root?.querySelector?.("form") || root?.closest?.("form") || root;
    if (!form) return;
    for (const row of Array.from(root.querySelectorAll?.("[data-skill-editor-row]") || [])) {
      const toggle = row.querySelector?.("[data-skill-enabled]");
      const rank = row.querySelector?.('input[name^="rank__"]');
      if (rank && !row.classList.contains("is-system-owned")) rank.disabled = !toggle?.checked;
    }
    const { next } = proposalFromForm(form);
    const validation = validateSkillConfiguration(actor, next);
    const status = root.querySelector?.("[data-skill-editor-status]");
    if (status) {
      status.classList.toggle("is-valid", validation.valid);
      status.classList.toggle("is-invalid", !validation.valid);
      const totalText = validation.policy.enforceTotal
        ? sheetLocalize("FAW.Sheet.SkillTotalStatus").replace("{current}", String(validation.total)).replace("{allowed}", String(validation.policy.allowedTotal))
        : sheetLocalize("FAW.Sheet.SkillTotalStatusNoLimit").replace("{current}", String(validation.total));
      status.innerHTML = validation.valid
        ? `<strong>${esc(sheetLocalize("FAW.Sheet.SkillConfigValid"))}</strong><span>${esc(totalText)}</span>`
        : `<strong>${esc(sheetLocalize("FAW.Sheet.SkillConfigInvalid"))}</strong><span>${esc(totalText)}</span><ul>${validation.issues.map(issue => `<li>${esc(issue)}</li>`).join("")}</ul>`;
    }
    const save = root.querySelector?.('button[data-action="save"], button[name="save"], button[value="save"]');
    if (save) save.disabled = !validation.valid;
  }

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: `${sheetLocalize("FAW.Sheet.EditSkillsTitle")}: ${actor.name}`, resizable: true },
    content,
    buttons: [
      { action: "cancel", label: sheetLocalize("FAW.Sheet.Cancel"), callback: () => null },
      { action: "save", label: sheetLocalize("FAW.Sheet.SaveSkills"), default: true, callback: (_event, button) => {
        const form = button.form;
        const proposal = proposalFromForm(form);
        const validation = validateSkillConfiguration(actor, proposal.next);
        if (!validation.valid) {
          globalThis.FateToolkitUX?.error?.(validation.issues.join(" "));
          return null;
        }
        return proposal;
      }}
    ],
    render: (_event, dialog) => {
      const root = dialog?.element;
      const search = root?.querySelector?.("[data-skill-editor-search]");
      search?.addEventListener("input", () => {
        const q = String(search.value || "").trim().toLocaleLowerCase();
        root.querySelectorAll("[data-skill-editor-row]").forEach(row => { row.hidden = Boolean(q && !String(row.dataset.search || "").includes(q)); });
      });
      root?.addEventListener?.("input", event => {
        if (event.target?.matches?.('[data-skill-enabled], input[name^="rank__"], input[name="customSkill"]')) updateValidationUi(root);
      });
      root?.addEventListener?.("change", event => {
        if (event.target?.matches?.('[data-skill-enabled], input[name^="rank__"], input[name="customSkill"]')) updateValidationUi(root);
      });
      updateValidationUi(root);
    }
  });
  if (!result?.next) return false;
  await updateActorSkills(actor, result.next);
  globalThis.FateToolkitUX?.info?.(sheetLocalize("FAW.Sheet.SkillsSaved"));
  return true;
}

function buildFavorites(model, prefs) {
  const fav = prefs.favorites;
  const rows = [];
  for (const aspect of model.aspects) if (fav.aspects.includes(aspect.key)) rows.push({ kind: "aspects", key: aspect.key, label: aspect.value || aspect.name, meta: aspect.name });
  for (const skill of model.skills) if (fav.skills.includes(skill.key)) rows.push({ kind: "skills", key: skill.key, label: skill.name, meta: `${skill.rank >= 0 ? "+" : ""}${skill.rank}` });
  for (const stunt of model.stunts) if (fav.stunts.includes(stunt.key)) rows.push({ kind: "stunts", key: stunt.key, label: stunt.name, meta: stunt.linkedSkill || "" });
  return rows;
}

function buildSheetModel(actor, prefs, { isGM = false } = {}) {
  const system = actor?.system || {};
  const sourceSystem = actor?._source?.system || {};

  const aspects = nativeObjectRows(system.aspects, sourceSystem.aspects).map(row => {
    const description = firstSheetText(row.description);
    const notes = firstSheetText(row.notes);
    return {
      ...row,
      rawName: String(row.name || "Аспект"),
      name: globalThis.FateToolkitI18n?.term?.(String(row.name || "Аспект")) || String(row.name || "Аспект"),
      extraOwned: Boolean(row.extra_id),
      value: String(row.value || ""),
      description,
      descriptionText: plainText(description),
      notes,
      notesText: plainText(notes),
      hasDetails: Boolean(description || notes) || Boolean(actor?.isOwner),
      search: `${row.name || ""} ${row.value || ""} ${plainText(description)} ${plainText(notes)}`.toLocaleLowerCase()
    };
  });

  const skills = nativeObjectRows(system.skills, sourceSystem.skills)
    .filter(row => !row.hidden)
    .map(row => {
      const rawName = String(row.name || "Навык");
      const name = globalThis.FateToolkitI18n?.skill?.(rawName) || rawName;
      return {
        ...row,
        rawName,
        name,
        rank: Number(row.rank || 0),
        search: `${rawName} ${name} ${row.rank ?? ""}`.toLocaleLowerCase()
      };
    })
    .sort((a, b) => (b.rank - a.rank) || a.name.localeCompare(b.name));

  const stunts = nativeObjectRows(system.stunts, sourceSystem.stunts).map(row => {
    const description = stuntDescription(row);
    const notes = stuntNotes(row);
    return {
      ...row,
      rawName: String(row.name || "Трюк"),
      name: String(row.name || "Трюк"),
      extraOwned: Boolean(row.extra_id),
      macro: row.macro || null,
      rollable: !["", "none", "нет"].includes(String(row.linked_skill ?? row.linkedSkill ?? "").trim().toLocaleLowerCase()),
      linkedSkill: globalThis.FateToolkitI18n?.skill?.(String(row.linked_skill ?? row.linkedSkill ?? "")) || globalThis.FateToolkitI18n?.term?.(String(row.linked_skill ?? row.linkedSkill ?? "")) || String(row.linked_skill ?? row.linkedSkill ?? ""),
      description,
      descriptionText: plainText(description),
      notes,
      notesText: plainText(notes),
      refreshCost: Number(row.refresh_cost ?? 0),
      bonus: Number(row.bonus ?? 0),
      boxes: (Array.isArray(row.box_values) ? row.box_values : []).map((checked, index) => ({ index, checked: Boolean(checked), label: String(index + 1) })),
      actions: [
        row.overcome ? { type: "overcome", icon: "fa-person-running", label: sheetLocalize("FAW.Sheet.Overcome") } : null,
        (row.caa || row.create) ? { type: "create", icon: "fa-wand-magic-sparkles", label: sheetLocalize("FAW.Sheet.CreateAdvantage") } : null,
        row.attack ? { type: "attack", icon: "fa-burst", label: sheetLocalize("FAW.Sheet.Attack") } : null,
        row.defend ? { type: "defend", icon: "fa-shield-halved", label: sheetLocalize("FAW.Sheet.Defend") } : null
      ].filter(Boolean),
      search: `${row.name || ""} ${row.linked_skill || ""} ${plainText(description)} ${plainText(notes)}`.toLocaleLowerCase()
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const tracks = nativeObjectRows(system.tracks, sourceSystem.tracks)
    .filter(row => row.enabled !== false)
    .map(row => {
      const description = firstSheetText(row.description);
      const notes = firstSheetText(row.notes);
      const whenMarked = firstSheetText(row.when_marked);
      const recoveryConditions = firstSheetText(row.recovery_conditions);
      return {
        ...row,
        rawName: String(row.name || "Трек"),
        name: globalThis.FateToolkitI18n?.term?.(String(row.name || "Трек")) || String(row.name || "Трек"),
        extraOwned: Boolean(row.extra_id),
        rollable: ["full", "empty"].includes(String(row.rollable || "false")),
        category: globalThis.FateToolkitI18n?.term?.(String(row.category || "")) || String(row.category || ""),
        boxes: (Array.isArray(row.box_values) ? row.box_values : []).map((checked, index) => ({ index, checked: Boolean(checked), label: trackBoxLabel(row, index) })),
        consequence: Boolean(row.aspect?.when_marked || row.aspect?.as_name),
        aspectName: String(row.aspect?.name || ""),
        description,
        descriptionText: plainText(description),
        notes,
        notesText: plainText(notes),
        whenMarked,
        whenMarkedText: plainText(whenMarked),
        recoveryConditions,
        recoveryConditionsText: plainText(recoveryConditions),
        recoveryType: globalThis.FateToolkitI18n?.term?.(String(row.recovery_type || "")) || String(row.recovery_type || ""),
        hasDetails: Boolean(description || notes || whenMarked || recoveryConditions || row.recovery_type) || Boolean(actor?.isOwner)
      };
    });

  const extras = Array.from(actor?.items || []).map(item => {
    const rawDescription = firstSheetText(globalThis.FateToolkitExtras?.definition?.(item)?.description, item.system?.description?.value, item.system?.description, item.system?.notes);
    return {
      id: item.id,
      uuid: item.uuid,
      name: item.name,
      img: item.img,
      active: Boolean(item.system?.active),
      description: rawDescription,
      descriptionText: plainText(rawDescription),
      hasBuilder: Boolean(globalThis.FateToolkitExtras?.definition?.(item)),
      extraMode: globalThis.FateToolkitExtras?.definition?.(item)?.mode || '',
      builderUsable: Boolean(globalThis.FateToolkitExtras?.definition?.(item) && globalThis.FateToolkitExtras.definition(item).mode !== 'passive' && item.system?.active),
      runtimeUses: Number(globalThis.FateToolkitExtras?.runtime?.(item)?.uses || 0)
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const preparedNotes = system.details?.notes;
  const sourceNotes = sourceSystem.details?.notes;
  const notesPrivate = firstSheetBoolean(
    preparedNotes?.GM, sourceNotes?.GM, preparedNotes?.gm, sourceNotes?.gm,
    system.notes?.GM, sourceSystem.notes?.GM, system.notes?.gm, sourceSystem.notes?.gm
  );
  const rawNotesValue = nativeDetailText(actor, "notes", system.notes, sourceSystem.notes, system.details?.note, sourceSystem.details?.note);
  const notesValue = notesPrivate && !isGM ? "" : rawNotesValue;

  for (const row of aspects) row.favorite = prefs.favorites.aspects.includes(row.key);
  for (const row of skills) row.favorite = prefs.favorites.skills.includes(row.key);
  for (const row of stunts) row.favorite = prefs.favorites.stunts.includes(row.key);

  const model = {
    aspects,
    skills,
    stunts,
    tracks,
    stressTracks: tracks.filter(row => !row.consequence),
    consequenceTracks: tracks.filter(row => row.consequence),
    extras,
    extraStatuses: globalThis.FateToolkitExtras?.statuses?.(actor) || [],
    customFields: readCustomFields(actor),
    description: nativeDetailText(actor, "description", system.description, sourceSystem.description),
    biography: nativeDetailText(actor, "biography", system.biography, sourceSystem.biography),
    notes: notesValue,
    notesPrivate,
    notesVisible: !notesPrivate || isGM,
    campaignWill: globalThis.FateToolkitWill?.enabled?.() ? globalThis.FateToolkitWill.details(actor) : null,
    fatePoints: {
      current: Number(system.details?.fatePoints?.current ?? sourceSystem.details?.fatePoints?.current ?? 0),
      refresh: Number(system.details?.fatePoints?.refresh ?? sourceSystem.details?.fatePoints?.refresh ?? 0),
      boosts: Number(system.details?.fatePoints?.boosts ?? sourceSystem.details?.fatePoints?.boosts ?? 0)
    },
    systemRules: (() => {
      const freeStunts = Math.max(0, Number(fateSetting("freeStunts", 0)) || 0);
      const paidTracks = Object.values(system.tracks || {}).filter(track => track?.paid).length;
      const stuntCost = Object.values(system.stunts || {}).reduce((sum, stunt) => sum + (Number(stunt?.refresh_cost) || 0), 0);
      const paidStunts = Math.max(0, stuntCost - freeStunts);
      const paidExtras = Array.from(actor?.items || []).reduce((sum, item) => sum + (item?.system?.active ? Math.max(0, Number(item?.system?.refresh) || 0) : 0), 0);
      const policy = skillEditorPolicy(actor);
      return {
        gameRefresh: Math.max(0, Number(fateSetting("refreshTotal", 0)) || 0),
        skillPointsSpent: countedSkillTotal(actor, system.skills || {}),
        skillPointsAllowed: policy.allowedTotal,
        refreshSpent: paidTracks + paidStunts + paidExtras,
        overrideActive: Boolean(system.override?.active),
        overrideRefresh: Number(system.override?.refresh || 0),
        overrideSkillPoints: Number(system.override?.skillPoints || 0)
      };
    })(),
    pronouns: String(system.details?.pronouns?.value ?? sourceSystem.details?.pronouns?.value ?? "")
  };
  model.favorites = buildFavorites(model, prefs);
  return model;
}

function targetRefFromCanvas() {
  const targets = Array.from(game.user?.targets || []);
  const token = targets[0];
  return token?.id ? `token:${token.id}` : "";
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}


async function promptCustomFieldDefinition(existing = {}) {
  const DialogV2 = foundry.applications.api.DialogV2;
  const type = ["text", "number", "counter", "toggle"].includes(existing.type) ? existing.type : "text";
  const width = existing.width === "wide" ? "wide" : "normal";
  const result = await DialogV2.input({
    window: { title: game.i18n.localize(existing.id ? "FAW.Sheet.EditField" : "FAW.Sheet.AddField") },
    content: `
      <div class="standard-form faw-toolkit-dialog faw-custom-field-dialog">
        <div class="form-group"><label>${escapeHtml(game.i18n.localize("FAW.Sheet.FieldLabel"))}</label><input name="label" type="text" aria-label="${escapeHtml(game.i18n.localize("FAW.Sheet.FieldLabel"))}" value="${escapeHtml(existing.label || "")}" required autofocus></div>
        <div class="form-group"><label>${escapeHtml(game.i18n.localize("FAW.Sheet.FieldType"))}</label><select name="type" aria-label="${escapeHtml(game.i18n.localize("FAW.Sheet.FieldType"))}">
          <option value="text" ${type === "text" ? "selected" : ""}>${escapeHtml(game.i18n.localize("FAW.Sheet.FieldText"))}</option>
          <option value="number" ${type === "number" ? "selected" : ""}>${escapeHtml(game.i18n.localize("FAW.Sheet.FieldNumber"))}</option>
          <option value="counter" ${type === "counter" ? "selected" : ""}>${escapeHtml(game.i18n.localize("FAW.Sheet.FieldCounter"))}</option>
          <option value="toggle" ${type === "toggle" ? "selected" : ""}>${escapeHtml(game.i18n.localize("FAW.Sheet.FieldToggle"))}</option>
        </select></div>
        <div class="form-group"><label>${escapeHtml(game.i18n.localize("FAW.Sheet.FieldPlaceholder"))}</label><input name="placeholder" type="text" aria-label="${escapeHtml(game.i18n.localize("FAW.Sheet.FieldPlaceholder"))}" value="${escapeHtml(existing.placeholder || "")}"></div>
        <div class="form-group"><label>${escapeHtml(game.i18n.localize("FAW.Sheet.FieldMaximum"))}</label><input name="max" type="number" aria-label="${escapeHtml(game.i18n.localize("FAW.Sheet.FieldMaximum"))}" min="1" value="${Number(existing.max ?? 1)}"></div>
        <div class="form-group"><label>${escapeHtml(game.i18n.localize("FAW.Sheet.FieldWidth"))}</label><select name="width" aria-label="${escapeHtml(game.i18n.localize("FAW.Sheet.FieldWidth"))}">
          <option value="normal" ${width === "normal" ? "selected" : ""}>${escapeHtml(game.i18n.localize("FAW.Sheet.FieldNormalWidth"))}</option>
          <option value="wide" ${width === "wide" ? "selected" : ""}>${escapeHtml(game.i18n.localize("FAW.Sheet.FieldWide"))}</option>
        </select></div>
      </div>`,
    ok: { label: game.i18n.localize(existing.id ? "FAW.Sheet.Save" : "FAW.Sheet.Add") }
  });
  if (!result?.label) return null;
  return {
    label: String(result.label).trim(),
    type: ["text", "number", "counter", "toggle"].includes(String(result.type)) ? String(result.type) : "text",
    placeholder: String(result.placeholder || ""),
    max: Math.max(1, Number(result.max || 1)),
    width: result.width === "wide" ? "wide" : "normal"
  };
}

let FateToolkitCharacterSheet = null;
const HandlebarsApplicationMixin = foundry?.applications?.api?.HandlebarsApplicationMixin;
const ActorSheetV2 = foundry?.applications?.sheets?.ActorSheetV2;

if (HandlebarsApplicationMixin && ActorSheetV2) {
  FateToolkitCharacterSheet = class FateToolkitCharacterSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
    static DEFAULT_OPTIONS = {
      classes: ["fate-toolkit-character-sheet", "fate"],
      tag: "form",
      position: { width: 980, height: 780 },
      window: { resizable: true },
      form: { submitOnChange: true, closeOnSubmit: false },
      actions: {
        actionAttack: this._actionAttack,
        actionOvercome: this._actionOvercome,
        actionCreate: this._actionCreate,
        actionDefend: this._actionDefend,
        openActionWidget: this._openActionWidget,
        changeTab: this._changeTab,
        openCampaignTimeline: this._openCampaignTimeline,
        openMilestoneDevelopment: this._openMilestoneDevelopment,
        toggleCustomize: this._toggleCustomize,
        toggleFavorite: this._toggleFavorite,
        moveSectionUp: this._moveSectionUp,
        moveSectionDown: this._moveSectionDown,
        toggleSectionHidden: this._toggleSectionHidden,
        toggleSectionWide: this._toggleSectionWide,
        setDensity: this._setDensity,
        setTheme: this._setTheme,
        resetLayout: this._resetLayout,
        fatePointUp: this._fatePointUp,
        fatePointDown: this._fatePointDown,
        configureWillPc: this._configureWillPc,
        configureWillNpc: this._configureWillNpc,
        beginCampaignScene: this._beginCampaignScene,
        enterCampaignScene: this._enterCampaignScene,
        recoverWillVice: this._recoverWillVice,
        resolveWillComplication: this._resolveWillComplication,
        applyCampaignFramework: this._applyCampaignFramework,
        setupCampaignWorldSkills: this._setupCampaignWorldSkills,
        spendSpecialWill: this._spendSpecialWill,
        gainCompelWill: this._gainCompelWill,
        toggleGmNotes: this._toggleGmNotes,
        toggleTrackBox: this._toggleTrackBox,
        openExtra: this._openExtra,
        editExtraMechanics: this._editExtraMechanics,
        useExtraMechanics: this._useExtraMechanics,
        exportExtraMechanics: this._exportExtraMechanics,
        exportAllExtraMechanics: this._exportAllExtraMechanics,
        importExtraMechanics: this._importExtraMechanics,
        toggleExtra: this._toggleExtra,
        addCustomField: this._addCustomField,
        editCustomField: this._editCustomField,
        deleteCustomField: this._deleteCustomField,
        moveCustomFieldUp: this._moveCustomFieldUp,
        moveCustomFieldDown: this._moveCustomFieldDown,
        scrollFavorite: this._scrollFavorite,
        editSkills: this._editSkills,
        manageAspects: this._manageAspects,
        manageTracks: this._manageTracks,
        addStunt: this._addStunt,
        editStunt: this._editStunt,
        deleteStunt: this._deleteStunt,
        rollStunt: this._rollStunt,
        runStuntMacro: this._runStuntMacro,
        openStuntMacro: this._openStuntMacro,
        toggleStuntBox: this._toggleStuntBox,
        openStuntDatabase: this._openStuntDatabase,
        addStuntToDatabase: this._addStuntToDatabase,
        uploadAllStunts: this._uploadAllStunts,
        rollSkill: this._rollSkill,
        rollTrack: this._rollTrack,
        addExtra: this._addExtra,
        deleteExtra: this._deleteExtra,
        syncTokenName: this._syncTokenName,
        saveFramework: this._saveFramework,
        applyFramework: this._applyFramework
      }
    };

    static PARTS = {
      main: { template: `modules/${FATE_SHEET_MODULE_ID}/templates/character-sheet.hbs`, scrollable: [".fts-body"] }
    };

    constructor(options = {}) {
      super(options);
      this._customizing = false;
      this._resizeObserver = null;
      this._campaignSettingsOpen = null;
    }

    get title() {
      return `${this.document?.name || "Fate"} — ${game.i18n.localize("FAW.Sheet.Title")}`;
    }

    _processFormData(event, form, formData) {
      preserveSheetArtworkFormData(this.document, formData);
      return super._processFormData(event, form, formData);
    }

    async _prepareContext(options) {
      const context = await super._prepareContext(options);
      const actor = this.document;
      const prefs = getSheetPrefs(actor);
      const model = buildSheetModel(actor, prefs, { isGM: game.user.isGM });
      model.descriptionEnriched = await enrichSheetHtml(actor, model.description);
      model.biographyEnriched = await enrichSheetHtml(actor, model.biography);
      model.notesEnriched = model.notesVisible ? await enrichSheetHtml(actor, model.notes) : "";
      await Promise.all(model.aspects.map(async row => {
        row.descriptionEnriched = await enrichSheetHtml(actor, row.description);
        row.notesEnriched = await enrichSheetHtml(actor, row.notes);
      }));
      await Promise.all(model.stunts.map(async row => {
        row.descriptionEnriched = await enrichSheetHtml(actor, row.description);
        row.notesEnriched = await enrichSheetHtml(actor, row.notes);
      }));
      await Promise.all(model.tracks.map(async row => {
        row.descriptionEnriched = await enrichSheetHtml(actor, row.description);
        row.notesEnriched = await enrichSheetHtml(actor, row.notes);
        row.whenMarkedEnriched = await enrichSheetHtml(actor, row.whenMarked);
        row.recoveryConditionsEnriched = await enrichSheetHtml(actor, row.recoveryConditions);
      }));
      await Promise.all(model.extras.map(async row => {
        row.descriptionEnriched = await enrichSheetHtml(actor, row.description);
      }));
      const sections = sectionState(prefs);
      const activeTab = prefs.activeTab;
      const names = {
        aspects: game.i18n.localize("FAW.Sheet.Aspects"), skills: game.i18n.localize("FAW.Sheet.Skills"), stunts: game.i18n.localize("FAW.Sheet.Stunts"),
        tracks: game.i18n.localize("FAW.Sheet.Tracks"), extras: game.i18n.localize("FAW.Sheet.Extras"), description: game.i18n.localize("FAW.Sheet.Description"),
        biography: game.i18n.localize("FAW.Sheet.Biography"), notes: game.i18n.localize("FAW.Sheet.Notes"), custom: game.i18n.localize("FAW.Sheet.Custom")
      };
      const customizerSections = prefs.sectionOrder.map(key => ({
        key, name: names[key] || key, hidden: sections[key]?.hidden, wide: sections[key]?.wide,
        canToggleWide: !["description", "biography", "notes"].includes(key),
        tab: FATE_SHEET_PLAY_SECTIONS.includes(key) ? "play" : "story"
      }));
      const currentPlayOrder = prefs.sectionOrder.filter(key => FATE_SHEET_PLAY_SECTIONS.includes(key));
      const smartPlayLayout = currentPlayOrder.every((key, index) => key === FATE_SHEET_PLAY_SECTIONS[index])
        && !FATE_SHEET_PLAY_SECTIONS.some(key => sections[key]?.wide);
      return {
        ...context,
        actor,
        system: actor.system,
        editable: this.isEditable,
        isOwner: actor.isOwner,
        isGM: game.user.isGM,
        prefs,
        model,
        campaignMode: Boolean(model.campaignWill),
        campaignWill: model.campaignWill,
        campaignSettingsOpen: this._campaignSettingsOpen ?? Boolean(game.user.isGM && model.campaignWill && !model.campaignWill.configured),
        campaignNpcTierRank: model.campaignWill?.tier === 'rank',
        campaignNpcTierOrdinary: !model.campaignWill?.tier || model.campaignWill.tier === 'ordinary',
        campaignNpcTierPowerful: model.campaignWill?.tier === 'powerful',
        campaignNpcTierLegendary: model.campaignWill?.tier === 'legendary',
        sections,
        activeTab,
        playActive: activeTab === "play",
        storyActive: activeTab === "story",
        developmentActive: activeTab === "development",
        development: game.modules?.get(FATE_SHEET_MODULE_ID)?.api?.developmentForActor?.(actor) ?? {
          stage: 1, bank: 0, counts: { minor: 0, significant: 0, major: 0 }, entries: [], hasHistory: false, active: null
        },
        customizing: this._customizing,
        sectionNames: names,
        customizerSections,
        smartPlayLayout,
        densityStandard: prefs.density === "standard",
        densityCompact: prefs.density === "compact",
        densityComfortable: prefs.density === "comfortable",
        themeFoundry: prefs.theme === "foundry",
        themePaper: prefs.theme === "paper",
        themeMidnight: prefs.theme === "midnight",
        accent: prefs.accent,
      };
    }

    async _onRender(context, options) {
      await super._onRender(context, options);
      const root = this.element;
      if (!root) return;
      root.dataset.density = context.prefs?.density || "standard";
      root.dataset.theme = context.prefs?.theme || "foundry";
      root.style.setProperty("--fts-user-accent", context.prefs?.accent || FATE_SHEET_DEFAULT_PREFS.accent);
      root.dataset.activeTab = context.activeTab || "play";
      this._applySmartPlayColumns(root);
      this._bindTabs(root);
      const campaignSettings = root.querySelector?.('.fts-campaign-settings');
      campaignSettings?.addEventListener('toggle', () => { this._campaignSettingsOpen = campaignSettings.open; });
      this._bindSearch(root);
      this._bindCustomFieldChanges(root);
      this._bindLayoutDrag(root);
      this._bindAccent(root);
      this._bindNativeParity(root);
      this._bindTokenizerPortrait(root);
      this._observeWidth(root);
    }

    async _onClose(options) {
      this._resizeObserver?.disconnect?.();
      this._resizeObserver = null;
      return super._onClose(options);
    }

    _applySmartPlayColumns(root) {
      const grid = root.querySelector?.(".fts-section-grid.fts-smart-play-grid");
      if (!grid || grid.querySelector(":scope > .fts-smart-column")) return;

      const makeColumn = (className, keys) => {
        const column = document.createElement("div");
        column.className = `fts-smart-column ${className}`;
        for (const key of keys) {
          const card = grid.querySelector(`:scope > [data-section="${key}"]`);
          if (card) column.append(card);
        }
        if (column.childElementCount) grid.append(column);
      };

      makeColumn("fts-smart-column-state", ["aspects", "tracks", "extras"]);
      makeColumn("fts-smart-column-capabilities", ["skills", "stunts"]);
    }

    _observeWidth(root) {
      this._resizeObserver?.disconnect?.();
      if (typeof ResizeObserver === "undefined") return;
      const apply = entries => {
        const width = entries?.[0]?.contentRect?.width ?? root.getBoundingClientRect?.().width ?? 980;
        root.classList.toggle("fts-narrow", width < 720);
      };
      this._resizeObserver = new ResizeObserver(apply);
      this._resizeObserver.observe(root);
      const width = root.getBoundingClientRect?.().width ?? 980;
      root.classList.toggle("fts-narrow", width < 720);
    }

    _bindTabs(root) {
      const tablist = root.querySelector?.('[role="tablist"]');
      if (!tablist) return;
      const tabs = Array.from(tablist.querySelectorAll('[role="tab"][data-tab]'));
      if (!tabs.length) return;
      for (const tab of tabs) {
        tab.tabIndex = tab.getAttribute("aria-selected") === "true" ? 0 : -1;
        tab.addEventListener("keydown", event => {
          const index = tabs.indexOf(tab);
          if (index < 0) return;
          let nextIndex = null;
          if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
          else if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
          else if (event.key === "Home") nextIndex = 0;
          else if (event.key === "End") nextIndex = tabs.length - 1;
          if (nextIndex === null) return;
          event.preventDefault();
          const next = tabs[nextIndex];
          this._pendingTabFocus = String(next.dataset.tab || "");
          next.focus();
          next.click();
        });
      }
      if (this._pendingTabFocus) {
        const escaped = CSS.escape(this._pendingTabFocus);
        const selected = tablist.querySelector(`[role="tab"][data-tab="${escaped}"]`);
        this._pendingTabFocus = null;
        selected?.focus?.({ preventScroll: true });
      }
    }

    _bindSearch(root) {
      root.querySelectorAll("[data-sheet-search]").forEach(input => {
        const update = () => {
          const target = String(input.dataset.sheetSearch || "");
          const query = String(input.value || "").trim().toLocaleLowerCase();
          const rows = Array.from(root.querySelectorAll(`[data-search-group="${CSS.escape(target)}"] [data-search-text]`));
          let visible = 0;
          for (const row of rows) {
            row.hidden = Boolean(query && !String(row.dataset.searchText || "").toLocaleLowerCase().includes(query));
            if (!row.hidden) visible += 1;
          }
          const status = root.querySelector(`[data-sheet-search-status="${CSS.escape(target)}"]`);
          if (status) status.textContent = query ? `${visible}/${rows.length}` : "";
          const group = root.querySelector(`[data-search-group="${CSS.escape(target)}"]`);
          if (group) group.classList.toggle("is-filter-empty", Boolean(query && visible === 0));
        };
        input.addEventListener("input", update);
        input.addEventListener("search", update);
        update();
      });
    }

    _bindAccent(root) {
      const input = root.querySelector?.("[data-sheet-accent]");
      if (!input) return;
      input.addEventListener("change", async () => {
        const value = String(input.value || "").toLowerCase();
        if (!/^#[0-9a-f]{6}$/.test(value)) return;
        const prefs = getSheetPrefs(this.document);
        prefs.accent = value;
        await setSheetPrefs(this.document, prefs);
        root.style.setProperty("--fts-user-accent", value);
      });
    }

    _bindLayoutDrag(root) {
      if (!this._customizing) return;
      let dragging = null;
      const rows = Array.from(root.querySelectorAll("[data-layout-section]"));
      for (const row of rows) {
        row.addEventListener("dragstart", event => {
          dragging = row.dataset.layoutSection;
          row.classList.add("is-dragging");
          if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", dragging || "");
          }
        });
        row.addEventListener("dragend", () => {
          dragging = null;
          root.querySelectorAll("[data-layout-section]").forEach(node => node.classList.remove("is-dragging", "is-drop-target"));
        });
        row.addEventListener("dragover", event => {
          if (!dragging || row.dataset.layoutSection === dragging) return;
          event.preventDefault();
          root.querySelectorAll("[data-layout-section]").forEach(node => node.classList.toggle("is-drop-target", node === row));
        });
        row.addEventListener("drop", async event => {
          event.preventDefault();
          const source = dragging || event.dataTransfer?.getData?.("text/plain");
          const target = row.dataset.layoutSection;
          if (!source || !target || source === target) return;
          const prefs = getSheetPrefs(this.document);
          const order = [...prefs.sectionOrder];
          const sourceIndex = order.indexOf(source);
          const targetIndex = order.indexOf(target);
          if (sourceIndex < 0 || targetIndex < 0) return;
          order.splice(sourceIndex, 1);
          order.splice(order.indexOf(target), 0, source);
          prefs.sectionOrder = order;
          await setSheetPrefs(this.document, prefs);
          await this.render(false);
        });
      }
    }

    _bindCustomFieldChanges(root) {
      root.querySelectorAll("[data-custom-field-input]").forEach(input => {
        input.addEventListener("change", async () => {
          const fieldId = input.dataset.customFieldInput;
          const prop = input.dataset.customFieldProp || "value";
          const fields = readCustomFields(this.document);
          const field = fields.find(row => row.id === fieldId);
          if (!field || !this.document.isOwner) return;
          let value;
          if (input.type === "checkbox") value = input.checked;
          else if (input.type === "number") value = Number(input.value || 0);
          else value = input.value;
          field[prop] = value;
          await this.document.setFlag(FATE_SHEET_MODULE_ID, FATE_SHEET_CUSTOM_FIELDS_KEY, fields);
          await this.render(false);
        });
      });
    }


    _bindTokenizerPortrait(root) {
      const portrait = root.querySelector?.('img.fts-portrait[data-edit="img"]');
      const tokenizer = game.modules?.get?.("vtta-tokenizer");
      const api = tokenizer?.api ?? globalThis.Tokenizer;
      if (!portrait || !tokenizer?.active || typeof api?.tokenizeActor !== "function") return;

      // Tokenizer normally discovers sheet classes once and attaches its own
      // portrait click handler. Custom ApplicationV2 sheets can be missed by
      // that discovery, so mirror Tokenizer's documented click semantics here.
      portrait.addEventListener("click", event => {
        let globalDisabled = false;
        let userMode = "global";
        try {
          globalDisabled = Boolean(game.settings.get("vtta-tokenizer", "disable-avatar-click"));
          userMode = String(game.settings.get("vtta-tokenizer", "disable-avatar-click-user") ?? "global");
        } catch (_) {
          // Older Tokenizer versions may not expose both settings. Default to
          // its normal behaviour: regular click launches Tokenizer.
        }
        const disabled = userMode === "global" ? globalDisabled : userMode === "default";
        const launch = (!disabled && !event.shiftKey) || (disabled && event.shiftKey);
        if (!launch) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        api.tokenizeActor(this.document);
      }, true);
    }

    _bindNativeParity(root) {
      // Right click on a skill keeps Fate Core Official's built-in skill reference behavior.
      root.querySelectorAll?.("[data-skill-info]").forEach(node => {
        node.addEventListener("contextmenu", event => {
          event.preventDefault();
          const key = node.dataset.skillKey;
          const skill = this.document.system?.skills?.[key];
          const constants = resolveFateGlobal("fcoConstants");
          if (skill && constants?.presentSkill) constants.presentSkill(skill);
        });
      });

      // The native sheet supports dragging skills/aspects/stunts/tracks between character sheets.
      root.querySelectorAll?.("[data-fco-drag-type]").forEach(node => {
        node.addEventListener("dragstart", event => {
          if (!game.user?.isGM || !event.dataTransfer) return;
          const type = String(node.dataset.fcoDragType || "");
          const key = String(node.dataset.fcoDragKey || "");
          const block = this.document.system?.[`${type}s`] || {};
          const dragged = cloneSheetValue(block?.[key], null);
          if (!dragged) return;
          event.dataTransfer.setData("text/plain", JSON.stringify({
            ident: "mf_draggable",
            userid: game.user.id,
            type,
            origin: this.document.id,
            dragged,
            shift_down: Boolean(game.system?.["fco-shifted"])
          }));
          event.dataTransfer.effectAllowed = "copy";
        });
        node.addEventListener("dblclick", async event => {
          event.preventDefault();
          const type = String(node.dataset.fcoDragType || "");
          const key = String(node.dataset.fcoDragKey || "");
          const block = this.document.system?.[`${type}s`] || {};
          const entry = block?.[key];
          if (!entry) return;
          const label = { skill:"Навык", aspect:"Аспект", stunt:"Трюк", track:"Трек" }[type] || "Элемент";
          const lines = [`<strong>${escapeHtml(label)}: ${escapeHtml(entry.name || "")}</strong>`];
          if (type === "skill") lines.push(`<div>Ранг: ${Number(entry.rank || 0) >= 0 ? "+" : ""}${Number(entry.rank || 0)}</div>`);
          if (type === "aspect" && entry.value) lines.push(`<div>${escapeHtml(entry.value)}</div>`);
          if (type === "stunt" && entry.linked_skill && String(entry.linked_skill).toLowerCase() !== "none") lines.push(`<div>Связанный навык: ${escapeHtml(globalThis.FateToolkitI18n?.skill?.(entry.linked_skill) || entry.linked_skill)}</div>`);
          const description = firstSheetText(entry.description);
          if (description) lines.push(`<div>${await enrichSheetHtml(this.document, description)}</div>`);
          await ChatMessage.create({ content: `<div><strong>${escapeHtml(this.document.name)}</strong><hr>${lines.join("")}</div>`, speaker: ChatMessage.getSpeaker({ actor: this.document }) });
        });
      });

      root.querySelectorAll?.('[data-action="openExtraLibrary"]').forEach(btn=>btn.addEventListener('click',()=>void globalThis.FateToolkitExtraBuilder?.openLibrary?.(this.document).catch(e=>ui.notifications.error(String(e.message||e)))));
      root.querySelectorAll?.('[data-action="saveExtraToLibrary"]').forEach(btn=>btn.addEventListener('click',()=>{
        const item=this.document.items?.get?.(btn.dataset.itemId);if(!item)return;
        void globalThis.FateToolkitExtraBuilder?.saveToLibrary?.(item).then(ok=>{if(ok)ui.notifications.info('Дополнение сохранено в библиотеке.');}).catch(e=>ui.notifications.error(String(e.message||e)));
      }));
      root.querySelectorAll?.("[data-faw-hotbar]").forEach(node => {
        node.addEventListener("dragstart", event => {
          const item=this.document.items?.get?.(node.dataset.fawHotbar);
          if (!item || !this.document.isOwner || !globalThis.FateToolkitExtras?.definition?.(item) || !event.dataTransfer) return;
          event.stopPropagation();
          event.dataTransfer.setData("text/plain", JSON.stringify({type:"FawExtra",actorUuid:this.document.uuid,itemId:item.id}));
          event.dataTransfer.effectAllowed="copy";
        });
      });

      root.querySelectorAll?.("[data-extra-drag]").forEach(node => {
        node.addEventListener("dragstart", async event => {
          if (!event.dataTransfer) return;
          const item = this.document.items?.get?.(node.dataset.extraDrag);
          if (!item) return;

          // Match Fate Core Official's own Extra drag behavior: before an embedded
          // Extra leaves the sheet, copy the actor-side state of tracks and stunts
          // contributed by that Extra back into the Item. Otherwise checked stress
          // boxes / stunt boxes can silently revert after dragging the Extra away.
          if (item.parent) {
            const duplicate = value => cloneSheetValue(value, {});
            const trackUpdates = duplicate(item.system?.tracks);
            const actorTracks = this.document.system?.tracks || {};
            for (const extraTrack of Object.values(trackUpdates || {})) {
              if (!extraTrack?.name) continue;
              for (const actorTrack of Object.values(actorTracks)) {
                const originalName = actorTrack?.original_name;
                if (originalName !== extraTrack.name || actorTrack?.extra_id !== item.id) continue;
                const track = duplicate(actorTrack);
                track.name = originalName;
                delete track.extra_id;
                delete track.original_name;
                trackUpdates[fateObjectKey(originalName)] = track;
              }
            }

            const stuntUpdates = duplicate(item.system?.stunts);
            const actorStunts = this.document.system?.stunts || {};
            for (const extraStunt of Object.values(stuntUpdates || {})) {
              if (!extraStunt?.name) continue;
              for (const actorStunt of Object.values(actorStunts)) {
                const originalName = actorStunt?.original_name;
                if (originalName !== extraStunt.name || actorStunt?.extra_id !== item.id) continue;
                const stunt = duplicate(actorStunt);
                stunt.name = originalName;
                delete stunt.extra_id;
                delete stunt.original_name;
                stuntUpdates[fateObjectKey(originalName)] = stunt;
              }
            }
            await item.update({ type: "Extra", "system.tracks": trackUpdates, "system.stunts": stuntUpdates }, { renderSheet: false });
          }

          event.dataTransfer.setData("text/plain", JSON.stringify({ type: "Item", uuid: item.uuid }));
          event.dataTransfer.effectAllowed = "copyMove";
        });
        node.addEventListener("dblclick", async event => {
          if (event.target?.closest?.("button")) return;
          const item = this.document.items?.get?.(node.dataset.extraDrag);
          if (!item) return;
          const names = block => Object.values(block || {}).map(entry => escapeHtml(entry?.name || "")).filter(Boolean).join(", ");
          const skillNames = Object.values(item.system?.skills || {}).map(skill => `${escapeHtml(globalThis.FateToolkitI18n?.skill?.(skill?.name) || skill?.name || "")} (${Number(skill?.rank || 0) >= 0 ? "+" : ""}${Number(skill?.rank || 0)})`).join(", ");
          const rows = [
            item.system?.aspects && `<strong>Аспекты:</strong> ${names(item.system.aspects)}`,
            item.system?.skills && `<strong>Навыки:</strong> ${skillNames}`,
            item.system?.stunts && `<strong>Трюки:</strong> ${names(item.system.stunts)}`,
            item.system?.tracks && `<strong>Треки:</strong> ${names(item.system.tracks)}`,
            `<strong>Состояние:</strong> ${item.system?.active ? "включено" : "выключено"}`
          ].filter(Boolean);
          await ChatMessage.create({ content: `<div><strong>${escapeHtml(item.name)}</strong><hr>${rows.join("<br>")}</div>`, speaker: ChatMessage.getSpeaker({ actor: this.document }) });
        });
      });

      root.addEventListener?.("dragover", event => {
        if (this.document?.isOwner) event.preventDefault();
      });
      root.addEventListener?.("drop", async event => {
        if (!this.document?.isOwner) return;
        let data = null;
        try {
          const editor = foundry?.applications?.ux?.TextEditor?.implementation;
          data = editor?.getDragEventData?.(event) || JSON.parse(event.dataTransfer?.getData?.("text/plain") || "null");
        } catch (_) {}
        if (!data) return;
        if (data.type === "Item" && data.uuid) {
          const item = await globalThis.fromUuid?.(data.uuid);
          if (item?.type === "Extra" && item?.parent?.id !== this.document.id) {
            event.preventDefault();
            await this.document.createEmbeddedDocuments("Item", [item.toObject ? item.toObject() : cloneSheetValue(item, {})]);
            Hooks.call("dropActorSheetData", this.document, this, data);
            return;
          }
        }
        if (data.ident === "mf_draggable") {
          event.preventDefault();
          Hooks.call("dropActorSheetData", this.document, this, data);
        }
      });
    }

    static async _launchAction(actionType) {
      const api = game.modules.get(FATE_SHEET_MODULE_ID)?.api;
      if (!api?.initiateActionAtTarget) {
        globalThis.FateToolkitUX?.warn?.(game.i18n.localize("FAW.Sheet.ActionUnavailable"));
        return;
      }
      await api.initiateActionAtTarget(actionType, this.document.uuid, targetRefFromCanvas());
    }

    static _actionAttack() { return this.constructor._launchAction.call(this, "attack"); }
    static _actionOvercome() { return this.constructor._launchAction.call(this, "overcome"); }
    static _actionCreate() { return this.constructor._launchAction.call(this, "create"); }
    static _actionDefend() { return this.constructor._launchAction.call(this, "defend"); }

    static async _openActionWidget() {
      await game.modules.get(FATE_SHEET_MODULE_ID)?.api?.openActionWidgetFor?.(this.document.uuid);
    }

    static async _editSkills() { return globalThis.FateToolkitEditors?.editActor?.(this.document,'skills'); }
    static async _manageAspects() { return globalThis.FateToolkitEditors?.editActor?.(this.document,'aspects'); }
    static async _manageTracks() { return globalThis.FateToolkitEditors?.editActor?.(this.document,'tracks'); }
    static async _addStunt() { return globalThis.FateToolkitEditors?.editActor?.(this.document,'stunts'); }
    static async _editStunt() { return globalThis.FateToolkitEditors?.editActor?.(this.document,'stunts'); }

    static async _deleteStunt(event, target) {
      if (!this.document?.isOwner) return;
      const key = target.dataset.stuntKey;
      const stunt = this.document.system?.stunts?.[key];
      if (!stunt || stunt.extra_id) return;
      const ok = await globalThis.FateToolkitUX?.confirm?.({
        title: sheetLocalize("FAW.Sheet.DeleteStunt"),
        content: `<p>${escapeHtml(sheetLocalize("FAW.Sheet.DeleteStuntConfirm").replace("{name}", String(stunt.name || "")))}</p>`,
        danger: true
      });
      if (!ok) return;
      await this.document.update({ [`system.stunts.-=${key}`]: null });
    }

    static async _rollSkill(event, target) {
      if (!this.document?.isOwner) return;
      const skill = this.document.system?.skills?.[target.dataset.skillKey];
      if (!skill) return;
      const name = String(skill.name || "");
      if (!name) return;
      const modified = Boolean(game.system?.["fco-shifted"]) !== Boolean(fateSetting("modifiedRollDefault", false));
      if (modified && typeof this.document.rollModifiedSkill === "function") await this.document.rollModifiedSkill(name);
      else if (typeof this.document.rollSkill === "function") await this.document.rollSkill(name);
    }

    static async _rollStunt(event, target) {
      if (!this.document?.isOwner) return;
      const stunt = fateEntryByKeyOrName(this.document.system?.stunts, target.dataset.stuntKey, target.dataset.stuntName);
      if (!stunt) return;
      if (typeof this.document.rollStunt === "function") await this.document.rollStunt(String(stunt.name || ""));
    }

    static async _runStuntMacro(event, target) {
      if (!this.document?.isOwner) return;
      const stunt = this.document.system?.stunts?.[target.dataset.stuntKey];
      if (!stunt?.macro) return;
      const macro = await globalThis.fromUuid?.(stunt.macro);
      await macro?.execute?.({ actor: this.document });
    }

    static async _openStuntMacro(event, target) {
      const stunt = this.document.system?.stunts?.[target.dataset.stuntKey];
      if (!stunt?.macro) return;
      const macro = await globalThis.fromUuid?.(stunt.macro);
      await macro?.sheet?.render?.(true);
    }

    static async _toggleStuntBox(event, target) {
      if (!this.document?.isOwner) return;
      const key = target.dataset.stuntKey;
      const index = Number(target.dataset.index);
      const stunt = this.document.system?.stunts?.[key];
      if (!stunt || !Number.isInteger(index)) return;
      const values = Array.isArray(stunt.box_values) ? [...stunt.box_values] : [];
      if (index < 0 || index >= values.length) return;
      values[index] = !values[index];
      await this.document.update({ [`system.stunts.${key}.box_values`]: values });
    }

    static async _openStuntDatabase() {
      const Database = resolveFateGlobal("StuntDB");
      if (!Database) return nativeEditorUnavailable("база трюков");
      await openNativeFateEditor(Database, [this.document], { kind: "stuntdb", sheet: this });
    }

    static async _addStuntToDatabase(event, target) {
      if (!game.user?.isGM) return;
      const key = target.dataset.stuntKey;
      const stunt = cloneSheetValue(this.document.system?.stunts?.[key], null);
      const world = fateWorldData();
      if (!stunt || !world) return;
      delete stunt.extra_id;
      delete stunt.original_name;
      await world.update({ [`system.stunts.${fateObjectKey(stunt.name)}`]: stunt });
      globalThis.FateToolkitUX?.info?.(sheetLocalize("FAW.Sheet.StuntAddedToDatabase").replace("{name}", String(stunt.name || "")));
    }

    static async _uploadAllStunts() {
      if (!game.user?.isGM) return;
      const world = fateWorldData();
      if (!world) return;
      const update = {};
      let count = 0;
      for (const stunt of Object.values(this.document.system?.stunts || {})) {
        if (!stunt?.name || stunt.extra_id) continue;
        const clean = cloneSheetValue(stunt, {});
        delete clean.extra_id;
        delete clean.original_name;
        update[`system.stunts.${fateObjectKey(clean.name)}`] = clean;
        count += 1;
      }
      if (count) await world.update(update);
      globalThis.FateToolkitUX?.info?.(sheetLocalize("FAW.Sheet.StuntsAddedToDatabase").replace("{count}", String(count)));
    }

    static async _rollTrack(event, target) {
      if (!this.document?.isOwner) return;
      const track = this.document.system?.tracks?.[target.dataset.trackKey];
      if (!track || !["full", "empty"].includes(String(track.rollable || "false"))) return;
      const name = String(track.name || "");
      const modified = Boolean(game.system?.["fco-shifted"]) !== Boolean(fateSetting("modifiedRollDefault", false));
      if (modified && typeof this.document.rollModifiedTrack === "function") await this.document.rollModifiedTrack(name);
      else if (typeof this.document.rollTrack === "function") await this.document.rollTrack(name);
    }

    static async _addExtra() {
      if (!this.document?.isOwner || !game.user?.isGM) return;
      const [item] = await this.document.createEmbeddedDocuments("Item", [{ name: sheetLocalize("FAW.Sheet.NewExtra"), type: "Extra" }]);
      if (item) await globalThis.FateToolkitExtraBuilder?.edit(item);
    }

    static async _editExtraMechanics(event,target) {
      if (!this.document?.isOwner || !game.user?.isGM) return;
      const item=this.document.items?.get?.(target.dataset.itemId);
      if (item) await globalThis.FateToolkitExtraBuilder?.edit(item);
    }
    static async _useExtraMechanics(event,target) {
      if (!this.document?.isOwner) return;
      const item=this.document.items?.get?.(target.dataset.itemId);
      if (item) await globalThis.FateToolkitExtraBuilder?.activate(this.document,item);
    }
    static async _exportExtraMechanics(event,target) {
      const item=this.document.items?.get?.(target.dataset.itemId);
      if (item) await globalThis.FateToolkitExtraBuilder?.exportFromActor(this.document,item);
    }
    static async _exportAllExtraMechanics() {
      await globalThis.FateToolkitExtraBuilder?.exportFromActor(this.document);
    }
    static async _importExtraMechanics() {
      if (!this.document?.isOwner || !game.user?.isGM) return;
      await globalThis.FateToolkitExtraBuilder?.importToActor(this.document);
    }

    static async _deleteExtra(event, target) {
      if (!this.document?.isOwner) return;
      const item = this.document.items?.get?.(target.dataset.itemId);
      if (!item) return;
      const ok = await globalThis.FateToolkitUX?.confirm?.({
        title: sheetLocalize("FAW.Sheet.DeleteExtra"),
        content: `<p>${escapeHtml(sheetLocalize("FAW.Sheet.DeleteExtraConfirm").replace("{name}", String(item.name || "")))}</p>`,
        danger: true
      });
      if (!ok) return;
      await this.document.deleteEmbeddedDocuments("Item", [item.id]);
    }

    static async _syncTokenName() {
      if (!this.document?.isOwner) return;
      if (this.document.isToken && this.document.token) await this.document.token.update({ name: this.document.name });
      else await this.document.update({ "prototypeToken.name": this.document.name });
      globalThis.FateToolkitUX?.info?.(sheetLocalize("FAW.Sheet.TokenNameSynced"));
    }

    static async _saveFramework() {
      if (!game.user?.isGM) return;
      const Defaults = resolveFateGlobal("FateCharacterDefaults");
      if (!Defaults) return nativeEditorUnavailable("шаблоны персонажей");
      const esc = escapeHtml;
      const result = await foundry.applications.api.DialogV2.input({
        window: { title: sheetLocalize("FAW.Sheet.SaveFramework") },
        content: `<div class="standard-form faw-toolkit-dialog">
          <div class="form-group"><label>${esc(sheetLocalize("FAW.Sheet.FrameworkName"))}</label><input name="name" type="text" value="${esc(this.document.name || "")}" required></div>
          <div class="form-group"><label>${esc(sheetLocalize("FAW.Sheet.FrameworkDescription"))}</label><input name="description" type="text"></div>
          <label class="checkbox"><input name="keepSkills" type="checkbox"> ${esc(sheetLocalize("FAW.Sheet.KeepSkillRanks"))}</label>
          <label class="checkbox"><input name="keepAspects" type="checkbox"> ${esc(sheetLocalize("FAW.Sheet.KeepAspectValues"))}</label>
        </div>`,
        ok: { label: sheetLocalize("FAW.Sheet.Save") }
      });
      if (!result) return;
      const f = new Defaults();
      const options = { keep_skills: Boolean(result.keepSkills), keep_aspects: Boolean(result.keepAspects) };
      const def = await f.extractDefault(this.document, String(result.name || this.document.name).trim(), String(result.description || ""), options);
      def.options = options;
      await f.storeDefault(def);
      globalThis.FateToolkitUX?.info?.(sheetLocalize("FAW.Sheet.FrameworkSaved"));
    }

    static async _applyFramework() {
      if (!game.user?.isGM) return;
      const Defaults = resolveFateGlobal("FateCharacterDefaults");
      if (!Defaults) return nativeEditorUnavailable("шаблоны персонажей");
      const f = new Defaults();
      const defaults = Array.from(f.defaults || []);
      if (!defaults.length) {
        globalThis.FateToolkitUX?.warn?.(sheetLocalize("FAW.Sheet.NoFrameworks"));
        return;
      }
      const esc = escapeHtml;
      const options = defaults.map(name => `<option value="${esc(name)}">${esc(name)}</option>`).join("");
      const result = await foundry.applications.api.DialogV2.input({
        window: { title: sheetLocalize("FAW.Sheet.ApplyFramework") },
        content: `<div class="standard-form faw-toolkit-dialog">
          <div class="form-group"><label>${esc(sheetLocalize("FAW.Sheet.Framework"))}</label><select name="framework">${options}</select></div>
          <label class="checkbox"><input name="skills" type="checkbox" checked> ${esc(sheetLocalize("FAW.Sheet.Skills"))}</label>
          <label class="checkbox"><input name="aspects" type="checkbox" checked> ${esc(sheetLocalize("FAW.Sheet.Aspects"))}</label>
          <label class="checkbox"><input name="stunts" type="checkbox" checked> ${esc(sheetLocalize("FAW.Sheet.Stunts"))}</label>
          <label class="checkbox"><input name="tracks" type="checkbox" checked> ${esc(sheetLocalize("FAW.Sheet.Tracks"))}</label>
          <label class="checkbox"><input name="extras" type="checkbox" checked> ${esc(sheetLocalize("FAW.Sheet.Extras"))}</label>
          <label class="checkbox"><input name="avatar" type="checkbox" checked> ${esc(sheetLocalize("FAW.Sheet.FrameworkArtwork"))}</label>
          <label class="checkbox"><input name="overwrite" type="checkbox"> ${esc(sheetLocalize("FAW.Sheet.FrameworkOverwrite"))}</label>
        </div>`,
        ok: { label: sheetLocalize("FAW.Sheet.Apply") }
      });
      if (!result?.framework) return;
      const sections = ["skills", "aspects", "stunts", "tracks"].filter(key => Boolean(result[key]));
      await f.applyDefault(this.document, result.framework, {
        overwrite: Boolean(result.overwrite),
        extras: Boolean(result.extras),
        avatar: Boolean(result.avatar),
        sections
      });
      globalThis.FateToolkitUX?.info?.(sheetLocalize("FAW.Sheet.FrameworkApplied"));
      await this.render(false);
    }

    static async _changeTab(event, target) {
      const tab = target.dataset.tab;
      if (!["play", "story", "development"].includes(tab)) return;
      const prefs = getSheetPrefs(this.document);
      prefs.activeTab = tab;
      await setSheetPrefs(this.document, prefs);
      await this.render(false);
    }

    static async _openCampaignTimeline() {
      return game.modules?.get(FATE_SHEET_MODULE_ID)?.api?.openCampaignTimeline?.();
    }

    static async _openMilestoneDevelopment() {
      return game.modules?.get(FATE_SHEET_MODULE_ID)?.api?.openMilestoneForActor?.(this.document.id);
    }

    static async _toggleCustomize() {
      this._customizing = !this._customizing;
      await this.render(false);
    }

    static async _toggleFavorite(event, target) {
      const kind = target.dataset.kind;
      const key = target.dataset.key;
      if (!kind || !key || !["aspects", "skills", "stunts"].includes(kind)) return;
      const prefs = getSheetPrefs(this.document);
      const set = new Set(prefs.favorites[kind]);
      if (set.has(key)) set.delete(key); else set.add(key);
      prefs.favorites[kind] = Array.from(set);
      await setSheetPrefs(this.document, prefs);
      await this.render(false);
    }

    static async _moveSection(event, target, delta) {
      const section = target.dataset.section;
      if (!FATE_SHEET_ALL_SECTIONS.includes(section)) return;
      const prefs = getSheetPrefs(this.document);
      const order = prefs.sectionOrder;
      const index = order.indexOf(section);
      const next = index + delta;
      if (index < 0 || next < 0 || next >= order.length) return;
      [order[index], order[next]] = [order[next], order[index]];
      await setSheetPrefs(this.document, prefs);
      await this.render(false);
    }

    static _moveSectionUp(event, target) { return this.constructor._moveSection.call(this, event, target, -1); }
    static _moveSectionDown(event, target) { return this.constructor._moveSection.call(this, event, target, 1); }

    static async _toggleSectionHidden(event, target) {
      const section = target.dataset.section;
      if (!FATE_SHEET_ALL_SECTIONS.includes(section)) return;
      const prefs = getSheetPrefs(this.document);
      const set = new Set(prefs.hiddenSections);
      if (set.has(section)) set.delete(section); else set.add(section);
      prefs.hiddenSections = Array.from(set);
      await setSheetPrefs(this.document, prefs);
      await this.render(false);
    }

    static async _toggleSectionWide(event, target) {
      const section = target.dataset.section;
      if (!FATE_SHEET_ALL_SECTIONS.includes(section)) return;
      const prefs = getSheetPrefs(this.document);
      const set = new Set(prefs.wideSections);
      if (set.has(section)) set.delete(section); else set.add(section);
      prefs.wideSections = Array.from(set);
      await setSheetPrefs(this.document, prefs);
      await this.render(false);
    }

    static async _setDensity(event, target) {
      const density = target.dataset.density;
      if (!["standard", "compact", "comfortable"].includes(density)) return;
      const prefs = getSheetPrefs(this.document);
      prefs.density = density;
      await setSheetPrefs(this.document, prefs);
      await this.render(false);
    }

    static async _setTheme(event, target) {
      const theme = target.dataset.theme;
      if (!["foundry", "paper", "midnight"].includes(theme)) return;
      const prefs = getSheetPrefs(this.document);
      prefs.theme = theme;
      await setSheetPrefs(this.document, prefs);
      await this.render(false);
    }

    static async _resetLayout() {
      const ok = await globalThis.FateToolkitUX?.confirm?.({
        title: game.i18n.localize("FAW.Sheet.ResetLayout"),
        content: `<p>${game.i18n.localize("FAW.Sheet.ResetLayoutConfirm")}</p>`
      });
      if (!ok) return;
      await setSheetPrefs(this.document, cloneSheetValue(FATE_SHEET_DEFAULT_PREFS, {}));
      await this.render(false);
    }

    static async _adjustFatePoints(delta) {
      if (!this.document.isOwner) return;
      if (globalThis.FateToolkitWill?.enabled?.()) {
        return this.constructor._campaignWillAction.call(this, 'change', { delta });
      }
      const current = Number(this.document.system?.details?.fatePoints?.current ?? 0);
      await this.document.update({ "system.details.fatePoints.current": Math.max(0, current + delta) });
    }

    static async _campaignWillAction(operation, extra = {}) {
      try {
        const result = await globalThis.FateToolkitWill.request(operation, this.document, extra);
        if (result?.excessive) ui?.notifications?.warn?.('Чрезмерное увлечение! Мастер должен зафиксировать осложнение.');
        await this.render(false);
        return result;
      } catch (err) {
        ui?.notifications?.error?.(String(err?.message || err));
        return null;
      }
    }

    static async _spendSpecialWill() {
      if (!globalThis.FateToolkitWill?.enabled?.()) return;
      const state=globalThis.FateToolkitWill.details(this.document);
      if (!state.configured || state.current < 1) return ui.notifications.warn(game.i18n.localize('FAW.Campaign.NoWill'));
      const result=await foundry.applications.api.DialogV2.prompt({
        window:{title:game.i18n.localize('FAW.Campaign.SpecialSpend')},
        content:`<div class="faw-toolkit-dialog"><div class="form-group"><label>${game.i18n.localize('FAW.Campaign.ActionType')}</label><select name="purpose"><option value="flashback">${game.i18n.localize('FAW.Campaign.Flashback')}</option><option value="resistance">${game.i18n.localize('FAW.Campaign.Resistance')}</option><option value="other">${game.i18n.localize('FAW.Campaign.OtherAction')}</option></select></div><div class="form-group"><label>${game.i18n.localize('FAW.Campaign.Cost')}</label><input type="number" name="amount" min="1" max="${state.current}" value="1" required></div><div class="form-group"><label>${game.i18n.localize('FAW.Campaign.Description')}</label><input name="description" type="text" maxlength="300"></div></div>`,
        ok:{label:game.i18n.localize('FAW.Campaign.SpendWill'),callback:(_event,button)=>({
          purpose:button.form?.elements?.purpose?.value,
          amount:Number(button.form?.elements?.amount?.value),
          description:String(button.form?.elements?.description?.value||'')
        })},rejectClose:false
      });
      if (!result) return;
      return this.constructor._campaignWillAction.call(this,'special',result);
    }

    static async _gainCompelWill() {
      if (!game.user?.isGM || !globalThis.FateToolkitWill?.enabled?.()) return;
      const description=await foundry.applications.api.DialogV2.prompt({
        window:{title:game.i18n.localize('FAW.Campaign.Compel')},
        content:`<div class="faw-toolkit-dialog"><div class="form-group"><label>${game.i18n.localize('FAW.Campaign.CompelDescription')}</label><input name="description" type="text" maxlength="300" required></div></div>`,
        ok:{label:game.i18n.localize('FAW.Campaign.Compel'),callback:(_event,button)=>String(button.form?.elements?.description?.value||'').trim()},rejectClose:false
      });
      if (!description) return;
      return this.constructor._campaignWillAction.call(this,'compel',{description});
    }

    static async _applyCampaignFramework() {
      if (!game.user?.isGM || !globalThis.FateToolkitWill?.enabled?.()) return;
      try {
        const service = globalThis.FateToolkitFramework;
        const result = await service.request('preview', this.document);
        if (!result.changed) { ui.notifications.info(game.i18n.localize('FAW.Campaign.FrameworkReady')); return; }
        const lines = [
          `${game.i18n.localize('FAW.Campaign.NewSkills')}: ${result.addedSkills.join(', ') || '—'}`,
          `${game.i18n.localize('FAW.Campaign.RenamedSkills')}: ${result.renamedSkills.join(', ') || '—'}`,
          `${game.i18n.localize('FAW.Campaign.NewAspects')}: ${result.addedAspects.join(', ') || '—'}`,
          `${game.i18n.localize('FAW.Campaign.UpdatedLinks')}: ${result.updatedReferences||0}`, 
          `${game.i18n.localize('FAW.Campaign.LegacyEntries')}: ${[...result.legacySkills,...result.legacyAspects].join(', ') || '—'}`
        ];
        const confirmed = await globalThis.FateToolkitUX.confirm({
          window:{title:game.i18n.localize('FAW.Campaign.FrameworkTitle')},
          content: `<p>${game.i18n.localize('FAW.Campaign.FrameworkHint')}</p><ul>${lines.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul>`,
          modal:true, rejectClose:false
        });
        if (!confirmed) return;
        await service.request('apply', this.document);
        await this.render(false);
        ui.notifications.info(game.i18n.localize('FAW.Campaign.FrameworkApplied'));
      } catch (error) { ui.notifications.error(String(error?.message || error)); }
    }

    static async _setupCampaignWorldSkills() { return globalThis.FateToolkitEditors?.setupWorld?.(); }

    static _configureWillPc() { return this.constructor._campaignWillAction.call(this, 'configure', { type: 'pc' }); }
    static _configureWillNpc(_event, target) {
      const tier = this.element?.querySelector?.('[data-campaign-npc-tier]')?.value || 'ordinary';
      return this.constructor._campaignWillAction.call(this, 'configure', { type: 'npc', tier });
    }
    static _beginCampaignScene() { return this.constructor._campaignWillAction.call(this, 'restoreNpcs'); }
    static _enterCampaignScene() { return this.constructor._campaignWillAction.call(this, 'enterScene'); }
    static _recoverWillVice() { return this.constructor._campaignWillAction.call(this, 'vice'); }
    static async _resolveWillComplication() {
      const value = await foundry.applications.api.DialogV2.prompt({
        window: { title: 'Чрезмерное увлечение' },
        content: '<div class="form-group"><label>Осложнение от пристрастия</label><input name="complication" type="text" required maxlength="1500" autofocus></div>',
        ok: { label: 'Зафиксировать', callback: (_event, button) => String(button.form?.elements?.complication?.value || '').trim() },
        rejectClose: false
      });
      if (!value) return;
      return this.constructor._campaignWillAction.call(this, 'resolveComplication', { description: value });
    }

    static _fatePointUp() { return this.constructor._adjustFatePoints.call(this, 1); }
    static _fatePointDown() { return this.constructor._adjustFatePoints.call(this, -1); }

    static async _toggleGmNotes() {
      if (!game.user.isGM) return;
      const current = firstSheetBoolean(this.document.system?.details?.notes?.GM, this.document.system?.details?.notes?.gm);
      await this.document.update({ "system.details.notes.GM": !current });
    }

    static async _toggleTrackBox(event, target) {
      if (!this.document.isOwner) return;
      const key = target.dataset.trackKey;
      const index = Number(target.dataset.index);
      if (!key || !Number.isInteger(index)) return;
      const track = this.document.system?.tracks?.[key];
      const boxes = Array.isArray(track?.box_values) ? [...track.box_values] : [];
      if (index < 0 || index >= boxes.length) return;
      boxes[index] = !boxes[index];
      await this.document.update({ [`system.tracks.${key}.box_values`]: boxes });
    }

    static async _openExtra(event, target) {
      const item = this.document.items?.get?.(target.dataset.itemId);
      await item?.sheet?.render?.(true);
    }

    static async _toggleExtra(event, target) {
      if (!this.document.isOwner) return;
      const item = this.document.items?.get?.(target.dataset.itemId);
      if (!item) return;
      const active = !Boolean(item.system?.active);
      // Match Fate Core Official's sheet ordering. Suppress the Item hook while
      // changing the flag, then explicitly let the Actor add/remove everything
      // contributed by the Extra exactly once.
      await item.update({ "system.active": active }, { renderSheet: false, noHook: true });
      if (active && typeof this.document.updateFromExtra === "function") await this.document.updateFromExtra(item);
      if (!active && typeof this.document.deactivateExtra === "function") await this.document.deactivateExtra(item, false);
      await this.render(false);
    }

    static async _addCustomField() {
      if (!this.document.isOwner) return;
      const definition = await promptCustomFieldDefinition();
      if (!definition) return;
      const fields = readCustomFields(this.document);
      fields.push(normaliseCustomFields([{ id: foundry.utils.randomID(), ...definition }])[0]);
      await this.document.setFlag(FATE_SHEET_MODULE_ID, FATE_SHEET_CUSTOM_FIELDS_KEY, fields);
      await this.render(false);
    }

    static async _editCustomField(event, target) {
      if (!this.document.isOwner) return;
      const id = target.dataset.fieldId;
      const fields = readCustomFields(this.document);
      const index = fields.findIndex(field => field.id === id);
      if (index < 0) return;
      const definition = await promptCustomFieldDefinition(fields[index]);
      if (!definition) return;
      const previous = fields[index];
      let value = previous.value;
      if (definition.type === "toggle") value = Boolean(value);
      else if (definition.type === "number" || definition.type === "counter") value = Number(value || 0);
      else value = String(value ?? "");
      fields[index] = normaliseCustomFields([{ ...previous, ...definition, value }])[0];
      await this.document.setFlag(FATE_SHEET_MODULE_ID, FATE_SHEET_CUSTOM_FIELDS_KEY, fields);
      await this.render(false);
    }

    static async _deleteCustomField(event, target) {
      if (!this.document.isOwner) return;
      const id = target.dataset.fieldId;
      const ok = await globalThis.FateToolkitUX?.confirm?.({
        title: game.i18n.localize("FAW.Sheet.DeleteField"),
        content: `<p>${game.i18n.localize("FAW.Sheet.DeleteFieldConfirm")}</p>`,
        danger: true
      });
      if (!ok) return;
      const fields = readCustomFields(this.document).filter(field => field.id !== id);
      await this.document.setFlag(FATE_SHEET_MODULE_ID, FATE_SHEET_CUSTOM_FIELDS_KEY, fields);
      await this.render(false);
    }

    static async _moveCustomField(event, target, delta) {
      if (!this.document.isOwner) return;
      const id = target.dataset.fieldId;
      const fields = readCustomFields(this.document);
      const index = fields.findIndex(field => field.id === id);
      const next = index + delta;
      if (index < 0 || next < 0 || next >= fields.length) return;
      [fields[index], fields[next]] = [fields[next], fields[index]];
      await this.document.setFlag(FATE_SHEET_MODULE_ID, FATE_SHEET_CUSTOM_FIELDS_KEY, fields);
      await this.render(false);
    }

    static _moveCustomFieldUp(event, target) { return this.constructor._moveCustomField.call(this, event, target, -1); }
    static _moveCustomFieldDown(event, target) { return this.constructor._moveCustomField.call(this, event, target, 1); }

    static _scrollFavorite(event, target) {
      const kind = target.dataset.kind;
      const key = target.dataset.key;
      const row = this.element?.querySelector?.(`[data-favorite-anchor="${CSS.escape(`${kind}:${key}`)}"]`);
      row?.scrollIntoView?.({ behavior: "smooth", block: "center" });
      row?.classList?.add?.("fts-flash");
      setTimeout(() => row?.classList?.remove?.("fts-flash"), 900);
    }
  };
}


const FATE_NATIVE_EDITOR_CLASSES = new Set([
  "EditPlayerSkills", "EditGMSkills", "EditPlayerAspects", "EditPlayerTracks", "EditEntityTrack",
  "EditEntityLinkedSkills", "EditLinkedSkills", "EditPlayerStunts", "StuntDB", "EditTracks"
]);

function russianiseRenderedFateEditor(app, element) {
  const name = String(app?.constructor?.name || "");
  if (!app?._fawRussian && !FATE_NATIVE_EDITOR_CLASSES.has(name)) return;
  const kind = name.includes("Skill") ? "skills"
    : name.includes("Aspect") ? "aspects"
      : name.includes("Track") ? "tracks"
        : name === "StuntDB" ? "stuntdb"
          : name.includes("Stunt") ? "stunt" : "";
  russianiseNativeEditorElement(element || app?.element, kind);
}

Hooks.on?.("renderApplicationV2", (app, element) => {
  queueMicrotask(() => russianiseRenderedFateEditor(app, element));
  setTimeout(() => russianiseRenderedFateEditor(app, element), 40);
});
Hooks.on?.("renderApplication", (app, element) => {
  queueMicrotask(() => russianiseRenderedFateEditor(app, element));
  setTimeout(() => russianiseRenderedFateEditor(app, element), 40);
});

Hooks.once("init", () => {
  if (game.system.id !== FATE_SHEET_SYSTEM_ID) return;

  game.settings.register(FATE_SHEET_MODULE_ID, FATE_SHEET_PREFS_KEY, {
    scope: "user",
    config: false,
    type: Object,
    default: {}
  });

  if (!FateToolkitCharacterSheet) {
    console.error(`${FATE_SHEET_MODULE_ID} | ActorSheetV2 is unavailable; custom character sheet not registered.`);
    return;
  }

  const DocumentSheetConfig = foundry.applications.apps.DocumentSheetConfig;
  DocumentSheetConfig.registerSheet(foundry.documents.Actor, FATE_SHEET_MODULE_ID, FateToolkitCharacterSheet, {
    types: ["fate-core-official"],
    label: "FAW.Sheet.Title",
    makeDefault: false,
    canBeDefault: true,
    canConfigure: true
  });
});

// Always open the Toolkit character sheet, even when the user's Foundry default
// is the standard Fate Core Official sheet. Reuse an existing Toolkit window.
const fateToolkitSheetApps = new WeakMap();
function openFateToolkitCharacterSheet(actor) {
  if (!actor || (!game.user?.isGM && !actor.isOwner)) return;
  if (!FateToolkitCharacterSheet) return actor.sheet?.render?.(true);
  if (actor.sheet instanceof FateToolkitCharacterSheet) return actor.sheet.render(true);
  let sheet = fateToolkitSheetApps.get(actor);
  if (!sheet) {
    sheet = new FateToolkitCharacterSheet({document: actor});
    fateToolkitSheetApps.set(actor, sheet);
  }
  return sheet.render(true);
}

async function openFateCharacterDevelopment(actor) {
  if (!actor || !game.user?.isGM && !actor.isOwner) return;
  const prefs = getSheetPrefs(actor);
  prefs.activeTab = "development";
  await setSheetPrefs(actor, prefs);
  return actor.sheet?.render?.(true);
}

Hooks.once("ready", () => {
  if (game.system?.id !== FATE_SHEET_SYSTEM_ID) return;
  const module = game.modules.get(FATE_SHEET_MODULE_ID);
  module.api ??= {};
  module.api.openCharacterDevelopment = openFateCharacterDevelopment;
  module.api.openCharacterSheet = openFateToolkitCharacterSheet;
});

globalThis.FateToolkitCharacterSheet = FateToolkitCharacterSheet;
globalThis.FateToolkitCharacterSheetModel = Object.freeze({
  defaultPreferences: () => cloneSheetValue(FATE_SHEET_DEFAULT_PREFS, {}),
  normalisePreferences: normaliseSheetPrefs,
  sectionState,
  normaliseCustomFields,
  buildSheetModel,
  preserveSheetArtworkFormData
});
