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

test('rankModels: equilibrado prefiere el flash más nuevo y deja los alias al final', () => {
  const r = rankModels(IDS, 'balanced');
  assert.equal(r[0], 'gemini-3-flash-preview');
  assert.equal(r[1], 'gemini-3-pro-preview');
  assert.equal(r.indexOf('gemini-2.5-flash') < r.indexOf('gemini-2.5-flash-preview-09-2025'), true);
  assert.equal(r[r.length - 1], 'gemini-flash-latest');
  assert.ok(!r.includes('gemini-2.5-flash-image'));
});

test('rankModels: calidad prefiere pro; rápido prefiere flash-lite', () => {
  assert.equal(rankModels(IDS, 'quality')[0], 'gemini-3-pro-preview');
  assert.equal(rankModels(IDS, 'fast')[0], 'gemini-2.5-flash-lite');
});

test('thinkingFor según generación', () => {
  assert.deepEqual(thinkingFor('gemini-3-flash-preview'), { thinkingLevel: 'low' });
  assert.deepEqual(thinkingFor('gemini-2.5-flash'), { thinkingBudget: 0 });
  assert.deepEqual(thinkingFor('gemini-2.5-pro'), { thinkingBudget: 512 });
  assert.equal(thinkingFor('gemini-2.0-flash'), undefined);
});
