/* Campaign 2012 character framework. Lossless, opt-in, idempotent migration.
 * The authoritative source for sheet values remains Fate Core Official.
 * We neither truncate NPC aspects nor replace skill/stunt/extra fields.
 */
(() => {
  const ID = 'fate-aspect-widget';
  const names = Object.freeze([
    'Атлетика', 'Телосложение', 'Драка', 'Стрельба', 'Скрытность', 'Вождение',
    'Связи', 'Обман', 'Эмпатия', 'Провокация', 'Взаимопонимание', 'Ресурсы', 'Самообладание',
    'Внимательность', 'Расследование', 'Академическое знание', 'Истинное знание', 'Воровство', 'Ремесло'
  ]);
  const slots = Object.freeze(['Концепция', 'Мотив', 'Связь', 'Пристрастие', 'Слабость']);
  const groups = Object.freeze({
    physical: names.slice(0, 6), social: names.slice(6, 13), investigation: names.slice(13)
  });
  const aliases = Object.freeze({
    'athletics':'Атлетика','physique':'Телосложение','fight':'Драка','shoot':'Стрельба',
    'stealth':'Скрытность','drive':'Вождение','contacts':'Связи','deceive':'Обман',
    'deception':'Обман','empathy':'Эмпатия','provoke':'Провокация','rapport':'Взаимопонимание',
    'resources':'Ресурсы','will':'Самообладание','notice':'Внимательность',
    'investigate':'Расследование','investigation':'Расследование','lore':'Академическое знание',
    'academics':'Академическое знание','burglary':'Воровство','crafts':'Ремесло',
    'знания':'Академическое знание','воля':'Самообладание','академические знания':'Академическое знание',
    'техника':'Ремесло', 'истинные знания':'Истинное знание'
  });
  const aspectAliases = Object.freeze({
    'high concept':'Концепция', 'высшая концепция':'Концепция',
    'trouble':'Слабость', 'проблема':'Слабость',
    'relationship':'Связь', 'отношения':'Связь',
    'vice':'Пристрастие','weakness':'Слабость','motivation':'Мотив'
  });
  const key = value => String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase();
  const skillName = value => names.find(n => key(n) === key(value)) || aliases[key(value)] || null;
  const aspectName = value => slots.find(n => key(n) === key(value)) || aspectAliases[key(value)] || null;
  const copy = value => globalThis.foundry?.utils?.deepClone?.(value) ?? structuredClone(value);
  const rankOf = skill => Number.isFinite(Number(skill?.rank)) ? Math.trunc(Number(skill.rank)) : 0;
  function newSkill(name) {
    return { name, description:'', category:null, overcome:'', caa:'', attack:'', defend:'', pc:true, rank:0, adhoc:true, hidden:false };
  }
  function newAspect(name) { return { name, value:'', description:'', notes:'' }; }
  function uniqueId(prefix, items, name) {
    const index = prefix === 'skill' ? names.indexOf(name) : slots.indexOf(name);
    let result = `campaign_${prefix}_${index+1}`;
    for (let n=2; Object.hasOwn(items,result); n++) result = `campaign_${prefix}_${index+1}_${n}`;
    return result;
  }
  function planSkills(source) {
    const next = copy(source || {}), present = new Set(), duplicates = [], renamed = [], added = [], legacy = [];
    for (const [id, skill] of Object.entries(next)) {
      if (!skill?.name) continue;
      const canonical = skillName(skill.name);
      if (!canonical) { legacy.push(skill.name); continue; }
      if (present.has(canonical) && !skill.extra_id) { duplicates.push(canonical); continue; }
      present.add(canonical);
      if (skill.name !== canonical && !skill.extra_id) {
        skill.name = canonical;
        skill.adhoc = false;
        renamed.push(canonical);
      }
    }
    if (duplicates.length) return { valid:false, duplicates, skills:next, legacy, renamed, added };
    for (const name of names) {
      if (present.has(name)) continue;
      const id=uniqueId('skill',next,name);
      next[id]=newSkill(name);
      added.push(name);
    }
    return { valid:true, duplicates:[], skills:next, legacy, renamed, added };
  }
  function planAspects(source) {
    const next=copy(source || {}), present=new Set(), renamed=[], added=[], duplicates=[], legacy=[];
    for (const [id, aspect] of Object.entries(next)) {
      if (!aspect?.name) continue;
      const canonical=aspectName(aspect.name);
      if (!canonical || aspect.extra_id) { legacy.push(aspect.name); continue; }
      if (present.has(canonical)) { duplicates.push(canonical); continue; }
      present.add(canonical);
      if (aspect.name !== canonical) { aspect.name=canonical; renamed.push(canonical); }
    }
    if (duplicates.length) return { valid:false, duplicates, aspects:next, legacy, renamed, added };
    for (const name of slots) {
      if (present.has(name)) continue;
      next[uniqueId('aspect',next,name)] = newAspect(name);
      added.push(name);
    }
    return { valid:true, duplicates:[], aspects:next, legacy, renamed, added };
  }
  function planReferences(actor) {
    // Fate Core Official stores stunt links by skill NAME, not only by key.
    // Renaming a skill without updating those links silently disables rolls.
    const stunts = copy(actor?.system?.stunts || {});
    const tracks = copy(actor?.system?.tracks || {});
    let count=0;
    const rename = (obj, field) => {
      if (!obj || typeof obj[field] !== 'string') return;
      const canonical=skillName(obj[field]);
      if (canonical && obj[field]!==canonical) {obj[field]=canonical;count++;}
    };
    for (const row of Object.values(stunts)) {
      rename(row, 'linked_skill'); rename(row, 'linkedSkill');
    }
    for (const row of Object.values(tracks)) {
      rename(row, 'linked_skill');
      for (const skill of row.linked_skills || []) rename(skill, 'linked_skill');
    }
    return {stunts,tracks,count};
  }
  function plan(actor, { asNpc = false }={}) {
    const skillPlan=planSkills(actor?.system?.skills);
    const aspectPlan=asNpc ? null : planAspects(actor?.system?.aspects);
    const references=planReferences(actor);
    return {
      valid:skillPlan.valid && (aspectPlan?.valid ?? true),
      skills:skillPlan, aspects:aspectPlan, references,
      changed:skillPlan.added.length>0 || skillPlan.renamed.length>0 || references.count>0 || Boolean(aspectPlan && (aspectPlan.added.length || aspectPlan.renamed.length)),
      warnings:[...skillPlan.duplicates, ...(aspectPlan?.duplicates||[])],
      extraSkills:skillPlan.legacy, extraAspects:aspectPlan?.legacy||[]
    };
  }
  function eligible(user, actor) { return Boolean(user?.isGM && actor?.type==='fate-core-official'); }
  async function handler(payload={}, {senderId}={}) {
    if (!globalThis.FateToolkitWill?.enabled?.()) throw new Error('Режим кампании выключен.');
    const user=game.users?.get?.(String(senderId||''));
    if (!user?.isGM) throw new Error('Набор навыков и аспектов может применять только ведущий.');
    const operation=String(payload.operation||'');
    if (operation==='preview' || operation==='apply') {
      const actor=await fromUuid(String(payload.actorUuid||''));
      if (!eligible(user,actor)) throw new Error('Персонаж не найден или недоступен.');
      const state=globalThis.FateToolkitWill?.details?.(actor);
      if (!state?.configured) throw new Error('Сначала настройте Волю и тип персонажа (ПК или NPC).');
      const asNpc=state.isNpc;
      const result=plan(actor,{asNpc});
      if (!result.valid) throw new Error(`Обнаружены совпадающие навыки/аспекты: ${result.warnings.join(', ')}. Объедините их вручную перед переносом.`);
      if (operation==='preview') return {ok:true,changed:result.changed, addedSkills:result.skills.added,renamedSkills:result.skills.renamed,addedAspects:result.aspects?.added||[],updatedReferences:result.references.count,legacySkills:result.extraSkills,legacyAspects:result.extraAspects};
      if (!result.changed) return {ok:true,unchanged:true};
      const backup=actor.getFlag?.(ID,'campaignFrameworkBackup');
      const update={};
      if (!backup) update[`flags.${ID}.campaignFrameworkBackup`]={
        createdAt:Date.now(), skills:copy(actor.system?.skills||{}),aspects:copy(actor.system?.aspects||{}), stunts:copy(actor.system?.stunts||{}), tracks:copy(actor.system?.tracks||{})
      };
      // Never remove unfamiliar skills/aspects or overwrite the values and ranks
      // of an existing character. Other sheets and Extras still see their data.
      update['system.skills']=result.skills.skills;
      if (result.references.count) {update['system.stunts']=result.references.stunts; update['system.tracks']=result.references.tracks;}
      if (result.aspects) update['system.aspects']=result.aspects.aspects;
      await actor.update(update);
      return {ok:true,unchanged:false,addedSkills:result.skills.added,renamedSkills:result.skills.renamed,addedAspects:result.aspects?.added||[],updatedReferences:result.references.count,legacySkills:result.extraSkills,legacyAspects:result.extraAspects};
    }
    if (operation==='world') {
      const uuid=game.settings?.get?.('fate-core-official','wid');
      const world=uuid ? await fromUuid(uuid) : null;
      if (!world?.system?.skills || typeof world.update!=='function') throw new Error('Мировой справочник навыков Fate Core Official недоступен.');
      const p=planSkills(world.system.skills);
      const a=planAspects(world.system.aspects);
      if (!p.valid || !a.valid) throw new Error(`Справочник содержит повторные названия: ${[...p.duplicates,...a.duplicates].join(', ')}`);
      if (!p.added.length && !p.renamed.length && !a.added.length && !a.renamed.length) return {ok:true,unchanged:true};
      const backup=world.getFlag?.(ID,'campaignWorldSkillsBackup');
      const update={'system.skills':p.skills,'system.aspects':a.aspects};
      if (!backup) update[`flags.${ID}.campaignWorldSkillsBackup`]={ createdAt:Date.now(), skills:copy(world.system.skills),aspects:copy(world.system.aspects||{}) };
      await world.update(update);
      return {ok:true,added:p.added,renamed:p.renamed,addedAspects:a.added,legacy:p.legacy};
    }
    throw new Error('Неизвестное действие набора персонажа.');
  }
  function request(operation,actorOrUuid,extra={}) {
    const actorUuid=typeof actorOrUuid==='string'?actorOrUuid:actorOrUuid?.uuid;
    return globalThis.FateToolkitRPC.executeAsGM('campaignFramework',{operation,actorUuid,...extra});
  }
  globalThis.FateToolkitFramework=Object.freeze({names,slots,groups,skillName,aspectName,planSkills,planAspects,planReferences,plan,request,handler});
  globalThis.FateToolkitRPC?.register?.('campaignFramework',handler);
  async function bootstrapEmptyWorld() {
    if(!globalThis.FateToolkitWill?.enabled?.() || !game.user?.isGM)return;
    if(game.users?.activeGM && game.users.activeGM.id!==game.user.id)return;
    const uuid=game.settings?.get?.('fate-core-official','wid');
    const world=uuid?await fromUuid(uuid):null;
    if(!world?.system?.skills || !world?.system?.aspects)return;
    if(Object.keys(world.system.skills).length || Object.keys(world.system.aspects).length)return;
    const result=await handler({operation:'world'},{senderId:game.user.id});
    if(result?.ok&&!result.unchanged)ui.notifications?.info?.('В пустой мир добавлены 19 навыков и 5 аспектов кампании 2012. Их можно изменить в редакторе Fate Toolkit.');
  }
  Hooks.on?.('updateSetting',setting=>{
    if(setting?.key===`${ID}.campaign2012Mode`)void bootstrapEmptyWorld().catch(e=>console.warn(`${ID} | world bootstrap`,e));
  });
  Hooks.once('ready',()=>{
    const mod=game.modules?.get?.(ID);
    if(mod) mod.api={...(mod.api||{}),campaignFramework:globalThis.FateToolkitFramework};
    void bootstrapEmptyWorld().catch(e=>console.warn(`${ID} | world bootstrap`,e));
  });
})();
