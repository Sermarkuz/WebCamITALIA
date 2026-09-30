"use strict";
const LS_KEY = "owi_cameras_v1";
const CATS = {
  piazze:{label:"Piazze / Città", color:getComputedStyle(document.documentElement).getPropertyValue('--cat-piazze').trim()},
  mare:{label:"Mare / Costa", color:getComputedStyle(document.documentElement).getPropertyValue('--cat-mare').trim()},
  montagna:{label:"Montagna", color:getComputedStyle(document.documentElement).getPropertyValue('--cat-montagna').trim()},
  meteo:{label:"Meteo / Cielo", color:getComputedStyle(document.documentElement).getPropertyValue('--cat-meteo').trim()},
  traffico:{label:"Traffico", color:getComputedStyle(document.documentElement).getPropertyValue('--cat-traffico').trim()},
  altro:{label:"Altro", color:getComputedStyle(document.documentElement).getPropertyValue('--cat-altro').trim()},
};
let cams = [];
let activeCats = new Set(Object.keys(CATS));
let query = "";
let editingId = null;
let pickMode = false;
let map = null, markerLayer = null, markers = {};
const cleanups = new Map(); // element -> cleanup fn

function load(){
  try{ cams = JSON.parse(localStorage.getItem(LS_KEY)) || []; }
  catch(e){ cams = []; }
  if(!Array.isArray(cams)) cams = [];
}
function save(){
  try{ localStorage.setItem(LS_KEY, JSON.stringify(cams)); }
  catch(e){ }
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,6);

function detect(url){
  url = (url||"").trim();
  if(!url) return {type:null};
  let m;
  if((m = url.match(/live_stream\?channel=([A-Za-z0-9_-]+)/)) ||
     (m = url.match(/youtube\.com\/channel\/([A-Za-z0-9_-]+)/)))
    return {type:"youtube", label:"YouTube · diretta canale", embed:`https://www.youtube.com/embed/live_stream?channel=${m[1]}&autoplay=1&mute=1&playsinline=1`};
  if((m = url.match(/(?:youtu\.be\/|v=|\/embed\/|\/live\/|\/shorts\/)([A-Za-z0-9_-]{11})/)))
    return {type:"youtube", label:"YouTube", embed:`https://www.youtube.com/embed/${m[1]}?autoplay=1&mute=1&playsinline=1`};
  if(/embed\.skylinewebcams\.com/.test(url))
    return {type:"iframe", label:"Skyline (embed)", embed:url};
  if(/skylinewebcams\.com/.test(url))
    return {type:"iframe", label:"Skyline — meglio il link 'Embed'", embed:url, warn:true};
  if(/windy\.com/.test(url))
    return {type:"iframe", label:"Windy", embed:url};
  if(/\.m3u8(\?|$)/i.test(url))
    return {type:"hls", label:"Flusso HLS (.m3u8)", embed:url};
  if(/\.(jpe?g|png|webp)(\?|$)/i.test(url))
    return {type:"image", label:"Immagine JPG (refresh 10s)", embed:url};
  return {type:"iframe", label:"iframe generico", embed:url};
}

function mountPlayer(container, cam){
  cleanupEl(container);
  container.innerHTML = "";
  const d = detect(cam.url);
  const fail = (msg) => {
    const f = document.createElement("div"); f.className="fail";
    f.innerHTML = `<div>${msg}</div><a class="btn" href="${escapeAttr(cam.url)}" target="_blank" rel="noopener">Apri nella fonte ↗</a>`;
    container.appendChild(f);
  };
  if(d.type==="hls"){
    const v = document.createElement("video");
    v.controls=true; v.autoplay=true; v.muted=true; v.playsInline=true;
    container.appendChild(v);
    if(v.canPlayType("application/vnd.apple.mpegurl")){ v.src = d.embed; }
    else{
      loadHls().then(()=>{
        if(window.Hls && window.Hls.isSupported()){
          const hls = new window.Hls(); hls.loadSource(d.embed); hls.attachMedia(v);
          hls.on(window.Hls.Events.ERROR,(e,data)=>{ if(data && data.fatal) fail("Flusso non riproducibile."); });
          cleanups.set(container, ()=>{ try{hls.destroy();}catch(_){} });
        } else fail("HLS non supportato dal browser.");
      }).catch(()=>fail("Impossibile caricare il player HLS."));
    }
  } else if(d.type==="image"){
    const img = document.createElement("img");
    const bust = ()=>{ img.src = d.embed + (d.embed.includes("?")?"&":"?") + "t=" + Date.now(); };
    img.onerror = ()=>fail("Immagine non raggiungibile.");
    container.appendChild(img); bust();
    const iv = setInterval(bust, 10000);
    cleanups.set(container, ()=>clearInterval(iv));
  } else {
    const ifr = document.createElement("iframe");
    ifr.src = d.embed;
    ifr.allow = "autoplay; fullscreen; encrypted-media; picture-in-picture; accelerometer; gyroscope";
    ifr.allowFullscreen = true; ifr.referrerPolicy = "no-referrer-when-downgrade";
    container.appendChild(ifr);
    const hintTimer = setTimeout(()=>{
      const f = document.createElement("div"); f.className="fail";
      f.style.background="linear-gradient(180deg,rgba(9,13,18,0),rgba(9,13,18,.92))";
      f.style.justifyContent="flex-end"; f.style.pointerEvents="none";
      f.innerHTML = `<a class="btn" style="pointer-events:auto" href="${escapeAttr(cam.url)}" target="_blank" rel="noopener">Non si vede? Apri nella fonte ↗</a>`;
      container.appendChild(f);
    }, 3500);
    cleanups.set(container, ()=>clearTimeout(hintTimer));
  }
}
function cleanupEl(el){ const fn = cleanups.get(el); if(fn){ try{fn();}catch(_){} cleanups.delete(el); } }
let hlsPromise=null;
function loadHls(){
  if(window.Hls) return Promise.resolve();
  if(hlsPromise) return hlsPromise;
  hlsPromise = new Promise((res,rej)=>{
    const s=document.createElement("script");
    s.src="https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.5.13/hls.min.js";
    s.onload=res; s.onerror=rej; document.head.appendChild(s);
  });
  return hlsPromise;
}

function visibleCams(){
  return cams.filter(c => activeCats.has(c.category) &&
    (!query || (c.name+" "+(c.note||"")).toLowerCase().includes(query)));
}
function renderWall(){
  const wall = document.getElementById("wall");
  const empty = document.getElementById("emptyState");
  wall.querySelectorAll(".screen").forEach(cleanupEl);
  wall.innerHTML = "";
  if(cams.length===0){ empty.hidden=false; wall.style.display="none"; return; }
  empty.hidden=true; wall.style.display="grid";
  const list = visibleCams();
  if(list.length===0){
    wall.style.display="block";
    wall.innerHTML = `<div class="empty"><p style="margin:4vh auto">Nessuna webcam corrisponde ai filtri.</p></div>`;
    return;
  }
  list.forEach(cam=>{
    const cat = CATS[cam.category]||CATS.altro;
    const t = document.createElement("div"); t.className="tile";
    t.innerHTML = `
      <div class="screen">
        <div class="poster">
          <div class="play"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></div>
          <small>Avvia diretta</small>
        </div>
      </div>
      <div class="bar">
        <span class="d" style="background:${cat.color}"></span>
        <span class="nm" title="${escapeAttr(cam.name)}">${escapeHtml(cam.name)}</span>
        <div class="sp">
          <button title="A tutto schermo" data-act="live">⤢</button>
          <button title="Modifica" data-act="edit">✎</button>
          <a title="Apri nella fonte" href="${escapeAttr(cam.url)}" target="_blank" rel="noopener" style="color:var(--faint);padding:4px">↗</a>
        </div>
      </div>`;
    const screen = t.querySelector(".screen");
    const poster = t.querySelector(".poster");
    poster.addEventListener("click", ()=>{ mountPlayer(screen, cam); });
    t.querySelector('[data-act="live"]').addEventListener("click", ()=>openLive(cam));
    t.querySelector('[data-act="edit"]').addEventListener("click", ()=>openForm(cam.id));
    wall.appendChild(t);
  });
}

function ensureMap(){
  if(map) return;
  map = L.map("map",{zoomControl:true, preferCanvas:true}).setView([42.2,12.4],6);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",{
    maxZoom:19, subdomains:"abcd",
    attribution:'© OpenStreetMap, © CARTO'
  }).addTo(map);
  markerLayer = L.layerGroup().addTo(map);
  map.on("click", e=>{
    if(!pickMode) return;
    document.getElementById("fLat").value = e.latlng.lat.toFixed(5);
    document.getElementById("fLng").value = e.latlng.lng.toFixed(5);
    cancelPick(); openForm(editingId, true);
  });
}
function renderMarkers(){
  if(!markerLayer) return;
  markerLayer.clearLayers(); markers = {};
  visibleCams().forEach(cam=>{
    if(typeof cam.lat!=="number" || typeof cam.lng!=="number") return;
    const cat = CATS[cam.category]||CATS.altro;
    const mk = L.circleMarker([cam.lat,cam.lng],{
      radius:7, color:"#0b1016", weight:2, fillColor:cat.color, fillOpacity:.95
    });
    mk.bindPopup(`<div class="pop"><h4>${escapeHtml(cam.name)}</h4>
      <div class="pc">${cat.label}</div>
      <button class="btn primary" style="padding:5px 12px;font-size:12px" onclick="openLiveById('${cam.id}')">▶ Guarda</button></div>`);
    mk.addTo(markerLayer); markers[cam.id]=mk;
  });
}

function renderChips(){
  const box = document.getElementById("chips"); box.innerHTML="";
  Object.entries(CATS).forEach(([key,cat])=>{
    const n = cams.filter(c=>c.category===key).length;
    const b = document.createElement("button");
    b.className = "chip" + (activeCats.has(key)?" on":"");
    b.innerHTML = `<span class="d" style="background:${cat.color}"></span>${cat.label}${n?` <span style="color:var(--faint)">${n}</span>`:""}`;
    b.onclick = ()=>{
      if(activeCats.has(key)) activeCats.delete(key); else activeCats.add(key);
      if(activeCats.size===0) activeCats = new Set(Object.keys(CATS));
      renderChips(); refresh();
    };
    box.appendChild(b);
  });
}

function openLive(cam){
  document.getElementById("liveTitle").textContent = cam.name;
  document.getElementById("liveDot").style.background = (CATS[cam.category]||CATS.altro).color;
  document.getElementById("liveOpen").href = cam.url;
  show("liveOverlay");
  mountPlayer(document.getElementById("livePlayer"), cam);
}
function openLiveById(id){ const c = cams.find(x=>x.id===id); if(c) openLive(c); }
function closeLive(){ const p=document.getElementById("livePlayer"); cleanupEl(p); p.innerHTML=""; hide("liveOverlay"); }

function openForm(id, keepCoords){
  editingId = id || null;
  const c = id ? cams.find(x=>x.id===id) : null;
  document.getElementById("formTitle").textContent = c ? "Modifica webcam" : "Aggiungi webcam";
  document.getElementById("btnDelete").hidden = !c;
  if(!keepCoords){
    document.getElementById("fUrl").value = c? c.url : "";
    document.getElementById("fName").value = c? c.name : "";
    document.getElementById("fCat").value = c? c.category : "piazze";
    document.getElementById("fLat").value = c && typeof c.lat==="number" ? c.lat : "";
    document.getElementById("fLng").value = c && typeof c.lng==="number" ? c.lng : "";
  }
  onUrlInput();
  show("formOverlay");
  setTimeout(()=>document.getElementById("fUrl").focus(),50);
}
function closeForm(){ hide("formOverlay"); editingId=null; }
function onUrlInput(){
  const d = detect(document.getElementById("fUrl").value);
  const el = document.getElementById("fDetect");
  if(!d.type){ el.innerHTML=""; return; }
  el.innerHTML = `Rilevato: <b>${d.label}</b>` + (d.warn? " — se non si vede, incolla il link <b>Embed</b> della fonte." : "");
}
function saveForm(){
  const url = document.getElementById("fUrl").value.trim();
  const name = document.getElementById("fName").value.trim();
  if(!url || !name){ alert("Servono almeno il link e il nome."); return; }
  const lat = parseFloat(document.getElementById("fLat").value);
  const lng = parseFloat(document.getElementById("fLng").value);
  const rec = {
    id: editingId || uid(),
    name, url,
    category: document.getElementById("fCat").value,
    lat: isFinite(lat)? lat : null,
    lng: isFinite(lng)? lng : null,
  };
  if(editingId){ const i = cams.findIndex(x=>x.id===editingId); if(i>=0) cams[i]=rec; }
  else cams.push(rec);
  save(); closeForm(); renderChips(); refresh();
}
function deleteCurrent(){
  if(!editingId) return;
  if(!confirm("Eliminare questa webcam?")) return;
  cams = cams.filter(x=>x.id!==editingId);
  save(); closeForm(); renderChips(); refresh();
}

function startPick(){
  ensureMap(); hide("formOverlay"); switchView("map");
  pickMode = true; document.getElementById("pickBar").hidden = false;
}
function cancelPick(){ pickMode=false; document.getElementById("pickBar").hidden = true; }

function exportJSON(){
  const blob = new Blob([JSON.stringify(cams,null,2)],{type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "webcam-italia.json"; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),2000);
}
function importJSON(ev){
  const file = ev.target.files[0]; if(!file) return;
  const r = new FileReader();
  r.onload = ()=>{
    try{
      const data = JSON.parse(r.result);
      if(!Array.isArray(data)) throw 0;
      const clean = data.filter(x=>x&&x.url&&x.name).map(x=>({
        id:x.id||uid(), name:String(x.name), url:String(x.url),
        category: CATS[x.category]?x.category:"altro",
        lat: typeof x.lat==="number"?x.lat:null, lng: typeof x.lng==="number"?x.lng:null
      }));
      if(confirm(`Importare ${clean.length} webcam? (sostituisce l'elenco attuale)`)){
        cams = clean; save(); renderChips(); refresh(); hide("dataOverlay");
      }
    }catch(e){ alert("File non valido."); }
    ev.target.value="";
  };
  r.readAsText(file);
}
function wipeAll(){
  if(!confirm("Rimuovere tutte le webcam salvate?")) return;
  cams=[]; save(); renderChips(); refresh(); hide("dataOverlay");
}

function switchView(v){
  const wall = v==="wall";
  document.getElementById("wallView").hidden = !wall;
  document.getElementById("mapView").hidden = wall;
  document.getElementById("tabWall").classList.toggle("on", wall);
  document.getElementById("tabMap").classList.toggle("on", !wall);
  if(!wall){ ensureMap(); setTimeout(()=>{ map.invalidateSize(); renderMarkers(); },60); }
}
function refresh(){
  document.getElementById("cCount").textContent = cams.length;
  renderWall();
  if(map && !document.getElementById("mapView").hidden) renderMarkers();
}

function show(id){ document.getElementById(id).hidden=false; }
function hide(id){ document.getElementById(id).hidden=true; }
function escapeHtml(s){ return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function escapeAttr(s){ return escapeHtml(s).replace(/'/g,"&#39;"); }

document.getElementById("tabWall").onclick = ()=>switchView("wall");
document.getElementById("tabMap").onclick = ()=>switchView("map");
document.getElementById("btnAdd").onclick = ()=>openForm();
document.getElementById("btnMenu").onclick = ()=>show("dataOverlay");
document.getElementById("q").addEventListener("input", e=>{ query=e.target.value.trim().toLowerCase(); refresh(); });
document.querySelectorAll(".overlay").forEach(o=>o.addEventListener("click",e=>{
  if(e.target===o){ if(o.id==="liveOverlay") closeLive(); else o.hidden=true; }
}));
document.addEventListener("keydown",e=>{ if(e.key==="Escape"){
  if(!document.getElementById("liveOverlay").hidden) closeLive();
  else document.querySelectorAll(".overlay").forEach(o=>o.hidden=true);
}});

load(); renderChips(); refresh();
window.openForm=openForm; window.closeForm=closeForm; window.saveForm=saveForm;
window.deleteCurrent=deleteCurrent; window.onUrlInput=onUrlInput; window.startPick=startPick;
window.cancelPick=cancelPick; window.closeLive=closeLive; window.openLiveById=openLiveById;
window.exportJSON=exportJSON; window.importJSON=importJSON; window.wipeAll=wipeAll; window.hide=hide;
