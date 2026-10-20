/* Geometría y nomenclatura de Medellín (Calle # Carrera - metros).
   Funciones puras: se usan en la app y en las pruebas de Node. */
(function(root){
'use strict';
const R=6378137, rad=d=>d*Math.PI/180;
const LAT0=6.22, KX=111320*Math.cos(rad(LAT0)), KY=110574;
const xy=ll=>[ll[1]*KX,ll[0]*KY];
const unxy=p=>[p[1]/KY,p[0]/KX];

function dist(a,b){const dLat=rad(b[0]-a[0]),dLng=rad(b[1]-a[1]);
  const h=Math.sin(dLat/2)**2+Math.cos(rad(a[0]))*Math.cos(rad(b[0]))*Math.sin(dLng/2)**2;return 2*R*Math.asin(Math.sqrt(h))}
function lineLength(p){let s=0;for(let i=1;i<p.length;i++)s+=dist(p[i-1],p[i]);return s}
function polyArea(p){if(p.length<3)return 0;let a=0;
  for(let i=0;i<p.length;i++){const p1=p[i],p2=p[(i+1)%p.length];a+=rad(p2[1]-p1[1])*(2+Math.sin(rad(p1[0]))+Math.sin(rad(p2[0])))}
  return Math.abs(a*R*R/2)}
function perimeter(p){return p.length<2?0:lineLength(p)+dist(p[p.length-1],p[0])}
function inRing(pt,ring){let ins=false;const y=pt[0],x=pt[1];
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){const yi=ring[i][0],xi=ring[i][1],yj=ring[j][0],xj=ring[j][1];
    if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi))ins=!ins}return ins}
function inPoly(pt,rings){if(!inRing(pt,rings[0]))return false;for(let k=1;k<rings.length;k++)if(inRing(pt,rings[k]))return false;return true}
function centroid(p){let a=0,b=0;p.forEach(q=>{a+=q[0];b+=q[1]});return[a/p.length,b/p.length]}
function bboxOf(pts){let a=90,b=180,c=-90,d=-180;for(const p of pts){if(p[0]<a)a=p[0];if(p[1]<b)b=p[1];if(p[0]>c)c=p[0];if(p[1]>d)d=p[1]}return[a,b,c,d]}

/* Punto más cercano sobre un segmento, en metros (proyección local). */
function projSeg(p,a,b){
  const P=xy(p),A=xy(a),B=xy(b),dx=B[0]-A[0],dy=B[1]-A[1],L=dx*dx+dy*dy;
  let t=L?((P[0]-A[0])*dx+(P[1]-A[1])*dy)/L:0;t=Math.max(0,Math.min(1,t));
  const Q=[A[0]+t*dx,A[1]+t*dy];return{d:Math.hypot(P[0]-Q[0],P[1]-Q[1]),ll:unxy(Q),t};
}
function nearestOnLine(p,pts){let best={d:Infinity};for(let i=1;i<pts.length;i++){const r=projSeg(p,pts[i-1],pts[i]);if(r.d<best.d){best=r;best.i=i}}return best}
function segX(a,b,c,d){
  const A=xy(a),B=xy(b),C=xy(c),D=xy(d);
  const r=[B[0]-A[0],B[1]-A[1]],s=[D[0]-C[0],D[1]-C[1]],den=r[0]*s[1]-r[1]*s[0];
  if(Math.abs(den)<1e-9)return null;
  const t=((C[0]-A[0])*s[1]-(C[1]-A[1])*s[0])/den,u=((C[0]-A[0])*r[1]-(C[1]-A[1])*r[0])/den;
  if(t<-.02||t>1.02||u<-.02||u>1.02)return null;
  return unxy([A[0]+t*r[0],A[1]+t*r[1]]);
}

/* ---------- Nomenclatura ---------- */
const TYPES=[
  ['calle',/^(calle|cll?|cl|clle)\.?$/i],['carrera',/^(carrera|cra|cr|kra|kr|k|carr)\.?$/i],
  ['diagonal',/^(diagonal|dg|diag)\.?$/i],['transversal',/^(transversal|tv|tr|trans|transv)\.?$/i],
  ['circular',/^(circular|cq|cir|circ)\.?$/i],['avenida',/^(avenida|av|avda)\.?$/i]];
const FAMILY={calle:'calle',diagonal:'calle',carrera:'carrera',transversal:'carrera',circular:'circular',avenida:null};
const CROSS={calle:'carrera',carrera:'calle'};
const TYPE_NAME={calle:'Calle',carrera:'Carrera',diagonal:'Diagonal',transversal:'Transversal',circular:'Circular',avenida:'Avenida'};
// Avenidas numeradas de Medellín que son calles o carreras.
const AV_ALIAS={'80':'carrera','70':'carrera','65':'carrera','33':'calle','30':'calle','10':'calle','76':'carrera','43a':'carrera'};
function typeOf(w){for(const[t,re]of TYPES)if(re.test(w))return t;return null}
function sufVal(s){if(!s)return 0;s=s.toUpperCase();let v=(s.charCodeAt(0)-64)*.1;if(s.length>1)v+=.05*(s.length-1);return Math.min(v,.95)}
function makeKey(num,suf,sur){return `${num}${(suf||'').toUpperCase()}${sur?'S':''}`}
function numVal(num,suf,sur){const v=num+sufVal(suf);return sur?-v:v}

/* Clasifica un nombre de vía: "Calle 33AA", "Carrera 79C", "Calle 9A Sur", "Avenida 80". */
function classify(name){
  const m=String(name||'').trim().match(/^([A-Za-zÁÉÍÓÚáéíóú.]+)\s+(?:(calle|carrera|cra|cl)\s+)?(\d{1,3})\s*(?!sur\b)([A-Za-z]{0,3})\b\s*(sur)?/i);
  if(!m)return null;
  let type=typeOf(m[1]);if(!type)return null;
  if(type==='avenida'){
    if(m[2])type=typeOf(m[2]);
    else{const a=AV_ALIAS[(m[3]+(m[4]||'')).toLowerCase()]||AV_ALIAS[m[3]];if(!a)return{type:'avenida',fam:null,num:+m[3],suf:(m[4]||'').toUpperCase(),sur:!!m[5]};type=a}
  }
  const suf=(m[4]||'').toUpperCase(),sur=!!m[5],num=+m[3];
  return{type,fam:FAMILY[type],num,suf,sur,key:makeKey(num,suf,sur),val:numVal(num,suf,sur)};
}
function label(c){return c?`${TYPE_NAME[c.type]} ${c.num}${c.suf}${c.sur?' Sur':''}`:''}

/* Índice de vías: OSM + vías registradas a mano. */
function buildIndex(osmStreets,manual){
  const list=[];
  const add=(name,pts,src,alt)=>{if(pts.length<2)return;
    const names=[name,...(alt||[])],cls=names.map(classify).find(c=>c&&c.fam)||classify(name);
    list.push({name,cls,pts,bb:bboxOf(pts),src})};
  for(const s of osmStreets){const pts=[];for(let i=0;i<s.g.length;i+=2)pts.push([s.g[i],s.g[i+1]]);add(s.n,pts,'osm',s.alt)}
  for(const v of manual||[])add(v.name,v.latlngs,'mine');
  const byFam={calle:[],carrera:[],circular:[]};
  list.forEach((s,i)=>{if(s.cls&&s.cls.fam)byFam[s.cls.fam].push(i)});
  return{list,byFam,xcache:new Map()};
}
function bbNear(a,b,m){const e=m/111000;return!(a[2]+e<b[0]||b[2]+e<a[0]||a[3]+e<b[1]||b[3]+e<a[1])}

/* Cruces de todas las vías de una familia con la vía i (calle → carreras, carrera → calles). */
function crossings(ix,fam,targets){
  const ck=fam+'|'+targets.join(',');if(ix.xcache.has(ck))return ix.xcache.get(ck);
  const other=CROSS[fam],out=[];
  for(const ti of targets){const S=ix.list[ti];
    for(const ci of ix.byFam[other]||[]){const C=ix.list[ci];if(!bbNear(S.bb,C.bb,15))continue;
      let hit=null;
      for(let i=1;i<S.pts.length&&!hit;i++)for(let j=1;j<C.pts.length;j++){
        const p=segX(S.pts[i-1],S.pts[i],C.pts[j-1],C.pts[j]);if(p){hit=p;break}}
      if(!hit){ // vías que terminan sin cruzar exactamente
        for(const q of [C.pts[0],C.pts[C.pts.length-1]]){const r=nearestOnLine(q,S.pts);if(r.d<12){hit=r.ll;break}}}
      if(hit)out.push({ll:hit,cls:C.cls,name:C.name});
    }}
  ix.xcache.set(ck,out);return out;
}
function streetsByKey(ix,c){return(ix.byFam[c.fam]||[]).filter(i=>{const k=ix.list[i].cls;return k.key===c.key&&(k.type===c.type||FAMILY[k.type]===c.fam)})}

/* "Calle 30A # 80-15", "CL 30 A 80 15", "Cra. 76 No. 32-10", "Kr 80 # 9A Sur - 20" */
function parseAddress(text){
  const t=String(text||'').replace(/[Nn][°ºo]\.?|#|No\.|Nº/g,' # ').replace(/[,]/g,' ').replace(/\s+/g,' ').trim();
  const m=t.match(/^([A-Za-zÁÉÍÓÚáéíóú.]+)\.?\s*(\d{1,3})\s*(?!sur\b)([A-Za-z]{0,3})\b\s*(sur\b)?\s*(?:#\s*)?(\d{1,3})\s*(?!sur\b)([A-Za-z]{0,3})\b\s*(sur\b)?\s*(?:-|\s)?\s*(\d{1,3})?/i);
  if(!m)return null;
  let type=typeOf(m[1]);if(!type)return null;
  if(type==='avenida'){const a=AV_ALIAS[m[2]];if(!a)return null;type=a}
  const s1=(m[3]||'').toUpperCase(),s2=(m[6]||'').toUpperCase();
  if(/^sur$/i.test(s1)||/^sur$/i.test(s2))return null;
  return{type,fam:FAMILY[type],num:+m[2],suf:s1,sur:!!m[4],xnum:+m[5],xsuf:s2,xsur:!!m[7],m:m[8]?+m[8]:0};
}

/* Dirección → coordenadas, interpolando entre los cruces conocidos. */
function geocode(ix,text){
  const a=parseAddress(text);if(!a||!a.fam||a.fam==='circular')return null;
  const c={type:a.type,fam:a.fam,key:makeKey(a.num,a.suf,a.sur)};
  let main=streetsByKey(ix,c),approx=false;
  if(!main.length){main=(ix.byFam[a.fam]||[]).filter(i=>{const k=ix.list[i].cls;return k.num===a.num&&k.sur===a.sur});approx=true}
  if(!main.length)return{error:`No encuentro la ${TYPE_NAME[a.type].toLowerCase()} ${a.num}${a.suf}${a.sur?' Sur':''} en la zona.`};
  const xs=crossings(ix,a.fam,main).filter(x=>x.cls&&x.cls.val!=null);
  if(!xs.length)return{error:'Encontré la vía pero no sus cruces.'};
  const want=numVal(a.xnum,a.xsuf,a.xsur),wantKey=makeKey(a.xnum,a.xsuf,a.xsur);
  const exact=xs.filter(x=>x.cls.key===wantKey);
  let base,next,note='';
  const sorted=[...xs].sort((p,q)=>p.cls.val-q.cls.val);
  if(exact.length){base=exact[0];next=sorted.find(x=>x.cls.val>want&&dist(x.ll,base.ll)<400)}
  else{
    const lo=sorted.filter(x=>x.cls.val<want).pop(),hi=sorted.find(x=>x.cls.val>want);
    if(lo&&hi&&dist(lo.ll,hi.ll)<800){const f=(want-lo.cls.val)/(hi.cls.val-lo.cls.val);
      base={ll:[lo.ll[0]+(hi.ll[0]-lo.ll[0])*f,lo.ll[1]+(hi.ll[1]-lo.ll[1])*f]};next=hi;note='entre '+label(lo.cls)+' y '+label(hi.cls)}
    else{const n=sorted.reduce((b,x)=>Math.abs(x.cls.val-want)<Math.abs(b.cls.val-want)?x:b);base=n;note='cruce más cercano: '+label(n.cls);approx=true}
  }
  let ll=base.ll;
  if(a.m&&next){const L=dist(base.ll,next.ll),f=Math.min(a.m/Math.max(L,1),.95);ll=[base.ll[0]+(next.ll[0]-base.ll[0])*f,base.ll[1]+(next.ll[1]-base.ll[1])*f]}
  const street=ix.list[main[0]].name;
  return{ll,label:`${TYPE_NAME[a.type]} ${a.num}${a.suf}${a.sur?' Sur':''} # ${a.xnum}${a.xsuf}${a.xsur?' Sur':''}${a.m?' - '+a.m:''}`,street,approx:approx||!exact.length,note};
}

/* Coordenadas → dirección aproximada estilo Medellín. */
function reverse(ix,ll){
  let best=null;
  for(let i=0;i<ix.list.length;i++){const s=ix.list[i];if(!bbNear(s.bb,[ll[0],ll[1],ll[0],ll[1]],120))continue;
    const r=nearestOnLine(ll,s.pts);const w=r.d+(s.cls&&s.cls.fam&&s.cls.fam!=='circular'?0:15);
    if(!best||w<best.w)best={i,r,w}}
  if(!best||best.r.d>250)return null;
  const S=ix.list[best.i];
  if(!S.cls||!S.cls.fam||S.cls.fam==='circular')return{text:S.name,street:S.name,d:best.r.d};
  const same=streetsByKey(ix,S.cls);
  const xs=crossings(ix,S.cls.fam,same).filter(x=>x.cls&&x.cls.val!=null);
  if(!xs.length)return{text:S.name,street:S.name,d:best.r.d};
  const p=best.r.ll;
  const near=[...xs].sort((a,b)=>dist(a.ll,p)-dist(b.ll,p));
  const n1=near[0],n2=near.find(x=>x.cls.key!==n1.cls.key&&dist(x.ll,n1.ll)<500&&dist(x.ll,p)<dist(x.ll,n1.ll)+dist(n1.ll,p)+5);
  let lo=n1;if(n2&&n2.cls.val<n1.cls.val&&dist(p,n2.ll)<dist(n1.ll,n2.ll))lo=n2;
  const m=Math.round(dist(lo.ll,p));
  const xl=`${lo.cls.num}${lo.cls.suf}${lo.cls.sur?' Sur':''}`;
  return{text:`${label(S.cls)} # ${xl} - ${String(Math.min(m,99)).padStart(2,'0')}`,street:S.name,cross:label(lo.cls),d:best.r.d,
    between:n2?`entre ${label(n1.cls)} y ${label(n2.cls)}`:`cerca de ${label(n1.cls)}`};
}

/* Resumen "Calles 28 a 33B · Carreras 76 a 80". */
function rangeSummary(names){
  const fam={};const others=[];
  for(const n of names){const c=classify(n);if(c&&c.type!=='avenida'){(fam[c.type]=fam[c.type]||[]).push(c)}else others.push(n)}
  const parts=[];
  for(const t of ['calle','carrera','diagonal','transversal','circular']){const l=fam[t];if(!l)continue;
    l.sort((a,b)=>a.val-b.val);const lab=c=>`${c.num}${c.suf}${c.sur?' Sur':''}`;
    const plural={calle:'Calles',carrera:'Carreras',diagonal:'Diagonales',transversal:'Transversales',circular:'Circulares'}[t];
    // Ignora números aislados (errores de digitación en OSM) al armar el rango.
    let r=l.filter(c=>l.some(o=>o!==c&&Math.abs(o.val-c.val)<=25));if(!r.length)r=l;
    parts.push({type:t,title:plural,count:l.length,text:l.length===1?`${TYPE_NAME[t]} ${lab(l[0])}`:`${plural} ${lab(r[0])} a ${lab(r[r.length-1])}`,
      items:l.map(c=>({name:`${TYPE_NAME[t]} ${lab(c)}`,c}))});
  }
  return{parts,others:others.sort((a,b)=>a.localeCompare(b,'es'))};
}

const api={dist,lineLength,polyArea,perimeter,inRing,inPoly,centroid,bboxOf,nearestOnLine,classify,label,buildIndex,crossings,
  parseAddress,geocode,reverse,rangeSummary,TYPE_NAME};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.Geo=api;
})(typeof window!=='undefined'?window:globalThis);
