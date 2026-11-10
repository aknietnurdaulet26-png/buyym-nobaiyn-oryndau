'use strict';
// The teacher's RoomEngine remains the only scoring authority.
class PeerTransport{
 constructor(){this.peer=null;this.connections=new Set();}
 async openHost(code,onConnection,status){return this.open('nobai-lab-v2-'+code,p=>p.on('connection',c=>{this.connections.add(c);onConnection(this.wrap(c));}),status);}
 async openClient(code,status){await this.open(undefined,()=>{},status);const c=this.peer.connect('nobai-lab-v2-'+code,{reliable:true,serialization:'json'});this.connections.add(c);return this.wrap(c);}
 wrap(c){return {get open(){return c.open;},send:d=>{if(c.open)c.send(d);},on:(e,fn)=>c.on(e,fn),close:()=>c.close()};}
 open(id,setup,status){return new Promise((resolve,reject)=>{if(!window.Peer){reject(Error('library'));return;}let settled=false;const p=this.peer=new Peer(id,window.NOBAI_CONFIG.peerOptions||{});const timer=setTimeout(()=>{if(!settled){settled=true;p.destroy();reject(Error('timeout'));}},20000);setup(p);p.on('open',()=>{clearTimeout(timer);if(!settled){settled=true;resolve();}status(id?'connected':'connecting');});p.on('error',e=>{const k={'peer-unavailable':'peerUnavailable','unavailable-id':'unavailableId','network':'networkError','disconnected':'networkError'}[e.type]||'timeout';if(!settled){settled=true;clearTimeout(timer);reject(Error(k));}else status(k);});p.on('disconnected',()=>{status('reconnecting');if(!p.destroyed){try{p.reconnect();}catch{}}});});}
 async saveHost(){} async loadHost(){return null;} startHost(){}
 close(){this.connections.forEach(c=>c.close());this.peer?.destroy();}
}
class FirebaseTransport{
 constructor(){this.stops=[];this.channels=new Map();this.closed=false;this.seq=Date.now()*1000;this.connected=false;this.status=()=>{};this.client=null;this.host=false;}
 async init(status){
  const config=window.NOBAI_CONFIG.firebaseConfig;
  if(!config?.apiKey||!config?.appId||!config?.databaseURL||!config?.projectId||/FIREBASE_WEB_/.test(config.apiKey+config.appId))throw Error('firebaseSetup');
  this.status=status;
  try{
   const [a,u,d]=await Promise.all([import('https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js'),import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js'),import('https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js')]);
   this.sdk=d;this.app=a.getApps().find(x=>x.name==='nobai')||a.initializeApp(config,'nobai');this.auth=u.getAuth(this.app);
   await u.setPersistence(this.auth,u.browserLocalPersistence);await this.auth.authStateReady();
   if(!this.auth.currentUser)await u.signInAnonymously(this.auth);
   this.uid=this.auth.currentUser.uid;this.db=d.getDatabase(this.app);
   this.stops.push(d.onValue(d.ref(this.db,'.info/connected'),s=>{this.connected=!!s.val();status(this.connected?'connected':'reconnecting');if(this.connected)this.client?.flush();},()=>status('networkError')));
  }catch(e){throw Error(/permission|denied|operation-not-allowed/i.test(e.code||'')?'permission':'firebaseSetup');}
 }
 ref(p=''){return this.sdk.ref(this.db,`nobaiV2/${this.code}${p?'/'+p:''}`);}
 async openHost(code,onConnection,status){await this.init(status);this.code=code;this.host=true;const d=this.sdk;
  const existing=await d.get(this.ref('meta/owner'));
  if(existing.exists()){if(existing.val()!==this.uid)throw Error('unavailableId');}
  else{const result=await d.runTransaction(this.ref('meta/owner'),old=>old===null?this.uid:undefined,{applyLocally:false});if(!result.committed||result.snapshot.val()!==this.uid)throw Error('unavailableId');}
  await d.onDisconnect(this.ref('meta/online')).set(false);
  await d.set(this.ref('meta/online'),true);
  this.onConnection=onConnection;
 }
 startHost(){this.stops.push(this.sdk.onChildAdded(this.ref('clients'),s=>{if(!this.closed)this.watchClient(s.key,this.onConnection);},()=>this.status('permission')));}
 watchClient(uid,onConnection){if(this.channels.has(uid)||uid===this.uid)return;const d=this.sdk,base=`clients/${uid}`;let c=null,stopUp=null;this.channels.set(uid,null);
  this.stops.push(()=>stopUp?.());
  this.stops.push(d.onValue(this.ref(base+'/instance'),s=>{const instance=s.val();if(!instance||this.closed||instance===c?.instance)return;
   if(c){c.emit('close');c.close();}stopUp?.();c=this.channel(uid,instance,true);this.channels.set(uid,c);onConnection(c);c.emit('open');
   stopUp=d.onChildAdded(this.ref(base+'/up'),m=>{const v=m.val();if(this.closed||v?.instance!==c.instance||v.seq<=c.lastUp)return;c.lastUp=v.seq;c.emit('data',v.data);},()=>this.status('permission'));
  },()=>this.status('permission')));
  this.stops.push(d.onValue(this.ref(base+'/online'),s=>{if(c){c.alive=s.val()===true;if(!c.alive)c.emit('close');}},()=>this.status('permission')));
 }
 channel(uid,instance,isHost){const events={},self=this;return {uid,instance,lastUp:0,lastState:0,lastAck:0,alive:true,closed:false,pending:new Map(),
  get open(){return !this.closed&&this.alive&&!self.closed;},
  on(e,fn){(events[e]??=[]).push(fn);},emit(e,x){for(const fn of events[e]||[])fn(x);},
  send(data){if(!this.open)return;const seq=++self.seq;if(isHost){
    const field=data.type==='ack'||data.type==='error'?'ack':'state';
    self.sdk.set(self.ref(`clients/${uid}/down/${field}`),{instance:this.instance,seq,data}).catch(()=>this.emit('error'));
   }else if(data.type!=='sync'){
    const ref=self.sdk.push(self.ref(`clients/${uid}/up`)),id=ref.key,packet={instance:this.instance,seq,id,data};
    this.pending.set(id,packet);this.flush();
   }},
  flush(){if(!this.open||!self.connected)return;for(const [id,packet]of [...this.pending]){
   if(packet.sent&&Date.now()-packet.sent<5000)continue;
   if(packet.sent){this.pending.delete(id);packet.id=self.sdk.push(self.ref(`clients/${uid}/up`)).key;packet.seq=++self.seq;}
   packet.sent=Date.now();this.pending.set(packet.id,packet);
   const {sent,...wire}=packet;
   self.sdk.set(self.ref(`clients/${uid}/up/${packet.id}`),wire).catch(()=>this.emit('error'));
  }},
  confirm(data){for(const [id,p]of this.pending){if(data.type==='state'&&(p.data.type==='join'||p.data.type==='answer'&&data.answers?.[p.data.round])||data.type==='ack'&&p.data.type==='answer'&&p.data.round===data.round||data.type==='error'&&p.data.type==='join')this.pending.delete(id);}},
  close(){this.closed=true;this.alive=false;this.pending.clear();}
 };}
 async openClient(code,status){await this.init(status);this.code=code;const d=this.sdk,owner=await d.get(this.ref('meta/owner'));if(!owner.exists())throw Error('peerUnavailable');
  const instance=Array.from(crypto.getRandomValues(new Uint32Array(3))).join('-'),c=this.channel(this.uid,instance,false);this.client=c;const base=`clients/${this.uid}`;
  this.stops.push(d.onValue(this.ref(base+'/down/state'),s=>{const v=s.val();if(v?.instance===instance&&v.seq>c.lastState){c.lastState=v.seq;c.confirm(v.data);c.emit('data',v.data);}},()=>status('permission')));
  this.stops.push(d.onValue(this.ref(base+'/down/ack'),s=>{const v=s.val();if(v?.instance===instance&&v.seq>c.lastAck){c.lastAck=v.seq;c.confirm(v.data);c.emit('data',v.data);}},()=>status('permission')));
  this.stops.push(d.onValue(this.ref('meta/online'),s=>{if(s.val()===false){c.alive=false;c.emit('close');status('reconnecting');}else if(s.val()===true){c.alive=true;c.flush();}},()=>status('permission')));
  await d.onDisconnect(this.ref(base+'/online')).set(false);
  await d.update(this.ref(base),{instance,online:true});
  queueMicrotask(()=>{if(!this.closed)c.emit('open');});return c;
 }
 async saveHost(snapshot){await this.sdk.set(this.ref('snapshot'),snapshot);}
 async loadHost(){const s=await this.sdk.get(this.ref('snapshot')),v=s.val();if(v){v.players=Array.isArray(v.players)?v.players:[];for(const p of v.players)p.answers??={};}return v;}
 close(){this.closed=true;for(const stop of this.stops)stop();for(const c of this.channels.values())c?.close();this.client?.close();if(this.code&&this.sdk){const path=this.host?'meta/online':`clients/${this.uid}/online`;this.sdk.set(this.ref(path),false).catch(()=>{});this.sdk.onDisconnect(this.ref(path)).cancel().catch(()=>{});}}
}
function makeTransport(){return window.NOBAI_CONFIG.transport==='firebase'?new FirebaseTransport():new PeerTransport();}
if(typeof module!=='undefined')module.exports={FirebaseTransport,PeerTransport};
