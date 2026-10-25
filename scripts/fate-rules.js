(() => {
  const MODULE_ID = "fate-aspect-widget";
  const SYSTEM_ID = "fate-core-official";
  const { signed } = globalThis.FateToolkitRollPresentation;

  function getLadder() {
    try {
      return game.settings.get(SYSTEM_ID, "ladder") ?? {};
    } catch {
      return {};
    }
  }

  function ladderText(value) {
    const ladder = getLadder();
    return ladder?.[String(value)] || "";
  }

  function actorSkills(actor) {
    if (!actor?.system?.skills) return [];
    return Object.values(actor.system.skills)
      .filter(s => s?.name)
      .map(s => ({ name: s.name, label: globalThis.FateToolkitI18n?.skill?.(s.name) || s.name, rank: Number(s.rank) || 0 }))
      .sort((a, b) => a.label.localeCompare(b.label, "ru"));
  }

  function findSkill(actor, skillName) {
    return actorSkills(actor).find(s => s.name === skillName);
  }

  function actorStunts(actor) {
    if (!actor?.system?.stunts) return [];
    return Object.entries(actor.system.stunts)
      .filter(([, stunt]) => stunt?.name)
      .map(([key, stunt]) => ({
        key,
        name: String(stunt.name || ''),
        description: String(stunt.description || ''),
        notes: String(stunt.notes || ''),
        linkedSkill: String(stunt.linked_skill || 'None'),
        bonus: Number(stunt.bonus) || 0,
        overcome: Boolean(stunt.overcome),
        create: Boolean(stunt.caa),
        attack: Boolean(stunt.attack),
        defend: Boolean(stunt.defend),
        macro: stunt.macro || null,
        boxes: Number(stunt.boxes) || 0,
        boxValues: Array.isArray(stunt.box_values) ? stunt.box_values.map(Boolean) : []
      }))
      .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
  }

  function stuntActionField(actionType) {
    return ({ overcome: 'overcome', create: 'create', attack: 'attack', defend: 'defend' })[actionType] || null;
  }

  function stuntMatchesSkill(stunt, skillName) {
    const linked = skillKey(stunt?.linkedSkill);
    const noneKeys = new Set(['none', 'нет', '—', '-']);
    const specialKeys = new Set(['special', 'особый', 'особое', 'любой', 'любой навык']);
    if (!linked || noneKeys.has(linked)) return false;
    if (specialKeys.has(linked)) return Boolean(skillName);
    return linked === skillKey(skillName);
  }

  function stuntAllowsAction(stunt, actionType) {
    const field = stuntActionField(actionType);
    if (!field) return true;
    return Boolean(stunt?.[field]);
  }

  function applicableStunts(actor, skillName, actionType) {
    if (!skillName) return [];
    return actorStunts(actor).filter(stunt => stuntMatchesSkill(stunt, skillName) && stuntAllowsAction(stunt, actionType));
  }

  function stuntByKey(actor, key) {
    return actorStunts(actor).find(stunt => stunt.key === key) || null;
  }

  function validateStuntSelection(actor, stuntKeys, skillName, actionType) {
    const allowed = new Map(applicableStunts(actor, skillName, actionType).map(stunt => [stunt.key, stunt]));
    const unique = [...new Set(Array.isArray(stuntKeys) ? stuntKeys.map(String) : [])];
    return unique.map(key => allowed.get(key)).filter(Boolean);
  }

  function stuntSummaryText(stunts) {
    return (stunts || []).map(stunt => `${stunt.name}${stunt.bonus ? ` (${signed(stunt.bonus)})` : ''}`).join(', ');
  }

  async function executeStuntMacro(actor, stuntKey) {
    const stunt = stuntByKey(actor, stuntKey);
    if (!stunt?.macro) return;
    try {
      const macro = await fromUuid(stunt.macro);
      if (!macro?.execute) return globalThis.FateToolkitUX.warn(`Макрос трюка «${stunt.name}» больше недоступен.`);
      await macro.execute({ actor, stunt: foundry.utils.duplicate(actor.system.stunts?.[stunt.key] || {}), source: MODULE_ID });
    } catch (err) {
      console.error(`${MODULE_ID} | Stunt macro failed`, err);
      globalThis.FateToolkitUX.error(`Не удалось выполнить макрос трюка «${stunt.name}».`);
    }
  }

  function skillKey(name) {
    return String(name ?? "").trim().toLocaleLowerCase(game.i18n?.lang || "ru");
  }

  const CORE_SKILL_ACTIONS = new Map([
    [["атлетика", "athletics"], ["overcome", "create", "defend"]],
    [["воровство", "burglary"], ["overcome", "create"]],
    [["связи", "contacts"], ["overcome", "create", "defend"]],
    [["ремесло", "crafts"], ["overcome", "create"]],
    [["обман", "deceive"], ["overcome", "create", "defend"]],
    [["вождение", "drive"], ["overcome", "create", "defend"]],
    [["эмпатия", "empathy"], ["overcome", "create", "defend"]],
    [["драка", "fight"], ["overcome", "create", "attack", "defend"]],
    [["расследование", "investigate"], ["overcome", "create"]],
    [["знания", "lore"], ["overcome", "create"]],
    [["внимательность", "notice"], ["overcome", "create", "defend"]],
    [["телосложение", "physique"], ["overcome", "create", "defend"]],
    [["провокация", "provoke"], ["overcome", "create", "attack"]],
    [["взаимопонимание", "rapport"], ["overcome", "create", "defend"]],
    [["ресурсы", "resources"], ["overcome", "create"]],
    [["стрельба", "shoot"], ["overcome", "create", "attack"]],
    [["скрытность", "stealth"], ["overcome", "create", "defend"]],
    [["воля", "will"], ["overcome", "create", "defend"]]
  ].flatMap(([names, actions]) => names.map(name => [name, new Set(actions)])));

  function coreAllowsAction(skillName, actionType) {
    if (!actionType || actionType === "generic") return true;
    const actions = CORE_SKILL_ACTIONS.get(skillKey(skillName));
    if (!actions) return null; // Custom skill: don't pretend we know its permissions.
    return actions.has(actionType);
  }

  function skillsForAction(actor, actionType) {
    const skills = actorSkills(actor);
    return [...skills].sort((a, b) => {
      const pa = coreAllowsAction(a.name, actionType);
      const pb = coreAllowsAction(b.name, actionType);
      const ga = pa === true ? 0 : pa === null ? 1 : 2;
      const gb = pb === true ? 0 : pb === null ? 1 : 2;
      if (ga !== gb) return ga - gb;
      if (b.rank !== a.rank) return b.rank - a.rank;
      return a.name.localeCompare(b.name, game.i18n.lang);
    });
  }

  function firstExistingSkill(actor, candidates = []) {
    for (const candidate of candidates) {
      const found = actorSkills(actor).find(skill => skillKey(skill.name) === skillKey(candidate));
      if (found) return found;
    }
    return null;
  }

  function highestCoreSkill(actor, actionType) {
    return skillsForAction(actor, actionType)
      .filter(skill => coreAllowsAction(skill.name, actionType) !== false)
      .sort((a, b) => b.rank - a.rank)[0] ?? null;
  }

  function oppositionActionType(proposal) {
    if (proposal?.actionType === "defend") return proposal?.defendedAgainst || "attack";
    if (!proposal?.actionType || proposal.actionType === "generic") return "generic";
    return "defend";
  }

  function suggestedOppositionSkill(proposal, targetActor) {
    if (!targetActor) return { skill: null, reason: "" };
    const source = skillKey(proposal?.skillName);
    const action = proposal?.actionType || "generic";

    // A standalone Defend action represents a reaction. Here the selected target is the
    // source of the incoming action, so we suggest an *attacking/acting* skill for it.
    if (action === "defend") {
      const incoming = proposal?.defendedAgainst || "attack";
      const defender = source;
      if (incoming === "attack") {
        if (["воля", "will"].includes(defender)) {
          const skill = firstExistingSkill(targetActor, ["Провокация", "Provoke"]);
          if (skill) return { skill, reason: "В базовом Fate Провокация атакует психику, а Воля защищается от неё." };
        }
        if (["драка", "fight"].includes(defender)) {
          const skill = firstExistingSkill(targetActor, ["Драка", "Fight"]);
          if (skill) return { skill, reason: "Драка обычно противостоит Драке в ближнем бою." };
        }
        const skill = highestCoreSkill(targetActor, "attack");
        if (skill) return { skill, reason: "Для входящей атаки предложен сильнейший стандартный атакующий навык цели; при необходимости выберите другой." };
      }
      const same = actorSkills(targetActor).find(skill => skillKey(skill.name) === source);
      if (same) return { skill: same, reason: "Для этого контекста нет единственной обязательной пары; по умолчанию выбран тот же навык." };
      const fallback = highestCoreSkill(targetActor, incoming === "create" ? "create" : "overcome");
      return { skill: fallback, reason: fallback ? "Это только предложение: в Fate источник оппозиции определяется фикцией." : "" };
    }

    const rules = [];
    if (action === "attack") {
      if (["стрельба", "shoot"].includes(source)) rules.push({ names: ["Атлетика", "Athletics"], reason: "В базовом Fate от Стрельбы защищаются Атлетикой." });
      if (["провокация", "provoke"].includes(source)) rules.push({ names: ["Самообладание", "Воля", "Will"], reason: globalThis.FateToolkitWill?.enabled?.() ? "От ментальных атак Провокацией защищаются Самообладанием." : "В базовом Fate от ментальных атак Провокацией защищаются Волей." });
      if (["драка", "fight"].includes(source)) rules.push({ names: ["Драка", "Fight", "Атлетика", "Athletics"], reason: "От Драки можно защищаться Дракой или Атлетикой; по умолчанию выбрана Драка, если она есть." });
    }
    if (action === "overcome") {
      if (["обман", "deceive"].includes(source)) rules.push({ names: ["Эмпатия", "Empathy"], reason: "Когда Обман направлен на персонажа, базовый Fate обычно противопоставляет ему Эмпатию." });
      if (["скрытность", "stealth"].includes(source)) rules.push({ names: ["Внимательность", "Notice"], reason: "Внимательность противостоит попыткам Скрытности остаться незамеченной." });
      if (["внимательность", "notice"].includes(source)) rules.push({ names: ["Скрытность", "Stealth"], reason: "Скрытность может противостоять попыткам Внимательности обнаружить персонажа." });
      if (["эмпатия", "empathy"].includes(source)) rules.push({ names: ["Обман", "Deceive"], reason: "Обман может защищать истинные намерения от Эмпатии." });
      if (["расследование", "investigate"].includes(source)) rules.push({ names: ["Обман", "Deceive", "Скрытность", "Stealth"], reason: "Обман или Скрытность могут противостоять Расследованию, если это соответствует ситуации." });
    }
    if (action === "create") {
      if (["провокация", "provoke"].includes(source)) rules.push({ names: ["Самообладание", "Воля", "Will"], reason: globalThis.FateToolkitWill?.enabled?.() ? "Провокации обычно противостоит Самообладание." : "Созданию эмоционального преимущества Провокацией обычно противостоит Воля." });
      if (["обман", "deceive"].includes(source)) rules.push({ names: ["Эмпатия", "Empathy"], reason: "Для преимуществ, основанных на лжи и введении в заблуждение, обычно подходит Эмпатия." });
      if (["драка", "fight"].includes(source)) rules.push({ names: ["Драка", "Fight"], reason: "Попыткам создать преимущество Дракой обычно можно противостоять Дракой." });
      if (["скрытность", "stealth"].includes(source)) rules.push({ names: ["Внимательность", "Notice"], reason: "Внимательность противостоит Скрытности, когда преимущество зависит от незаметности." });
      if (["эмпатия", "empathy"].includes(source)) rules.push({ names: ["Обман", "Deceive"], reason: "Обман может скрывать истинные мотивы от Эмпатии." });
    }

    for (const rule of rules) {
      const skill = firstExistingSkill(targetActor, rule.names);
      if (skill) return { skill, reason: rule.reason };
    }

    const same = actorSkills(targetActor).find(skill => skillKey(skill.name) === source);
    if (same) return { skill: same, reason: "У этой ситуации нет единственной обязательной пары навыков; по умолчанию выбран тот же навык. Его можно изменить." };

    const fallback = highestCoreSkill(targetActor, "defend");
    return { skill: fallback, reason: fallback ? "Подобран допустимый навык защиты как отправная точка; окончательный выбор зависит от описания действия." : "" };
  }

  function allSkillNames() {
    const names = new Set();
    for (const actor of game.actors) {
      if (actor.type !== SYSTEM_ID) continue;
      for (const skill of actorSkills(actor)) names.add(skill.name);
    }
    return [...names]
      .map(name => ({ name, label: globalThis.FateToolkitI18n?.skill?.(name) || name }))
      .sort((a, b) => a.label.localeCompare(b.label, "ru"));
  }

  globalThis.FateToolkitRules = Object.freeze({
    getLadder, ladderText, actorSkills, findSkill, actorStunts, stuntActionField, stuntMatchesSkill,
    stuntAllowsAction, applicableStunts, stuntByKey, validateStuntSelection, stuntSummaryText,
    executeStuntMacro, skillKey, coreAllowsAction, skillsForAction, firstExistingSkill, highestCoreSkill,
    oppositionActionType, suggestedOppositionSkill, allSkillNames
  });
})();
