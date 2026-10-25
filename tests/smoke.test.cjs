const assert = require('assert');
const { loadScript } = require('./harness.cjs');

(async () => {
  const gm = { id:'gm1', active:true, isGM:true, getFlag:()=>undefined };
  const moduleRecord = { version:'1.0.1', api:{} };
  const settings = new Map([
    ['fate-aspect-widget.aspectFavorites', { scope:'user' }],
    ['fate-aspect-widget.actionSkillPreferences', { scope:'user' }]
  ]);
  const { context } = loadScript('scripts/smoke.js', ['fawRunIntegrationSmoke'], {
    users:[gm],
    user:gm,
    game:{
      version:'13.351',
      user:gm,
      users:{contents:[gm],activeGM:gm,get:id => id === gm.id ? gm : null},
      system:{id:'fate-core-official',version:'4.7.13.6'},
      settings:{settings,get(){},register(){},set:async()=>{}},
      modules:{get:id => id === 'socketlib' ? {active:true} : id === 'fate-aspect-widget' ? moduleRecord : null}
    },
    context:{
      FateToolkitRPC:{ready:true},
      FateToolkitPermissions:{primaryActiveGM:()=>gm},
      FateToolkitUX:{info(){},error(){}},
      console:{...console,groupCollapsed(){},groupEnd(){},table(){}}
    }
  });
  const report = await context.FateToolkitSmoke.run({documents:false,notify:false});
  assert.equal(report.ok,true);
  assert.equal(report.failed,0);
  assert.equal(report.foundryVersion,'13.351');
  assert.equal(report.systemVersion,'4.7.13.6');
  assert.equal(report.checks.find(r=>r.name==='aspectFavorites scope').ok,true);
  assert.equal(report.checks.find(r=>r.name==='active GM authority').ok,true);
  console.log('smoke.test.cjs OK');
})().catch(error => { console.error(error); process.exit(1); });
