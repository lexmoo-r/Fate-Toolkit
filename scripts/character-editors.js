/* Fate Toolkit character trait editors. Existing FCO entries remain source-of-truth.
 * No native Fate Core settings dialogs are required to manage character skills,
 * aspects, stunts or track availability. No destructive bulk replacement.
 */
(() => {
  const ID='fate-aspect-widget';
  // Foundry themes may not apply module styles to DialogV2 consistently.
  // Install the exact stylesheet at dialog-opening time, after system CSS.
  const EDITOR_STYLE_TEXT = "/* Fate Toolkit editors – a self-contained, resize-safe UI.\n   This is also injected by character-editors.js when the dialogs open. Foundry\n   and the Fate Core system can otherwise override dialog form layouts. */\n.application:has(.fte-editor){min-width:min(600px,calc(100vw - 28px))!important;max-width:calc(100vw - 20px)!important;}\n.application:has(.fte-editor) .window-content{display:flex!important;flex-direction:column!important;min-height:0!important;overflow:hidden!important;padding:0!important;}\n.application:has(.fte-editor) .dialog-content{display:flex!important;flex:1 1 auto!important;flex-direction:column!important;min-height:0!important;overflow:hidden!important;padding:0!important;}\n.application:has(.fte-editor) .dialog-content>form{display:flex!important;flex-direction:column!important;min-height:0!important;flex:1 1 auto!important;overflow:hidden!important;margin:0!important;}\n.application:has(.fte-editor) .dialog-buttons{display:flex!important;gap:10px!important;flex:0 0 auto!important;padding:12px 18px!important;border-top:1px solid rgba(215,180,157,.19)!important;}\n.application:has(.fte-editor) .dialog-buttons button{flex:1 1 0!important;min-height:38px!important;}\n.fte-editor{--fte-line:rgba(220,203,194,.18);--fte-subtle:rgba(255,255,255,.035);--fte-accent:#cf7455;--fte-ink:#eae2dc;--fte-dim:#b5aaa5;display:flex!important;flex-direction:column!important;gap:0!important;box-sizing:border-box!important;width:100%!important;min-width:0!important;height:clamp(370px,68vh,690px)!important;max-height:calc(100vh - 165px)!important;padding:0!important;margin:0!important;overflow:hidden!important;color:var(--fte-ink);font-size:13px;line-height:1.45;}\n.fte-editor,.fte-editor *, .fte-editor *:before,.fte-editor *:after{box-sizing:border-box!important;}\n.fte-editor-intro{flex:none;padding:12px 18px 9px;font-size:12px;line-height:1.45;color:var(--fte-dim);border-bottom:1px solid var(--fte-line);}\n.fte-editor-tools{display:grid!important;grid-template-columns:minmax(100px,1fr) minmax(180px,270px)!important;align-items:center!important;gap:12px!important;flex:none!important;padding:12px 18px!important;min-width:0!important;}\n.fte-editor-tools strong{font-weight:700;font-size:14px;}\n.fte-count{display:inline-block;padding:1px 8px;margin-left:6px;border:1px solid var(--fte-line);border-radius:99px;font-weight:500;font-size:11px;color:var(--fte-dim);}\n.fte-editor :is(input,select,textarea){display:block!important;box-sizing:border-box!important;margin:0!important;min-width:0!important;width:100%!important;max-width:100%!important;color:var(--fte-ink)!important;background:#302a30!important;border:1px solid rgba(205,179,168,.26)!important;border-radius:6px!important;box-shadow:none!important;font:inherit!important;line-height:1.4!important;}\n.fte-editor input:not([type=checkbox]){height:34px!important;min-height:34px!important;padding:6px 9px!important;}\n.fte-editor input[type=search]{padding-inline:12px!important;}\n.fte-editor textarea{min-height:104px!important;resize:vertical!important;padding:9px 11px!important;line-height:1.48!important;}\n.fte-editor :is(input,textarea):focus-visible{outline:2px solid var(--fte-accent)!important;outline-offset:1px!important;}\n.fte-editor :is(input,textarea):disabled,.fte-editor input[readonly]{opacity:.64;cursor:not-allowed;}\n.fte-editor .fte-list{display:flex!important;flex-direction:column!important;align-items:stretch!important;gap:10px!important;flex:1 1 auto!important;min-height:100px!important;max-height:none!important;margin:0!important;padding:2px 18px 16px!important;overflow-y:scroll!important;overflow-x:hidden!important;overscroll-behavior:contain!important;scrollbar-gutter:stable!important;scrollbar-width:thin!important;scrollbar-color:var(--fte-accent) rgba(255,255,255,.055);}\n.fte-editor .fte-list::-webkit-scrollbar{width:10px;}\n.fte-editor .fte-list::-webkit-scrollbar-track{background:rgba(255,255,255,.04);border-radius:10px;}\n.fte-editor .fte-list::-webkit-scrollbar-thumb{background:#91604e;border-radius:10px;border:2px solid #211d23;}\n.fte-editor .fte-trait{display:block!important;flex:0 0 auto!important;width:100%!important;min-width:0!important;min-height:0!important;margin:0!important;padding:13px 15px!important;border:1px solid var(--fte-line)!important;border-radius:9px!important;background:var(--fte-subtle)!important;}\n.fte-editor .fte-trait-head{display:grid!important;grid-template-columns:minmax(0,1fr) 34px!important;align-items:center!important;gap:10px!important;margin-bottom:12px!important;min-width:0!important;}\n.fte-editor .fte-trait-head:has(.fte-owned-badge){grid-template-columns:minmax(0,1fr) auto 34px!important;}\n.fte-editor .fte-trait-head>input{font-weight:650!important;font-size:14px!important;}\n.fte-editor button.fte-remove{display:grid!important;place-items:center!important;flex:none!important;width:34px!important;max-width:34px!important;min-width:34px!important;height:34px!important;min-height:34px!important;max-height:34px!important;margin:0!important;padding:0!important;border:1px solid var(--fte-line)!important;border-radius:6px!important;background:rgba(0,0,0,.10)!important;color:var(--fte-dim)!important;cursor:pointer;}\n.fte-editor button.fte-remove:hover:not(:disabled){color:#ffa99a!important;border-color:#ac645c!important;}\n.fte-editor .fte-trait-fields{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;align-items:start!important;gap:12px!important;min-width:0!important;}\n.fte-editor .fte-field{display:flex!important;flex-direction:column!important;align-items:stretch!important;gap:6px!important;width:100%!important;min-width:0!important;min-height:0!important;margin:0!important;padding:0!important;}\n.fte-editor .fte-field-full{grid-column:auto!important;}\n.fte-editor .fte-field-label{display:block!important;flex:none!important;position:static!important;width:100%!important;padding:0!important;margin:0!important;font-size:12px!important;font-weight:600!important;line-height:1.35!important;text-align:left!important;color:var(--fte-dim)!important;}\n.fte-editor .fte-owned-badge{display:inline-flex!important;align-items:center!important;width:auto!important;white-space:nowrap!important;padding:4px 8px!important;font-size:11px!important;border:1px solid var(--fte-line)!important;border-radius:99px;color:var(--fte-dim);}\n.fte-editor .fte-trait.is-owned{opacity:.70;}\n.fte-editor .fte-toolbar{flex:0 0 auto!important;display:flex!important;align-items:center!important;justify-content:flex-end!important;min-height:59px!important;margin:0!important;padding:10px 18px!important;border-top:1px solid var(--fte-line)!important;}\n.fte-editor .fte-toolbar>button{display:inline-flex!important;justify-content:center!important;gap:7px!important;width:auto!important;min-width:154px!important;max-width:100%!important;min-height:36px!important;padding:6px 16px!important;border:1px solid var(--fte-accent)!important;border-radius:6px!important;background:rgba(207,116,85,.11)!important;color:var(--fte-ink)!important;}\n.fte-editor .fte-skill-head{display:grid!important;grid-template-columns:minmax(0,1fr) 82px 34px!important;gap:12px!important;flex:0 0 auto!important;align-items:center!important;min-height:28px!important;margin:0!important;padding:4px 30px!important;color:var(--fte-dim)!important;border-bottom:1px solid var(--fte-line)!important;font-size:11px!important;letter-spacing:.02em!important;}\n.fte-editor .fte-skills{gap:0!important;padding:0 18px 8px!important;max-height:none!important;}\n.fte-editor .fte-trait.fte-skill-row{display:grid!important;grid-template-columns:minmax(0,1fr) 82px 34px!important;align-items:center!important;gap:12px!important;flex:0 0 auto!important;min-height:46px!important;max-height:56px!important;width:100%!important;margin:0!important;padding:5px 12px!important;border:0!important;border-bottom:1px solid var(--fte-line)!important;border-radius:0!important;background:transparent!important;}\n.fte-editor .fte-trait.fte-skill-row:nth-child(even){background:rgba(255,255,255,.022)!important;}\n.fte-editor .fte-skill-name{display:flex!important;align-items:center!important;gap:7px!important;min-width:0!important;height:auto!important;}\n.fte-editor .fte-skill-name input{font-size:13px!important;font-weight:500!important;background:transparent!important;}\n.fte-editor .fte-skill-row input.fte-skill-rank{width:82px!important;max-width:82px!important;text-align:center!important;font-size:14px!important;font-weight:650!important;font-variant-numeric:tabular-nums!important;}\n.fte-editor [hidden]{display:none!important;}\n@media(max-width:690px){.application:has(.fte-editor){min-width:0!important;}.fte-editor .fte-trait-fields{grid-template-columns:1fr!important;}.fte-editor .fte-trait-head:has(.fte-owned-badge){grid-template-columns:minmax(0,1fr) 34px!important;}.fte-editor .fte-trait-head .fte-owned-badge{grid-column:1/-1;grid-row:2;}.fte-editor .fte-trait-head button{grid-column:2;grid-row:1;}.fte-editor .fte-editor-tools{grid-template-columns:1fr!important;}.fte-editor .fte-field textarea{min-height:90px!important;}}\n@media(max-width:440px){.fte-editor-intro{padding-inline:12px!important;}.fte-editor .fte-editor-tools{padding-inline:12px!important;}.fte-editor .fte-list{padding-inline:12px!important;}.fte-editor .fte-toolbar{padding-inline:12px!important;}.fte-editor .fte-skill-head{grid-template-columns:minmax(0,1fr) 56px 32px!important;gap:7px!important;padding-inline:19px!important;}.fte-editor .fte-trait.fte-skill-row{grid-template-columns:minmax(0,1fr) 56px 32px!important;gap:7px!important;padding-inline:4px!important;}.fte-editor .fte-skill-row input.fte-skill-rank{width:56px!important;}.fte-editor button.fte-remove{width:32px!important;min-width:32px!important;}}\n";
  function ensureEditorStyles(){
    if(typeof document==='undefined'||!document.head)return;
    const id='fate-toolkit-character-editors-runtime-v2';
    let node=document.getElementById(id);
    if(!node){node=document.createElement('style');node.id=id;document.head.appendChild(node);}
    if(node.textContent!==EDITOR_STYLE_TEXT)node.textContent=EDITOR_STYLE_TEXT;
  }

  const quote=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const clone=value=>foundry.utils.deepClone(value);
  const list=(actor,kind)=>Object.entries(actor.system?.[kind]||{});
  const newKey=(kind)=>`faw_${kind}_${foundry.utils.randomID()}`;
  const defaults={
    skills:{description:'',overcome:'',caa:'',attack:'',defend:'',pc:true,rank:0,adhoc:true,hidden:false},
    aspects:{value:'',description:'',notes:''},
    stunts:{description:'',notes:'',linked_skill:'None',refresh_cost:1,overcome:false,caa:false,attack:false,defend:false,bonus:0,boxes:0,box_values:[]},
    tracks:{description:'',notes:'',category:'Combat',unique:true,universal:false,paid:false,enabled:true,linked_skills:[],label:'none',recovery_type:'Fleeting',when_marked:'',recovery_conditions:'',harm_can_absorb:0,boxes:0,box_values:[],aspect:'No',rollable:'false'}
  };
  const titles={skills:'Навыки',aspects:'Аспекты',stunts:'Трюки',tracks:'Последствия и состояния'};
  const isEditable=(actor,kind)=>Boolean(actor?.isOwner && (kind==='skills'||game.user?.isGM));
  // Use explicit field wrappers instead of naked <label> elements: Foundry's
  // system themes can replace label layout rules inside DialogV2 windows.
  const field=(label,control,full=false)=>`<div class="fte-field${full?' fte-field-full':''}"><span class="fte-field-label">${label}</span>${control}</div>`;
  function entry(kind,id,data,readonly=false){
    const fixed=Boolean(data.extra_id), locked=readonly||fixed;
    const lockedName=locked?'readonly':'';
    const fixedBadge=fixed?'<span class="fte-owned-badge" title="Это свойство задаётся дополнением и изменяется в его редакторе">Из дополнения</span>':'';
    const del=`<button type="button" class="fte-remove" data-remove-trait title="Удалить запись" aria-label="Удалить запись" ${locked?'disabled':''}><i class="fa-solid fa-trash" aria-hidden="true"></i></button>`;
    if(kind==='skills'){
      const name=`<input name="name" aria-label="Название навыка" value="${quote(data.name||'')}" ${lockedName} placeholder="Название навыка" maxlength="100" required>`;
      return `<article class="fte-trait fte-skill-row${fixed?' is-owned':''}" data-trait-key="${quote(id)}" data-extra-owned="${fixed}"><div class="fte-skill-name">${name}${fixedBadge}</div><input class="fte-skill-rank" name="rank" aria-label="Ранг навыка ${quote(data.name||'')}" type="number" min="-2" max="12" step="1" value="${Number(data.rank||0)}" ${fixed?'disabled':''}>${del}</article>`;
    }
    const header=`<div class="fte-trait-head"><input name="name" aria-label="Название записи" value="${quote(data.name||'')}" ${lockedName} placeholder="Название" maxlength="100" required>${fixedBadge}${del}</div>`;
    let fields='';
    const disabled=fixed?'disabled':'';
    if(kind==='aspects')fields=[
      field('Значение аспекта',`<textarea name="value" aria-label="Значение аспекта" rows="3" ${disabled}>${quote(data.value||'')}</textarea>`,true),
      field('Описание',`<textarea name="description" aria-label="Описание аспекта" rows="3" ${disabled}>${quote(data.description||'')}</textarea>`,true)
    ].join('');
    if(kind==='stunts')fields=[
      field('Описание трюка',`<textarea name="description" rows="4" ${disabled}>${quote(data.description||'')}</textarea>`,true),
      field('Связанный навык',`<input name="linked_skill" value="${quote(data.linked_skill||'None')}" ${disabled}>`),
      field('Бонус',`<input name="bonus" type="number" min="-20" max="20" value="${Number(data.bonus||0)}" ${disabled}>`),
      field('Стоимость резерва',`<input name="refresh_cost" type="number" min="0" max="20" value="${Number(data.refresh_cost??1)}" ${disabled}>`)
    ].join('');
    if(kind==='tracks')fields=[
      field('Категория',`<input name="category" value="${quote(data.category||'Combat')}" ${disabled}>`),
      field('Ячейки',`<input name="boxes" type="number" min="0" max="30" value="${Number(data.boxes||0)}" ${disabled}>`),
      field('Поглощение',`<input name="harm_can_absorb" type="number" min="0" max="30" value="${Number(data.harm_can_absorb||0)}" ${disabled}>`),
      field('Описание состояния',`<textarea name="description" rows="3" ${disabled}>${quote(data.description||'')}</textarea>`,true)
    ].join('');
    return `<article class="fte-trait${fixed?' is-owned':''}" data-trait-key="${quote(id)}" data-extra-owned="${fixed}">${header}<div class="fte-trait-fields">${fields}</div></article>`;
  }
  function read(card,kind,old){
    const val=name=>card.querySelector(`[name="${name}"]`)?.value||'';
    const result={...clone(old),name:val('name').trim().slice(0,100)};
    if(!result.name) throw new Error('У всех записей должно быть название.');
    const number=(field,min,max)=>{const n=Number(val(field));if(!Number.isInteger(n)||n<min||n>max)throw new Error(`Недопустимое значение «${field}»: ${result.name}`);return n;};
    if(kind==='skills')result.rank=number('rank',-2,12);
    if(kind==='aspects'){result.value=val('value');result.description=val('description');}
    if(kind==='stunts'){result.description=val('description');result.linked_skill=val('linked_skill')||'None';result.bonus=number('bonus',-20,20);result.refresh_cost=number('refresh_cost',0,20);}
    if(kind==='tracks'){
      result.description=val('description');result.category=val('category')||'Combat';result.harm_can_absorb=number('harm_can_absorb',0,30);
      const boxes=number('boxes',0,30);result.box_values=Array.from({length:boxes},(_,i)=>Boolean(old.box_values?.[i]));result.boxes=boxes;
    }
    return result;
  }
  async function editActor(actor,kind){
    if(!Object.hasOwn(titles,kind)||!isEditable(actor,kind))throw new Error('Нет прав на редактирование.');
    const original=Object.fromEntries(list(actor,kind).map(([key,value])=>[key,clone(value)]));
    ensureEditorStyles();
    const form=`<div class="fte-editor" data-fte-editor autocomplete="off"><div class="fte-editor-intro">Изменения сохраняются в анкете персонажа. Свойства, полученные от дополнений, редактируются в самих дополнениях.</div><div class="fte-editor-tools"><strong>${titles[kind]} <span class="fte-count">${Object.keys(original).length}</span></strong><input type="search" class="fte-search" data-trait-search placeholder="Найти ${kind==='skills'?'навык':'запись'}…" aria-label="Поиск по названию"></div>${kind==='skills'?'<div class="fte-skill-head"><span>Навык</span><span>Ранг</span><span></span></div>':''}<div class="fte-list ${kind==='skills'?'fte-skills':''}" data-traits>${Object.entries(original).map(([k,v])=>entry(kind,k,v,!game.user?.isGM)).join('')}</div>${game.user?.isGM?`<div class="fte-toolbar"><button type="button" data-add-trait><i class="fa-solid fa-plus" aria-hidden="true"></i> Добавить ${kind==='skills'?'навык':kind==='aspects'?'аспект':kind==='stunts'?'трюк':'состояние'}</button></div>`:''}</div>`;
    const response=await foundry.applications.api.DialogV2.wait({window:{title:`Fate Toolkit · ${titles[kind]}`,resizable:true},position:{width:800,height:710},content:form,buttons:[
      {action:'cancel',label:'Отмена',callback:()=>null},
      {action:'save',label:'Сохранить',default:true,callback:(_event,button)=>{
        const root=button.form||button.closest?.('.application')||document.querySelector?.('.application:has(.fte-editor)');
        const rows=[...(root?.querySelectorAll?.('[data-trait-key]')||[])];
        const result=[];const names=new Set();
        try{
          for(const row of rows){const key=row.dataset.traitKey;const base=original[key]||{...clone(defaults[kind]),name:''};const value=base.extra_id?clone(base):read(row,kind,base);const slug=value.name.trim().toLocaleLowerCase();if(names.has(slug)&&!value.extra_id)throw new Error(`Повторяется название «${value.name}».`);names.add(slug);result.push({key,value});}
        }catch(error){ui.notifications.error(String(error.message||error));return null;}
        return result;
      }}
    ],render:(_event,app)=>{
      app.element?.querySelector('[data-trait-search]')?.addEventListener('input',event=>{
        const q=String(event.target.value||'').toLocaleLowerCase().trim();
        for(const row of app.element.querySelectorAll('[data-trait-key]')){
          const text=String(row.querySelector('[name="name"]')?.value||'').toLocaleLowerCase();
          row.hidden=Boolean(q&&!text.includes(q));
        }
      });
      app.element?.addEventListener('click',event=>{
        const btn=event.target.closest('button');if(!btn)return;
        if(btn.hasAttribute('data-add-trait')){
          const list=app.element.querySelector('[data-traits]');const holder=document.createElement('div');holder.innerHTML=entry(kind,newKey(kind),{...clone(defaults[kind]),name:''});list?.append(holder.firstElementChild);
          app.element.querySelector('[data-trait-search]')?.value && app.element.querySelector('[data-trait-search]').dispatchEvent(new Event('input',{bubbles:true}));
          list?.lastElementChild?.querySelector('[name="name"]')?.focus();
        }
        if(btn.hasAttribute('data-remove-trait')){btn.closest('[data-trait-key]')?.remove();}
      });
    }});
    if(!response)return false;
    const oldKeys=new Set(Object.keys(original));const newKeys=new Set(response.map(x=>x.key));const update={};
    for(const old of oldKeys)if(!newKeys.has(old)&&!original[old]?.extra_id&&game.user?.isGM)update[`system.${kind}.-=${old}`]=null;
    for(const {key,value} of response){
      if(original[key]?.extra_id){
        // Equipped Extras own these traits; changes made here must never overwrite
        // the system-calculated values or detach the linkage.
        continue;
      }else if(!original[key]||JSON.stringify(value)!==JSON.stringify(original[key]))update[`system.${kind}.${key}`]=value;
    }
    if(!game.user?.isGM && kind==='skills' && globalThis.FateToolkitWill?.enabled?.() && globalThis.FateToolkitWill?.details?.(actor)?.isPc){
      const canonical=new Set(globalThis.FateToolkitFramework?.names||[]);
      const ranks=response.filter(row=>canonical.has(row.value.name)&&!row.value.extra_id).map(row=>row.value.rank);
      const total=ranks.reduce((sum,rank)=>sum+Math.max(0,rank),0);
      const previous=Object.values(original).filter(row=>canonical.has(row?.name)&&!row?.extra_id).reduce((sum,row)=>sum+Math.max(0,Number(row.rank)||0),0);
      if(ranks.some(rank=>rank<0||rank>4) || total>Math.max(21,previous))throw new Error('Для ПК при создании доступны 21 очко навыков, максимальный ранг +4. После создания повышайте навыки через вехи.');
    }
    if(Object.keys(update).length){await actor.update(update);ui.notifications.info(`${titles[kind]} сохранены.`);}
    return true;
  }
  async function setupWorld(){
    if(!game.user?.isGM)throw new Error('Настройка мира доступна ведущему.');
    const worldUuid=game.settings.get('fate-core-official','wid');const world=worldUuid?await fromUuid(worldUuid):null;
    if(!world?.system)throw new Error('Справочник Fate Core Official недоступен.');
    const selected=await foundry.applications.api.DialogV2.wait({window:{title:'Навыки и аспекты мира'},content:`<form class="fte-world"><p>Можно создать стандартные 19 навыков и пять аспектов кампании 2012, не удаляя существующие записи. Или открыть редакторы и задать свой набор.</p></form>`,buttons:[
      {action:'cancel',label:'Закрыть',callback:()=>null},
      {action:'preset',label:'Добавить набор 2012',callback:()=>({mode:'preset'})},
      {action:'skills',label:'Навыки мира',callback:()=>({mode:'skills'})},
      {action:'aspects',label:'Аспекты мира',callback:()=>({mode:'aspects'})}
    ]});
    if(!selected)return;
    if(selected.mode==='preset'){
      const result=await globalThis.FateToolkitFramework.request('world');
      ui.notifications.info(result.unchanged?'Набор уже существует.':`Набор обновлён: навыков ${result.added?.length||0}, аспектов ${result.addedAspects?.length||0}.`);
    }else await editActor(world,selected.mode);
  }
  globalThis.FateToolkitEditors=Object.freeze({editActor,setupWorld});
})();
