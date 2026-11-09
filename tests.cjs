const assert=require('node:assert/strict');
const bank=require('./questions.js'), core=require('./core.js');
assert.equal(bank.length,3);assert.equal(bank.flat().length,66);
assert.equal(new Set(bank.flat().map(q=>q[0])).size,66);
for(const level of bank){assert.equal(level.length,22);for(const q of level){assert.equal(q.length,5);assert.equal(new Set(q.slice(1)).size,4);}}
for(let offset=0;offset<22;offset++){
 const offsets=[offset,(offset+7)%22,(offset+13)%22];
 for(let r=0;r<15;r++){
  const qs=Array.from({length:22},(_,s)=>core.question(bank,s,r,offsets));
  assert.equal(new Set(qs.map(q=>q.text)).size,22);
  for(const q of qs)assert.equal(q.options[q.correct],bank[q.level][q.index][1]);
 }
 for(let s=0;s<22;s++){
  const qs=Array.from({length:15},(_,r)=>core.question(bank,s,r,offsets));assert.equal(new Set(qs.map(q=>q.text)).size,15);
  for(let l=0;l<3;l++)assert.equal(qs.filter(q=>q.level===l).length,5);
 }
}
assert.deepEqual(core.ranking([{slot:0,score:100},{slot:1,score:200},{slot:2,score:200},{slot:3,score:0}]).map(x=>x.rank),[1,1,3,4]);
assert.equal(core.csvCell('=1+1'),'"\'=1+1"');assert.equal(core.csvCell('А,"Б"'),'"А,""Б"""');
console.log('PASS: 66 questions; 22 students x 15 rounds x 22 offsets; uniqueness; level balance; correct options; ties; CSV escaping.');
