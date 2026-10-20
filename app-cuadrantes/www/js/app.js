/* Cuadrantes Belén — app principal. */
(function(){
'use strict';
const G=window.Geo, OSM=window.OSM_DATA, DEFAULT_BASE=window.KML_BASE;
// Datos públicos de la Alcaldía (cámaras, cuadrantes oficiales, barrios, nomenclatura, delitos).
const AL=Object.assign({cams:[],metro:[],fdt:[],mov:[],cuadrantes:[],barrios:[],nom:{},delitos:[],delCats:[],delMods:[],camTipos:[],camEstados:[]},window.ALCALDIA||{});
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const nf=(n,d=0)=>n.toLocaleString('es-CO',{minimumFractionDigits:d,maximumFractionDigits:d});
const fmtLen=m=>m<1000?`${nf(m)} m`:`${nf(m/1000,2)} km`;
const fmtArea=m2=>m2<10000?`${nf(m2)} m²`:m2<1e6?`${nf(m2/1e4,2)} ha`:`${nf(m2/1e6,2)} km²`;
const fmtLL=ll=>`${ll[0].toFixed(6)}, ${ll[1].toFixed(6)}`;
const norm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
const Cap=window.Capacitor, NATIVE=!!(Cap&&Cap.isNativePlatform&&Cap.isNativePlatform());
// Plugins nativos (solo en el APK; en el navegador se usan las APIs web).
const P={};if(NATIVE)for(const n of ['App','Haptics','Filesystem','Share','StatusBar','SplashScreen']){try{P[n]=Cap.registerPlugin?Cap.registerPlugin(n):Cap.Plugins[n]}catch(e){}}
const VERSION='1.1.0';

const ICON={
  back:'<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  close:'<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  gmaps:'<svg viewBox="0 0 24 24"><path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="10" r="2.6" fill="currentColor"/></svg>',
  route:'<svg viewBox="0 0 24 24"><path d="M5 19c4-1 3-6 7-7s3-6 7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="5" cy="19" r="2" fill="currentColor"/><circle cx="19" cy="5" r="2" fill="currentColor"/></svg>',
  eye:'<svg viewBox="0 0 24 24"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>',
  share:'<svg viewBox="0 0 24 24"><circle cx="6" cy="12" r="2.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="18" cy="6" r="2.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="18" cy="18" r="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8.2 10.9l7.6-3.8M8.2 13.1l7.6 3.8" stroke="currentColor" stroke-width="2"/></svg>',
  plus:'<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  focus:'<svg viewBox="0 0 24 24"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  edit:'<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  phone:'<svg viewBox="0 0 24 24"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  search:'<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15.5 15.5L21 21" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  pano:'<svg viewBox="0 0 24 24"><circle cx="12" cy="7" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 21v-4a5 5 0 0 1 10 0v4" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  camera:'<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  cctv:'<svg viewBox="0 0 24 24"><path d="M3 7l13 4-2 5-12-4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M16 11l4 1-1 3-4-1M6 13l-1 6H2" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  target:'<svg viewBox="0 0 24 24"><path d="M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  arrow:'<svg viewBox="0 0 24 24"><path d="M12 2l7 19-7-5-7 5z" fill="currentColor"/></svg>',
  waze:'<svg viewBox="0 0 24 24"><path d="M5 15a7 7 0 1 1 14-2c0 3-2 5-5 5H9l-3 2v-3c-1-1-1-1-1-2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="10" cy="11" r="1" fill="currentColor"/><circle cx="15" cy="11" r="1" fill="currentColor"/></svg>',
  bell:'<svg viewBox="0 0 24 24"><path d="M6 17V11a6 6 0 0 1 12 0v6l2 2H4zM10 21h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  heat:'<svg viewBox="0 0 24 24"><path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-7 2 1 3 3 3 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>'
};

/* ---------- Categorías ---------- */
const GROUP_COLOR={comida:'#E8590C',comercio:'#2F9E44',salud:'#E03131',educacion:'#1971C2',finanzas:'#0C8599',seguridad:'#364FC7',religion:'#9C36B5',
  transporte:'#5C677D',recreacion:'#66A80F',oficinas:'#7048E8',edificios:'#A47148',otros:'#868E96',critico:'#C92A2A'};
const GROUP_NAME=Object.assign({},OSM.groups,{critico:'Puntos críticos'});
const CATS=[
  ['negocio','Negocio / tienda','comercio'],['local','Local comercial','comercio'],['empresa','Empresa / oficina','oficinas'],
  ['residencia','Residencia / casa','edificios'],['unidad','Edificio / unidad','edificios'],['comida','Restaurante / bar','comida'],
  ['educacion','Colegio / educación','educacion'],['salud','Salud / droguería','salud'],['banco','Banco / cajero / giros','finanzas'],
  ['iglesia','Iglesia / culto','religion'],['publico','Entidad pública / JAC','seguridad'],['parque','Parque / cancha','recreacion'],
  ['transporte','Parqueadero / taller / EDS','transporte'],['critico','Punto crítico','critico'],['camara','Cámara de seguridad','seguridad'],
  ['luminaria','Luminaria dañada / poca luz','critico'],['policia','CAI / sede policial','seguridad'],['otro','Otro','otros']
].map(([k,l,g])=>({k,l,g}));
const CAT=Object.fromEntries(CATS.map(c=>[c.k,c]));
const ZONE_CATS=[['critico','Zona crítica'],['riesgo','Zona de riesgo'],['oscura','Zona oscura / sin alumbrado'],['sector','Sector / manzana'],['comercial','Zona comercial'],['otro','Otra']];
const ZONE_COLOR={critico:'#C92A2A',riesgo:'#E8590C',oscura:'#343A40',sector:'#1971C2',comercial:'#2F9E44',otro:'#7048E8'};
const ALERT_ZONES=['critico','riesgo','oscura'];
const CAM_TIPOS=['PTZ','Fija','LPR (placas)','Multisensor','Privada / comercio','Otra'];
const CAM_ST={ok:{l:'Operativa',c:'#2F9E44'},falla:{l:'Con fallas',c:'#F08C00'},fuera:{l:'Fuera de servicio',c:'#E03131'},nd:{l:'Sin dato',c:'#868E96'}};
const CAM_SRC={sies:'Policía (SIES-M)',metro:'Metro de Medellín',fdt:'Fotodetección',mov:'Movilidad (SIMM)',kml:'Mi KML',rec:'Registrada por mí'};
const CAM_RING={sies:'#FFFFFF',metro:'#1971C2',fdt:'#7048E8',mov:'#0C8599',kml:'#FFD43B',rec:'#FFD43B'};
const DOW=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const VIA_TYPES=[['calle','Calle'],['carrera','Carrera'],['diagonal','Diagonal'],['transversal','Transversal'],['circular','Circular'],['avenida','Avenida'],['pasaje','Pasaje / sendero'],['otro','Otra']];
const KIND_NAME={lugar:'Lugar',via:'Vía',zona:'Zona'};

/* ---------- Almacenamiento (IndexedDB con respaldo en localStorage) ---------- */
const Store={
  db:null,
  open(){return new Promise(res=>{try{const r=indexedDB.open('cuadrantes',1);
    r.onupgradeneeded=()=>{r.result.createObjectStore('kv');r.result.createObjectStore('photos')};
    r.onsuccess=()=>{this.db=r.result;res()};r.onerror=()=>res()}catch(e){res()}})},
  tx(s,mode,fn){return new Promise((res,rej)=>{if(!this.db)return rej(new Error('sin IndexedDB'));const t=this.db.transaction(s,mode),o=t.objectStore(s);const r=fn(o);
    t.oncomplete=()=>res(r&&r.result);t.onerror=()=>rej(t.error)})},
  async get(s,k){try{return await this.tx(s,'readonly',o=>o.get(k))}catch(e){try{const v=localStorage.getItem(s+':'+k);return v?JSON.parse(v):undefined}catch(_){return undefined}}},
  async set(s,k,v){try{await this.tx(s,'readwrite',o=>o.put(v,k));return true}catch(e){try{localStorage.setItem(s+':'+k,JSON.stringify(v));return true}catch(_){return false}}},
  async del(s,k){try{await this.tx(s,'readwrite',o=>o.delete(k))}catch(e){try{localStorage.removeItem(s+':'+k)}catch(_){}}}
};
const DEF_SETTINGS={base:'calles',alert:true,showPois:true,follow:true,assigned:[],alertZones:true,track:false,wake:false,
  layers:{cams:true,metro:false,fdt:false,mov:false,heat:false,vecinos:true,track:false},heat:{cats:[],years:[],dows:[]}};
let db={records:[],settings:JSON.parse(JSON.stringify(DEF_SETTINGS)),visits:[],camEdits:{},camKml:[],sedes:[],track:{}};
let saveT;function save(){clearTimeout(saveT);saveT=setTimeout(async()=>{if(!await Store.set('kv','db',db))toast('No se pudo guardar. Exporta un respaldo.')},250)}

/* ---------- Cuadrantes ---------- */
let base=DEFAULT_BASE, zones=[], groups=[], ix=null;
const GROUP_COLORS=['#2563EB','#D97706','#9333EA','#0891B2','#DB2777','#65A30D','#DC2626','#475569'];
function buildZones(){
  const labels=base.points.filter(p=>/^\s*\d+\s*$/.test(p.name)),gseen=[];
  zones=base.polys.map((p,i)=>{const a=p.attrs||{};
    const inside=labels.find(l=>G.inPoly(l.ll,p.rings)),num=String(a.Cuadrant_1||inside?.name||i+1).trim();
    const lab=labels.find(l=>l.name.trim()===num&&G.inPoly(l.ll,p.rings))||labels.find(l=>l.name.trim()===num);
    const group=a.EST_Y_CAI||a.ESTACION||'Zonas';if(!gseen.includes(group))gseen.push(group);
    return{id:'z'+i,num,code:a.CUADRANTE||p.name||'Zona '+num,title:a.DESCRIPCIO||p.name||'Zona '+num,group,attrs:a,rings:p.rings,
      bb:G.bboxOf(p.rings[0]),area:G.polyArea(p.rings[0]),labelPt:lab?lab.ll:G.centroid(p.rings[0])}
  }).sort((x,y)=>(parseFloat(x.num)||0)-(parseFloat(y.num)||0));
  groups=gseen.sort().map((g,i)=>({name:g,color:GROUP_COLORS[i%GROUP_COLORS.length]}));
  zones.forEach(z=>z.color=groups.find(g=>g.name===z.group).color);
}
const zoneByNum=n=>zones.find(z=>z.num===String(n));
const zoneById=id=>zones.find(z=>z.id===id);
function zoneAt(ll){for(const z of zones){const b=z.bb;if(ll[0]<b[0]||ll[0]>b[2]||ll[1]<b[1]||ll[1]>b[3])continue;if(G.inPoly(ll,z.rings))return z}return null}
function nearestZone(ll){let best=null;for(const z of zones){const r=G.nearestOnLine(ll,z.rings[0]);if(!best||r.d<best.d)best={z,d:r.d}}return best}
function recZones(r){const pts=r.kind==='zona'?[...r.latlngs,G.centroid(r.latlngs)]:r.latlngs;const s=new Set();
  for(const p of pts){const z=zoneAt(p);if(z)s.add(z.num)}return[...s].sort((a,b)=>a-b)}
function rebuildIndex(){ix=G.buildIndex(OSM.streets,db.records.filter(r=>r.kind==='via'&&r.latlngs.length>1).map(r=>({name:r.name,latlngs:r.latlngs})))}
let nx=null;
const revAddr=ll=>G.reverseOfficial(nx,ll)||G.reverse(ix,ll);
const geoAddr=q=>G.geocodeOfficial(nx,q)||G.geocode(ix,q);
function inR(ll,r){const b=r._bb||(r._bb=G.bboxOf(r));return ll[0]>=b[0]&&ll[0]<=b[2]&&ll[1]>=b[1]&&ll[1]<=b[3]&&G.inRing(ll,r)}
// Cuadrante oficial (cualquier estación del área): teléfono, CAI, estación.
function ofZoneAt(ll){for(const c of AL.cuadrantes)if(inR(ll,c.r))return c;return null}
const zInfo=z=>z._info!==undefined?z._info:(z._info=ofZoneAt(z.labelPt));
const ofTitle=c=>`Cuadrante ${c.n} · ${c.sub||c.est||c.mun||''}`.replace(/ · $/,'');
function barrioOficial(ll){for(const b of AL.barrios)if(inR(ll,b.r))return b.n;return''}
function barrioAt(ll,z){const bo=barrioOficial(ll);if(bo)return bo;let best=null;for(const[n,la,lo]of OSM.nb){const d=G.dist(ll,[la,lo]);if(!best||d<best.d)best={n,d}}
  const zb=z&&OSM.barrios[z.num];if(zb&&zb.en.length&&best&&!zb.en.includes(best.n)){ // preferir barrios del mismo cuadrante
    let b2=null;for(const[n,la,lo]of OSM.nb){if(!zb.en.includes(n))continue;const d=G.dist(ll,[la,lo]);if(!b2||d<b2.d)b2={n,d}}if(b2&&b2.d<best.d*2.5)best=b2}
  return best?best.n:''}

/* ---------- Lugares (OSM + registros propios) ---------- */
const osmPois=OSM.pois.map((p,i)=>({id:'o'+i,src:'osm',name:p.n||p.l,label:p.l,g:p.g,ll:p.ll,z:p.z,addr:p.a||'',tel:p.tel||'',h:p.h||'',w:p.w||''}));
function places(){
  const replaced=new Set(db.records.filter(r=>r.osmRef).map(r=>r.osmRef));
  const mine=db.records.filter(r=>r.kind==='lugar').map(r=>({id:r.id,src:'mine',name:r.name||CAT[r.cat]?.l||'Lugar',label:CAT[r.cat]?.l||'Lugar',g:CAT[r.cat]?.g||'otros',ll:r.latlngs[0],z:recZones(r)[0]||null,addr:r.addr||'',tel:r.tel||'',rec:r}));
  return[...mine,...osmPois.filter(p=>!replaced.has(p.id))];
}
const placeById=id=>places().find(p=>p.id===id);

/* ---------- Cámaras: Alcaldía (SIES-M, Metro, fotodetección, movilidad) + mi KML + registradas ---------- */
function stOf(e){e=norm(e);if(!e)return'nd';if(/buen|operando|operativa|^ok$/.test(e))return'ok';
  if(/latencia|pixel|linea de vista|interfer|definir|mala|falla/.test(e))return'falla';
  if(/sin video|sin energia|retir|siniestro|baja|no disp|no ha|no funciona|fuera|apagad/.test(e))return'fuera';return'nd'}
const camDigits=s=>{const m=String(s||'').match(/(\d+)/);return m?String(+m[1]):''};
let camsCache=null;
function cams(){
  if(camsCache)return camsCache;
  const T=AL.camTipos,E=AL.camEstados,list=[],byDig=new Map();
  for(const[n,dir,ti,ei,inst,bar,la,lo,z]of AL.cams){
    const o={id:'s:'+n,src:'sies',num:n,dir,tipo:(T[ti]||'').replace(/^Camaras\s*/i,'')||'Cámara',estOf:E[ei]||'',inst,barrio:bar,ll:[la,lo],z:z||null};
    list.push(o);const d=camDigits(n);(byDig.get(d)||byDig.set(d,[]).get(d)).push(o)}
  AL.metro.forEach(m=>list.push({id:'m:'+m[0],src:'metro',num:m[0],dir:m[1],estOf:m[2],tipo:'Cámara del Metro',ubic:m[3],ll:[m[4],m[5]]}));
  AL.fdt.forEach((f,i)=>list.push({id:'f:'+i,src:'fdt',num:'FDT',name:f[0],dir:f[1],sentido:f[2],estOf:f[3],vel:f[4],tipo:'Fotodetección',ll:[f[5],f[6]]}));
  AL.mov.forEach((m,i)=>list.push({id:'v:'+i,src:'mov',num:'CCTV',name:m[0],dir:m[1],foto:m[2],tipo:'Cámara de movilidad',estOf:'',ll:[m[3],m[4]]}));
  for(const k of db.camKml){ // se cruzan por número con las oficiales (a menos de 250 m)
    const cand=(byDig.get(camDigits(k.num))||[]).map(o=>({o,d:G.dist(o.ll,k.ll)})).filter(x=>x.d<250).sort((a,b)=>a.d-b.d);
    if(k.num&&cand[0]&&!cand[0].o.mine){cand[0].o.mine=k;cand[0].o.mineD=cand[0].d}
    else list.push({id:'k:'+k.id,src:'kml',num:k.num?'CAM '+k.num:'',name:k.name,dir:'',estOf:'',tipo:'Cámara (mi KML)',ll:k.ll,mine:k})}
  for(const r of db.records)if(r.kind==='lugar'&&r.cat==='camara')
    list.push({id:'r:'+r.id,src:'rec',num:r.camNum||'',name:r.name,dir:r.addr||'',estOf:r.camEstado||'',tipo:r.camTipo||'Cámara registrada',ll:r.latlngs[0],rec:r});
  for(const c of list){if(c.z===undefined||c.z===null){const z=zoneAt(c.ll);c.z=z?z.num:null}
    const ed=db.camEdits[c.id];c.stOf=stOf(c.estOf);c.st=ed&&ed.st?ed.st:c.mine&&c.mine.st?c.mine.st:c.stOf;c.note=(ed&&ed.note)||''}
  return camsCache=list;
}
const invalidateCams=()=>{camsCache=null};
const camById=id=>cams().find(c=>c.id===id);
const camTitle=c=>c.src==='sies'?`Cámara ${c.num}`:c.src==='metro'?`Cámara Metro ${c.num}`:c.src==='fdt'?`Fotodetección ${c.name}`:c.src==='mov'?`Movilidad · ${c.name}`:(c.name||'Cámara');
const camLayerOn=c=>{const Ly=db.settings.layers;return c.src==='metro'?Ly.metro:c.src==='fdt'?Ly.fdt:c.src==='mov'?Ly.mov:Ly.cams};
function camsNear(ll,r=200,all){return cams().filter(c=>all||camLayerOn(c)||c.src==='sies').map(c=>({c,d:G.dist(ll,c.ll)})).filter(x=>x.d<=r).sort((a,b)=>a.d-b.d)}
function camRow(c,meta){const st=CAM_ST[c.st];
  return`<button class="li" data-a="cam" data-id="${esc(c.id)}"><span class="pin" style="--c:${st.c};box-shadow:0 0 0 2px ${CAM_RING[c.src]==='#FFFFFF'?'var(--line)':CAM_RING[c.src]}">${ICON.cctv.replace('<svg','<svg style="width:16px;height:16px"')}</span>
  <span style="min-width:0"><span class="t">${esc(camTitle(c))}${c.mine?'<span class="tag mine">Mi KML</span>':''}</span><span class="s" style="display:block">${esc(c.st==='nd'&&c.estOf?c.estOf:st.l)} · ${esc(c.tipo)}${c.dir?' · '+esc(c.dir):''}</span></span>
  <span class="m">${meta||''}</span></button>`}
// Sedes policiales: las de mi KML + las de OpenStreetMap.
function sedes(){const s=db.sedes.map(x=>({name:x.name,ll:x.ll,src:'kml'}));
  osmPois.filter(p=>p.label==='Policía'&&!/inspecci|comisar/i.test(p.name)).forEach(p=>{if(!s.some(x=>G.dist(x.ll,p.ll)<80))s.push({name:p.name,ll:p.ll,src:'osm'})});
  db.records.filter(r=>r.kind==='lugar'&&r.cat==='policia').forEach(r=>s.push({name:r.name,ll:r.latlngs[0],src:'rec'}));return s}
function nearestSede(ll){let b=null;for(const x of sedes()){const d=G.dist(ll,x.ll);if(!b||d<b.d)b={...x,d}}return b}

/* ---------- Delitos (SISC 2015–2017 + importados) ---------- */
let delImp=[];
function delAll(){return delImp.length?AL.delitos.concat(delImp):AL.delitos}
const ymdDate=n=>new Date(Date.UTC(Math.floor(n/1e4),Math.floor(n/100)%100-1,n%100));
const delYear=d=>Math.floor(d[4]/1e4);
const delDow=d=>d[4]?ymdDate(d[4]).getUTCDay():-1;
function delFilter(d){const h=db.settings.heat;return(!h.cats.length||h.cats.includes(d[2]))&&(!h.years.length||h.years.includes(delYear(d)))&&(!h.dows.length||h.dows.includes(delDow(d)))}
let delYears=null;const years=()=>delYears||(delYears=[...new Set(delAll().map(delYear))].filter(Boolean).sort());

/* ---------- Mapa ---------- */
const map=L.map('map',{zoomControl:false,attributionControl:true,tap:true}).setView([6.225,-75.605],14);
L.control.scale({imperial:false,position:'bottomleft'}).addTo(map);
const canvas=L.canvas({padding:.3});
const BASES={
  calles:{n:'Calles (Esri)',u:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',a:'Mapa © Esri',max:19},
  osm:{n:'OpenStreetMap',u:'https://tile.openstreetmap.org/{z}/{x}/{y}.png',a:'© OpenStreetMap',max:19},
  satelite:{n:'Satélite (Esri)',u:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',a:'Imágenes © Esri',max:19}
};
let tileCache=null;
const CachedTiles=L.TileLayer.extend({createTile(coords,done){
  const img=document.createElement('img');img.alt='';img.setAttribute('role','presentation');const url=this.getTileUrl(coords);
  if(!tileCache){img.onload=()=>done(null,img);img.onerror=e=>done(e,img);img.src=url;return img}
  tileCache.match(url).then(r=>r||fetch(url,{mode:'cors'}).then(res=>{if(res.ok)tileCache.put(url,res.clone());return res}))
    .then(r=>r.blob()).then(b=>{const u=URL.createObjectURL(b);img.onload=()=>{URL.revokeObjectURL(u);done(null,img)};img.onerror=e=>done(e,img);img.src=u})
    .catch(e=>done(e,img));
  return img}});
let tiles=null;
function setBase(k){if(!BASES[k])k='calles';if(tiles)map.removeLayer(tiles);const b=BASES[k];
  tiles=new CachedTiles(b.u,{maxZoom:20,maxNativeZoom:b.max,attribution:b.a+' · Datos © OpenStreetMap'}).addTo(map);tiles.bringToBack()}
const vecLayer=L.layerGroup().addTo(map);
const zoneLayer=L.featureGroup().addTo(map),labelLayer=L.layerGroup().addTo(map),trackLayer=L.layerGroup().addTo(map),recLayer=L.layerGroup().addTo(map),
  poiLayer=L.layerGroup().addTo(map),camLayer=L.layerGroup().addTo(map),hiLayer=L.layerGroup().addTo(map),guideLayer=L.layerGroup().addTo(map),drawLayer=L.layerGroup().addTo(map),meLayer=L.layerGroup().addTo(map);
let heatLayer=null;

function renderZonesMap(){
  zoneLayer.clearLayers();labelLayer.clearLayers();
  for(const z of zones){
    z.layer=L.polygon(z.rings,{color:z.color,weight:1.8,fillColor:z.color,fillOpacity:.1}).addTo(zoneLayer);
    z.layer.on('click',()=>{if(!pick)openZone(z.id,false)});
    L.marker(z.labelPt,{interactive:false,keyboard:false,icon:L.divIcon({className:'zlabel',iconSize:null,html:`<span style="--c:${z.color}">${esc(z.num)}</span>`})}).addTo(labelLayer);
  }
  styleZones();
}
function styleZones(){const cur=gps.zone&&gps.zone.id,sel=ui.zoneId;
  for(const z of zones){const on=z.id===sel,me=z.id===cur;z.layer.setStyle({weight:on?3.6:me?3:1.8,fillOpacity:on?.26:me?.18:.1,dashArray:me&&!on?'7 5':null});if(on)z.layer.bringToFront()}}
map.on('zoomend',()=>{map.getContainer().classList.toggle('zoom-low',map.getZoom()<14);renderPois();renderCams()});
map.on('moveend',()=>{renderPois();renderCams()});
// Mantener presionado el mapa: ver qué hay en ese punto (cuadrante, dirección, cámaras cercanas).
map.on('contextmenu',e=>{if(pick)return;showPoint([e.latlng.lat,e.latlng.lng],'Punto en el mapa')});

function renderCams(){
  camLayer.clearLayers();const zm=map.getZoom();if(zm<15)return;
  const b=map.getBounds().pad(.1),r=zm>=17?7:zm>=16?5.5:4.5;
  for(const c of cams()){if(!camLayerOn(c)||!b.contains(c.ll))continue;
    const st=CAM_ST[c.st],ring=CAM_RING[c.src];
    L.circleMarker(c.ll,{renderer:canvas,radius:c.mine||c.src==='rec'?r+1.5:r,color:ring,weight:c.src==='sies'?1.5:2.5,fillColor:st.c,fillOpacity:.95})
      .bindTooltip(`<b>${esc(camTitle(c))}</b><br>${esc(st.l)} · ${esc(c.tipo)}`,{className:'tip',direction:'top'})
      .on('click',e=>{if(pick)return;L.DomEvent.stopPropagation(e);openCam(c.id)}).addTo(camLayer)}
}
function renderHeat(){
  if(heatLayer){map.removeLayer(heatLayer);heatLayer=null}
  if(!db.settings.layers.heat||!L.heatLayer)return;
  const pts=[];for(const d of delAll())if(delFilter(d))pts.push([d[0],d[1],1]);
  heatLayer=L.heatLayer(pts,{radius:15,blur:18,minOpacity:.35,maxZoom:16,max:Math.max(4,pts.length/2500),
    gradient:{.2:'#2c7bb6',.4:'#abd9e9',.6:'#ffffbf',.8:'#fdae61',1:'#d7191c'}}).addTo(map);
}
function renderVecinos(){
  vecLayer.clearLayers();if(!db.settings.layers.vecinos)return;
  const mine=new Set(zones.map(z=>zInfo(z)).filter(Boolean));
  for(const c of AL.cuadrantes){if(mine.has(c))continue;
    L.polygon(c.r,{color:'#868E96',weight:1,dashArray:'4 4',fillOpacity:.03,interactive:true})
      .bindTooltip(`<b>${esc(ofTitle(c))}</b><br>${esc(c.cai||'')}${c.tel?' · '+esc(c.tel):''}`,{className:'tip',sticky:true})
      .on('click',e=>{if(pick)return;showPoint([e.latlng.lat,e.latlng.lng],ofTitle(c))}).addTo(vecLayer)}
}
function renderTrack(){
  trackLayer.clearLayers();if(!db.settings.layers.track)return;
  const t=db.track[todayKey()]||[];if(t.length>1)L.polyline(t.map(p=>[p[0],p[1]]),{color:'#1D6FE0',weight:4,opacity:.7,interactive:false}).addTo(trackLayer);
}

function renderPois(){
  poiLayer.clearLayers();if(!db.settings.showPois||map.getZoom()<16)return;
  const b=map.getBounds().pad(.1);
  for(const p of places()){if(!b.contains(p.ll))continue;
    const c=GROUP_COLOR[p.g]||GROUP_COLOR.otros,mine=p.src==='mine';
    L.circleMarker(p.ll,{renderer:canvas,radius:mine?8:6,color:mine?'#fff':c,weight:mine?2.5:1.5,fillColor:c,fillOpacity:mine?1:.85})
      .bindTooltip(`<b>${esc(p.name)}</b><br>${esc(p.label)}`,{className:'tip',direction:'top'})
      .on('click',e=>{if(pick)return;L.DomEvent.stopPropagation(e);openPlace(p.id)}).addTo(poiLayer)}
}
function renderRecordsMap(){
  recLayer.clearLayers();
  for(const r of db.records){if(r.kind==='lugar')continue;
    const sel=ui.place===r.id;
    const l=r.kind==='via'?L.polyline(r.latlngs,{color:'#0E6B47',weight:sel?7:5,opacity:.9,lineCap:'round'})
      :L.polygon(r.latlngs,{color:ZONE_COLOR[r.cat]||'#C92A2A',weight:sel?4:2.5,fillColor:ZONE_COLOR[r.cat]||'#C92A2A',fillOpacity:r.cat==='oscura'?.35:.2,dashArray:'6 4'});
    l.bindTooltip(`<b>${esc(r.name)}</b><br>${KIND_NAME[r.kind]} registrada`,{className:'tip',sticky:true}).on('click',e=>{if(pick)return;L.DomEvent.stopPropagation(e);openRecord(r.id)}).addTo(recLayer)}
}
const todayKey=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
function fitAll(){map.fitBounds(zoneLayer.getBounds(),{paddingTopLeft:[10,90],paddingBottomRight:[10,sheetPad()]})}
function sheetPad(){const s=$('#sheet');return s.dataset.state==='closed'?20:s.getBoundingClientRect().height+20}
function flyTo(bounds,maxZoom=17){map.fitBounds(bounds,{paddingTopLeft:[16,96],paddingBottomRight:[16,sheetPad()],maxZoom})}
function flyToPoint(ll,z=18){flyTo(L.latLngBounds([ll,ll]),z)}
function highlight(fn){hiLayer.clearLayers();if(fn)fn(hiLayer)}

/* ---------- GPS ---------- */
const gps={on:false,ll:null,acc:null,t:0,zone:null,ofz:null,addr:null,barrio:'',watch:null,err:'',outAssigned:undefined,inZones:new Set(),near:{},alarm:null};
let meMarker=null,accCircle=null,lastRevT=0,lastRevLL=null;
async function startGps(){
  // Se usa el GPS del WebView: funciona con o sin Google Play Services (Huawei, etc.).
  // Capacitor pide el permiso de ubicación de Android la primera vez.
  if(gps.on)return;gps.err='';
  if(!navigator.geolocation){gps.err='Este dispositivo no tiene GPS disponible.';renderGps();return}
  try{gps.watch=navigator.geolocation.watchPosition(onPos,onGpsErr,{enableHighAccuracy:true,timeout:30000,maximumAge:3000});gps.on=true;renderGps()}
  catch(e){onGpsErr(e)}
}
function onGpsErr(e){gps.err=e&&e.code===1?'Permiso de ubicación negado. Actívalo en Ajustes → Apps → Cuadrantes Belén → Permisos.':e&&e.code===3?'Buscando señal GPS… sal a cielo abierto.':'No se pudo leer el GPS. ¿Está activada la ubicación del celular?';
  if(e&&e.code===1){gps.on=false;try{navigator.geolocation.clearWatch(gps.watch)}catch(_){}}renderGps()}
function onPos(pos){
  const ll=[pos.coords.latitude,pos.coords.longitude];gps.ll=ll;gps.acc=pos.coords.accuracy;gps.t=Date.now();gps.err='';
  const z=zoneAt(ll),prev=gps.zone;gps.zone=z;gps.ofz=z?zInfo(z):ofZoneAt(ll);
  if(z&&(!prev||prev.id!==z.id)){
    if(prev||db.visits.length===0){if(db.settings.alert){haptic();toast(`Entraste al cuadrante ${z.num}`)}}
    db.visits.unshift({z:z.num,t:Date.now()});db.visits=db.visits.slice(0,50);save();
  }else if(!z&&prev&&db.settings.alert){haptic();toast(gps.ofz?'Saliste de Belén: '+ofTitle(gps.ofz):'Saliste de los cuadrantes de Belén')}
  checkAlerts(ll,z);recordTrack(ll,pos.coords.accuracy,z);
  if(!lastRevLL||G.dist(lastRevLL,ll)>12||Date.now()-lastRevT>15000){gps.addr=revAddr(ll);gps.barrio=barrioAt(ll,z);lastRevLL=ll;lastRevT=Date.now()}
  if(!meMarker){meMarker=L.marker(ll,{interactive:false,keyboard:false,zIndexOffset:1000,icon:L.divIcon({className:'me',iconSize:null,html:'<span></span>'})}).addTo(meLayer);
    accCircle=L.circle(ll,{radius:gps.acc,color:'#1D6FE0',weight:1,fillColor:'#1D6FE0',fillOpacity:.12,interactive:false}).addTo(meLayer);
    if(db.settings.follow)map.setView(ll,Math.max(map.getZoom(),17))}
  else{meMarker.setLatLng(ll);accCircle.setLatLng(ll).setRadius(gps.acc)}
  if(db.settings.follow&&!pick&&ui.view!=='zone'&&ui.view!=='place')map.panTo(ll,{animate:true});
  if(prev!==z)styleZones();
  renderGps();renderGuide();if(ui.view==='aqui'&&sheetOpen()&&!document.activeElement.matches('input,textarea'))renderView();
}
setInterval(()=>{if(gps.on&&gps.t&&Date.now()-gps.t>30000)renderGps()},10000);
function renderGps(){
  const c=$('#gpsCard'),z=gps.zone,stale=gps.t&&Date.now()-gps.t>30000;
  c.classList.toggle('off',!gps.ll);c.classList.toggle('stale',!!stale);
  if(!gps.ll){c.innerHTML=`<span class="znum">?</span><span style="min-width:0"><span class="l1" style="display:block">${gps.on?'Buscando GPS…':'Activa el GPS'}</span><span class="l3" style="display:block">${esc(gps.err||(gps.on?'Sal a cielo abierto si tarda':'Toca para saber en qué cuadrante estás'))}</span></span>`;return}
  const nz=!z?nearestZone(gps.ll):null,of=gps.ofz,out=db.settings.assigned.length&&gps.outAssigned;
  c.classList.toggle('alert',!!out);
  c.innerHTML=`<span class="znum" style="--c:${z?z.color:'#868E96'}">${z?esc(z.num):of?esc(of.n):'—'}</span><span style="min-width:0">
    <span class="l1" style="display:block">${z?'Cuadrante '+esc(z.num)+' · '+esc(shortGroup(z.group)):of?esc(ofTitle(of)):'Fuera de Belén'}</span>
    ${out?`<span class="l3 warn" style="display:block">Fuera de tu cuadrante asignado (${esc(db.settings.assigned.join(', '))})</span>`:''}
    <span class="l2" style="display:block">${esc(gps.addr?.text||'Sin dirección cercana')}${gps.barrio?' · '+esc(gps.barrio):''}</span>
    <span class="l3" style="display:block"><span class="pulse"></span>${stale?'Última señal hace '+Math.round((Date.now()-gps.t)/60000||1)+' min':'± '+Math.round(gps.acc)+' m'}${nz?' · Cuadrante '+nz.z.num+' a '+fmtLen(nz.d):''}</span></span>`;
}
const shortGroup=g=>g.replace(/^ESTACION\s+/i,'Est. ').replace(/^SUB\s+/i,'Sub. ');

/* ---------- Alertas ---------- */
function alarm(msg){gps.alarm={msg,t:Date.now()};
  try{if(P.Haptics){P.Haptics.vibrate({duration:500});setTimeout(()=>P.Haptics.vibrate({duration:500}),700)}else if(navigator.vibrate)navigator.vibrate([450,200,450])}catch(e){}
  toast(msg)}
function checkAlerts(ll,z){
  const S=db.settings;
  if(S.assigned.length){const inside=!!(z&&S.assigned.includes(z.num));
    if(gps.outAssigned===undefined)gps.outAssigned=!inside;
    else if(!inside&&!gps.outAssigned){gps.outAssigned=true;alarm(`Saliste de tu cuadrante asignado${z?' · estás en el '+z.num:''}`)}
    else if(inside&&gps.outAssigned){gps.outAssigned=false;haptic();toast('De vuelta en tu cuadrante '+z.num)}}
  else gps.outAssigned=undefined;
  if(!S.alertZones)return;
  for(const r of db.records){
    if(r.kind==='zona'&&ALERT_ZONES.includes(r.cat)&&r.latlngs.length>2){const inside=G.inRing(ll,r.latlngs);
      if(inside&&!gps.inZones.has(r.id)){gps.inZones.add(r.id);alarm(`Entraste a ${ZONE_CATS.find(x=>x[0]===r.cat)[1].toLowerCase()}: ${r.name}`)}
      else if(!inside)gps.inZones.delete(r.id)}
    else if(r.kind==='lugar'&&(r.cat==='critico'||r.cat==='luminaria')){const d=G.dist(ll,r.latlngs[0]),last=gps.near[r.id]||0;
      if(d<60&&Date.now()-last>15*60000){gps.near[r.id]=Date.now();alarm(`A ${Math.round(d)} m de ${r.cat==='critico'?'punto crítico':'luminaria dañada'}: ${r.name}`)}}}
}

/* ---------- Guiar hasta un destino ---------- */
let target=null;
const bearing=(a,b)=>{const f1=a[0]*Math.PI/180,f2=b[0]*Math.PI/180,dl=(b[1]-a[1])*Math.PI/180;
  return(Math.atan2(Math.sin(dl)*Math.cos(f2),Math.cos(f1)*Math.sin(f2)-Math.sin(f1)*Math.cos(f2)*Math.cos(dl))*180/Math.PI+360)%360};
const cardinal=d=>['norte','nororiente','oriente','suroriente','sur','suroccidente','occidente','noroccidente'][Math.round(d/45)%8];
function setTarget(ll,label){target={ll,label};if(!gps.on)startGps();renderGuide();toast('Guiando a '+label);
  if(gps.ll)flyTo(L.latLngBounds([gps.ll,ll]),18)}
function clearTarget(){target=null;renderGuide()}
function renderGuide(){
  const g=$('#guide');guideLayer.clearLayers();
  if(!target){g.hidden=true;return}
  L.marker(target.ll,{interactive:false,icon:L.divIcon({className:'vtx',iconSize:null,html:'<span style="border-color:#E03131;width:20px;height:20px"></span>'})}).addTo(guideLayer);
  let txt='Activa el GPS para guiarte',rot=0;
  if(gps.ll){const d=G.dist(gps.ll,target.ll),br=bearing(gps.ll,target.ll);rot=br;
    L.polyline([gps.ll,target.ll],{color:'#E03131',weight:3,dashArray:'6 6',interactive:false}).addTo(guideLayer);
    txt=`${fmtLen(d)} al ${cardinal(br)}`;
    if(d<25){const l=target.label;target=null;g.hidden=true;guideLayer.clearLayers();alarm('Llegaste a '+l);return}}
  g.innerHTML=`<span class="arrow" style="transform:rotate(${rot}deg)">${ICON.arrow}</span><span class="gt"><span class="gd" style="display:block">${esc(txt)}</span><span class="gl" style="display:block">${esc(target.label)}</span></span>
    <button data-g="maps" aria-label="Abrir en Google Maps">${ICON.gmaps}</button><button data-g="x" aria-label="Dejar de guiar">${ICON.close}</button>`;
  g.hidden=false;g.style.top=Math.round($('#gpsCard').getBoundingClientRect().bottom+8)+'px';
}
$('#guide').addEventListener('click',e=>{const a=e.target.closest('[data-g]')?.dataset.g;if(!target)return;
  if(a==='x')clearTarget();else if(a==='maps')openUrl(gdir(target.ll));else flyTo(L.latLngBounds(gps.ll?[gps.ll,target.ll]:[target.ll,target.ll]),18)});

/* ---------- Recorrido (bitácora de patrullaje) ---------- */
function recordTrack(ll,acc,z){
  if(!db.settings.track||acc>80)return;const k=todayKey(),t=db.track[k]||(db.track[k]=[]),last=t[t.length-1],now=Date.now();
  if(last&&G.dist([last[0],last[1]],ll)<25&&now-last[2]<120000)return;
  t.push([+ll[0].toFixed(6),+ll[1].toFixed(6),now,z?z.num:'']);if(t.length>6000)t.splice(0,t.length-6000);
  const ks=Object.keys(db.track).sort();while(ks.length>14)delete db.track[ks.shift()];
  save();if(db.settings.layers.track)renderTrack();
}
function trackStats(k){const t=db.track[k]||[];let km=0;const per={};
  for(let i=1;i<t.length;i++){const d=G.dist(t[i-1],t[i]),dt=t[i][2]-t[i-1][2];km+=d;if(dt<15*60000){const z=t[i-1][3]||'fuera';per[z]=(per[z]||0)+dt}}
  return{n:t.length,m:km,per,start:t[0]&&t[0][2],end:t.length&&t[t.length-1][2]}}
const fmtDur=ms=>{const m=Math.round(ms/60000);return m<60?m+' min':Math.floor(m/60)+' h '+(m%60)+' min'};

/* ---------- Utilidades nativas ---------- */
let toastT;function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('on'),3400)}
function haptic(){try{if(P.Haptics)P.Haptics.vibrate({duration:350});else if(navigator.vibrate)navigator.vibrate(300)}catch(e){}}
function openUrl(url){if(NATIVE){location.href=url}else window.open(url,'_blank','noopener')}
const gmaps=ll=>`https://www.google.com/maps/search/?api=1&query=${ll[0]},${ll[1]}`;
const gdir=ll=>`https://www.google.com/maps/dir/?api=1&destination=${ll[0]},${ll[1]}&travelmode=driving`;
const gpano=ll=>`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${ll[0]},${ll[1]}`;
const waze=ll=>`https://waze.com/ul?ll=${ll[0]},${ll[1]}&navigate=yes`;
const osmUrl=ll=>`https://www.openstreetmap.org/?mlat=${ll[0]}&mlon=${ll[1]}#map=18/${ll[0]}/${ll[1]}`;
async function shareText(title,text){
  try{if(P.Share){await P.Share.share({title,text,dialogTitle:title});return}if(navigator.share){await navigator.share({title,text});return}}catch(e){if(/cancel/i.test(e.message||''))return}
  copyText(text,'Copiado. Pégalo en WhatsApp o donde necesites.')}
function copyText(text,msg){const fb=()=>{const ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();
  try{document.execCommand('copy');toast(msg)}catch(e){toast('No se pudo copiar')}ta.remove()};
  try{navigator.clipboard.writeText(text).then(()=>toast(msg),fb)}catch(e){fb()}}
async function saveFile(name,text,mime){
  if(NATIVE&&P.Filesystem&&P.Share){
    try{const r=await P.Filesystem.writeFile({path:name,data:text,directory:'CACHE',encoding:'utf8'});
      await P.Share.share({title:name,files:[r.uri],dialogTitle:'Guardar o enviar '+name});return}
    catch(e){if(/cancel/i.test(e.message||''))return;toast('No se pudo exportar: '+(e.message||e));return}
  }
  try{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:mime}));a.download=name;document.body.appendChild(a);a.click();
    setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1500);toast('Descargando '+name)}catch(e){copyText(text,'Copiado al portapapeles')}
}

/* ---------- Panel y navegación ---------- */
const ui={cam:null,point:null,zCamSt:'',view:null,stack:[],zoneId:null,zTab:'resumen',zq:'',zGroups:new Set(),zPlaceG:null,zPlaceQ:'',limit:80,q:'',search:null,place:null,regFilter:'todos',regQ:'',regProj:'',confirm:null};
const sheet=$('#sheet');
const sheetOpen=()=>sheet.dataset.state!=='closed';
function setSheet(st){sheet.dataset.state=st;document.body.classList.toggle('sheet-open',st!=='closed');
  document.querySelectorAll('#nav button').forEach(b=>b.setAttribute('aria-current',String(st!=='closed'&&navRoot(ui.view)===b.dataset.nav)));setTimeout(()=>map.invalidateSize(),240)}
const navRoot=v=>({zone:'cuadrantes',place:'cuadrantes',cam:'cuadrantes',punto:'buscar',capas:'mas'})[v]||v;
function go(view,opts={}){
  if(opts.push&&ui.view)ui.stack.push({view:ui.view,zoneId:ui.zoneId,place:ui.place,cam:ui.cam,point:ui.point,zTab:ui.zTab});
  if(!opts.push)ui.stack=[];
  ui.view=view;ui.confirm=null;renderView();if(!sheetOpen())setSheet('half');else setSheet(sheet.dataset.state);
  $('#sheetBody').scrollTop=0;
}
function goBack(){const s=ui.stack.pop();if(!s){setSheet('closed');return}Object.assign(ui,s);if(!['place','cam','punto'].includes(ui.view))highlight(null);renderView();renderRecordsMap()}
$('#grab').addEventListener('click',()=>setSheet(sheet.dataset.state==='full'?'half':'full'));
(function(){let y0=null,h0=0;const g=$('#grab');
  g.addEventListener('touchstart',e=>{y0=e.touches[0].clientY;h0=sheet.getBoundingClientRect().height;sheet.style.transition='none'},{passive:true});
  g.addEventListener('touchmove',e=>{if(y0==null)return;const h=Math.max(80,h0+(y0-e.touches[0].clientY));sheet.style.height=h+'px'},{passive:true});
  g.addEventListener('touchend',e=>{if(y0==null)return;const dy=y0-e.changedTouches[0].clientY;sheet.style.transition='';sheet.style.height='';y0=null;
    if(Math.abs(dy)<8)return;const vh=window.innerHeight;
    if(dy>0)setSheet(h0+dy>vh*.62?'full':'half');else setSheet(h0+dy<vh*.32?'closed':'half')});
})();
document.querySelectorAll('#nav button').forEach(b=>b.addEventListener('click',()=>{
  const v=b.dataset.nav;if(sheetOpen()&&navRoot(ui.view)===v&&!ui.stack.length){setSheet('closed');return}
  if(v==='cuadrantes'&&ui.view==='zone'&&sheetOpen()){ui.stack=[];go('cuadrantes');return}
  go(v)}));
$('#gpsCard').addEventListener('click',()=>{if(!gps.on)startGps();go('aqui')});
$('#btnLocate').addEventListener('click',()=>{if(!gps.on){startGps();db.settings.follow=true}else if(gps.ll){db.settings.follow=!db.settings.follow;if(db.settings.follow)map.setView(gps.ll,Math.max(map.getZoom(),17))}
  save();$('#btnLocate').classList.toggle('on',db.settings.follow&&gps.on);toast(db.settings.follow?'Siguiendo tu ubicación':'Mapa libre')});
$('#btnLayers').addEventListener('click',()=>{if(sheetOpen()&&ui.view==='capas'){setSheet('closed');return}go('capas')});
$('#btnFitAll').addEventListener('click',()=>{db.settings.follow=false;$('#btnLocate').classList.remove('on');fitAll()});
map.on('dragstart',()=>{if(db.settings.follow&&gps.on){db.settings.follow=false;$('#btnLocate').classList.remove('on')}});
$('#fab').addEventListener('click',()=>chooseNew());

function renderView(){
  const b=$('#sheetBody'),v=ui.view;
  b.innerHTML=v==='aqui'?viewAqui():v==='cuadrantes'?viewZones():v==='zone'?viewZone():v==='buscar'?viewSearch():v==='registros'?viewRecords():v==='mas'?viewMore():v==='place'?viewPlace():v==='cam'?viewCam():v==='punto'?viewPunto():v==='capas'?viewCapas():'';
  if(v==='buscar'){const i=$('#q');if(i&&!ui.q)setTimeout(()=>i.focus(),250)}
}
const backBtn=()=>ui.stack.length?`<button class="back" data-a="back" aria-label="Volver">${ICON.back}</button>`:'';
const closeBtn=()=>`<button class="back" data-a="close" aria-label="Cerrar">${ICON.close}</button>`;

/* ----- Vista: Aquí ----- */
function viewAqui(){
  if(!gps.ll)return`<div class="head"><h2>Mi ubicación</h2>${closeBtn()}</div>
    <div class="card"><div class="muted">${esc(gps.err||'Con el GPS activado la app te dice en qué cuadrante estás, la dirección aproximada y qué hay cerca.')}</div>
    <button class="btn primary block" data-a="gps">${gps.on?'Buscando señal…':'Activar GPS'}</button></div>${visitsHtml()}`;
  const z=gps.zone,a=gps.addr,near=places().map(p=>({p,d:G.dist(gps.ll,p.ll)})).filter(x=>x.d<400).sort((x,y)=>x.d-y.d).slice(0,25);
  return`<div class="head"><h2>Mi ubicación</h2>${closeBtn()}</div>
  <div class="card">
    <div class="hero"><span class="znum" style="--c:${z?z.color:'#868E96'}">${z?esc(z.num):'—'}</span>
      <div style="min-width:0"><div class="t1">${z?'Cuadrante '+esc(z.num):'Fuera de los cuadrantes'}</div><div class="t2">${z?esc(z.title):'Cuadrante más cercano: '+esc(nearestZone(gps.ll).z.num)}</div>
      ${z?`<div class="t2 mono">${esc(z.code)}</div>`:''}</div></div>
    <div><div class="addr-big">${esc(a?.text||'Sin calle cercana')}</div><div class="muted">${a?.official?'Placa oficial más cercana':esc((a?.between?a.between+' · ':'')+'aprox.')}${gps.barrio?' · Barrio '+esc(gps.barrio):''}</div></div>
    <div class="muted mono small">${fmtLL(gps.ll)} · ± ${Math.round(gps.acc)} m</div>
    ${db.settings.assigned.length?`<div class="${gps.outAssigned?'warn':'muted'}">${gps.outAssigned?'Fuera de':'Dentro de'} tu cuadrante asignado (${esc(db.settings.assigned.join(', '))})</div>`:''}
    <div class="actions">
      ${gps.ofz&&gps.ofz.tel?`<button class="btn" data-a="url" data-u="tel:${esc(gps.ofz.tel)}">${ICON.phone} Llamar al cuadrante</button>`:''}
      ${z?`<button class="btn" data-a="zone" data-id="${z.id}">${ICON.eye} Ver cuadrante</button>`:''}
      <button class="btn primary" data-a="new-here">${ICON.plus} Registrar aquí</button>
      <button class="btn" data-a="share-me">${ICON.share} Compartir</button>
      <button class="btn" data-a="url" data-u="${esc(gmaps(gps.ll))}">${ICON.gmaps} Google Maps</button>
    </div>
  </div>
  ${(()=>{const nc=camsNear(gps.ll,200);return`<div class="section"><span class="label">Cámaras a menos de 200 m · ${nc.length}</span>${nc.length?`<div class="list">${nc.slice(0,6).map(x=>camRow(x.c,fmtLen(x.d))).join('')}</div>${nc.length>6?`<button class="btn sm" data-a="pt-me">Ver las ${nc.length}</button>`:''}`:'<div class="empty">No hay cámaras conocidas cerca.</div>'}</div>`})()}
  ${(()=>{const sd=nearestSede(gps.ll);return sd?`<div class="section"><span class="label">Sede policial más cercana</span><button class="li" data-a="guide" data-ll="${sd.ll.join(',')}" data-t="${esc(sd.name)}"><span class="pin" style="--c:#364FC7">P</span><span style="min-width:0"><span class="t">${esc(sd.name)}</span><span class="s" style="display:block">Toca para guiarte</span></span><span class="m">${fmtLen(sd.d)}</span></button></div>`:''})()}
  ${trackHtml()}
  <div class="section"><span class="label">Cerca de ti (400 m)</span>${near.length?`<div class="list">${near.map(({p,d})=>placeRow(p,fmtLen(d))).join('')}</div>`:'<div class="empty">No hay lugares registrados cerca. Usa «Registrar aquí» para agregar.</div>'}</div>
  ${visitsHtml()}`;
}
function trackHtml(){if(!db.settings.track)return'';const t=trackStats(todayKey());
  return`<div class="section"><span class="label">Recorrido de hoy</span><div class="card"><div><b>${fmtLen(t.m)}</b> <span class="muted">· ${t.n} puntos${t.start?' · desde '+new Date(t.start).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'}):''}</span></div>
  ${Object.keys(t.per).length?bars(Object.entries(t.per).sort((a,b)=>b[1]-a[1]).map(([k,v])=>[k==='fuera'?'Fuera de Belén':'Cuadrante '+k,v]),Math.max(...Object.values(t.per)),'#1D6FE0',fmtDur):''}
  <div class="grid2"><button class="btn sm" data-a="track-show">${db.settings.layers.track?'Ocultar':'Ver'} en el mapa</button><button class="btn sm" data-a="track-exp">Exportar KML</button></div></div></div>`}
function visitsHtml(){if(!db.visits.length)return'';const seen=[];const v=db.visits.filter(x=>{if(seen.includes(x.z))return false;seen.push(x.z);return true}).slice(0,8);
  return`<div class="section"><span class="label">Cuadrantes recientes</span><div class="chips wrap">${v.map(x=>{const z=zoneByNum(x.z);return z?`<button class="chip" data-a="zone" data-id="${z.id}"><span class="dot" style="--c:${z.color}"></span>Cuadrante ${esc(z.num)} <span class="n">${new Date(x.t).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'})}</span></button>`:''}).join('')}</div></div>`}
function placeRow(p,meta){const c=GROUP_COLOR[p.g]||GROUP_COLOR.otros;
  return`<button class="li" data-a="place" data-id="${p.id}"><span class="pin" style="--c:${c}">${esc((p.label||'?')[0])}</span>
  <span style="min-width:0"><span class="t">${esc(p.name)}${p.src==='mine'?'<span class="tag mine">Mío</span>':''}</span><span class="s" style="display:block">${esc(p.label)}${p.addr?' · '+esc(p.addr):''}</span></span>
  <span class="m">${meta||''}</span></button>`}

/* ----- Vista: lista de cuadrantes ----- */
function viewZones(){
  const q=norm(ui.zq),counts={};places().forEach(p=>{if(p.z)counts[p.z]=(counts[p.z]||0)+1});
  const list=zones.filter(z=>(!ui.zGroups.size||ui.zGroups.has(z.group))&&(!q||norm([z.num,z.code,z.title,z.group,...(OSM.barrios[z.num]?.en||[])].join(' ')).includes(q)));
  return`<div class="head"><h2>Cuadrantes <span class="muted">· ${zones.length}</span></h2>${closeBtn()}</div>
  <div class="searchbox">${ICON.search}<input class="input" id="zq" type="search" value="${esc(ui.zq)}" placeholder="Número, código, estación o barrio" autocomplete="off"></div>
  ${groups.length>1?`<div class="chips">${groups.map(g=>`<button class="chip" data-a="zgroup" data-g="${esc(g.name)}" aria-pressed="${ui.zGroups.has(g.name)}"><span class="dot" style="--c:${g.color}"></span>${esc(g.name)} <span class="n">${zones.filter(z=>z.group===g.name).length}</span></button>`).join('')}</div>`:''}
  <div id="zlist">${zoneListHtml(list,counts)}</div>`;
}
function zoneListHtml(list,counts){return list.length?`<div class="list">${list.map(z=>{const br=(OSM.barrios[z.num]?.en||[]).join(', ');
  return`<button class="li" data-a="zone" data-id="${z.id}"><span class="znum" style="--c:${z.color}">${esc(z.num)}</span>
  <span style="min-width:0"><span class="t">${esc(z.title)}</span><span class="s" style="display:block">${esc(br||z.code)}</span></span>
  <span class="m">${fmtArea(z.area)}<br>${cams().filter(c=>c.z===z.num).length} cám.</span></button>`}).join('')}</div>`:'<div class="empty">Ningún cuadrante coincide.</div>'}

/* ----- Vista: detalle de cuadrante ----- */
function openZone(id,fly=true){const z=zoneById(id);if(!z)return;
  const push=sheetOpen()&&ui.view!=='zone';ui.zoneId=id;ui.zPlaceG=null;ui.zPlaceQ='';ui.limit=80;highlight(null);
  go('zone',{push});styleZones();if(fly)flyTo(z.layer.getBounds())}
function viewZone(){
  const z=zoneById(ui.zoneId);if(!z)return'';
  const t=ui.zTab;
  return`<div class="head">${backBtn()}<span class="znum" style="--c:${z.color}">${esc(z.num)}</span><h2>Cuadrante ${esc(z.num)}</h2>${closeBtn()}</div>
  <div class="tabs" role="tablist">${[['resumen','Resumen'],['camaras','Cámaras'],['delitos','Delitos'],['lugares','Lugares'],['vias','Calles'],['datos','Datos']].map(([k,l])=>`<button role="tab" data-a="ztab" data-t="${k}" aria-selected="${t===k}">${l}</button>`).join('')}</div>
  ${t==='resumen'?zoneSummary(z):t==='camaras'?zoneCams(z):t==='delitos'?zoneCrime(z):t==='lugares'?zonePlaces(z):t==='vias'?zoneStreets(z):zoneData(z)}`;
}
function zoneStreetNames(z){const s=new Set(OSM.zstreets[z.num]||[]);
  db.records.filter(r=>r.kind==='via'&&recZones(r).includes(z.num)).forEach(r=>s.add(r.name));return[...s]}
function zoneSummary(z){
  const pl=places().filter(p=>p.z===z.num),mine=db.records.filter(r=>recZones(r).includes(z.num)).length;
  const br=OSM.barrios[z.num]||{en:[],cerca:[]},rs=G.rangeSummary(zoneStreetNames(z));
  const byG={};pl.forEach(p=>byG[p.g]=(byG[p.g]||0)+1);
  return`<div class="card">
    <div><div class="hero"><div style="min-width:0"><div class="t1">${esc(z.title)}</div><div class="t2 mono">${esc(z.code)}</div><div class="t2">${esc(z.group)}${z.attrs.DISTRITO?' · Distrito '+esc(z.attrs.DISTRITO):''}</div></div></div></div>
    <div class="stats"><div class="stat"><div class="k">Área</div><div class="v">${fmtArea(z.area)}</div></div>
      <div class="stat"><div class="k">Lugares</div><div class="v">${pl.length}</div></div><div class="stat"><div class="k">Mis registros</div><div class="v">${mine}</div></div></div>
    ${(()=>{const inf=zInfo(z),zc=cams().filter(c=>c.z===z.num),bad=zc.filter(c=>c.st==='fuera'||c.st==='falla').length,nd=delAll().filter(d=>d[5]===z.num).length,as=db.settings.assigned.includes(z.num);
      return`${inf&&inf.tel?`<button class="btn" data-a="url" data-u="tel:${esc(inf.tel)}">${ICON.phone} Llamar al cuadrante · ${esc(inf.tel)}</button><div class="muted small">${esc(inf.cai||'')} · ${esc(inf.est||'')} (Alcaldía)</div>`:''}
      <div class="stats"><button class="stat" data-a="ztab" data-t="camaras" style="text-align:left"><div class="k">Cámaras</div><div class="v">${zc.length}${bad?` <span style="color:var(--danger)">· ${bad} con falla</span>`:''}</div></button>
        <button class="stat" data-a="ztab" data-t="delitos" style="text-align:left"><div class="k">Delitos ${esc((AL.delPeriodo||'').replace('–','-'))}</div><div class="v">${nf(nd)}</div></button>
        <button class="stat" data-a="assign" style="text-align:left"><div class="k">Mi turno</div><div class="v">${as?'Asignado ✓':'Asignarme'}</div></button></div>`})()}
    <div class="section"><span class="label">Barrios</span><div>${br.en.length?esc(br.en.join(', ')):'<span class="muted">Sin barrio dentro según OSM</span>'}</div>${br.cerca.length?`<div class="muted">Cerca: ${esc(br.cerca.join(', '))}</div>`:''}</div>
    <div class="section"><span class="label">Nomenclatura</span>${rs.parts.length?rs.parts.map(p=>`<div>${esc(p.text)} <span class="muted">(${p.count})</span></div>`).join(''):'<div class="muted">Sin calles numeradas</div>'}${rs.others.length?`<div class="muted">${esc(rs.others.slice(0,6).join(' · '))}${rs.others.length>6?' …':''}</div>`:''}</div>
    <div class="actions"><button class="btn" data-a="zfit">${ICON.focus} Encuadrar</button><button class="btn" data-a="url" data-u="${esc(gmaps(z.labelPt))}">${ICON.gmaps} Google Maps</button>
      <button class="btn primary" data-a="new-in-zone">${ICON.plus} Registrar</button><button class="btn" data-a="share-zone">${ICON.share} Compartir</button></div>
  </div>
  ${Object.keys(byG).length?`<div class="section"><span class="label">Qué hay</span><div class="chips wrap">${Object.entries(byG).sort((a,b)=>b[1]-a[1]).map(([g,n])=>`<button class="chip" data-a="zplaces-g" data-g="${g}"><span class="dot" style="--c:${GROUP_COLOR[g]}"></span>${esc(GROUP_NAME[g]||g)} <span class="n">${n}</span></button>`).join('')}</div></div>`:''}`;
}
function zonePlaces(z){
  const all=places().filter(p=>p.z===z.num),q=norm(ui.zPlaceQ),byG={};all.forEach(p=>byG[p.g]=(byG[p.g]||0)+1);
  const list=all.filter(p=>(!ui.zPlaceG||p.g===ui.zPlaceG)&&(!q||norm(p.name+' '+p.label+' '+p.addr).includes(q))).sort((a,b)=>(a.src==='mine'?0:1)-(b.src==='mine'?0:1)||a.name.localeCompare(b.name,'es'));
  return`<div class="searchbox">${ICON.search}<input class="input" id="zpq" type="search" value="${esc(ui.zPlaceQ)}" placeholder="Buscar en este cuadrante" autocomplete="off"></div>
  <div class="chips"><button class="chip" data-a="zpg" data-g="" aria-pressed="${!ui.zPlaceG}">Todos <span class="n">${all.length}</span></button>${Object.entries(byG).sort((a,b)=>b[1]-a[1]).map(([g,n])=>`<button class="chip" data-a="zpg" data-g="${g}" aria-pressed="${ui.zPlaceG===g}"><span class="dot" style="--c:${GROUP_COLOR[g]}"></span>${esc(GROUP_NAME[g]||g)} <span class="n">${n}</span></button>`).join('')}</div>
  <div id="zplist">${list.length?`<div class="list">${list.slice(0,ui.limit).map(p=>placeRow(p)).join('')}</div>${list.length>ui.limit?`<button class="btn block" data-a="more">Mostrar más (${list.length-ui.limit})</button>`:''}`:'<div class="empty">No hay lugares con ese filtro.</div>'}</div>
  <button class="btn primary block" data-a="new-in-zone">${ICON.plus} Agregar lugar que falta</button>`;
}
function zoneStreets(z){
  const rs=G.rangeSummary(zoneStreetNames(z));
  const addrs=[...OSM.addrs.filter(a=>a.z===z.num).map(a=>({a:a.a,n:a.n||'',ll:a.ll})),
    ...places().filter(p=>p.src==='mine'&&p.z===z.num&&p.addr).map(p=>({a:p.addr,n:p.name,ll:p.ll,mine:1}))].sort((x,y)=>x.a.localeCompare(y.a,'es',{numeric:true}));
  return`<div class="muted">Toca una vía para resaltarla en el mapa.</div>
  ${rs.parts.map(p=>`<div class="streetgrp"><span class="label">${esc(p.title)} · ${p.count}</span><div class="chips">${p.items.map(i=>`<button class="chip" data-a="street" data-n="${esc(i.name)}">${esc(i.name.replace(/^\S+\s/,''))}</button>`).join('')}</div></div>`).join('')}
  ${rs.others.length?`<div class="streetgrp"><span class="label">Otras vías · ${rs.others.length}</span><div class="chips">${rs.others.map(n=>`<button class="chip" data-a="street" data-n="${esc(n)}">${esc(n)}</button>`).join('')}</div></div>`:''}
  <button class="btn block" data-a="new-via">${ICON.plus} Agregar calle o carrera que falta</button>
  <div class="section"><span class="label">Direcciones conocidas · ${addrs.length}</span>
  ${addrs.length?`<div class="list">${addrs.slice(0,150).map(a=>`<button class="li" data-a="pt" data-ll="${a.ll.join(',')}" data-t="${esc(a.a)}"><span class="pin sq" style="--c:${a.mine?'#0E6B47':'#5C677D'}">#</span><span style="min-width:0"><span class="t">${esc(a.a)}</span><span class="s" style="display:block">${esc(a.n)}</span></span><span class="m"></span></button>`).join('')}</div>`:'<div class="empty">OSM no tiene direcciones en este cuadrante. Las que registres aparecerán aquí.</div>'}</div>`;
}
function zoneData(z){const rows=Object.entries(z.attrs).filter(([k,v])=>v!=='');
  return`<div class="card"><table class="kv">${rows.map(([k,v])=>`<tr><td>${esc(k)}</td><td class="mono">${esc(v)}</td></tr>`).join('')}
  <tr><td>Perímetro</td><td class="mono">${fmtLen(G.perimeter(z.rings[0]))}</td></tr><tr><td>Centro</td><td class="mono">${fmtLL(z.labelPt)}</td></tr></table></div>`}
function showStreet(name){
  const segs=ix.list.filter(s=>s.name===name);if(!segs.length)return;
  highlight(l=>segs.forEach(s=>L.polyline(s.pts,{color:'#FFD43B',weight:9,opacity:.9,interactive:false}).addTo(l)&&L.polyline(s.pts,{color:'#E67700',weight:4,interactive:false}).addTo(l)));
  const z=zoneById(ui.zoneId),pts=segs.flatMap(s=>s.pts).filter(p=>!z||G.inPoly(p,z.rings));
  flyTo(L.latLngBounds(pts.length?pts:segs.flatMap(s=>s.pts)),18);toast(name);
}

/* ----- Vista: detalle de lugar ----- */
function openPlace(id){const p=placeById(id);if(!p)return;ui.place=id;go('place',{push:sheetOpen()&&ui.view!=='place'});
  highlight(l=>L.circleMarker(p.ll,{radius:14,color:'#E67700',weight:4,fill:false,interactive:false}).addTo(l));flyToPoint(p.ll,18)}
function openRecord(id){const r=db.records.find(x=>x.id===id);if(!r)return;
  if(r.kind==='lugar'){openPlace(id);return}
  ui.place=id;go('place',{push:sheetOpen()&&ui.view!=='place'});renderRecordsMap();flyTo(L.latLngBounds(r.latlngs),18)}
function viewPlace(){
  const r=db.records.find(x=>x.id===ui.place);
  if(r&&r.kind!=='lugar')return viewShape(r);
  const p=placeById(ui.place);if(!p)return'<div class="empty">Ese lugar ya no existe.</div>';
  const z=p.z&&zoneByNum(p.z),rec=p.rec,c=GROUP_COLOR[p.g];
  const rows=rec?[['Dirección',rec.addr],['Teléfono',rec.tel],['Contacto',rec.contacto],['Horario',rec.horario],['Proyecto',rec.proyecto],['Notas',rec.notas]]:[['Dirección',p.addr],['Teléfono',p.tel],['Horario',p.h],['Web',p.w]];
  const rev=revAddr(p.ll);
  return`<div class="head">${backBtn()}<span class="pin" style="--c:${c}">${esc(p.label[0])}</span><h2>${esc(p.name)}</h2>${closeBtn()}</div>
  <div class="card">
    <div class="muted">${esc(p.label)} · ${p.src==='mine'?'<b>Registrado por ti</b>':'OpenStreetMap'}</div>
    ${z?`<button class="li" data-a="zone" data-id="${z.id}" style="border:1px solid var(--line);border-radius:10px"><span class="znum" style="--c:${z.color}">${esc(z.num)}</span><span style="min-width:0"><span class="t">Cuadrante ${esc(z.num)}</span><span class="s" style="display:block">${esc(z.title)}</span></span><span class="m">›</span></button>`:'<div class="muted">Fuera de los cuadrantes</div>'}
    <table class="kv">${rows.filter(x=>x[1]).map(([k,v])=>`<tr><td>${k}</td><td>${esc(v)}</td></tr>`).join('')}
      <tr><td>Dir. aprox.</td><td>${esc(rev?.text||'—')}</td></tr><tr><td>Coordenadas</td><td class="mono">${fmtLL(p.ll)}</td></tr>
      ${rec?`<tr><td>Registrado</td><td>${new Date(rec.created).toLocaleString('es-CO')}</td></tr>`:''}</table>
    ${rec&&rec.photos&&rec.photos.length?`<div class="photos" id="viewPhotos" data-ids="${rec.photos.join(',')}"></div>`:''}
    <div class="actions">
      <button class="btn" data-a="url" data-u="${esc(gmaps(p.ll))}">${ICON.gmaps} Google Maps</button>
      <button class="btn" data-a="url" data-u="${esc(gdir(p.ll))}">${ICON.route} Cómo llegar</button>
      <button class="btn" data-a="url" data-u="${esc(gpano(p.ll))}">${ICON.pano} Street View</button>
      ${(rec?rec.tel:p.tel)?`<button class="btn" data-a="url" data-u="tel:${esc((rec?rec.tel:p.tel).replace(/[^\d+]/g,''))}">${ICON.phone} Llamar</button>`:''}
      <button class="btn" data-a="share-place">${ICON.share} Compartir</button>
      ${rec?`<button class="btn primary" data-a="edit" data-id="${rec.id}">${ICON.edit} Editar</button>`:`<button class="btn primary" data-a="complete-osm">${ICON.edit} Completar datos</button>`}
    </div>
    ${p.src==='osm'?`<div class="muted small">Dato de OpenStreetMap. «Completar datos» guarda tu versión con teléfono, contacto, notas y fotos.</div>`:''}
  </div>`;
}
function viewShape(r){
  const zs=recZones(r);
  const meas=r.kind==='via'?fmtLen(G.lineLength(r.latlngs)):fmtArea(G.polyArea(r.latlngs));
  return`<div class="head">${backBtn()}<h2>${esc(r.name)}</h2>${closeBtn()}</div>
  <div class="card"><div class="muted">${KIND_NAME[r.kind]} registrada · ${meas}</div>
    <div class="chips wrap">${zs.map(n=>{const z=zoneByNum(n);return`<button class="chip" data-a="zone" data-id="${z.id}"><span class="dot" style="--c:${z.color}"></span>Cuadrante ${esc(n)}</button>`}).join('')||'<span class="muted">Fuera de los cuadrantes</span>'}</div>
    ${r.notas?`<div>${esc(r.notas)}</div>`:''}${r.proyecto?`<div class="muted">Proyecto: ${esc(r.proyecto)}</div>`:''}
    ${r.photos&&r.photos.length?`<div class="photos" id="viewPhotos" data-ids="${r.photos.join(',')}"></div>`:''}
    <div class="actions"><button class="btn" data-a="url" data-u="${esc(gmaps(G.centroid(r.latlngs)))}">${ICON.gmaps} Google Maps</button><button class="btn primary" data-a="edit" data-id="${r.id}">${ICON.edit} Editar</button></div></div>`;
}

/* ----- Vista: cámara ----- */
function openCam(id){const c=camById(id);if(!c)return;ui.cam=id;go('cam',{push:sheetOpen()&&ui.view!=='cam'});
  highlight(l=>L.circleMarker(c.ll,{radius:15,color:'#E67700',weight:4,fill:false,interactive:false}).addTo(l));flyToPoint(c.ll,18)}
function viewCam(){
  const c=camById(ui.cam);if(!c)return'<div class="empty">Esa cámara ya no está.</div>';
  const z=c.z&&zoneByNum(c.z),st=CAM_ST[c.st],rev=revAddr(c.ll),me=gps.ll?G.dist(gps.ll,c.ll):null;
  const near=camsNear(c.ll,150).filter(x=>x.c.id!==c.id).slice(0,8);
  const rows=[['Fuente',CAM_SRC[c.src]],['Tipo',c.tipo],['Dirección',c.dir],['Estado oficial',c.estOf],['Mi KML',c.mine?`${c.mine.name}${c.mine.st?' · '+CAM_ST[c.mine.st].l:''}${c.mine.note?' · '+c.mine.note:''}`:''],
    ['Instalada',c.inst],['Barrio',c.barrio],['Sentido',c.sentido],['Vel. máxima',c.vel?c.vel+' km/h':''],['Ubicación',c.ubic],['Dir. aprox.',rev?.text],
    ['Coordenadas',fmtLL(c.ll)],['Distancia',me!=null?fmtLen(me)+' de ti':'']];
  return`<div class="head">${backBtn()}<span class="pin" style="--c:${st.c}">${ICON.cctv.replace('<svg','<svg style="width:16px;height:16px"')}</span><h2>${esc(camTitle(c))}</h2>${closeBtn()}</div>
  <div class="card">
    <div><span class="stdot" style="--c:${st.c}"></span><b>${esc(st.l)}</b> <span class="muted">${db.camEdits[c.id]?.st?'(marcado por ti)':c.mine&&c.mine.st?'(según tu KML)':'(según la Alcaldía)'}</span></div>
    ${z?`<button class="li" data-a="zone" data-id="${z.id}" style="border:1px solid var(--line);border-radius:10px"><span class="znum" style="--c:${z.color}">${esc(z.num)}</span><span style="min-width:0"><span class="t">Cuadrante ${esc(z.num)}</span><span class="s" style="display:block">${esc(z.title)}</span></span><span class="m">›</span></button>`:''}
    <table class="kv">${rows.filter(x=>x[1]).map(([k,v])=>`<tr><td>${k}</td><td>${esc(v)}</td></tr>`).join('')}</table>
    ${c.foto?`<div class="section"><span class="label">Imagen pública (SIMM)</span><img class="cam-img" id="camImg" src="${esc(c.foto)}?t=${Date.now()}" alt="Imagen de la cámara de movilidad" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'muted',textContent:'Imagen no disponible ahora (necesita internet).'}))"><button class="btn sm" data-a="cam-refresh">Actualizar imagen</button></div>`:''}
    <div class="section"><span class="label">Marcar estado (queda en este celular)</span>
      <div class="chips wrap">${['ok','falla','fuera'].map(k=>`<button class="chip" data-a="cam-st" data-k="${k}" aria-pressed="${db.camEdits[c.id]?.st===k}"><span class="dot" style="--c:${CAM_ST[k].c}"></span>${CAM_ST[k].l}</button>`).join('')}
      ${db.camEdits[c.id]?.st?'<button class="chip" data-a="cam-st" data-k="">Quitar marca</button>':''}</div>
      <textarea class="input" id="camNote" rows="2" placeholder="Nota: qué enfoca, quién la revisa, novedades…">${esc(c.note)}</textarea></div>
    <div class="actions">
      <button class="btn primary" data-a="guide" data-ll="${c.ll.join(',')}" data-t="${esc(camTitle(c))}">${ICON.target} Guiar</button>
      <button class="btn" data-a="url" data-u="${esc(gmaps(c.ll))}">${ICON.gmaps} Google Maps</button>
      <button class="btn" data-a="url" data-u="${esc(gpano(c.ll))}">${ICON.pano} Street View</button>
      <button class="btn" data-a="share-cam">${ICON.share} Compartir</button>
    </div>
  </div>
  ${near.length?`<div class="section"><span class="label">Otras cámaras a menos de 150 m</span><div class="list">${near.map(x=>camRow(x.c,fmtLen(x.d))).join('')}</div></div>`:''}`;
}

/* ----- Vista: punto (dirección buscada o punto tocado en el mapa) ----- */
function viewPunto(){
  const pt=ui.point;if(!pt)return'';const ll=pt.ll,z=zoneAt(ll),of=z?zInfo(z):ofZoneAt(ll),rev=revAddr(ll),br=barrioAt(ll,z);
  const nc=camsNear(ll,200),sd=nearestSede(ll),me=gps.ll?G.dist(gps.ll,ll):null;
  const nd=delAll().filter(d=>G.dist(ll,[d[0],d[1]])<150);
  return`<div class="head">${backBtn()}<span class="znum" style="--c:${z?z.color:'#868E96'}">${z?esc(z.num):of?esc(of.n):'—'}</span><h2>${esc(pt.title)}</h2>${closeBtn()}</div>
  <div class="card">
    <div class="addr-big">${esc(rev?.text||'Sin dirección cercana')}</div>
    <div class="muted">${rev?.official?'Placa oficial más cercana':'Dirección aproximada'}${br?' · Barrio '+esc(br):''}${me!=null?' · a '+fmtLen(me)+' de ti':''}</div>
    ${z?`<button class="li" data-a="zone" data-id="${z.id}" style="border:1px solid var(--line);border-radius:10px"><span class="znum" style="--c:${z.color}">${esc(z.num)}</span><span style="min-width:0"><span class="t">Cuadrante ${esc(z.num)} · ${esc(shortGroup(z.group))}</span><span class="s" style="display:block">${esc(z.title)}</span></span><span class="m">›</span></button>`
      :of?`<div><b>${esc(ofTitle(of))}</b><div class="muted">${esc(of.cai||'')} · fuera de Belén</div></div>`:'<div class="muted">Fuera de los cuadrantes conocidos</div>'}
    ${of&&of.tel?`<button class="btn" data-a="url" data-u="tel:${esc(of.tel)}">${ICON.phone} Llamar al cuadrante ${esc(of.n)} · ${esc(of.tel)}</button>`:''}
    <div class="muted mono small">${fmtLL(ll)}</div>
    <div class="actions">
      <button class="btn primary" data-a="guide" data-ll="${ll.join(',')}" data-t="${esc(rev?.text||pt.title)}">${ICON.target} Guiar</button>
      <button class="btn" data-a="url" data-u="${esc(gdir(ll))}">${ICON.route} Google Maps</button>
      <button class="btn" data-a="url" data-u="${esc(waze(ll))}">${ICON.waze} Waze</button>
      <button class="btn" data-a="url" data-u="${esc(gpano(ll))}">${ICON.pano} Street View</button>
      <button class="btn" data-a="new-at" data-ll="${ll.join(',')}">${ICON.plus} Registrar aquí</button>
      <button class="btn" data-a="share-pt">${ICON.share} Compartir</button>
    </div>
  </div>
  <div class="section"><span class="label">Cámaras a menos de 200 m · ${nc.length}</span>${nc.length?`<div class="list">${nc.slice(0,15).map(x=>camRow(x.c,fmtLen(x.d))).join('')}</div>`:'<div class="empty">No hay cámaras conocidas cerca. Si ves una, regístrala.</div>'}</div>
  ${sd?`<div class="section"><span class="label">Sede policial más cercana</span><button class="li" data-a="guide" data-ll="${sd.ll.join(',')}" data-t="${esc(sd.name)}"><span class="pin" style="--c:#364FC7">P</span><span style="min-width:0"><span class="t">${esc(sd.name)}</span><span class="s" style="display:block">Toca para guiarte</span></span><span class="m">${fmtLen(sd.d)}</span></button></div>`:''}
  ${nd.length?`<div class="note">Histórico ${esc(AL.delPeriodo||'')}: ${nd.length} delitos registrados a menos de 150 m (${esc(topCats(nd,3))}).</div>`:''}`;
}
function topCats(list,n){const c={};list.forEach(d=>c[d[2]]=(c[d[2]]||0)+1);return Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,n).map(([k,v])=>`${AL.delCats[k]} ${v}`).join(', ')}

/* ----- Pestañas de cuadrante: cámaras y delitos ----- */
function zoneCams(z){
  const all=cams().filter(c=>c.z===z.num),by={};all.forEach(c=>by[c.st]=(by[c.st]||0)+1);
  const f=ui.zCamSt,list=all.filter(c=>!f||c.st===f).sort((a,b)=>({fuera:0,falla:1,nd:2,ok:3}[a.st]-{fuera:0,falla:1,nd:2,ok:3}[b.st])||String(a.num).localeCompare(String(b.num),'es',{numeric:true}));
  return`<div class="chips"><button class="chip" data-a="zcst" data-k="" aria-pressed="${!f}">Todas <span class="n">${all.length}</span></button>${Object.keys(CAM_ST).filter(k=>by[k]).map(k=>`<button class="chip" data-a="zcst" data-k="${k}" aria-pressed="${f===k}"><span class="dot" style="--c:${CAM_ST[k].c}"></span>${CAM_ST[k].l} <span class="n">${by[k]}</span></button>`).join('')}</div>
  ${list.length?`<div class="list">${list.slice(0,ui.limit).map(c=>camRow(c)).join('')}</div>${list.length>ui.limit?`<button class="btn block" data-a="more">Mostrar más (${list.length-ui.limit})</button>`:''}`:'<div class="empty">No hay cámaras con ese filtro.</div>'}
  <div class="grid2"><button class="btn sm" data-a="new-cam">${ICON.plus} Agregar cámara</button><button class="btn sm" data-a="exp-cams">Exportar (CSV)</button></div>
  <div class="note">Fuente: Alcaldía de Medellín (SIES-M, Metro, fotodetección y movilidad)${AL.camActualizado?', actualizado '+esc(AL.camActualizado):''}. El estado puede haber cambiado: márcalo en cada cámara.</div>`;
}
function bars(entries,max,color,fmt){return`<div class="bars">${entries.map(([k,v])=>`<div class="bar" style="--c:${color||'var(--accent)'}"><span>${esc(k)}</span><span class="tr"><span style="width:${(v/max*100).toFixed(1)}%"></span></span><span class="n">${(fmt||nf)(v)}</span></div>`).join('')}</div>`}
function zoneCrime(z){
  const list=delAll().filter(d=>d[5]===z.num);if(!list.length)return'<div class="empty">Sin delitos georreferenciados en este cuadrante.</div>';
  const cat={},yr={},dow=[0,0,0,0,0,0,0],mod={};
  list.forEach(d=>{cat[d[2]]=(cat[d[2]]||0)+1;const y=delYear(d);yr[y]=(yr[y]||0)+1;const w=delDow(d);if(w>=0)dow[w]++;if(AL.delMods[d[3]])mod[d[3]]=(mod[d[3]]||0)+1});
  const ce=Object.entries(cat).sort((a,b)=>b[1]-a[1]).map(([k,v])=>[AL.delCats[k],v]),me=Object.entries(mod).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([k,v])=>[AL.delMods[k],v]);
  const rank=zones.map(x=>({z:x,n:delAll().filter(d=>d[5]===x.num).length})).sort((a,b)=>b.n-a.n),pos=rank.findIndex(r=>r.z===z)+1,mx=Math.max(...dow);
  const area=z.area/1e6;
  return`<div class="stats"><div class="stat"><div class="k">Delitos</div><div class="v">${nf(list.length)}</div></div><div class="stat"><div class="k">Por km²</div><div class="v">${nf(list.length/area)}</div></div><div class="stat"><div class="k">Puesto</div><div class="v">${pos} de ${zones.length}</div></div></div>
  <div class="section"><span class="label">Por tipo</span>${bars(ce,ce[0][1],'#d7191c')}</div>
  <div class="section"><span class="label">Día de la semana</span><div class="week">${dow.map((v,i)=>`<div><span style="height:${(v/mx*70).toFixed(0)}px" title="${v}"></span>${DOW[i]}</div>`).join('')}</div></div>
  ${me.length?`<div class="section"><span class="label">Modalidades más frecuentes</span>${bars(me,me[0][1],'#fdae61')}</div>`:''}
  <div class="section"><span class="label">Por año</span>${bars(Object.entries(yr).sort(),Math.max(...Object.values(yr)))}</div>
  <button class="btn block" data-a="heat-zone">${ICON.heat} Ver mapa de calor del cuadrante</button>
  <div class="note">Hechos registrados por la Policía y el SISC de la Alcaldía, ${esc(AL.delPeriodo||'')}${delImp.length?' + '+nf(delImp.length)+' importados':''}. Las fechas no traen hora. Para datos recientes usa Capas → Importar delitos (CSV).</div>`;
}

/* ----- Vista: capas ----- */
function viewCapas(){
  const Ly=db.settings.layers,h=db.settings.heat,all=delAll(),cnt={};all.forEach(d=>cnt[d[2]]=(cnt[d[2]]||0)+1);
  const sw=(id,on,label,extra)=>`<label class="switch"><span>${label}${extra?` <span class="muted small">${extra}</span>`:''}</span><input type="checkbox" data-layer="${id}" ${on?'checked':''}></label>`;
  const nC=src=>cams().filter(c=>src.includes(c.src)).length;
  return`<div class="head"><h2>Capas</h2>${closeBtn()}</div>
  <div class="section"><span class="label">Cámaras</span>
    ${sw('cams',Ly.cams,'Cámaras de la Policía (SIES-M)',nf(nC(['sies','kml','rec'])))}
    ${sw('metro',Ly.metro,'Cámaras del Metro',nf(nC(['metro'])))}
    ${sw('fdt',Ly.fdt,'Fotodetección',nf(nC(['fdt'])))}
    ${sw('mov',Ly.mov,'Cámaras de movilidad (con imagen)',nf(nC(['mov'])))}
    <div class="legend">${Object.entries(CAM_ST).map(([k,v])=>`<span><span class="stdot" style="--c:${v.c}"></span>${v.l}</span>`).join('')}</div>
    <div class="muted small">Se ven al acercar el mapa. Mantén presionado un punto del mapa para ver las cámaras más cercanas.</div></div>
  <div class="section"><span class="label">Mapa de calor de delitos</span>
    ${sw('heat',Ly.heat,'Mostrar mapa de calor',nf(all.filter(delFilter).length)+' hechos')}
    <div class="heat-scale" aria-hidden="true"></div><div class="legend"><span>Menos</span><span style="margin-left:auto">Más</span></div>
    <div class="chips wrap">${AL.delCats.map((c,i)=>cnt[i]?`<button class="chip" data-a="hcat" data-k="${i}" aria-pressed="${h.cats.includes(i)}">${esc(c)} <span class="n">${nf(cnt[i])}</span></button>`:'').join('')}</div>
    <div class="chips wrap">${years().map(y=>`<button class="chip" data-a="hyear" data-k="${y}" aria-pressed="${h.years.includes(y)}">${y}</button>`).join('')}</div>
    <div class="chips wrap">${DOW.map((d,i)=>`<button class="chip" data-a="hdow" data-k="${i}" aria-pressed="${h.dows.includes(i)}">${d}</button>`).join('')}</div>
    <div class="note">Sin filtros = todos. Datos ${esc(AL.delPeriodo||'')} (Alcaldía/SISC)${delImp.length?' + '+nf(delImp.length)+' importados':''}.</div>
    <div class="grid2"><button class="btn sm" data-a="import-csv">Importar delitos (CSV)</button>${delImp.length?'<button class="btn sm danger" data-a="clear-csv">Borrar importados</button>':''}</div></div>
  <div class="section"><span class="label">Otras capas</span>
    ${sw('vecinos',Ly.vecinos,'Cuadrantes de otras estaciones',nf(AL.cuadrantes.length))}
    ${sw('pois',db.settings.showPois,'Lugares (negocios, colegios…)')}
    ${sw('track',Ly.track,'Mi recorrido de hoy')}</div>`;
}

/* ----- Vista: buscar ----- */
function viewSearch(){return`<div class="head"><h2>Buscar</h2>${closeBtn()}</div>
  <div class="searchbox">${ICON.search}<input class="input" id="q" type="search" value="${esc(ui.q)}" placeholder="Ej: Calle 30A # 80-15, Éxito, La Mota, 16" autocomplete="off" enterkeyhint="search"></div>
  <div id="results">${searchResults()}</div>`}
function searchResults(){
  const q=ui.q.trim();if(q.length<2)return`<div class="muted">Escribe una dirección con nomenclatura de Medellín (Calle, Carrera, Diagonal, Transversal y número), el nombre de un lugar, un barrio o el número del cuadrante.</div>
    <div class="chips wrap">${['Calle 30A # 80-15','Carrera 76 # 32-10','Calle 9 Sur # 79-20','Cámara 182','Parque de Belén'].map(x=>`<button class="chip" data-a="qex" data-q="${esc(x)}">${esc(x)}</button>`).join('')}</div>`;
  const out=[],nq=norm(q);
  const gc=geoAddr(q);
  if(gc&&!gc.error){const z=zoneAt(gc.ll);ui.search=gc;
    out.push(`<div class="section"><span class="label">Dirección</span><button class="li" data-a="pt" data-ll="${gc.ll.join(',')}" data-t="${esc(gc.label)}" style="border:1px solid var(--line);border-radius:12px">
      <span class="znum" style="--c:${z?z.color:'#868E96'}">${z?esc(z.num):'—'}</span><span style="min-width:0"><span class="t">${esc(gc.label)}</span>
      <span class="s" style="display:block">${z?'Cuadrante '+esc(z.num)+' · '+esc(shortGroup(z.group)):'Fuera de los cuadrantes'}${gc.approx?' · aprox.':''}${gc.note?' · '+esc(gc.note):''}</span></span><span class="m">›</span></button></div>`)}
  else if(gc&&gc.error)out.push(`<div class="muted">${esc(gc.error)}</div>`);
  const cm=nq.match(/^(cam(?:ara)?|c|ms|lpr|cf)?\s*-?\s*(\d{1,4})$/i);
  if(cm&&(cm[1]||cm[2].length>=3)){cm[1]=cm[2];const d=String(+cm[1]),cl=cams().filter(c=>camDigits(c.num)===d||(c.mine&&camDigits(c.mine.num)===d)).slice(0,8);
    if(cl.length)out.push(`<div class="section"><span class="label">Cámaras</span><div class="list">${cl.map(c=>camRow(c,c.z?'C'+c.z:'')).join('')}</div></div>`)}
  else if(/^(cam|c[aá]mara)/i.test(q)){const w=nq.replace(/^cam(ara)?\s*/,''),cl=cams().filter(c=>norm(camTitle(c)+' '+c.dir+' '+(c.mine?c.mine.name:'')).includes(w)).slice(0,20);
    if(cl.length)out.push(`<div class="section"><span class="label">Cámaras</span><div class="list">${cl.map(c=>camRow(c,c.z?'C'+c.z:'')).join('')}</div></div>`)}
  const zs=zones.filter(z=>z.num===q||norm(z.code).includes(nq)||norm(z.title).includes(nq)).slice(0,5);
  if(zs.length)out.push(`<div class="section"><span class="label">Cuadrantes</span>${zoneListHtml(zs,{})}</div>`);
  const brs=OSM.nb.filter(([n])=>norm(n).includes(nq)).slice(0,6);
  if(brs.length)out.push(`<div class="section"><span class="label">Barrios</span><div class="list">${brs.map(([n,la,lo])=>{const z=zoneAt([la,lo]);return`<button class="li" data-a="pt" data-ll="${la},${lo}" data-t="${esc(n)}"><span class="pin sq" style="--c:${z?z.color:'#868E96'}">B</span><span style="min-width:0"><span class="t">${esc(n)}</span><span class="s" style="display:block">${z?'Cuadrante '+esc(z.num):'Fuera de los cuadrantes'}</span></span><span class="m"></span></button>`}).join('')}</div></div>`);
  const pl=places().filter(p=>norm(p.name+' '+p.label+' '+p.addr).includes(nq)).slice(0,40);
  if(pl.length)out.push(`<div class="section"><span class="label">Lugares · ${pl.length}</span><div class="list">${pl.map(p=>placeRow(p,p.z?'C'+p.z:'')).join('')}</div></div>`);
  const names=[...new Set(ix.list.filter(s=>norm(s.name).includes(nq)).map(s=>s.name))].slice(0,12);
  if(names.length)out.push(`<div class="section"><span class="label">Vías</span><div class="chips wrap">${names.map(n=>`<button class="chip" data-a="street-any" data-n="${esc(n)}">${esc(n)}</button>`).join('')}</div></div>`);
  out.push(`<button class="btn block" data-a="online">${ICON.search} Buscar en internet (OpenStreetMap)</button><div id="online"></div>`);
  return out.join('')||'<div class="empty">Sin resultados.</div>';
}
async function searchOnline(){
  const box=$('#online');if(!box)return;box.innerHTML='<div class="muted">Buscando…</div>';
  try{const u=`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&countrycodes=co&viewbox=-75.67,6.26,-75.57,6.18&bounded=1&q=${encodeURIComponent(ui.q+', Medellín')}`;
    const r=await fetch(u,{headers:{'Accept-Language':'es'}});if(!r.ok)throw new Error('HTTP '+r.status);const js=await r.json();
    box.innerHTML=js.length?`<div class="list">${js.map(x=>{const ll=[+x.lat,+x.lon],z=zoneAt(ll);return`<button class="li" data-a="pt" data-ll="${ll.join(',')}" data-t="${esc(x.display_name.split(',').slice(0,2).join(','))}"><span class="pin sq" style="--c:${z?z.color:'#868E96'}">${z?esc(z.num):'—'}</span><span style="min-width:0"><span class="t">${esc(x.display_name.split(',').slice(0,2).join(','))}</span><span class="s" style="display:block">${esc(x.display_name)}</span></span><span class="m"></span></button>`}).join('')}</div>`:'<div class="empty">Internet tampoco encontró resultados en la zona.</div>';
  }catch(e){box.innerHTML='<div class="empty">Sin conexión. La búsqueda en internet necesita datos móviles o wifi.</div>'}
}
function showPoint(ll,title){
  const z=zoneAt(ll),rev=revAddr(ll);ui.point={ll,title};go('punto',{push:sheetOpen()&&ui.view!=='punto'});
  highlight(l=>{const m=L.marker(ll,{icon:L.divIcon({className:'vtx',iconSize:null,html:'<span style="border-color:#E67700;width:22px;height:22px"></span>'})}).addTo(l);
    m.bindTooltip(`<b>${esc(title)}</b><br>${z?'Cuadrante '+esc(z.num):'Fuera de los cuadrantes'}${rev?'<br>'+esc(rev.text):''}`,{className:'tip',permanent:true,direction:'top',offset:[0,-12]})});
  flyToPoint(ll,18);
  ui.lastPoint={ll,title};
  if(title!=='Punto en el mapa')toast(z?`${title} → Cuadrante ${z.num}`:`${title} está fuera de los cuadrantes`);
}

/* ----- Vista: registros ----- */
function viewRecords(){
  const q=norm(ui.regQ),projects=[...new Set(db.records.map(r=>r.proyecto).filter(Boolean))].sort();
  const list=db.records.filter(r=>(ui.regFilter==='todos'||r.kind===ui.regFilter)&&(!ui.regProj||r.proyecto===ui.regProj)&&(!q||norm([r.name,r.addr,r.notas,r.contacto,r.proyecto,CAT[r.cat]?.l].join(' ')).includes(q)))
    .sort((a,b)=>(b.updated||b.created)-(a.updated||a.created));
  const n=k=>db.records.filter(r=>k==='todos'||r.kind===k).length;
  return`<div class="head"><h2>Mis registros <span class="muted">· ${db.records.length}</span></h2>${closeBtn()}</div>
  <div class="grid2"><button class="btn primary" data-a="new" data-k="lugar">${ICON.plus} Lugar</button><button class="btn" data-a="new" data-k="via">${ICON.plus} Calle / carrera</button></div>
  <button class="btn" data-a="new" data-k="zona">${ICON.plus} Zona o punto crítico (área)</button>
  <div class="chips">${['todos','lugar','via','zona'].map(k=>`<button class="chip" data-a="regf" data-k="${k}" aria-pressed="${ui.regFilter===k}">${k==='todos'?'Todos':KIND_NAME[k]+(k==='lugar'?'es':'s')} <span class="n">${n(k)}</span></button>`).join('')}</div>
  <div class="searchbox">${ICON.search}<input class="input" id="rq" type="search" value="${esc(ui.regQ)}" placeholder="Buscar en mis registros" autocomplete="off"></div>
  ${projects.length?`<select class="input" id="rproj"><option value="">Todos los proyectos</option>${projects.map(p=>`<option ${p===ui.regProj?'selected':''}>${esc(p)}</option>`).join('')}</select>`:''}
  <div id="rlist">${list.length?`<div class="list">${list.map(r=>{const zs=recZones(r),c=r.kind==='lugar'?GROUP_COLOR[CAT[r.cat]?.g||'otros']:r.kind==='via'?'#0E6B47':'#C92A2A';
    return`<button class="li" data-a="rec" data-id="${r.id}"><span class="pin ${r.kind==='lugar'?'':'sq'}" style="--c:${c}">${r.kind==='lugar'?esc((CAT[r.cat]?.l||'L')[0]):r.kind==='via'?'V':'Z'}</span>
    <span style="min-width:0"><span class="t">${esc(r.name)}</span><span class="s" style="display:block">${esc(r.kind==='lugar'?(CAT[r.cat]?.l||''):KIND_NAME[r.kind])}${r.addr?' · '+esc(r.addr):''}${r.proyecto?' · '+esc(r.proyecto):''}</span></span>
    <span class="m">${zs.length?'C'+zs.join(', C'):'—'}</span></button>`}).join('')}</div>`
    :'<div class="empty">Aún no tienes registros. Agrega negocios, residencias, calles o puntos críticos que no aparezcan en el mapa.</div>'}</div>
  <div class="section"><span class="label">Exportar ${ui.regProj?'proyecto «'+esc(ui.regProj)+'»':'todo'}</span>
  <div class="grid2"><button class="btn sm" data-a="exp" data-f="csv">Excel (CSV)</button><button class="btn sm" data-a="exp" data-f="kml">Google Earth (KML)</button><button class="btn sm" data-a="exp" data-f="geojson">GeoJSON</button><button class="btn sm" data-a="import">Importar</button></div></div>`;
}

/* ----- Vista: más ----- */
function viewMore(){
  return`<div class="head"><h2>Más</h2>${closeBtn()}</div>
  <div class="section"><span class="label">Mapa</span>
    <select class="input" id="baseSel">${Object.entries(BASES).map(([k,b])=>`<option value="${k}" ${db.settings.base===k?'selected':''}>${b.n}</option>`).join('')}</select>
    <label class="switch"><span>Mostrar lugares en el mapa (al acercar)</span><input type="checkbox" id="swPois" ${db.settings.showPois?'checked':''}></label>
    <label class="switch"><span>Vibrar y avisar al cambiar de cuadrante</span><input type="checkbox" id="swAlert" ${db.settings.alert?'checked':''}></label>
    <button class="btn" data-a="go-capas">Capas: cámaras, mapa de calor, otras estaciones</button>
  </div>
  <div class="section"><span class="label">Turno y alertas</span>
    <div class="muted small">Cuadrantes asignados: la app vibra y avisa si sales de ellos.</div>
    <div class="chips wrap">${zones.map(z=>`<button class="chip" data-a="assign-n" data-n="${esc(z.num)}" aria-pressed="${db.settings.assigned.includes(z.num)}"><span class="dot" style="--c:${z.color}"></span>${esc(z.num)}</button>`).join('')}</div>
    <label class="switch"><span>Avisar al entrar a zonas críticas, de riesgo u oscuras y al pasar cerca de puntos críticos</span><input type="checkbox" id="swZones" ${db.settings.alertZones?'checked':''}></label>
    <label class="switch"><span>Registrar mi recorrido (bitácora por cuadrante)</span><input type="checkbox" id="swTrack" ${db.settings.track?'checked':''}></label>
    <label class="switch"><span>Mantener la pantalla encendida</span><input type="checkbox" id="swWake" ${db.settings.wake?'checked':''}></label>
    <div class="muted small">Las alertas funcionan con la app abierta en pantalla.</div></div>
  <div class="section"><span class="label">Mis cámaras</span>
    <div class="muted small">${db.camKml.length?`${db.camKml.length} cámaras de tu KML (${cams().filter(c=>c.mine&&c.src!=='kml').length} coinciden con la Alcaldía) · ${db.sedes.length} sedes`:'Importa el KML de cámaras de la estación: se cruzan con las de la Alcaldía por número y conservas tu estado y notas.'}</div>
    <div class="grid2"><button class="btn sm" data-a="import-cams">Importar KML de cámaras</button>${db.camKml.length?'<button class="btn sm danger" data-a="clear-cams">Quitar mi KML</button>':''}</div>
    <button class="btn sm" data-a="exp-cams-all">Exportar todas las cámaras de Belén (CSV)</button></div>
  <div class="card"><b>Mapa sin señal</b><div class="muted">Descarga el mapa base de los cuadrantes para verlo sin datos. Los cuadrantes, calles, lugares y el buscador de direcciones ya funcionan sin internet.</div>
    <div class="progress"><span id="dlBar"></span></div><div class="muted small" id="dlMsg">${tileCache?'Lo que ves también queda guardado automáticamente.':'No disponible en este navegador.'}</div>
    <button class="btn" data-a="dl-tiles" ${tileCache?'':'disabled'}>Descargar mapa de Belén (≈ 15 MB)</button></div>
  <div class="section"><span class="label">Respaldo</span>
    <div class="grid2"><button class="btn sm" data-a="backup">Exportar respaldo</button><button class="btn sm" data-a="import">Importar</button></div>
    <div class="muted small">El respaldo incluye registros y fotos. Úsalo para pasar los datos a otro celular.</div></div>
  <div class="section"><span class="label">Cuadrantes</span><div class="muted small">Cargados: ${esc(base.name)} · ${zones.length} zonas</div>
    <div class="grid2"><button class="btn sm" data-a="load-kml">Cargar otro KML</button>${base!==DEFAULT_BASE?'<button class="btn sm" data-a="reset-kml">Volver a Belén</button>':''}</div></div>
  <details class="card"><summary><b>Acerca de los cuadrantes</b></summary>
    <p class="muted">El Modelo Nacional de Vigilancia Comunitaria por Cuadrantes (MNVCC) de la Policía Nacional divide el territorio en áreas fijas y delimitadas —los cuadrantes— a cargo de patrullas asignadas, para conocer los problemas de cada sector y planear con la comunidad.</p>
    <p class="muted">Los códigos del KML siguen ese esquema: <span class="mono">MEVAL</span> Policía Metropolitana del Valle de Aburrá, <span class="mono">MNVCC</span> el modelo, <span class="mono">D05</span> Distrito 5 y <span class="mono">E02</span> la Estación Belén. Este KML reúne ${zones.length} cuadrantes de la Estación Belén, la Subestación Altavista y los CAI Guayabal y La Macarena, sobre las comunas 16 (Belén) y 15 (Guayabal) y el corregimiento de Altavista.</p>
    <p class="muted">Calles, lugares, barrios y direcciones: © colaboradores de OpenStreetMap (ODbL), descargados el ${esc(OSM.fecha)}. Las direcciones calculadas son aproximadas; verifica en el terreno.</p>
    <p class="muted">Cámaras (SIES-M, Metro, fotodetección, movilidad), cuadrantes oficiales con teléfonos, barrios, ${nf(nx?nx.n:0)} placas de nomenclatura domiciliaria y delitos ${esc(AL.delPeriodo||'')}: servidor de mapas público de la Alcaldía de Medellín, descargado el ${esc(AL.descargado||'')}.</p>
    <p class="muted small">Versión ${VERSION}${NATIVE?' · Android':' · Web'}</p></details>`;
}

/* ---------- Eventos del panel ---------- */
const body=$('#sheetBody');
body.addEventListener('click',async e=>{
  const b=e.target.closest('[data-a]');if(!b)return;const a=b.dataset.a;
  switch(a){
    case'back':goBack();break;
    case'close':setSheet('closed');highlight(null);break;
    case'gps':startGps();break;
    case'zone':openZone(b.dataset.id);break;
    case'zgroup':{const g=b.dataset.g;ui.zGroups.has(g)?ui.zGroups.delete(g):ui.zGroups.add(g);renderView();break}
    case'ztab':ui.zTab=b.dataset.t;ui.limit=80;renderView();break;
    case'zfit':{const z=zoneById(ui.zoneId);flyTo(z.layer.getBounds());break}
    case'zplaces-g':ui.zTab='lugares';ui.zPlaceG=b.dataset.g;renderView();break;
    case'zpg':ui.zPlaceG=b.dataset.g||null;ui.limit=80;renderView();break;
    case'more':ui.limit+=100;renderView();break;
    case'street':showStreet(b.dataset.n);break;
    case'street-any':{ui.zoneId=null;showStreet(b.dataset.n);break}
    case'place':openPlace(b.dataset.id);break;
    case'rec':openRecord(b.dataset.id);break;
    case'pt':showPoint(b.dataset.ll.split(',').map(Number),b.dataset.t);if(window.innerHeight<900)setSheet('half');break;
    case'qex':ui.q=b.dataset.q;renderView();break;
    case'online':searchOnline();break;
    case'url':openUrl(b.dataset.u);break;
    case'share-me':{const z=gps.zone;shareText('Mi ubicación',`${z?'Cuadrante '+z.num+' ('+z.title+')':'Fuera de los cuadrantes de Belén'}\n${gps.addr?.text||''}${gps.barrio?' · Barrio '+gps.barrio:''} (aprox.)\n${gmaps(gps.ll)}`);break}
    case'share-zone':{const z=zoneById(ui.zoneId),br=OSM.barrios[z.num];shareText('Cuadrante '+z.num,`Cuadrante ${z.num} · ${z.title}\n${z.code}\nBarrios: ${(br?.en||[]).join(', ')||'—'}\n${gmaps(z.labelPt)}`);break}
    case'share-place':{const p=placeById(ui.place);const z=p.z;shareText(p.name,`${p.name} (${p.label})\n${p.addr||revAddr(p.ll)?.text||''}\n${z?'Cuadrante '+z:''}\n${gmaps(p.ll)}`);break}
    case'new':chooseNew(b.dataset.k);break;
    case'new-here':editRecord(null,{kind:'lugar',latlngs:[gps.ll]});break;
    case'new-in-zone':{const z=zoneById(ui.zoneId);chooseNew('lugar',z);break}
    case'new-via':chooseNew('via');break;
    case'edit':editRecord(b.dataset.id);break;
    case'complete-osm':{const p=placeById(ui.place);const cat=CATS.find(c=>c.g===p.g)?.k||'otro';
      editRecord(null,{kind:'lugar',cat,name:p.name,addr:p.addr||revAddr(p.ll)?.text||'',tel:p.tel,horario:p.h,notas:p.label,latlngs:[p.ll],osmRef:p.id});break}
    case'regf':ui.regFilter=b.dataset.k;renderView();break;
    case'exp':exportRecords(b.dataset.f);break;
    case'import':$('#fileImport').click();break;
    case'backup':backup();break;
    case'load-kml':$('#fileKml').click();break;
    case'reset-kml':base=DEFAULT_BASE;await Store.del('kv','base');reloadBase();toast('Cuadrantes de Belén restaurados');break;
    case'dl-tiles':downloadTiles(b);break;
    case'cam':openCam(b.dataset.id);break;
    case'cam-st':{const id=ui.cam,e=db.camEdits[id]||(db.camEdits[id]={});e.st=b.dataset.k||'';e.t=Date.now();if(!e.st&&!e.note)delete db.camEdits[id];save();invalidateCams();renderCams();renderView();toast(b.dataset.k?'Estado marcado: '+CAM_ST[b.dataset.k].l:'Marca quitada');break}
    case'cam-refresh':{const i=$('#camImg');if(i)i.src=i.src.replace(/\?t=\d+/,'?t='+Date.now());break}
    case'share-cam':{const c=camById(ui.cam);shareText(camTitle(c),`${camTitle(c)} (${c.tipo})\n${c.dir||revAddr(c.ll)?.text||''}\nEstado: ${CAM_ST[c.st].l}${c.z?' · Cuadrante '+c.z:''}\n${gmaps(c.ll)}`);break}
    case'guide':setTarget(b.dataset.ll.split(',').map(Number),b.dataset.t);if(window.innerHeight<900)setSheet('closed');break;
    case'pt-me':if(gps.ll)showPoint(gps.ll,'Mi ubicación');break;
    case'share-pt':{const pt=ui.point,z=zoneAt(pt.ll),rv=revAddr(pt.ll);shareText(pt.title,`${pt.title}\n${rv?.text||''}${z?' · Cuadrante '+z.num:''}\n${gmaps(pt.ll)}`);break}
    case'new-at':editRecord(null,{kind:'lugar',latlngs:[b.dataset.ll.split(',').map(Number)]});break;
    case'new-cam':{const z=zoneById(ui.zoneId);const st=gps.ll&&(!z||zoneAt(gps.ll)===z)?gps.ll:z?z.labelPt:[map.getCenter().lat,map.getCenter().lng];
      startPick('point',{start:st,done:ll=>editRecord(null,{kind:'lugar',cat:'camara',latlngs:ll})});break}
    case'zcst':ui.zCamSt=b.dataset.k;ui.limit=80;renderView();break;
    case'exp-cams':exportCams(cams().filter(c=>c.z===zoneById(ui.zoneId).num),'camaras-cuadrante-'+zoneById(ui.zoneId).num);break;
    case'exp-cams-all':exportCams(cams().filter(c=>c.z),'camaras-belen');break;
    case'assign':{const n=zoneById(ui.zoneId).num;toggleAssign(n);renderView();break}
    case'assign-n':toggleAssign(b.dataset.n);renderView();break;
    case'heat-zone':{db.settings.layers.heat=true;save();renderHeat();const z=zoneById(ui.zoneId);flyTo(z.layer.getBounds());if(window.innerHeight<900)setSheet('closed');toast('Mapa de calor activado');break}
    case'hcat':case'hyear':case'hdow':{const key={hcat:'cats',hyear:'years',hdow:'dows'}[a],v=+b.dataset.k,arr=db.settings.heat[key],i=arr.indexOf(v);i>=0?arr.splice(i,1):arr.push(v);
      if(!db.settings.layers.heat)db.settings.layers.heat=true;save();renderHeat();renderView();break}
    case'go-capas':go('capas',{push:true});break;
    case'import-cams':$('#fileCams').click();break;
    case'clear-cams':db.camKml=[];db.sedes=[];save();invalidateCams();renderCams();renderView();toast('Se quitó tu KML de cámaras');break;
    case'import-csv':$('#fileCsv').click();break;
    case'clear-csv':delImp=[];delYears=null;await Store.del('kv','delImp');renderHeat();renderView();toast('Delitos importados borrados');break;
    case'track-show':db.settings.layers.track=!db.settings.layers.track;save();renderTrack();renderView();break;
    case'track-exp':exportTrack();break;
  }
});
body.addEventListener('input',e=>{const t=e.target;
  if(t.id==='zq'){ui.zq=t.value;const q=norm(ui.zq),counts={};places().forEach(p=>{if(p.z)counts[p.z]=(counts[p.z]||0)+1});
    $('#zlist').innerHTML=zoneListHtml(zones.filter(z=>(!ui.zGroups.size||ui.zGroups.has(z.group))&&(!q||norm([z.num,z.code,z.title,z.group,...(OSM.barrios[z.num]?.en||[])].join(' ')).includes(q))),counts)}
  if(t.id==='zpq'){ui.zPlaceQ=t.value;const z=zoneById(ui.zoneId);const tmp=document.createElement('div');tmp.innerHTML=zonePlaces(z);$('#zplist').replaceWith(tmp.querySelector('#zplist'))}
  if(t.id==='q'){ui.q=t.value;clearTimeout(t._d);t._d=setTimeout(()=>{$('#results').innerHTML=searchResults()},200)}
  if(t.id==='rq'){ui.regQ=t.value;const tmp=document.createElement('div');tmp.innerHTML=viewRecords();$('#rlist').replaceWith(tmp.querySelector('#rlist'))}
});
body.addEventListener('change',e=>{const t=e.target;
  if(t.dataset.layer){const k=t.dataset.layer;if(k==='pois'){db.settings.showPois=t.checked;renderPois()}else{db.settings.layers[k]=t.checked;
    if(k==='heat')renderHeat();else if(k==='vecinos')renderVecinos();else if(k==='track')renderTrack();else renderCams()}save();if(k==='heat')renderView();return}
  if(t.id==='camNote'){const id=ui.cam,e2=db.camEdits[id]||(db.camEdits[id]={});e2.note=t.value.trim();e2.t=Date.now();if(!e2.st&&!e2.note)delete db.camEdits[id];save();invalidateCams();toast('Nota guardada')}
  if(t.id==='swZones'){db.settings.alertZones=t.checked;save()}
  if(t.id==='swTrack'){db.settings.track=t.checked;save();toast(t.checked?'Registrando tu recorrido':'Recorrido detenido')}
  if(t.id==='swWake'){db.settings.wake=t.checked;save();wake()}
  if(t.id==='rproj'){ui.regProj=t.value;renderView()}
  if(t.id==='baseSel'){db.settings.base=t.value;setBase(t.value);save()}
  if(t.id==='swPois'){db.settings.showPois=t.checked;renderPois();save()}
  if(t.id==='swAlert'){db.settings.alert=t.checked;save()}
});
body.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='q'){e.target.blur();const r=$('#results [data-a="pt"]');if(r)r.click()}});
new MutationObserver(()=>{const v=$('#viewPhotos');if(v&&!v.dataset.done){v.dataset.done=1;fillPhotos(v,v.dataset.ids.split(','),false)}}).observe(body,{childList:true,subtree:true});

/* ---------- Selección en el mapa (punto con cruz, líneas y áreas tocando) ---------- */
let pick=null;
function startPick(mode,opts){
  pick={mode,pts:[],...opts};document.body.classList.add('picking');setSheet('closed');
  $('#crosshair').hidden=mode!=='point';drawLayer.clearLayers();
  if(mode==='point'){if(opts.start)map.setView(opts.start,Math.max(map.getZoom(),18));}
  else if(opts.start&&opts.start.length){pick.pts=opts.start.slice();}
  map.doubleClickZoom.disable();renderPick();
}
function endPick(){pick=null;document.body.classList.remove('picking');$('#crosshair').hidden=true;$('#pickbar').hidden=true;drawLayer.clearLayers();map.doubleClickZoom.enable()}
function renderPick(ghost){
  const b=$('#pickbar');if(!pick){b.hidden=true;return}
  drawLayer.clearLayers();const n=pick.pts.length,line=pick.mode==='line';
  if(pick.mode!=='point'){const pts=ghost?[...pick.pts,ghost]:pick.pts;
    if(pts.length>1)(line||pts.length<3?L.polyline(pts,{color:'#0E6B47',weight:5,dashArray:'8 6',interactive:false}):L.polygon(pts,{color:'#C92A2A',weight:3,dashArray:'8 6',fillOpacity:.15,interactive:false})).addTo(drawLayer);
    pick.pts.forEach(q=>L.marker(q,{interactive:false,keyboard:false,icon:L.divIcon({className:'vtx',iconSize:null,html:'<span></span>'})}).addTo(drawLayer))}
  const c=pick.mode==='point'?map.getCenter():null,cz=c&&zoneAt([c.lat,c.lng]);
  const meas=line&&n>1?fmtLen(G.lineLength(pick.pts)):pick.mode==='area'&&n>2?fmtArea(G.polyArea(pick.pts)):'';
  b.innerHTML=pick.mode==='point'?`<div class="t">Mueve el mapa hasta poner la cruz sobre el lugar</div><div class="h">${cz?'Cuadrante '+esc(cz.num):'Fuera de los cuadrantes'} · ${esc(revAddr([c.lat,c.lng])?.text||'')}</div>
    <div class="row"><button class="btn" data-p="cancel">Cancelar</button>${gps.ll?'<button class="btn" data-p="gps">Mi GPS</button>':''}<button class="btn primary" data-p="ok" style="flex:1">Confirmar aquí</button></div>`
    :`<div class="t">${line?'Dibuja la vía':'Dibuja la zona'}: toca el mapa en cada esquina o curva</div><div class="h">${n} punto${n===1?'':'s'}${meas?' · <span class="meas">'+meas+'</span>':''}</div>
    <div class="row"><button class="btn" data-p="cancel">Cancelar</button><button class="btn" data-p="undo" ${n?'':'disabled'}>Deshacer</button>${gps.ll?'<button class="btn" data-p="addgps">+ Mi GPS</button>':''}<button class="btn primary" data-p="ok" style="flex:1" ${n>=(line?2:3)?'':'disabled'}>Listo</button></div>`;
  b.hidden=false;
}
$('#pickbar').addEventListener('click',e=>{const a=e.target.closest('[data-p]')?.dataset.p;if(!a||!pick)return;
  if(a==='cancel'){const cb=pick.cancel;endPick();cb&&cb()}
  else if(a==='undo'){pick.pts.pop();renderPick()}
  else if(a==='gps'){map.setView(gps.ll,19);renderPick()}
  else if(a==='addgps'){pick.pts.push(gps.ll.slice());renderPick()}
  else if(a==='ok'){let res;if(pick.mode==='point'){const c=map.getCenter();res=[[+c.lat.toFixed(6),+c.lng.toFixed(6)]]}else res=pick.pts.map(p=>[+p[0].toFixed(6),+p[1].toFixed(6)]);
    const cb=pick.done;endPick();cb(res)}});
L.DomEvent.disableClickPropagation($('#pickbar'));
map.on('move',()=>{if(pick&&pick.mode==='point')renderPickLite()});
let pl;function renderPickLite(){cancelAnimationFrame(pl);pl=requestAnimationFrame(()=>{const h=$('#pickbar .h');if(!h||!pick)return;const c=map.getCenter(),cz=zoneAt([c.lat,c.lng]);
  h.textContent=`${cz?'Cuadrante '+cz.num:'Fuera de los cuadrantes'} · ${revAddr([c.lat,c.lng])?.text||''}`})}
map.on('click',e=>{if(!pick||pick.mode==='point')return;const ll=[e.latlng.lat,e.latlng.lng],last=pick.pts[pick.pts.length-1];
  if(last&&G.dist(last,ll)<1)return;pick.pts.push(ll);renderPick()});
map.on('mousemove',e=>{if(pick&&pick.mode!=='point'&&pick.pts.length)renderPick([e.latlng.lat,e.latlng.lng])});

/* ---------- Formulario de registro ---------- */
function chooseNew(kind,zone){
  if(!kind){openModal('Registrar',`<div class="muted">¿Qué quieres agregar?</div>
    <button class="btn primary block" data-m="k" data-k="lugar">${ICON.plus} Lugar: negocio, empresa, local, residencia…</button>
    <button class="btn block" data-m="k" data-k="via">${ICON.plus} Calle, carrera o vía que falta</button>
    <button class="btn block" data-m="k" data-k="camara">${ICON.cctv} Cámara de seguridad</button>
    <button class="btn block" data-m="k" data-k="zona">${ICON.plus} Zona: crítica, de riesgo, oscura, sector</button>`,{onClick:(a,b)=>{if(a==='k'){closeModal();chooseNew(b.dataset.k,zone)}}});return}
  if(kind==='camara'){const st=gps.ll&&(!zone||zoneAt(gps.ll)===zone)?gps.ll:zone?zone.labelPt:[map.getCenter().lat,map.getCenter().lng];
    startPick('point',{start:st,done:ll=>editRecord(null,{kind:'lugar',cat:'camara',latlngs:ll})});return}
  const start=gps.ll&&(!zone||zoneAt(gps.ll)===zone)?gps.ll:zone?zone.labelPt:[map.getCenter().lat,map.getCenter().lng];
  if(kind==='lugar')startPick('point',{start,done:ll=>editRecord(null,{kind,latlngs:ll})});
  else startPick(kind==='via'?'line':'area',{done:pts=>editRecord(null,{kind,latlngs:pts})});
}
let draft=null;
function editRecord(id,init){
  const r=id?db.records.find(x=>x.id===id):null;
  draft=r?JSON.parse(JSON.stringify(r)):Object.assign({id:uid(),kind:'lugar',cat:'negocio',name:'',addr:'',tel:'',contacto:'',horario:'',notas:'',proyecto:'',photos:[],latlngs:[]},init||{});
  if(draft.kind==='lugar'&&!draft.addr&&draft.latlngs[0])draft.addr=revAddr(draft.latlngs[0])?.text||'';
  if(draft.kind==='via'&&!draft.viaType){const c=G.classify(draft.name);draft.viaType=c?c.type:'calle';draft.viaNum=c?draft.name.replace(/^\S+\s*/,''):draft.name}
  if(draft.kind==='zona'&&!draft.cat)draft.cat='critico';
  renderEditor(!!r);
}
function renderEditor(existing){
  const d=draft,zs=recZones(d),z=zs[0]&&zoneByNum(zs[0]);
  const projects=[...new Set(db.records.map(r=>r.proyecto).filter(Boolean))];
  const loc=`<div class="locbox"><span class="znum" style="--c:${z?z.color:'#868E96'}">${z?esc(z.num):'—'}</span><div style="flex:1;min-width:0"><b>${z?'Cuadrante '+esc(zs.join(', ')):'Fuera de los cuadrantes'}</b>
    <div class="muted small mono">${d.kind==='lugar'?fmtLL(d.latlngs[0]):d.kind==='via'?fmtLen(G.lineLength(d.latlngs))+' · '+d.latlngs.length+' puntos':fmtArea(G.polyArea(d.latlngs))}</div></div>
    <button class="btn sm" data-m="move">${d.kind==='lugar'?'Mover':'Redibujar'}</button></div>`;
  let f='';
  if(d.kind==='lugar')f=`${loc}
    <div class="field"><span class="label">Tipo de lugar</span><div class="catgrid">${CATS.map(c=>`<button class="cat" data-m="cat" data-k="${c.k}" aria-pressed="${d.cat===c.k}"><span class="dot" style="--c:${GROUP_COLOR[c.g]}"></span>${esc(c.l)}</button>`).join('')}</div></div>
    <div class="field"><label for="fName">Nombre</label><input class="input" id="fName" value="${esc(d.name)}" placeholder="Ej: Tienda Don Pedro" maxlength="100"></div>
    <div class="field"><label for="fAddr">Dirección</label><div class="row" style="flex-wrap:nowrap"><input class="input" id="fAddr" value="${esc(d.addr)}" placeholder="Calle 30A # 80-15" maxlength="120"><button class="btn sm" data-m="sugg" title="Calcular desde el mapa">Sugerir</button></div></div>
    <div class="grid2"><div class="field"><label for="fTel">Teléfono</label><input class="input" id="fTel" type="tel" value="${esc(d.tel)}" inputmode="tel" maxlength="40"></div>
    <div class="field"><label for="fHor">Horario</label><input class="input" id="fHor" value="${esc(d.horario)}" placeholder="Lun–Sáb 7–21" maxlength="60"></div></div>
    <div class="field"><label for="fCon">Contacto / propietario / administrador</label><input class="input" id="fCon" value="${esc(d.contacto)}" maxlength="100"></div>
    ${d.cat==='camara'?`<div class="field"><label for="fCamNum">Número de la cámara</label><input class="input" id="fCamNum" value="${esc(d.camNum||'')}" placeholder="Ej: 182, MS-366, privada" maxlength="30"></div>
    <div class="field"><span class="label">Tipo</span><div class="chips wrap">${CAM_TIPOS.map(t=>`<button class="chip" data-m="camtipo" data-k="${esc(t)}" aria-pressed="${d.camTipo===t}">${esc(t)}</button>`).join('')}</div></div>
    <div class="field"><span class="label">Estado</span><div class="chips wrap">${['ok','falla','fuera'].map(k=>`<button class="chip" data-m="camest" data-k="${k}" aria-pressed="${stOf(d.camEstado)===k}"><span class="dot" style="--c:${CAM_ST[k].c}"></span>${CAM_ST[k].l}</button>`).join('')}</div></div>`:''}`;
  else if(d.kind==='via')f=`${loc}
    <div class="field"><span class="label">Tipo de vía</span><div class="chips wrap">${VIA_TYPES.map(([k,l])=>`<button class="chip" data-m="vt" data-k="${k}" aria-pressed="${d.viaType===k}">${l}</button>`).join('')}</div></div>
    <div class="field"><label for="fVia">Número o nombre</label><input class="input" id="fVia" value="${esc(d.viaNum||'')}" placeholder="Ej: 30A, 79C, 9 Sur, Pasaje Los Pinos" maxlength="60"></div>
    <div class="muted small">Las vías que registres se usan en el buscador de direcciones y en la lista de calles del cuadrante.</div>`;
  else f=`${loc}
    <div class="field"><span class="label">Tipo de zona</span><div class="chips wrap">${ZONE_CATS.map(([k,l])=>`<button class="chip" data-m="zc" data-k="${k}" aria-pressed="${d.cat===k}">${l}</button>`).join('')}</div></div>
    <div class="field"><label for="fName">Nombre</label><input class="input" id="fName" value="${esc(d.name)}" placeholder="Ej: Esquina del parque, manzana 4" maxlength="100"></div>`;
  f+=`<div class="field"><label for="fNot">Notas</label><textarea class="input" id="fNot" rows="3" placeholder="Lo que sirva: novedades, referencias, quién atiende…">${esc(d.notas)}</textarea></div>
    <div class="field"><label for="fProj">Proyecto o grupo (opcional)</label><input class="input" id="fProj" list="projList" value="${esc(d.proyecto)}" placeholder="Ej: Censo comercial Cuadrante 7" maxlength="80"><datalist id="projList">${projects.map(p=>`<option value="${esc(p)}">`).join('')}</datalist></div>
    <div class="field"><span class="label">Fotos</span><div class="photos" id="edPhotos"></div><button class="btn" data-m="photo">${ICON.camera} Agregar foto</button></div>
    ${existing?`<button class="btn danger ${ui.confirm==='del'?'armed':''}" data-m="del">${ui.confirm==='del'?'Toca otra vez para eliminar':'Eliminar registro'}</button>`:''}`;
  openModal(existing?'Editar '+KIND_NAME[d.kind].toLowerCase():'Nuevo: '+KIND_NAME[d.kind].toLowerCase(),f,{save:true,onClick:editorClick});
  fillPhotos($('#edPhotos'),d.photos,true);
}
function readForm(){const d=draft,v=id=>{const e=document.getElementById(id);return e?e.value.trim():undefined};if(v('fCamNum')!==undefined)d.camNum=v('fCamNum');
  if(v('fName')!==undefined)d.name=v('fName');if(v('fAddr')!==undefined)d.addr=v('fAddr');if(v('fTel')!==undefined)d.tel=v('fTel');
  if(v('fHor')!==undefined)d.horario=v('fHor');if(v('fCon')!==undefined)d.contacto=v('fCon');if(v('fVia')!==undefined)d.viaNum=v('fVia');
  d.notas=v('fNot')||'';d.proyecto=v('fProj')||''}
function editorClick(a,b){
  const d=draft;
  if(a==='cat'){readForm();d.cat=b.dataset.k;renderEditor(!!db.records.find(r=>r.id===d.id))}
  else if(a==='vt'){readForm();d.viaType=b.dataset.k;renderEditor(!!db.records.find(r=>r.id===d.id))}
  else if(a==='zc'){readForm();d.cat=b.dataset.k;renderEditor(!!db.records.find(r=>r.id===d.id))}
  else if(a==='camtipo'){readForm();d.camTipo=b.dataset.k;renderEditor(!!db.records.find(r=>r.id===d.id))}
  else if(a==='camest'){readForm();d.camEstado=CAM_ST[b.dataset.k].l;renderEditor(!!db.records.find(r=>r.id===d.id))}
  else if(a==='sugg'){const r=revAddr(d.latlngs[0]);if(r){$('#fAddr').value=r.text;toast('Dirección aproximada: revísala')}else toast('No hay calles cerca para calcularla')}
  else if(a==='move'){readForm();const ex=!!db.records.find(r=>r.id===d.id);closeModal();
    if(d.kind==='lugar')startPick('point',{start:d.latlngs[0],done:ll=>{d.latlngs=ll;d.addr=d.addr||revAddr(ll[0])?.text||'';renderEditor(ex)},cancel:()=>renderEditor(ex)});
    else startPick(d.kind==='via'?'line':'area',{done:pts=>{d.latlngs=pts;renderEditor(ex)},cancel:()=>renderEditor(ex)})}
  else if(a==='photo'){readForm();$('#filePhoto').click()}
  else if(a==='rmphoto'){d.photos=d.photos.filter(x=>x!==b.dataset.id);Store.del('photos',b.dataset.id);fillPhotos($('#edPhotos'),d.photos,true)}
  else if(a==='del'){if(ui.confirm!=='del'){ui.confirm='del';readForm();renderEditor(true);return}
    ui.confirm=null;(d.photos||[]).forEach(p=>Store.del('photos',p));db.records=db.records.filter(r=>r.id!==d.id);afterChange();closeModal();if(ui.view==='place')goBack();toast('Registro eliminado')}
}
function saveDraft(){
  readForm();const d=draft;
  if(d.kind==='via'){if(!d.viaNum){toast('Escribe el número o nombre de la vía');return}
    const tn=VIA_TYPES.find(t=>t[0]===d.viaType)?.[1]||'';d.name=(['pasaje','otro'].includes(d.viaType)?d.viaNum:tn+' '+d.viaNum).replace(/\s+/g,' ').trim()
      .replace(/(\d)\s*([a-z]{1,3})\b/gi,(m,a,s)=>/^sur$/i.test(s)?a+' Sur':/^bis$/i.test(s)?a+' Bis':a+s.toUpperCase()).replace(/\bsur\b/gi,'Sur')}
  if(!d.name)d.name=d.kind==='lugar'?(CAT[d.cat]?.l||'Lugar'):(ZONE_CATS.find(z=>z[0]===d.cat)?.[1]||'Zona');
  d.updated=Date.now();if(!d.created)d.created=d.updated;
  const i=db.records.findIndex(r=>r.id===d.id);if(i>=0)db.records[i]=d;else db.records.push(d);
  afterChange();closeModal();ui.confirm=null;
  const zs=recZones(d);toast(`Guardado${zs.length?' · Cuadrante '+zs.join(', '):''}`);
  openRecord(d.id);
}
function afterChange(){invalidateCams();renderCams();save();if(draft&&draft.kind==='via'||db.records.some(r=>r.kind==='via'))rebuildIndex();renderRecordsMap();renderPois();if(sheetOpen()&&ui.view!=='place')renderView()}

/* Modal genérico */
let modalOpts=null;
function openModal(title,html,opts){modalOpts=opts||{};const m=$('#modal');
  m.innerHTML=`<div class="modal-head"><button class="back" data-m="x" aria-label="Cerrar">${ICON.close}</button><h2>${esc(title)}</h2>${modalOpts.save?'<button class="btn primary" data-m="save">Guardar</button>':''}</div><div class="modal-body">${html}</div>`;
  m.hidden=false}
function closeModal(){$('#modal').hidden=true;$('#modal').innerHTML='';modalOpts=null}
$('#modal').addEventListener('click',e=>{const b=e.target.closest('[data-m]');if(!b)return;const a=b.dataset.m;
  if(a==='x'){closeModal();ui.confirm=null;return}if(a==='save'){saveDraft();return}if(modalOpts&&modalOpts.onClick)modalOpts.onClick(a,b)});

/* Fotos */
$('#filePhoto').addEventListener('change',async e=>{const f=e.target.files[0];e.target.value='';if(!f||!draft)return;
  try{const url=await shrink(f,1280,.72);const id='ph'+uid();await Store.set('photos',id,url);draft.photos=[...(draft.photos||[]),id];fillPhotos($('#edPhotos'),draft.photos,true)}
  catch(err){toast('No se pudo leer la foto')}});
function shrink(file,max,q){return new Promise((res,rej)=>{const img=new Image(),u=URL.createObjectURL(file);
  img.onload=()=>{const s=Math.min(1,max/Math.max(img.width,img.height)),c=document.createElement('canvas');c.width=Math.round(img.width*s);c.height=Math.round(img.height*s);
    c.getContext('2d').drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(u);res(c.toDataURL('image/jpeg',q))};img.onerror=rej;img.src=u})}
async function fillPhotos(el,ids,editable){if(!el)return;el.innerHTML='';for(const id of ids||[]){const src=await Store.get('photos',id);if(!src)continue;
  const f=document.createElement('figure');f.innerHTML=`<img src="${src}" alt="Foto del registro">${editable?`<button class="x" data-m="rmphoto" data-id="${id}" aria-label="Quitar foto">×</button>`:''}`;el.appendChild(f)}}

/* ---------- Exportar / importar ---------- */
const slug=s=>norm(s||'registros').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'registros';
function recordsForExport(){return db.records.filter(r=>!ui.regProj||r.proyecto===ui.regProj)}
function exportRecords(fmt){
  const list=recordsForExport();if(!list.length){toast('No hay registros para exportar');return}
  const name=slug(ui.regProj||'registros-cuadrantes')+'-'+new Date().toISOString().slice(0,10);
  const kindLabel=r=>r.kind==='lugar'?(CAT[r.cat]?.l||''):r.kind==='via'?'Vía':(ZONE_CATS.find(z=>z[0]===r.cat)?.[1]||'Zona');
  if(fmt==='csv'){const cols=['Tipo','Categoría','Nombre','Dirección','Teléfono','Contacto','Horario','Cuadrante','Barrio','Latitud','Longitud','Proyecto','Notas','Fecha'];
    const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
    const rows=list.map(r=>{const c=r.kind==='zona'?G.centroid(r.latlngs):r.latlngs[0];const zs=recZones(r);
      return[KIND_NAME[r.kind],kindLabel(r),r.name,r.addr,r.tel,r.contacto,r.horario,zs.join(' '),barrioAt(c,zs[0]&&zoneByNum(zs[0])),c[0].toFixed(6),c[1].toFixed(6),r.proyecto,r.notas,new Date(r.created).toLocaleString('es-CO')].map(q).join(';')});
    saveFile(name+'.csv','﻿'+cols.map(q).join(';')+'\n'+rows.join('\n'),'text/csv');return}
  if(fmt==='geojson'){const c=ll=>[ll[1],ll[0]];
    saveFile(name+'.geojson',JSON.stringify({type:'FeatureCollection',features:list.map(r=>({type:'Feature',properties:{tipo:KIND_NAME[r.kind],categoria:kindLabel(r),nombre:r.name,direccion:r.addr||'',telefono:r.tel||'',contacto:r.contacto||'',horario:r.horario||'',notas:r.notas||'',proyecto:r.proyecto||'',cuadrantes:recZones(r)},
      geometry:r.kind==='lugar'?{type:'Point',coordinates:c(r.latlngs[0])}:r.kind==='via'?{type:'LineString',coordinates:r.latlngs.map(c)}:{type:'Polygon',coordinates:[[...r.latlngs,r.latlngs[0]].map(c)]}}))},null,1),'application/geo+json');return}
  const c=ll=>`${ll[1]},${ll[0]},0`;
  const pm=list.map(r=>{const g=r.kind==='lugar'?`<Point><coordinates>${c(r.latlngs[0])}</coordinates></Point>`:r.kind==='via'?`<LineString><tessellate>1</tessellate><coordinates>${r.latlngs.map(c).join(' ')}</coordinates></LineString>`:`<Polygon><outerBoundaryIs><LinearRing><coordinates>${[...r.latlngs,r.latlngs[0]].map(c).join(' ')}</coordinates></LinearRing></outerBoundaryIs></Polygon>`;
    const data={Tipo:KIND_NAME[r.kind],Categoria:kindLabel(r),Direccion:r.addr,Telefono:r.tel,Contacto:r.contacto,Horario:r.horario,Cuadrantes:recZones(r).join(', '),Proyecto:r.proyecto};
    return`<Placemark><name>${esc(r.name)}</name><description>${esc(r.notas||'')}</description><styleUrl>#${r.kind}</styleUrl><ExtendedData>${Object.entries(data).filter(x=>x[1]).map(([k,v])=>`<Data name="${k}"><value>${esc(v)}</value></Data>`).join('')}</ExtendedData>${g}</Placemark>`}).join('\n');
  saveFile(name+'.kml',`<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(ui.regProj||'Registros cuadrantes Belén')}</name>
<Style id="lugar"><IconStyle><color>ff47b52f</color></IconStyle></Style><Style id="via"><LineStyle><color>ff476b0e</color><width>4</width></LineStyle></Style><Style id="zona"><LineStyle><color>ff2a2ac9</color><width>2</width></LineStyle><PolyStyle><color>552a2ac9</color></PolyStyle></Style>
${pm}\n</Document></kml>`,'application/vnd.google-earth.kml+xml');
}
async function backup(){
  const photos={};for(const r of db.records)for(const p of r.photos||[]){const v=await Store.get('photos',p);if(v)photos[p]=v}
  saveFile('respaldo-cuadrantes-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify({app:'cuadrantes-belen',version:1,exported:new Date().toISOString(),records:db.records,photos}),'application/json');
}
$('#fileImport').addEventListener('change',async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;
  try{const text=await f.text();let recs=[],photos={};
    if(/\.kml$/i.test(f.name)||/^\s*<\?xml|<kml/i.test(text.slice(0,300))){const k=parseKML(text);
      recs=[...k.points.map(p=>({kind:'lugar',cat:'otro',name:p.name,notas:p.desc,latlngs:[p.ll]})),...k.lines.map(l=>({kind:'via',name:l.name||'Vía',viaType:'otro',viaNum:l.name||'Vía',notas:l.desc,latlngs:l.pts})),
        ...k.polys.map(g=>({kind:'zona',cat:'otro',name:g.name||'Zona',notas:g.desc,latlngs:g.rings[0].slice(0,-1)}))]}
    else{const j=JSON.parse(text);
      if(Array.isArray(j.records)){recs=j.records;photos=j.photos||{}}
      else if(j.type==='FeatureCollection')recs=j.features.map(ft=>{const g=ft.geometry||{},p=ft.properties||{},c=x=>[x[1],x[0]];
        const base={name:p.nombre||p.name||'',addr:p.direccion||'',tel:p.telefono||'',contacto:p.contacto||'',notas:p.notas||'',proyecto:p.proyecto||''};
        if(g.type==='Point')return{...base,kind:'lugar',cat:(CATS.find(c=>c.l===p.categoria)||{k:'otro'}).k,latlngs:[c(g.coordinates)]};
        if(g.type==='LineString')return{...base,kind:'via',viaType:'otro',viaNum:base.name,latlngs:g.coordinates.map(c)};
        if(g.type==='Polygon')return{...base,kind:'zona',cat:'otro',latlngs:g.coordinates[0].slice(0,-1).map(c)};return null}).filter(Boolean);
      else throw new Error('formato no reconocido')}
    const have=new Set(db.records.map(r=>r.id));let n=0;
    for(const r of recs){if(!r||!Array.isArray(r.latlngs)||!r.latlngs.length||!KIND_NAME[r.kind])continue;
      const id=r.id&&!have.has(r.id)?r.id:uid();const ph=[];for(const p of r.photos||[]){if(photos[p]){await Store.set('photos',p,photos[p]);ph.push(p)}}
      db.records.push({created:Date.now(),photos:[],...r,photos:ph,id,name:r.name||KIND_NAME[r.kind]});n++}
    draft=null;afterChange();rebuildIndex();toast(`${n} registros importados`);go('registros');
  }catch(err){toast('No se pudo importar: '+err.message)}});
function parseKML(text){
  let doc=new DOMParser().parseFromString(text,'application/xml');
  if(doc.getElementsByTagName('parsererror').length)doc=new DOMParser().parseFromString(text.replace(/\s[a-zA-Z]+:schemaLocation="[^"]*"/g,''),'application/xml');
  if(doc.getElementsByTagName('parsererror').length)throw new Error('el archivo no es un KML válido');
  const all=(el,t)=>Array.from(el.getElementsByTagNameNS('*',t)),one=(el,t)=>all(el,t)[0],child=(el,t)=>Array.from(el.children).find(c=>c.localName===t);
  const coords=el=>el.textContent.trim().split(/\s+/).map(s=>s.split(',').map(Number)).filter(c=>c.length>=2&&isFinite(c[0])&&isFinite(c[1])).map(c=>[+c[1].toFixed(6),+c[0].toFixed(6)]);
  const d=one(doc,'Document')||one(doc,'Folder');const out={name:((d&&child(d,'name')?.textContent)||'KML').trim(),polys:[],points:[],lines:[]};
  const styles={};all(doc,'Style').forEach(st=>{const c=one(st,'IconStyle');const col=c&&one(c,'color');if(st.getAttribute('id')&&col)styles['#'+st.getAttribute('id')]=col.textContent.trim().toLowerCase()});
  all(doc,'StyleMap').forEach(sm=>{all(sm,'Pair').forEach(pr=>{if((one(pr,'key')?.textContent||'').trim()==='normal')styles['#'+sm.getAttribute('id')]=styles[(one(pr,'styleUrl')?.textContent||'').trim()]})});
  for(const pm of all(doc,'Placemark')){const name=(child(pm,'name')?.textContent||'').trim(),attrs={};
    all(pm,'Data').forEach(x=>{const k=x.getAttribute('name');if(k)attrs[k]=(one(x,'value')?.textContent||'').trim()});
    all(pm,'SimpleData').forEach(x=>{const k=x.getAttribute('name');if(k)attrs[k]=x.textContent.trim()});
    const desc=child(pm,'description')?.textContent||'';const re=/<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>/gi;let m;while((m=re.exec(desc))){const k=m[1].trim();if(k&&!(k in attrs))attrs[k]=m[2].trim()}
    const plain=/<td>/i.test(desc)?'':desc.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
    for(const pg of all(pm,'Polygon')){const rings=[],ob=one(pg,'outerBoundaryIs');if(ob&&one(ob,'coordinates'))rings.push(coords(one(ob,'coordinates')));
      all(pg,'innerBoundaryIs').forEach(ib=>{const c=one(ib,'coordinates');if(c)rings.push(coords(c))});if(rings.length&&rings[0].length>2)out.polys.push({name,attrs,rings,desc:plain})}
    for(const ls of all(pm,'LineString')){const c=one(ls,'coordinates');if(c){const p=coords(c);if(p.length>1)out.lines.push({name,attrs,pts:p,desc:plain})}}
    const color=styles[(child(pm,'styleUrl')?.textContent||'').trim()]||'';
    for(const pt of all(pm,'Point')){const c=one(pt,'coordinates');if(c){const p=coords(c);if(p.length)out.points.push({name,attrs,ll:p[0],desc:plain||desc.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim(),color})}}}
  return out;
}
$('#fileKml').addEventListener('change',async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;
  try{const k=parseKML(await f.text());if(!k.polys.length)throw new Error('no tiene polígonos');base=k;await Store.set('kv','base',k);reloadBase();toast(`${k.polys.length} zonas cargadas`)}
  catch(err){toast('No se pudo leer el KML: '+err.message)}});
/* Mis cámaras (KML de la estación): número, estado por color o por nota, sedes policiales. */
const KML_ST={'ff2257ff':'ok','ff07c1ff':'fuera','ffb0279c':'falla'};
$('#fileCams').addEventListener('change',async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;
  try{const k=parseKML(await f.text()),cl=[],sd=[];
    for(const p of k.points){const m=p.name.match(/c[aá]m(?:ara)?\.?\s*(?:n[°ºo.]?\s*)?0*(\d+)/i);
      if(m){const nst=stOf(p.desc);cl.push({id:uid(),num:m[1],name:p.name,note:p.desc,ll:p.ll,st:(nst!=='nd'&&nst!=='ok'?nst:KML_ST[p.color])||'ok'})}
      else if(/\b(cai|estaci[oó]n|subestaci[oó]n|polic)/i.test(p.name))sd.push({name:p.name,ll:p.ll})}
    if(!cl.length&&!sd.length)throw new Error('no encontré puntos con nombre «CAM 123»');
    db.camKml=cl;db.sedes=sd;save();invalidateCams();renderCams();
    const m=cams().filter(c=>c.mine&&c.src!=='kml').length;toast(`${cl.length} cámaras importadas · ${m} coinciden con la Alcaldía · ${sd.length} sedes`);if(sheetOpen())renderView();
  }catch(err){toast('No se pudo leer: '+err.message)}});
/* Delitos recientes desde CSV (MEData, SIEDCO u otra fuente con latitud y longitud). */
$('#fileCsv').addEventListener('change',async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;
  try{const txt=(await f.text()).replace(/^\ufeff/,''),lines=txt.split(/\r?\n/).filter(Boolean),sep=(lines[0].match(/;/g)||[]).length>(lines[0].match(/,/g)||[]).length?';':',';
    const split=l=>{const o=[];let cur='',q=false;for(const ch of l){if(ch==='"'){q=!q}else if(ch===sep&&!q){o.push(cur);cur=''}else cur+=ch}o.push(cur);return o.map(x=>x.trim())};
    const H=split(lines[0]).map(norm),col=(...ks)=>H.findIndex(h=>ks.some(k=>h===k||h.includes(k)));
    const iLa=col('latitud','lat'),iLo=col('longitud','lon','lng'),iF=col('fecha_hecho','fecha'),iT=col('conducta','delito','tipo','categoria'),iM=col('modalidad');
    if(iLa<0||iLo<0)throw new Error('el CSV necesita columnas de latitud y longitud');
    const rows=[];for(let i=1;i<lines.length;i++){const c=split(lines[i]),la=+String(c[iLa]).replace(',','.'),lo=+String(c[iLo]).replace(',','.');if(!isFinite(la)||!isFinite(lo)||!la)continue;
      const fm=String(iF>=0?c[iF]:'').match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})|(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
      const ymd=fm?(fm[1]?+fm[1]*1e4+ +fm[2]*100+ +fm[3]:+fm[6]*1e4+ +fm[5]*100+ +fm[4]):0;
      const z=zoneAt([la,lo]);rows.push([la,lo,(iT>=0&&c[iT]?c[iT]:'Delito').trim(),(iM>=0?c[iM]:'').trim(),ymd,z?z.num:''])}
    if(!rows.length)throw new Error('no hay filas con coordenadas');
    await Store.set('kv','delImp',rows);loadImp(rows);renderHeat();if(sheetOpen())renderView();toast(`${rows.length} delitos importados (${rows.filter(r=>r[5]).length} en Belén)`);
  }catch(err){toast('No se pudo importar: '+err.message)}});
function loadImp(rows){const ci=n=>{const k=n.charAt(0).toUpperCase()+n.slice(1).toLowerCase();let i=AL.delCats.indexOf(k);if(i<0){AL.delCats.push(k);i=AL.delCats.length-1}return i};
  const mi=n=>{if(!n)return-1;let i=AL.delMods.indexOf(n);if(i<0){AL.delMods.push(n);i=AL.delMods.length-1}return i};
  delImp=rows.map(r=>[r[0],r[1],ci(r[2]),mi(r[3]),r[4],r[5]]);delYears=null}
function toggleAssign(n){const a=db.settings.assigned,i=a.indexOf(n);i>=0?a.splice(i,1):a.push(n);a.sort((x,y)=>x-y);gps.outAssigned=undefined;if(gps.ll)checkAlerts(gps.ll,gps.zone);save();renderGps();
  toast(a.length?'Cuadrantes asignados: '+a.join(', '):'Sin cuadrante asignado')}
let wakeLock=null;async function wake(){try{if(db.settings.wake&&navigator.wakeLock&&document.visibilityState==='visible'){wakeLock=await navigator.wakeLock.request('screen')}else if(!db.settings.wake&&wakeLock){await wakeLock.release();wakeLock=null}}catch(e){}}
document.addEventListener('visibilitychange',()=>{if(db.settings.wake)wake()});
function exportCams(list,name){const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
  const cols=['Fuente','Número','Tipo','Dirección','Estado','Estado oficial','Mi nota','Mi KML','Cuadrante','Barrio','Instalada','Latitud','Longitud'];
  const rows=list.map(c=>[CAM_SRC[c.src],c.num,c.tipo,c.dir,CAM_ST[c.st].l,c.estOf,c.note,c.mine?c.mine.name:'',c.z||'',c.barrio||'',c.inst||'',c.ll[0],c.ll[1]].map(q).join(';'));
  saveFile(name+'-'+new Date().toISOString().slice(0,10)+'.csv','\ufeff'+cols.map(q).join(';')+'\n'+rows.join('\n'),'text/csv')}
function exportTrack(){const k=todayKey(),t=db.track[k]||[];if(t.length<2){toast('Aún no hay recorrido hoy');return}
  saveFile('recorrido-'+k+'.kml',`<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Recorrido ${k}</name><Placemark><name>Recorrido ${k} · ${fmtLen(trackStats(k).m)}</name><Style><LineStyle><color>ffe06f1d</color><width>4</width></LineStyle></Style><LineString><tessellate>1</tessellate><coordinates>${t.map(p=>p[1]+','+p[0]+',0').join(' ')}</coordinates></LineString></Placemark></Document></kml>`,'application/vnd.google-earth.kml+xml')}
function reloadBase(){buildZones();renderZonesMap();gps.zone=gps.ll?zoneAt(gps.ll):null;renderGps();fitAll();ui.zoneId=null;if(sheetOpen())go('mas')}

/* ---------- Mapa sin señal ---------- */
async function downloadTiles(btn){
  if(!tileCache)return;btn.disabled=true;
  const b=zoneLayer.getBounds(),urls=[],tpl=BASES[db.settings.base].u;
  for(let z=12;z<=17;z++){const p1=map.project(b.getNorthWest(),z).divideBy(256).floor(),p2=map.project(b.getSouthEast(),z).divideBy(256).floor();
    for(let x=p1.x;x<=p2.x;x++)for(let y=p1.y;y<=p2.y;y++){
      if(z>=16){const c=map.unproject(L.point((x+.5)*256,(y+.5)*256),z);if(!zones.some(zz=>G.dist([c.lat,c.lng],G.nearestOnLine([c.lat,c.lng],zz.rings[0]).ll)<400||G.inPoly([c.lat,c.lng],zz.rings)))continue}
      urls.push(tpl.replace('{z}',z).replace('{x}',x).replace('{y}',y))}}
  let done=0,fail=0;const bar=$('#dlBar'),msg=$('#dlMsg'),upd=()=>{if(bar)bar.style.width=(done/urls.length*100).toFixed(1)+'%';if(msg)msg.textContent=`${done} de ${urls.length} partes del mapa${fail?' · '+fail+' fallaron':''}`};
  const queue=urls.slice();
  async function worker(){while(queue.length){const u=queue.shift();try{if(!await tileCache.match(u)){const r=await fetch(u,{mode:'cors'});if(r.ok)await tileCache.put(u,r);else fail++}}catch(e){fail++}done++;if(done%10===0)upd()}}
  await Promise.all([1,2,3,4,5,6].map(worker));upd();btn.disabled=false;toast(fail?`Mapa descargado con ${fail} fallas. Repite con buena señal.`:'Mapa listo para usar sin señal');
}

/* ---------- Botón atrás de Android ---------- */
function handleBack(){
  if(!$('#modal').hidden){closeModal();return true}
  if(pick){const cb=pick.cancel;endPick();cb&&cb();return true}
  if(sheetOpen()){if(ui.stack.length)goBack();else{setSheet('closed');highlight(null)}return true}
  return false;
}
if(P.App)P.App.addListener('backButton',()=>{if(!handleBack())P.App.minimizeApp?P.App.minimizeApp():P.App.exitApp()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')handleBack()});

/* ---------- Arranque ---------- */
(async function boot(){
  await Store.open();
  try{if(window.caches&&window.isSecureContext)tileCache=await caches.open('tiles-v1')}catch(e){tileCache=null}
  const saved=await Store.get('kv','db');if(saved&&Array.isArray(saved.records)){const st=saved.settings||{};
    db=Object.assign(db,saved,{settings:Object.assign(db.settings,st,{layers:Object.assign({},DEF_SETTINGS.layers,st.layers||{}),heat:Object.assign({},DEF_SETTINGS.heat,st.heat||{}),assigned:st.assigned||[]})});
    db.camEdits=db.camEdits||{};db.camKml=db.camKml||[];db.sedes=db.sedes||[];db.track=db.track||{}}
  const di=await Store.get('kv','delImp');if(Array.isArray(di)&&di.length)loadImp(di);
  nx=G.buildNomIndex(AL.nom);
  const sb=await Store.get('kv','base');if(sb&&sb.polys&&sb.polys.length)base=sb;
  buildZones();rebuildIndex();setBase(db.settings.base);renderZonesMap();renderVecinos();renderRecordsMap();renderHeat();renderTrack();fitAll();renderCams();renderGps();wake();
  if(NATIVE){try{P.StatusBar&&P.StatusBar.setBackgroundColor&&P.StatusBar.setBackgroundColor({color:matchMedia('(prefers-color-scheme: dark)').matches?'#151D1A':'#FFFFFF'});
    P.StatusBar&&P.StatusBar.setStyle&&P.StatusBar.setStyle({style:matchMedia('(prefers-color-scheme: dark)').matches?'DARK':'LIGHT'})}catch(e){}
    try{P.SplashScreen&&P.SplashScreen.hide()}catch(e){}}
  if(NATIVE||db.settings.gpsAsked){startGps()}
  db.settings.gpsAsked=true;save();
  $('#btnLocate').classList.toggle('on',!!db.settings.follow);
  if(P.App)P.App.addListener('appStateChange',s=>{if(s.isActive&&gps.on)renderGps()});
  window.__app={G,zones:()=>zones,places,cams,db:()=>db,ix:()=>ix,nx:()=>nx,onPos,openZone,showPoint,openCam,setTarget};
})();
})();
