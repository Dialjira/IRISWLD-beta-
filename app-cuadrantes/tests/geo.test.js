// node tests/geo.test.js  — pruebas del buscador de direcciones con direcciones reales de OSM
const fs=require('fs'),path=require('path');
const G=require('../www/js/geo.js');
const osm=JSON.parse(fs.readFileSync(path.join(__dirname,'../www/data/osm.js'),'utf8').replace(/^window\.OSM_DATA=/,'').replace(/;$/,''));
let fail=0;const ok=(c,m)=>{if(!c){fail++;console.log('FALLA:',m)}};
// parser
const p=G.parseAddress('Calle 30A # 80-15');ok(p&&p.type==='calle'&&p.num===30&&p.suf==='A'&&p.xnum===80&&p.m===15,'parse 1 '+JSON.stringify(p));
const p2=G.parseAddress('Cra. 76 No. 32B-10');ok(p2&&p2.type==='carrera'&&p2.xnum===32&&p2.xsuf==='B'&&p2.m===10,'parse 2 '+JSON.stringify(p2));
const p3=G.parseAddress('CL 9A SUR 79 20');ok(p3&&p3.sur&&p3.suf==='A'&&p3.xnum===79&&p3.m===20,'parse 3 '+JSON.stringify(p3));
const p4=G.parseAddress('Kr 80 # 9A Sur - 20');ok(p4&&p4.type==='carrera'&&p4.xsur&&p4.xsuf==='A','parse 4 '+JSON.stringify(p4));
ok(G.classify('Calle 33AA').key==='33AA','classify AA');ok(G.classify('Avenida 80').type==='carrera','av 80');ok(G.classify('Calle 9A Sur').val<0,'sur');
const ix=G.buildIndex(osm.streets,[]);
// geocodificar direcciones reales y medir error
const errs=[];let tried=0,none=0;
for(const a of osm.addrs){if(!/^(Calle|Carrera|Diagonal|Transversal)\s/.test(a.a)||!/#\s*\d+[A-Za-z]*\s*-\s*\d+/.test(a.a))continue;tried++;
  const r=G.geocode(ix,a.a);if(!r||r.error){none++;continue}errs.push(G.dist(r.ll,a.ll))}
errs.sort((a,b)=>a-b);const med=errs[Math.floor(errs.length/2)],p90=errs[Math.floor(errs.length*.9)];
console.log(`geocode: ${tried} direcciones, ${errs.length} ubicadas, ${none} sin resultado, mediana ${med|0} m, p90 ${p90|0} m`);
ok(errs.length/tried>.7,'cobertura');ok(med<120,'mediana');
// reverso
let rv=0,rt=0;for(const a of osm.addrs.slice(0,200)){const r=G.reverse(ix,a.ll);rt++;if(r&&r.text)rv++}
console.log(`reverse: ${rv}/${rt} con dirección`);ok(rv/rt>.8,'reverse');
console.log('ejemplo reverse:',G.reverse(ix,[6.2297,-75.6018]));
console.log('rangos:',G.rangeSummary(osm.zstreets['16']).parts.map(p=>p.text));
// nomenclatura oficial de la Alcaldía
const alcPath=path.join(__dirname,'../www/data/alcaldia.js');
if(fs.existsSync(alcPath)){
  const AL=JSON.parse(fs.readFileSync(alcPath,'utf8').replace(/^window\.ALCALDIA=/,'').replace(/;$/,''));
  const nx=G.buildNomIndex(AL.nom);ok(nx.n>80000,'índice oficial '+nx.n);
  const e2=[];let t2=0,ex=0;
  for(const a of osm.addrs){if(!/^(Calle|Carrera|Diagonal|Transversal)\s/.test(a.a)||!/#\s*\d+[A-Za-z]*\s*-\s*\d+/.test(a.a))continue;t2++;
    const r=G.geocodeOfficial(nx,a.a)||G.geocode(ix,a.a);if(!r||r.error)continue;if(r.exact)ex++;e2.push(G.dist(r.ll,a.ll))}
  e2.sort((a,b)=>a-b);const m2=e2[Math.floor(e2.length/2)];
  console.log(`geocode oficial+OSM: ${e2.length}/${t2} ubicadas (${ex} placa exacta), mediana ${m2|0} m, p90 ${e2[Math.floor(e2.length*.9)]|0} m`);ok(m2<med,'oficial mejora');
  const rv2=G.reverseOfficial(nx,[6.22477672,-75.59497895]);ok(rv2&&rv2.text==='Carrera 73A # 21 - 08','reverso oficial '+(rv2&&rv2.text));
  const g3=G.geocodeOfficial(nx,'Cra 73A # 21-08');ok(g3&&g3.exact&&G.dist(g3.ll,[6.22477672,-75.59497895])<3,'placa exacta');
}
console.log(fail?`${fail} FALLAS`:'OK');process.exit(fail?1:0);
