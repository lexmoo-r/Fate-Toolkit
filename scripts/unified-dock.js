/* Player-centred dock / mini sheet. Existing specialist windows remain installed.
 * No scene/world metadata is written by the presentation shell. */
(() => {
  const ID='fate-aspect-widget';
  const h=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const TABS=['actions','extras','conflict','requests','development','gm'];
  let app=null;let requested=false;
  const api=()=>game.modules?.get(ID)?.api||{};
  function actorForUser(){
    const token=canvas?.tokens?.controlled?.find(t=>t.actor&&(game.user.isGM||t.actor.isOwner));
    if(token?.actor)return token.actor;
    const selected=game.user?.character;
    if(selected&&(game.user.isGM||selected.isOwner))return selected;
    return Array.from(game.actors||[]).find(a=>a.type==='fate-core-official'&&(game.user.isGM||a.isOwner))||null;
  }
  function actorsForUser(){return Array.from(game.actors||[]).filter(a=>a.type==='fate-core-official'&&(game.user.isGM||a.isOwner));}
  function actor(){
    const choice=String(game.settings?.get?.(ID,'dockActorUuid')||'');
    if(choice){const found=actorsForUser().find(a=>a.uuid===choice);if(found)return found;}
    return actorForUser();
  }
  const extraList=a=>Array.from(a?.items||[]).filter(i=>i.type==='Extra'&&i.system?.active!==false).map(i=>({item:i,definition:globalThis.FateToolkitExtras?.definition?.(i)}));
  const getSections=()=>{try{return game.settings.get(ID,'dockSections')||{};}catch{return {};}};
  const expanded=id=>Boolean(getSections()[id]);
  const setExpanded=async(id,value)=>{await game.settings.set(ID,'dockSections',{...getSections(),[id]:value});render();};
  function actionRows(){return [['attack','fa-burst','Атака'],['overcome','fa-person-running','Преодоление'],['create','fa-wand-magic-sparkles','Создать преимущество'],['defend','fa-shield-halved','Защита']];}
  function section(id,icon,title,body){if(id==='gm'&&!game.user.isGM)return '';return `<section class="faw-dock-section"><button type="button" class="faw-dock-section-head" data-section="${id}" aria-expanded="${expanded(id)}"><i class="fa-solid ${icon}" aria-hidden="true"></i> ${title}<i class="fa-solid fa-chevron-${expanded(id)?'up':'down'}" aria-hidden="true"></i></button>${expanded(id)?`<div class="faw-dock-section-content">${body}</div>`:''}</section>`;}
  function consequenceRows(a){
    const tracks=Object.values(a?.system?.tracks||{});
    return tracks.filter(t=>t?.aspect&&(t.aspect.when_marked||t.aspect.as_name))
      .filter(t=>Array.isArray(t.box_values)&&t.box_values.length?t.box_values.some(Boolean):Boolean(String(t.aspect?.name||'').trim()))
      .slice(0,6).map(t=>h(t.aspect.when_marked?t.aspect.name:t.name));
  }
  function content(){
    const a=actor();const will=globalThis.FateToolkitWill?.details?.(a);const extra=extraList(a);
    const statuses=globalThis.FateToolkitExtras?.statuses?.(a)||[];
    const con=a?consequenceRows(a):[];
    const options=actorsForUser().map(x=>`<option value="${h(x.uuid)}" ${a?.uuid===x.uuid?'selected':''}>${h(x.name)}</option>`).join('');
    const name=a?.name||'Нет персонажа';
    const panel=`<header class="faw-dock-person"><img src="${h(a?.img||'icons/svg/mystery-man.svg')}" alt=""><div class="faw-dock-main"><strong>${h(name)}</strong><div class="faw-dock-will">${will?.configured?`Воля <b>${will.current}/${will.max}</b>`:'Воля —'}</div></div><button type="button" data-open-sheet title="Открыть анкету"><i class="fa-solid fa-address-card" aria-hidden="true"></i></button><button type="button" data-fold title="Свернуть"><i class="fa-solid fa-chevron-down" aria-hidden="true"></i></button></header>`;
    const badges=[...con.map(s=>`<span class="faw-dock-pill faw-dock-consequence" title="Последствие">${s}</span>`),...statuses.slice(0,7).map(s=>`<span class="faw-dock-pill" title="Состояние">${h(s.name)}</span>`)].join('');
    const actionButtons=actionRows().map(([id,icon,label])=>`<button type="button" class="faw-dock-action" data-do-action="${id}" ${!a?'disabled':''} aria-label="${label}" title="${label}"><i class="fa-solid ${icon}" aria-hidden="true"></i></button>`).join('');
    const abilityButtons=extra.filter(x=>x.definition).map(({item,definition:d})=>{
      const active=d.mode!=='passive';return `<div class="faw-dock-extra"><img src="${h(item.img||d.icon||'icons/svg/upgrade.svg')}" alt=""><span title="${h(d.description)}">${h(item.name)} <small>${d.mode==='passive'?'пассивная':d.mode==='hybrid'?'комбинированная':'активная'}</small></span>${active?`<button type="button" data-use-extra="${h(item.id)}" title="Использовать">▶</button><span draggable="true" data-drag-extra="${h(item.id)}" title="На панель макросов"><i class="fa-solid fa-grip-vertical" aria-hidden="true"></i></span>`:''}</div>`;
    }).join('')||'<p class="faw-dock-empty">Нет настроенных дополнений</p>';
    const summary=badges?`<div class="faw-dock-badges">${badges}</div>`:'';
    const sections=[
      section('actions','fa-dice','Действия',`<button type="button" data-open="openActionWidget">Открыть виджет четырёх действий</button>`),
      section('extras','fa-puzzle-piece','Дополнения',`${abilityButtons}<button type="button" data-open-extras>Редактор дополнений</button>`),
      section('conflict','fa-shield-halved','Конфликт',`<p>${game.combats?.active?'Конфликт активен':'Нет активного конфликта'}</p><button type="button" data-open="openCombatTracker">Открыть трекер</button>`),
      section('requests','fa-comments','Запросы',`<button type="button" data-open="${game.user.isGM?'openRollRequests':'openPlayerRequests'}">Открыть запросы</button><button type="button" data-open="openWorkflowCenter">Рабочий центр</button>`),
      section('development','fa-arrow-trend-up','Развитие',`<button type="button" data-open="${'openCampaignTimeline'}">Вехи</button>`),
      section('gm','fa-screwdriver-wrench','Инструменты ведущего',`<button type="button" data-restore-npcs>Восстановить Волю неигровым персонажам</button><button type="button" data-open-npc>Неигровые персонажи</button><button type="button" data-world-traits>Навыки и аспекты мира</button><button type="button" data-actor-profile>Применить профиль навыков персонажу</button>`)
    ].join('');
    return `<div class="faw-dock-shell">${panel}<div class="faw-dock-collapsible ${game.settings.get(ID,'dockFolded')?'faw-dock-hidden':''}">${summary}${game.user.isGM?`<label class="faw-dock-actor-select">Персонаж <select data-choose-actor><option value="">Автоматически</option>${options}</select></label>`:''}<div class="faw-dock-sections">${sections}</div></div></div>`;
  }
  const Base=foundry.applications.api.ApplicationV2;
  class Dock extends Base {
    static DEFAULT_OPTIONS={id:'faw-unified-dock',tag:'aside',classes:['faw-unified-dock'],position:{width:285,height:'auto'},window:{frame:true,resizable:true,minimizable:false,title:'Fate Toolkit'}};
    async _renderHTML(){return content();}
    _replaceHTML(html,element){element.innerHTML=html;}
    async _onRender(context,options){await super._onRender(context,options);const root=this.element;
      root.querySelectorAll('[data-section]').forEach(btn=>btn.addEventListener('click',()=>void setExpanded(btn.dataset.section,!expanded(btn.dataset.section))));
      root.querySelectorAll('[data-open]').forEach(btn=>btn.addEventListener('click',()=>{const fn=api()[btn.dataset.open];if(typeof fn==='function')void fn();else ui.notifications?.warn?.('Инструмент недоступен в этом режиме.');}));
      root.querySelector('[data-open-sheet]')?.addEventListener('click',()=>{
        const a=actor();if(!a)return;
        const open=api().openCharacterSheet;
        if(typeof open==='function')void open(a);
        else void a.sheet?.render?.(true);
      });
      root.querySelector('[data-open-extras]')?.addEventListener('click',()=>{
        const a=actor();if(!a)return;
        void globalThis.FateToolkitExtraBuilder?.openForActor?.(a);
      });
      root.querySelector('[data-world-traits]')?.addEventListener('click',()=>void globalThis.FateToolkitEditors?.setupWorld?.().catch(e=>ui.notifications.error(String(e.message||e))));
      root.querySelector('[data-actor-profile]')?.addEventListener('click',async()=>{
        if(!game.user?.isGM)return;
        const a=actor();if(!a)return ui.notifications.warn('Сначала выберите персонажа.');
        try{
          const service=globalThis.FateToolkitFramework;
          const preview=await service?.request('preview',a);
          if(!preview?.changed)return ui.notifications.info('Профиль персонажа уже настроен.');
          const list=[
            `Новые навыки: ${(preview.addedSkills||[]).join(', ')||'—'}`,
            `Переименованы навыки: ${(preview.renamedSkills||[]).join(', ')||'—'}`,
            `Новые аспекты: ${(preview.addedAspects||[]).join(', ')||'—'}`,
            `Обновлено связей: ${Number(preview.updatedReferences||0)}`
          ];
          const confirmed=await globalThis.FateToolkitUX.confirm({
            window:{title:'Настроить профиль персонажа'},
            content:`<p>Изменения не удаляют прежние записи. Перед применением рекомендуется сохранить резервную копию мира.</p><ul>${list.map(x=>`<li>${h(x)}</li>`).join('')}</ul>`,
            modal:true,rejectClose:false
          });
          if(!confirmed)return;
          await service.request('apply',a);
          ui.notifications.info('Профиль персонажа обновлён.');
          render();
        }catch(e){ui.notifications.error(String(e?.message||e));}
      });
      root.querySelector('[data-open-npc]')?.addEventListener('click',()=>{const a=actor();if(a&&globalThis.FateToolkitWill?.details?.(a)?.isNpc)void a.sheet?.render(true);else ui.notifications?.info?.('Выберите неигрового персонажа и откройте его анкету.');});
      root.querySelectorAll('[data-do-action]').forEach(btn=>btn.addEventListener('click',()=>{const a=actor();if(a){const t=Array.from(canvas?.tokens?.placeables||[]).find(t=>t.actor?.uuid===a.uuid);void api().initiateActionAtTarget?.(btn.dataset.doAction,t?`token:${t.id}`:`actor:${a.id}`,null);}}));
      root.querySelectorAll('[data-use-extra]').forEach(btn=>btn.addEventListener('click',()=>{const a=actor();const i=a?.items?.get?.(btn.dataset.useExtra);if(a&&i)void globalThis.FateToolkitExtraBuilder?.activate?.(a,i);}));
      root.querySelectorAll('[data-drag-extra]').forEach(el=>el.addEventListener('dragstart',e=>{const a=actor(),i=a?.items?.get?.(el.dataset.dragExtra);if(!e.dataTransfer||!i)return;e.dataTransfer.setData('text/plain',JSON.stringify({type:'FawExtra',actorUuid:a.uuid,itemId:i.id}));e.dataTransfer.effectAllowed='copy';}));
      root.querySelector('[data-choose-actor]')?.addEventListener('change',async e=>{await game.settings.set(ID,'dockActorUuid',e.target.value);render();});
      root.querySelector('[data-fold]')?.addEventListener('click',async()=>{const folded=!game.settings.get(ID,'dockFolded');await game.settings.set(ID,'dockFolded',folded);root.querySelector('.faw-dock-collapsible')?.classList.toggle('faw-dock-hidden',folded);});
      root.querySelector('[data-restore-npcs]')?.addEventListener('click',async()=>{if(!game.user.isGM)return;try{await globalThis.FateToolkitWill?.request?.('restoreNpcs',null);render();}catch(e){ui.notifications.error(String(e.message||e));}});
    }
  }
  function render(){if(app?.rendered&&!requested){requested=true;queueMicrotask(()=>{requested=false;void app?.render(false);});}}
  Hooks.once('init',()=>{
    game.settings.register(ID,'dockAutoOpen',{name:'Персональная мини-анкета Fate Toolkit',scope:'client',config:true,type:Boolean,default:true});
    game.settings.register(ID,'dockFolded',{scope:'client',config:false,type:Boolean,default:false});
    game.settings.register(ID,'dockActorUuid',{scope:'client',config:false,type:String,default:''});
    game.settings.register(ID,'dockSections',{scope:'client',config:false,type:Object,default:{actions:false,extras:true,conflict:false,requests:false,development:false,gm:false}});
  });
  Hooks.once('ready',async()=>{
    if(game.system?.id!=='fate-core-official')return;
    app=new Dock();Object.assign(game.modules.get(ID).api??={}, {openUnifiedDock:()=>app.render(true),toggleUnifiedDock:()=>app.rendered?app.close():app.render(true),refreshUnifiedDock:render});
    if(game.settings.get(ID,'dockAutoOpen'))await app.render(true);
  });
  for(const ev of ['controlToken','canvasReady','updateActor','updateItem','createItem','deleteItem','updateCombat','updateCombatant','updateScene'])Hooks.on(ev,render);
  Hooks.on('getSceneControlButtons',controls=>{const token=controls?.tokens;if(!token?.tools)return;token.tools.fawUnifiedDock={name:'fawUnifiedDock',title:'Fate Toolkit · мини-анкета',icon:'fa-solid fa-layer-group',button:true,visible:true,onChange:()=>app?.rendered?app.close():app?.render(true)};});
})();
