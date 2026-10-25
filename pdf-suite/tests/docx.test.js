import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pagesToDocx } from '../src/lib/docx-export.js';

test('pagesToDocx genera un .docx (zip) con el texto', async () => {
  const out = await pagesToDocx([{ text: 'CAPÍTULO UNO\n\nHola mundo con ñ.\nSegunda línea.\n\n- uno\n- dos' }, { text: 'Página dos' }], { title: 'Prueba' });
  assert.equal(String.fromCharCode(out[0], out[1]), 'PK');
  assert.ok(out.length > 3000);
});
