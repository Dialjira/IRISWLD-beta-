// Copia a public/ los recursos que deben ir dentro de la APK para funcionar sin internet.
import { cpSync, mkdirSync } from 'node:fs';

const nm = 'node_modules/';
const copy = (from, to) => { mkdirSync(to.replace(/\/[^/]*$/, ''), { recursive: true }); cpSync(nm + from, 'public/' + to, { recursive: true }); };

copy('pdfjs-dist/cmaps', 'pdfjs/cmaps');
copy('pdfjs-dist/standard_fonts', 'pdfjs/standard_fonts');
copy('tesseract.js/dist/worker.min.js', 'tesseract/worker.min.js');
for (const f of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js']) {
  copy('tesseract.js-core/' + f, 'tesseract/' + f);
}
copy('dejavu-fonts-ttf/ttf/DejaVuSans.ttf', 'fonts/DejaVuSans.ttf');
copy('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf', 'fonts/DejaVuSans-Bold.ttf');
console.log('Recursos copiados a public/');
