const http=require('http'),fs=require('fs'),path=require('path'),{WebSocketServer}=require('ws');
const CASES=['Кража левого носка из стиральной машины','Три года нелегального проживания под диваном','Побег с ноги во время важных переговоров','Распространение запаха на весь офис','Контрабанда крошек в тапки','Нападение на мизинец без предупреждения','Самовольная дырка на пятке','Притворялся парой чужого носка'];
const PRO=[{t:'Свидетели видели, как он шептался с дыркой',p:2},{t:'У него нет пары, значит, он что-то скрывает',p:1},{t:'На месте преступления нашли его ворс',p:3},{t:'Он стирался при 90 градусах. Только виновные так делают',p:2},{t:'Он трижды менял цвет на допросе',p:1},{t:'Алиби «я был в кроссовке». Кто в это поверит?',p:2},{t:'Его хозяин уже подал в суд на трёх его друзей',p:1},{t:'Он пахнет виной. Ну или просто пахнет',p:3}];
const DEF=[{t:'В момент преступления я висел на батарее',p:2},{t:'У меня дырка на пятке. Я сам жертва системы',p:2},{t:'Меня подставил правый носок, он всегда завидовал',p:1},{t:'У меня есть справка от сушилки',p:3},{t:'Я слишком мягкий для преступлений',p:1},{t:'Мою пару съела стиралка. Я в трауре!',p:2},{t:'Я вообще не носок, я гольф. Другая подсудность',p:3},{t:'Видео есть? Нету. Я чист как свежевыстиранный',p:1}];
const COLORS=['#e4572e','#f2b33d','#4cb5ae','#8e6bd8','#6bbf59','#ec7fb0'];
const rooms={},rnd=a=>a[Math.random()*a.length|0],pick=(a,n)=>[...a].sort(()=>Math.random()-.5).slice(0,n);
const J=JSON.stringify,find=(R,id)=>R.players.find(p=>p.id==id),sc=(R,id,d)=>{const p=find(R,id);if(p)p.score+=d};
function send(R){for(const p of R.players)if(p.on&&p.ws.readyState==1)p.ws.send(J({t:'s',s:{code:R.code,host:R.host,phase:R.phase,round:R.round,n:R.players.length,
 players:R.players.map(({id,name,color,score,on})=>({id,name,color,score,on})),roles:R.roles,case:R.case,turn:R.turn,hand:R.hands[p.id]||[],
 pending:R.pending,played:R.played,voted:Object.keys(R.votes),voters:R.voters,verdict:R.verdict,me:p.id}}))}
function start(R){const P=R.players,n=P.length,i=R.round%n;
 R.roles=n==2?{pro:P[i].id,def:P[1-i].id}:{pro:P[i].id,def:P[(i+1)%n].id,judge:P[(i+2)%n].id};
 R.case=rnd(CASES);R.hands={[R.roles.pro]:pick(PRO,3),[R.roles.def]:pick(DEF,3)};
 R.turn=0;R.played=[];R.pending=null;R.votes={};R.verdict=null;R.phase='trial';
 R.voters=P.map(p=>p.id).filter(id=>!Object.values(R.roles).includes(id));
 if(!R.voters.length&&R.roles.judge)R.voters=[R.roles.judge]}
function verdict(R){const v=Object.values(R.votes),g=v.filter(x=>x=='g').length,nn=v.length-g;
 const sum=s=>R.played.filter(c=>c.side==s&&c.ok).reduce((a,c)=>a+c.p,0)+Math.random()*3;
 const guilty=v.length?g>nn:sum('pro')>sum('def');
 R.verdict={guilty,g,n:nn};sc(R,guilty?R.roles.pro:R.roles.def,2);
 for(const id in R.votes)if((R.votes[id]=='g')==guilty)sc(R,id,1);
 if(R.roles.judge)sc(R,R.roles.judge,1);R.phase='verdict'}
function nextTurn(R){if(++R.turn>=6){R.phase='vote';if(!R.voters.length)verdict(R)}}
function settle(R,c,ok){c.ok=ok;R.played.push(c);if(ok)sc(R,c.by,1);nextTurn(R)}
const H={
 play(R,p,m){if(R.phase!='trial'||R.pending)return;const side=R.turn%2?'def':'pro';if(R.roles[side]!=p.id)return;
  const h=R.hands[p.id],c=h&&h[m.i];if(!c)return;h.splice(m.i,1);const k={by:p.id,side,t:c.t,p:c.p};
  if(R.roles.judge)R.pending=k;else settle(R,k,true)},
 rule(R,p,m){if(!R.pending||R.roles.judge!=p.id)return;const c=R.pending;R.pending=null;settle(R,c,!!m.ok)},
 vote(R,p,m){if(R.phase!='vote'||!R.voters.includes(p.id)||R.votes[p.id])return;R.votes[p.id]=m.g?'g':'n';if(Object.keys(R.votes).length>=R.voters.length)verdict(R)},
 obj(R,p){if(R.phase!='trial'||Date.now()-(p.lo||0)<3000)return;p.lo=Date.now();for(const q of R.players)if(q.on)q.ws.send(J({t:'obj',by:p.id}))},
 begin(R,p){if(R.host==p.id&&R.phase=='lobby'&&R.players.length>=2){R.round=0;start(R)}},
 next(R,p){if(R.host!=p.id||R.phase!='verdict')return;if(++R.round>=R.players.length)R.phase='end';else start(R)},
 again(R,p){if(R.host!=p.id||R.phase!='end')return;R.players.forEach(q=>q.score=0);R.round=0;R.phase='lobby'},
 skip(R,p){if(R.host!=p.id)return;if(R.phase=='trial'){if(R.pending){const c=R.pending;R.pending=null;settle(R,c,true)}else nextTurn(R)}else if(R.phase=='vote')verdict(R)}
};
const srv=http.createServer((q,r)=>{r.writeHead(200,{'content-type':'text/html; charset=utf-8'});fs.createReadStream(path.join(__dirname,'public','index.html')).pipe(r)});
new WebSocketServer({server:srv}).on('connection',ws=>{let R,me;const bad=e=>ws.send(J({t:'err',e}));
 ws.on('message',raw=>{let m;try{m=JSON.parse(raw)}catch{return}
  if(m.t=='join'){const code=String(m.room||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,5),id=String(m.id||'').slice(0,40);if(!id||!code)return;
   let r=rooms[code];if(!r){if(!m.create)return bad('Комната не найдена. Попроси друга прислать ссылку заново');
    r=rooms[code]={code,players:[],host:id,phase:'lobby',round:0,hands:{},votes:{},played:[],roles:{},voters:[]}}
   let p=find(r,id);
   if(p){p.ws=ws;p.on=true}else{if(r.phase!='lobby')return bad('Игра уже идёт');if(r.players.length>=6)return bad('Комната заполнена (максимум 6)');
    if(!r.players.length)r.host=id;
    p={id,ws,on:true,score:0,name:String(m.name||'Носок').slice(0,14),color:COLORS.find(c=>!r.players.some(q=>q.color==c))};r.players.push(p)}
   R=r;me=p;return send(R)}
  if(R&&H[m.t]){H[m.t](R,me,m);send(R)}});
 ws.on('close',()=>{if(!R||me.ws!==ws)return;me.on=false;
  if(R.phase=='lobby')R.players=R.players.filter(p=>p!=me);
  if(R.host==me.id){const h=R.players.find(p=>p.on);if(h)R.host=h.id}
  if(!R.players.some(p=>p.on)){const c=R;setTimeout(()=>{if(!c.players.some(p=>p.on))delete rooms[c.code]},6e5)}send(R)})});
srv.listen(process.env.PORT||3000,()=>console.log('http://localhost:'+(process.env.PORT||3000)));
