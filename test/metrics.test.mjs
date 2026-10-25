import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCalendar,renderMetrics} from '../scripts/generate-metrics.mjs';

const start=Date.parse('2025-10-26');
const days=Array.from({length:365},(_,i)=>({
  date:new Date(start+i*86400000).toISOString().slice(0,10),count:i===20?3:0,level:i===20?2:0
}));
const markup=days.map((d,i)=>'<td id="d'+i+'" data-level="'+d.level+'" data-date="'+d.date+'"></td>'+
  '<tool-tip for="d'+i+'">'+(d.count?d.count+' contributions':'No contributions')+' on a day.</tool-tip>').join('');

test('reads exact public counts, including real zero days',()=>{
  const parsed=parseCalendar(markup);
  assert.equal(parsed.length,365);
  assert.equal(parsed.reduce((sum,d)=>sum+d.count,0),3);
  assert.equal(parsed[20].count,3);
});
test('rejects missing tooltip evidence instead of inventing zero counts',()=>{
  assert.throws(()=>parseCalendar(markup.replace('<tool-tip for="d20">3 contributions on a day.</tool-tip>','')));
});
test('rejects truncated, duplicate and gapped calendars',()=>{
  assert.throws(()=>parseCalendar(markup.slice(0,100)));
  assert.throws(()=>parseCalendar(markup+markup.slice(0,markup.indexOf('</tool-tip>')+11)));
  assert.throws(()=>parseCalendar(markup.replace('2025-11-15','2025-11-16')));
});
test('zero data remains zero and language labels are XML escaped',()=>{
  const data={days:days.map(d=>({...d,count:0,level:0})),languages:{'X<&':10},projectCount:0,joined:'2021-10-02',generatedAt:'2026-10-26T00:00:00Z'};
  const rendered=renderMetrics(data);
  assert.ok(rendered.includes('0 profile contributions across 0 active days'));
  assert.ok(rendered.includes('X&lt;&amp;'));
  assert.ok(!/NaN|Infinity/.test(rendered));
  assert.ok(rendered.includes('>2021</text>'));
});
