// content.js — Gate Volume Trader

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function setNativeValue(el, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, value);
  el.dispatchEvent(new Event('input',  { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function waitFor(fn, timeout) {
  timeout = timeout || 6000;
  return new Promise(function(resolve, reject) {
    var start = Date.now();
    (function check() {
      var el = fn();
      if (el) return resolve(el);
      if (Date.now() - start > timeout) return reject(new Error('waitFor timeout'));
      setTimeout(check, 150);
    })();
  });
}

function findButtonByText(text) {
  var all = document.querySelectorAll('button');
  for (var i = 0; i < all.length; i++) {
    if (all[i].textContent.trim().includes(text) && all[i].offsetParent !== null) return all[i];  }
  return null;
}

function getSpotForm() {
  var inputs = document.querySelectorAll('input');
  for (var i = 0; i < inputs.length; i++) {
    var inp = inputs[i];
    var label = inp.getAttribute('aria-label');
    if ((label === 'GF' || label === 'USDT') && inp.offsetParent !== null) {
      // найти ближайший анцестор с кнопкой Buy GF или Sell GF
      var parent = inp.parentElement;
      for (var d = 0; d < 10; d++) {
        if (!parent) break;
        var btns = parent.querySelectorAll('button');
        for (var b = 0; b < btns.length; b++) {
          var txt = btns[b].textContent.trim();
          if (txt === 'Buy GF' || txt === 'Sell GF') return parent;
        }
        parent = parent.parentElement;
      }
    }
  }
  return null;
}

async function switchSide(side) {
  var btn = await waitFor(function() { return findButtonByText(side); }, 5000);
  btn.click();
  await sleep(400);
}

async function switchToMarket(panel) {
  var btns = panel.querySelectorAll('button');
  for (var i = 0; i < btns.length; i++) {
    if (btns[i].textContent.trim() === 'Market') {
      btns[i].click();
      await sleep(300);
      return;
    }
  }
  throw new Error('Market button not found');
}

async function switchFieldCurrency(panel, target) {
  // найти переключатель валюты рядом с инпутом
  var all = panel.querySelectorAll('button, span');
  for (var i = 0; i < all.length; i++) {
    var t = all[i].textContent.trim();
    if ((t === 'GF' || t === 'USDT') && all[i].offsetParent !== null) {
      if (t !== target) {
        all[i].click();
        await sleep(200);
        // выбрать нужную опцию из дропдауна
        var opts = document.querySelectorAll('div, li, span');
        for (var j = 0; j < opts.length; j++) {
          if (opts[j].textContent.trim() === target && opts[j].offsetParent !== null) {
            opts[j].click();
            await sleep(200);
            return;
          }
        }
      }
      return;
    }
  }
}

async function confirmModal() {
  try {
    var confirmBtn = await waitFor(function() {
      var btns = document.querySelectorAll('button');
      for (var i = 0; i < btns.length; i++) {
        if (btns[i].textContent.trim() === 'Confirm' && btns[i].offsetParent !== null) return btns[i];
      }
      return null;
    }, 3000);
    // тикаем Don't remind me again если есть
    var cb = document.querySelector('input[type="checkbox"]');
    if (cb && !cb.checked && cb.offsetParent !== null) { cb.click(); await sleep(100); }
    confirmBtn.click();
    await sleep(400);
  } catch(e) { /* модалка не появилась */ }
}

async function waitOrderFilled(timeout) {
  timeout = timeout || 8000;
  return new Promise(function(resolve) {
    var start = Date.now();
    var iv = setInterval(function() {
      var all = document.querySelectorAll('*');
      for (var i = 0; i < all.length; i++) {
        if (all[i].children.length < 4 && all[i].textContent.includes('Order Filled')) {
          clearInterval(iv); return resolve(true);
        }
      }
      if (Date.now() - start > timeout) { clearInterval(iv); resolve(false); }
    }, 250);
  });
}

async function doMarketBuy(usdtAmount) {
  await switchSide('Buy');
  var panel = await waitFor(getSpotForm, 5000);
  await switchToMarket(panel);
  await sleep(200);
  await switchFieldCurrency(panel, 'USDT');
  await sleep(200);

  panel = await waitFor(getSpotForm, 3000);
  var inp = null;
  var inputs = panel.querySelectorAll('input');
  for (var i = 0; i < inputs.length; i++) {
    if (inputs[i].getAttribute('aria-label') === 'USDT' && inputs[i].offsetParent !== null) {
      inp = inputs[i]; break;
    }
  }
  if (!inp) throw new Error('USDT input not found');

  inp.focus();
  setNativeValue(inp, usdtAmount.toFixed(2));
  await sleep(300);

  var buyBtn = await waitFor(function() { return findButtonByText('Buy GF'); }, 3000);
  buyBtn.click();
  await sleep(300);
  await confirmModal();
  await waitOrderFilled(8000);
  return { ok: true };
}

async function doMarketSellAll() {
  await switchSide('Sell');
  var panel = await waitFor(getSpotForm, 5000);
  await switchToMarket(panel);
  await sleep(200);
  await switchFieldCurrency(panel, 'GF');
  await sleep(200);

  panel = await waitFor(getSpotForm, 3000);

  // читаем available GF из текста панели
  var txt = panel.textContent;
  var m = txt.match(/Available[^\d]*(\d[\d,]+\.?\d*)\s*GF/);
  var gfAmt = m ? parseFloat(m[1].replace(/,/g, '')) : 0;

  var inp = null;
  var inputs = panel.querySelectorAll('input');
  for (var i = 0; i < inputs.length; i++) {
    if (inputs[i].getAttribute('aria-label') === 'GF' && inputs[i].offsetParent !== null) {
      inp = inputs[i]; break;
    }
  }

  if (inp && gfAmt > 0) {
    inp.focus();
    setNativeValue(inp, String(Math.floor(gfAmt)));
    await sleep(200);
  } else {
    // фоллбек: двигаем слайдер на 100%
    var slider = document.querySelector('input[type="range"]');
    if (slider) { setNativeValue(slider, slider.max); await sleep(200); }
  }

  // читаем total USDT до клика
  var soldUsdt = 0;
  var uInputs = panel.querySelectorAll('input');
  for (var j = 0; j < uInputs.length; j++) {
    if (uInputs[j].getAttribute('aria-label') === 'USDT' && uInputs[j].offsetParent !== null) {
      soldUsdt = parseFloat(uInputs[j].value) || 0; break;
    }
  }

  var sellBtn = await waitFor(function() { return findButtonByText('Sell GF'); }, 3000);
  sellBtn.click();
  await sleep(300);
  await confirmModal();
  await waitOrderFilled(8000);
  return { ok: true, soldUsdt: soldUsdt };
}

chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
  (async function() {
    try {
      if (msg.action === 'marketBuy') {
        var r = await doMarketBuy(msg.usdtAmount);
        sendResponse(r);
      } else if (msg.action === 'marketSellAll') {
        var r = await doMarketSellAll();
        sendResponse(r);
      } else {
        sendResponse({ error: 'unknown action' });
      }
    } catch(e) {
      sendResponse({ error: e.message });
    }
  })();
  return true;
});
