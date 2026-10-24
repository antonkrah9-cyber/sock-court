const http=require('http'),fs=require('fs'),path=require('path'),{WebSocketServer}=require('ws');
const J=JSON.stringify,rooms={},shuffle=a=>[...a].sort(()=>Math.random()-.5),find=(R,id)=>R.players.find(p=>p.id==id);
const ROLES=['judge','pros','def','accused','victim'],str=(v,n)=>String(v||'').trim().slice(0,n);
const all=(R,m)=>R.players.forEach(p=>p.on&&p.ws.readyState==1&&p.ws.send(J(m)));
function send(R){for(const p of R.players)if(p.on&&p.ws.readyState==1)p.ws.send(J({t:'s',s:{code:R.code,host:R.host,phase:R.phase,round:R.round,
 players:R.players.map(({id,name,hero,on})=>({id,name,hero,on})),roles:R.roles,case:R.case,lamp:R.lamp,proj:R.proj,log:R.log,verdict:R.verdict,
 wrote:R.wrote.length,iWrote:R.wrote.includes(p.id),left:R.cases.length,me:p.id}}))}
function trial(R){const n=R.players.length,seq=R.players.map((_,i)=>R.players[(R.round+i)%n]);R.roles={};
 ROLES.forEach((r,i)=>{if(i<n)R.roles[r]=seq[i].id});R.case=R.cases.pop();R.lamp='none';R.proj=null;R.photo=null;R.log=[];R.verdict=null;R.phase='trial';all(R,{t:'ev',photo:null})}
function go(R){R.cases=shuffle(R.pending);R.round=0;trial(R)}
const rl=(p,k,ms)=>{if(Date.now()-(p[k]||0)<ms)return true;p[k]=Date.now()};
const H={
 hero(R,p,m){const i=+m.i;if(i>=0&&i<7&&!R.players.some(q=>q!=p&&q.hero==i))p.hero=i},
 begin(R,p){if(R.host==p.id&&R.phase=='lobby'&&R.players.length>=3){R.phase='write';R.pending=[];R.wrote=[]}},
 case(R,p,m){const t=str(m.text,220);if(R.phase!='write'||R.wrote.includes(p.id)||t.length<3)return;R.pending.push(t);R.wrote.push(p.id);if(R.wrote.length>=R.players.length)go(R)},
 startnow(R,p){if(R.host==p.id&&R.phase=='write'&&R.pending.length)go(R)},
 lamp(R,p,m){if(R.phase=='trial'&&R.roles.judge==p.id&&['pros','def','none'].includes(m.v))R.lamp=m.v},
 say(R,p,m){const t=str(m.text,40);if(t&&!rl(p,'ls',700))all(R,{t:'say',by:p.id,text:t})},
 stmt(R,p,m){if(R.phase!='trial'||R.lamp=='none'||R.roles[R.lamp]!=p.id)return;
  const ph=typeof m.photo=='string'&&m.photo.startsWith('data:image/')&&m.photo.length<500000?m.photo:null;
  R.proj={id:Date.now(),side:R.lamp,when:str(m.when,80),where:str(m.where,80),what:str(m.what,200),who:str(m.who,80),lies:0};
  R.photo=ph;R.log.push({side:R.lamp,text:[R.proj.when,R.proj.where,R.proj.what].filter(Boolean).join(' · ')});all(R,{t:'ev',id:R.proj.id,photo:ph})},
 lie(R,p){if(R.phase=='trial'&&R.proj&&!rl(p,'ll',2000)){R.proj.lies++;all(R,{t:'lie',by:p.id})}},
 obj(R,p){if(R.phase=='trial'&&['pros','def','accused'].some(k=>R.roles[k]==p.id)&&!rl(p,'lo',3000))all(R,{t:'obj',by:p.id})},
 verdict(R,p,m){if(R.phase=='trial'&&R.roles.judge==p.id){R.verdict={guilty:!!m.g};R.phase='verdict'}},
 clear(R,p){if(R.host==p.id){R.proj=null;R.photo=null;all(R,{t:'ev',photo:null})}},
 next(R,p){if(R.host!=p.id||!['trial','verdict'].includes(R.phase))return;R.round++;if(R.cases.length)trial(R);else R.phase='end'},
 again(R,p){if(R.host==p.id&&R.phase=='end'){R.phase='lobby';R.roles={};R.proj=null}}
};
const srv=http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html; charset=utf-8'});fs.createReadStream(path.join(__dirname,'public','index.html')).pipe(r)});
new WebSocketServer({server:srv,maxPayload:1e6}).on('connection',ws=>{let R,me;const bad=e=>ws.send(J({t:'err',e}));
 ws.on('message',raw=>{let m;try{m=JSON.parse(raw)}catch{return}
  if(m.t=='join'){const code=String(m.room||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,5),id=str(m.id,40);if(!id||!code)return;
   let r=rooms[code];if(!r){if(!m.create)return bad('Комната не найдена. Попроси друга прислать ссылку заново');
    r=rooms[code]={code,players:[],host:id,phase:'lobby',round:0,roles:{},pending:[],cases:[],wrote:[],lamp:'none',log:[]}}
   let p=find(r,id);
   if(p){p.ws=ws;p.on=true}else{if(r.phase!='lobby')return bad('Игра уже идёт');if(r.players.length>=9)return bad('Комната заполнена (максимум 9)');
    if(!r.players.length)r.host=id;
    p={id,ws,on:true,name:str(m.name,14)||'Игрок',hero:[0,1,2,3,4,5,6].find(i=>!r.players.some(q=>q.hero==i))};r.players.push(p)}
   R=r;me=p;send(R);if(R.proj&&R.photo)ws.send(J({t:'ev',id:R.proj.id,photo:R.photo}));return}
  if(R&&H[m.t]){H[m.t](R,me,m);send(R)}});
 ws.on('close',()=>{if(!R||me.ws!==ws)return;me.on=false;
  if(R.phase=='lobby')R.players=R.players.filter(p=>p!=me);
  if(R.host==me.id){const h=R.players.find(p=>p.on);if(h)R.host=h.id}
  if(!R.players.some(p=>p.on)){const c=R;setTimeout(()=>{if(!c.players.some(p=>p.on))delete rooms[c.code]},6e5)}send(R)})});
srv.listen(process.env.PORT||3000,()=>console.log('http://localhost:'+(process.env.PORT||3000)));
