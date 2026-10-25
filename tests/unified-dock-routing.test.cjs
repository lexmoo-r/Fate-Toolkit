const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {baseContext}=require('./harness.cjs');

(async()=>{
  const source=fs.readFileSync(path.join(__dirname,'../scripts/unified-dock.js'),'utf8');
  const hooks={};
  const module={api:{}};
  const called=[];
  const character={uuid:'Actor.player1',id:'player1',name:'Test Player',isOwner:true,type:'fate-core-official',items:[],system:{tracks:{}},sheet:{render:()=>called.push('native-sheet')}};
  const settings={
    register(){},
    get(_scope,key){if(key==='dockActorUuid')return '';if(key==='dockSections')return {extras:true};if(key==='dockAutoOpen')return false;if(key==='dockFolded')return false;return null;},
    async set(){}
  };
  class FakeApp {
    async _onRender(){}
    render(){return this;}
    close(){}
  }
  const context=baseContext({
    game:{settings,modules:{get:()=>module},user:{id:'player',isGM:false,character,active:true},actors:[character]},
    context:{
      Hooks:{once:(event,fn)=>hooks[event]=fn,on(){}},
      foundry:{applications:{api:{ApplicationV2:FakeApp}}},
      FateToolkitExtraBuilder:{openForActor:a=>called.push('extra:'+a.id)}
    }
  });
  vm.createContext(context);
  vm.runInContext(source,context,{filename:'unified-dock.js'});
  assert.ok(hooks.ready);
  await hooks.ready();
  module.api.openCharacterSheet=a=>called.push('toolkit:'+a.id);
  class FakeButton {
    constructor(){this.events={};}
    addEventListener(name,fn){this.events[name]=fn;}
    click(){assert.equal(typeof this.events.click,'function','button should have a click listener');this.events.click();}
  }
  const sheetButton=new FakeButton();
  const extraButton=new FakeButton();
  const root={
    querySelector(s){return s==='[data-open-sheet]'?sheetButton:s==='[data-open-extras]'?extraButton:null;},
    querySelectorAll(){return [];}
  };
  const app=module.api.openUnifiedDock();
  app.element=root;
  await app._onRender({},{});
  sheetButton.click();
  extraButton.click();
  assert.deepEqual(called,['toolkit:player1','extra:player1']);
  assert.ok(source.includes('data-open-sheet title="Открыть анкету"'));
  assert.ok(source.includes('<button type="button" data-open-extras>Редактор дополнений</button>'));

  // The custom character sheet API must never delegate to a standard system
  // sheet while Toolkit's sheet implementation is registered.
  const sheetHooks={};
  const secondary=baseContext({
    game:{modules:{get:()=>module},user:{id:'player',isGM:false},settings:{get:()=>({}),register(){},set:async()=>{}}},
    context:{Hooks:{once:(event,fn)=>sheetHooks[event]=fn,on(){}},document:undefined}
  });
  let toolkitRenders=0;
  secondary.foundry.applications.api.ApplicationV2.prototype.render=function(){toolkitRenders++;return this;};
  vm.createContext(secondary);
  const sheetSource=fs.readFileSync(path.join(__dirname,'../scripts/character-sheet.js'),'utf8');
  vm.runInContext(sheetSource,secondary,{filename:'character-sheet.js'});
  assert.ok(sheetHooks.ready);
  sheetHooks.ready();
  const a={isOwner:true,uuid:'Actor.owner',sheet:{render:()=>{throw Error('Should not open native FCO sheet');}}};
  module.api.openCharacterSheet(a);
  module.api.openCharacterSheet(a);
  assert.equal(toolkitRenders,2,'opening the sheet twice should reuse Toolkit sheet');
  console.log('unified-dock-routing.test.cjs OK');
})().catch(e=>{console.error(e);process.exitCode=1;});
