'use strict';
const QuizCore = {
  questionIndex(slot, round, offsets) { return (slot + Math.floor(round / 3) * 3 + offsets[round % 3]) % 22; },
  question(bank, slot, round, offsets) {
    const level = round % 3, index = this.questionIndex(slot, round, offsets);
    const raw = bank[level][index];
    const shift = (slot * 7 + round * 3 + offsets[level]) % 4;
    const options = Array.from({length:4}, (_,i) => raw[1 + (i + shift) % 4]);
    return {text:raw[0], options, correct:(4-shift)%4, level, index};
  },
  ranking(players) {
    const sorted = [...players].sort((a,b)=>b.score-a.score || a.slot-b.slot);
    let rank=1;
    return sorted.map((p,i)=>{if(i && p.score!==sorted[i-1].score) rank=i+1;return {...p,rank};});
  },
  csvCell(value) {let s=String(value);if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
};
if(typeof module!=='undefined')module.exports=QuizCore;
