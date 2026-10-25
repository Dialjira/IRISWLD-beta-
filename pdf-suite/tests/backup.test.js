import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';

test('zip de copia de seguridad conserva bytes y manifiesto', () => {
  const pdf = new Uint8Array([37, 80, 68, 70, 1, 2, 3]);
  const zip = zipSync({ 'pdf/a-x.pdf': [pdf, { level: 0 }], 'artcraft-backup.json': strToU8(JSON.stringify({ docs: [{ id: 'a', path: 'pdf/a-x.pdf' }] })) });
  const files = unzipSync(zip);
  assert.deepEqual([...files['pdf/a-x.pdf']], [...pdf]);
  assert.equal(JSON.parse(strFromU8(files['artcraft-backup.json'])).docs[0].id, 'a');
});
