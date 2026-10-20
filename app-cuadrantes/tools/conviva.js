// Ubica en el mapa los establecimientos de «Convive la Noche» (lista de la Secretaría de Desarrollo Económico).
// Uso: node tools/conviva.js conviva.json www/data/conviva.js
const fs=require('fs'),path=require('path');
const G=require('../www/js/geo.js');
const rd=(f,v)=>JSON.parse(fs.readFileSync(path.join(__dirname,'../www/data',f),'utf8').replace(new RegExp('^window\\.'+v+'='),'').replace(/;$/,''));
const OSM=rd('osm.js','OSM_DATA'),AL=rd('alcaldia.js','ALCALDIA'),KB=rd('cuadrantes.js','KML_BASE');
const ix=G.buildIndex(OSM.streets,[]),nx=G.buildNomIndex(AL.nom);
const zones=KB.polys.map(p=>({num:p.attrs.Cuadrant_1,r:p.rings}));
const zoneAt=ll=>(zones.find(z=>G.inPoly(ll,z.r))||{}).num||'';
// Comuna del punto según los barrios oficiales: sirve para descartar ubicaciones dudosas.
const COM={'Laureles Estadio':'11','La América':'12','San Javier':'13','El Poblado':'14','Guayabal':'15','Belén':'16','La Candelaria':'10',
  'Corregimiento de Altavista':'70','Corregimiento de San Antonio de Prado':'80','Corregimiento de San Cristóbal':'60'};
const comAt=ll=>{const b=AL.barrios.find(b=>G.inRing(ll,b.r));return b?COM[b.com]||'':''};
const rows=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const clean=d=>d.toUpperCase().replace(/CALLLE/g,'CALLE').replace(/AVENIDA\s+330/,'AVENIDA 33').replace(/\b(INT|INTERIOR|LOCAL|LC|PISO|P\d|APT|OFICINA|BRR|BARRIO|SEGUNDO|TERCER)\b.*$/,'')
  .replace(/\bN[°ºO]?\.?\s/,' # ').replace(/(\d)\s*(SUR)\s+(\d)/,'$1 SUR # $3').replace(/\*.*$/,'').trim();
const out=[];let ok=0,off=0,fail=[];
for(const r of rows){
  const d=clean(r.dir);let g=G.geocodeOfficial(nx,d);
  if(!g||g.error){const g2=G.geocode(ix,d);if(g2&&!g2.error)g=g2}
  // Calles límite (p. ej. Calle 33 entre Belén y Laureles): vale si hay un punto de la comuna correcta a menos de 80 m.
  const near=(ll,c)=>[[0,0],[.0007,0],[-.0007,0],[0,.0007],[0,-.0007]].some(([a,b])=>comAt([ll[0]+a,ll[1]+b])===c);
  if(g&&!g.error&&!near(g.ll,r.comuna))g=null
  if(g&&!g.error){ok++;out.push([r.nombre,r.dir,r.comuna,r.horario,+g.ll[0].toFixed(5),+g.ll[1].toFixed(5),zoneAt(g.ll),g.official&&g.exact?1:g.official?2:3])}
  else{if(['15','16','70'].includes(r.comuna))fail.push(r.nombre+' | '+r.dir);out.push([r.nombre,r.dir,r.comuna,r.horario,null,null,'',0]);off++}
}
fs.writeFileSync(process.argv[3],'window.CONVIVA='+JSON.stringify({fuente:'Secretaría de Desarrollo Económico de Medellín · Programa Convive la Noche · establecimientos certificados',actualizado:'2026-10-16',campos:['nombre','direccion','comuna','horario','lat','lng','cuadrante','precision'],rows:out})+';');
console.log('ubicados',ok,'sin ubicar',off,'en cuadrantes Belén',out.filter(o=>o[6]).length,'exactos',out.filter(o=>o[7]===1).length);
console.log('belén/guayabal/altavista sin ubicar:',fail);
