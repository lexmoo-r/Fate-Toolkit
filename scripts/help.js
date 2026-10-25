const FAW_HELP_MODULE_ID = "fate-aspect-widget";
const FAW_HELP_SEEN_SETTING = "onboardingSeenVersion";
const FAW_HELP_VERSION = "0.90";
const FAW_HELP_TOPICS = Object.freeze({
  overview: {
    icon: "fa-solid fa-compass",
    ru: { title: "Fate Toolkit", intro: "Главные игровые процессы собраны в нескольких связанных окнах. Начинайте с действия, а модуль проведёт результат до конца.", bullets: ["Действие Fate: персонаж → цель → действие → бросок → оппозиция.", "Центр действий показывает то, что прямо сейчас ждёт решения.", "Аспекты, усиления, стресс, последствия и вехи сохраняют состояние между перезагрузками.", "Последний навык только предвыбирается: перед каждым броском его можно сразу заменить."], next: ["actions","workflow","aspects"] },
    en: { title: "Fate Toolkit", intro: "Core play flows are connected across a small set of windows. Start an action and the toolkit carries the result through resolution.", bullets: ["Fate Action: actor → target → action → roll → opposition.", "Action Center shows what currently needs a decision.", "Aspects, boosts, stress, consequences, and milestones persist through reloads.", "The previous skill is only preselected; every roll keeps the normal chooser available."], next: ["actions","workflow","aspects"] }
  },
  actions: {
    icon: "fa-solid fa-crosshairs",
    ru: { title: "Действия Fate", intro: "Перед каждым броском открывается обычный выбор навыка; предыдущий навык только предвыбран.", bullets: ["Выберите действующего персонажа и, при необходимости, цель.", "Последний использованный навык подсвечен заранее, но меняется обычным кликом без модификаторов клавиатуры.", "Если есть подходящие трюки, они всегда подтверждаются явно.", "Для создания преимущества режим можно выбрать в том же обычном диалоге, когда выбор нужен.", "Цель-маркер означает работу с существующим аспектом; остальные цели по умолчанию означают создание нового."], next: ["combat","history"] },
    en: { title: "Fate Actions", intro: "Every roll opens the normal skill chooser; the previous skill is only preselected.", bullets: ["Choose the acting character and an optional target.", "The previous skill is highlighted but can be changed with an ordinary click.", "Applicable stunts are always confirmed explicitly.", "Create Advantage mode is offered in the same visible dialog whenever an explicit choice is needed.", "An aspect marker defaults to an existing-aspect Create Advantage; other targets default to a new aspect."], next: ["combat","history"] }
  },
  aspects: {
    icon: "fa-solid fa-tags",
    ru: { title: "Аспекты и усиления", intro: "Окно аспектов — единое место для игровых, сценовых, персонажных аспектов, последствий и усилений.", bullets: ["Фильтры скрывают ненужные источники без удаления данных.", "Избранные аспекты поднимаются наверх только для вас.", "Аспекты можно перетаскивать на сцену и между поддерживаемыми разделами.", "Успешное «Создание преимущества» предлагает создать аспект или добавить бесплатные призывания.", "Усиления одноразовые и визуально отделены от постоянных аспектов."], next: ["actions","history"] },
    en: { title: "Aspects and boosts", intro: "The aspect window unifies game, scene, character aspects, consequences, and boosts.", bullets: ["Filters hide sources without deleting data.", "Pinned aspects rise to the top for your user only.", "Aspects can be dragged to the scene and supported sections.", "Successful Create Advantage offers the appropriate aspect/free-invoke action.", "Boosts remain one-shot and visually distinct."], next: ["actions","history"] }
  },
  combat: {
    icon: "fa-solid fa-list-ol",
    ru: { title: "Конфликт", intro: "Трекер ведёт обмены и не даёт потерять незакрытый удар.", bullets: ["Быстрые действия участника связывают трекер с виджетом действий.", "Стресс и последствия видны прямо в строке участника.", "Следующий обмен блокируется, пока остаётся незакрытый вред.", "Если кто-то не походил, мастер получает явное предупреждение перед переходом.", "Состояние конфликта восстанавливается после F5."], next: ["workflow","actions"] },
    en: { title: "Conflict", intro: "The tracker manages exchanges and prevents unresolved hits from being lost.", bullets: ["Participant quick actions hand off directly to the action widget.", "Stress and consequences are visible on the participant row.", "A new exchange is blocked while unresolved damage remains.", "The GM is warned before skipping participants who have not acted.", "Conflict state resumes after reload."], next: ["workflow","actions"] }
  },
  workflow: {
    icon: "fa-solid fa-gauge-high",
    ru: { title: "Центр действий", intro: "Это очередь того, что требует решения, а не ещё один лист персонажа.", bullets: ["Мастер видит конфликт, ожидающие броски, незакрытый вред, активные вехи и ресурсы сцены.", "Режим фокуса мастера скрывает всё, что сейчас не требует его решения.", "Игрок получает сокращённую версию только со своими текущими процессами.", "Нажатие на карточку ведёт в окно, где действие можно завершить."], next: ["combat","milestones"] },
    en: { title: "Action Center", intro: "This is a decision queue, not another character sheet.", bullets: ["The GM sees conflict, pending rolls, unresolved damage, milestones, and scene resources.", "GM focus hides items that do not currently require a GM decision.", "Players receive a reduced view of their own active processes.", "Cards lead to the window where the process can be resolved."], next: ["combat","milestones"] }
  },
  milestones: {
    icon: "fa-solid fa-road",
    ru: { title: "Вехи", intro: "Мастер объявляет одну веху группе, а каждый персонаж проходит только доступные этому типу шаги.", bullets: ["Подходящие персонажи выбраны по умолчанию; тип вехи выбирается одной кнопкой.", "Малая позволяет перестановки, значимая добавляет развитие навыков, крупная — крупные изменения и награды.", "Черновик игрока сохраняется между перезагрузками.", "Мастер видит, кто закончил, и может напомнить ожидающим."], next: ["workflow"] },
    en: { title: "Milestones", intro: "The GM announces one milestone to a group; each character only sees steps allowed by that milestone type.", bullets: ["Eligible actors are selected by default and the milestone type is a direct button.", "Minor permits exchanges, significant adds skill growth, major enables major changes and rewards.", "Player drafts survive reloads.", "The GM can see completion state and remind pending players."], next: ["workflow"] }
  },
  history: {
    icon: "fa-solid fa-clock-rotate-left",
    ru: { title: "История действия", intro: "Карточка результата хранит не только формулу броска, но и причинную цепочку результата.", bullets: ["В истории остаются бросок, трюки, призывы, рероллы, стресс, последствия, усиления и завершение.", "Игрок видит компактную игровую цепочку.", "Мастер дополнительно видит пользователя и время событий.", "Скрытая мастерская информация не записывается в публичные flags сообщения."], next: ["actions","combat"] },
    en: { title: "Action history", intro: "A result card records the causal chain, not just the roll formula.", bullets: ["Rolls, stunts, invokes, rerolls, stress, consequences, boosts, and completion are retained.", "Players see a compact game-facing trail.", "The GM additionally sees event user and time.", "Hidden GM information is not stored in public message flags."], next: ["actions","combat"] }
  }
});

function fawHelpTopic(topic = "overview") {
  const key = Object.hasOwn(FAW_HELP_TOPICS, topic) ? topic : "overview";
  const row = FAW_HELP_TOPICS[key];
  const lang = String(game.i18n?.lang || "ru").toLowerCase().startsWith("en") ? "en" : "ru";
  const text = row[lang] || row.ru;
  return { key, icon: row.icon, ...text, next: (text.next || []).map(next => ({ key: next, title: (FAW_HELP_TOPICS[next]?.[lang] || FAW_HELP_TOPICS[next]?.ru)?.title || next })) };
}

const FawHelpBase = foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2);
class FateToolkitHelpApp extends FawHelpBase {
  constructor(topic = "overview", ...args) { super(...args); this.topic = topic; }
  static DEFAULT_OPTIONS = { id: "fate-toolkit-help", classes: ["fate", "faw-help-window"], window: { title: "FAW.Help", icon: "fa-solid fa-circle-question", resizable: true }, position: { width: 520, height: "auto" } };
  static PARTS = { main: { template: `modules/${FAW_HELP_MODULE_ID}/templates/help.hbs` } };
  async _prepareContext(options) { const context = await super._prepareContext(options); return foundry.utils.mergeObject(context, fawHelpTopic(this.topic)); }
}
let fawHelpApp = null;
function openFateToolkitHelp(topic = "overview") {
  if (!fawHelpApp) fawHelpApp = new FateToolkitHelpApp(topic);
  fawHelpApp.topic = Object.hasOwn(FAW_HELP_TOPICS, topic) ? topic : "overview";
  return fawHelpApp.render(true);
}

Hooks.once("init", () => {
  game.settings.register(FAW_HELP_MODULE_ID, FAW_HELP_SEEN_SETTING, { name: "Onboarding version", scope: "client", config: false, type: String, default: "" });
});

Hooks.once("ready", async () => {
  const module = game.modules.get(FAW_HELP_MODULE_ID);
  module.api ??= {};
  module.api.openHelp = openFateToolkitHelp;
  globalThis.FateToolkitHelp = { open: openFateToolkitHelp, topic: fawHelpTopic };
  document.addEventListener("click", event => {
    const button = event.target?.closest?.("[data-faw-help]");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    openFateToolkitHelp(String(button.dataset.fawHelp || "overview"));
  });
  const seen = String(game.settings.get(FAW_HELP_MODULE_ID, FAW_HELP_SEEN_SETTING) || "");
  if (seen !== FAW_HELP_VERSION) {
    await game.settings.set(FAW_HELP_MODULE_ID, FAW_HELP_SEEN_SETTING, FAW_HELP_VERSION);
    openFateToolkitHelp("overview");
  }
});
