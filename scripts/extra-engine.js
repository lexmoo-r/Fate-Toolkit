/* Fate Toolkit programmable Extras v1. Config lives on existing Fate Core Official
 * Item/Extra flags; runtime state stays separate from portable definition.
 * Never eval/import executable scripts from pasted definitions. */
(() => {
  const ID='fate-aspect-widget';
  const DEF='extraDefinition';
  const STATE='extraRuntime';
  const MAX_EFFECTS=24;
  const ACTIONS=['any','attack','defend','overcome','create'];
  const KINDS=['rollModifier','will','sceneAspect','status','counter','freeInvoke','removeSceneAspect','removeStatus','branch','tag','skillModifier','fateAction','consequence'];
  const serialQueues=new Map();
  const copy=value=>JSON.parse(JSON.stringify(value));
  const txt=(v,n=200)=>String(v??'').trim().slice(0,n);
  const integer=(v,min=-99,max=99)=>{const n=Number(v);if(!Number.isInteger(n)||n<min||n>max)throw new Error('Некорректное числовое значение дополнения.');return n;};
  const uniqTags=raw=>[...new Set((Array.isArray(raw)?raw:String(raw||'').split(','))
    .map(x=>txt(x,30).toLocaleLowerCase()).filter(x=>/^[\p{L}\p{N}_-]{1,30}$/u.test(x)))].slice(0,12);
  const CONDITION_KINDS=['willAtLeast','willAtMost','hasStatus','missingStatus','counterAtLeast','hasTag','skillAtLeast','sceneIs','always'];
  function normalizeConditions(raw=[]){
    if(!Array.isArray(raw)||raw.length>8)throw new Error('Не более восьми условий.');
    return raw.map(row=>{
      if(!CONDITION_KINDS.includes(row?.kind))throw new Error('Неизвестное условие дополнения.');
      return {kind:row.kind,name:txt(row.name,100),amount:integer(row.amount??0,-99,99)};
    });
  }
  function testConditions(conditions=[],ctx={}){
    return conditions.every(c=>{
      const kind=c.kind,n=c.name.toLocaleLowerCase();
      if(kind==='always')return true;
      if(kind==='willAtLeast')return Number(ctx.will?.current??-1)>=c.amount;
      if(kind==='willAtMost')return Number(ctx.will?.current??999)<=c.amount;
      if(kind==='hasStatus')return (ctx.statuses||[]).some(s=>String(s.name).toLocaleLowerCase()===n);
      if(kind==='missingStatus')return !(ctx.statuses||[]).some(s=>String(s.name).toLocaleLowerCase()===n);
      if(kind==='counterAtLeast')return Number(ctx.counters?.[c.name]||0)>=c.amount;
      if(kind==='hasTag')return (ctx.tags||[]).includes(n);
      if(kind==='skillAtLeast')return Object.values(ctx.actor?.system?.skills||{}).some(s=>String(s.name).toLocaleLowerCase()===n&&Number(s.rank)>=c.amount);
      if(kind==='sceneIs')return ctx.scene===Number(c.amount);
      return false;
    });
  }
  function normalizeEffect(raw={},depth=0) {
    if(depth>3)throw new Error('Слишком глубокая вложенность условий.');
    const kind=txt(raw.kind,30);
    if(!KINDS.includes(kind))throw new Error(`Неизвестный эффект дополнения: ${kind}`);
    const action=ACTIONS.includes(raw.action)?raw.action:'any';
    const name=txt(raw.name,100);
    const skill=txt(raw.skill,100);
    const tags=uniqTags(raw.tags);
    const conditions=normalizeConditions(raw.conditions||[]);
    const trigger=['manual','roll','sceneStart','afterRoll'].includes(raw.trigger)?raw.trigger:'manual';
    const common={conditions,trigger};
    if(kind==='rollModifier'){if(['sceneStart','afterRoll'].includes(trigger))throw new Error('Модификатор броска должен срабатывать при броске, а не после него.');return {kind,amount:integer(raw.amount,-20,20),action,skill,tags,...common};}
    if(kind==='will')return {kind,amount:integer(raw.amount,-12,12),...common};
    if(kind==='sceneAspect'){
      if(!name)throw new Error('Аспекту необходимо название.');
      return {kind,name,freeInvokes:integer(raw.freeInvokes??0,0,10),...common};
    }
    if(kind==='status'){
      if(!name)throw new Error('Состоянию необходимо название.');
      return {kind,name,duration:['permanent','scene','uses'].includes(raw.duration)?raw.duration:'scene',uses:integer(raw.uses??0,0,100),modifier:integer(raw.modifier??0,-20,20),action,skill,tags,...common};
    }
    if(kind==='counter')return {kind,name:name||'Счётчик',amount:integer(raw.amount??1,-99,99),...common};
    if(kind==='freeInvoke'){
      if(!name)throw new Error('Для бесплатных призывов нужно название аспекта сцены.');
      return {kind,name,amount:integer(raw.amount??1,1,10),...common};
    }
    if(kind==='consequence'){
      const track=txt(raw.track,100);
      if(!track||!name)throw new Error('Для последствия укажите ключ трека и название.');
      return {kind,track,name,...common};
    }
    if(kind==='skillModifier'){
      if(!skill)throw new Error('Для временного изменения навыка укажите навык.');
      return {kind,skill,amount:integer(raw.amount,-20,20),action,duration:['scene','permanent','uses'].includes(raw.duration)?raw.duration:'scene',uses:integer(raw.uses??0,0,100),tags,...common};
    }
    if(kind==='fateAction'){
      if(!['attack','defend','overcome','create'].includes(action))throw new Error('Выберите одно из четырёх действий Fate.');
      if(trigger!=='manual')throw new Error('Стандартное действие Fate запускается вручную.');
      return {kind,action,skill,...common};
    }
    if(kind==='removeSceneAspect'||kind==='removeStatus'){
      if(!name)throw new Error('Укажите название удаляемого аспекта или состояния.');
      return {kind,name,...common};
    }
    if(kind==='tag'){
      if(!tags.length)throw new Error('Укажите тег действия.');
      return {kind,tags,duration:raw.duration==='permanent'?'permanent':'scene',...common};
    }
    if(kind==='branch'){
      const then=Array.isArray(raw.then)?raw.then:[],otherwise=Array.isArray(raw.otherwise)?raw.otherwise:[];
      if(then.length>12||otherwise.length>12)throw new Error('Слишком много эффектов в ветке.');
      return {kind,conditions,then:then.map(e=>normalizeEffect(e,depth+1)),otherwise:otherwise.map(e=>normalizeEffect(e,depth+1)),trigger};
    }
  }
  function normalizeDefinition(raw={}) {
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Некорректный формат дополнения.');
    const name=txt(raw.name,100);
    if(!name)throw new Error('Укажите название дополнения.');
    const mode=['active','passive','hybrid'].includes(raw.mode)?raw.mode:'active';
    const effects=Array.isArray(raw.effects)?raw.effects:[];
    if(effects.length>MAX_EFFECTS)throw new Error('В одном дополнении допускается не более 24 эффектов.');
    const willCost=integer(raw.willCost??0,0,12);
    if(mode==='passive'&&willCost)throw new Error('Пассивное дополнение не может требовать оплаты за нажатие.');
    const passiveValid=e=>['rollModifier','status','tag','skillModifier'].includes(e.kind)||
      (e.kind==='branch'&&e.then.every(passiveValid)&&e.otherwise.every(passiveValid));
    if(mode==='passive'&&effects.some(effect=>!passiveValid(effect)))
      throw new Error('Для пассивного дополнения доступны только бонусы бросков и постоянные состояния. Остальные эффекты требуют активации.');
    return {
      format:'faw-extra',schemaVersion:2,
      name,description:txt(raw.description,5000),icon:txt(raw.icon,300),mode,
      willCost,
      usesLimit:integer(raw.usesLimit??0,0,10000),
      cooldown:raw.cooldown==='scene'?'scene':'none',
      conditions:normalizeConditions(raw.conditions||[]),
      tags:uniqTags(raw.tags),
      effects:effects.map(e=>normalizeEffect(e))
    };
  }
  function exportDefinitions(definitions) {
    const list=Array.isArray(definitions)?definitions:[definitions];
    return JSON.stringify({format:'faw-extra-bundle',schemaVersion:2,extras:list.map(normalizeDefinition)},null,2);
  }
  function importDefinitions(value) {
    if(typeof value!=='string'||value.length>250000)throw new Error('Превышен допустимый размер импорта.');
    let obj;try{obj=JSON.parse(value);}catch{throw new Error('Невозможно разобрать JSON дополнения.');}
    const list=obj?.format==='faw-extra-bundle'?obj.extras:(Array.isArray(obj)?obj:[obj]);
    if(!Array.isArray(list)||!list.length||list.length>40)throw new Error('В пакете должно быть от 1 до 40 дополнений.');
    return list.map(normalizeDefinition);
  }
  const definition=item=>{
    const raw=item?.getFlag?.(ID,DEF)??item?.flags?.[ID]?.[DEF];
    if(!raw)return null;
    try{return normalizeDefinition(raw);}catch{return null;}
  };
  const runtime=item=>item?.getFlag?.(ID,STATE)??item?.flags?.[ID]?.[STATE]??{};
  function sceneSerial(){try{return Number(game.settings.get(ID,'campaignSceneSerial'))||0;}catch{return 0;}}
  const statuses=actor=>{
    const rows=actor?.getFlag?.(ID,'extraStatuses')??actor?.flags?.[ID]?.extraStatuses??[];
    const live=(Array.isArray(rows)?rows:[]).filter(r=>(r?.duration==='permanent'||r?.scene===sceneSerial())&&!(r?.duration==='uses'&&r?.usesLeft===0));
    for(const item of Array.from(actor?.items??[])){
      if(item.type!=='Extra'||item.system?.active===false)continue;
      const def=definition(item);
      if(!def||!['passive','hybrid'].includes(def.mode))continue;
      for(const effect of def.effects){
        if(effect.kind==='status'&&(def.mode==='passive'||effect.trigger==='roll'))live.push({name:effect.name,duration:'permanent',source:item.id,passive:true,modifier:effect.modifier,action:effect.action,skill:effect.skill,tags:effect.tags});
        if(effect.kind==='skillModifier'&&(def.mode==='passive'||effect.trigger==='roll'))live.push({name:`${effect.skill} ${effect.amount>=0?'+':''}${effect.amount}`,duration:'permanent',source:item.id,passive:true,modifier:effect.amount,action:effect.action,skill:effect.skill,tags:effect.tags});
        if(effect.kind==='tag'&&def.mode==='passive')live.push({name:effect.tags.join(', '),duration:'permanent',source:item.id,passive:true,actionTags:effect.tags});
      }
    }
    return live;
  };
  const actionMatches=(configured,action)=>configured==='any'||configured===action||(configured==='create'&&action==='caa');
  function rollModifiers(actor,action='any',skill='',extraContext={}) {
    const result=[];
    const active=statuses(actor);
    const contextTags=[...new Set([...(Array.isArray(extraContext.tags)?extraContext.tags:[]),...active.filter(s=>s.actionTags).flatMap(s=>s.actionTags)])];
    const will=globalThis.FateToolkitWill?.details?.(actor);
    const match=e=>actionMatches(e.action,action)&&(!e.skill||e.skill.toLocaleLowerCase()===String(skill).toLocaleLowerCase())
      &&(!e.tags?.length||e.tags.every(tag=>contextTags.includes(tag)));
    const ctx={actor,action,skill,will,statuses:active,counters:{},tags:contextTags,scene:sceneSerial()};
    function visit(effect,itemId,name){
      if(effect.trigger==='sceneStart'||effect.trigger==='afterRoll')return;
      if(effect.kind==='branch'){
        for(const e of (testConditions(effect.conditions,ctx)?effect.then:effect.otherwise))visit(e,itemId,name);
        return;
      }
      if(effect.kind!=='rollModifier'||!match(effect)||!testConditions(effect.conditions,ctx))return;
      result.push({itemId,name,amount:effect.amount});
    }
    for(const item of Array.from(actor?.items??[])) {
      if(item.type!=='Extra'||item.system?.active===false)continue;
      const def=definition(item);
      if(!def||!['passive','hybrid'].includes(def.mode)||!testConditions(def.conditions,ctx))continue;
      ctx.counters=runtime(item).counters||{};
      for(const effect of def.effects)visit(effect,item.id,def.name);
    }
    for(const status of active){
      if(!Number(status.modifier)||!match(status))continue;
      result.push({itemId:status.source,name:status.name,amount:Number(status.modifier)});
    }
    return result;
  }
  const rollBonus=(actor,action,skill,context)=>rollModifiers(actor,action,skill,context).reduce((sum,e)=>sum+e.amount,0);
  function usableBy(user,actor){return Boolean(user?.isGM||actor?.testUserPermission?.(user,'OWNER'));}
  function sequence(key,fn){const prev=serialQueues.get(key)||Promise.resolve();const next=prev.catch(()=>{}).then(fn);serialQueues.set(key,next);void next.finally(()=>{if(serialQueues.get(key)===next)serialQueues.delete(key);}).catch(()=>{});return next;}
  async function useHandler(payload={}, {senderId}={}) {
    const user=game.users?.get?.(String(senderId||''));
    if(!user)throw new Error('Отправитель не определён.');
    const actor=await fromUuid(txt(payload.actorUuid,300));
    if(!actor||actor.type!=='fate-core-official'||!usableBy(user,actor))throw new Error('Нет прав на этого персонажа.');
    const item=actor.items?.get?.(txt(payload.itemId,80));
    if(!item||item.type!=='Extra'||item.system?.active===false)throw new Error('Дополнение недоступно.');
    const def=definition(item);
    if(!def||(def.mode==='passive'&&!['sceneStart','afterRoll'].includes(payload.trigger)))throw new Error('Это дополнение не активируется вручную.');
    const triggerMode=(payload.trigger==='sceneStart'||payload.trigger==='afterRoll')&&user.isGM?payload.trigger:'manual';
    const eventId=txt(payload.eventId,100);
    if(!eventId)throw new Error('Нужен идентификатор применения.');
    return sequence(`actor:${actor.uuid}`,async()=>{
      const before=runtime(item);
      if((before.recent||[]).includes(eventId))return {ok:true,duplicate:true};
      const will=globalThis.FateToolkitWill?.details?.(actor);
      if(triggerMode==='manual'&&def.usesLimit&&Number(before.uses||0)>=def.usesLimit)throw new Error('Лимит использований дополнения исчерпан.');
      if(triggerMode==='manual'&&def.cooldown==='scene'&&before.lastScene===sceneSerial()&&Number(before.uses||0)>0)throw new Error('Дополнение уже использована в этой сцене.');
      const context={actor,will,statuses:statuses(actor),counters:before.counters||{},tags:def.tags,scene:sceneSerial()};
      if(!testConditions(def.conditions,context)){if(triggerMode!=='manual')return {ok:true,skipped:true};throw new Error('Условия использования дополнения не выполнены.');}
      const selected=[];
      const gather=effect=>{
        if(effect.kind==='branch'){
          for(const nested of (testConditions(effect.conditions,context)?effect.then:effect.otherwise))gather(nested);
          return;
        }
        if(effect.trigger!==triggerMode||!testConditions(effect.conditions,context))return;
        selected.push(effect);
      };
      def.effects.forEach(gather);
      if(triggerMode!=='manual'&&!selected.length)return {ok:true,skipped:true};
      if(triggerMode==='manual'&&!selected.length&&def.effects.length)throw new Error('Нет применимых эффектов для ручного использования.');
      const cost=triggerMode==='manual'?def.willCost:0;
      if(cost&&(!globalThis.FateToolkitWill?.enabled?.()||!will?.configured||will.current<cost))throw new Error('Недостаточно Воли.');
      const willDelta=selected.filter(e=>e.kind==='will').reduce((sum,e)=>sum+e.amount,0)-cost;
      if(willDelta&&(!globalThis.FateToolkitWill?.enabled?.()||!will?.configured))throw new Error('Сначала настройте Волю.');
      const nextWill=will?Math.max(0,Math.min(will.max,will.current+willDelta)):null;
      const appliedWillDelta=will?nextWill-will.current:0;
      // Running effects is GM-authoritative; unsupported effects are rejected before mutation.
      const scene=game.scenes?.viewed||canvas?.scene;
      const needsScene=selected.some(e=>['sceneAspect','freeInvoke','removeSceneAspect'].includes(e.kind));
      if(needsScene&&!scene)throw new Error('Для аспектов нужна открытая сцена.');
      const consequenceEffects=selected.filter(e=>e.kind==='consequence');
      const trackUpdates={};
      const oldTracks={};
      if(new Set(consequenceEffects.map(e=>e.track)).size!==consequenceEffects.length)throw new Error('Один и тот же трек нельзя занять дважды.');
      for(const effect of consequenceEffects){
        const track=actor.system?.tracks?.[effect.track];
        if(!track||track.enabled===false||!track.aspect?.when_marked)throw new Error('Трек последствия отсутствует или недоступен.');
        if(String(track.aspect.name||'').trim()||(track.box_values||[]).some(Boolean))throw new Error('Выбранное последствие уже занято.');
        oldTracks[effect.track]=copy(track);
        trackUpdates[`system.tracks.${effect.track}.aspect.name`]=effect.name;
        const boxes=Array.isArray(track.box_values)?[...track.box_values]:[];
        if(boxes.length){boxes[0]=true;trackUpdates[`system.tracks.${effect.track}.box_values`]=boxes;}
      }
      if(consequenceEffects.length&&!user.isGM){
        const confirmed=await foundry.applications.api.DialogV2.confirm({window:{title:'Дополнение: последствие'},content:`<p>${String(actor.name).replace(/[&<>"']/g,'')}: ${consequenceEffects.map(e=>String(e.name).replace(/[&<>"']/g,'')).join(', ')}</p><p>Подтвердить применение последствий из дополнения?</p>`,rejectClose:false});
        if(!confirmed)throw new Error('Последствие не подтверждено ведущим.');
      }
      const oldScene=needsScene?copy(scene.getFlag('fate-core-official','situation_aspects')||[]):null;
      const newScene=oldScene?copy(oldScene):null;
      let newStatuses=copy(actor.getFlag?.(ID,'extraStatuses')||[]).filter(r=>r.duration==='permanent'||r.scene===sceneSerial());
      const counters={...(before.counters||{})};
      for(const effect of selected){
        if(effect.kind==='sceneAspect')newScene.push({name:effect.name,free_invokes:effect.freeInvokes,_faw_id:foundry.utils.randomID()});
        if(effect.kind==='freeInvoke'){
          const match=newScene.find(row=>String(row.name||'').toLocaleLowerCase()===effect.name.toLocaleLowerCase());
          if(!match)throw new Error(`Не найден аспект сцены «${effect.name}».`);
          match.free_invokes=Math.max(0,Number(match.free_invokes||0)+effect.amount);
        }
        if(effect.kind==='removeSceneAspect'){
          const at=newScene.findIndex(row=>String(row.name||'').toLocaleLowerCase()===effect.name.toLocaleLowerCase());
          if(at>=0)newScene.splice(at,1);
        }
        if(effect.kind==='status')newStatuses.push({name:effect.name,duration:effect.duration,usesLeft:effect.uses||0,modifier:effect.modifier,action:effect.action,skill:effect.skill,tags:effect.tags,scene:sceneSerial(),source:item.id,id:foundry.utils.randomID()});
        if(effect.kind==='removeStatus')newStatuses=newStatuses.filter(row=>String(row.name||'').toLocaleLowerCase()!==effect.name.toLocaleLowerCase());
        if(effect.kind==='tag')newStatuses.push({name:effect.tags.join(', '),actionTags:effect.tags,duration:effect.duration,scene:sceneSerial(),source:item.id,id:foundry.utils.randomID()});
        if(effect.kind==='skillModifier')newStatuses.push({name:`${effect.skill} ${effect.amount>=0?'+':''}${effect.amount}`,duration:effect.duration,usesLeft:effect.uses||0,modifier:effect.amount,action:effect.action,skill:effect.skill,tags:effect.tags,scene:sceneSerial(),source:item.id,id:foundry.utils.randomID()});
        if(effect.kind==='counter')counters[effect.name]=Math.max(0,Number(counters[effect.name]||0)+effect.amount);
      }
      // Persist in sequence, with rollback if a later document update fails.
      const state={...before,counters,recent:[...(before.recent||[]).filter(x=>x!==eventId),eventId].slice(-60),uses:Number(before.uses||0)+1,lastScene:sceneSerial()};
      const oldWill=actor.system?.details?.fatePoints?.current;
      const oldStatuses=actor.getFlag?.(ID,'extraStatuses')||[];
      try {
        if(newScene)await scene.setFlag('fate-core-official','situation_aspects',newScene);
        if(willDelta||Object.keys(trackUpdates).length||JSON.stringify(newStatuses)!==JSON.stringify(oldStatuses)) {
          const update={...trackUpdates};
          if(willDelta)update['system.details.fatePoints.current']=nextWill;
          if(JSON.stringify(newStatuses)!==JSON.stringify(oldStatuses))update[`flags.${ID}.extraStatuses`]=newStatuses;
          await actor.update(update);
        }
        await item.setFlag(ID,STATE,state);
      } catch(error) {
        try{if(newScene)await scene.setFlag('fate-core-official','situation_aspects',oldScene);}catch{}
        try{
          const revert={};
          if(willDelta)revert['system.details.fatePoints.current']=oldWill;
          revert[`flags.${ID}.extraStatuses`]=oldStatuses;
          for(const [track,old] of Object.entries(oldTracks))revert[`system.tracks.${track}`]=old;
          await actor.update(revert);
        }catch{}
        throw error;
      }
      const text=x=>String(x).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
      try{await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),content:`<p><b>${text(actor.name)}</b>: ${text(def.name)} · ${willDelta?`${appliedWillDelta>0?'+':''}${appliedWillDelta} Воли`:'активация'}${newStatuses.filter(s=>s.source===item.id).length?' · состояние применено':''}</p>`});}catch{}
      return {ok:true,willBefore:will?.current,willAfter:nextWill,uses:state.uses,fateAction:selected.find(e=>e.kind==='fateAction')?.action||null};
    });
  }
  async function consumeRoll(actor,action,skill,eventId) {
    if(!game.user?.isGM||!actor?.uuid||!eventId)return false;
    return sequence(`actor:${actor.uuid}`,async()=>{
      const past=actor.getFlag?.(ID,'extraRollEvents')||[];
      if(past.includes(eventId))return false;
      const all=actor.getFlag?.(ID,'extraStatuses')||[];
      const rows=copy(all);
      let changed=false;
      for(const status of rows){
        if(status.duration!=='uses'||status.scene!==sceneSerial())continue;
        if(!actionMatches(status.action||'any',action))continue;
        if(status.skill&&String(status.skill).toLocaleLowerCase()!==String(skill).toLocaleLowerCase())continue;
        if(!status.modifier&&!status.actionTags?.length)continue;
        status.usesLeft=Math.max(0,Number(status.usesLeft||0)-1);changed=true;
      }
      const update={[`flags.${ID}.extraRollEvents`]:[...past,eventId].slice(-100)};
      if(changed)update[`flags.${ID}.extraStatuses`]=rows.filter(s=>s.duration!=='uses'||s.usesLeft>0);
      await actor.update(update);
      return changed;
    });
  }
  const use=async(actor,item)=>{
    const result=await globalThis.FateToolkitRPC.executeAsGM('extraUse',{actorUuid:actor?.uuid,itemId:item?.id,eventId:foundry.utils.randomID()});
    if(result?.ok&&!result.duplicate&&result.fateAction){
      const api=game.modules?.get(ID)?.api;
      if(typeof api?.initiateActionAtTarget==='function'){
        const target=canvas?.tokens?.targets?.first?.()||Array.from(canvas?.tokens?.targets||[])[0];
        const token=Array.from(canvas?.tokens?.placeables||[]).find(t=>t.actor?.uuid===actor?.uuid);
        try{await api.initiateActionAtTarget(result.fateAction,token?`token:${token.id}`:`actor:${actor?.id}`,target?`token:${target.id}`:null);}
        catch(error){ui.notifications?.error?.(`Не удалось открыть действие Fate: ${error?.message||error}`);}
      }
    }
    return result;
  };
  const api=Object.freeze({normalizeDefinition,normalizeEffect,normalizeConditions,testConditions,definition,runtime,rollModifiers,rollBonus,exportDefinitions,importDefinitions,statuses,consumeRoll,processAfterRoll,use,useHandler,kinds:KINDS,conditionKinds:CONDITION_KINDS});
  globalThis.FateToolkitExtras=api;
  globalThis.FateToolkitRPC?.register?.('extraUse',useHandler);
  async function processAfterRoll(actor,messageId){
    if(!game.user?.isGM||!actor?.uuid||!messageId)return;
    if(game.users?.activeGM&&game.users.activeGM.id!==game.user.id)return;
    for(const item of Array.from(actor.items||[])){
      const def=definition(item);
      if(item.type!=='Extra'||item.system?.active===false||!def)continue;
      const matches=e=>e.trigger==='afterRoll'||(e.kind==='branch'&&[...e.then,...e.otherwise].some(matches));
      if(!def.effects.some(matches))continue;
      const id=`afterRoll:${messageId}:${item.id}`;
      try{await useHandler({actorUuid:actor.uuid,itemId:item.id,eventId:id,trigger:'afterRoll'},{senderId:game.user.id});}
      catch(error){console.warn(`${ID} | Post-roll Extra error ${item.name}`,error);}
    }
  }
  async function processSceneStart(){
    if(!game.user?.isGM || !globalThis.FateToolkitWill?.enabled?.())return;
    if(game.users?.activeGM&&game.users.activeGM.id!==game.user.id)return;
    const actors=new Map();
    for(const token of (canvas?.tokens?.placeables||[])){
      if(token.actor?.type==='fate-core-official')actors.set(token.actor.uuid,token.actor);
    }
    for(const actor of actors.values()){
      for(const item of Array.from(actor.items||[])){
        const def=definition(item);
        if(item.type!=='Extra'||item.system?.active===false||!def)continue;
        const effectHasTrigger=e=>e.trigger==='sceneStart'||(e.kind==='branch'&&[...e.then,...e.otherwise].some(effectHasTrigger));
        if(!def.effects.some(effectHasTrigger))continue;
        const id=`scene:${sceneSerial()}:${item.id}`;
        try{await useHandler({actorUuid:actor.uuid,itemId:item.id,eventId:id,trigger:'sceneStart'},{senderId:game.user.id});}
        catch(error){console.warn(`${ID} | Не удалось обработать сценовое дополнение ${item.name}`,error);}
      }
    }
  }
  Hooks.on?.('updateSetting',setting=>{
    if(setting?.key===`${ID}.campaignSceneSerial`)void processSceneStart();
  });

  Hooks.once('ready',()=>{const mod=game.modules?.get(ID);if(mod)mod.api={...(mod.api||{}),extras:api};});
})();
