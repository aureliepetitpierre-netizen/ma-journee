"use strict";
/* Ma journée — timeline de la journée type, sans heure fixe, synchronisée avec Google Agenda. */

const CFG = window.APP_CONFIG || {};

// ---------- Modèle de journée (d'après « Ma journée type ») ----------
const TPL = {
  routine:{t:"Routine du matin + balade",cat:"pilier",d:105,min:45,minLabel:"Shake, Concerta, balade",desc:"Réveil → retour de balade"},
  cafe:{t:"Pause café",cat:"important",d:15,desc:"Après la luminothérapie, pour démarrer en douceur."},
  deep:{t:"Deep work",cat:"pilier",d:90,min:45,desc:"Formations, exercices, candidature si une offre arrive."},
  midi:{t:"Pause de midi + balade d'Aïoli",cat:"pilier",d:60,desc:"Midi, libre."},
  creatif:{t:"Deep créatif",cat:"important",d:60,min:30,desc:"Couture, crochet complexe.",
           mondayT:"Admin",mondayDesc:"Le lundi, l'admin prend la place du deep créatif."},
  cafe2:{t:"Pause café de l'après-midi",cat:"important",d:15,desc:"Coupure quand l'énergie baisse."},
  mouv:{t:"Mouvement",cat:"pilier",d:45,min:15,minLabel:"15 min yoga ou marche",desc:"Yoga, vélo, renforcement, course, ou marche dehors."},
  maison:{t:"Projet maison",cat:"bonus",d:30,min:10,minLabel:"Un tiroir ou une pile",desc:"Un petit coin à ranger, minuteur en route."},
  lecture:{t:"Lecture",cat:"important",d:30,min:15,desc:"Après le souper ou moment calme."},
  soir:{t:"Fermeture + routine du soir",cat:"pilier",d:30,desc:"Voir la routine du soir."},
};
const ORDER = Object.keys(TPL);
const MODES = {
  pleine: ORDER.map(k=>[k]),
  rdv: [["routine"],["deep",45],["midi"],["mouv"],["soir"]],
  low: [["routine",45],["deep",30],["lecture"],["soir"]],
};
const COLOR = {pilier:"var(--pilier)",important:"var(--important)",bonus:"var(--bonus)"};
const CATNAME = {pilier:"Pilier",important:"Important",bonus:"Bonus"};

// ---------- Utilitaires ----------
const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2,"0");
const uid = () => Math.random().toString(36).slice(2,10);
const todayKey = () => {const d=new Date();return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())};
const nowMin = () => {const d=new Date();return d.getHours()*60+d.getMinutes()+d.getSeconds()/60};
const hm = m => pad(Math.floor(m/60)%24)+":"+pad(Math.floor(m%60));
const fmt = m => {m=Math.round(m);if(m<60)return m+" min";const h=Math.floor(m/60),r=m%60;return h+"h"+(r?pad(r):"")};
const clock = s => {s=Math.max(0,Math.floor(s));const h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=s%60;return (h?h+":"+pad(m):m)+":"+pad(x)};
const esc = s => String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const isMonday = () => new Date().getDay()===1;
const titleOf = b => (b.tpl==="creatif"&&isMonday())?TPL.creatif.mondayT:TPL[b.tpl].t;
const descOf = b => (b.tpl==="creatif"&&isMonday())?TPL.creatif.mondayDesc:TPL[b.tpl].desc;
const lsGet = (k,def) => {try{const v=localStorage.getItem(k);return v==null?def:JSON.parse(v)}catch(e){return def}};
const lsSet = (k,v) => {try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}};

const ICON = {
  check:'<svg viewBox="0 0 24 24" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  play:'<svg viewBox="0 0 12 12"><path d="M2.5 1.5v9l8-4.5z"/></svg>',
  pause:'<svg viewBox="0 0 12 12"><rect x="2" y="1.5" width="3" height="9" rx="1"/><rect x="7" y="1.5" width="3" height="9" rx="1"/></svg>',
  expand:'<svg class="ln" viewBox="0 0 12 12" stroke-width="1.5" stroke-linecap="round"><path d="M1.5 4.5v-3h3M10.5 4.5v-3h-3M1.5 7.5v3h3M10.5 7.5v3h-3"/></svg>',
  cal:'<svg viewBox="0 0 24 24" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
};

// ---------- État ----------
const KEY = "ma-journee-v1";
let S;

function makeBlock(k,dur){
  const t=TPL[k];dur=dur||t.d;
  return {kind:"block",id:uid(),tpl:k,dur,done:false,elapsed:0,isMin:t.min===dur&&dur!==t.d,alerted:false};
}
function freshBlocks(mode){return MODES[mode].map(([k,d])=>makeBlock(k,d))}
function newDay(){
  S={date:todayKey(),mode:"pleine",items:freshBlocks("pleine"),open:null,running:null,ruleApplied:false,lastSync:null,allDay:[]};
}
function load(){
  S=lsGet(KEY,null);
  if(!S||S.date!==todayKey()) newDay();
}
function save(){lsSet(KEY,S)}

const blocks = () => S.items.filter(i=>i.kind==="block");
const find = id => S.items.find(x=>x.id===id);
function elapsedOf(b){let e=b.elapsed||0;if(S.running&&S.running.id===b.id)e+=(Date.now()-S.running.at)/1000;return e}
const remaining = b => b.done?0:Math.max(0,b.dur-elapsedOf(b)/60);
function stopRun(){if(!S.running)return;const b=find(S.running.id);if(b)b.elapsed=elapsedOf(b);S.running=null}
function startRun(id){stopRun();S.running={id,at:Date.now()}}

// Place un événement de l'agenda dans la timeline selon l'heure estimée de chaque bloc
function insertEvent(items,ev){
  const now=nowMin();
  const firstOpen=items.findIndex(x=>!(x.kind==="block"&&x.done));
  let pos=items.length;
  if(ev.endMin<=now){
    pos=firstOpen<0?items.length:firstOpen;
  } else {
    let t=now;
    for(let i=0;i<items.length;i++){
      const x=items[i];
      if(x.kind==="block"){
        if(x.done)continue;
        const r=remaining(x);
        if(t+r/2>ev.startMin){pos=i;break}
        t+=r;
      } else {
        if(x.removed||x.ghost)continue;
        if(x.startMin>ev.startMin){pos=i;break}
        t=Math.max(t,x.endMin);
      }
    }
  }
  items.splice(pos,0,ev);
}

// ---------- Rendu ----------
function blockHtml(b,ghosts){
  const t=TPL[b.tpl],c=COLOR[t.cat],open=S.open===b.id,run=S.running&&S.running.id===b.id;
  const h=b.done?54:Math.round(58+b.dur*0.62);
  const el=elapsedOf(b),pct=Math.min(100,el/60/b.dur*100);
  let panel="";
  if(open){
    panel=`<div class="panel" data-stop>
      <div class="r"><button data-act="dur" data-v="-15" data-id="${b.id}" aria-label="Raccourcir de 15 minutes">−15</button><span class="big">${fmt(b.dur)}</span><button data-act="dur" data-v="15" data-id="${b.id}" aria-label="Rallonger de 15 minutes">+15</button>
      ${t.min?`<button data-act="min" data-id="${b.id}" aria-pressed="${b.isMin}">Version min · ${fmt(t.min)}</button>`:""}</div>
      ${t.minLabel?`<div class="hint">Minimum : ${esc(t.minLabel)}</div>`:""}
      <div class="r"><button data-act="up" data-id="${b.id}">↑ Monter</button><button data-act="down" data-id="${b.id}">↓ Descendre</button><button class="danger" data-act="del" data-id="${b.id}">Supprimer</button></div>
    </div>`;
  }
  return `<div class="item ${b.done?"done":""} ${run?"running":""}" style="--c:${c}">
    <button class="dot" data-act="done" data-id="${b.id}" aria-label="${b.done?"Marquer à faire":"Marquer comme fini"}">${ICON.check}</button>
    <div class="card" style="min-height:${h}px" data-act="open" data-id="${b.id}" role="button" tabindex="0">
      <div class="top"><span class="t">${esc(titleOf(b))}</span><span class="dur ${b.isMin?"min":""}">${fmt(b.dur)}${b.isMin?" · min":""}</span></div>
      ${!b.done&&!open?`<span class="desc">${esc(descOf(b))}</span>`:""}
      ${!b.done?`<div class="chrono"><button class="play" data-act="run" data-id="${b.id}" aria-label="${run?"Pause":"Démarrer le chrono"}">${run?ICON.pause:ICON.play}</button><span class="time" data-time="${b.id}">${el>0?clock(el)+" / "+fmt(b.dur):"Démarrer"}</span><span class="prog"><span data-prog="${b.id}" style="width:${pct}%"></span></span><button class="play" data-act="focus" data-id="${b.id}" aria-label="Mode focus plein écran">${ICON.expand}</button></div>`:""}
      ${panel}${ghosts}
    </div></div>`;
}
function eventHtml(e,ghosts){
  const open=S.open===e.id,dur=e.endMin-e.startMin,h=Math.round(58+Math.min(dur,240)*0.62),past=e.endMin<=nowMin();
  const panel=open?`<div class="panel" data-stop>
      <div class="r"><button data-act="ghost" data-v="0" data-id="${e.id}" aria-pressed="${!e.ghost}">Dans la timeline</button><button data-act="ghost" data-v="1" data-id="${e.id}" aria-pressed="${e.ghost}">Grisé (chevauche)</button></div>
      <div class="r"><button data-act="up" data-id="${e.id}">↑ Monter</button><button data-act="down" data-id="${e.id}">↓ Descendre</button><button class="danger" data-act="rm" data-id="${e.id}">Retirer</button></div>
      <div class="hint">Retirer l'enlève seulement de cette timeline, pas de Google Agenda.</div></div>`:"";
  return `<div class="item ev ${past?"past":""}" style="--c:var(--gcal)">
    <span class="dot" aria-hidden="true"></span>
    <div class="card" style="min-height:${h}px" data-act="open" data-id="${e.id}" role="button" tabindex="0">
      <span class="evtime">${ICON.cal}${hm(e.startMin)}–${hm(e.endMin)} · Google Agenda</span>
      <div class="top"><span class="t">${esc(e.title)}</span><span class="dur">${fmt(dur)}</span></div>
      ${panel}${ghosts}
    </div></div>`;
}
const ghostHtml = e => `<button class="ghost" data-act="open" data-id="${e.id}"><span class="evtime">${hm(e.startMin)}–${hm(e.endMin)}</span><b>${esc(e.title)}</b></button>`;

function render(){
  const d=new Date();
  $("dayname").textContent=d.toLocaleDateString("fr-CH",{weekday:"long",day:"numeric",month:"long"});
  document.querySelectorAll(".modes button").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.mode===S.mode)));

  // timeline : les événements grisés flottent sur l'élément suivant
  const vis=S.items.filter(i=>!(i.kind==="event"&&i.removed));
  const parts=[];let pending=[];
  vis.forEach(it=>{
    if(it.kind==="event"&&it.ghost){pending.push(it);return}
    parts.push({it,ghosts:pending});pending=[];
  });
  if(pending.length&&parts.length)parts[parts.length-1].ghosts.push(...pending);
  $("tl").innerHTML=parts.length
    ?parts.map(p=>{const g=p.ghosts.map(ghostHtml).join("");return p.it.kind==="block"?blockHtml(p.it,g):eventHtml(p.it,g)}).join("")
    :`<div class="empty">Aucun bloc. Ajoute-en un avec le bouton en bas.</div>`;

  const removed=S.items.filter(i=>i.kind==="event"&&i.removed).length;
  $("hidden").innerHTML=removed?`${removed} événement${removed>1?"s":""} retiré${removed>1?"s":""} de la timeline · <button data-act="restore">Réafficher</button>`:"";

  $("allday").innerHTML=(S.allDay||[]).map(t=>`<span>${esc(t)}</span>`).join("");

  // résumé
  const bl=blocks(),now=nowMin();
  const left=bl.reduce((a,b)=>a+remaining(b),0);
  const evLeft=S.items.filter(i=>i.kind==="event"&&!i.ghost&&!i.removed&&i.endMin>now)
    .reduce((a,e)=>a+(e.endMin-Math.max(e.startMin,now)),0);
  $("remain").textContent=fmt(left)+` · ${bl.filter(b=>b.done).length}/${bl.length} faits`;
  const end=new Date(Date.now()+(left+evLeft)*60000);
  $("eta").textContent=end.toLocaleTimeString("fr-CH",{hour:"2-digit",minute:"2-digit"});
  $("bar").innerHTML=bl.map(b=>`<span class="${b.done?"done":""}" style="flex:${b.dur};background:${COLOR[TPL[b.tpl].cat]}"></span>`).join("");

  // règle « quand un rendez-vous arrive »
  const active=S.items.filter(i=>i.kind==="event"&&!i.ghost&&!i.removed&&i.endMin>now);
  const bonus=bl.filter(b=>TPL[b.tpl].cat==="bonus"&&!b.done);
  const shortenable=bl.filter(b=>TPL[b.tpl].cat==="pilier"&&!b.done&&TPL[b.tpl].min&&b.dur>TPL[b.tpl].min);
  if(active.length&&!S.ruleApplied&&(bonus.length||shortenable.length)){
    const tot=active.reduce((a,e)=>a+e.endMin-e.startMin,0);
    const what=[bonus.length?`retirer ${bonus.length} bonus`:"",shortenable.length?`raccourcir ${shortenable.length} pilier${shortenable.length>1?"s":""} en version minimum`:""].filter(Boolean).join(", ");
    $("banner").innerHTML=`<div class="banner"><div>${active.length} rendez-vous à venir (${fmt(tot)}). Faire de la place selon ta règle : ${what}.</div><div class="acts"><button data-act="rule">Faire de la place</button><button class="ghostbtn" data-act="norule">Pas besoin</button></div></div>`;
  } else $("banner").innerHTML="";

  renderSync();
  save();
}

// ---------- Actions ----------
function act(a,id,v){
  const i=S.items.findIndex(x=>x.id===id),it=S.items[i];
  switch(a){
    case"open":
      if(!it)break;
      if(it.kind==="event"&&it.ghost){it.ghost=false;S.open=id;break}
      S.open=S.open===id?null:id;break;
    case"done":it.done=!it.done;if(it.done&&S.running?.id===id)stopRun();if(S.open===id)S.open=null;break;
    case"dur":it.dur=Math.max(5,it.dur+ +v);it.isMin=TPL[it.tpl].min===it.dur;it.alerted=false;break;
    case"min":{const t=TPL[it.tpl];it.alerted=false;
      if(it.isMin){it.dur=it.prev||t.d;it.isMin=false}else{it.prev=it.dur;it.dur=t.min;it.isMin=true}break}
    case"up":if(i>0)[S.items[i-1],S.items[i]]=[S.items[i],S.items[i-1]];break;
    case"down":if(i>=0&&i<S.items.length-1)[S.items[i+1],S.items[i]]=[S.items[i],S.items[i+1]];break;
    case"del":if(S.running?.id===id)S.running=null;S.items.splice(i,1);S.open=null;break;
    case"rm":it.removed=true;S.open=null;break;
    case"restore":S.items.forEach(x=>{if(x.kind==="event")x.removed=false});break;
    case"ghost":it.ghost=v==="1";if(it.ghost)S.open=null;break;
    case"run":unlockAudio();if(S.running?.id===id)stopRun();else startRun(id);break;
    case"focus":openFocus(id);return;
    case"rule":
      S.items=S.items.filter(x=>!(x.kind==="block"&&TPL[x.tpl].cat==="bonus"&&!x.done));
      S.items.forEach(x=>{const t=TPL[x.tpl];if(x.kind==="block"&&!x.done&&t.cat==="pilier"&&t.min&&x.dur>t.min){x.prev=x.dur;x.dur=t.min;x.isMin=true;x.alerted=false}});
      S.ruleApplied=true;break;
    case"norule":S.ruleApplied=true;break;
  }
  render();
}

document.addEventListener("click",e=>{
  const t=e.target.closest("[data-act]");
  if(!t){return}
  // un clic dans le panneau d'édition (hors bouton) ne referme pas le bloc
  if(t.dataset.act==="open"&&e.target.closest("[data-stop]"))return;
  e.stopPropagation();act(t.dataset.act,t.dataset.id,t.dataset.v);
});
document.addEventListener("keydown",e=>{
  if((e.key==="Enter"||e.key===" ")&&e.target.matches(".card[data-act]")){e.preventDefault();act("open",e.target.dataset.id)}
  if(e.key==="Escape"){if(focusId)closeFocus();else closeSheets()}
});

function setMode(mode){
  stopRun();
  const old=blocks(),evs=S.items.filter(x=>x.kind==="event").sort((a,b)=>a.startMin-b.startMin);
  const nb=freshBlocks(mode).map(b=>{const o=old.find(x=>x.tpl===b.tpl&&(x.done||x.elapsed>0));return o?{...b,done:o.done,elapsed:o.elapsed}:b});
  S.mode=mode;S.items=nb;S.open=null;S.ruleApplied=false;
  evs.forEach(ev=>insertEvent(S.items,ev));
  render();
}
document.querySelectorAll(".modes button").forEach(b=>b.addEventListener("click",()=>setMode(b.dataset.mode)));

// ---------- Feuilles (ajout, réglages) ----------
const bg=$("sheetbg");
function openSheet(id){closeSheets();$(id).hidden=false;bg.hidden=false;if(id==="setsheet")renderSettings()}
function closeSheets(){$("addsheet").hidden=true;$("setsheet").hidden=true;bg.hidden=true}
bg.addEventListener("click",closeSheets);
$("fab").addEventListener("click",()=>openSheet("addsheet"));
$("settingsbtn").addEventListener("click",()=>openSheet("setsheet"));

function renderTemplates(){
  $("tpls").innerHTML=ORDER.map(k=>{const t=TPL[k];const name=(k==="creatif"&&isMonday())?`${t.t} / ${t.mondayT}`:t.t;
    return`<button class="tpl" style="--c:${COLOR[t.cat]}" data-tpl="${k}"><i></i><span class="n">${esc(name)}<small>${esc(t.desc)}</small></span><span class="d">${fmt(t.d)}</span></button>`}).join("");
}
$("addsheet").addEventListener("click",e=>{
  const b=e.target.closest("[data-tpl]");if(!b)return;
  const k=b.dataset.tpl,nb=makeBlock(k),rank=ORDER.indexOf(k);
  // se place après le dernier bloc qui le précède dans la journée type
  let pos=0;
  for(let j=S.items.length-1;j>=0;j--){const x=S.items[j];if(x.kind==="block"&&ORDER.indexOf(x.tpl)<=rank){pos=j+1;break}}
  if(pos===0&&!S.items.some(x=>x.kind==="block"&&ORDER.indexOf(x.tpl)<=rank))pos=S.items.findIndex(x=>x.kind==="block");
  if(pos<0)pos=S.items.length;
  S.items.splice(pos,0,nb);S.open=nb.id;closeSheets();render();
  requestAnimationFrame(()=>document.querySelector(`.card[data-id="${nb.id}"]`)?.scrollIntoView({behavior:"smooth",block:"center"}));
});
$("resetbtn").addEventListener("click",e=>{
  const b=e.currentTarget;
  if(b.dataset.confirm!=="1"){b.dataset.confirm="1";b.textContent="Toucher encore pour confirmer";setTimeout(()=>{b.dataset.confirm="";b.textContent="Recommencer la journée"},4000);return}
  b.dataset.confirm="";b.textContent="Recommencer la journée";
  const evs=S.items.filter(x=>x.kind==="event").map(x=>({...x,ghost:false,removed:false}));
  const keep={lastSync:S.lastSync,allDay:S.allDay};
  newDay();Object.assign(S,keep);evs.sort((a,b)=>a.startMin-b.startMin).forEach(ev=>insertEvent(S.items,ev));
  closeSheets();render();toast("Journée remise à zéro.");
});

// ---------- Son, vibration, notifications ----------
let actx=null;
function unlockAudio(){try{actx=actx||new (window.AudioContext||window.webkitAudioContext)();if(actx.state==="suspended")actx.resume()}catch(e){}}
function ding(){
  if(!actx)return;
  try{[0,.35,.7].forEach((t,i)=>{const o=actx.createOscillator(),g=actx.createGain();o.type="sine";o.frequency.value=[660,880,990][i];
    const s=actx.currentTime+t;g.gain.setValueAtTime(0,s);g.gain.linearRampToValueAtTime(.25,s+.03);g.gain.exponentialRampToValueAtTime(.001,s+.9);
    o.connect(g).connect(actx.destination);o.start(s);o.stop(s+1)})}catch(e){}
}
let toastT;
function toast(msg){const t=$("toast");t.textContent=msg;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>t.hidden=true,6000)}

async function notify(title,body){
  if(!("Notification" in window)||Notification.permission!=="granted")return false;
  try{
    const reg=await navigator.serviceWorker?.getRegistration();
    const opts={body,icon:"icons/icon-192.png",badge:"icons/icon-192.png",tag:"chrono",renotify:true,vibrate:[300,150,300,150,300]};
    if(reg)await reg.showNotification(title,opts);else new Notification(title,opts);
    return true;
  }catch(e){return false}
}
function timerEnded(b,late){
  b.alerted=true;save();
  const name=titleOf(b);
  if(!late){ding();try{navigator.vibrate?.([300,150,300,150,300])}catch(e){}}
  if(document.visibilityState!=="visible")notify(name+" : temps écoulé","Le temps prévu ("+fmt(b.dur)+") est passé. Tu peux continuer ou passer au bloc suivant.");
  else if(!focusId)toast(name+" : le temps prévu est écoulé.");
}

// ---------- Mode focus ----------
const F=$("focus");let focusId=null,wake=null;
async function keepAwake(){try{wake=await navigator.wakeLock?.request("screen")}catch(e){wake=null}}
function openFocus(id){
  const b=find(id);if(!b)return;
  unlockAudio();
  if(S.running?.id!==id)startRun(id);
  focusId=id;S.open=null;F.hidden=false;
  F.style.setProperty("--c",COLOR[TPL[b.tpl].cat]);
  try{document.documentElement.requestFullscreen?.({navigationUI:"hide"}).catch(()=>{})}catch(e){}
  keepAwake();render();tickFocus();
}
function closeFocus(){
  focusId=null;F.hidden=true;
  try{if(document.fullscreenElement)document.exitFullscreen().catch(()=>{})}catch(e){}
  try{wake?.release()}catch(e){}wake=null;render();
}
function tickFocus(){
  if(!focusId)return;const b=find(focusId);if(!b){closeFocus();return}
  const t=TPL[b.tpl],el=elapsedOf(b),rem=b.dur*60-el,run=S.running?.id===b.id;
  $("fcat").textContent=CATNAME[t.cat];
  $("ftitle").textContent=titleOf(b);
  $("fmin").textContent=fmt(b.dur)+(t.minLabel?" · minimum : "+t.minLabel:"");
  $("fnum").textContent=(rem<0?"+":"")+clock(Math.abs(rem));
  $("fsub").textContent=!run?"en pause":rem<0?"de plus, c'est fini quand tu veux":"restantes";
  $("farc").style.strokeDashoffset=String(100-Math.min(100,el/(b.dur*60)*100));
  $("fpause").textContent=run?"Pause":"Reprendre";
  F.classList.toggle("over",rem<0);F.classList.toggle("paused",!run);
}
$("fpause").addEventListener("click",()=>{unlockAudio();if(S.running?.id===focusId)stopRun();else startRun(focusId);render();tickFocus()});
$("fplus").addEventListener("click",()=>{const b=find(focusId);if(b){b.dur+=5;b.alerted=false;b.isMin=false}render();tickFocus()});
$("fdone").addEventListener("click",()=>{const b=find(focusId);if(b){stopRun();b.done=true}closeFocus()});
$("fexit").addEventListener("click",closeFocus);

// ---------- Google Agenda ----------
const SCOPE="https://www.googleapis.com/auth/calendar.readonly";
let token=lsGet("gtoken",null),tokenClient=null,syncing=false,syncErr="";
const connected=()=>!!lsGet("gconnected",false);
const tokenValid=()=>token&&token.exp>Date.now()+60000;

function initGIS(){
  if(tokenClient)return true;
  if(!CFG.GOOGLE_CLIENT_ID||!window.google?.accounts?.oauth2)return false;
  tokenClient=google.accounts.oauth2.initTokenClient({
    client_id:CFG.GOOGLE_CLIENT_ID,scope:SCOPE,
    callback:r=>{
      if(r.error){syncErr="Connexion refusée";render();return}
      token={v:r.access_token,exp:Date.now()+(+r.expires_in||3600)*1000};
      lsSet("gtoken",token);lsSet("gconnected",true);syncErr="";
      sync();renderSettings();
    },
    error_callback:e=>{syncErr=e?.type==="popup_closed"?"Connexion annulée":"Connexion impossible";render()},
  });
  return true;
}
function connect(){
  if(!CFG.GOOGLE_CLIENT_ID){openSheet("setsheet");return}
  if(!initGIS()){toast("Google se charge encore, réessaie dans un instant.");return}
  tokenClient.requestAccessToken({prompt:connected()?"":"consent"});
}
function syncNow(){if(tokenValid())sync();else connect()}
function disconnect(){
  try{if(token)google.accounts.oauth2.revoke(token.v,()=>{})}catch(e){}
  token=null;lsSet("gtoken",null);lsSet("gconnected",false);
  S.items=S.items.filter(x=>x.kind!=="event");S.allDay=[];S.lastSync=null;render();renderSettings();
}
async function gget(url){
  const r=await fetch(url,{headers:{Authorization:"Bearer "+token.v}});
  if(r.status===401){token=null;lsSet("gtoken",null);throw new Error("auth")}
  if(!r.ok)throw new Error("http "+r.status);
  return r.json();
}
async function sync(){
  if(!tokenValid()||syncing)return;
  syncing=true;syncErr="";renderSync();
  try{
    const d=new Date(),start=new Date(d.getFullYear(),d.getMonth(),d.getDate()),end=new Date(start.getFullYear(),start.getMonth(),start.getDate()+1);
    const cals=((await gget("https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader")).items||[]).filter(c=>c.selected&&!c.hidden);
    const evs=[],allDay=[];
    await Promise.all(cals.map(async c=>{
      const q=new URLSearchParams({timeMin:start.toISOString(),timeMax:end.toISOString(),singleEvents:"true",orderBy:"startTime",maxResults:"100"});
      const r=await gget(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(c.id)}/events?${q}`);
      for(const e of r.items||[]){
        if(e.status==="cancelled")continue;
        if(e.attendees?.some(a=>a.self&&a.responseStatus==="declined"))continue;
        if(e.start?.date){allDay.push(e.summary||"(sans titre)");continue}
        const s=new Date(e.start.dateTime),en=new Date(e.end.dateTime);
        const toMin=x=>Math.max(0,Math.min(1440,(x-start)/60000));
        evs.push({gid:c.id+"|"+e.id,title:e.summary||"(sans titre)",startMin:toMin(s),endMin:toMin(en)});
      }
    }));
    merge(evs);S.allDay=allDay;S.lastSync=Date.now();
  }catch(e){
    syncErr=e.message==="auth"?"Session Google expirée":"Synchronisation impossible";
  }finally{syncing=false;render()}
}
function merge(evs){
  const ids=new Set(evs.map(e=>e.gid));
  S.items=S.items.filter(x=>x.kind!=="event"||ids.has(x.gid));
  evs.sort((a,b)=>a.startMin-b.startMin).forEach(e=>{
    const ex=S.items.find(x=>x.kind==="event"&&x.gid===e.gid);
    if(ex){ex.title=e.title;ex.startMin=e.startMin;ex.endMin=e.endMin}
    else insertEvent(S.items,{kind:"event",id:uid(),gid:e.gid,title:e.title,startMin:e.startMin,endMin:e.endMin,ghost:false,removed:false});
  });
}
function ago(ts){const m=Math.round((Date.now()-ts)/60000);return m<1?"à l'instant":m<60?`il y a ${m} min`:"à "+new Date(ts).toLocaleTimeString("fr-CH",{hour:"2-digit",minute:"2-digit"})}
function renderSync(){
  const dot=$("syncdot"),txt=$("synctxt"),btn=$("syncbtn");
  if(!CFG.GOOGLE_CLIENT_ID){dot.classList.add("off");txt.textContent="Google Agenda pas encore configuré";btn.textContent="Comment ?";return}
  if(syncing){dot.classList.remove("off");txt.textContent="Synchronisation…";btn.hidden=true;return}
  btn.hidden=false;
  if(syncErr){dot.classList.add("off");txt.textContent=syncErr;btn.textContent="Réessayer";return}
  if(!connected()){dot.classList.add("off");txt.textContent="Google Agenda non connecté";btn.textContent="Connecter";return}
  dot.classList.remove("off");
  txt.textContent=S.lastSync?"Google Agenda · synchronisé "+ago(S.lastSync):"Google Agenda connecté";
  btn.textContent="Actualiser";
}
$("syncbtn").addEventListener("click",()=>{if(!CFG.GOOGLE_CLIENT_ID)openSheet("setsheet");else syncNow()});

// ---------- Réglages ----------
function renderSettings(){
  const g=$("gstatus");
  if(!CFG.GOOGLE_CLIENT_ID){g.textContent="Il manque l'identifiant Google dans config.js. Suis le guide README.md, étape 2.";$("gconnect").hidden=true;$("gdisconnect").hidden=true}
  else if(connected()){g.textContent="Connecté. Seule la lecture de l'agenda est demandée : l'appli ne modifie jamais ton agenda.";$("gconnect").hidden=false;$("gconnect").textContent="Synchroniser maintenant";$("gdisconnect").hidden=false}
  else{g.textContent="Connecte ton compte pour voir les événements du jour dans la timeline.";$("gconnect").hidden=false;$("gconnect").textContent="Connecter Google Agenda";$("gdisconnect").hidden=true}
  const n=$("nstatus");
  if(!("Notification" in window)){n.textContent="Ce navigateur ne gère pas les notifications.";$("nbtn").hidden=true}
  else if(Notification.permission==="granted"){n.textContent="Activées. Une notification arrive à la fin du chrono si l'appli est en arrière-plan.";$("nbtn").hidden=true}
  else if(Notification.permission==="denied"){n.textContent="Bloquées. Autorise-les dans les réglages Android de l'appli, rubrique Notifications.";$("nbtn").hidden=true}
  else{n.textContent="Pour être prévenue quand le temps d'un bloc est écoulé.";$("nbtn").hidden=false}
}
$("gconnect").addEventListener("click",()=>{closeSheets();syncNow()});
$("gdisconnect").addEventListener("click",disconnect);
$("nbtn").addEventListener("click",async()=>{try{await Notification.requestPermission()}catch(e){}renderSettings()});
$("ntest").addEventListener("click",async()=>{unlockAudio();ding();try{navigator.vibrate?.([300,150,300])}catch(e){}
  if(!(await notify("Ma journée","Les notifications fonctionnent.")))toast("Son et vibration testés. Les notifications ne sont pas activées.")});
let installEvt=null;
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();installEvt=e;$("installbtn").hidden=false});
$("installbtn").addEventListener("click",async()=>{if(!installEvt)return;installEvt.prompt();await installEvt.userChoice.catch(()=>{});installEvt=null;$("installbtn").hidden=true});

// ---------- Boucle ----------
function tick(){
  if(S.date!==todayKey()){newDay();render();if(tokenValid())sync()}
  if(!S.running)return;
  const b=find(S.running.id);if(!b){S.running=null;return}
  const el=elapsedOf(b),t=document.querySelector(`[data-time="${b.id}"]`),p=document.querySelector(`[data-prog="${b.id}"]`);
  if(t)t.textContent=clock(el)+" / "+fmt(b.dur);
  if(p)p.style.width=Math.min(100,el/60/b.dur*100)+"%";
  if(el>=b.dur*60&&!b.alerted)timerEnded(b,false);
  tickFocus();
}
setInterval(tick,1000);
setInterval(()=>{if(tokenValid())sync()},15*60000);
document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState!=="visible")return;
  if(focusId)keepAwake();
  tick();render();
  if(tokenValid()&&(!S.lastSync||Date.now()-S.lastSync>5*60000))sync();
});

// ---------- Démarrage ----------
load();
renderTemplates();
// chrono terminé pendant que l'appli était fermée : on prévient sans son
if(S.running){const b=find(S.running.id);if(b&&elapsedOf(b)>=b.dur*60&&!b.alerted){b.alerted=true;toast(titleOf(b)+" : le temps prévu est écoulé.")}}
render();
if(tokenValid())sync();
window.addEventListener("load",()=>{initGIS()});
if("serviceWorker" in navigator)navigator.serviceWorker.register("sw.js").catch(()=>{});
