// Copia Leaflet y las fuentes a www/ para que la app funcione sin internet.
const fs=require('fs'),path=require('path');
const nm=p=>path.join(__dirname,'..','node_modules',p), www=p=>path.join(__dirname,'..','www',p);
const cp=(a,b)=>{fs.mkdirSync(path.dirname(b),{recursive:true});fs.copyFileSync(a,b)};
cp(nm('@capacitor/core/dist/capacitor.js'),www('lib/capacitor.js'));
cp(nm('leaflet/dist/leaflet.js'),www('lib/leaflet/leaflet.js'));
cp(nm('leaflet/dist/leaflet.css'),www('lib/leaflet/leaflet.css'));
const fonts=[['barlow','barlow-latin-400-normal'],['barlow','barlow-latin-500-normal'],['barlow','barlow-latin-600-normal'],
  ['barlow-semi-condensed','barlow-semi-condensed-latin-600-normal'],['barlow-semi-condensed','barlow-semi-condensed-latin-700-normal'],
  ['jetbrains-mono','jetbrains-mono-latin-400-normal'],['jetbrains-mono','jetbrains-mono-latin-500-normal']];
for(const[p,f]of fonts)cp(nm(`@fontsource/${p}/files/${f}.woff2`),www(`fonts/${f}.woff2`));
console.log('vendor ok');
