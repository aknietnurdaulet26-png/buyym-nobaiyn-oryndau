'use strict';
const QuizCore={
 MAX_PLAYERS:30, ROUNDS:15,
 questionIndex(slot,round,offsets){const level=(round+Math.floor(slot/22))%3;return (slot%22+Math.floor(round/3)*3+offsets[level])%22;},
 question(bank,slot,round,offsets){const level=(round+Math.floor(slot/22))%3,index=this.questionIndex(slot,round,offsets),raw=bank[level][index],shift=(slot*7+round*3+offsets[level])%4;return {id:level*22+index,text:raw[0],options:Array.from({length:4},(_,i)=>raw[1+(i+shift)%4]),correct:(4-shift)%4,level,index};},
 ranking(players){const sorted=[...players].sort((a,b)=>b.score-a.score||a.slot-b.slot);let rank=1;return sorted.map((p,i)=>{if(i&&p.score!==sorted[i-1].score)rank=i+1;return {...p,rank};});},
 csvCell(v){let s=String(v);if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';},
 cleanName(v){return typeof v==='string'?v.trim().replace(/[\u0000-\u001f\u007f]/g,'').slice(0,32):'';}
};
class RoomEngine{
 constructor(bank,snapshot){this.bank=bank;this.data=snapshot?JSON.parse(JSON.stringify(snapshot)):{version:2,room:'',phase:'lobby',round:-1,deadline:0,mode:'rounds',duration:45,offsets:[0,0,0],players:[],revision:0};if(this.data.version!==2)throw Error('version');}
 save(){return JSON.parse(JSON.stringify(this.data));}
 touch(){this.data.revision++;}
 join(token,name){if(typeof token!=='string'||token.length<16||token.length>100)throw Error('invalid');let p=this.data.players.find(p=>p.token===token);if(p)return p;if(this.data.phase!=='lobby')throw Error('started');if(this.data.players.length>=30)throw Error('full');name=QuizCore.cleanName(name);if(!name)throw Error('name');if(this.data.players.some(p=>p.name.toLocaleLowerCase()===name.toLocaleLowerCase()))throw Error('duplicate');p={token,name,slot:this.data.players.length,score:0,answers:{},progress:0};this.data.players.push(p);this.touch();return p;}
 start(now=Date.now()){if(this.data.phase!=='lobby'||!this.data.players.length)return false;this.data.phase='active';this.data.round=0;this.data.deadline=now+this.data.duration*1000;this.touch();return true;}
 next(now=Date.now()){if(this.data.phase!=='review'||this.data.mode!=='rounds')return false;if(this.data.round>=14){this.data.phase='ended';}else{this.data.round++;this.data.phase='active';this.data.deadline=now+this.data.duration*1000;}this.touch();return true;}
 close(){if(this.data.phase!=='active')return;this.data.phase=this.data.mode==='self'?'ended':'review';this.touch();}
 q(p,round,bank=this.bank){return QuizCore.question(bank,p.slot,round,this.data.offsets);}
 answer(token,r,choice,now=Date.now()){const p=this.data.players.find(x=>x.token===token);if(!p)throw Error('invalid');if(p.answers[r])return {accepted:true,duplicate:true};if(this.data.phase!=='active'||!Number.isInteger(r)||r<0||r>=15||r!==(this.data.mode==='self'?p.progress:this.data.round)||!Number.isInteger(choice)||choice<0||choice>3)return {accepted:false};if(this.data.mode==='rounds'&&now>this.data.deadline)return {accepted:false};const correct=choice===this.q(p,r).correct;p.answers[r]={choice,correct,at:now};p.score+=correct?100:0;p.progress=Object.keys(p.answers).length;this.touch();if(this.data.mode==='self'&&this.data.players.every(x=>x.progress===15)){this.data.phase='ended';this.touch();}return {accepted:true,correct};}
 board(online=()=>false){return QuizCore.ranking(this.data.players.map(p=>({name:p.name,slot:p.slot,score:p.score,progress:p.progress,online:online(p.token),answered:!!p.answers[this.data.round]})));}
 state(token,online=()=>false,now=Date.now()){const p=this.data.players.find(x=>x.token===token);if(!p)return null;const d=this.data,r=d.mode==='self'?p.progress:d.round;return {type:'state',version:2,revision:d.revision,room:d.room,phase:d.phase,round:r,mode:d.mode,slot:p.slot,offsets:d.offsets,remaining:Math.max(0,d.deadline-now),answers:p.answers,board:this.board(online)};}
}
if(typeof module!=='undefined')module.exports={...QuizCore,RoomEngine};
