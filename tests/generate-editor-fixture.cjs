const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {baseContext}=require('./harness.cjs');
const root=path.join(__dirname,'..');
const css=fs.readFileSync(path.join(root,'styles/character-editors.css'),'utf8');
(async()=>{
 const ctx=baseContext({game:{user:{id:'gm',isGM:true},settings:{get:()=>''}}});
 ctx.foundry.utils.deepClone=structuredClone;
 ctx.foundry.utils.randomID=()=>String(Math.random()).slice(2);
 let html='';
 ctx.foundry.applications.api.DialogV2.wait=async cfg=>{html=cfg.content;return null;};
 vm.createContext(ctx);
 vm.runInContext(fs.readFileSync(path.join(root,'scripts/character-editors.js'),'utf8'),ctx);
 const kind=process.argv[2]==='aspects'?'aspects':'skills';
 const names=kind==='aspects'?['Концепция','Мотив','Связь','Пристрастие','Слабость']:['Атлетика','Телосложение','Драка','Стрельба','Скрытность','Вождение','Связи','Обман','Эмпатия','Провокация','Взаимопонимание','Ресурсы','Самообладание','Внимательность','Расследование','Академическое знание','Истинное знание','Воровство','Ремесло'];
 const actor={isOwner:true,system:{[kind]:Object.fromEntries(names.map((name,i)=>['id'+i,kind==='skills'?{name,rank:i%5}:{name,value: i===0?'Талантливый сыщик':'' ,description:i===0?'Острое внимание к деталям и привычка задавать неудобные вопросы.':''}]))}};
 await ctx.FateToolkitEditors.editActor(actor,kind);
 const fixture=`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Fate Toolkit editor integration fixture</title><style>
 :root{--color-text-primary:#ece9e6;--color-text-secondary:#ac9d98;--color-border-highlight:#be765b}body{margin:0;min-height:100vh;background:#242127;color:#ebe4dd;font:13px Arial,sans-serif;display:flex;align-items:center;justify-content:center}input,textarea{width:180px;background:#322b32;color:#ece0da;border:1px solid #51464b;border-radius:4px;padding:5px}button{color:inherit;border:1px solid #675257;background:#241f26;border-radius:5px;padding:6px;cursor:pointer} .application{display:flex;flex-direction:column;width:min(800px,calc(100vw - 30px));max-height:calc(100vh - 18px);background:#16141c;border:1px solid #55444a;border-radius:11px;overflow:hidden;box-shadow:0 12px 45px #0009}.window-header{height:38px;flex:0 0 auto;display:flex;align-items:center;padding:0 16px;border-bottom:1px solid #48383f;font-weight:bold}.window-content{min-height:0}.dialog-content{min-height:0}.dialog-buttons{display:flex;gap:8px;padding:14px}.dialog-buttons button{flex:1;padding:12px} .standard-form label{display:grid;grid-template-columns:160px 1fr} 
 </style><style>${css}</style></head><body><div class="application"><header class="window-header">Fate Toolkit · ${kind==='aspects'?'Аспекты':'Навыки'}</header><section class="window-content"><div class="dialog-content"><form class="standard-form">${html}</form></div><footer class="dialog-buttons"><button>Отмена</button><button>Сохранить</button></footer></section></div></body></html>`;
 fs.writeFileSync(path.join(root,'tests',`fixture-${kind}.html`),fixture);
 console.log(kind,'fixture generated',html.length);
})().catch(e=>{console.error(e);process.exitCode=1});
