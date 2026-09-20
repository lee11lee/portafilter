/* ===================== Portafilter — vanilla JS PWA =====================
   Ported from the DialIn SwiftUI app (renamed Portafilter); restyled to the
   black/cream/burnt-orange design system in handoff/HANDOFF.md + DialIn Screens.dc.html.
   ==================================================================== */

/* Bump this string with every change that gets shipped, so the Setup screen always
   shows which build is actually running — the fastest way to tell whether an update
   to app.js actually reached this device (vs. still loading a cached/old copy). */
const APP_VERSION = 'v1.2 · 2026-09-20c';

/* ---------- Storage (unchanged) ---------- */
const STORE_KEY = 'dialin_v1';
function uid(){ return 'id_' + Date.now().toString(36) + Math.random().toString(36).slice(2,9); }
function defaultDB(){ return { beans:[], shots:[], recipes:[], machines:[], grinders:[], customFlavorTags:[], customProcessTags:[] }; }
function loadDB(){
  try{ const raw = localStorage.getItem(STORE_KEY); if(!raw) return defaultDB();
    const d = JSON.parse(raw);
    return Object.assign(defaultDB(), d);
  }catch(e){ return defaultDB(); }
}
let DB = loadDB();
function save(){ localStorage.setItem(STORE_KEY, JSON.stringify(DB)); }

function findBean(id){ return DB.beans.find(b=>b.id===id); }
function findShot(id){ return DB.shots.find(s=>s.id===id); }
function findGrinder(id){ return DB.grinders.find(g=>g.id===id); }
function findMachine(id){ return DB.machines.find(m=>m.id===id); }
function findRecipe(id){ return DB.recipes.find(r=>r.id===id); }
function activeGrinder(){ return DB.grinders.find(g=>g.isActive) || DB.grinders[0] || null; }
function shotsForBean(beanId){ return DB.shots.filter(s=>s.beanId===beanId).sort((a,b)=>new Date(b.date)-new Date(a.date)); }
function activeBeans(){ return DB.beans.filter(b=>!b.isArchived).sort((a,b)=>b.createdAt-a.createdAt); }
function archivedBeans(){ return DB.beans.filter(b=>b.isArchived).sort((a,b)=>b.createdAt-a.createdAt); }

/* ---------- Derived / wording helpers (unchanged) ---------- */
function daysOffRoast(bean){
  const roast = new Date(bean.roastDate + 'T00:00:00');
  const now = new Date();
  const d0 = new Date(roast.getFullYear(), roast.getMonth(), roast.getDate());
  const d1 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((d1 - d0) / 86400000);
}
function restStateLabel(days){ if(days<14) return 'Resting'; if(days<40) return 'Ready'; return 'Fading'; }
function freshnessLabel(days){ if(days<14) return 'Too fresh (resting)'; if(days<40) return 'Peak freshness'; if(days<55) return 'Past peak'; return 'Likely stale'; }
function ratio(shot){ return shot.doseGrams>0 ? shot.yieldGrams/shot.doseGrams : 0; }
function ratioLabel(shot){ return '1:' + ratio(shot).toFixed(1); }
function extractionWording(v){
  if(v<=3) return 'Sour';
  if(v<=7) return 'Balanced';
  return 'Bitter';
}
const DRINK_TYPES = [
  {id:'espresso', label:'Espresso', short:'Esp', hint:'straight'},
  {id:'cappuccino', label:'Cappuccino', short:'Cap', hint:'with milk'},
  {id:'cortado', label:'Cortado', short:'Cor', hint:'short milk'}
];
const BUILTIN_FLAVORS = ['Chocolate','Nutty','Caramel','Fruity','Floral','Berry','Citrus','Winey'];
const BUILTIN_PROCESSES = ['Washed','Natural','Honey','Anaerobic'];
const ROAST_LEVELS = ['Light','Medium-Light','Medium','Medium-Dark','Dark'];

function allFlavorNames(){
  const seen = new Set(); const names = [];
  [...BUILTIN_FLAVORS, ...DB.customFlavorTags.map(t=>t.name)].forEach(n=>{
    const k = n.toLowerCase(); if(!seen.has(k)){ seen.add(k); names.push(n); }
  });
  return names;
}
function allProcessNames(){
  const seen = new Set(); const names = [];
  [...BUILTIN_PROCESSES, ...DB.customProcessTags.map(t=>t.name)].forEach(n=>{
    const k = n.toLowerCase(); if(!seen.has(k)){ seen.add(k); names.push(n); }
  });
  return names;
}
function avgBeanRating(beanId){
  const vals = shotsForBean(beanId).map(s=>{
    const top = s.ratings.reduce((m,r)=>Math.max(m,r.stars||0),0);
    return top;
  }).filter(v=>v>0);
  if(!vals.length) return null;
  return vals.reduce((a,b)=>a+b,0)/vals.length;
}
function bestShot(beanId){
  const shots = shotsForBean(beanId);
  if(!shots.length) return null;
  return shots.reduce((best,s)=> (!best || ratio(s)<ratio(best)) ? s : best, null);
}

/* ---------- Misc utils (unchanged) ---------- */
function escapeHtml(s){ if(s===undefined||s===null) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmtNum(v,decimals){ return Number(v).toFixed(decimals===undefined?1:decimals); }
function isToday(iso){ const d=new Date(iso), n=new Date(); return d.toDateString()===n.toDateString(); }
function isYesterday(iso){ const d=new Date(iso); const y=new Date(); y.setDate(y.getDate()-1); return d.toDateString()===y.toDateString(); }
function timestampLabel(iso){ if(isToday(iso)) return 'Today'; if(isYesterday(iso)) return 'Yesterday'; return new Date(iso).toLocaleDateString('en-US',{weekday:'short'}); }
function fmtRoastDate(iso){ const d=new Date(iso+'T00:00:00'); return d.toLocaleDateString('en-US',{day:'numeric',month:'short'}); }
function vibrate(ms){ try{ if(navigator.vibrate) navigator.vibrate(ms||8);}catch(e){} }
function todayISO(){ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }

/* Piecewise fraction mapping — kept per HANDOFF ("keep the piecewise screenFrac/valForFrac
   mapping"); no longer used by grind/dose/yield/time (those use the a8() gear-drag gesture
   below) but retained for any simple linear-position use elsewhere. */
function screenFrac(val, range, sr){
  if(!sr) return (val-range[0])/(range[1]-range[0]);
  const s=3.0, pre=Math.max(0,sr[0]-range[0]), sen=sr[1]-sr[0], post=Math.max(0,range[1]-sr[1]);
  const total=pre+s*sen+post, preS=pre/total, senS=s*sen/total;
  if(val<=sr[0]) return pre===0?0:(val-range[0])/pre*preS;
  if(val<=sr[1]) return preS+(val-sr[0])/sen*senS;
  const postS=post/total; return preS+senS+(post===0?0:(val-sr[1])/post*postS);
}
function valForFrac(frac, range, sr){
  if(!sr) return range[0]+frac*(range[1]-range[0]);
  const s=3.0, pre=Math.max(0,sr[0]-range[0]), sen=sr[1]-sr[0], post=Math.max(0,range[1]-sr[1]);
  const total=pre+s*sen+post, preS=pre/total, senS=s*sen/total, postS=post/total;
  if(frac<=preS) return preS===0?range[0]:range[0]+(frac/preS)*pre;
  if(frac<=preS+senS) return senS===0?sr[0]:sr[0]+((frac-preS)/senS)*sen;
  return postS===0?sr[1]:sr[1]+((frac-preS-senS)/postS)*post;
}

/* ---------- Photo helper: resize + compress to JPEG dataURL (unchanged) ---------- */
function fileToCompressedDataURL(file, maxDim, quality){
  maxDim = maxDim || 900; quality = quality || 0.8;
  return new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let w = img.width, h = img.height;
        if(w>maxDim || h>maxDim){ if(w>h){ h=Math.round(h*maxDim/w); w=maxDim; } else { w=Math.round(w*maxDim/h); h=maxDim; } }
        const canvas = document.createElement('canvas');
        canvas.width=w; canvas.height=h;
        canvas.getContext('2d').drawImage(img,0,0,w,h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ===================== Navigation / App State (unchanged) ===================== */
let Nav = {
  tab: 0,
  stacks: [[],[],[],[],[]],
  modal: null,
  confirm: null,
  toast: null,
};
let Registry = { validators:{}, dragFields:{} };

/* Ephemeral view-state that isn't part of the data model (sort/filter/segment
   selection). Base tab-level screens get fresh params on every render, so this
   lives outside Nav/params instead. */
let UIState = { shelfSeg:'Active', historySort:'Recent', historyFilter:'All', historyPage:1, historyPageSize:8 };

/* Buttons whose enabled state depends on live text-field values register a check here. */
function regValidate(btnId, checkFn){ Registry.validators[btnId] = checkFn; }
function revalidateAll(){
  Object.keys(Registry.validators).forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.disabled = !Registry.validators[id]();
  });
}

function onboardingNeeded(){ return DB.machines.length===0 || DB.grinders.length===0; }
function baseScreenFor(tab){
  switch(tab){
    case 0: return {screen:'dial-home', params:{}};
    case 1: return {screen:'bean-shelf', params:{}};
    case 2: return {screen:'shot-history', params:{beanId:null}};
    case 3: return {screen:'recipes-list', params:{}};
    default: return {screen:'settings', params:{}};
  }
}
function currentTop(){
  const st = Nav.stacks[Nav.tab];
  return st.length ? st[st.length-1] : baseScreenFor(Nav.tab);
}
function activeParams(){
  if(Nav.modal) return Nav.modal.params;
  return currentTop().params;
}
function pushStack(screen, params){ Nav.stacks[Nav.tab].push({screen, params}); render(); }
function popStack(){ Nav.stacks[Nav.tab].pop(); render(); }
function openModal(screen, params){ Nav.modal = {screen, params}; render(); }
function closeModal(){ Nav.modal = null; render(); }
function confirmDialog(title, message, confirmLabel, destructive, onConfirm){
  Nav.confirm = {title, message, confirmLabel, destructive, onConfirm}; render();
}
function toast(msg){ Nav.toast = msg; }

/* ===================== Render engine ===================== */
function render(){
  try{
    renderInner();
  }catch(err){
    // A broken modal/confirm left in Nav would otherwise throw again on every future
    // render (since this same function re-renders it each time), which locks up every
    // action in the app — not just the one that failed — until a full page reload
    // resets Nav from scratch. Clearing the stuck state here means one bad screen can't
    // take the rest of the app down with it.
    console.error('render() failed, resetting modal/confirm state:', err);
    Nav.modal = null; Nav.confirm = null;
    try{ renderInner(); }catch(err2){ console.error('render() failed again:', err2); }
  }
}
function renderInner(){
  Registry = { validators:{}, dragFields:{} };
  const app = document.getElementById('app');
  let html;
  if(onboardingNeeded()){
    html = OnboardingScreen();
  } else {
    const top = currentTop();
    const isBase = Nav.stacks[Nav.tab].length===0;
    const noScroll = top.screen==='shot-history';
    html = `<div class="screen${noScroll?' no-scroll':''}">${renderScreen(top.screen, top.params)}</div>` + (isBase ? TabBar() : '');
  }
  app.innerHTML = html;
  if(Nav.modal){ app.insertAdjacentHTML('beforeend', renderModal()); }
  if(Nav.confirm){ app.insertAdjacentHTML('beforeend', renderConfirm()); }
  if(Nav.toast){
    const msg = Nav.toast; Nav.toast = null;
    app.insertAdjacentHTML('beforeend', `<div class="toast">${escapeHtml(msg)}</div>`);
    setTimeout(()=>{ const t=document.querySelector('.toast'); if(t) t.remove(); }, 1800);
  }
  wireAll();
}

function renderScreen(screen, params){
  switch(screen){
    case 'dial-home': return DialHomeScreen();
    case 'log-shot': return LogShotScreen(params);
    case 'bean-shelf': return BeanShelfScreen();
    case 'bag-detail': return BagDetailScreen(params);
    case 'shot-history': return ShotHistoryScreen(params);
    case 'recipes-list': return RecipesListScreen();
    case 'edit-recipe': return EditRecipeScreen(params);
    case 'settings': return SettingsScreen();
    case 'grinder-detail': return GrinderDetailScreen(params);
    case 'machine-detail': return MachineDetailScreen(params);
    default: return '';
  }
}

function renderModal(){
  const m = Nav.modal;
  let inner;
  switch(m.screen){
    case 'add-edit-bean': inner = AddEditBeanModal(m.params); break;
    case 'add-recipe': inner = AddRecipeModal(m.params); break;
    case 'grinder-setup': inner = GrinderSetupModal(m.params); break;
    case 'add-machine': inner = AddMachineModal(m.params); break;
    case 'add-grinder': inner = AddGrinderModal(m.params); break;
    case 'finish-bean': inner = FinishBeanModal(m.params); break;
    default: inner = '';
  }
  return `<div class="overlay" onclick="if(event.target===this) A.closeModal()"><div class="sheet">${inner}</div></div>`;
}

function renderConfirm(){
  const c = Nav.confirm;
  return `<div class="confirm-overlay"><div class="confirm-box">
    <div class="body">
      <div class="t">${escapeHtml(c.title)}</div>
      <div class="m">${escapeHtml(c.message)}</div>
    </div>
    <div class="btnrow">
      <button onclick="A.confirmNo()">Cancel</button>
      <button class="${c.destructive?'destructive':''}" onclick="A.confirmYes()">${escapeHtml(c.confirmLabel)}</button>
    </div>
  </div></div>`;
}

/* Tab bar only appears on the five tab-level screens (behaviour note 10);
   render() only calls this when the current stack is empty. */
function TabBar(){
  const tabs = ['Dial','Shelf','History','Recipes','Setup'];
  return `<div class="tab-bar"><div class="tab-row">
    ${tabs.map((t,i)=>`<button class="tab-btn ${i===Nav.tab?'active':''}" onclick="A.switchTab(${i})">${t}</button>`).join('')}
  </div></div>`;
}

function chevronLeft(){ return '‹'; }
/* Pushed-detail-screen header: back chevron, title, right-aligned meta. */
function detailHeader(title, meta, onBack, saveAction){
  return `<div class="header-row">
    <button class="link-back" onclick="${onBack||'A.pop()'}">${chevronLeft()}</button>
    <span class="htitle bc">${escapeHtml(title)}</span>
    ${saveAction ? `<button class="bsc" style="margin-left:auto;color:var(--accent);font-weight:600;font-size:13px;letter-spacing:.08em;text-transform:uppercase;" onclick="${saveAction}">Save</button>`
      : (meta?`<span class="hmeta">${escapeHtml(meta)}</span>`:'')}
  </div>`;
}
/* Modal header per behaviour note 11: Cancel (dim) — centred title — Save (accent),
   a not-yet-valid Save renders faint with a one-line hint instead of being hidden. */
function sheetNav(title, saveLabel, saveBtnId, canSave, saveAction, hint, cancelAction){
  return `<div class="sheet-nav">
      <button onclick="${cancelAction||'A.closeModal()'}">Cancel</button>
      <span class="title">${escapeHtml(title)}</span>
      <button class="save" id="${saveBtnId}" ${canSave?'':'disabled'} onclick="${saveAction}">${escapeHtml(saveLabel||'Save')}</button>
    </div>
    ${(!canSave && hint) ? `<div class="btn-hint">${escapeHtml(hint)}</div>` : ''}`;
}

/* ===================== Drag-field widget engine =====================
   Ports the reference design's a8() gesture exactly (HANDOFF note 2):
   - pointerdown records x0, y0, start value, element rect
   - inert until |dx|>5px; abandoned if |dy|>10px and dominates (lets page scroll)
   - once live: gear = 1 / (1 + dy/22), dy = how far below the start the finger is
   - value = startValue + dx * (range/width) * gear, snapped to the field's step
   - a tap without drag jumps the value to the tapped position
   Each field also gets its own visual treatment (note 4): grind = tick ruler,
   dose = fill bar, yield = hairline scale with ratio captions, time = shot-clock cells. */
const DragGesture = {};

function regDragField(key, cfg){ Registry.dragFields[key] = cfg; }

function dialTicks(){
  const out = [];
  for(let i=0;i<=24;i++) out.push({major: i%6===0, });
  return out;
}

/* The extraction ruler was reusing dialTicks() — a 25-tick grid built for the
   grind ruler's continuous 0–100 range. Extraction only has 10 possible stops
   (1–10, step 1), so those 25 decorative ticks never lined up with where the
   handle could actually land — the handle would rest between gridlines instead
   of on one, which read as "the slider doesn't match the lines". This generates
   exactly one tick per stop (9 even gaps, matching the handle's own left:%),
   so every position the handle can snap to has a line under it. */
function exTicks(){
  const out = [];
  for(let v=1; v<=10; v++) out.push({major: v===1 || v===3 || v===7 || v===10});
  return out;
}

function renderDragField(key, cfg){
  regDragField(key, cfg);
  const v = cfg.get();
  const pct = Math.max(0, Math.min(100, ((v-cfg.min)/(cfg.max-cfg.min))*100));
  const head = `<div class="field-head">
      <span class="flabel">${escapeHtml(cfg.label)}</span>
      <span class="fgear" id="gear-${key}"></span>
      <span class="fval" id="fval-${key}" onclick="A.editDragFieldValue('${key}')">${fmtNum(v,cfg.decimals)}<span class="unit">${escapeHtml(cfg.unit||'')}</span></span>
      ${cfg.kind==='hscale' ? `<span class="bc" style="font-weight:700;font-size:17px;color:var(--accent);padding-left:2px;" id="fratio-${key}">1:${(cfg.ratioOf?cfg.ratioOf():0).toFixed(1)}</span>` : ''}
    </div>`;
  let body = '';
  if(cfg.kind==='ruler'){
    body = `<div class="ruler" id="drag-${key}" data-key="${key}">
        <div class="ticks">${dialTicks().map(t=>`<span style="height:${t.major?'18px':'10px'};background:${t.major?'var(--hair-strong)':'rgba(227,204,174,.2)'}"></span>`).join('')}</div>
        <div class="baseline"></div>
        <div class="handle" id="handle-${key}" style="left:${pct}%"></div>
      </div>`;
  } else if(cfg.kind==='fillbar'){
    body = `<div class="fillbar" id="drag-${key}" data-key="${key}">
        <div class="fill" id="fill-${key}" style="width:${pct}%"></div>
        <div class="edge" id="edge-${key}" style="left:${pct}%"></div>
      </div>
      <div class="field-caps"><span>${fmtNum(cfg.min,0)}</span><span>${escapeHtml(cfg.capsLabel||'')}</span><span>${fmtNum(cfg.max,0)}</span></div>`;
  } else if(cfg.kind==='hscale'){
    const stops = (cfg.stops?cfg.stops():[]);
    body = `<div class="hscale" id="drag-${key}" data-key="${key}">
        <div class="stops">${stops.map(s=>`<span class="stop" style="left:${s.pct}%">${escapeHtml(s.label)}</span>`).join('')}</div>
        <div class="line"></div>
        <div class="caret" id="caret-${key}" style="left:${pct}%"></div>
      </div>`;
  } else if(cfg.kind==='shotclock'){
    const n = 9, span = cfg.max-cfg.min, step5 = span/n;
    let cells = '';
    for(let i=0;i<n;i++){
      const lo = cfg.min + i*step5;
      const on = v >= lo+step5, active = v>=lo && v<lo+step5;
      cells += `<span class="${on?'on':active?'active':''}"></span>`;
    }
    body = `<div class="shotclock" id="drag-${key}" data-key="${key}">${cells}</div>
      <div class="field-caps"><span>${fmtNum(cfg.min,0)}${cfg.unit||''}</span><span>${escapeHtml(cfg.capsLabel||'')}</span><span>${fmtNum(cfg.max,0)}${cfg.unit||''}</span></div>`;
  }
  return `<div class="field-block">${head}${body}</div>`;
}

/* Extraction balance: previously tap-only (click a point on the ruler, then a full
   screen re-render) which felt sticky/unresponsive next to the other fields. Wired
   into the same drag-field engine as grind/dose/yield/time so it now supports a real
   drag (with the same gear/sensitivity feel) and only patches the handle + word label
   in place, instead of tapping-and-re-rendering the whole screen on every move. */
function renderExtractionField(draft, ex, exPct){
  regDragField('extraction', {
    kind:'exscale', min:1, max:10, step:1, decimals:0,
    get:()=>draft.extractionBalance,
    set:v=>{ draft.extractionBalance = v; },
    onPatch:(v)=>{
      const w = document.getElementById('ex-word');
      if(w) w.textContent = extractionWording(v);
    }
  });
  return `<div style="padding:4px 10px 5px;">
    <div class="extraction-nav">
      <button onclick="A.bumpExtraction(-1)">${chevronLeft()} Sour</button>
      <div class="word" id="ex-word">${extractionWording(ex)}</div>
      <button onclick="A.bumpExtraction(1)">Bitter ›</button>
    </div>
    <div class="extraction-ruler" id="drag-extraction" data-key="extraction">
      ${exTicks().map(t=>`<span class="tk" style="height:${t.major?'18px':'10px'};background:${t.major?'var(--hair-strong)':'rgba(227,204,174,.2)'}"></span>`).join('')}
      <span class="handle" id="handle-extraction" style="left:${exPct}%"></span>
    </div>
    <div class="extraction-cap">Extraction</div>
  </div>`;
}

function patchDragField(key, cfg, gear){
  const v = cfg.get();
  const pct = Math.max(0, Math.min(100, ((v-cfg.min)/(cfg.max-cfg.min))*100));
  const fval = document.getElementById('fval-'+key);
  if(fval) fval.innerHTML = fmtNum(v,cfg.decimals) + `<span class="unit">${escapeHtml(cfg.unit||'')}</span>`;
  const gearEl = document.getElementById('gear-'+key);
  if(gearEl) gearEl.textContent = gear ? (gear>=0.95 ? '1:1' : '1:'+Math.round(1/gear)) : '';
  const handle = document.getElementById('handle-'+key); if(handle) handle.style.left = pct+'%';
  const fill = document.getElementById('fill-'+key); if(fill) fill.style.width = pct+'%';
  const edge = document.getElementById('edge-'+key); if(edge) edge.style.left = pct+'%';
  const caret = document.getElementById('caret-'+key); if(caret) caret.style.left = pct+'%';
  const ratioEl = document.getElementById('fratio-'+key); if(ratioEl && cfg.ratioOf) ratioEl.textContent = '1:'+cfg.ratioOf().toFixed(1);
  if(cfg.kind==='shotclock'){
    const track = document.getElementById('drag-'+key);
    if(track){
      const n = 9, span = cfg.max-cfg.min, step5 = span/n;
      Array.from(track.children).forEach((cell,i)=>{
        const lo = cfg.min + i*step5;
        const on = v >= lo+step5, active = v>=lo && v<lo+step5;
        cell.className = on?'on':active?'active':'';
      });
    }
  }
  if(cfg.onPatch) cfg.onPatch(v);
}

function wireDragFields(){
  Object.keys(Registry.dragFields).forEach(key=>{
    const cfg = Registry.dragFields[key];
    const el = document.getElementById('drag-'+key);
    if(!el) return;
    el.addEventListener('pointerdown', e=>{
      const r = el.getBoundingClientRect();
      DragGesture[key] = {left:r.left, width:r.width, x0:e.clientX, y0:e.clientY, v0:cfg.get(), live:false, gear:1, pid:e.pointerId};
    });
    el.addEventListener('pointermove', e=>{
      const st = DragGesture[key]; if(!st) return;
      if(!st.live){
        const dx = Math.abs(e.clientX-st.x0), dy = Math.abs(e.clientY-st.y0);
        if(dy>10 && dy>dx){ DragGesture[key] = null; return; }
        if(dx<5) return;
        st.live = true;
        try{ el.setPointerCapture(st.pid); }catch(err){}
      }
      // Once the drag is committed to horizontal, the finger's vertical position is
      // used on purpose (moving down fine-tunes sensitivity via "gear") — so the page's
      // own vertical scroll must be locked out for the rest of this gesture, or the
      // screen scrolls underneath the same motion and the drag feels like it's fighting
      // the page. touch-action:pan-y still lets a genuinely vertical gesture scroll
      // (handled above, before .live), so only the committed drag gets this treatment.
      e.preventDefault();
      const dy = Math.max(0, e.clientY - st.y0);
      st.gear = 1/(1+dy/22);
      const span = (cfg.max-cfg.min)/st.width;
      const raw = st.v0 + (e.clientX-st.x0)*span*st.gear;
      const snapped = Math.max(cfg.min, Math.min(cfg.max, Number((Math.round(raw/cfg.step)*cfg.step).toFixed(3))));
      if(snapped !== cfg.get()){ cfg.set(snapped); patchDragField(key,cfg,st.gear); vibrate(4); }
      else { patchDragField(key,cfg,st.gear); }
    }, {passive:false});
    function finish(e){
      const st = DragGesture[key]; if(!st) return;
      if(!st.live && Math.abs(e.clientY-st.y0)<8){
        const fr = Math.max(0, Math.min(1, (e.clientX-st.left)/st.width));
        const raw = cfg.min + fr*(cfg.max-cfg.min);
        const snapped = Math.max(cfg.min, Math.min(cfg.max, Number((Math.round(raw/cfg.step)*cfg.step).toFixed(3))));
        cfg.set(snapped);
      }
      DragGesture[key] = null;
      patchDragField(key,cfg,null);
    }
    el.addEventListener('pointerup', finish);
    el.addEventListener('pointercancel', finish);
  });
}

/* Generic long-press: any element with data-longpress="A.someAction(...)" runs that
   action after a ~550ms hold that doesn't move much, and is cancelled by an early
   release or by drifting past a small movement threshold (so it doesn't fire from a
   scroll or a drag). Used to remove custom process/flavour options. */
function wireLongPress(){
  document.querySelectorAll('[data-longpress]').forEach(el=>{
    if(el._longPressWired) return;
    el._longPressWired = true;
    let timer = null, sx = 0, sy = 0;
    const clear = ()=>{ if(timer){ clearTimeout(timer); timer = null; } };
    el.addEventListener('pointerdown', e=>{
      sx = e.clientX; sy = e.clientY;
      clear();
      timer = setTimeout(()=>{
        timer = null; vibrate(18);
        const fn = el.getAttribute('data-longpress');
        try{ new Function(fn)(); }catch(err){}
      }, 550);
    });
    el.addEventListener('pointermove', e=>{
      if(timer && (Math.abs(e.clientX-sx)>8 || Math.abs(e.clientY-sy)>8)) clear();
    });
    ['pointerup','pointercancel','pointerleave'].forEach(ev=>el.addEventListener(ev, clear));
    el.addEventListener('contextmenu', e=>e.preventDefault());
  });
}

/* History is meant to never scroll — it should show exactly as many shots as fit the
   device's screen and use Previous/Next to move between pages instead. The available
   height depends on the actual screen (and whatever header/back-button/filter rows are
   above it that day), so it's measured after paint rather than guessed: take the already-
   rendered list viewport's real height, divide by one row's real height, and if that
   doesn't match how many rows this render assumed, re-render once with the corrected
   count. The corrected count then reproduces the same measurement on the next pass
   (row/viewport heights don't depend on how many rows are showing), so this settles
   after a single extra render rather than looping. */
function adjustHistoryPageSize(){
  const viewport = document.getElementById('history-list-viewport');
  if(!viewport) return;
  const rows = viewport.querySelectorAll('.hist-row');
  if(rows.length===0) return;
  const rowH = rows[0].getBoundingClientRect().height;
  if(!rowH) return;
  const fit = Math.max(1, Math.floor(viewport.clientHeight / rowH));
  if(fit !== UIState.historyPageSize){
    UIState.historyPageSize = fit;
    render();
  }
}
function wireAll(){
  wireDragFields();
  wireLongPress();
  document.querySelectorAll('textarea[data-autosize]').forEach(t=>{ t.style.height='auto'; t.style.height=t.scrollHeight+'px'; });
  adjustHistoryPageSize();
}

/* ===================== Screens: Onboarding ===================== */
/* Trimmed per feedback: the intro paragraph and per-step descriptions were reading
   like marketing copy for a one-person logbook, and the second "I already have beans
   on the shelf" button led to the exact same setup modal as the primary button — a
   second way to do the same thing, not a real choice — so it's gone and the single
   CTA now says what it actually does. */
function OnboardingScreen(){
  return `<div class="screen" style="padding-top:78px;">
    <div class="section-label" style="margin-bottom:14px;">Portafilter</div>
    <div class="bc" style="font-weight:700;font-size:40px;color:var(--ink);text-transform:uppercase;line-height:1.05;margin-bottom:26px;">Dial it in once.<br>Keep the number.</div>
    <div style="margin-bottom:30px;">
      <div class="rule"></div>
      ${obStep('A','Shelve the bag')}
      <div class="rule"></div>
      ${obStep('B','Pull and log the shot')}
      <div class="rule"></div>
      ${obStep('C','Save the keeper')}
      <div class="rule"></div>
    </div>
    <button class="btn-primary" onclick="A.openOnboardingSetup()">Set up machine &amp; grinder</button>
  </div>`;
}
function obStep(letter,title){
  return `<div style="display:flex;align-items:center;gap:12px;padding:13px 0;">
    <div class="bsc" style="width:14px;flex:none;font-weight:600;font-size:11px;letter-spacing:.16em;color:var(--accent);text-transform:uppercase;">${letter}</div>
    <div class="bc" style="font-weight:600;font-size:19px;color:var(--ink);text-transform:uppercase;">${escapeHtml(title)}</div>
  </div>`;
}
function stepperRow(label, val, dec, inc, big){
  return `<div class="row-item">
    <span class="rlabel">${escapeHtml(label)}</span>
    <div class="stepper">
      <button onclick="${dec}">−</button>
      <span class="sval" style="${big?'min-width:74px;':''}">${escapeHtml(val)}</span>
      <button onclick="${inc}">+</button>
    </div>
  </div>`;
}
function GrinderSetupModal(params){
  const d = params.draft;
  regValidate('btn-onboarding-save', ()=> d.machineName.trim().length>0 && d.grinderName.trim().length>0);
  const canSave = d.machineName.trim() && d.grinderName.trim();
  return `<div class="screen-header" style="border-bottom:1px solid var(--ink);"><h1>Setup</h1></div>
    <div style="margin:16px 0 7px;"><span class="section-label" style="margin:0;">Espresso machine</span></div>
    ${nameEditRow('machineName', d.machineName, 'Machine name')}
    ${nameEditRow('machineBrand', d.machineBrand, 'Brand / model (optional)')}
    <div style="margin:18px 0 7px;"><span class="section-label" style="margin:0;">Grinder</span></div>
    ${nameEditRow('grinderName', d.grinderName, 'e.g. Niche Zero')}
    ${nameEditRow('grinderBrand', d.grinderBrand, 'Brand / model (optional)')}
    <div class="row-list" style="margin-top:16px;">
      ${stepperRow('Dial min', d.grindMinText, "A.bumpOnboardDial('grindMinText',-1)", "A.bumpOnboardDial('grindMinText',1)")}
      ${stepperRow('Dial max', d.grindMaxText, "A.bumpOnboardDial('grindMaxText',-1)", "A.bumpOnboardDial('grindMaxText',1)")}
      ${stepperRow('Step', d.grindStepText, "A.bumpOnboardDial('grindStepText',-0.1)", "A.bumpOnboardDial('grindStepText',0.1)")}
    </div>
    <button class="btn-primary" id="btn-onboarding-save" ${canSave?'':'disabled'} onclick="A.saveOnboarding()">Get started</button>
    <button style="width:100%;text-align:center;padding:16px 0 0;color:var(--ink-faint);font-size:11px;letter-spacing:.13em;text-transform:uppercase;" onclick="A.autofillOnboarding()">Autofill test data</button>`;
}
function nameEditRow(field, value, placeholder){
  return `<div class="dashed-field" style="border-style:solid;border-color:var(--hair);margin-top:0;">
    <input type="text" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" style="font-family:'Barlow Condensed',sans-serif;font-size:20px;font-weight:600;color:var(--ink);"
      oninput="A.setDraftField('${field}',this.value)"></div>`;
}

/* ===================== Screen: Dial Home (9A) ===================== */
function DialHomeScreen(){
  const beans = activeBeans();
  return `${screenHeader('Dial in','Step 1 / 3')}
    <div class="subhead">Select charge — what is in the hopper</div>
    <div>${beans.map(b=>BeanDialCard(b)).join('')}</div>
    <div class="rule"></div>
    <button class="btn-ghost" onclick="A.openAddBean()">+ Shelve a new bag</button>
    ${beans.length===0 ? '<div class="empty-msg">Add your first bag to start logging shots.</div>' : ''}`;
}
function screenHeader(title, meta){
  return `<div class="screen-header"><h1>${escapeHtml(title)}</h1><span class="meta">${escapeHtml(meta)}</span></div>`;
}
function BeanDialCard(bean){
  const days = daysOffRoast(bean);
  const state = restStateLabel(days);
  const progress = Math.max(0, Math.min(1, days/40)) * 100;
  const shots = shotsForBean(bean.id);
  const last = shots[0];
  const metaLine = [bean.origin, bean.roastLevel, bean.process].filter(Boolean).join(' · ');
  return `<div class="bean-card" onclick="A.openLogShot('${bean.id}')">
    <div class="top">
      ${photoThumb(bean.photoData, 46, 60)}
      <div style="flex:1;min-width:0;">
        <div class="meta">${escapeHtml(metaLine||'')}</div>
        <div class="name">${escapeHtml(bean.name)}</div>
        <div class="roaster">${escapeHtml(bean.roaster)}</div>
      </div>
      <div class="days-block">
        <div class="num">${days}</div>
        <div class="label">days off roast</div>
      </div>
    </div>
    <div class="card-footer">
      <span class="verdict-chip">${state}</span>
      <div class="progress-track"><div class="progress-fill" style="width:${progress}%"></div></div>
      ${last ? `<span class="bsc" style="font-weight:600;font-size:11px;letter-spacing:.1em;color:var(--ink-dim);white-space:nowrap;">${fmtNum(last.doseGrams,1)}g · ${escapeHtml(last.grindSetting)}</span>` : ''}
    </div>
  </div>`;
}
function photoThumb(photoData, w, h, onClick){
  const clickable = !!onClick;
  return `<div class="beanphoto" style="width:${w}px;height:${h}px;${clickable?'cursor:pointer;':''}" ${clickable?`onclick="${onClick}"`:''}>${
    photoData ? `<img src="${photoData}">`
    : (clickable ? `<span class="bsc" style="font-size:9.5px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-faint);padding:2px;">+ Photo</span>` : '')
  }</div>`;
}

/* ===================== Screen: Log Shot (9T / 9U) ===================== */
const GRIND_RANGE_FALLBACK = {min:0,max:10,step:0.1};
const DOSE_RANGE = {min:14,max:24,step:0.1};
const YIELD_RANGE = {min:20,max:80,step:0.5};
const TIME_RANGE = {min:5,max:60,step:1};

function makeShotDraft(bean, existingShot){
  const grinder = activeGrinder();
  if(existingShot){
    const stars = {};
    existingShot.ratings.forEach(r=>{ stars[r.drinkType] = r.stars; });
    let gv = parseFloat(existingShot.grindSetting); if(isNaN(gv)) gv = 5;
    if(grinder) gv = Math.max(grinder.grindDialMin, Math.min(grinder.grindDialMax, gv));
    return { dose:existingShot.doseGrams, yieldG:existingShot.yieldGrams, time:existingShot.timeSeconds,
      grindValue:gv, grindText:existingShot.grindSetting, recipeName:existingShot.recipeName, notes:existingShot.freeNotes,
      acidity:existingShot.acidity, sweetness:existingShot.sweetness, bitterness:existingShot.bitterness,
      bodyIntensity:existingShot.body, aftertaste:existingShot.aftertaste, extractionBalance:existingShot.extractionBalance,
      flavorTags:[...existingShot.flavorTags], starsByType:stars, addingFlavor:false, newFlavorText:'' };
  }
  const last = shotsForBean(bean.id)[0];
  let gv = 5;
  if(last){ const p=parseFloat(last.grindSetting); if(!isNaN(p)) gv=p; }
  if(grinder) gv = Math.max(grinder.grindDialMin, Math.min(grinder.grindDialMax, gv));
  return { dose:18, yieldG:36, time:20, grindValue:gv, grindText: last?last.grindSetting:'',
    recipeName:'', notes:'', acidity:3, sweetness:3, bitterness:3, bodyIntensity:3, aftertaste:3, extractionBalance:5,
    flavorTags:[], starsByType:{}, addingFlavor:false, newFlavorText:'' };
}
function LogShotScreen(params){
  const bean = findBean(params.beanId);
  if(!bean) return `<div class="empty-msg">Bag not found.</div>`;
  return params.step===2 ? TasteStepView(bean, params) : GrindParamsStepView(bean, params);
}
function GrindParamsStepView(bean, params){
  const draft = params.draft;
  const grinder = activeGrinder();
  const days = daysOffRoast(bean);
  const usesDial = grinder ? grinder.useDialForGrind : true;
  const gMin = grinder ? grinder.grindDialMin : GRIND_RANGE_FALLBACK.min;
  const gMax = grinder ? grinder.grindDialMax : GRIND_RANGE_FALLBACK.max;
  const gStep = grinder ? grinder.grindDialStep : GRIND_RANGE_FALLBACK.step;

  const grindField = usesDial ? renderDragField('grind', {
      kind:'ruler', label:'Grind', min:gMin, max:gMax, step:gStep, decimals:1, unit:'',
      get:()=>draft.grindValue, set:v=>{draft.grindValue=v;}
    }) : `<div class="field-block">
      <div class="dashed-field" style="margin-top:0;">
        <span class="dlabel">Grind</span>
        <input type="text" value="${escapeHtml(draft.grindText)}" placeholder="Grind setting" style="color:var(--ink);"
          oninput="A.setDraftField('grindText',this.value)">
      </div></div>`;

  const doseField = renderDragField('dose', {
    kind:'fillbar', label:'Dose', min:DOSE_RANGE.min, max:DOSE_RANGE.max, step:DOSE_RANGE.step, decimals:1, unit:'g',
    capsLabel:'basket capacity', get:()=>draft.dose, set:v=>{draft.dose=v;}
  });
  const yieldField = renderDragField('yieldg', {
    kind:'hscale', label:'Yield', min:YIELD_RANGE.min, max:YIELD_RANGE.max, step:YIELD_RANGE.step, decimals:1, unit:'g',
    get:()=>draft.yieldG, set:v=>{draft.yieldG=v;},
    ratioOf:()=> draft.dose>0 ? draft.yieldG/draft.dose : 0,
    stops:()=>[2,2.5,3].map(r=>{
      const val = draft.dose*r;
      return {pct:Math.max(0,Math.min(100,((val-YIELD_RANGE.min)/(YIELD_RANGE.max-YIELD_RANGE.min))*100)), label:'1:'+r};
    })
  });
  const timeField = renderDragField('time', {
    kind:'shotclock', label:'Time', min:TIME_RANGE.min, max:TIME_RANGE.max, step:TIME_RANGE.step, decimals:0, unit:'s',
    capsLabel:'shot clock', get:()=>draft.time, set:v=>{draft.time=v;}
  });

  const recipes = DB.recipes;
  const sorted = shotsForBean(bean.id);

  return `
    ${detailHeader('Log shot', escapeHtml(bean.name)+' · day '+days, 'A.popShotFlow()')}
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:9px;">
      <span class="section-label" style="margin:0;">Recipe</span>
      <span class="bsc" style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-dim);">drag · pull down to refine</span>
    </div>
    ${grindField}
    <div style="border-top:1px solid var(--hair);"></div>
    ${doseField}
    <div style="border-top:1px solid var(--hair);"></div>
    ${yieldField}
    <div style="border-top:1px solid var(--hair);"></div>
    ${timeField}
    <div class="dashed-field">
      <span class="dlabel">Name</span>
      <input type="text" value="${escapeHtml(draft.recipeName)}" placeholder="Recipe name (optional)" style="color:var(--ink);"
        oninput="A.setDraftField('recipeName',this.value)">
    </div>
    <div style="margin:12px 0 6px;"><span class="section-label" style="margin:0;">Machine profile</span></div>
    <div class="chip-row">
      ${recipes.map(rec=>`<button class="chip ${draft.recipeName===rec.name?'selected':''}" onclick="A.pickRecipeChip('${rec.id}')">${escapeHtml(rec.name)}</button>`).join('')}
    </div>
    <div class="screen-body"></div>
    <button class="btn-primary" onclick="A.gotoTasteStep()">Now taste it</button>
    ${sorted.length ? `<span class="section-label" style="margin-top:24px;">Shot log</span>${sorted.map(s=>HistoryShotRow(s)).join('')}` : ''}
  `;
}

function TasteStepView(bean, params){
  const draft = params.draft;
  const days = daysOffRoast(bean);
  const tastes = [
    {key:'acidity', label:'Acidity'},
    {key:'sweetness', label:'Sweetness'},
    {key:'bitterness', label:'Bitterness'},
    {key:'bodyIntensity', label:'Body'},
    {key:'aftertaste', label:'Aftertaste'}
  ];
  const flavorNames = allFlavorNames();
  const customNames = new Set(DB.customFlavorTags.map(t=>t.name));
  const ex = draft.extractionBalance;
  const exPct = Math.max(0,Math.min(100, ((ex-1)/9)*100));

  return `
    <div class="screen no-scroll" style="padding:0;flex:1;display:flex;flex-direction:column;">
    <div style="position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:10px;margin:0 -16px;padding:0 16px 9px;background:var(--ground);border-bottom:1px solid var(--hair);">
      <button class="link-back" onclick="A.backToStep1()">${chevronLeft()}</button>
      <span class="htitle bc">Taste it</span>
      <span class="hmeta">${escapeHtml(bean.name)} · day ${days}</span>
    </div>
    <div style="margin:6px 0 4px;"><span class="section-label" style="margin:0;">Tasting notes</span></div>
    <div class="taste-panel">
      ${tastes.map(t=>TasteRow(t,draft)).join('')}
      ${renderExtractionField(draft, ex, exPct)}
    </div>
    <div style="margin:6px 0 4px;"><span class="section-label" style="margin:0;">Flavour</span></div>
    <div class="bsc" style="font-size:11px;color:var(--ink-faint);margin:-2px 0 6px;">Hold a custom flavour to remove it</div>
    <div class="chip-row">
      ${flavorNames.map(name=>{
        const sel = draft.flavorTags.some(f=>f.toLowerCase()===name.toLowerCase());
        const isCustom = customNames.has(name);
        return `<button class="chip ${sel?'selected':''}" onclick="A.toggleFlavor('${escapeHtml(name).replace(/'/g,"\\'")}')" ${isCustom?`data-longpress="A.confirmRemoveFlavor('${escapeHtml(name).replace(/'/g,"\\'")}')"`:''}>${escapeHtml(name)}</button>`;
      }).join('')}
      ${draft.addingFlavor
        ? `<div class="chip-input"><input type="text" autofocus value="${escapeHtml(draft.newFlavorText)}" placeholder="New tag" oninput="A.setDraftField('newFlavorText',this.value)" onkeydown="if(event.key==='Enter')A.commitNewFlavor()"><button onclick="A.commitNewFlavor()">✓</button></div>`
        : `<button class="chip dashed" onclick="A.setDraftFlag('addingFlavor',true)">+ Add</button>`}
    </div>
    <div style="margin:6px 0 4px;"><span class="section-label" style="margin:0;">Rate the shot</span></div>
    <div class="panel">
      ${DRINK_TYPES.map(t=>DrinkRatingRow(t,draft)).join('')}
    </div>
    <div class="dashed-field" style="margin-top:7px;">
      <span class="dlabel">Note</span>
      <input type="text" value="${escapeHtml(draft.notes)}" placeholder="Anything else worth remembering" style="color:var(--ink);"
        oninput="A.setDraftField('notes',this.value)">
    </div>
    <button class="btn-primary" style="margin-top:7px;" onclick="A.saveShotAction()">${params.shotId?'Save changes':'Save shot'}</button>
    ${params.shotId ? `<button class="btn-danger-outline" onclick="A.deleteShotConfirm('${params.shotId}')">Delete shot</button>` : ''}
    </div>
  `;
}
function TasteRow(t, draft){
  const v = draft[t.key];
  let cells = '';
  for(let i=1;i<=5;i++){ cells += `<button class="taste-cell ${i<=v?'on':''}" onclick="A.setTaste('${t.key}',${i})"></button>`; }
  return `<div class="taste-row"><span class="tlabel bc">${t.label}</span><div class="taste-cells">${cells}</div></div>`;
}
function DrinkRatingRow(type, draft){
  const v = draft.starsByType[type.id] || 0;
  let pips = '';
  for(let i=1;i<=5;i++){ pips += `<button class="pip ${i<=v?'on':''}" onclick="A.setDrinkStar('${type.id}',${i})"></button>`; }
  return `<div class="drink-row">
    <div style="flex:1;min-width:0;">
      <div class="dname bc">${type.label}</div>
      <div class="dhint bsc">${type.hint}</div>
    </div>
    <div class="pip-row">${pips}</div>
  </div>`;
}
function HistoryShotRow(shot){
  const pips = DRINK_TYPES.map(t=>{
    const r = shot.ratings.find(x=>x.drinkType===t.id && x.stars>0);
    if(!r) return null;
    return `<span>${t.short} <span class="glyph">${'◆'.repeat(r.stars)}${'◇'.repeat(5-r.stars)}</span></span>`;
  }).filter(Boolean);
  return `<button class="hist-row" onclick="A.openShotFromHistory('${shot.beanId}','${shot.id}')">
    <div class="l1">
      <span class="num">${fmtNum(shot.doseGrams,1)} → ${fmtNum(shot.yieldGrams,1)}</span>
      <span class="ratio">${ratioLabel(shot)}</span>
      <span class="verdict">${extractionWording(shot.extractionBalance)}</span>
    </div>
    <div class="l2">
      <span>Grind ${escapeHtml(shot.grindSetting)} · ${shot.timeSeconds}s</span>
      <span class="when">${escapeHtml(shot.recipeName||'')} ${timestampLabel(shot.date)}</span>
    </div>
    ${pips.length ? `<div class="l3">${pips.join('')}</div>` : ''}
  </button>`;
}

/* ===================== Screen: Bean Shelf (9B) ===================== */
function BeanShelfScreen(){
  const seg = UIState.shelfSeg;
  const rows = seg==='Active' ? activeBeans() : archivedBeans();
  return `${screenHeader('Shelf', rows.length + (seg==='Active'?' active':' finished'))}
    <div class="seg-row">
      <button class="seg-btn ${seg==='Active'?'on':''}" onclick="A.setShelfSeg('Active')">Active</button>
      <button class="seg-btn ${seg==='Finished'?'on':''}" onclick="A.setShelfSeg('Finished')">Finished</button>
    </div>
    <div style="margin-top:16px;border-top:1px solid var(--hair);">
      ${rows.map(b=>ShelfRow(b, seg)).join('')}
    </div>
    <button class="btn-ghost" onclick="A.openAddBean()">+ Shelve a new bag</button>
    ${rows.length===0 ? `<div class="empty-msg">${seg==='Active'?'No bags on the shelf yet.':'Nothing finished yet.'}</div>` : ''}
  `;
}
function ShelfRow(bean, seg){
  const days = daysOffRoast(bean);
  const shots = shotsForBean(bean.id);
  const avg = avgBeanRating(bean.id);
  const t1 = seg==='Active' ? `Day ${days}` : 'Finished';
  const t2 = `${shots.length} shot${shots.length===1?'':'s'}`;
  const t3 = avg!==null ? `${avg.toFixed(1)} avg` : '';
  return `<button class="shelf-row" style="width:100%;" onclick="A.openBagDetail('${bean.id}')">
    ${photoThumb(bean.photoData, 34, 44)}
    <div style="flex:1;min-width:0;">
      <div class="name">${escapeHtml(bean.name)}</div>
      <div class="sub">${escapeHtml(bean.roaster)}${bean.origin?` · ${escapeHtml(bean.origin)}`:''}</div>
      <div class="tags"><span>${t1}</span><span>${t2}</span>${t3?`<span class="acc">${t3}</span>`:''}</div>
    </div>
    <span class="chev">›</span>
  </button>`;
}

/* ===================== Screen: Bag Detail (9C) ===================== */
function BagDetailScreen(params){
  const bean = findBean(params.beanId);
  if(!bean) return `<div class="empty-msg">Bag not found.</div>`;
  const days = daysOffRoast(bean);
  const shots = shotsForBean(bean.id);
  const best = bestShot(bean.id);
  const avg = avgBeanRating(bean.id);
  const gramsUsed = shots.reduce((sum,s)=>sum+(s.doseGrams||0),0);
  const gramsLeft = bean.bagSizeGrams ? Math.max(0, Math.round((bean.bagSizeGrams - gramsUsed)*10)/10) : null;
  return `
    ${detailHeader(bean.name, escapeHtml(bean.roaster)+' · day '+days)}
    <div style="display:flex;gap:12px;margin-top:14px;align-items:flex-start;">
      <div>
        ${photoThumb(bean.photoData, 64, 84, `A.pickPhotoForBean('${bean.id}')`)}
        <button class="bsc" style="color:var(--accent);font-size:9.5px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;margin-top:5px;display:block;width:64px;text-align:center;" onclick="A.takePhotoForBean('${bean.id}')">${bean.photoData?'Retake':'Camera'}</button>
      </div>
      <div style="flex:1;">
        <div class="bsc" style="font-weight:600;font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--ink-dim);">${[bean.origin,bean.roastLevel,bean.process].filter(Boolean).join(' · ')}</div>
        <div style="font-size:13.5px;color:var(--ink-dim);margin-top:4px;line-height:1.45;">Roasted ${fmtRoastDate(bean.roastDate)}.${bean.notes?' '+escapeHtml(bean.notes):''}${bean.price?` · ${escapeHtml(bean.price)}`:''}</div>
      </div>
    </div>
    <div class="finish-plate">
      <div class="plate-cell"><div class="pl">Shots</div><div class="pv">${shots.length}</div></div>
      <div class="plate-cell"><div class="pl">Avg rating</div><div class="pv">${avg!==null?avg.toFixed(1):'—'}</div></div>
      ${gramsLeft!==null ? `<div class="plate-cell"><div class="pl">Grams left</div><div class="pv">${gramsLeft}g</div></div>` : ''}
    </div>
    ${BeanRatingRow(bean)}
    ${best ? `<div style="border:1px solid var(--accent);padding:12px;margin-top:4px;">
        <div class="section-label" style="margin:0 0 6px;">Best shot so far</div>
        <div style="display:flex;align-items:baseline;gap:8px;">
          <span class="bc" style="font-weight:700;font-size:26px;">${fmtNum(best.doseGrams,1)} → ${fmtNum(best.yieldGrams,1)}</span>
          <span class="bc" style="font-weight:600;font-size:20px;color:var(--accent);">${ratioLabel(best)}</span>
        </div>
        <div style="margin-top:5px;" class="bsc">Grind ${escapeHtml(best.grindSetting)} · ${best.timeSeconds}s${best.recipeName?` · ${escapeHtml(best.recipeName)}`:''}</div>
      </div>` : ''}
    <span class="section-label">Notes</span>
    <textarea data-autosize rows="1" class="dashed-note" placeholder="Tasting notes, observations…"
      oninput="A.setBeanNotes('${bean.id}',this.value)">${escapeHtml(bean.notes)}</textarea>
    ${shots.length ? `<span class="section-label">Shot log</span><div style="border-top:1px solid var(--hair);">${shots.slice(0,6).map(s=>HistoryShotRow(s)).join('')}</div>
      ${shots.length>6?`<button class="btn-ghost" onclick="A.openShotHistoryForBean('${bean.id}')">All ${shots.length} shots</button>`:''}` : ''}
    <button class="btn-primary" onclick="A.openLogShot('${bean.id}')">Log a shot</button>
    ${!bean.isArchived
      ? `<button class="btn-danger-outline" onclick="A.openFinishBean('${bean.id}')">Finish this bag</button>`
      : `<button class="btn-ghost" style="text-align:center;" onclick="A.unarchiveBean('${bean.id}')">Move back to shelf</button>`}
    <button class="btn-ghost" style="text-align:center;color:var(--ink-dim);" onclick="A.openEditBean('${bean.id}')">Edit bag details</button>
    <button class="btn-danger-outline" onclick="A.deleteBeanConfirm('${bean.id}')">Delete bag</button>
  `;
}
function BeanRatingRow(bean){
  const v = bean.rating || 0;
  let diamonds = '';
  for(let i=1;i<=5;i++){ diamonds += `<button class="pip ${i<=v?'on':''}" onclick="A.setBeanRating('${bean.id}',${i})"></button>`; }
  return `<div style="margin:16px 0;"><span class="section-label" style="margin:0 0 8px;">Rating</span><div class="pip-row">${diamonds}</div></div>`;
}

/* ===================== Modal: Finish Bag (9R) ===================== */
function FinishBeanModal(params){
  const bean = findBean(params.beanId);
  const d = params.draft;
  const shots = shotsForBean(bean.id);
  const best = bestShot(bean.id);
  const avg = avgBeanRating(bean.id);
  return `<div class="sheet-nav">
      <span onclick="A.closeModal()" style="color:var(--ink-dim);cursor:pointer;">Cancel</span>
      <span class="title">Finish bag</span>
      <span onclick="A.confirmFinishBean()" style="color:var(--accent);cursor:pointer;">Done</span>
    </div>
    <div class="bc" style="margin-top:18px;font-size:30px;font-weight:700;text-transform:uppercase;line-height:1.05;">${escapeHtml(bean.name)} is finished</div>
    <div style="margin-top:8px;font-size:15px;color:var(--ink-dim);line-height:1.5;">${shots.length} shot${shots.length===1?'':'s'} over ${daysOffRoast(bean)} days. It moves to the finished shelf and stays searchable.</div>
    <div class="finish-plate">
      <div class="plate-cell"><div class="pl">Shots</div><div class="pv">${shots.length}</div></div>
      <div class="plate-cell"><div class="pl">Best</div><div class="pv">${best?ratioLabel(best):'—'}</div></div>
      <div class="plate-cell fill"><div class="pl">Avg</div><div class="pv">${avg!==null?avg.toFixed(1):'—'}</div></div>
    </div>
    <span class="section-label">Rating</span>
    <div class="pip-row" style="margin-bottom:24px;">
      ${[1,2,3,4,5].map(i=>`<button class="pip" style="width:30px;height:30px;font-size:20px;${i<=d.rating?'background:var(--accent);border-color:var(--accent);':''}" onclick="A.setFinishDraftRating(${i})"></button>`).join('')}
    </div>
    <span class="section-label">Notes</span>
    <textarea data-autosize rows="3" class="dashed-note" placeholder="How did the bag turn out overall?"
      oninput="A.setDraftField('notes',this.value)">${escapeHtml(d.notes)}</textarea>
    <button class="btn-primary" onclick="A.confirmFinishBean()">Move to finished shelf</button>`;
}

/* ===================== Modal: Add / Edit Bean (9L) ===================== */
function emptyBeanDraft(){ return { name:'', roaster:'', origin:'', process:'', roastLevel:'', roastDate: todayISO(), notes:'', photoData:null, price:'', bagSizeGrams:250, addingProcess:false, newProcessText:'' }; }
function beanDraftFrom(bean){ return { name:bean.name, roaster:bean.roaster, origin:bean.origin, process:bean.process, roastLevel:bean.roastLevel||'', roastDate:bean.roastDate, notes:bean.notes, photoData:bean.photoData, price:bean.price||'', bagSizeGrams:bean.bagSizeGrams||250, addingProcess:false, newProcessText:'' }; }
function AddEditBeanModal(params){
  const d = params.draft;
  const isEdit = !!params.beanId;
  regValidate('btn-save-bean', ()=> d.name.trim().length>0);
  const processNames = allProcessNames();
  const customProcessSet = new Set(DB.customProcessTags.map(t=>t.name.toLowerCase()));
  return sheetNav(isEdit?'Edit bag':'Add bag','Save','btn-save-bean',!!d.name.trim(),'A.saveBean()') + `
    <div class="finish-plate" style="margin-top:16px;">
      <div class="plate-cell" style="border-right:none;flex:none;width:100%;">
        <div class="pl">Bag name</div>
        <input type="text" value="${escapeHtml(d.name)}" placeholder="Untitled bag" style="font-family:'Barlow Condensed',sans-serif;font-size:26px;font-weight:700;color:var(--ink);width:100%;"
          oninput="A.setDraftField('name',this.value)">
      </div>
    </div>
    <div class="plate-grid-row" style="border:1px solid var(--hair);border-top:none;">
      <div class="field-plate"><div class="fl">Roaster</div><input type="text" value="${escapeHtml(d.roaster)}" placeholder="Roaster" oninput="A.setDraftField('roaster',this.value)"></div>
      <div class="field-plate"><div class="fl">Origin</div><input type="text" value="${escapeHtml(d.origin)}" placeholder="—" oninput="A.setDraftField('origin',this.value)"></div>
    </div>
    <div style="display:flex;gap:10px;margin-top:10px;">
      <div class="field-plate" style="flex:1;border:1px solid var(--hair);"><div class="fl">Roast date</div>
        <input type="date" value="${d.roastDate}" style="font-family:'Barlow Condensed',sans-serif;font-size:21px;font-weight:600;color:var(--accent);" oninput="A.setDraftField('roastDate',this.value)"></div>
      <div style="width:86px;flex:none;border:1px dashed var(--hair-strong);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;overflow:hidden;cursor:pointer;" onclick="A.pickPhoto()">
        ${d.photoData?`<img src="${d.photoData}" style="width:100%;height:100%;object-fit:cover;">`:`<span class="bsc" style="font-size:10px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--ink-faint);">Photo</span>`}
      </div>
    </div>
    <button class="bsc" style="color:var(--accent);font-size:12px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;margin-top:8px;display:block;" onclick="A.takePhoto()">Take photo of bag</button>
    <span class="section-label">Process</span>
    <div class="bsc" style="font-size:11px;color:var(--ink-faint);margin:-4px 0 6px;">Hold a custom process to remove it</div>
    <div class="chip-row">
      ${processNames.map(p=>{
        const isCustom = customProcessSet.has(p.toLowerCase());
        return `<button class="chip ${d.process===p?'selected':''}" onclick="A.setDraftFlag('process','${escapeHtml(p).replace(/'/g,"\\'")}')" ${isCustom?`data-longpress="A.confirmRemoveProcess('${escapeHtml(p).replace(/'/g,"\\'")}')"`:''}>${escapeHtml(p)}</button>`;
      }).join('')}
      ${d.process && !processNames.some(p=>p.toLowerCase()===d.process.toLowerCase()) ? `<button class="chip selected">${escapeHtml(d.process)}</button>` : ''}
      ${d.addingProcess
        ? `<div class="chip-input"><input type="text" autofocus value="${escapeHtml(d.newProcessText)}" placeholder="New process" oninput="A.setDraftField('newProcessText',this.value)" onkeydown="if(event.key==='Enter')A.commitNewProcess()"><button onclick="A.commitNewProcess()">✓</button></div>`
        : `<button class="chip dashed" onclick="A.setDraftFlag('addingProcess',true)">+ New process</button>`}
    </div>
    <span class="section-label">Roast level</span>
    <div class="chip-row">
      ${ROAST_LEVELS.map(r=>`<button class="chip ${d.roastLevel===r?'selected':''}" onclick="A.setDraftFlag('roastLevel','${r}')">${r}</button>`).join('')}
    </div>
    <div class="plate-grid-row" style="border:1px solid var(--hair);margin-top:10px;">
      <div class="field-plate"><div class="fl">Bag size (g)</div><input type="number" inputmode="numeric" value="${d.bagSizeGrams}" placeholder="250" style="font-family:'Barlow Condensed',sans-serif;font-size:21px;font-weight:600;color:var(--ink);" oninput="A.setDraftField('bagSizeGrams',this.value===''?'':parseFloat(this.value)||0)"></div>
    </div>
    <div class="dashed-field">
      <span class="dlabel">Price</span>
      <input type="text" value="${escapeHtml(d.price)}" placeholder="$18.00" style="color:var(--ink);" oninput="A.setDraftField('price',this.value)">
    </div>
    <span class="section-label">Bag notes</span>
    <textarea data-autosize rows="1" class="dashed-note" placeholder="Tasting notes on the bag…" oninput="A.setDraftField('notes',this.value)">${escapeHtml(d.notes)}</textarea>
    ${isEdit ? `<button class="btn-danger-outline" onclick="A.archiveBeanFromEdit()">Archive bean</button>` : ''}
  `;
}

/* ===================== Screen: Shot History (9D) ===================== */
function ShotHistoryScreen(params){
  const bean = params.beanId ? findBean(params.beanId) : null;
  const KEY = {espresso:'espresso', cortado:'cortado', cappuccino:'cappuccino'};
  let shots = bean ? shotsForBean(bean.id) : [...DB.shots].sort((a,b)=>new Date(b.date)-new Date(a.date));
  if(UIState.historyFilter!=='All'){
    shots = shots.filter(s=>s.ratings.some(r=>r.drinkType===UIState.historyFilter && r.stars>0));
  }
  if(UIState.historySort==='Rating'){
    shots = [...shots].sort((a,b)=>{
      const ta = a.ratings.reduce((m,r)=>Math.max(m,r.stars),0), tb = b.ratings.reduce((m,r)=>Math.max(m,r.stars),0);
      if(tb!==ta) return tb-ta;
      return new Date(b.date)-new Date(a.date);
    });
  } else if(UIState.historySort==='Ratio'){
    shots = [...shots].sort((a,b)=>ratio(a)-ratio(b));
  }
  const sortOpts = ['Recent','Rating','Ratio'];
  const filterOpts = [{id:'All',label:'All'},{id:'espresso',label:'Espresso'},{id:'cortado',label:'Cortado'},{id:'cappuccino',label:'Cappuccino'}];
  // historyPageSize is measured against the actual device screen (see adjustHistoryPageSize
  // in wireAll) so the list always fills exactly one screen's worth of rows and never needs
  // its own scrollbar — Previous/Next below just move between screens of results instead.
  const pageSize = UIState.historyPageSize || 8;
  const totalPages = Math.max(1, Math.ceil(shots.length / pageSize));
  if(UIState.historyPage > totalPages) UIState.historyPage = totalPages;
  if(UIState.historyPage < 1) UIState.historyPage = 1;
  const page = UIState.historyPage;
  const pageShots = shots.slice((page-1)*pageSize, page*pageSize);
  return `
    ${bean?detailHeader(bean.name,'','A.pop()'):screenHeader('History', shots.length+' shot'+(shots.length===1?'':'s'))}
    ${!bean ? `<div style="display:flex;justify-content:flex-end;margin-top:8px;">
      <button class="bsc" style="color:var(--accent);font-weight:600;font-size:11.5px;letter-spacing:.1em;text-transform:uppercase;" onclick="A.switchTab(0)">‹ Back to Dial in</button>
    </div>` : ''}
    <div class="pill-row" style="margin-top:12px;">
      <span class="plabel">Sort</span>
      ${sortOpts.map(s=>`<button class="pill ${UIState.historySort===s?'on':''}" onclick="A.setHistorySort('${s}')">${s}</button>`).join('')}
    </div>
    <div class="pill-row" style="margin-top:7px;">
      <span class="plabel">Drink</span>
      <div class="pill-scroll">
        ${filterOpts.map(f=>`<button class="pill scroll ${UIState.historyFilter===f.id?'on':''}" onclick="A.setHistoryFilter('${f.id}')">${f.label}</button>`).join('')}
      </div>
    </div>
    <div class="history-list-viewport" id="history-list-viewport" style="margin-top:14px;border-top:1px solid var(--hair);">
      ${shots.length===0 ? `<div class="empty-msg">No shots match. Pull one from the Dial tab.</div>` : pageShots.map(s=>HistoryShotRow(s)).join('')}
    </div>
    ${totalPages>1 ? `<div class="pager-bottom">
      <button class="btn-ghost pager-nav" ${page<=1?'disabled':''} onclick="A.setHistoryPage(${page-1})">‹ Previous</button>
      <span class="pager-count">${page} / ${totalPages}</span>
      <button class="btn-ghost pager-nav" ${page>=totalPages?'disabled':''} onclick="A.setHistoryPage(${page+1})">Next ›</button>
    </div>` : ''}
  `;
}

/* ===================== Screen: Recipes (9F / 9G / 9M) ===================== */
function RecipesListScreen(){
  const recipes = [...DB.recipes].sort((a,b)=>b.createdAt-a.createdAt);
  const machine = DB.machines[0];
  return `${screenHeader('Recipes', machine?machine.name:'')}
    <div style="margin-top:14px;">
      ${recipes.map(r=>`<button style="display:block;width:100%;text-align:left;padding:11px;border:1px solid var(--hair);margin-bottom:9px;background:none;" onclick="A.openEditRecipe('${r.id}')">
          <div style="display:flex;align-items:baseline;gap:8px;">
            <span class="bc" style="font-size:21px;font-weight:600;text-transform:uppercase;line-height:1;">${escapeHtml(r.name)}</span>
          </div>
          ${r.notes?`<div style="margin-top:7px;font-size:13px;color:var(--ink-dim);">${escapeHtml(r.notes)}</div>`:''}
        </button>`).join('')}
    </div>
    <button class="btn-ghost" onclick="A.openAddRecipe()">+ New recipe</button>
    ${recipes.length===0?'<div class="empty-msg">No saved recipes yet.</div>':''}
  `;
}
function EditRecipeScreen(params){
  const r = findRecipe(params.recipeId);
  if(!r) return `<div class="empty-msg">Recipe not found.</div>`;
  const pressure = r.pressure!=null ? r.pressure : 9;
  const temperature = r.temperature!=null ? r.temperature : 93;
  const preInfusion = r.preInfusion!=null ? r.preInfusion : 6;
  const basket = r.basket!=null ? r.basket : 18;
  return `
    ${detailHeader('Edit recipe','')}
    <span class="section-label">Name</span>
    <textarea data-autosize rows="1" style="font-family:'Barlow Condensed',sans-serif;font-size:24px;font-weight:600;border-bottom:1px solid var(--hair);padding-bottom:9px;"
      oninput="A.setRecipeField('${r.id}','name',this.value)">${escapeHtml(r.name)}</textarea>
    <span class="section-label">Notes</span>
    <textarea data-autosize rows="1" class="dashed-note" placeholder="When to reach for this profile"
      oninput="A.setRecipeField('${r.id}','notes',this.value)">${escapeHtml(r.notes)}</textarea>
    <span class="section-label">Machine profile</span>
    <div class="row-list">
      ${stepperRow('Pressure (bar)', fmtNum(pressure), `A.bumpRecipeNum('${r.id}','pressure',-0.5,1,15)`, `A.bumpRecipeNum('${r.id}','pressure',0.5,1,15)`)}
      ${stepperRow('Temperature (°C)', fmtNum(temperature), `A.bumpRecipeNum('${r.id}','temperature',-1,80,100)`, `A.bumpRecipeNum('${r.id}','temperature',1,80,100)`)}
      ${stepperRow('Pre-infusion (s)', fmtNum(preInfusion), `A.bumpRecipeNum('${r.id}','preInfusion',-1,0,20)`, `A.bumpRecipeNum('${r.id}','preInfusion',1,0,20)`)}
      ${stepperRow('Basket (g)', fmtNum(basket), `A.bumpRecipeNum('${r.id}','basket',-1,7,30)`, `A.bumpRecipeNum('${r.id}','basket',1,7,30)`)}
    </div>
    <button class="btn-primary" onclick="A.doneEditRecipe()">Save recipe</button>
    <button class="btn-danger-outline" onclick="A.deleteRecipeConfirm('${r.id}')">Delete recipe</button>
  `;
}
function AddRecipeModal(params){
  const d = params.draft;
  regValidate('btn-add-recipe', ()=> d.name.trim().length>0);
  return sheetNav('New recipe','Save','btn-add-recipe',!!d.name.trim(),'A.saveNewRecipe()','Name it to save') + `
    <span class="section-label">Name</span>
    <textarea data-autosize rows="1" placeholder="Recipe name" style="font-family:'Barlow Condensed',sans-serif;font-size:24px;font-weight:600;border-bottom:1px solid var(--hair);padding-bottom:9px;"
      oninput="A.setDraftField('name',this.value)">${escapeHtml(d.name)}</textarea>
    <span class="section-label">Notes</span>
    <textarea data-autosize rows="1" class="dashed-note" placeholder="When to reach for this profile, what it does to the cup"
      oninput="A.setDraftField('notes',this.value)">${escapeHtml(d.notes)}</textarea>
    <span class="section-label">Machine profile</span>
    <div class="row-list">
      ${stepperRow('Pressure (bar)', fmtNum(d.pressure), "A.bumpDraftNum('pressure',-0.5,1,15)", "A.bumpDraftNum('pressure',0.5,1,15)")}
      ${stepperRow('Temperature (°C)', fmtNum(d.temperature), "A.bumpDraftNum('temperature',-1,80,100)", "A.bumpDraftNum('temperature',1,80,100)")}
      ${stepperRow('Pre-infusion (s)', fmtNum(d.preInfusion), "A.bumpDraftNum('preInfusion',-1,0,20)", "A.bumpDraftNum('preInfusion',1,0,20)")}
      ${stepperRow('Basket (g)', fmtNum(d.basket), "A.bumpDraftNum('basket',-1,7,30)", "A.bumpDraftNum('basket',1,7,30)")}
    </div>`;
}

/* ===================== Screen: Settings (9H / 9I / 9J / 9N / 9P / 9Q) ===================== */
function SettingsScreen(){
  const grinders = [...DB.grinders].sort((a,b)=>a.createdAt-b.createdAt);
  const machines = [...DB.machines].sort((a,b)=>a.createdAt-b.createdAt);
  return `${screenHeader('Setup', APP_VERSION)}
    <span class="section-label">Equipment</span>
    <div class="row-list">
      ${grinders.map(g=>`<button class="settings-row" onclick="A.openGrinderDetail('${g.id}')">
          <div style="flex:1;"><div class="stitle">${escapeHtml(g.name)}</div><div class="ssub">${escapeHtml(g.brand||'')}${g.brand?' · ':''}dial ${g.grindDialMin.toFixed(0)}–${g.grindDialMax.toFixed(0)}${g.isActive?' · active':''}</div></div>
          <span class="schev">›</span></button>`).join('')}
      ${machines.map(m=>`<button class="settings-row" onclick="A.openMachineDetail('${m.id}')">
          <div style="flex:1;"><div class="stitle">${escapeHtml(m.name)}</div><div class="ssub">${escapeHtml(m.brand||'')}</div></div>
          <span class="schev">›</span></button>`).join('')}
    </div>
    <div style="display:flex;gap:10px;margin-top:8px;">
      <button class="btn-ghost" style="flex:1;" onclick="A.openAddGrinder()">+ Add grinder</button>
      <button class="btn-ghost" style="flex:1;" onclick="A.openAddMachine()">+ Add machine</button>
    </div>
    <span class="section-label">Data</span>
    <div class="row-list">
      <button class="settings-row" onclick="A.exportBackup()"><div class="stitle" style="flex:1;">Export backup</div></button>
      <button class="settings-row" onclick="A.startImport()"><div class="stitle" style="flex:1;">Import backup</div></button>
      <button class="settings-row" onclick="A.eraseAllConfirm()"><div class="stitle danger" style="flex:1;">Erase all data</div></button>
    </div>
    <div style="padding:16px 0 0;font-size:12.5px;color:var(--ink-faint);line-height:1.5;">Everything lives on this device. Export before clearing browser data.</div>
  `;
}
function GrinderDetailScreen(params){
  const g = findGrinder(params.grinderId);
  if(!g) return `<div class="empty-msg">Grinder not found.</div>`;
  const burrOpts = ['Conical','Flat'];
  const burr = g.burr || 'Conical';
  return `
    ${detailHeader(g.name, g.isActive?'Active':'', 'A.pop()', `A.saveGrinderAndBack('${g.id}')`)}
    <span class="section-label">Identity</span>
    <div class="row-list">
      <div class="row-item"><span class="rlabel">Name</span><input type="text" value="${escapeHtml(g.name)}" style="text-align:right;color:var(--accent);" oninput="A.setGrinderField('${g.id}','name',this.value)"></div>
      <div class="row-item"><span class="rlabel">Brand</span><input type="text" value="${escapeHtml(g.brand)}" style="text-align:right;color:var(--accent);" oninput="A.setGrinderField('${g.id}','brand',this.value)"></div>
    </div>
    <span class="section-label">Burr</span>
    <div class="chip-row">
      ${burrOpts.map(b=>`<button class="chip ${burr===b?'selected':''}" onclick="A.setGrinderChip('${g.id}','burr','${b}')">${b}</button>`).join('')}
    </div>
    <span class="section-label">Dial range</span>
    <div class="row-list">
      ${stepperRow('Min', fmtNum(g.grindDialMin,1), `A.bumpGrinderRange('${g.id}','min',-0.5)`, `A.bumpGrinderRange('${g.id}','min',0.5)`)}
      ${stepperRow('Max', fmtNum(g.grindDialMax,1), `A.bumpGrinderRange('${g.id}','max',-0.5)`, `A.bumpGrinderRange('${g.id}','max',0.5)`)}
      ${stepperRow('Step', fmtNum(g.grindDialStep,1), `A.bumpGrinderRange('${g.id}','step',-0.1)`, `A.bumpGrinderRange('${g.id}','step',0.1)`)}
      <div class="row-item"><div style="flex:1;"><span class="rlabel" style="display:block;">Numbered dial</span><span class="ssub">Off gives a free-text grind field</span></div>
        <button class="toggle ${g.useDialForGrind?'on':''}" onclick="A.toggleGrinderDial('${g.id}')"><span class="knob"></span></button></div>
    </div>
    ${g.isActive
      ? `<div style="color:var(--accent);font-size:15px;margin:16px 0;">This is your active grinder.</div>`
      : `<button class="btn-primary" onclick="A.setActiveGrinder('${g.id}')">Make active</button>`}
    <button class="btn-danger-outline" onclick="A.deleteGrinderConfirm('${g.id}')">Delete grinder</button>
  `;
}
function MachineDetailScreen(params){
  const m = findMachine(params.machineId);
  if(!m) return `<div class="empty-msg">Machine not found.</div>`;
  const typeOpts = ['Pump','Lever','Air'];
  const type = m.type || 'Pump';
  const pressure = m.defaultPressure!=null ? m.defaultPressure : 9;
  const temperature = m.defaultTemperature!=null ? m.defaultTemperature : 93;
  const basket = m.basket!=null ? m.basket : 18;
  const recipeIds = m.recipeIds || [];
  const recipes = [...DB.recipes].sort((a,b)=>b.createdAt-a.createdAt);
  return `
    ${detailHeader(m.name, m.isActive?'Active':'', 'A.pop()', `A.saveMachineAndBack('${m.id}')`)}
    <span class="section-label">Identity</span>
    <div class="row-list">
      <div class="row-item"><span class="rlabel">Name</span><input type="text" value="${escapeHtml(m.name)}" style="text-align:right;color:var(--accent);" oninput="A.setMachineField('${m.id}','name',this.value)"></div>
      <div class="row-item"><span class="rlabel">Brand</span><input type="text" value="${escapeHtml(m.brand)}" style="text-align:right;color:var(--accent);" oninput="A.setMachineField('${m.id}','brand',this.value)"></div>
      <div class="row-item"><div style="flex:1;"><span class="rlabel" style="display:block;">Pressure gauge</span></div>
        <button class="toggle ${m.hasPressureGauge?'on':''}" onclick="A.toggleMachineGauge('${m.id}')"><span class="knob"></span></button></div>
    </div>
    <span class="section-label">Type</span>
    <div class="chip-row">
      ${typeOpts.map(t=>`<button class="chip ${type===t?'selected':''}" onclick="A.setMachineChip('${m.id}','type','${t}')">${t}</button>`).join('')}
    </div>
    <span class="section-label">Defaults</span>
    <div class="row-list">
      ${stepperRow('Pressure (bar)', fmtNum(pressure), `A.bumpMachineNum('${m.id}','defaultPressure',-0.5,1,15)`, `A.bumpMachineNum('${m.id}','defaultPressure',0.5,1,15)`)}
      ${stepperRow('Temperature (°C)', fmtNum(temperature), `A.bumpMachineNum('${m.id}','defaultTemperature',-1,80,100)`, `A.bumpMachineNum('${m.id}','defaultTemperature',1,80,100)`)}
      ${stepperRow('Basket (g)', fmtNum(basket), `A.bumpMachineNum('${m.id}','basket',-1,7,30)`, `A.bumpMachineNum('${m.id}','basket',1,7,30)`)}
    </div>
    <span class="section-label">Recipes on this machine</span>
    <div class="chip-row">
      ${recipes.map(r=>`<button class="chip ${recipeIds.includes(r.id)?'selected':''}" onclick="A.toggleMachineRecipe('${m.id}','${r.id}')">${escapeHtml(r.name)}</button>`).join('')}
      <button class="chip dashed" onclick="A.openAddRecipeForMachine('${m.id}')">+ Add recipe</button>
    </div>
    <button class="btn-danger-outline" style="margin-top:16px;" onclick="A.deleteMachineConfirm('${m.id}')">Delete machine</button>
  `;
}
function AddMachineModal(params){
  const d = params.draft;
  regValidate('btn-add-machine', ()=> d.name.trim().length>0);
  const typeOpts = ['Pump','Lever','Air'];
  return sheetNav('Add machine','Save','btn-add-machine',!!d.name.trim(),'A.saveNewMachine()') + `
    <span class="section-label">Machine</span>
    <textarea data-autosize rows="1" placeholder="Machine name" style="font-family:'Barlow Condensed',sans-serif;font-size:24px;font-weight:600;border-bottom:1px solid var(--hair);padding-bottom:9px;"
      oninput="A.setDraftField('name',this.value)">${escapeHtml(d.name)}</textarea>
    <span class="section-label">Brand</span>
    <textarea data-autosize rows="1" placeholder="optional" style="font-family:'Barlow Condensed',sans-serif;font-size:24px;font-weight:600;border-bottom:1px solid var(--hair);padding-bottom:9px;"
      oninput="A.setDraftField('brand',this.value)">${escapeHtml(d.brand)}</textarea>
    <span class="section-label">Type</span>
    <div class="chip-row">
      ${typeOpts.map(t=>`<button class="chip ${(d.type||'Pump')===t?'selected':''}" onclick="A.setDraftFlag('type','${t}')">${t}</button>`).join('')}
    </div>`;
}
function AddGrinderModal(params){
  const d = params.draft;
  regValidate('btn-add-grinder', ()=> d.name.trim().length>0);
  const burrOpts = ['Conical','Flat'];
  return sheetNav('Add grinder','Save','btn-add-grinder',!!d.name.trim(),'A.saveNewGrinder()') + `
    <span class="section-label">Grinder</span>
    <textarea data-autosize rows="1" placeholder="Grinder name" style="font-family:'Barlow Condensed',sans-serif;font-size:24px;font-weight:600;border-bottom:1px solid var(--hair);padding-bottom:9px;"
      oninput="A.setDraftField('name',this.value)">${escapeHtml(d.name)}</textarea>
    <span class="section-label">Brand</span>
    <textarea data-autosize rows="1" placeholder="optional" style="font-family:'Barlow Condensed',sans-serif;font-size:24px;font-weight:600;border-bottom:1px solid var(--hair);padding-bottom:9px;"
      oninput="A.setDraftField('brand',this.value)">${escapeHtml(d.brand)}</textarea>
    <span class="section-label">Burr</span>
    <div class="chip-row">
      ${burrOpts.map(b=>`<button class="chip ${(d.burr||'Conical')===b?'selected':''}" onclick="A.setDraftFlag('burr','${b}')">${b}</button>`).join('')}
    </div>`;
}

/* ===================== Actions dispatcher ===================== */
const A = {
  switchTab(i){ Nav.tab=i; Nav.stacks[i]=[]; render(); },
  pop(){ popStack(); },
  closeModal(){ closeModal(); },
  confirmYes(){ const cb = Nav.confirm && Nav.confirm.onConfirm; Nav.confirm=null; if(cb) cb(); else render(); },
  confirmNo(){ Nav.confirm=null; render(); },

  openOnboardingSetup(){ openModal('grinder-setup', {draft:{machineName:'',machineBrand:'',hasGauge:false,grinderName:'',grinderBrand:'',grindMinText:'0',grindMaxText:'10',grindStepText:'0.1'}}); },
  autofillOnboarding(){ const d=activeParams().draft; Object.assign(d,{machineName:'Kitchen Machine',machineBrand:'Breville Barista Pro',hasGauge:true,grinderName:'Everyday Grinder',grinderBrand:'Niche Zero',grindMinText:'0',grindMaxText:'10',grindStepText:'0.1'}); render(); },
  bumpOnboardDial(field, delta){
    const d = activeParams().draft;
    let v = parseFloat(d[field]); if(isNaN(v)) v=0;
    v = Math.round((v+delta)*10)/10;
    d[field] = String(v); render();
  },
  saveOnboarding(){
    const d = activeParams().draft;
    if(!d.machineName.trim() || !d.grinderName.trim()) return;
    const machine = {id:uid(), name:d.machineName.trim(), brand:d.machineBrand.trim(), hasPressureGauge:!!d.hasGauge, createdAt:Date.now()};
    let min=parseFloat(d.grindMinText), max=parseFloat(d.grindMaxText), step=parseFloat(d.grindStepText);
    if(isNaN(min)||isNaN(max)||min>=max){ min=0; max=10; }
    if(isNaN(step)||step<=0) step=0.1;
    const grinder = {id:uid(), name:d.grinderName.trim(), brand:d.grinderBrand.trim(), scaleDescription:'Stepped',
      useDialForGrind:true, grindDialMin:min, grindDialMax:max, grindDialStep:step, isActive:true, createdAt:Date.now()};
    DB.machines.push(machine); DB.grinders.push(grinder); save();
    Nav.modal = null; render();
  },

  setDraftField(key,val){ const p=activeParams(); if(p && p.draft) p.draft[key]=val; revalidateAll(); },
  setDraftFlag(key,val){ const p=activeParams(); if(p && p.draft){ p.draft[key]=val; render(); } },

  openAddBean(){ openModal('add-edit-bean', {beanId:null, draft: emptyBeanDraft()}); },
  openEditBean(beanId){ openModal('add-edit-bean', {beanId, draft: beanDraftFrom(findBean(beanId))}); },
  openBagDetail(beanId){ pushStack('bag-detail', {beanId}); },
  pickPhoto(){ requestPhoto(false, durl=>{ const p=activeParams(); p.draft.photoData=durl; render(); }); },
  takePhoto(){ requestPhoto(true, durl=>{ const p=activeParams(); p.draft.photoData=durl; render(); }); },
  clearDraftPhoto(){ const p=activeParams(); p.draft.photoData=null; render(); },
  pickPhotoForBean(beanId){ requestPhoto(false, durl=>{ const b=findBean(beanId); b.photoData=durl; save(); render(); }); },
  takePhotoForBean(beanId){ requestPhoto(true, durl=>{ const b=findBean(beanId); b.photoData=durl; save(); render(); }); },
  saveBean(){
    const p = activeParams(); const d = p.draft;
    if(!d.name.trim()) return;
    if(p.beanId){
      const b = findBean(p.beanId);
      Object.assign(b, {name:d.name.trim(), roaster:d.roaster.trim(), origin:d.origin.trim(), process:d.process.trim(),
        roastLevel:d.roastLevel||'', roastDate:d.roastDate, notes:d.notes, photoData:d.photoData, price:(d.price||'').trim(), bagSizeGrams:d.bagSizeGrams||0});
    } else {
      DB.beans.push({id:uid(), name:d.name.trim(), roaster:d.roaster.trim(), origin:d.origin.trim(), process:d.process.trim(),
        roastLevel:d.roastLevel||'', roastDate:d.roastDate, notes:d.notes, isArchived:false, createdAt:Date.now(), photoData:d.photoData, price:(d.price||'').trim(), bagSizeGrams:d.bagSizeGrams||0});
    }
    save(); Nav.modal=null; render();
  },
  archiveBeanFromEdit(){ const p=activeParams(); if(p.beanId){ findBean(p.beanId).isArchived=true; save(); } Nav.modal=null; render(); },
  setBeanNotes(beanId,val){ const b=findBean(beanId); if(b){ b.notes=val; save(); } },
  openShotHistoryForBean(beanId){ pushStack('shot-history', {beanId}); },
  openFinishBean(beanId){ const b=findBean(beanId); openModal('finish-bean', {beanId, draft:{notes:b.notes, rating:b.rating||0}}); },
  setFinishDraftRating(val){ const d=activeParams().draft; d.rating = (d.rating===val)?0:val; render(); },
  confirmFinishBean(){
    const p = activeParams(); const b = findBean(p.beanId);
    b.notes = p.draft.notes; b.rating = p.draft.rating; b.isArchived = true;
    save(); Nav.modal = null; popStack();
  },
  setBeanRating(beanId,val){ const b=findBean(beanId); const cur=b.rating||0; b.rating=(cur===val)?0:val; save(); render(); },
  unarchiveBean(beanId){ findBean(beanId).isArchived=false; save(); render(); },
  deleteBeanConfirm(beanId){ confirmDialog('Delete this bag?','This permanently removes the bag and all its logged shots.','Delete',true, ()=>{
    DB.shots = DB.shots.filter(s=>s.beanId!==beanId); DB.beans = DB.beans.filter(b=>b.id!==beanId); save(); popStack();
  }); },

  openLogShot(beanId){ const bean=findBean(beanId); pushStack('log-shot', {beanId, shotId:null, draft:makeShotDraft(bean,null), step:1}); },
  openShotFromHistory(beanId, shotId){ const bean=findBean(beanId); const shot=findShot(shotId);
    Nav.tab = 0; Nav.stacks[0] = [];
    pushStack('log-shot', {beanId, shotId, draft: makeShotDraft(bean,shot), step:1}); },
  popShotFlow(){ popStack(); },
  gotoTasteStep(){ currentTop().params.step = 2; render(); },
  backToStep1(){ currentTop().params.step = 1; render(); },
  pickRecipeChip(recipeId){ const p=currentTop().params; const r=findRecipe(recipeId); if(!r) return;
    p.draft.recipeName = r.name; render(); },
  setTaste(key,val){ const d=currentTop().params.draft; d[key]=val; vibrate(6); render(); },
  bumpExtraction(delta){ const d=currentTop().params.draft; d.extractionBalance=Math.max(1,Math.min(10,d.extractionBalance+delta)); render(); },
  saveShotAction(){
    const p = currentTop().params; const d = p.draft; const grinder = activeGrinder();
    const finalGrind = (grinder && grinder.useDialForGrind) ? d.grindValue.toFixed(1) : d.grindText;
    const ratings = Object.keys(d.starsByType).filter(k=>d.starsByType[k]>0).map(k=>({drinkType:k, stars:d.starsByType[k]}));
    if(p.shotId){
      const shot = findShot(p.shotId);
      Object.assign(shot, {doseGrams:d.dose, yieldGrams:d.yieldG, timeSeconds:Math.round(d.time), grindSetting:finalGrind,
        recipeName:d.recipeName, freeNotes:d.notes, acidity:d.acidity, sweetness:d.sweetness, bitterness:d.bitterness,
        body:d.bodyIntensity, aftertaste:d.aftertaste, extractionBalance:d.extractionBalance, flavorTags:d.flavorTags, ratings});
    } else {
      DB.shots.push({id:uid(), beanId:p.beanId, date:new Date().toISOString(), doseGrams:d.dose, yieldGrams:d.yieldG,
        timeSeconds:Math.round(d.time), grindSetting:finalGrind, recipeName:d.recipeName, freeNotes:d.notes,
        acidity:d.acidity, sweetness:d.sweetness, bitterness:d.bitterness, body:d.bodyIntensity, aftertaste:d.aftertaste,
        extractionBalance:d.extractionBalance, flavorTags:d.flavorTags, ratings});
    }
    const t = (d.recipeName||'').trim();
    if(t && !DB.recipes.some(r=>r.name.toLowerCase()===t.toLowerCase())) DB.recipes.push({id:uid(),name:t,notes:'',createdAt:Date.now()});
    save(); vibrate(15); popStack();
  },
  deleteShotConfirm(shotId){ confirmDialog('Delete this shot?','This cannot be undone.','Delete',true, ()=>{ DB.shots=DB.shots.filter(s=>s.id!==shotId); save(); popStack(); }); },
  setDrinkStar(typeId,val){ const d=currentTop().params.draft; const cur=d.starsByType[typeId]||0; d.starsByType[typeId]=(cur===val)?0:val; vibrate(10); render(); },
  toggleFlavor(name){ const d=currentTop().params.draft; const idx=d.flavorTags.findIndex(f=>f.toLowerCase()===name.toLowerCase());
    if(idx>=0) d.flavorTags.splice(idx,1); else d.flavorTags.push(name); vibrate(8); render(); },
  commitNewFlavor(){
    const d = currentTop().params.draft;
    const t = (d.newFlavorText||'').trim(); d.newFlavorText=''; d.addingFlavor=false;
    if(t){ if(!allFlavorNames().some(n=>n.toLowerCase()===t.toLowerCase())){ DB.customFlavorTags.push({id:uid(),name:t,createdAt:Date.now()}); save(); }
      if(!d.flavorTags.some(f=>f.toLowerCase()===t.toLowerCase())) d.flavorTags.push(t); }
    render();
  },

  commitNewProcess(){
    const p = activeParams(); const d = p.draft;
    const t = (d.newProcessText||'').trim(); d.newProcessText=''; d.addingProcess=false;
    if(t){
      if(!allProcessNames().some(n=>n.toLowerCase()===t.toLowerCase())){ DB.customProcessTags.push({id:uid(),name:t,createdAt:Date.now()}); save(); }
      d.process = t;
    }
    render();
  },
  confirmRemoveProcess(name){
    confirmDialog('Remove this process?', '"'+name+'" will no longer appear as a quick option for new bags.', 'Remove', true, ()=>{
      DB.customProcessTags = DB.customProcessTags.filter(t=>t.name.toLowerCase()!==name.toLowerCase());
      save(); render();
    });
  },
  confirmRemoveFlavor(name){
    confirmDialog('Remove this flavour?', '"'+name+'" will no longer appear as a quick option.', 'Remove', true, ()=>{
      DB.customFlavorTags = DB.customFlavorTags.filter(t=>t.name.toLowerCase()!==name.toLowerCase());
      save(); render();
    });
  },
  bumpDraftNum(field, delta, min, max){
    const d = activeParams().draft;
    let v = (typeof d[field]==='number' ? d[field] : parseFloat(d[field])) || 0;
    v = Math.round((v+delta)*100)/100;
    if(typeof min==='number') v = Math.max(min,v);
    if(typeof max==='number') v = Math.min(max,v);
    d[field] = v; render();
  },
  editDragFieldValue(key){
    const cfg = Registry.dragFields[key]; if(!cfg) return;
    const fvalEl = document.getElementById('fval-'+key); if(!fvalEl) return;
    const current = cfg.get();
    const rect = fvalEl.getBoundingClientRect();
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.pattern = '[0-9]*[.,]?[0-9]*';
    input.value = fmtNum(current, cfg.decimals).replace('.', ',');
    input.className = 'fval-edit';
    // Set width inline (beats the global input{width:100%} rule) so the field keeps
    // the exact footprint of the number it replaces instead of stretching to fill
    // the row — that stretch was what made it look like it "jumped" left.
    input.style.width = Math.max(rect.width, 44) + 'px';
    fvalEl.replaceWith(input);
    input.focus(); input.select();
    // Dose/yield/time are usage targets, not hardware limits — let a typed value
    // go outside the drag range. Grind stays clamped to the grinder's own dial range.
    const unrestricted = (key==='dose' || key==='yieldg' || key==='time');
    let done = false;
    const commit = ()=>{
      if(done) return; done = true;
      let v = parseFloat(String(input.value).replace(',', '.'));
      if(isNaN(v)) v = current;
      v = Number((Math.round(v/cfg.step)*cfg.step).toFixed(3));
      v = unrestricted ? Math.max(0, v) : Math.max(cfg.min, Math.min(cfg.max, v));
      cfg.set(v);
      render();
    };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); input.blur(); } });
  },

  setShelfSeg(seg){ UIState.shelfSeg = seg; render(); },
  setHistorySort(s){ UIState.historySort = s; UIState.historyPage = 1; render(); },
  setHistoryFilter(f){ UIState.historyFilter = f; UIState.historyPage = 1; render(); },
  setHistoryPage(p){ UIState.historyPage = p; render(); },

  openEditRecipe(recipeId){ pushStack('edit-recipe', {recipeId}); },
  openAddRecipe(){ openModal('add-recipe', {draft:{name:'',notes:'',pressure:9,temperature:93,preInfusion:6,basket:18}}); },
  doneEditRecipe(){ save(); popStack(); },
  setRecipeField(id,field,val){ const r=findRecipe(id); if(r) r[field]=val; },
  bumpRecipeNum(id,field,delta,min,max){
    const r = findRecipe(id); if(!r) return;
    let v = (r[field]!=null ? r[field] : 0) + delta; v = Math.round(v*10)/10;
    if(typeof min==='number') v = Math.max(min,v);
    if(typeof max==='number') v = Math.min(max,v);
    r[field] = v; save(); render();
  },
  deleteRecipeConfirm(id){ confirmDialog('Delete this recipe?','This removes it from your saved recipes and the quick-select list.','Delete',true, ()=>{ DB.recipes=DB.recipes.filter(r=>r.id!==id); save(); popStack(); }); },
  saveNewRecipe(){ const p=activeParams(); const d=p.draft; if(!d.name.trim()) return;
    const recipe = {id:uid(),name:d.name.trim(),notes:d.notes,createdAt:Date.now(),
      pressure:d.pressure!=null?d.pressure:9, temperature:d.temperature!=null?d.temperature:93, preInfusion:d.preInfusion!=null?d.preInfusion:6, basket:d.basket!=null?d.basket:18};
    DB.recipes.push(recipe);
    if(p.forMachineId){ const m=findMachine(p.forMachineId); if(m){ if(!m.recipeIds) m.recipeIds=[]; m.recipeIds.push(recipe.id); } }
    save(); Nav.modal=null; render(); },

  openGrinderDetail(id){ pushStack('grinder-detail', {grinderId:id}); },
  openMachineDetail(id){ pushStack('machine-detail', {machineId:id}); },
  openAddGrinder(){ openModal('add-grinder', {draft:{name:'',brand:'',burr:'Conical'}}); },
  openAddMachine(){ openModal('add-machine', {draft:{name:'',brand:'',type:'Pump'}}); },
  setGrinderField(id,field,val){ const g=findGrinder(id); if(g){ g[field]=val; save(); } },
  setGrinderChip(id,field,val){ const g=findGrinder(id); if(g){ g[field]=val; save(); render(); } },
  bumpGrinderRange(id,field,delta){
    const g=findGrinder(id); if(!g) return;
    const key = field==='min'?'grindDialMin':field==='max'?'grindDialMax':'grindDialStep';
    let v = Math.round((g[key]+delta)*10)/10;
    if(field==='step') v = Math.max(0.1, v);
    g[key]=v; save(); render();
  },
  toggleGrinderDial(id){ const g=findGrinder(id); if(g){ g.useDialForGrind=!g.useDialForGrind; save(); render(); } },
  setActiveGrinder(id){ DB.grinders.forEach(g=>{ g.isActive = (g.id===id); }); save(); render(); },
  deleteGrinderConfirm(id){ confirmDialog('Delete this grinder?','','Delete',true, ()=>{ DB.grinders=DB.grinders.filter(g=>g.id!==id); save(); popStack(); }); },
  saveGrinderAndBack(id){ save(); toast('Grinder saved'); popStack(); },
  setMachineField(id,field,val){ const m=findMachine(id); if(m){ m[field]=val; save(); } },
  setMachineChip(id,field,val){ const m=findMachine(id); if(m){ m[field]=val; save(); render(); } },
  toggleMachineGauge(id){ const m=findMachine(id); if(m){ m.hasPressureGauge=!m.hasPressureGauge; save(); render(); } },
  bumpMachineNum(id,field,delta,min,max){
    const m = findMachine(id); if(!m) return;
    let v = (m[field]!=null ? m[field] : 0) + delta; v = Math.round(v*10)/10;
    if(typeof min==='number') v = Math.max(min,v);
    if(typeof max==='number') v = Math.min(max,v);
    m[field] = v; save(); render();
  },
  toggleMachineRecipe(machineId,recipeId){
    const m = findMachine(machineId); if(!m) return;
    if(!m.recipeIds) m.recipeIds = [];
    const idx = m.recipeIds.indexOf(recipeId);
    if(idx>=0) m.recipeIds.splice(idx,1); else m.recipeIds.push(recipeId);
    save(); render();
  },
  openAddRecipeForMachine(machineId){ openModal('add-recipe', {draft:{name:'',notes:'',pressure:9,temperature:93,preInfusion:6,basket:18}, forMachineId:machineId}); },
  deleteMachineConfirm(id){ confirmDialog('Delete this machine?','','Delete',true, ()=>{ DB.machines=DB.machines.filter(m=>m.id!==id); save(); popStack(); }); },
  saveMachineAndBack(id){ save(); toast('Machine saved'); popStack(); },
  saveNewMachine(){ const d=activeParams().draft; if(!d.name.trim()) return; DB.machines.push({id:uid(),name:d.name.trim(),brand:d.brand.trim(),hasPressureGauge:false,type:d.type||'Pump',basket:18,defaultPressure:9,defaultTemperature:93,recipeIds:[],createdAt:Date.now()}); save(); Nav.modal=null; render(); },
  saveNewGrinder(){ const d=activeParams().draft; if(!d.name.trim()) return; const makeActive = DB.grinders.length===0;
    DB.grinders.push({id:uid(),name:d.name.trim(),brand:d.brand.trim(),scaleDescription:'Stepped',useDialForGrind:true,grindDialMin:0,grindDialMax:10,grindDialStep:0.1,burr:d.burr||'Conical',isActive:makeActive,createdAt:Date.now()});
    save(); Nav.modal=null; render(); },

  exportBackup(){
    const bundle = { exportedAt:new Date().toISOString(), beans:DB.beans, shots:DB.shots, recipes:DB.recipes,
      machines:DB.machines, grinders:DB.grinders, customFlavorTags: DB.customFlavorTags.map(t=>t.name) };
    const blob = new Blob([JSON.stringify(bundle,null,2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0,16).replace(/[:T]/g,'-');
    a.href=url; a.download=`Portafilter-Backup-${stamp}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 4000);
    toast('Backup downloaded'); render();
  },
  startImport(){ const inp=document.getElementById('fileInputImport'); inp.value=''; inp.click(); },
  eraseAllConfirm(){ confirmDialog('Erase all data?','Every bag, shot and recipe on this device. Export a backup first if you want it back.','Erase',true, ()=>{
    DB = defaultDB(); save(); Nav = {tab:0, stacks:[[],[],[],[],[]], modal:null, confirm:null, toast:null}; render();
  }); },
};
window.A = A;

/* ---------- Photo picker wiring (static elements outside #app) ---------- */
let PendingPhotoCallback = null;
function requestPhoto(useCamera, callback){
  PendingPhotoCallback = callback;
  const inp = document.getElementById(useCamera?'fileInputCamera':'fileInputPhoto');
  inp.value=''; inp.click();
}
function initStaticInputs(){
  async function handlePhoto(e){
    const f = e.target.files[0]; if(!f) return;
    try{ const durl = await fileToCompressedDataURL(f); if(PendingPhotoCallback) PendingPhotoCallback(durl); }
    catch(err){ console.error(err); }
  }
  document.getElementById('fileInputPhoto').addEventListener('change', handlePhoto);
  document.getElementById('fileInputCamera').addEventListener('change', handlePhoto);
  document.getElementById('fileInputImport').addEventListener('change', async e=>{
    const f = e.target.files[0]; if(!f) return;
    try{
      const text = await f.text();
      const bundle = JSON.parse(text);
      confirmDialog('Replace all current data with this backup?', "This can't be undone.", 'Replace', true, ()=>performImport(bundle));
    }catch(err){ alert('Could not read backup file: '+err.message); }
  });
}
function performImport(bundle){
  try{
    const mapTags = arr => (arr||[]).map(n => typeof n==='string' ? {id:uid(),name:n,createdAt:Date.now()} : n);
    // Merged onto defaultDB() (same as loadDB() does on every normal page load) so any
    // field the imported bundle doesn't carry — including ones added after that backup
    // was made — still exists as a valid empty value instead of being left undefined.
    // A missing field here (this was customProcessTags) throws the first time a screen
    // reads it, which aborts render() mid-way and leaves Nav.modal pointing at a modal
    // that will throw again on every future render — so nothing else can open either,
    // including "Add bag" and "Erase all data" — until a reload rebuilds Nav from scratch.
    DB = Object.assign(defaultDB(), {
      beans: bundle.beans||[], shots: bundle.shots||[], recipes: bundle.recipes||[],
      machines: bundle.machines||[], grinders: bundle.grinders||[],
      customFlavorTags: mapTags(bundle.customFlavorTags),
      customProcessTags: mapTags(bundle.customProcessTags)
    });
    save();
    Nav = {tab:0, stacks:[[],[],[],[],[]], modal:null, confirm:null, toast:null};
    toast('Backup restored');
    render();
  }catch(err){ alert('Could not restore backup: '+err.message); }
}

/* ---------- Init ---------- */
function initApp(){
  initStaticInputs();
  render();
  if('serviceWorker' in navigator){ navigator.serviceWorker.register('sw.js').catch(()=>{}); }
}
document.addEventListener('DOMContentLoaded', initApp);
