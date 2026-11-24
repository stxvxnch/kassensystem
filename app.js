// ---------- Daten (alle Geldbeträge in Cent) ----------
const PFAND_TYPEN = {tasse:'Tasse', flasche:'Flasche'};
const DEFAULTS = {
  products:[
    {id:'p1',name:'Glühwein',price:400,pfand:'tasse'},
    {id:'p2',name:'Kinderpunsch',price:300,pfand:'tasse'},
    {id:'p3',name:'Cola',price:300,pfand:'flasche'},
    {id:'p4',name:'Fanta',price:300,pfand:'flasche'},
    {id:'p5',name:'Wasser',price:250,pfand:'flasche'},
    {id:'p6',name:'Bratwurst',price:350,pfand:'none'},
    {id:'p7',name:'Pommes',price:300,pfand:'none'},
  ],
  deposit:{tasse:200,flasche:100}
};

// ---------- Backend (Supabase) ----------
const SUPABASE_URL = 'https://yagdhydsvifxxdqhjohp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_G6dZLG6yyIi1sJn0unEYhw_b8LbRBxJ';   // neuer "Publishable key" (sb_publishable_...) oder alter anon key (eyJ...)
const REMOTE = !SUPABASE_URL.includes('DEIN-');
async function api(path,opts={}){
  // Neue sb_-Keys sind keine JWTs und gehören nur in den apikey-Header; der alte anon-Key (JWT) darf zusätzlich als Bearer mit.
  const auth = SUPABASE_KEY.startsWith('sb_') ? {} : {Authorization:'Bearer '+SUPABASE_KEY};
  const r=await fetch(SUPABASE_URL+'/rest/v1/'+path,{...opts,headers:{apikey:SUPABASE_KEY,...auth,'Content-Type':'application/json',...(opts.headers||{})}});
  if(!r.ok) throw new Error(await r.text());
  return r.json().catch(()=>null);
}
const UPSERT={Prefer:'resolution=merge-duplicates,return=minimal'};
let pending = (()=>{try{return JSON.parse(localStorage.getItem('pending'))||[];}catch(e){return [];}})();
function savePending(){try{localStorage.setItem('pending',JSON.stringify(pending));}catch(e){}}
let flushing=false, lastErr='';
async function flush(){
  if(!REMOTE||!pending.length||flushing) return;
  flushing=true;
  const batch=pending.slice();
  try{
    await api('sales',{method:'POST',headers:UPSERT,body:JSON.stringify(batch.map(s=>({id:s.id,ts:new Date(s.ts).toISOString(),total:s.total,data:s})))});
    pending=pending.filter(s=>!batch.some(b=>b.id===s.id)); savePending();
    lastErr='';
  }catch(e){ lastErr=String(e.message||e); console.error('Backend-Fehler:',e); }
  flushing=false; updateStatus();
}
async function fetchSales(){
  const remote=[]; let ok=true;
  if(REMOTE){
    try{ for(let from=0;;from+=1000){
      const rows=await api('sales?select=data&order=ts.asc',{headers:{Range:from+'-'+(from+999)}});
      remote.push(...rows.map(r=>r.data)); if(rows.length<1000) break; }
    }catch(e){ok=false;}
  }
  const ids=new Set(remote.map(s=>s.id));
  return {sales:remote.concat(pending.filter(s=>!ids.has(s.id))),ok};
}
function pushConfig(){ return REMOTE ? api('config',{method:'POST',headers:UPSERT,body:JSON.stringify({id:1,data:db})}) : Promise.resolve(); }
function updateStatus(){
  const e=$('#status'); if(!e) return;
  e.textContent = !REMOTE ? '⚠ kein Backend' : lastErr ? '⚠ Backend-Fehler' : pending.length ? '⚠ '+pending.length+' nicht gesendet' : '● gespeichert';
  e.title = lastErr;
  let d=$('#errbox');
  if(!d){ d=document.createElement('div'); d.id='errbox'; d.style.cssText='background:#fff3cd;color:#664d03;padding:8px 12px;font-size:14px;word-break:break-word'; document.body.insertBefore(d,document.querySelector('main')); }
  d.hidden=!lastErr; d.textContent=lastErr?'Backend-Fehler: '+lastErr:'';
}
async function init(){
  updateStatus(); if(!REMOTE) return;
  try{
    const r=await api('config?id=eq.1&select=data');
    if(r&&r.length){ db=r[0].data; try{localStorage.setItem('kasse',JSON.stringify(db));}catch(e){} renderProducts(); renderCart(); }
    else await pushConfig();
    lastErr='';
  }catch(e){ lastErr=String(e.message||e); console.error('Backend-Fehler:',e); }
  updateStatus();
  flush();
}
setInterval(flush,15000);
let db = load();
let cart = {};                       // produktId -> Menge
let returns = {tasse:0, flasche:0};  // zurückgegebene Pfandstücke
let paid = 0;

function load(){
  try{const d=JSON.parse(localStorage.getItem('kasse')); if(d&&d.products) return d;}catch(e){}
  return JSON.parse(JSON.stringify(DEFAULTS));
}
function save(){
  try{localStorage.setItem('kasse',JSON.stringify(db));}catch(e){}
  pushConfig().catch(()=>toast('⚠ Produkte nicht im Backend gespeichert'));
}

// ---------- Helfer ----------
const $ = s=>document.querySelector(s);
const eur = c => (c/100).toFixed(2).replace('.',',')+' €';
const parseEur = s => Math.round(parseFloat(String(s).replace(',','.'))*100)||0;
const esc = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(t){const e=$('#toast');e.textContent=t;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),1800);}

function tab(n){
  for(const x of ['kasse','stats','prod']){
    $('#v-'+x).hidden = x!==n;
    $('#t-'+x).classList.toggle('on',x===n);
  }
  $('#v-kasse').style.display = n==='kasse' ? '' : 'none';
  if(n==='stats') renderStats();
  if(n==='prod') renderProd();
}

// ---------- Kasse: Berechnung inkl. Pfand ----------
function calc(){
  let sub=0; const bought={tasse:0,flasche:0}, lines=[];
  for(const p of db.products){
    const q=cart[p.id]||0; if(!q) continue;
    sub+=q*p.price; lines.push({p,q});
    if(p.pfand!=='none') bought[p.pfand]+=q;
  }
  // Pfand = (neu gekauft - zurückgegeben) * Pfandwert. Kann negativ werden -> Auszahlung.
  const pfl={}; let pf=0;
  for(const t in PFAND_TYPEN){ pfl[t]=(bought[t]-returns[t])*db.deposit[t]; pf+=pfl[t]; }
  return {sub,bought,lines,pfl,pf,total:sub+pf};
}

function renderProducts(){
  $('#products').innerHTML = db.products.map(p=>
    `<button class="prod" onclick="add('${p.id}')"><b>${esc(p.name)}</b><small>${eur(p.price)}</small>`+
    (p.pfand!=='none'?`<br><span class="tag">+ Pfand ${eur(db.deposit[p.pfand])}</span>`:'')+`</button>`).join('');
}
function add(id){cart[id]=(cart[id]||0)+1;renderCart();}
function chg(id,d){cart[id]=Math.max(0,(cart[id]||0)+d);renderCart();}
function ret(t,d){returns[t]=Math.max(0,returns[t]+d);renderCart();}
function resetCart(){cart={};returns={tasse:0,flasche:0};paid=0;renderCart();}
function addPaid(c){paid+=c;renderCart();}
function setPaid(v){paid=parseEur(v);updatePay();}

function renderCart(){
  const c=calc();
  let h='';
  if(!c.lines.length) h+='<div class="hint">Produkt antippen …</div>';
  for(const l of c.lines){
    h+=`<div class="row"><div>${esc(l.p.name)}<br><small>${eur(l.p.price)}</small></div>
    <div class="qty"><button onclick="chg('${l.p.id}',-1)">−</button><span>${l.q}</span><button onclick="chg('${l.p.id}',1)">+</button></div>
    <div style="min-width:70px;text-align:right">${eur(l.q*l.p.price)}</div></div>`;
  }
  h+='<h3>Pfand zurück</h3>';
  for(const t in PFAND_TYPEN){
    h+=`<div class="row"><div>${PFAND_TYPEN[t]}n zurück<br><small>${eur(db.deposit[t])} je Stück</small></div>
    <div class="qty"><button onclick="ret('${t}',-1)">−</button><span>${returns[t]}</span><button onclick="ret('${t}',1)">+</button></div><div style="min-width:70px"></div></div>`;
  }
  h+=`<div class="row sep"><span>Zwischensumme</span><span>${eur(c.sub)}</span></div>`;
  for(const t in PFAND_TYPEN){
    if(c.pfl[t]!==0) h+=`<div class="row"><span>Pfand ${PFAND_TYPEN[t]} (${c.bought[t]} neu − ${returns[t]} zurück)</span><span class="${c.pfl[t]<0?'neg':''}">${eur(c.pfl[t])}</span></div>`;
  }
  if(c.total>=0){
    h+=`<div class="row sep"><span>Zu zahlen</span><span class="total">${eur(c.total)}</span></div>
    <div class="quick">${[500,1000,2000,5000].map(x=>`<button class="btn" onclick="addPaid(${x})">+${x/100}€</button>`).join('')}
    <button class="btn" onclick="paid=${c.total};renderCart()">Passend</button>
    <button class="btn" onclick="paid=0;renderCart()">0</button></div>
    <input id="paidIn" inputmode="decimal" placeholder="Gegeben (€)" value="${paid?(paid/100).toFixed(2).replace('.',','):''}" oninput="setPaid(this.value)">
    <div class="row"><span>Rückgeld</span><span class="total" id="change"></span></div>`;
  } else {
    h+=`<div class="row sep"><span>Auszahlen an Kunde</span><span class="total neg">${eur(-c.total)}</span></div>`;
  }
  h+=`<button class="btn pri" id="done" onclick="finish()">Verkauf abschließen</button>
  <button class="btn" style="width:100%;margin-top:6px" onclick="resetCart()">Alles zurücksetzen</button>`;
  $('#cart').innerHTML=h;
  updatePay();
}

function updatePay(){
  const c=calc(), done=$('#done'); if(!done) return;
  const empty = !c.lines.length && returns.tasse===0 && returns.flasche===0;
  if(c.total>=0){
    const ch=paid-c.total;
    const el=$('#change'); if(el){ el.textContent = paid>=c.total ? eur(ch) : 'fehlt: '+eur(-ch); el.style.color = paid>=c.total?'#2e7d32':'#c62828'; }
    done.disabled = empty || paid<c.total;
  } else done.disabled = false;
}

function finish(){
  const c=calc(); if(!c.lines.length && returns.tasse===0 && returns.flasche===0) return;
  const sale={
    id:Date.now()*1000+Math.floor(Math.random()*1000), ts:Date.now(),
    items:c.lines.map(l=>({id:l.p.id,name:l.p.name,price:l.p.price,qty:l.q,pfand:l.p.pfand})),
    bought:c.bought, returned:{...returns}, deposit:{...db.deposit},
    sub:c.sub, pf:c.pf, total:c.total,   // total = Netto-Kassenbewegung (negativ = Auszahlung)
    paid:c.total>=0?paid:0
  };
  pending.push(sale); savePending(); updateStatus(); flush();
  toast(c.total>=0 ? 'Rückgeld: '+eur(paid-c.total) : 'Auszahlen: '+eur(-c.total));
  resetCart();
}

// ---------- Statistik ----------
async function renderStats(){
  $('#v-stats').innerHTML='<p>Lade …</p>';
  await flush();
  const {sales:S,ok}=await fetchSales();
  const umsatz=S.reduce((a,s)=>a+s.sub,0);
  const pfSaldo=S.reduce((a,s)=>a+s.pf,0);
  const kasse=umsatz+pfSaldo;
  const out={tasse:0,flasche:0}, back={tasse:0,flasche:0};
  S.forEach(s=>{for(const t in out){out[t]+=s.bought[t];back[t]+=s.returned[t];}});
  const per={};
  S.forEach(s=>s.items.forEach(i=>{const k=i.name;per[k]=per[k]||{q:0,u:0};per[k].q+=i.qty;per[k].u+=i.qty*i.price;}));
  const rows=Object.entries(per).sort((a,b)=>b[1].u-a[1].u);
  const hours={}; S.forEach(s=>{const d=new Date(s.ts);const k=d.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'})+' '+String(d.getHours()).padStart(2,'0')+' Uhr';hours[k]=(hours[k]||0)+s.sub;});
  const maxH=Math.max(1,...Object.values(hours));

  let h=(ok?'':'<p style="color:#c62828">⚠ Backend nicht erreichbar – Anzeige unvollständig.</p>')+`<div class="cards">
   <div class="card"><small>Umsatz (ohne Pfand)</small><b>${eur(umsatz)}</b></div>
   <div class="card"><small>Pfand-Saldo</small><b>${eur(pfSaldo)}</b></div>
   <div class="card"><small>Soll-Kassenbestand</small><b>${eur(kasse)}</b></div>
   <div class="card"><small>Verkäufe</small><b>${S.length}</b></div>
   <div class="card"><small>Ø pro Verkauf</small><b>${S.length?eur(Math.round(umsatz/S.length)):'–'}</b></div></div>
   <small class="hint">Soll-Kassenbestand = Einnahmen aus diesen Verkäufen (ohne Wechselgeld-Startbestand).</small>
   <h3>Pro Produkt</h3><table><tr><th>Produkt</th><th class="r">Stück</th><th class="r">Umsatz</th></tr>
   ${rows.map(([n,v])=>`<tr><td>${esc(n)}</td><td class="r">${v.q}</td><td class="r">${eur(v.u)}</td></tr>`).join('')||'<tr><td colspan=3>Noch keine Verkäufe</td></tr>'}</table>
   <h3>Pfand</h3><table><tr><th></th><th class="r">Ausgegeben</th><th class="r">Zurück</th><th class="r">Noch draußen</th></tr>
   ${Object.keys(PFAND_TYPEN).map(t=>`<tr><td>${PFAND_TYPEN[t]}</td><td class="r">${out[t]}</td><td class="r">${back[t]}</td><td class="r">${out[t]-back[t]}</td></tr>`).join('')}</table>
   <h3>Umsatz nach Stunde</h3><table>${Object.entries(hours).map(([k,v])=>`<tr><td style="width:110px">${k}</td><td><div class="bar" style="width:${v/maxH*100}%"></div></td><td class="r" style="width:90px">${eur(v)}</td></tr>`).join('')||'<tr><td>–</td></tr>'}</table>
   <h3>Export</h3><div class="quick"><button class="btn" onclick="exportCSV()">CSV (Excel)</button><button class="btn" onclick="exportJSON()">Backup (JSON)</button></div>
   <h3>Letzte Verkäufe</h3><table>${S.slice(-15).reverse().map(s=>`<tr><td>${new Date(s.ts).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})}</td>
   <td>${s.items.map(i=>i.qty+'× '+esc(i.name)).join(', ')||'–'}${(s.returned.tasse||s.returned.flasche)?` <small>(zurück: ${s.returned.tasse} Tasse, ${s.returned.flasche} Flasche)</small>`:''}</td>
   <td class="r">${eur(s.total)}</td><td class="r"><button class="btn" onclick="storno(${s.id})">Storno</button></td></tr>`).join('')||'<tr><td>–</td></tr>'}</table>
   <h3>Gefahrenzone</h3><button class="btn red" onclick="wipe()">Alle Verkäufe löschen</button>`;
  $('#v-stats').innerHTML=h;
}
async function storno(id){
  if(!confirm('Diesen Verkauf stornieren?')) return;
  pending=pending.filter(s=>s.id!==id); savePending();
  if(REMOTE){ try{await api('sales?id=eq.'+id,{method:'DELETE'});}catch(e){toast('⚠ Storno fehlgeschlagen (Backend nicht erreichbar)');return;} }
  renderStats();
}
async function wipe(){
  if(prompt('Alle Verkäufe löschen? Zur Bestätigung LÖSCHEN eintippen')!=='LÖSCHEN') return;
  pending=[]; savePending();
  if(REMOTE){ try{await api('sales?id=gt.0',{method:'DELETE'});}catch(e){toast('⚠ Löschen fehlgeschlagen');return;} }
  renderStats();
}
function download(name,text,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();}
async function exportJSON(){const {sales}=await fetchSales();download('kasse-backup-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify({config:db,sales}),'application/json');}
async function exportCSV(){
  const {sales:ALL}=await fetchSales();
  const r=[['Bon','Zeit','Artikel','Menge','Einzelpreis','Summe']];
  ALL.forEach(s=>{
    const z=new Date(s.ts).toLocaleString('de-DE');
    s.items.forEach(i=>r.push([s.id,z,i.name,i.qty,(i.price/100).toFixed(2),(i.qty*i.price/100).toFixed(2)]));
    for(const t in PFAND_TYPEN){const n=s.bought[t]-s.returned[t]; if(n) r.push([s.id,z,'Pfand '+PFAND_TYPEN[t],n,(s.deposit[t]/100).toFixed(2),(n*s.deposit[t]/100).toFixed(2)]);}
  });
  download('kasse-verkaeufe.csv','\ufeff'+r.map(x=>x.map(v=>String(v).replace('.',',')).join(';')).join('\n'),'text/csv');
}

// ---------- Produkte verwalten ----------
function renderProd(){
  let h='<div class="panel"><h3 style="margin-top:0">Produkte</h3>';
  db.products.forEach(p=>{
    h+=`<div class="prow"><input value="${esc(p.name)}" onchange="upd('${p.id}','name',this.value)">
    <input inputmode="decimal" value="${(p.price/100).toFixed(2).replace('.',',')}" onchange="upd('${p.id}','price',this.value)">
    <select onchange="upd('${p.id}','pfand',this.value)">
      <option value="none" ${p.pfand==='none'?'selected':''}>kein Pfand</option>
      <option value="tasse" ${p.pfand==='tasse'?'selected':''}>Tasse</option>
      <option value="flasche" ${p.pfand==='flasche'?'selected':''}>Flasche</option></select>
    <button class="btn red" onclick="delP('${p.id}')">✕</button></div>`;
  });
  h+=`<button class="btn" onclick="addP()">+ Produkt hinzufügen</button>
  <h3>Pfandwerte</h3>
  ${Object.keys(PFAND_TYPEN).map(t=>`<div class="prow" style="grid-template-columns:1fr 90px"><span>${PFAND_TYPEN[t]}</span><input inputmode="decimal" value="${(db.deposit[t]/100).toFixed(2).replace('.',',')}" onchange="db.deposit['${t}']=parseEur(this.value);save();renderProducts();renderCart()"></div>`).join('')}
  <p class="hint">Änderungen gelten sofort. Bereits gespeicherte Verkäufe bleiben unverändert.</p></div>`;
  $('#v-prod').innerHTML=h;
}
function upd(id,k,v){const p=db.products.find(x=>x.id===id);p[k]=k==='price'?parseEur(v):v;save();renderProducts();renderCart();}
function addP(){db.products.push({id:'p'+Date.now(),name:'Neu',price:300,pfand:'none'});save();renderProd();renderProducts();}
function delP(id){if(confirm('Produkt entfernen?')){db.products=db.products.filter(p=>p.id!==id);delete cart[id];save();renderProd();renderProducts();renderCart();}}

// ---------- Start ----------
renderProducts(); renderCart(); tab('kasse'); init();
