import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chunkText, splitSentences, parseRanges, safeFileName, wrapLines, guessLang } from '../src/lib/text.js';

test('parseRanges', () => {
  assert.deepEqual(parseRanges('1-3, 5, 8-', 9), [0, 1, 2, 4, 7, 8]);
  assert.deepEqual(parseRanges('3-1', 5), [0, 1, 2]);
  assert.deepEqual(parseRanges('20', 5), []);
  assert.throws(() => parseRanges('a-b', 5));
});
test('chunkText respeta el límite', () => {
  const t = Array(500).fill('Esta es una frase de prueba bastante normal.').join(' ');
  const c = chunkText(t, 1000);
  assert.ok(c.length > 10);
  assert.ok(c.every(x => x.length <= 1000));
  assert.equal(c.join(' ').replace(/\s+/g, ' '), t);
});
test('splitSentences con abreviaturas', () => {
  const s = splitSentences('El Sr. Pérez llegó tarde. ¿Por qué? No lo sabemos. El precio es 3.5 euros en total hoy.');
  assert.ok(s[0].startsWith('El Sr. Pérez llegó tarde.'));
  assert.ok(s.some(x => x.includes('3.5 euros')));
});
test('safeFileName', () => {
  assert.equal(safeFileName('Informe: año/2026?.pdf'), 'Informe año 2026.pdf');
  assert.equal(safeFileName(''), 'documento.pdf');
});
test('wrapLines', () => {
  const lines = wrapLines('uno dos tres cuatro cinco', 9, s => s.length);
  assert.ok(lines.every(l => l.length <= 9), JSON.stringify(lines));
  assert.equal(lines.join(' '), 'uno dos tres cuatro cinco');
  assert.deepEqual(wrapLines('abcdefghij', 4, s => s.length), ['abcd', 'efgh', 'ij']);
});
test('guessLang', () => {
  assert.equal(guessLang('The cat is on the table and the dog is in the garden'), 'en');
  assert.equal(guessLang('El gato está en la mesa y el perro en el jardín de la casa'), 'es');
});
