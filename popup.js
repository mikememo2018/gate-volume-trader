72
// popup.js
const $ = id => document.getElementById(id);

let stopFlag       = false;
let volumeDone     = 0;
let cyclesDone     = 0;
let targetVolume   = 0;
let amountPerCycle = 0;

// Задержки (секунды)
const DELAY_BS_MIN  = 0.5;  // Buy -> Sell
const DELAY_BS_MAX  = 1.0;
const DELAY_CYC_MIN = 1.0;  // между циклами
const DELAY_CYC_MAX = 2.0;

function sleep(minSec, maxSec) {
  const ms = (minSec + Math.random() * (maxSec - minSec)) * 1000;
  return new Promise(r => setTimeout(r, ms));
}

function log(msg, type = '') {
  const box = $('log');
  const t = new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const d = document.createElement('div');
  if (type) d.className = 'l-' + type;
  d.textContent = '[' + t + '] ' + msg;
  box.appendChild(d);
  box.scrollTop = box.scrollHeight;
}

function setStatus(text, cls) {
  const el = $('st-status');
  el.textContent = text;
  el.className = 's-val' + (cls ? ' ' + cls : '');
}

function updateUI() {
  $('st-done').textContent   = '$' + volumeDone.toFixed(2);
  $('st-target').textContent = '$' + targetVolume.toFixed(2);
  $('st-cycles').textContent = cyclesDone;
  const pct = targetVolume > 0 ? Math.min(100, (volumeDone / targetVolume) * 100) : 0;
  $('progress-bar').style.width = pct.toFixed(1) + '%';
  $('progress-pct').textContent  = pct.toFixed(1) + '%';
}

function setRunning(val) {
  $('btn-start').style.display = val ? 'none'  : 'block';
  $('btn-stop').style.display  = val ? 'block' : 'none';
  $('inp-target').disabled = val;
  $('inp-amount').disabled = val;
}

async function sendCmd(tabId, action, payload) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, Object.assign({ action }, payload || {}), resp => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (resp && resp.error) return reject(new Error(resp.error));
      resolve(resp);
    });
  });
}

async function getGateTab() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ url: '*://*.gate.com/trade/*' }, tabs => {    
                                                                        if (!tabs || !tabs.length) reject(new Error('Открой вкладку gate.com/trade/...'));
                                                                        else resolve(tabs[0]);
  });
}

async function runLoop() {
  let tab;
  try { tab = await getGateTab()
    (); }
  catch (e) { log(e.message, 'err'); setRunning(false); setStatus('Ошибка', 'red'); return; }

  log('Старт. Цель: $' + targetVolume + ' | Цикл: $' + amountPerCycle, 'info');
  setStatus('Работает', 'green');

  while (!stopFlag && volumeDone < targetVolume) {
    const remaining = targetVolume - volumeDone;
    const cycleAmt  = Math.min(amountPerCycle, remaining / 2);

    if (cycleAmt < 0.5) { log('Цель достигнута (остаток < $0.5)', 'ok'); break; }

    const n = cyclesDone + 1;
    log('── Цикл #' + n + ' | Buy $' + cycleAmt.toFixed(2), 'info');
    setStatus('Цикл #' + n + ' — BUY', 'yellow');

    // BUY
    try {
      const r = await sendCmd(tab.id, 'marketBuy', { usdtAmount: cycleAmt });
      if (!r || !r.ok) throw new Error((r && r.error) || 'нет ответа');
      log('✓ Buy OK — $' + cycleAmt.toFixed(2), 'ok');
    } catch (e) {
      log('✗ Buy ошибка: ' + e.message, 'err');
      setStatus('Ошибка Buy', 'red');
      await sleep(3, 5);
      continue;
    }

    if (stopFlag) break;

    // Пауза Buy->Sell: 0.5–1 сек
    await sleep(DELAY_BS_MIN, DELAY_BS_MAX);
    if (stopFlag) break;

    // SELL
    log('── Цикл #' + n + ' | Sell all', 'info');
    setStatus('Цикл #' + n + ' — SELL', 'yellow');

    let soldUsdt = cycleAmt;
    try {
      const r = await sendCmd(tab.id, 'marketSellAll');
      if (!r || !r.ok) throw new Error((r && r.error) || 'нет ответа');
      soldUsdt = (r.soldUsdt) ? r.soldUsdt : cycleAmt;
      log('✓ Sell OK — $' + soldUsdt.toFixed(2), 'ok');
    } catch (e) {
      log('✗ Sell ошибка: ' + e.message, 'err');
      setStatus('Ошибка Sell', 'red');
      await sleep(3, 5);
      continue;
    }

    // Объём = buy + sell
    const vol = cycleAmt + soldUsdt;
    volumeDone += vol;
    cyclesDone++;
    updateUI();
    log('Объём: $' + volumeDone.toFixed(2) + ' / $' + targetVolume + ' (+$' + vol.toFixed(2) + ')', '');

    if (stopFlag || volumeDone >= targetVolume) break;

    // Пауза между циклами: 1–2 сек
    const p = (DELAY_CYC_MIN + Math.random() * (DELAY_CYC_MAX - DELAY_CYC_MIN)).toFixed(2);
    log('Пауза ' + p + 'с...', '');
    await sleep(DELAY_CYC_MIN, DELAY_CYC_MAX);
  }

  if (volumeDone >= targetVolume) {
    log('Цель достигнута! $' + volumeDone.toFixed(2) + ' за ' + cyclesDone + ' циклов', 'ok');
    setStatus('Готово!', 'green');
  } else {
    log('Остановлено. Объём: $' + volumeDone.toFixed(2), 'warn');
    setStatus('Остановлено', 'yellow');
  }
  setRunning(false);
}

$('btn-start').addEventListener('click', () => {
  targetVolume   = parseFloat($('inp-target').value) || 100;
  amountPerCycle = parseFloat($('inp-amount').value) || 4;
  volumeDone     = 0;
  cyclesDone     = 0;
  stopFlag       = false;
  updateUI();
  setRunning(true);
  runLoop();
});

$('btn-stop').addEventListener('click', () => {
  stopFlag = true;
  log('Запрос остановки...', 'warn');
  setStatus('Останавливается...', 'yellow');
});
