const assert = require('assert');
const { loadScript } = require('./harness.cjs');
const timelineKey='fate-aspect-widget.milestoneCampaignTimelineV1';
const sessionKey='fate-aspect-widget.milestoneSession';
const data=new Map([[timelineKey,[]],[sessionKey,{}]]);
const history=[
 {id:'m1',at:111,type:'minor',title:'First',changes:['Changed aspect']},
 {id:'m2',at:222,type:'significant',title:'Second',changes:['Skill +2 → +3'],sessionNumber:'5'},
 {id:'m3',at:333,type:'major',title:'Third',changes:[]}
];
const actor={id:'a1',name:'Hero',type:'fate-core-official',getFlag:(mod,key)=>key==='milestoneHistory'?history: key==='milestoneSkillPoints'?2:null};
const gm={id:'gm',isGM:true};
const others={id:'a2',name:'Other character'};
const game={
 user:gm,
 actors:{contents:[actor],get:(id)=>id==='a1'?actor:id==='a2'?others:null},
 settings:{get:(id,key)=>data.get(`${id}.${key}`),set:async(id,key,value)=>{data.set(`${id}.${key}`,value);},register(){}},
 i18n:{lang:'ru',localize:k=>k,format:(k,args)=>k+JSON.stringify(args)}
};
const {exports:m}=loadScript('scripts/milestones.js',[
 'publicMilestoneEvent','syncCampaignTimeline','campaignTimeline','developmentForActor'
],{game});
const session={id:'m4',type:'significant',title:'Discovery',note:'Session text',sessionNumber:'12',gameDate:'24.10.2012',createdBy:'gm',createdAt:1000,
 actors:{a1:{actorId:'a1',status:'pending',userIds:['user'],draft:{private:'secret'},reasons:['personal reason']},
 a2:{actorId:'a2',status:'completed',completedAt:2000,summary:['Took a stunt'],reasons:['secret reason']}}};
const publicEvent=JSON.parse(JSON.stringify(m.publicMilestoneEvent(session)));
assert.equal(publicEvent.participants[0].actorName,'Hero');
assert.deepEqual(publicEvent.participants[1].changes,['Took a stunt']);
assert.ok(!JSON.stringify(publicEvent).includes('secret'), 'public event must exclude private reasons/drafts');
assert.ok(!JSON.stringify(publicEvent).includes('userIds'), 'public event must exclude actor owner IDs');
assert.equal(publicEvent.sessionNumber,'12');
assert.equal(publicEvent.gameDate,'24.10.2012');
(async()=>{
 await m.syncCampaignTimeline(session);
 assert.equal(m.campaignTimeline().length,1);
 session.actors.a1.status='completed';session.actors.a1.summary=['Investigation +2 → +3'];
 await m.syncCampaignTimeline(session);
 assert.equal(m.campaignTimeline().length,1,'resubmitted session should update event rather than append');
 assert.deepEqual(Array.from(m.campaignTimeline()[0].participants.find(x=>x.actorId==='a1').changes),['Investigation +2 → +3']);
 await m.syncCampaignTimeline(session,{closedAt:4000});
 await m.syncCampaignTimeline(session); // GM reconnect may resync the still-active session.
 assert.equal(m.campaignTimeline()[0].closedAt,4000,'a closed event must not reopen when re-synced');
 data.set(sessionKey,{});
 let p=m.developmentForActor(actor);
 assert.equal(p.stage,4,'minor grants no stage; two significant and one major each grant one stage');
 assert.equal(p.bank,2);
 assert.equal(p.entries[0].id,'m3','personal history newest first');
 assert.equal(p.counts.major,1);
 // Old personal histories and the world archive for the same id count only once.
 data.set(timelineKey,[{id:'m3',type:'major',participants:[{actorId:'a1',status:'completed',changes:[]}]}]);
 p=m.developmentForActor(actor);
 assert.equal(p.stage,3,'archived duplicates must not double count');
 // Uncompleted changes must not grant a stage.
 data.set(timelineKey,[{id:'m5',type:'major',participants:[{actorId:'a1',status:'pending',changes:[]}]}]);
 p=m.developmentForActor(actor);assert.equal(p.stage,3);
 // Old personal records, including the 21st entry, must be retained by design.
 const src=require('fs').readFileSync(require('path').join(__dirname,'../scripts/milestones.js'),'utf8');
 assert.ok(!src.includes('while (entries.length > 20)'), 'milestone history must not silently truncate');
 assert.match(src,/await syncCampaignTimeline\(session, \{ closedAt: Date\.now\(\) \}\)/);
 console.log('milestone-timeline.test.cjs OK');
})().catch(err=>{console.error(err);process.exitCode=1;});
