'use strict';
const $=id=>document.getElementById(id);
let peer, connection, host=false, room='', round=-1, phase='lobby', deadline=0, players=[], offsets=[0,0,0], myState=null, localDeadline=0, pending=false, lastSeen=0, role='', joinTimer;
const links=new Map();
let token=sessionStorage.getItem('nobai-token');
if(!token){token=Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,'0')).join('');sessionStorage.setItem('nobai-token',token);}
function random(n){const a=new Uint32Array(1);crypto.getRandomValues(a);return a[0]%n;}
function notice(text){$('notice').textContent=text;$('notice').hidden=!text;}
function network(text){$('network').textContent=text;}
function cleanName(name){return typeof name==='string'?name.trim().replace(/[\u0000-\u001f\u007f]/g,'').slice(0,32):'';}
function send(c,data){if(c?.open){try{c.send(data);}catch{network('Байланысты тексеріңіз');}}}
function enter(){ $('home').hidden=true;$('game').hidden=false;$('hostControls').hidden=!host;$('roomCode').textContent=room;notice('');}
function setupPeer(id){
  if(!window.Peer){notice('Байланыс кітапханасы жүктелмеді. Интернетті тексеріп, бетті жаңартыңыз.');return null;}
  const p=id?new Peer(id):new Peer();
  p.on('error',e=>{clearTimeout(joinTimer);pending=false;$('create').disabled=false;$('joinForm').querySelector('button').disabled=false;
    const errors={'unavailable-id':'Бұл бөлме коды бос емес. Бөлмені қайта ашыңыз.','peer-unavailable':'Бөлме табылмады. Кодты және мұғалімнің байланысын тексеріңіз.','network':'Интернет байланысы үзілді. Қайта қосылып көріңіз.','webrtc':'Құрылғылар қосыла алмады. Басқа Wi-Fi не мобильді интернетпен тексеріңіз.'};
    notice(errors[e.type]||'Байланыс орнатылмады. Интернетті тексеріп, қайта қосылыңыз.');network('Байланыс қатесі');if(!host)$('reconnect').hidden=false;
  });
  p.on('disconnected',()=>{network('Сервермен байланыс үзілді');if(!p.destroyed){try{p.reconnect();}catch{}}});
  return p;
}
function questionFor(p){return QuizCore.question(BANK,p.slot,round,offsets);}
function board(){return QuizCore.ranking(players.map(p=>({name:p.name,slot:p.slot,score:p.score,online:!!links.get(p.token)?.open,answered:round>=0&&!!p.answers[round]})));}
function stateFor(p){const a=p.answers[round], q=round>=0?questionFor(p):null;return {type:'state',phase,round,room,slot:p.slot,remaining:Math.max(0,deadline-Date.now()),board:board(),question:q?{text:q.text,options:q.options,level:q.level}:null,answer:a?{choice:a.choice,correct:phase!=='active'?q.correct:null}:null,reveal:phase!=='active'&&q?q.correct:null};}
function broadcast(){for(const p of players)send(links.get(p.token),stateFor(p));renderHost();}
function accept(c){
  let identity=null;
  const authTimer=setTimeout(()=>{if(!identity)c.close();},12000);
  c.on('data',data=>{
    if(!data||typeof data!=='object')return;
    if(!identity){
      if(data.type!=='join'||typeof data.token!=='string'||data.token.length>80||!cleanName(data.name)){send(c,{type:'error',text:'Есіміңізді дұрыс енгізіңіз.'});return;}
      let p=players.find(x=>x.token===data.token);
      if(!p){
        if(phase!=='lobby'){send(c,{type:'error',text:'Ойын басталып кетті. Жаңа ойынға қосылыңыз.'});return;}
        if(players.length>=22){send(c,{type:'error',text:'Бөлме толы: 22 оқушы.'});return;}
        const name=cleanName(data.name);
        if(players.some(x=>x.name.toLocaleLowerCase()===name.toLocaleLowerCase())){send(c,{type:'error',text:'Бұл есім қолданылып тұр. Тегіңіздің бас әрпін қосыңыз.'});return;}
        p={token:data.token,name,slot:players.length,score:0,answers:{}};players.push(p);
      }
      identity=p.token;clearTimeout(authTimer);const old=links.get(identity);links.set(identity,c);if(old&&old!==c)old.close();broadcast();return;
    }
    if(links.get(identity)!==c)return;
    const p=players.find(x=>x.token===identity);
    if(data.type==='sync'){send(c,stateFor(p));return;}
    if(data.type==='answer'){
      if(phase==='active'&&Date.now()>=deadline)finishRound();
      if(phase!=='active'||data.round!==round||p.answers[round]||!Number.isInteger(data.choice)||data.choice<0||data.choice>3){send(c,stateFor(p));return;}
      const correct=questionFor(p).correct;
      p.answers[round]={choice:data.choice};if(data.choice===correct)p.score+=100;
      broadcast();
    }
  });
  c.on('close',()=>{clearTimeout(authTimer);if(identity&&links.get(identity)===c){links.delete(identity);broadcast();}});
  c.on('error',()=>{network('Бір оқушының байланысы үзілді');});
}
$('create').onclick=()=>{
  if(pending)return;pending=true;host=true;role='host';room=String(100000+random(900000));peer?.destroy();peer=setupPeer('nobai-lab-v1-'+room);
  if(!peer){pending=false;return;}$('create').disabled=true;
  peer.on('open',()=>{pending=false;offsets=[random(22),random(22),random(22)];enter();network('Мұғалім · қосылды');renderHost();});peer.on('connection',accept);
};
function join(){
  if(pending)return;
  const name=cleanName($('name').value),code=$('code').value.trim();
  if(!name||!/^\d{6}$/.test(code)){notice('Есіміңіз бен 6 таңбалы кодты енгізіңіз.');return;}
  pending=true;host=false;role='student';room=code;sessionStorage.setItem('nobai-name',name);sessionStorage.setItem('nobai-room',room);peer?.destroy();peer=setupPeer();
  if(!peer){pending=false;return;}
  $('joinForm').querySelector('button').disabled=true;network('Қосылуда…');notice('');
  joinTimer=setTimeout(()=>{pending=false;$('joinForm').querySelector('button').disabled=false;notice('Қосылу уақыты аяқталды. Мұғалімнің қойындысы ашық екенін тексеріп, қайта қосылыңыз.');$('reconnect').hidden=false;},20000);
  peer.on('open',()=>{
    connection=peer.connect('nobai-lab-v1-'+room,{reliable:true,serialization:'json'});
    connection.on('open',()=>send(connection,{type:'join',name,token}));
    connection.on('data',data=>{
      if(!data||typeof data!=='object')return;
      if(data.type==='error'){clearTimeout(joinTimer);pending=false;notice(data.text);$('joinForm').querySelector('button').disabled=false;connection.close();return;}
      if(data.type==='state'){
        clearTimeout(joinTimer);pending=false;lastSeen=Date.now();localDeadline=Date.now()+data.remaining;
        const changed=!myState||myState.round!==data.round||myState.phase!==data.phase||JSON.stringify(myState.answer)!==JSON.stringify(data.answer);
        myState=data;enter();network('Оқушы · қосылды');$('reconnect').hidden=true;
        if(changed)renderStudent();renderBoard(data.board,data.slot);
      }
    });
    connection.on('close',lost);connection.on('error',lost);
  });
}
function lost(){if(role!=='student')return;pending=false;network('Байланыс үзілді');$('reconnect').hidden=false;document.querySelectorAll('.answer').forEach(b=>b.disabled=true);notice('Байланыс үзілді. Осы беттегі «Қайта қосылу» батырмасын басыңыз. Есім мен ұпай сақталады.');$('joinForm').querySelector('button').disabled=false;}
$('joinForm').onsubmit=e=>{e.preventDefault();join();};$('reconnect').onclick=()=>{myState=null;join();};
function renderBoard(rows,me){
  $('ranking').replaceChildren();
  if(!rows.length){const li=document.createElement('li');li.textContent='Әзірге оқушы қосылған жоқ';$('ranking').append(li);return;}
  for(const p of rows){const li=document.createElement('li');if(p.slot===me)li.className='me';const rank=document.createElement('span');rank.className='rank';rank.textContent=p.rank;const name=document.createElement('span');name.className='person';name.textContent=p.name+(p.online?'':' · байланыс жоқ')+(p.answered?' ✓':'');const score=document.createElement('b');score.textContent=p.score+' ұпай';li.append(rank,name,score);$('ranking').append(li);}
}
function renderHost(){
  $('count').textContent=players.length+' / 22 оқушы · '+players.filter(p=>links.get(p.token)?.open).length+' желіде';
  $('gameTitle').textContent=phase==='ended'?'Ойын аяқталды!':'Мұғалім тақтасы';
  $('stage').textContent=round<0?'ДАЙЫНДЫҚ':`${round+1} / 15 КЕЗЕҢ · ${['БІЛУ','ҚОЛДАНУ','ТАЛДАУ'][round%3]}`;
  $('bar').style.width=Math.max(0,(round+1)/15*100)+'%';
  $('next').disabled=!players.length||phase==='active'||phase==='ended';$('next').textContent=round<0?'Ойынды бастау':round===14?'Қорытындыны көрсету':'Келесі кезең →';$('closeRound').hidden=phase!=='active';
  $('question').textContent=phase==='lobby'?'Оқушыларды күтеміз':phase==='active'?'Әр оқушы өз сұрағына жауап беруде':phase==='ended'?'Жарайсыңдар! Бүгінгі жұмыс аяқталды.':'Кезең аяқталды';
  $('answers').replaceChildren();const answered=players.filter(p=>p.answers[round]).length;
  $('feedback').textContent=phase==='lobby'?'Барлық 22 оқушы қосылған соң бастаңыз. Аз оқушымен де бастауға болады.':phase==='ended'?'Нәтижені CSV файлына сақтаңыз.':'Жауап берді: '+answered+' / '+players.length+(answered===players.length?' · Барлығы жауап берді. Кезеңді аяқтауға болады.':'');
  renderBoard(board());
}
function renderStudent(){
  const s=myState;$('gameTitle').textContent=s.phase==='ended'?'Ойын аяқталды!':'Сенің кезегің';$('stage').textContent=s.round<0?'ДАЙЫНДЫҚ':`${s.round+1} / 15 КЕЗЕҢ · ${['БІЛУ','ҚОЛДАНУ','ТАЛДАУ'][s.round%3]}`;$('bar').style.width=Math.max(0,(s.round+1)/15*100)+'%';$('answers').replaceChildren();$('feedback').textContent='';
  if(s.phase==='lobby'){$('question').textContent='Қосылдың! Мұғалім ойынды бастағанша күте тұр.';return;}
  if(s.phase==='ended'){const row=s.board.find(p=>p.slot===s.slot);$('question').textContent='Жарайсың! Сенің нәтижең: '+row.score+' / 1500';$('feedback').textContent='Орның: '+row.rank+'. Әр жаңа идея нобайдан басталады!';return;}
  $('question').textContent=s.question.text;
  s.question.options.forEach((text,i)=>{const button=document.createElement('button');button.className='answer';const letter=document.createElement('span');letter.textContent='ABCD'[i];button.append(letter,document.createTextNode(text));button.disabled=s.phase!=='active'||!!s.answer;
    if(s.answer?.choice===i)button.classList.add('selected');if(s.reveal===i)button.classList.add('correct');if(s.reveal!==null&&s.answer?.choice===i&&i!==s.reveal)button.classList.add('wrong');
    button.onclick=()=>{document.querySelectorAll('.answer').forEach(b=>b.disabled=true);$('feedback').textContent='Жауап жіберілуде…';send(connection,{type:'answer',round:s.round,choice:i});};$('answers').append(button);
  });
  $('feedback').textContent=s.phase==='active'?(s.answer?'Жауап қабылданды! Кезеңнің аяқталуын күт.':'Бір дұрыс жауапты таңда.'):(s.answer?(s.answer.choice===s.reveal?'Дұрыс жауап! +100 ұпай':'Бұл жолы қате. Дұрыс жауап жасылмен белгіленген.'):'Жауап берілмеді. Дұрыс жауап жасылмен белгіленген.');
}
$('next').onclick=()=>{if(!host||phase==='active'||phase==='ended'||!players.length)return;if(round===14){phase='ended';broadcast();return;}round++;phase='active';deadline=Date.now()+45000;broadcast();};
function finishRound(){if(host&&phase==='active'){phase='review';broadcast();}}
$('closeRound').onclick=finishRound;
$('copy').onclick=async()=>{const u=new URL(location.href);u.search='';u.searchParams.set('room',room);try{await navigator.clipboard.writeText(u.href);notice('Оқушыларға арналған сілтеме көшірілді.');}catch{notice('Оқушыларға осы сілтемені беріңіз: '+u.href);}};
$('csv').onclick=()=>{const rows=[['Орын','Есім','Ұпай','Жауап саны'],...board().map(p=>[p.rank,p.name,p.score,Object.keys(players.find(x=>x.slot===p.slot).answers).length])];const blob=new Blob(['\uFEFF'+rows.map(r=>r.map(QuizCore.csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='nobai-'+room+'-results.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
setInterval(()=>{const active=host?phase==='active':myState?.phase==='active';const remaining=active?Math.max(0,Math.ceil(((host?deadline:localDeadline)-Date.now())/1000)):null;$('timer').textContent=remaining===null?'—':remaining+' с';if(host&&active&&remaining===0)finishRound();if(!host&&active&&remaining===0)document.querySelectorAll('.answer').forEach(b=>b.disabled=true);},250);
setInterval(()=>{if(host&&peer&&!peer.destroyed)broadcast();else if(connection?.open){send(connection,{type:'sync'});if(lastSeen&&Date.now()-lastSeen>15000)lost();}},5000);
window.addEventListener('beforeunload',e=>{if(host&&players.length&&phase!=='ended'){e.preventDefault();e.returnValue='';}});
$('name').value=sessionStorage.getItem('nobai-name')||'';$('code').value=new URLSearchParams(location.search).get('room')||sessionStorage.getItem('nobai-room')||'';
