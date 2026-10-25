const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { baseContext } = require('./harness.cjs');

(async () => {
  const root = path.join(__dirname, '..');
  const gm = { id:'gm1', name:'GM', active:true, isGM:true, getFlag:()=>undefined };
  const p1 = { id:'p1', name:'Player One', active:true, isGM:false, getFlag:()=>undefined };
  const p2 = { id:'p2', name:'Player Two', active:true, isGM:false, getFlag:()=>undefined };
  const users = [gm,p1,p2];
  const messages = new Map();
  let messageSeq = 0;
  const handlers = new Map();
  const moduleRecord = { version:'1.31.0', api:{} };

  const context = baseContext({ users, user:gm });
  context.game.version = '13.351';
  context.game.system = { id:'fate-core-official', version:'4.7.13.6' };
  context.game.users = { contents:users, activeGM:gm, get:id => users.find(u => u.id === id) || null };
  context.game.modules = { get:id => id === 'fate-aspect-widget' ? moduleRecord : id === 'socketlib' ? {active:true} : null };
  context.game.messages = {
    contents:[],
    get(id) {
      const message = messages.get(String(id));
      if (!message) return null;
      if (!Array.isArray(message.whisper) || message.whisper.length === 0) return message;
      if (context.game.user?.isGM) return message;
      return message.whisper.map(String).includes(String(context.game.user?.id)) ? message : null;
    }
  };
  context.ChatMessage = {
    async create(data) {
      const id = `m${++messageSeq}`;
      const message = {
        id,
        content:data.content || '',
        whisper:Array.isArray(data.whisper) ? data.whisper.map(String) : [],
        flags:data.flags || {},
        getFlag(moduleId,key) { return this.flags?.[moduleId]?.[key]; },
        async delete() { messages.delete(id); }
      };
      messages.set(id,message);
      return message;
    }
  };
  context.console = { ...console, groupCollapsed(){}, groupEnd(){}, table(){} };
  context.FateToolkitUX = { info(){}, error(){} };

  const rpc = {
    ready:true,
    register(channel,handler) { handlers.set(channel,handler); },
    senderIsGM(senderId) { return Boolean(users.find(u => u.id === senderId)?.isGM); },
    assertGM(senderId) { if (!this.senderIsGM(senderId)) throw new Error('not gm'); },
    assertSender(senderId,expected) { if (String(senderId)!==String(expected)) throw new Error('sender mismatch'); },
    async executeAsUser(channel,userId,payload) {
      const sender = context.game.user;
      const target = users.find(u => u.id === userId);
      if (!target) throw new Error('missing target');
      const previous = context.game.user;
      context.game.user = target;
      try { return await handlers.get(channel)(payload,{senderId:String(sender.id),remote:true}); }
      finally { context.game.user = previous; }
    },
    async executeAsGM(channel,payload) {
      const sender = context.game.user;
      const previous = context.game.user;
      context.game.user = gm;
      try { return await handlers.get(channel)(payload,{senderId:String(sender.id),remote:true}); }
      finally { context.game.user = previous; }
    },
    async executeForUsers(channel,userIds,payload) {
      const out=[];
      for (const userId of userIds) {
        try { out.push({userId,ok:true,value:await this.executeAsUser(channel,userId,payload)}); }
        catch(error) { out.push({userId,ok:false,error:String(error?.message||error)}); }
      }
      return out;
    }
  };
  context.FateToolkitRPC = rpc;

  vm.createContext(context);
  for (const rel of ['scripts/opposition-public.js','scripts/multi-client-diagnostic.js']) {
    vm.runInContext(fs.readFileSync(path.join(root,rel),'utf8'),context,{filename:rel});
  }

  const report = await context.FateToolkitMultiClientDiagnostic.run({notify:false,cleanup:true});
  assert.equal(report.ok,true, JSON.stringify(report.checks.filter(row=>!row.ok),null,2));
  assert.equal(report.participants,2);
  assert.equal(report.failed,0);
  assert.equal(messages.size,0,'diagnostic must clean up temporary ChatMessages');
  assert.equal(report.probes.length,2);
  for (const result of report.probes) {
    assert.equal(result.ok,true);
    assert.equal(result.value.gmOnlyPresent,false);
    assert.equal(result.value.publicMessage.dtoSafe,true);
    assert.deepEqual(Array.from(result.value.publicMessage.forbiddenDtoKeys),[]);
    assert.equal(result.value.echo.ok,true);
    assert.equal(result.value.echo.senderId,result.userId);
    const wrong=result.value.targetedVisibility.filter(row=>Boolean(row.present)!==Boolean(row.shouldBePresent));
    assert.equal(wrong.length,0);
  }

  context.game.user = p1;
  await assert.rejects(
    () => handlers.get('diagnostic:client-probe')({sessionId:'forged'},{senderId:'p2',remote:true}),
    /not gm|sender mismatch/
  );
  context.game.user = gm;

  const originalCreate = context.ChatMessage.create;
  let createCount = 0;
  context.ChatMessage.create = async data => {
    createCount += 1;
    if (createCount === 3) throw new Error('synthetic create failure');
    return originalCreate(data);
  };
  const failedCreateReport = await context.FateToolkitMultiClientDiagnostic.run({notify:false,cleanup:true});
  assert.equal(failedCreateReport.ok,false);
  assert.ok(failedCreateReport.checks.some(row => row.name === 'diagnostic execution' && /synthetic create failure/.test(row.detail)));
  assert.equal(messages.size,0,'partial diagnostic creation must clean up already-created messages');
  context.ChatMessage.create = originalCreate;

  console.log('multi-client-diagnostic.test.cjs OK');
})().catch(error => { console.error(error); process.exit(1); });
