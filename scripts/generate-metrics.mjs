import {execFileSync} from 'node:child_process';
import {mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const login=process.env.PROFILE_USER||'Lifelessdice';
if(!/^[A-Za-z0-9-]{1,39}$/.test(login)) throw new Error('Invalid GitHub username');

function api(endpoint) {
  try {return JSON.parse(execFileSync('gh',['api',endpoint],{
    encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024,stdio:['ignore','pipe','pipe']
  }));} catch {throw new Error('Public GitHub API request failed: '+endpoint);}
}

export function parseCalendar(html) {
  const attr=(tag,name)=>tag.match(new RegExp('\\b'+name+'="([^"]*)"'))?.[1];
  const tips=new Map();
  for(const m of html.matchAll(/<tool-tip\b([^>]*)>([\s\S]*?)<\/tool-tip>/g)) {
    const id=attr(m[1],'for'),label=m[2].replace(/<[^>]*>/g,'').trim();
    const n=/^No contributions? on /.test(label)?0:
      /^([\d,]+) contributions? on /.test(label)?Number(label.match(/^[\d,]+/)[0].replaceAll(',','')):null;
    if(id&&n!==null) tips.set(id,n);
  }
  const days=[];
  for(const m of html.matchAll(/<td\b[^>]*\bdata-date="[^"]*"[^>]*>/g)) {
    const date=attr(m[0],'data-date'),count=tips.get(attr(m[0],'id')),level=Number(attr(m[0],'data-level'));
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isInteger(count)||count<0||!Number.isInteger(level)||level<0||level>4)
      throw new Error('Unexpected public calendar markup');
    days.push({date,count,level});
  }
  days.sort((a,b)=>a.date.localeCompare(b.date));
  if(days.length<350||days.length>371||new Set(days.map(d=>d.date)).size!==days.length)
    throw new Error('Incomplete public contribution calendar');
  for(let i=1;i<days.length;i++) if(Date.parse(days[i].date)-Date.parse(days[i-1].date)!==86400000)
    throw new Error('Contribution calendar has a date gap');
  return days;
}

const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const number=n=>new Intl.NumberFormat('en-US').format(n);
const colors={JavaScript:'#f1e05a',Vue:'#41b883',HTML:'#e34c26',CSS:'#a98dff','C++':'#f34b7d',C:'#83a7dd',Python:'#3572a5',Java:'#b07219',Go:'#00add8'};
const rect=(x,y,w,h,fill,rx=10,stroke='none')=>'<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="'+rx+'" fill="'+fill+'" stroke="'+stroke+'"/>';
const text=(x,y,label,size=15,color='#919ba8',weight=400)=>'<text x="'+x+'" y="'+y+'" fill="'+color+'" font-size="'+size+'" font-weight="'+weight+'">'+esc(label)+'</text>';
const svg=(w,h,body,title)=>'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+w+' '+h+'" role="img" aria-label="'+esc(title)+'"><title>'+esc(title)+'</title><g font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif">'+body+'</g></svg>\n';

export function renderMetrics(data) {
  const {days,languages,projectCount,joined,generatedAt}=data;
  const total=days.reduce((s,d)=>s+d.count,0),active=days.filter(d=>d.count>0).length;
  const weekdays=Array(7).fill(0);
  days.forEach(d=>weekdays[(new Date(d.date+'T12:00:00Z').getUTCDay()+6)%7]+=d.count);
  const maxWeekday=Math.max(1,...weekdays),maxCount=Math.max(1,...days.map(d=>d.count));
  const langs=Object.entries(languages).sort((a,b)=>b[1]-a[1]),totalBytes=langs.reduce((s,e)=>s+e[1],0),shown=langs.slice(0,5);
  if(langs.length>5) shown.push(['Other',langs.slice(5).reduce((s,e)=>s+e[1],0)]);
  const updated=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Singapore',day:'numeric',month:'short',year:'numeric'}).format(new Date(generatedAt));
  let out=rect(0,0,960,640,'#0d1117',16,'#30363d');
  out+=text(26,38,'GitHub activity',24,'#e6edf3',650)+text(26,61,'A snapshot of the work behind the repositories',14);
  [['PUBLIC PROJECTS',projectCount],['CONTRIBUTIONS',total],['ACTIVE DAYS',active],['ON GITHUB SINCE',joined.slice(0,4)]].forEach(([label,value],i)=>{
    const x=24+i*232;
    out+=rect(x,82,216,80,'#161b22',10,'#27313c')+text(x+17,106,label,11,'#92a3b5',600)+text(x+17,143,i===3?value:number(value),30,i===1?'#7ee787':'#e6edf3',650);
  });
  out+=rect(24,180,432,420,'#10161e',12,'#27313c')+rect(472,180,464,420,'#10161e',12,'#27313c');
  out+=text(45,214,'Contribution rhythm',19,'#80b8ff',600)+text(45,236,'By weekday · past 12 months',12);
  const names=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  weekdays.forEach((n,i)=>{
    const x=52+i*55,h=n/maxWeekday*64;
    out+=rect(x,265,26,64,'#1b2630',4)+rect(x,329-h,26,h||0.6,n?'#6cbd78':'#26343f',4);
    out+=text(x+3,354,names[i],11)+text(x+5,257,number(n),11,'#c5d1df');
  });
  out+=text(45,392,'Public code mix',19,'#80b8ff',600)+text(45,413,'GitHub language bytes · excludes this profile',11);
  if(!shown.length) out+=text(45,448,'No public language data available',14);
  shown.forEach(([name,bytes],i)=>{
    const y=441+i*25,pct=totalBytes?bytes/totalBytes*100:0;
    const label=pct>0&&pct<0.1?'<0.1%':pct.toFixed(1)+'%';
    out+=text(45,y+4,name,12,'#c9d1d9')+rect(139,y-5,242,8,'#25313b',4)+rect(139,y-5,242*pct/100,8,colors[name]||'#76939f',4)+text(390,y+4,label,11,'#a8b6c5');
  });
  out+=text(494,214,'Contribution calendar',19,'#80b8ff',600)+text(494,236,'Every block is a day · height shows contributions',12);
  const first=Date.parse(days[0].date)-new Date(days[0].date+'T12:00:00Z').getUTCDay()*86400000;
  const palette=['#303b43','#0e4429','#006d32','#26a641','#58d37a'];
  const cells=days.map(d=>{
    const day=new Date(d.date+'T12:00:00Z').getUTCDay(),week=Math.floor((Date.parse(d.date)-first)/86400000/7);
    return {...d,x:499+week*6.1+day*9.4,y:291+week*2.8-day*5.2,z:d.count?4+Math.sqrt(d.count/maxCount)*32:0};
  }).sort((a,b)=>a.y-b.y||a.x-b.x);
  const poly=(points,fill)=>'<polygon points="'+points.map(p=>p.map(n=>n.toFixed(2)).join(',')).join(' ')+'" fill="'+fill+'" stroke="#0d141a" stroke-width=".6"/>';
  for(const d of cells) {
    const {x,y,z}=d;
    if(z) {
      out+=poly([[x,y-z],[x+6.1,y+2.8-z],[x+6.1,y+2.8],[x,y]],'#215b32');
      out+=poly([[x+6.1,y+2.8-z],[x+15.5,y-2.4-z],[x+15.5,y-2.4],[x+6.1,y+2.8]],'#173e27');
    }
    out+='<g><title>'+esc(d.date+': '+number(d.count)+' contributions')+'</title>'+poly([[x,y-z],[x+6.1,y+2.8-z],[x+15.5,y-2.4-z],[x+9.4,y-5.2-z]],palette[d.level])+'</g>';
  }
  out+=text(498,474,'Less',11);
  palette.forEach((c,i)=>out+=rect(533+i*18,464,13,13,c,2));
  out+=text(630,474,'More',11)+text(498,510,days[0].date+' — '+days.at(-1).date,12,'#c9d1d9');
  out+=text(498,544,'The public profile calendar, rendered in 3D.',13,'#9eabb8')+text(498,568,'Activity and language mix are not skill ratings.',12);
  out+=text(26,624,'PUBLIC GITHUB DATA  /  UPDATED '+updated.toUpperCase(),11,'#7e8d9d',500);
  return svg(960,640,out,'GitHub activity for '+login+'. '+number(total)+' profile contributions across '+active+' active days in the past year.');
}

function renderHeader() {
  let out=rect(0,0,960,174,'#0d1117',14,'#30363d')+rect(0,0,6,174,'#7ee787',3);
  out+=text(28,37,'SOFTWARE ENGINEERING',12,'#7ee787',650)+text(27,91,'Rahat Mir',44,'#f0f6fc',700);
  out+=text(29,125,'Backend · Full-stack · Connected systems',18,'#a4b2c3')+text(29,151,'BUILD  /  TEST  /  ITERATE',11,'#6f8196',500);
  out+='<g stroke="#2b453c" fill="none" stroke-width="1.3"><path d="M690 46H738L758 66H840"/><path d="M712 129H759L778 108H886"/><path d="M790 29V52L809 71V143"/></g><g fill="#7ee787"><circle cx="690" cy="46" r="4"/><circle cx="886" cy="108" r="4"/><circle cx="809" cy="143" r="3"/></g>';
  out+=text(744,113,'</>',51,'#80b8ff',600);
  return svg(960,174,out,'Rahat Mir — Software Engineering. Backend, full-stack and connected systems.');
}

async function main() {
  const response=await fetch('https://github.com/users/'+login+'/contributions',{
    headers:{Accept:'text/html','User-Agent':'public-profile-metrics'},signal:AbortSignal.timeout(30000)
  });
  if(!response.ok) throw new Error('Public calendar unavailable: '+response.status);
  const days=parseCalendar(await response.text()),user=api('users/'+login),repositories=[];
  for(let page=1;page<=10;page++) {
    const entries=api('users/'+login+'/repos?type=owner&per_page=100&page='+page);
    if(!Array.isArray(entries)) throw new Error('Unexpected repository response');
    repositories.push(...entries);
    if(entries.length<100) break;
    if(page===10) throw new Error('Repository listing exceeded collector bounds');
  }
  const projects=repositories.filter(r=>!r.private&&!r.fork&&r.name.toLowerCase()!==login.toLowerCase()),languages={};
  for(const repo of projects) for(const [name,bytes] of Object.entries(api('repos/'+login+'/'+encodeURIComponent(repo.name)+'/languages'))) {
    if(!Number.isSafeInteger(bytes)||bytes<0) throw new Error('Invalid language-byte response');
    languages[name]=(languages[name]||0)+bytes;
  }
  const data={login,generatedAt:new Date().toISOString(),joined:user.created_at,projectCount:projects.length,
    publicRepositories:projects.map(r=>r.name),days,languages,
    sources:['https://github.com/users/'+login+'/contributions','https://api.github.com/users/'+login+'/repos']};
  // Every source passes validation before any last-good asset is replaced.
  await mkdir(path.join(root,'assets'),{recursive:true});
  await mkdir(path.join(root,'data'),{recursive:true});
  await writeFile(path.join(root,'assets/header.svg'),renderHeader());
  await writeFile(path.join(root,'assets/github-metrics.svg'),renderMetrics(data));
  await writeFile(path.join(root,'data/public-metrics.json'),JSON.stringify(data,null,2)+'\n');
  console.log('Generated public metrics: '+projects.length+' projects, '+days.reduce((s,d)=>s+d.count,0)+' contributions.');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
  main().catch(e=>{console.error(e.message);process.exitCode=1;});
