const fs = require('fs');
const vm = require('vm');
const path = require('path');

class ApplicationV2 {
  static DEFAULT_OPTIONS = {};
  static PARTS = {};
  constructor(options = {}) { this.options = options; this.element = null; }
  render() {}
}

class ActorSheetV2 extends ApplicationV2 {
  static DEFAULT_OPTIONS = { actions: { editImage() {} } };
  constructor(options = {}) {
    super(options);
    this.document = options.document || null;
    this.isEditable = options.editable ?? true;
  }
  async _prepareContext() { return {}; }
  _onRender() {}
  async _onClose() {}
}

function baseContext(overrides = {}) {
  const users = overrides.users || [];
  const game = {
    i18n: { lang: 'ru', localize: k => k, format: (k, data = {}) => `${k}:${JSON.stringify(data)}` },
    settings: { get: () => null, register() {}, set: async () => {} },
    users: { contents: users, get: id => users.find(u => u.id === id) || null, activeGM: users.find(u => u.active && u.isGM) || null },
    actors: { contents: [], get: () => null },
    messages: { contents: [], get: () => null, find: () => null },
    modules: { get: () => ({ api: {} }) },
    world: { id: 'test-world' },
    user: overrides.user || { id: 'u1', isGM: false, active: true, getFlag: () => null, setFlag: async () => {}, unsetFlag: async () => {} },
    socket: { on() {}, emit() {} },
    system: { id: 'fate-core-official' },
    scenes: { contents: [], get: () => null, viewed: null },
    combats: { contents: [], get: () => null, viewed: null },
    combat: null,
    ...overrides.game
  };
  const context = {
    console,
    setTimeout,
    clearTimeout,
    queueMicrotask,
    TextEncoder,
    globalThis: null,
    window: { innerWidth: 1280, innerHeight: 720, addEventListener() {} },
    document: { documentElement: { clientWidth: 1280, clientHeight: 720 }, addEventListener() {} },
    sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    Hooks: { on() {}, once() {} },
    foundry: {
      applications: {
        api: { HandlebarsApplicationMixin: Base => class extends Base {}, ApplicationV2, DialogV2: {} },
        sheets: { ActorSheetV2 },
        apps: { DocumentSheetConfig: { registerSheet() {}, unregisterSheet() {} } }
      },
      documents: { Actor: class Actor {} },
      utils: {
        duplicate: value => value == null ? value : JSON.parse(JSON.stringify(value)),
        randomID: () => 'test-id',
        getProperty: (obj, key) => String(key).split('.').reduce((cur, part) => cur?.[part], obj)
      }
    },
    game,
    canvas: { scene: null, tokens: { controlled: [], placeables: [], setTargets() {} } },
    ui: { notifications: { info() {}, warn() {}, error() {} }, chat: {} },
    ChatMessage: { getSpeaker: () => ({}), getWhisperRecipients: () => [], create: async () => null },
    Roll: class {},
    fromUuid: async () => null,
    AudioHelper: {},
    HTMLElement: class {},
    TokenDocument: class {},
    crypto: globalThis.crypto,
    ...overrides.context
  };
  context.globalThis = context;
  return context;
}

function loadScript(relativeFile, exportNames, overrides = {}) {
  const file = path.join(__dirname, '..', relativeFile);
  const context = baseContext(overrides);
  vm.createContext(context);

  const dependencies = relativeFile === 'scripts/roll-request.js'
    ? ['scripts/window-runtime.js', 'scripts/private-storage.js', 'scripts/roll-presentation.js', 'scripts/outcome-sounds.js', 'scripts/fate-rules.js', 'scripts/action-state.js', 'scripts/result-rules.js', 'scripts/sound-settings-ui.js', 'scripts/roll-request-ui.js', 'scripts/opposition-public.js', 'scripts/request-state.js', 'scripts/request-builder.js', 'scripts/request-result-validation.js', 'scripts/request-result-compute.js', 'scripts/boost-claim-plan.js', 'scripts/boost-claim-commit.js', 'scripts/opposition-revision.js', 'scripts/result-action-plan.js', 'scripts/result-action-commit.js', 'scripts/roll-revision.js', 'scripts/opposition-refresh-compute.js', 'scripts/action-opposition.js', 'scripts/action-opposition-ui.js', 'scripts/player-opposition-ui.js', 'scripts/defend-choice-ui.js', 'scripts/player-opposition-roll.js', 'scripts/runtime-contracts.js','scripts/campaign-bargain-ui.js']
    : relativeFile === 'scripts/chat-actions.js'
      ? ['scripts/damage-resolution.js', 'scripts/invoke-resource.js', 'scripts/invoke-resolution.js']
      : relativeFile === 'scripts/combat-tracker.js'
        ? ['scripts/turn-finalization.js']
        : [];
  for (const dependency of dependencies) {
    const dependencyFile = path.join(__dirname, '..', dependency);
    vm.runInContext(fs.readFileSync(dependencyFile, 'utf8'), context, { filename: dependencyFile });
  }

  const code = fs.readFileSync(file, 'utf8') + `\n;globalThis.__testExports={${exportNames.join(',')}};`;
  vm.runInContext(code, context, { filename: file });
  return { exports: context.__testExports, context };
}

module.exports = { loadScript, baseContext };
