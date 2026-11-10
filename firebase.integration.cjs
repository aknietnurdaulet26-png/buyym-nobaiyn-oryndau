'use strict';
// Run with: npx firebase-tools emulators:exec --only database --project demo-nobai "node firebase.integration.cjs"
const fs=require('node:fs'),assert=require('node:assert/strict');
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {RoomEngine}=require('./core.js'),bank=require('./questions.js');
(async()=>{
 const env=await initializeTestEnvironment({projectId:'demo-nobai',database:{host:'127.0.0.1',port:9000,rules:fs.readFileSync('firebase.rules.json','utf8')}});
 try{
  const room='618472',base=`nobaiV2/${room}`,teacher=env.authenticatedContext('teacher-uid').database(),other=env.authenticatedContext('other-uid').database();
  const owner=teacher.ref(base+'/meta/owner');
  assert.equal((await assertSucceeds(owner.transaction(old=>old===null?'teacher-uid':undefined))).committed,true);
  await assertFails(other.ref(base+'/meta/owner').set('other-uid'));
  await assertFails(teacher.ref(base+'/meta/owner').set('other-uid'));
  await assertFails(other.ref(base+'/snapshot').set({version:2,room,phase:'lobby',round:-1,revision:0}));
  await assertSucceeds(teacher.ref(base+'/meta/online').set(true));
  const e=new RoomEngine(bank);e.data.room=room;
  const students=Array.from({length:30},(_,i)=>({uid:'pupil-'+i,token:'student-token-000000-'+i,name:'Ученик '+i}));
  await Promise.all(students.map(async (p,i)=>{
   const db=env.authenticatedContext(p.uid).database(),channel=`${base}/clients/${p.uid}`;
   await assertSucceeds(db.ref(channel).update({instance:'instance-'+i,online:true}));
   const msg=db.ref(channel+'/up').push();
   await assertSucceeds(msg.set({id:msg.key,instance:'instance-'+i,seq:1,data:{type:'join',version:2,token:p.token,name:p.name}}));
   await assertFails(msg.set({id:msg.key,instance:'instance-'+i,seq:0,data:{type:'join',version:2,token:p.token,name:p.name}}));
   await assertFails(db.ref(`${base}/clients/pupil-${(i+1)%30}/online`).set(false));
   e.join(p.token,p.name);
  }));
  assert.equal(e.data.players.length,30);
  const overflow=e.save();overflow.players.push({token:'overflow-token-12345678',name:'31',slot:30,score:0,answers:{},progress:0});
  await assertFails(teacher.ref(base+'/snapshot').set(overflow));
  await assertFails(env.authenticatedContext('pupil-30').database().ref(base+'/snapshot').set({version:2,room,phase:'lobby',round:-1,revision:1}));
  assert.throws(()=>e.join('student-token-31-extra','31'),/full/);
  await assertSucceeds(teacher.ref(base+'/snapshot').set(e.save()));
  assert.equal((await assertSucceeds(teacher.ref(base+'/clients').get())).numChildren(),30);
  const first=env.authenticatedContext(students[0].uid).database(),firstChannel=`${base}/clients/${students[0].uid}`;
  await assertFails(first.ref(base+'/clients').get());
  await assertFails(first.ref(`${base}/clients/${students[1].uid}/down`).get());
  await assertFails(first.ref(base+'/snapshot').get());
  await assertFails(first.ref(base).update({snapshot:{version:2},'meta/owner':'pupil-0'}));
  await assertFails(first.ref(firstChannel+'/up/bad').set({id:'bad',instance:'instance-0',seq:2,data:{type:'answer',round:0,choice:9}}));
  e.start();await assertSucceeds(teacher.ref(base+'/snapshot').set(e.save()));
  const answers=await Promise.all(students.map(async(p,i)=>{
   const db=env.authenticatedContext(p.uid).database(),msg=db.ref(`${base}/clients/${p.uid}/up`).push();
   const player=e.data.players.find(x=>x.token===p.token),choice=e.q(player,0).correct;
   await assertSucceeds(msg.set({id:msg.key,instance:'instance-'+i,seq:2,data:{type:'answer',round:0,choice}}));
   return e.answer(p.token,0,choice);
  }));
  assert(answers.every(x=>x.accepted));
  await assertSucceeds(teacher.ref(base+'/snapshot').set(e.save()));
  for(const p of students)assert.equal(e.answer(p.token,0,0).duplicate,true);
  assert.equal(e.board().length,30);assert(e.board().every(x=>x.score===100));
  await assertFails(first.ref(base+'/snapshot').set(e.save()));
  await assertSucceeds(teacher.ref(firstChannel+'/down/state').set({instance:'instance-0',seq:1,data:{type:'state',board:[],room,version:2}}));
  await assertFails(teacher.ref(firstChannel+'/down/state').set({instance:'instance-0',seq:0,data:{type:'state',board:[],room,version:2}}));
  await assertFails(other.ref(firstChannel+'/down/ack').set({instance:'instance-0',seq:1,data:{type:'ack',round:0,accepted:true}}));
  await assertSucceeds(first.ref(firstChannel+'/online').onDisconnect().set(false));
  console.log(JSON.stringify({passed:true,simulatedClients:30,acceptedAnswers:30,duplicateAnswers:30,roomCount:30,securityRules:'positive and negative emulator cases',scope:'Realtime Database emulator; not 30 physical devices'},null,2));
 }finally{await env.cleanup();}
})().catch(e=>{console.error(e);process.exitCode=1;});
