import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from '../../hanjing-clinic-backend/node_modules/ws/wrapper.mjs';

import {
  isCantoneseVoice,
  rateMandarinVoice,
  findMandarinVoice
} from '../../hanjing-clinic-管理后台源码-20260607/src/utils/speech.ts';

test('isCantoneseVoice correctly identifies Cantonese voices across platforms', () => {
  // macOS voices (often with underscores in lang)
  assert.equal(isCantoneseVoice({ name: 'Sinji', lang: 'zh_HK' }), true);
  assert.equal(isCantoneseVoice({ name: 'Sin-ji', lang: 'zh-HK' }), true);
  assert.equal(isCantoneseVoice({ name: 'Hiugaai', lang: 'zh_HK' }), true);

  // Chrome voices
  assert.equal(isCantoneseVoice({ name: 'Google 粤語（香港）', lang: 'zh-HK' }), true);

  // Windows voices
  assert.equal(isCantoneseVoice({ name: 'Microsoft Danny - Chinese (Traditional, Hong Kong S.A.R.)', lang: 'zh-HK' }), true);
  assert.equal(isCantoneseVoice({ name: 'Microsoft HiuMaan Online (Natural) - Chinese (Hong Kong)', lang: 'zh-HK' }), true);
  assert.equal(isCantoneseVoice({ name: 'Microsoft WanLung Online (Natural) - Chinese (Hong Kong)', lang: 'zh-HK' }), true);
  assert.equal(isCantoneseVoice({ name: 'Microsoft Tracy Online (Natural) - Chinese (Hong Kong)', lang: 'zh-HK' }), true);

  // ISO language codes
  assert.equal(isCantoneseVoice({ name: 'Custom Voice', lang: 'yue' }), true);
  assert.equal(isCantoneseVoice({ name: 'Custom Voice 2', lang: 'zh-yue' }), true);
  assert.equal(isCantoneseVoice({ name: 'Macau Voice', lang: 'zh-MO' }), true);
  assert.equal(isCantoneseVoice({ name: 'Macau Voice 2', lang: 'zh_MO' }), true);

  // Mandarin voices must NEVER be flagged as Cantonese
  assert.equal(isCantoneseVoice({ name: 'Tingting', lang: 'zh_CN' }), false);
  assert.equal(isCantoneseVoice({ name: 'Tingting', lang: 'zh-CN' }), false);
  assert.equal(isCantoneseVoice({ name: 'Google 普通话（中国大陆）', lang: 'zh-CN' }), false);
  assert.equal(isCantoneseVoice({ name: 'Microsoft Xiaoxiao Online (Natural) - Chinese (Mainland)', lang: 'zh-CN' }), false);
  assert.equal(isCantoneseVoice({ name: 'Microsoft Yunxi Online (Natural) - Chinese (Mainland)', lang: 'zh-CN' }), false);
  assert.equal(isCantoneseVoice({ name: 'Microsoft Huihui - Chinese (Simplified)', lang: 'zh-CN' }), false);
  assert.equal(isCantoneseVoice({ name: 'Meijia', lang: 'zh_TW' }), false);
});

test('findMandarinVoice prioritizes pure Mandarin over all other dialects', () => {
  // Scenario 1: macOS Safari / WebKit environment (zh_CN with underscores and Sinji)
  const macSafariVoices = [
    { name: 'Sinji', lang: 'zh_HK' },
    { name: 'Tingting', lang: 'zh_CN' },
    { name: 'Meijia', lang: 'zh_TW' }
  ];
  const selectedMac = findMandarinVoice(macSafariVoices);
  assert.equal(selectedMac?.name, 'Tingting');
  assert.equal(selectedMac?.lang, 'zh_CN');

  // Scenario 2: Google Chrome on Mac / Windows
  const chromeVoices = [
    { name: 'Google 粤語（香港）', lang: 'zh-HK' },
    { name: 'Google 普通话（中国大陆）', lang: 'zh-CN' },
    { name: 'Google 國語（臺灣）', lang: 'zh-TW' }
  ];
  const selectedChrome = findMandarinVoice(chromeVoices);
  assert.equal(selectedChrome?.name, 'Google 普通话（中国大陆）');

  // Scenario 3: Windows Edge with Natural Online Voices
  const edgeVoices = [
    { name: 'Microsoft HiuMaan Online (Natural) - Chinese (Hong Kong)', lang: 'zh-HK' },
    { name: 'Microsoft WanLung Online (Natural) - Chinese (Hong Kong)', lang: 'zh-HK' },
    { name: 'Microsoft Xiaoxiao Online (Natural) - Chinese (Mainland)', lang: 'zh-CN' },
    { name: 'Microsoft Yunxi Online (Natural) - Chinese (Mainland)', lang: 'zh-CN' }
  ];
  const selectedEdge = findMandarinVoice(edgeVoices);
  assert.ok(
    selectedEdge?.name === 'Microsoft Xiaoxiao Online (Natural) - Chinese (Mainland)' ||
    selectedEdge?.name === 'Microsoft Yunxi Online (Natural) - Chinese (Mainland)'
  );

  // Scenario 4: Windows Classic Voices
  const winClassicVoices = [
    { name: 'Microsoft Danny - Chinese (Traditional, Hong Kong S.A.R.)', lang: 'zh-HK' },
    { name: 'Microsoft Huihui - Chinese (Simplified)', lang: 'zh-CN' },
    { name: 'Microsoft Yaoyao - Chinese (Simplified)', lang: 'zh-CN' }
  ];
  const selectedWin = findMandarinVoice(winClassicVoices);
  assert.ok(
    selectedWin?.name === 'Microsoft Huihui - Chinese (Simplified)' ||
    selectedWin?.name === 'Microsoft Yaoyao - Chinese (Simplified)'
  );
});

test('Real Google Chrome speech synthesis engine selects Mandarin voice', async () => {
  const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const profileDir = await mkdtemp(join(tmpdir(), 'chrome-speech-verify-'));
  const port = 9258;

  const chrome = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    'about:blank'
  ], { windowsHide: true, stdio: 'ignore' });

  try {
    const delay = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 20; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${port}/json/version`);
        if (r.ok) break;
      } catch (e) {}
      await delay(200);
    }

    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
    await new Promise(r => ws.once('open', r));

    let id = 1;
    function send(method, params = {}) {
      return new Promise(resolve => {
        const curId = id++;
        const handler = (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.id === curId) {
            ws.off('message', handler);
            resolve(msg.result);
          }
        };
        ws.on('message', handler);
        ws.send(JSON.stringify({ id: curId, method, params }));
      });
    }

    await send('Runtime.enable');

    // Wait for voices to populate in real Chrome and evaluate findMandarinVoice
    const evalRes = await send('Runtime.evaluate', {
      expression: `new Promise(resolve => {
        function check() {
          const voices = window.speechSynthesis.getVoices();
          if (voices.length > 0) {
            return resolve(voices.map(v => ({ name: v.name, lang: v.lang })));
          }
          window.speechSynthesis.onvoiceschanged = () => {
            resolve(window.speechSynthesis.getVoices().map(v => ({ name: v.name, lang: v.lang })));
          };
          setTimeout(() => {
            resolve(window.speechSynthesis.getVoices().map(v => ({ name: v.name, lang: v.lang })));
          }, 1500);
        }
        check();
      })`,
      awaitPromise: true,
      returnByValue: true
    });

    const realVoices = evalRes?.result?.value || [];
    assert.ok(realVoices.length > 0, 'Chrome should report available speech voices');

    const selectedVoice = findMandarinVoice(realVoices);
    assert.ok(selectedVoice, 'findMandarinVoice should pick a valid voice');
    assert.equal(isCantoneseVoice(selectedVoice), false, 'Chosen voice must NOT be Cantonese');
    assert.ok(
      selectedVoice.name.includes('普通话') ||
      selectedVoice.name.includes('Tingting') ||
      selectedVoice.lang.toLowerCase().includes('zh-cn') ||
      selectedVoice.lang.toLowerCase().includes('zh_cn'),
      `Expected Mandarin voice but got: ${selectedVoice.name} (${selectedVoice.lang})`
    );

    ws.close();
  } finally {
    chrome.kill();
    try {
      await rm(profileDir, { recursive: true, force: true });
    } catch (e) {}
  }
});
