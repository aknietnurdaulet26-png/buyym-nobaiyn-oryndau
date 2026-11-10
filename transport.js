'use strict';
// Transport never scores answers; RoomEngine is the single authority on the teacher device.
class PeerTransport{
 constructor(){this.peer=null;this.connections=new Set();}
 async openHost(code,onConnection,status){return this.open('nobai-lab-v2-'+code,p=>p.on('connection',c=>{this.connections.add(c);onConnection(this.wrap(c));}),status);}
 async openClient(code,status){await this.open(undefined,()=>{},status);const c=this.peer.connect('nobai-lab-v2-'+code,{reliable:true,serialization:'json'});this.connections.add(c);return this.wrap(c);}
 wrap(c){return {get open(){return c.open;},send:d=>{if(c.open)c.send(d);},on:(e,fn)=>c.on(e,fn),close:()=>c.close()};}
 open(id,setup,status){return new Promise((resolve,reject)=>{if(!window.Peer){reject(Error('library'));return;}let settled=false;const p=this.peer=new Peer(id,window.NOBAI_CONFIG.peerOptions||{});const timer=setTimeout(()=>{if(!settled){settled=true;p.destroy();reject(Error('timeout'));}},20000);setup(p);p.on('open',()=>{clearTimeout(timer);if(!settled){settled=true;resolve();}status(id?'connected':'connecting');});p.on('error',e=>{const k={'peer-unavailable':'peerUnavailable','unavailable-id':'unavailableId','network':'networkError','disconnected':'networkError'}[e.type]||'timeout';if(!settled){settled=true;clearTimeout(timer);reject(Error(k));}else status(k);});p.on('disconnected',()=>{status('reconnecting');if(!p.destroyed){try{p.reconnect();}catch{}}});});}
 async saveHost(){} async loadHost(){return null;}
 close(){this.connections.forEach(c=>c.close());this.peer?.destroy();}
}
class FirebaseTransport{
 constructor(){this.stops=[];this.channels=new Map();this.closed=false;this.seq=0;}
 async init(status){
  const config=window.NOBAI_CONFIG.firebaseConfig;if(!config?.apiKey||!config?.databaseURL||!config?.projectId)throw Error('firebaseSetup');
  try{
   const [a,u,d]=await Promise.all([import('https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js'),import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js'),import('https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js')]);
   this.sdk=d;this.app=a.getApps().find(x=>x.name==='nobai')||a.initializeApp(config,'nobai');this.auth=u.getAuth(this.app);await u.setPersistence(this.auth,u.browserSessionPersistence);await this.auth.authStateReady();if(!this.auth.currentUser)await u.signInAnonymously(this.auth);this.uid=this.auth.currentUser.uid;this.db=d.getDatabase(this.app);this.stops.push(d.onValue(d.ref(this.db,'.info/connected'),s=>status(s.val()?'connected':'reconnecting')));
  }catch(e){throw Error(/permission|denied|operation-not-allowed/i.test(e.code||'')?'permission':'firebaseSetup');}
 }
 ref(p=''){return this.sdk.ref(this.db,`nobaiV2/${this.code}${p?'/'+p:''}`);}
 async openHost(code,onConnection,status){await this.init(status);this.code=code;const d=this.sdk;
  const result=await d.runTransaction(this.ref('meta/owner'),old=>old===null?this.uid:old,{applyLocally:false});if(result.snapshot.val()!==this.uid)throw Error('unavailableId');
  await d.set(this.ref('meta/online'),true);await d.onDisconnect(this.ref('meta/online')).set(false);
  this.stops.push(d.onValue(this.ref('clients'),snap=>{if(this.closed)return;const all=snap.val()||{};for(const [uid,v]of Object.entries(all)){
   if(!v.instance||!v.up)continue;let c=this.channels.get(uid);if(c?.instance!==v.instance){c?.emit('close');c=this.channel(uid,v.instance,true);this.channels.set(uid,c);onConnection(c);c.emit('open');}
   c.alive=v.online!==false;if(v.up.instance===v.instance&&v.up.seq>c.last){c.last=v.up.seq;c.emit('data',v.up.data);}if(!c.alive)c.emit('close');
  }},()=>status('permission')));
 }
 channel(uid,instance,isHost){const events={},self=this;return {uid,instance,last:0,alive:true,get open(){return this.alive&&!self.closed;},on(e,fn){(events[e]??=[]).push(fn);},emit(e,x){(events[e]||[]).forEach(fn=>fn(x));},send(data){const field=isHost?'down':'up';return self.sdk.set(self.ref(`clients/${uid}/${field}`),{instance,seq:++self.seq,data}).catch(()=>this.emit('error'));},close(){this.alive=false;},};}
 async openClient(code,status){await this.init(status);this.code=code;const d=this.sdk;const owner=await d.get(this.ref('meta/owner'));if(!owner.exists())throw Error('peerUnavailable');const instance=Array.from(crypto.getRandomValues(new Uint32Array(3))).join('-');const c=this.channel(this.uid,instance,false);this.client=c;
  this.stops.push(d.onValue(this.ref(`clients/${this.uid}/down`),snap=>{const v=snap.val();if(v?.instance===instance&&v.seq>c.last){c.last=v.seq;c.emit('data',v.data);}},()=>status('permission')));
  await d.update(this.ref(`clients/${this.uid}`),{instance,online:true});await d.onDisconnect(this.ref(`clients/${this.uid}/online`)).set(false);
  setTimeout(()=>c.emit('open'),0);return c;
 }
 async saveHost(snapshot){await this.sdk.set(this.ref('snapshot'),snapshot);}
 async loadHost(){const s=await this.sdk.get(this.ref('snapshot'));return s.val();}
 close(){this.closed=true;this.stops.forEach(stop=>stop());if(this.client)this.sdk.set(this.ref(`clients/${this.uid}/online`),false).catch(()=>{});}
}
function makeTransport(){return window.NOBAI_CONFIG.transport==='firebase'?new FirebaseTransport():new PeerTransport();}
