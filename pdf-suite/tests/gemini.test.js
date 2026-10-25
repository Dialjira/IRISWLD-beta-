import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseModel, rankModels, thinkingFor } from '../src/lib/gemini.js';

const IDS = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite', 'gemini-3-pro-preview', 'gemini-3-flash-preview',
  'gemini-flash-latest', 'gemini-2.5-flash-image', 'text-embedding-004', 'gemini-2.5-flash-preview-tts', 'gemma-3-27b-it', 'gemini-2.0-flash-thinking-exp', 'gemini-2.5-flash-preview-09-2025'];

test('parseModel descarta modelos no aptos', () => {
  assert.equal(parseModel('gemini-2.5-flash-image'), null);
  assert.equal(parseModel('text-embedding-004'), null);
  assert.equal(parseModel('gemma-3-27b-it'), null);
  assert.deepEqual(parseModel('models/gemini-2.5-pro'), { id: 'gemini-2.5-pro', version: 2.5, tier: 'pro', stage: 'stable', alias: false });
  assert.equal(parseModel('gemini-3-flash-preview').stage, 'preview');
});

test('rankModels: recomendado prefiere el flash-lite más nuevo y deja los alias al final', () => {
  const r = rankModels([...IDS, 'gemini-3.5-flash', 'gemini-3.5-flash-lite'], 'balanced');
  assert.equal(r[0], 'gemini-3.5-flash-lite');
  assert.equal(r[1], 'gemini-3.5-flash');
  assert.equal(r.indexOf('gemini-2.5-flash') < r.indexOf('gemini-2.5-flash-preview-09-2025'), true);
  assert.equal(r[r.length - 1], 'gemini-flash-latest');
  assert.ok(!r.includes('gemini-2.5-flash-image'));
});

test('rankModels: calidad prefiere pro; rápido prefiere flash-lite', () => {
  assert.equal(rankModels(IDS, 'quality')[0], 'gemini-3-pro-preview');
  assert.equal(rankModels(IDS, 'fast')[0], 'gemini-2.5-flash-lite');
});

test('thinkingFor según generación', () => {
  assert.deepEqual(thinkingFor('gemini-3-flash-preview'), { thinkingLevel: 'minimal' });
  assert.deepEqual(thinkingFor('gemini-3-pro-preview'), { thinkingLevel: 'low' });
  assert.deepEqual(thinkingFor('gemini-3-flash-preview', 'quality'), { thinkingLevel: 'high' });
  assert.deepEqual(thinkingFor('gemini-2.5-flash'), { thinkingBudget: 0 });
  assert.deepEqual(thinkingFor('gemini-2.5-pro'), { thinkingBudget: 512 });
  assert.equal(thinkingFor('gemini-2.0-flash'), undefined);
});

test('pickSpecialModel elige imagen y voz', async () => {
  const { pickSpecialModel } = await import('../src/lib/gemini.js');
  const ids = ['gemini-2.5-flash-image', 'gemini-3-pro-image-preview', 'gemini-2.5-flash-preview-tts', 'gemini-2.5-pro-preview-tts', 'gemini-2.5-flash'];
  assert.equal(pickSpecialModel(ids, 'image'), 'gemini-3-pro-image-preview');
  assert.equal(pickSpecialModel(ids, 'tts'), 'gemini-2.5-flash-preview-tts');
  assert.equal(pickSpecialModel(['gemini-2.5-flash'], 'tts'), null);
});

test('pcmToWav cabecera correcta', async () => {
  const { pcmToWav } = await import('../src/lib/gemini.js');
  const w = pcmToWav([new Int16Array([1, 2, 3]), new Int16Array([4])], 24000);
  assert.equal(Buffer.from(w.slice(0, 4)).toString(), 'RIFF');
  assert.equal(w.length, 44 + 8);
  assert.equal(new DataView(w.buffer).getUint32(24, true), 24000);
});

test('nearestRatio', async () => {
  const { nearestRatio } = await import('../src/lib/gemini.js');
  assert.equal(nearestRatio(2480, 3508), '2:3'); // A4 vertical (0,707: un poco más cerca de 2:3 que de 3:4)
  assert.equal(nearestRatio(1250, 880), '3:2'); // pasaporte
  assert.equal(nearestRatio(1000, 1000), '1:1');
});
