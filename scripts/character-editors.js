/* Fate Toolkit character trait editors. Existing FCO entries remain source-of-truth.
 * No native Fate Core settings dialogs are required to manage character skills,
 * aspects, stunts or track availability. No destructive bulk replacement.
 */
(() => {
  const ID='fate-aspect-widget';
  // Foundry themes may not apply module styles to DialogV2 consistently.
  // Install the exact stylesheet at dialog-opening time, after system CSS.
  const EDITOR_STYLE_TEXT = "/* Fate Toolkit editors – a self-contained, resize-safe UI.\n   This is also injected by character-editors.js when the dialogs open. Foundry\n   and the Fate Core system can otherwise override dialog form layouts. */\n.application:has(.fte-editor){min-width:min(600px,calc(100vw - 28px))!important;max-width:calc(100vw - 20px)!important;}\n.application:has(.fte-editor) .window-content{display:flex!important;flex-direction:column!important;min-height:0!important;overflow:hidden!important;padding:0!important;}\n.application:has(.fte-editor) .dialog-content{display:flex!important;flex:1 1 auto!important;flex-direction:column!important;min-height:0!important;overflow:hidden!important;padding:0!important;}\n.application:has(.fte-editor) .dialog-content>form{display:flex!important;flex-direction:column!important;min-height:0!important;flex:1 1 auto!important;overflow:hidden!important;margin:0!important;}\n.application:has(.fte-editor) .dialog-buttons{display:flex!important;gap:10px!important;flex:0 0 auto!important;padding:12px 18px!important;border-top:1px solid rgba(215,180,157,.19)!important;}\n.application:has(.fte-editor) .dialog-buttons button{flex:1 1 0!important;min-height:38px!important;}\n.fte-editor{--fte-line:rgba(220,203,194,.18);--fte-subtle:rgba(255,255,255,.035);--fte-accent:#cf7455;--fte-ink:#eae2dc;--fte-dim:#b5aaa5;display:flex!important;flex-direction:column!important;gap:0!important;box-sizing:border-box!important;width:100%!important;min-width:0!important;height:clamp(370px,68vh,690px)!important;max-height:calc(100vh - 165px)!important;padding:0!important;margin:0!important;overflow:hidden!important;color:var(--fte-ink);font-size:13px;line-height:1.45;}\n.fte-editor,.fte-editor *, .fte-editor *:before,.fte-editor *:after{box-sizing:border-box!important;}\n.fte-editor-intro{flex:none;padding:12px 18px 9px;font-size:12px;line-height:1.45;color:var(--fte-dim);border-bottom:1px solid var(--fte-line);}\n.fte-editor-tools{display:grid!important;grid-template-columns:minmax(100px,1fr) minmax(180px,270px)!important;align-items:center!important;gap:12px!important;flex:none!important;padding:12px 18px!important;min-width:0!important;}\n.fte-editor-tools strong{font-weight:700;font-size:14px;}\n.fte-count{display:inline-block;padding:1px 8px;margin-left:6px;border:1px solid var(--fte-line);border-radius:99px;font-weight:500;font-size:11px;color:var(--fte-dim);}\n.fte-editor :is(input,select,textarea){display:block!important;box-sizing:border-box!important;margin:0!important;min-width:0!important;width:100%!important;max-width:100%!important;color:var(--fte-ink)!important;background:#302a30!important;border:1px solid rgba(205,179,168,.26)!important;border-radius:6px!important;box-shadow:none!important;font:inherit!important;line-height:1.4!important;}\n.fte-editor input:not([type=checkbox]){height:34px!important;min-height:34px!important;padding:6px 9px!important;}\n.fte-editor input[type=search]{padding-inline:12px!important;}\n.fte-editor textarea{min-height:104px!important;resize:vertical!important;padding:9px 11px!important;line-height:1.48!important;}\n.fte-editor :is(input,textarea):focus-visible{outline:2px solid var(--fte-accent)!important;outline-offset:1px!important;}\n.fte-editor :is(input,textarea):disabled,.fte-editor input[readonly]{opacity:.64;cursor:not-allowed;}\n.fte-editor .fte-list{display:flex!important;flex-direction:column!important;align-items:stretch!important;gap:10px!important;flex:1 1 auto!important;min-height:100px!important;max-height:none!important;margin:0!important;padding:2px 18px 16px!important;overflow-y:scroll!important;overflow-x:hidden!important;overscroll-behavior:contain!important;scrollbar-gutter:stable!important;scrollbar-width:thin!important;scrollbar-color:var(--fte-accent) rgba(255,255,255,.055);}\n.fte-editor .fte-list::-webkit-scrollbar{width:10px;}\n.fte-editor .fte-list::-webkit-scrollbar-track{background:rgba(255,255,255,.04);border-radius:10px;}\n.fte-editor .fte-list::-webkit-scrollbar-thumb{background:#91604e;border-radius:10px;border:2px solid #211d23;}\n.fte-editor .fte-trait{display:block!important;flex:0 0 auto!important;width:100%!important;min-width:0!important;min-height:0!important;margin:0!important;padding:13px 15px!important;border:1px solid var(--fte-line)!important;border-radius:9px!important;background:var(--fte-subtle)!important;}\n.fte-editor .fte-trait-head{display:grid!important;grid-template-columns:minmax(0,1fr) 34px!important;align-items:center!important;gap:10px!important;margin-bottom:12px!important;min-width:0!important;}\n.fte-editor .fte-trait-head:has(.fte-owned-badge){grid-template-columns:minmax(0,1fr) auto 34px!important;}\n.fte-editor .fte-trait-head>input{font-weight:650!important;font-size:14px!important;}\n.fte-editor button.fte-remove{display:grid!important;place-items:center!important;flex:none!important;width:34px!important;max-width:34px!important;min-width:34px!important;height:34px!important;min-height:34px!important;max-height:34px!important;margin:0!important;padding:0!important;border:1px solid var(--fte-line)!important;border-radius:6px!important;background:rgba(0,0,0,.10)!important;color:var(--fte-dim)!important;cursor:pointer;}\n.fte-editor button.fte-remove:hover:not(:disabled){color:#ffa99a!important;border-color:#ac645c!important;}\n.fte-editor .fte-trait-fields{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;align-items:start!important;gap:12px!important;min-width:0!important;}\n.fte-editor .fte-field{display:flex!important;flex-direction:column!important;align-items:stretch!important;gap:6px!important;width:100%!important;min-width:0!important;min-height:0!important;margin:0!important;padding:0!important;}\n.fte-editor .fte-field-full{grid-column:auto!important;}\n.fte-editor .fte-field-label{display:block!important;flex:none!important;position:static!important;width:100%!important;padding:0!important;margin:0!important;font-size:12px!important;font-weight:600!important;line-height:1.35!important;text-align:left!important;color:var(--fte-dim)!important;}\n.fte-editor .fte-owned-badge{display:inline-flex!important;align-items:center!important;width:auto!important;white-space:nowrap!important;padding:4px 8px!important;font-size:11px!important;border:1px solid var(--fte-line)!important;border-radius:99px;color:var(--fte-dim);}\n.fte-editor .fte-trait.is-owned{opacity:.70;}\n.fte-editor .fte-toolbar{flex:0 0 auto!important;display:flex!important;align-items:center!important;justify-content:flex-end!important;min-height:59px!important;margin:0!important;padding:10px 18px!important;border-top:1px solid var(--fte-line)!important;}\n.fte-editor .fte-toolbar>button{display:inline-flex!important;justify-content:center!important;gap:7px!important;width:auto!important;min-width:154px!important;max-width:100%!important;min-height:36px!important;padding:6px 16px!important;border:1px solid var(--fte-accent)!important;border-radius:6px!important;background:rgba(207,116,85,.11)!important;color:var(--fte-ink)!important;}\n.fte-editor .fte-skill-head{display:grid!important;grid-template-columns:minmax(0,1fr) 82px 34px!important;gap:12px!important;flex:0 0 auto!important;align-items:center!important;min-height:28px!important;margin:0!important;padding:4px 30px!important;color:var(--fte-dim)!important;border-bottom:1px solid var(--fte-line)!important;font-size:11px!important;letter-spacing:.02em!important;}\n.fte-editor .fte-skills{gap:0!important;padding:0 18px 8px!important;max-height:none!important;}\n.fte-editor .fte-trait.fte-skill-row{display:grid!important;grid-template-columns:minmax(0,1fr) 82px 34px!important;align-items:center!important;gap:12px!important;flex:0 0 auto!important;min-height:46px!important;max-height:56px!important;width:100%!important;margin:0!important;padding:5px 12px!important;border:0!important;border-bottom:1px solid var(--fte-line)!important;border-radius:0!important;background:transparent!important;}\n.fte-editor .fte-trait.fte-skill-row:nth-child(even){background:rgba(255,255,255,.022)!important;}\n.fte-editor .fte-skill-name{display:flex!important;align-items:center!important;gap:7px!important;min-width:0!important;height:auto!important;}\n.fte-editor .fte-skill-name input{font-size:13px!important;font-weight:500!important;background:transparent!important;}\n.fte-editor .fte-skill-row input.fte-skill-rank{width:82px!important;max-width:82px!important;text-align:center!important;font-size:14px!important;font-weight:650!important;font-variant-numeric:tabular-nums!important;}\n.fte-editor [hidden]{display:none!important;}\n@media(max-width:690px){.application:has(.fte-editor){min-width:0!important;}.fte-editor .fte-trait-fields{grid-template-columns:1fr!important;}.fte-editor .fte-trait-head:has(.fte-owned-badge){grid-template-columns:minmax(0,1fr) 34px!important;}.fte-editor .fte-trait-head .fte-owned-badge{grid-column:1/-1;grid-row:2;}.fte-editor .fte-trait-head button{grid-column:2;grid-row:1;}.fte-editor .fte-editor-tools{grid-template-columns:1fr!important;}.fte-editor .fte-field textarea{min-height:90px!important;}}\n@media(max-width:440px){.fte-editor-intro{padding-inline:12px!important;}.fte-editor .fte-editor-tools{padding-inline:12px!important;}.fte-editor .fte-list{padding-inline:12px!important;}.fte-editor .fte-toolbar{padding-inline:12px!important;}.fte-editor .fte-skill-head{grid-template-columns:minmax(0,1fr) 56px 32px!important;gap:7px!important;padding-inline:19px!important;}.fte-editor .fte-trait.fte-skill-row{grid-template-columns:minmax(0,1fr) 56px 32px!important;gap:7px!important;padding-inline:4px!important;}.fte-editor .fte-skill-row input.fte-skill-rank{width:56px!important;}.fte-editor button.fte-remove{width:32px!important;min-width:32px!important;}}\n";

  // The same constrained layout is applied at DialogV2 runtime: FCO themes can
  // override style sheets registered with the Foundry module manifest.
  const EDITOR_VNEXT_STYLE = String.raw`
  .fte-editor .fte-skill-summary{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:9px!important;padding:8px 18px 12px!important;border-bottom:1px solid var(--fte-line)!important;flex:none!important}
  .fte-editor .fte-skill-metric{display:flex!important;flex-direction:column!important;gap:2px!important;padding:10px!important;border-radius:8px!important;background:rgba(255,255,255,.055)!important;min-width:0!important}
  .fte-editor .fte-skill-metric strong{font-size:20px!important;font-variant-numeric:tabular-nums!important}
  .fte-editor .fte-skill-metric span{font-size:11px!important;color:var(--fte-dim)!important}
  .fte-editor .fte-skill-guidance{padding:9px 18px!important;border-bottom:1px solid var(--fte-line)!important;font-size:12px!important;flex:none!important;color:var(--fte-dim)!important;line-height:1.5!important}
  .fte-editor .fte-skill-guidance strong{color:var(--fte-ink)!important}
  .fte-editor .fte-skill-guidance [data-skill-distribution]{display:block!important;margin-top:4px!important;font-variant-numeric:tabular-nums!important}
  .fte-editor .fte-skill-row .fte-skill-name input{width:100%!important}
  .fte-editor .fte-field select{height:36px!important;min-height:36px!important;padding:4px 9px!important}
  .fte-editor .fte-trait:has([name="linked_skill"]) .fte-field-full{grid-column:1/-1!important}
  @media(max-width:640px){.fte-editor .fte-skill-summary{padding:8px 12px!important;gap:5px!important}.fte-editor .fte-skill-metric{padding:7px!important}.fte-editor .fte-skill-metric strong{font-size:17px!important}.fte-editor .fte-skill-guidance{padding:8px 12px!important}}

/* Skill allocation: visible, live-updating Fate pyramid, not a prose legend. */
.fte-editor:has([data-skill-pyramid]){height:clamp(490px,79vh,750px)!important;max-height:calc(100vh - 150px)!important}
.fte-editor .fte-skill-summary{padding:9px 18px 12px!important;position:relative!important;}
.fte-editor .fte-skill-summary .fte-skill-metric{padding:8px 12px!important}
.fte-editor .fte-skill-progress{grid-column:1/-1;width:100%!important;height:5px!important;margin:1px 0 0!important;border:0!important;accent-color:#d67d60;}
.fte-editor .fte-skill-summary.is-invalid{outline:1px solid #b95e5e!important;outline-offset:-1px!important}
.fte-editor .fte-pyramid{display:flex!important;flex:0 0 auto!important;flex-direction:column!important;gap:5px!important;margin:0!important;padding:9px 18px!important;background:rgba(255,255,255,.025)!important;border-bottom:1px solid var(--fte-line)!important;min-height:0!important;}
.fte-editor .fte-pyramid-heading{display:flex!important;justify-content:space-between!important;align-items:center!important;gap:12px!important;color:var(--fte-dim)!important;font-size:11px!important;line-height:1.3!important;}
.fte-editor .fte-pyramid-heading strong{font-size:13px!important;color:var(--fte-ink)!important;}
.fte-editor .fte-pyramid-tier{display:grid!important;grid-template-columns:34px minmax(0,1fr) 35px!important;gap:9px!important;align-items:center!important;min-width:0!important;height:27px!important;}
.fte-editor .fte-pyramid-grade{font-weight:700!important;font-size:12px!important;font-variant-numeric:tabular-nums!important;color:#ecb89d!important;}
.fte-editor .fte-pyramid-track{display:flex!important;justify-content:center!important;gap:6px!important;width:100%!important;min-width:0!important;}
.fte-editor .fte-pyramid-slot{display:flex!important;justify-content:center!important;align-items:center!important;flex:0 1 105px!important;max-width:105px!important;min-width:0!important;height:25px!important;padding:0 6px!important;overflow:hidden!important;white-space:nowrap!important;text-overflow:ellipsis!important;background:rgba(215,148,121,.075)!important;border:1px dashed rgba(206,167,151,.38)!important;border-radius:5px!important;color:rgba(218,187,174,.54)!important;font-size:11px!important;}
.fte-editor .fte-pyramid-slot.is-filled{background:rgba(206,122,89,.23)!important;border:1px solid rgba(214,133,99,.7)!important;color:#ffddd1!important;}
.fte-editor .fte-pyramid-usage{font-size:11px!important;text-align:right!important;font-variant-numeric:tabular-nums!important;color:var(--fte-dim)!important;}
.fte-editor .fte-pyramid-tier.is-overfull .fte-pyramid-usage{color:#ffa6a6!important;font-weight:bold!important;}
.fte-editor .fte-pyramid-zero{display:flex!important;justify-content:space-between!important;gap:12px!important;font-size:11px!important;color:var(--fte-dim)!important;}
.fte-editor .fte-pyramid.is-free{flex:0 1 auto!important;overflow-y:auto!important;scrollbar-width:thin!important;}
.fte-editor .fte-pyramid-tier.is-free{height:auto!important;min-height:27px!important;align-items:start!important;}
.fte-editor .fte-pyramid-tier.is-free .fte-pyramid-track{justify-content:flex-start!important;flex-wrap:wrap!important;}
.fte-editor .fte-pyramid-tier.is-free .fte-pyramid-slot{flex:0 1 auto!important;min-width:80px!important;max-width:calc(100% - 8px)!important;}
.fte-editor .fte-pyramid-empty{margin:4px 0!important;color:var(--fte-dim)!important;font-size:12px!important;}
.fte-editor .fte-skill-feedback{padding:5px 18px!important;border-bottom:1px solid var(--fte-line)!important;color:#c5b3a8!important;font-size:11px!important;line-height:1.4!important;flex:none!important;}
.fte-editor .fte-skill-feedback.is-error{background:rgba(191,61,61,.14)!important;color:#ffb0a7!important;font-weight:600!important;}
.fte-editor .fte-skill-row input.fte-skill-rank:out-of-range{border-color:#c65f5f!important;box-shadow:inset 0 0 0 1px #c65f5f!important;}
@media(max-width:640px){.fte-editor .fte-pyramid{padding:7px 12px!important;}.fte-editor .fte-pyramid-slot{font-size:10px!important;padding:0 3px!important}.fte-editor .fte-pyramid-heading span{font-size:10px!important;}.fte-editor .fte-pyramid-zero span:last-child{display:none!important}}
`;
  function ensureEditorStyles(){
    if(typeof document==='undefined'||!document.head)return;
    const id='fate-toolkit-character-editors-runtime-v2';
    let node=document.getElementById(id);
    if(!node){node=document.createElement('style');node.id=id;document.head.appendChild(node);}
    if(node.textContent!==(EDITOR_STYLE_TEXT+EDITOR_VNEXT_STYLE))node.textContent=EDITOR_STYLE_TEXT+EDITOR_VNEXT_STYLE;
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
  const prettyName=value=>{
    const raw=String(value??'');
    const match=/^(New Aspect|New Stunt|New Skill)(?: (\d+))?$/i.exec(raw);
    if(!match)return raw;
    const names={'new aspect':'Новый аспект','new stunt':'Новый трюк','new skill':'Новый навык'};
    return names[match[1].toLowerCase()]+(match[2]===undefined?'':` ${match[2]}`);
  };
  const skillNames=actor=>[...new Set([...Object.values(actor?.system?.skills||{})
    .map(v=>String(v?.name||'').trim()),...(globalThis.FateToolkitFramework?.names||[])].filter(Boolean))]
    .sort((a,b)=>a.localeCompare(b,'ru'));
  function skillSelect(current,names,disabled=''){
    const raw=String(current||'None').trim();
    const normalized=raw==='None'?'':raw;
    const extra=normalized&&!names.includes(normalized)?[normalized]:[];
    return `<select name="linked_skill" aria-label="Связанный навык" ${disabled}><option value="None" ${!normalized?'selected':''}>Без связанного навыка</option>${[...names,...extra].map(v=>`<option value="${quote(v)}" ${v===normalized?'selected':''}>${quote(globalThis.FateToolkitI18n?.skill?.(v)||v)}</option>`).join('')}</select>`;
  }
  const SKILL_TIERS=Object.freeze([{rank:4,cap:1},{rank:3,cap:2},{rank:2,cap:3},{rank:1,cap:5}]);
  function pointsLabel(number){
    const n=Math.abs(Math.trunc(number)),mod10=n%10,mod100=n%100;
    return `${number} ${mod10===1&&mod100!==11?'очко':mod10>=2&&mod10<=4&&(mod100<12||mod100>14)?'очка':'очков'}`;
  }
  function isPlayerSkills(actor){
    return Boolean(globalThis.FateToolkitWill?.enabled?.() && globalThis.FateToolkitWill?.details?.(actor)?.isPc);
  }
  function allowedSkillBudget(actor){
    if(!isPlayerSkills(actor))return null;
    const override=actor.system?.override;
    const alreadySpent=Object.values(actor.system?.skills||{}).filter(row=>!row?.extra_id)
      .reduce((sum,row)=>sum+Math.max(0,Number(row?.rank)||0),0);
    return Math.max(21,alreadySpent,override?.active?(Number(override.skillPoints)||0):0);
  }
  function getSkillStats(actor,rows){
    const entries=rows.map(row=>typeof row==='object'&&row!==null?row:{name:'',rank:row});
    const isPc=isPlayerSkills(actor);
    const limit=allowedSkillBudget(actor);
    // Fixed slots for PCs; actual ranks and per-rank skill counts for NPCs.
    const tiers=isPc
      ? SKILL_TIERS.map(({rank,cap})=>({rank,cap,names:entries.filter(r=>Number(r.rank)===rank).map(r=>String(r.name||'').trim()||'Без названия')}))
      : [...new Set(entries.map(r=>Number(r.rank)).filter(rank=>Number.isInteger(rank)&&rank>0))]
          .sort((a,b)=>b-a)
          .map(rank=>{
            const names=entries.filter(r=>Number(r.rank)===rank).map(r=>String(r.name||'').trim()||'Без названия');
            return {rank,cap:names.length,names};
          });
    const invalid=entries.filter(r=>String(r.rank??'').trim()===''||!Number.isInteger(Number(r.rank)) || Number(r.rank)<0 || Number(r.rank)>(isPc?4:12));
    const spent=entries.reduce((sum,r)=>sum+(Number.isFinite(Number(r.rank))?Math.max(0,Number(r.rank)):0),0);
    const overloaded=isPc?tiers.filter(t=>t.names.length>t.cap):[];
    const overBudget=limit!==null&&spent>limit;
    const errors=[];
    if(invalid.length)errors.push(isPc?'Для ПК допустимы только целые ранги от +0 до +4.':'Для NPC допустимы только целые ранги от +0 до +12.');
    if(overloaded.length)errors.push('Превышено число мест на ступени '+overloaded.map(t=>`+${t.rank}`).join(', ')+'.');
    if(overBudget)errors.push(`Превышен бюджет на ${pointsLabel(spent-limit)}.`);
    const remaining=limit===null?null:limit-spent;
    const complete=isPc&&!errors.length&&remaining===0&&tiers.every(t=>t.names.length===t.cap);
    const note=errors.length?errors.join(' '):!isPc?'Для NPC нет ограничений по пирамиде.':
      complete?'Стартовая пирамида полностью распределена.':`Осталось распределить ${pointsLabel(remaining)}. Поднимайте навыки по ступеням, не превышая число мест.`;
    return {spent,limit,remaining,tiers,invalid:invalid.length,valid:errors.length===0,errors,note,complete,zero:entries.filter(r=>Number(r.rank)===0).length};
  }
  function skillPyramidMarkup(stats){
    return `<section class="fte-pyramid ${stats.limit===null?'is-free':''}" data-skill-pyramid aria-label="Пирамида навыков"><div class="fte-pyramid-heading"><strong>Пирамида навыков</strong><span data-pyramid-mode>${stats.limit===null?'Свободное распределение NPC':'Начальная форма · +4 / +3 / +2 / +1'}</span></div>${stats.tiers.length?'':'<p class="fte-pyramid-empty">Навыки с рангом +1 и выше появятся здесь.</p>'}${stats.tiers.map(t=>`<div class="fte-pyramid-tier ${stats.limit===null?'is-free':''}" data-pyramid-tier="${t.rank}"><span class="fte-pyramid-grade">+${t.rank}</span><div class="fte-pyramid-track">${Array.from({length:t.cap},(_,i)=>`<span class="fte-pyramid-slot ${t.names[i]?'is-filled':''}" data-pyramid-slot="${i}" title="${quote(t.names[i]||'Свободное место')}">${quote(t.names[i]||'＋')}</span>`).join('')}</div><span class="fte-pyramid-usage" data-pyramid-usage>${stats.limit===null?t.names.length+' нав.':t.names.length+'/'+t.cap}</span></div>`).join('')}<div class="fte-pyramid-zero"><span>+0 — ${stats.zero} навык(ов)</span><span>Заполняйте ступени в списке ниже</span></div></section>`;
  }
  function skillRows(root,actor){
    return [...(root?.querySelectorAll?.(isPlayerSkills(actor)?'.fte-skill-row:not([data-extra-owned="true"])':'.fte-skill-row')||[])].map(r=>({name:r.querySelector('[name="name"]')?.value||'',rank:r.querySelector('[name="rank"]')?.value}));
  }
  function updateSkillSummary(root,actor){
    const panel=root?.querySelector?.('[data-skill-summary]');if(!panel)return;
    const stats=getSkillStats(actor,skillRows(root,actor));
    const assign=(sel,value)=>{const el=root.querySelector(sel);if(el)el.textContent=String(value);};
    assign('[data-skill-spent]',stats.spent);
    assign('[data-skill-remaining]',stats.remaining===null?'—':stats.remaining);
    assign('[data-skill-limit]',stats.limit===null?'Без ограничений':stats.limit);
    const note=root.querySelector('[data-skill-warning]');
    if(note){note.textContent=stats.note;note.classList.toggle('is-error',!stats.valid);note.setAttribute('role',stats.valid?'status':'alert');}
    const progress=root.querySelector('[data-skill-progress]');
    if(progress){progress.max=Math.max(1,stats.limit??stats.spent??1);progress.value=Math.min(progress.max,stats.spent);}
    // Rebuild entire graphic: NPC tiers and slot counts vary as inputs change.
    const pyramid=root.querySelector?.('[data-skill-pyramid]');
    if(pyramid) pyramid.outerHTML=skillPyramidMarkup(stats);
    assign('.fte-pyramid-zero span',`+0 — ${stats.zero} навыков`);
    panel.classList.toggle('is-invalid',!stats.valid);
    const editor=root.querySelector('.fte-editor')||root;
    editor.dataset.skillValid=String(stats.valid);
    const form=root.closest?.('.application')||root.parentElement;
    const save=form?.querySelector?.('.dialog-buttons [data-action="save"]')||form?.querySelector?.('button[data-action="save"]');
    if(save){save.disabled=!stats.valid;save.title=stats.valid?'Сохранить распределение':'Исправьте ошибки распределения навыков';}
    return stats;
  }
  function entry(kind,id,data,readonly=false,names=[]){
    const fixed=Boolean(data.extra_id), locked=readonly||fixed;
    const lockedName=locked?'readonly':'';
    const fixedBadge=fixed?'<span class="fte-owned-badge" title="Это свойство задаётся дополнением и изменяется в его редакторе">Из дополнения</span>':'';
    const del=`<button type="button" class="fte-remove" data-remove-trait title="Удалить запись" aria-label="Удалить запись" ${locked?'disabled':''}><i class="fa-solid fa-trash" aria-hidden="true"></i></button>`;
    if(kind==='skills'){
      const name=`<input name="name" aria-label="Название навыка" value="${quote(prettyName(data.name||''))}" ${lockedName} placeholder="Название навыка" maxlength="100" required>`;
      return `<article class="fte-trait fte-skill-row${fixed?' is-owned':''}" data-trait-key="${quote(id)}" data-extra-owned="${fixed}"><div class="fte-skill-name">${name}${fixedBadge}</div><input class="fte-skill-rank" name="rank" aria-label="Ранг навыка ${quote(data.name||'')}" type="number" min="0" max="12" step="1" value="${Number(data.rank||0)}" ${fixed?'disabled':''}>${del}</article>`;
    }
    const header=`<div class="fte-trait-head"><input name="name" aria-label="Название записи" value="${quote(prettyName(data.name||''))}" ${lockedName} placeholder="Название" maxlength="100" required>${fixedBadge}${del}</div>`;
    let fields='';
    const disabled=fixed?'disabled':'';
    if(kind==='aspects')fields=[
      field('Значение аспекта',`<textarea name="value" aria-label="Значение аспекта" rows="3" ${disabled}>${quote(data.value||'')}</textarea>`,true),
      field('Описание',`<textarea name="description" aria-label="Описание аспекта" rows="3" ${disabled}>${quote(data.description||'')}</textarea>`,true)
    ].join('');
    if(kind==='stunts')fields=[
      field('Описание трюка',`<textarea name="description" rows="4" ${disabled}>${quote(data.description||'')}</textarea>`,true),
      field('Связанный навык',skillSelect(data.linked_skill,names,disabled)),
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
    if(kind==='skills')result.rank=number('rank',0,12);
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
    const names=skillNames(actor);
    ensureEditorStyles();
    const initialSkillStats=getSkillStats(actor,Object.values(original).filter(row=>!isPlayerSkills(actor)||!row?.extra_id).map(row=>({name:row.name,rank:row.rank})));
    const summary=kind==='skills'?`<div data-skill-summary class="fte-skill-summary" role="status" aria-live="polite">
       <div class="fte-skill-metric"><span>Распределено</span><strong data-skill-spent>${initialSkillStats.spent}</strong></div>
       <div class="fte-skill-metric"><span>Осталось</span><strong data-skill-remaining>${initialSkillStats.remaining===null?'—':initialSkillStats.remaining}</strong></div>
       <div class="fte-skill-metric"><span>Бюджет</span><strong data-skill-limit>${initialSkillStats.limit===null?'Без ограничений':initialSkillStats.limit}</strong></div>
       <progress class="fte-skill-progress" data-skill-progress value="${initialSkillStats.spent}" max="${Math.max(1,initialSkillStats.limit??initialSkillStats.spent)}"></progress>
     </div>${skillPyramidMarkup(initialSkillStats)}<div class="fte-skill-feedback" data-skill-warning role="status">${initialSkillStats.note}</div>`:'';
    const form=`<div class="fte-editor" data-fte-editor autocomplete="off"><div class="fte-editor-intro">Изменения сохраняются в анкете персонажа. Свойства, полученные от дополнений, редактируются в самих дополнениях.</div><div class="fte-editor-tools"><strong>${titles[kind]} <span class="fte-count">${Object.keys(original).length}</span></strong><input type="search" class="fte-search" data-trait-search placeholder="Найти ${kind==='skills'?'навык':'запись'}…" aria-label="Поиск по названию"></div>${summary}${kind==='skills'?'<div class="fte-skill-head"><span>Навык</span><span>Ранг</span><span></span></div>':''}<div class="fte-list ${kind==='skills'?'fte-skills':''}" data-traits>${Object.entries(original).map(([k,v])=>entry(kind,k,v,!game.user?.isGM,names)).join('')}</div>${game.user?.isGM?`<div class="fte-toolbar"><button type="button" data-add-trait><i class="fa-solid fa-plus" aria-hidden="true"></i> Добавить ${kind==='skills'?'навык':kind==='aspects'?'аспект':kind==='stunts'?'трюк':'состояние'}</button></div>`:''}</div>`;
    const response=await foundry.applications.api.DialogV2.wait({window:{title:`Fate Toolkit · ${titles[kind]}`,resizable:true},position:{width:800,height:710},content:form,buttons:[
      {action:'cancel',label:'Отмена',callback:()=>null},
      {action:'save',label:'Сохранить',default:true,callback:(_event,button)=>{
        const root=button.form||button.closest?.('.application')||document.querySelector?.('.application:has(.fte-editor)');
        if(kind==='skills'&&root?.querySelector?.('[data-skill-summary]')&&!updateSkillSummary(root,actor)?.valid){ui.notifications.error('Исправьте распределение навыков перед сохранением.');return null;}
        const rows=[...(root?.querySelectorAll?.('[data-trait-key]')||[])];
        const result=[];const names=new Set();
        try{
          for(const row of rows){const key=row.dataset.traitKey;const base=original[key]||{...clone(defaults[kind]),name:''};const value=base.extra_id?clone(base):read(row,kind,base);const slug=value.name.trim().toLocaleLowerCase();if(names.has(slug)&&!value.extra_id)throw new Error(`Повторяется название «${value.name}».`);names.add(slug);result.push({key,value});}
        }catch(error){ui.notifications.error(String(error.message||error));return null;}
        if(kind==='skills'){
          const evaluated=getSkillStats(actor,result.filter(r=>!isPlayerSkills(actor)||!r.value.extra_id).map(r=>({name:r.value.name,rank:r.value.rank})));
          if(!evaluated.valid){ui.notifications.error(evaluated.note);return null;}
        }
        return result;
      }}
    ],render:(_event,app)=>{
      if(kind==='skills'&&isPlayerSkills(actor)){
        for(const input of app.element?.querySelectorAll?.('.fte-skill-rank')||[])input.max='4';
      }
      updateSkillSummary(app.element,actor);
      app.element?.addEventListener('input',event=>{if(kind==='skills'&&event.target.matches('.fte-skill-rank, .fte-skill-name input'))updateSkillSummary(app.element,actor);});
      app.element?.addEventListener('change',event=>{if(kind==='skills'&&event.target.matches('.fte-skill-rank, .fte-skill-name input'))updateSkillSummary(app.element,actor);});
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
          const list=app.element.querySelector('[data-traits]');const holder=document.createElement('div');holder.innerHTML=entry(kind,newKey(kind),{...clone(defaults[kind]),name:''},false,names);list?.append(holder.firstElementChild);
          app.element.querySelector('[data-trait-search]')?.value && app.element.querySelector('[data-trait-search]').dispatchEvent(new Event('input',{bubbles:true}));
          list?.lastElementChild?.querySelector('[name="name"]')?.focus();
          if(kind==='skills'&&isPlayerSkills(actor)){const input=list?.lastElementChild?.querySelector('.fte-skill-rank');if(input)input.max='4';}
          updateSkillSummary(app.element,actor);
        }
        if(btn.hasAttribute('data-remove-trait')){btn.closest('[data-trait-key]')?.remove();updateSkillSummary(app.element,actor);}
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
