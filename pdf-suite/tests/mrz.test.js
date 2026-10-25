import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMRZ, checkDigit } from '../src/lib/mrz.js';

// Ejemplo oficial de ICAO 9303 (Utopía)
const TD3 = 'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<\nL898902C36UTO7408122F1204159ZE184226B<<<<<10';

test('checkDigit', () => {
  assert.equal(checkDigit('L898902C3'), '6');
  assert.equal(checkDigit('740812'), '2');
});

test('parseMRZ TD3 de pasaporte', () => {
  const r = parseMRZ('PASSPORT\nalgo de texto\n' + TD3);
  assert.equal(r.format, 'TD3');
  assert.equal(r.surname, 'ERIKSSON');
  assert.equal(r.givenNames, 'ANNA MARIA');
  assert.equal(r.number, 'L898902C3');
  assert.equal(r.nationality, 'UTO');
  assert.equal(r.birthDate, '1974-08-12');
  assert.equal(r.expiryDate, '2012-04-15');
  assert.equal(r.sex, 'F');
  assert.deepEqual(r.valid, { number: true, birth: true, expiry: true, final: true });
});

test('parseMRZ corrige errores típicos de OCR (O por 0, espacios, «)', () => {
  const noisy = 'P<UTOERIKSSON<<ANNA<MARIA«<<<<<<<<<<<<<<<<<<\nL898902C36UTO74O8122F12O4159ZE184226B<<<<< 10';
  const r = parseMRZ(noisy);
  assert.equal(r.birthDate, '1974-08-12');
  assert.equal(r.valid.birth, true);
  assert.equal(r.valid.expiry, true);
});

test('parseMRZ TD1 de documento de identidad', () => {
  const td1 = 'I<UTOD231458907<<<<<<<<<<<<<<<\n7408122F1204159UTO<<<<<<<<<<<6\nERIKSSON<<ANNA<MARIA<<<<<<<<<<';
  const r = parseMRZ(td1);
  assert.equal(r.format, 'TD1');
  assert.equal(r.number, 'D23145890');
  assert.equal(r.valid.number, true);
  assert.equal(r.surname, 'ERIKSSON');
});

test('parseMRZ sin MRZ devuelve null', () => assert.equal(parseMRZ('Hola mundo'), null));
