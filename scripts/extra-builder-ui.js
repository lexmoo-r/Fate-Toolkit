/* Foundry V13 Extra builder. Uses the existing Extra Item as source of truth. */
(() => {
  const ID='fate-aspect-widget';
  const h=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const engine=()=>globalThis.FateToolkitExtras;
  const dialog=()=>foundry.applications.api.DialogV2;
  const effectOptions={rollModifier:'Бонус / штраф к броску',will:'Изменить Волю',sceneAspect:'Создать аспект сцены',freeInvoke:'Добавить свободные призывы',status:'Создать временное состояние',counter:'Изменить счётчик',removeSceneAspect:'Удалить аспект сцены',removeStatus:'Снять состояние',tag:'Присвоить тег действию',skillModifier:'Временный бонус навыка',fateAction:'Запустить действие Fate',consequence:'Получить последствие',branch:'Развилка: если / иначе'};
  const conditionOptions={always:'Всегда',willAtLeast:'Воли не меньше',willAtMost:'Воли не больше',hasStatus:'Есть состояние',missingStatus:'Нет состояния',counterAtLeast:'Счётчик не меньше',hasTag:'Есть тег',skillAtLeast:'Навык не меньше',sceneIs:'Номер сцены'};
  const actionOptions={any:'Любое',attack:'Атака',defend:'Защита',overcome:'Преодоление',create:'Создание преимущества'};
  const triggerOptions={manual:'При активации',roll:'При броске',sceneStart:'При начале сцены',afterRoll:'После завершённого броска'};
  const modeOptions={active:'Активная',passive:'Пассивная',hybrid:'Комбинированная'};
  const options=(choices,value)=>Object.entries(choices).map(([key,label])=>`<option value="${h(key)}" ${key===value?'selected':''}>${h(label)}</option>`).join('');
  // The full schema is never destructively filtered: only relevant editor
  // controls are visible. Hidden controls retain values on reopen/import.
  const visibleEffectFields={
    rollModifier:['amount','action','skill','tags','trigger','duration','uses'],
    will:['amount','trigger'],sceneAspect:['effectName','amount','trigger'],
    freeInvoke:['effectName','amount','trigger'],status:['effectName','modifier','action','skill','tags','duration','uses','trigger'],
    counter:['effectName','amount','trigger'],removeSceneAspect:['effectName','trigger'],
    removeStatus:['effectName','trigger'],tag:['tags','duration','trigger'],
    skillModifier:['skill','amount','action','tags','duration','uses','trigger'],
    fateAction:['action','skill','trigger'],consequence:['track','effectName','trigger'],
    branch:['trigger']
  };
  function syncEffectEditor(fieldset){
    if(!fieldset)return;
    const type=fieldset.querySelector(':scope > .faw-extra-effect-fields [name="kind"]')?.value||'rollModifier';
    const show=new Set(visibleEffectFields[type]||[]);
    for(const field of fieldset.querySelectorAll(':scope > .faw-extra-effect-fields [data-effect-param]')){
      field.hidden=!show.has(field.dataset.effectParam);
    }
    fieldset.querySelector(':scope > [data-branch-parts]')?.classList.toggle('faw-extra-branch-hidden',type!=='branch');
    const title=fieldset.querySelector(':scope > legend [data-effect-kind-title]');
    if(title)title.textContent=effectOptions[type]||'Эффект';
  }
  function conditionRow(condition={}) {
    return `<div class="faw-extra-condition" data-extra-condition><label>Если <select name="conditionKind">${options(conditionOptions,condition.kind||'always')}</select></label><label>Название / тег / навык<input name="conditionName" value="${h(condition.name||'')}"></label><label>Число<input type="number" min="-99" max="99" name="conditionAmount" value="${h(condition.amount??0)}"></label><button type="button" data-remove-condition title="Убрать условие">×</button></div>`;
  }
  function conditionBlock(conditions=[]){return `<details class="faw-extra-conditions" ${conditions.length?'open':''}><summary>Условия (${conditions.length||0})</summary><div data-conditions>${conditions.map(conditionRow).join('')}</div><button type="button" data-add-condition>Добавить условие</button></details>`;}
  function effectRow(effect={},i=0,depth=0) {
    const nested=effect.kind==='branch';
    return `<fieldset class="faw-extra-effect" data-faw-effect><legend>Эффект <span data-number>${i+1}</span> · <span data-effect-kind-title>${h(effectOptions[effect.kind]||'Бонус / штраф к броску')}</span> <button type="button" data-remove-effect title="Удалить">×</button></legend>
    <div class="faw-extra-effect-fields">
    <label>Механика<select name="kind">${options(effectOptions,effect.kind||'rollModifier')}</select></label>
    <label data-effect-param="amount">Величина<input name="amount" type="number" min="-99" max="99" value="${h(effect.amount??effect.freeInvokes??1)}"></label>
    <label data-effect-param="track">Последствие<input name="track" value="${h(effect.track||'')}" placeholder="например mild"></label>
    <label data-effect-param="effectName">Название аспекта / состояния<input name="effectName" value="${h(effect.name||'')}"></label>
    <label data-effect-param="action">Действие Fate<select name="action">${options(actionOptions,effect.action||'any')}</select></label>
    <label data-effect-param="skill">Навык (необязательно)<input name="skill" value="${h(effect.skill||'')}"></label>
    <label data-effect-param="tags">Теги (необязательно)<input name="tags" value="${h((effect.tags||[]).join(', '))}" placeholder="магия, огонь"></label>
    <label data-effect-param="trigger">Срабатывает<select name="trigger">${options(triggerOptions,effect.trigger||'manual')}</select></label>
    <label data-effect-param="duration">Длительность<select name="duration"><option value="scene" ${!['permanent','uses'].includes(effect.duration)?'selected':''}>До конца сцены</option><option value="uses" ${effect.duration==='uses'?'selected':''}>По числу применений</option><option value="permanent" ${effect.duration==='permanent'?'selected':''}>Пока не снято</option></select></label>
    <label data-effect-param="uses">Число применений<input type="number" min="0" max="100" name="uses" value="${h(effect.uses??0)}"></label>
    <label data-effect-param="modifier">Бонус состояния<input type="number" min="-20" max="20" name="modifier" value="${h(effect.modifier??0)}"></label>
    </div>
    ${conditionBlock(effect.conditions||[])}
    ${depth<3?`<div class="faw-extra-branch ${nested?'':'faw-extra-branch-hidden'}" data-branch-parts><div><strong>Если условия выполняются</strong><div data-branch-then>${(effect.then||[]).map((e,i)=>effectRow(e,i,depth+1)).join('')}</div><button type="button" data-add-branch="then">Добавить операцию</button></div><div><strong>Иначе</strong><div data-branch-otherwise>${(effect.otherwise||[]).map((e,i)=>effectRow(e,i,depth+1)).join('')}</div><button type="button" data-add-branch="otherwise">Добавить операцию</button></div></div>`:''}
    </fieldset>`;
  }
  const field=(parent,name)=>parent.querySelector(`:scope > .faw-extra-effect-fields [name="${name}"]`)?.value??'';
  function readConditions(container){return [...(container?.children||[])].filter(el=>el.matches('[data-extra-condition]')).map(el=>({kind:el.querySelector('[name="conditionKind"]')?.value||'always',name:el.querySelector('[name="conditionName"]')?.value||'',amount:Number(el.querySelector('[name="conditionAmount"]')?.value||0)}));}
  function asEffect(fieldset){
    const kind=field(fieldset,'kind');
    const root=fieldset.querySelector(':scope > .faw-extra-conditions > [data-conditions]');
    const common={kind,conditions:readConditions(root),trigger:field(fieldset,'trigger')};
    if(kind==='branch')return {...common,then:readEffects(fieldset.querySelector(':scope > [data-branch-parts] [data-branch-then]')),otherwise:readEffects(fieldset.querySelector(':scope > [data-branch-parts] [data-branch-otherwise]'))};
    const amount=Number(field(fieldset,'amount'));
    return {...common,amount,name:field(fieldset,'effectName'),track:field(fieldset,'track'),action:field(fieldset,'action'),skill:field(fieldset,'skill'),tags:field(fieldset,'tags'),duration:field(fieldset,'duration'),uses:Number(field(fieldset,'uses')),modifier:Number(field(fieldset,'modifier')),freeInvokes:Math.max(0,amount)};
  }
  function readEffects(node){return [...(node?.children||[])].filter(e=>e.matches('[data-faw-effect]')).map(asEffect);}
  async function edit(item) {
    if(!item?.parent?.isOwner || !game.user?.isGM)throw new Error('Редактировать механику дополнения может только мастер.');
    const old=engine().definition(item)||{name:item.name,description:item.system?.description?.value||'',icon:item.img||'',mode:'active',willCost:0,tags:[],effects:[]};
    const content=`<form class="faw-extra-builder" autocomplete="off">
    <p class="faw-extra-hint">Настройте дополнение. Его навыки, аспекты и трюки сохраняются. Сложные механики доступны ниже.</p>
    <div class="faw-extra-base">
     <label>Название<input name="name" required maxlength="100" value="${h(old.name)}"></label>
     <div class="faw-extra-icon-picker"><span>Иконка дополнения</span><div class="faw-extra-icon-preview"><img data-extra-icon-preview src="${h(old.icon||item.img||'icons/svg/upgrade.svg')}" alt="Иконка"><div><button type="button" data-pick-extra-icon><i class="fa-solid fa-image" aria-hidden="true"></i> Выбрать изображение</button><button type="button" data-clear-extra-icon>Очистить</button></div></div><input type="hidden" name="icon" value="${h(old.icon||'')}"></div>
     <label>Тип<select name="mode">${options(modeOptions,old.mode)}</select></label>
     <label>Стоимость активации, Воля<input name="willCost" type="number" min="0" max="12" value="${h(old.willCost??0)}"></label>
     
     <label class="faw-extra-full">Описание<textarea name="description" rows="7">${h(old.description)}</textarea></label>
    </div>
    <details class="faw-extra-advanced faw-extra-settings"><summary>Дополнительные ограничения и теги</summary>
      <div class="faw-extra-base"><label>Лимит применений (0 — без лимита)<input name="usesLimit" type="number" min="0" max="10000" value="${h(old.usesLimit??0)}"></label>
      <label>Повторное применение<select name="cooldown"><option value="none" ${old.cooldown!=='scene'?'selected':''}>Без ограничения</option><option value="scene" ${old.cooldown==='scene'?'selected':''}>Раз за повествовательную сцену</option></select></label>
      <label class="faw-extra-full">Теги дополнения<input name="tags" value="${h((old.tags||[]).join(', '))}" placeholder="Необязательно"></label></div>
      ${conditionBlock(old.conditions||[])}
    </details>
    <details class="faw-extra-advanced" ${old.effects?.length>0?'open':''}><summary>Механические эффекты (${old.effects?.length||0})</summary>
     <div data-effects>${(old.effects||[]).map(effectRow).join('')}</div>
     <button type="button" data-add-effect><i class="fa-solid fa-plus" aria-hidden="true"></i> Добавить эффект</button>
    </details>
    <p class="faw-extra-hint">Пассивные бонусы учитываются автоматически в бросках Fate Toolkit. Теги не обязательны; эффект с неизвестными тегами не применяется автоматически. Активные операции выполняет мастер через защищённый запрос.</p>
    </form>`;
    const result=await dialog().wait({
      window:{title:`Конструктор дополнений — ${item.name}`,resizable:true},content,
      buttons:[
        {action:'cancel',label:'Отмена',callback:()=>null},
        {action:'save',label:'Сохранить дополнение',default:true,callback:(_event,button)=>{
          const root=button.form;
          const val=name=>root.querySelector(`[name="${name}"]`)?.value??'';
          try{return engine().normalizeDefinition({
            name:val('name'),icon:val('icon'),description:val('description'),mode:val('mode'),willCost:Number(val('willCost')),
            tags:val('tags'),usesLimit:Number(val('usesLimit')),cooldown:val('cooldown'),conditions:readConditions(root.querySelector('.faw-extra-settings > .faw-extra-conditions > [data-conditions]')),effects:readEffects(root.querySelector('[data-effects]'))
          });}catch(error){ui.notifications.error(String(error.message||error));return null;}
        }}
      ],
      render:(_event,app)=>{
        const root=app.element;
        root?.querySelectorAll('[data-faw-effect]').forEach(syncEffectEditor);
        root?.addEventListener('change',event=>{
          if(event.target.matches('[name="kind"]')){
            const fieldset=event.target.closest('[data-faw-effect]');
            syncEffectEditor(fieldset);
          }
        });
        root?.addEventListener('click',event=>{
          const btn=event.target.closest('button');if(!btn)return;
          if(btn.hasAttribute('data-pick-extra-icon')){
            const FilePickerClass=foundry?.applications?.apps?.FilePicker?.implementation || foundry?.applications?.apps?.FilePicker || globalThis.FilePicker;
            if(!FilePickerClass)return ui.notifications.warn('Проводник изображений Foundry недоступен.');
            const input=root.querySelector('[name="icon"]');
            const current=input?.value||item.img||'';
            new FilePickerClass({type:'image',current,callback:path=>{
              if(input)input.value=path;
              const preview=root.querySelector('[data-extra-icon-preview]');if(preview)preview.src=path;
            }}).render(true);
            return;
          }
          if(btn.hasAttribute('data-clear-extra-icon')){
            const input=root.querySelector('[name="icon"]');if(input)input.value='';
            const preview=root.querySelector('[data-extra-icon-preview]');if(preview)preview.src='icons/svg/upgrade.svg';return;
          }
          if(btn.hasAttribute('data-remove-effect')){btn.closest('[data-faw-effect]')?.remove();return;}
          if(btn.hasAttribute('data-remove-condition')){btn.closest('[data-extra-condition]')?.remove();return;}
          if(btn.hasAttribute('data-add-condition')){
            const container=btn.closest('.faw-extra-conditions')?.querySelector('[data-conditions]');
            if(!container||container.children.length>=8)return ui.notifications.warn('Не более восьми условий.');
            const holder=document.createElement('div');holder.innerHTML=conditionRow();container.append(holder.firstElementChild);return;
          }
          if(btn.hasAttribute('data-add-effect')||btn.hasAttribute('data-add-branch')){
            const branch=btn.getAttribute('data-add-branch');
            const container=branch?btn.parentElement.querySelector(`[data-branch-${branch}]`):root.querySelector('[data-effects]');
            if(!container||container.children.length>=(branch?12:24))return ui.notifications.warn('Достигнут лимит эффектов.');
            const depth=branch?btn.closest('[data-faw-effect]').querySelectorAll('[data-branch-parts]').length:0;
            const holder=document.createElement('div');holder.innerHTML=effectRow({},container.children.length,depth);container.append(holder.firstElementChild);
            syncEffectEditor(container.lastElementChild);
            container.closest('.faw-extra-advanced')?.setAttribute('open','');
          }
        });
      }
    });
    if(!result)return null;
    await item.update({name:result.name, 'system.description.value':result.description,...(result.icon?{img:result.icon}:{})});
    await item.setFlag(ID,'extraDefinition',result);
    return result;
  }
  async function importToActor(actor) {
    if(!actor?.isOwner || !game.user?.isGM)throw new Error('Импортировать механические дополнения может только мастер.');
    const text=await dialog().wait({window:{title:'Импорт дополнений (JSON)',resizable:true},
      content:`<form class="faw-extra-import"><p>Вставьте одно дополнение или набор из нескольких. Состояния и использованные заряды не импортируются.</p><textarea name="json" rows="14" placeholder="Вставьте JSON"></textarea><label>Или выберите файл .json <input type="file" accept=".json,application/json" data-extra-file></label></form>`,
      buttons:[{action:'cancel',label:'Отмена',callback:()=>null},{action:'save',label:'Импортировать',default:true,callback:(_event,button)=>button.form.querySelector('textarea[name="json"]')?.value||''}],
      render:(_event,app)=>{app.element?.querySelector('[data-extra-file]')?.addEventListener('change',async event=>{
        const file=event.target.files?.[0];if(!file)return;
        if(file.size>250000)return ui.notifications.error('Файл слишком большой.');
        app.element.querySelector('textarea[name="json"]').value=await file.text();
      });}
    });
    if(!text)return 0;
    const definitions=engine().importDefinitions(text);
    const preview=definitions.map(d=>`<li>${h(d.name)} · ${d.effects.length} эффектов</li>`).join('');
    const accept=await dialog().confirm({window:{title:'Подтвердить импорт'},content:`<p>Будут добавлены <b>${definitions.length}</b> новые дополнения (старые не затрагиваются):</p><ul>${preview}</ul>`,rejectClose:false});
    if(!accept)return 0;
    const rows=definitions.map(def=>({name:def.name,type:'Extra',...(def.icon?{img:def.icon}:{}),flags:{[ID]:{extraDefinition:def}},system:{active:true}}));
    await actor.createEmbeddedDocuments('Item',rows);
    return rows.length;
  }
  async function exportFromActor(actor,item=null) {
    const extras=(item?[item]:Array.from(actor?.items||[])).map(it=>engine().definition(it)).filter(Boolean);
    if(!extras.length)return ui.notifications.warn('Нет дополнений, созданных конструктором.');
    const json=engine().exportDefinitions(extras);
    await dialog().prompt({window:{title:'Экспорт дополнений (JSON)'},content:`<form><p>Скопируйте конфигурацию. Текущее состояние, заряды и персонаж не входят в экспорт.</p><textarea readonly rows="16" autofocus>${h(json)}</textarea></form>`,ok:{label:'Закрыть'}});
    return json;
  }
  async function activate(actor,item) {
    try{return await engine().use(actor,item);}catch(error){ui.notifications.error(String(error?.message||error));return null;}
  }
  function installHotbarDrop(){
    Hooks.on('hotbarDrop',async (_bar,data,slot)=>{
      if(data?.type!=='FawExtra')return;
      try{
        const actor=await fromUuid(data.actorUuid);const item=actor?.items?.get?.(String(data.itemId||''));
        if(!actor?.isOwner||!engine().definition(item))throw new Error('Дополнение недоступно.');
        const command=`await game.modules.get('fate-aspect-widget').api.extras.use(await fromUuid(${JSON.stringify(actor.uuid)}),(await fromUuid(${JSON.stringify(actor.uuid)})).items.get(${JSON.stringify(item.id)}));`;
        const macro=await Macro.create({name:item.name,img:item.img||'icons/svg/upgrade.svg',type:'script',scope:'global',command});
        await game.user.assignHotbarMacro(macro,slot);
      }catch(error){ui.notifications.error(String(error.message||error));}
      return false;
    });
  }
  // Shared world library of portable definitions. No per-actor counters in library.
  function library(){const rows=game.settings.get(ID,'extraLibrary')||[];return Array.isArray(rows)?rows:[];}
  async function saveToLibrary(item){
    if(!game.user?.isGM)throw new Error('Библиотека доступна ведущему.');
    const def=engine().definition(item);
    if(!def)throw new Error('Сначала настройте дополнение в конструкторе.');
    const rows=library();const index=rows.findIndex(row=>row.name.toLocaleLowerCase()===def.name.toLocaleLowerCase());
    if(index>=0){
      const confirmed=await dialog().confirm({window:{title:'Обновить шаблон?'},content:`Заменить в библиотеке шаблон «${h(def.name)}»?`,rejectClose:false});
      if(!confirmed)return false;
      rows[index]=def;
    }else rows.push(def);
    if(rows.length>200)throw new Error('В библиотеке не может быть больше 200 шаблонов.');
    await game.settings.set(ID,'extraLibrary',rows);
    return true;
  }
  async function openLibrary(actor){
    if(!game.user?.isGM||!actor?.isOwner)throw new Error('Библиотека доступна ведущему.');
    const rows=library();
    const list=rows.map((def,i)=>`<label class="faw-extra-library-item"><input type="checkbox" value="${i}"><strong>${h(def.name)}</strong> <small>${h(def.mode)} · ${(def.effects||[]).length} эффектов</small></label>`).join('');
    const choice=await dialog().wait({window:{title:'Библиотека дополнений',resizable:true},content:`<form class="faw-extra-library"><p>Шаблоны доступны всем персонажам мира. Копируются правила, но не счётчики и не текущее состояние.</p><div class="faw-extra-library-list">${list||'<p>Библиотека пуста. Сохраните настроенное дополнение из анкеты.</p>'}</div></form>`,buttons:[
      {action:'cancel',label:'Закрыть',callback:()=>null},
      {action:'export',label:'Экспорт выбранных',callback:(_e,b)=>({command:'export',selected:[...b.form.querySelectorAll('input:checked')].map(n=>Number(n.value))})},
      {action:'import',label:'Выдать персонажу',default:true,callback:(_e,b)=>({command:'import',selected:[...b.form.querySelectorAll('input:checked')].map(n=>Number(n.value))})}
    ]});
    if(!choice)return 0;
    const defs=choice.selected.map(i=>rows[i]).filter(Boolean).map(d=>engine().normalizeDefinition(d));
    if(!defs.length)return 0;
    if(choice.command==='export'){
      const json=engine().exportDefinitions(defs);
      await dialog().prompt({window:{title:'Копировать набор дополнений'},content:`<form><textarea rows="16" readonly>${h(json)}</textarea></form>`,ok:{label:'Закрыть'}});
      return defs.length;
    }
    const confirmed=await dialog().confirm({window:{title:'Выдать дополнения'},content:`Добавить ${defs.length} дополнений персонажу ${h(actor.name)}?`,rejectClose:false});
    if(!confirmed)return 0;
    await actor.createEmbeddedDocuments('Item',defs.map(def=>({name:def.name,type:'Extra',img:def.icon||'icons/svg/upgrade.svg',system:{active:true},flags:{[ID]:{extraDefinition:def}}})));
    return defs.length;
  }
  Hooks.once('init',()=>game.settings.register(ID,'extraLibrary',{name:'Библиотека шаблонов дополнен',scope:'world',config:false,type:Array,default:[]}));
  async function openForActor(actor) {
    if (!actor?.isOwner) throw new Error('Нет доступа к дополнениям персонажа.');
    const rows=Array.from(actor.items||[]).filter(item=>item.type==='Extra');
    const content=`<form class="faw-extra-picker"><p>Выберите дополнение для редактирования или создайте новое.</p><select name="item">${rows.map(item=>`<option value="${h(item.id)}">${h(item.name)}</option>`).join('')}</select></form>`;
    const answer=await dialog().wait({window:{title:'Дополнения персонажа'},content,buttons:[
      {action:'cancel',label:'Закрыть',callback:()=>null},
      {action:'create',label:'Создать',callback:()=>({create:true})},
      {action:'edit',label:'Редактировать',default:true,callback:(_ev,button)=>({id:button.form?.elements?.item?.value})}
    ]});
    if(!answer)return;
    if(!game.user?.isGM)return ui.notifications.warn('Создание и редактирование механики дополнений доступно ведущему.');
    if(answer.create){const [item]=await actor.createEmbeddedDocuments('Item',[{name:'Новое дополнение',type:'Extra',system:{active:true}}]);if(item)return edit(item);}
    else {const item=actor.items?.get(answer.id);if(item)return edit(item);}
  }
  globalThis.FateToolkitExtraBuilder=Object.freeze({edit,openForActor,importToActor,exportFromActor,activate,openLibrary,saveToLibrary,library});
  Hooks.once('ready',installHotbarDrop);
})();
