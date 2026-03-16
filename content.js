// content.js - Gate Volume Trader
// Автоматизация торговли на Gate.io через DOM

let isRunning = false;
let totalVolume = 0;
let targetVolume = 0;

// Слухач повідомлень з popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'start') {
    targetVolume = request.volume;
    totalVolume = 0;
    isRunning = true;
    console.log('[Gate Trader] Starting with target volume:', targetVolume);
    startTrading();
    sendResponse({status: 'started'});
  } else if (request.action === 'stop') {
    isRunning = false;
    console.log('[Gate Trader] Stopped');
    sendResponse({status: 'stopped'});
  } else if (request.action === 'getStatus') {
    sendResponse({isRunning, totalVolume, targetVolume});
  }
  return true;
});

// Мяса загрузка страницы
function waitForLoad() {
  return new Promise(resolve => {
    if (document.readyState === 'complete') {
      resolve();
    } else {
      window.addEventListener('load', resolve);
    }
  });
}

// Ожидание элемента
function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const el = document.querySelector(selector);
    if (el) {
      resolve(el);
      return;
    }

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Element ${selector} not found`));
    }, timeout);
  });
}

// Переключение на вкладку Buy
async function switchToBuyTab() {
  console.log('[Gate Trader] Switching to Buy tab');
  const buyTab = await waitForElement('[id="tab-buy"]');
  if (buyTab && !buyTab.classList.contains('selected')) {
    buyTab.click();
    await new Promise(r => setTimeout(r, 500));
  }
}

// Переключение на вкладку Sell
async function switchToSellTab() {
  console.log('[Gate Trader] Switching to Sell tab');
  const sellTab = await waitForElement('[id="tab-sell"]');
  if (sellTab && !sellTab.classList.contains('selected')) {
    sellTab.click();
    await new Promise(r => setTimeout(r, 500));
  }
}

// Переключение на Market
async function switchToMarket() {
  console.log('[Gate Trader] Switching to Market mode');
  const marketTab = await waitForElement('[id="tab-marketPrice"]');
  if (marketTab && !marketTab.classList.contains('selected')) {
    marketTab.click();
    await new Promise(r => setTimeout(r, 500));
  }
}

// Получить текущий Баланс USDT
function getUSDTBalance() {
  // Ищем все div с текстом "USDT" и берем значение рядом
  const elements = Array.from(document.querySelectorAll('div')).filter(el =>
    el.textContent.includes('USDT Balance') || el.textContent.includes('Max Buy')
  );

  if (elements.length > 0) {
    const parent = elements[0].closest('div');
    const valueEl = parent.querySelector('div:last-child');
    if (valueEl) {
      const text = valueEl.textContent.match(/([\d.]+)/);
      if (text) {
        return parseFloat(text[1]);
      }
    }
  }
  return 0;
}

// Получить текущий Баланс GF
function getGFBalance() {
  const elements = Array.from(document.querySelectorAll('div')).filter(el =>
    el.textContent.includes('GF Balance') || el.textContent.includes('Max Sell')
  );

  if (elements.length > 0) {
    const parent = elements[0].closest('div');
    const valueEl = parent.querySelector('div:last-child');
    if (valueEl) {
      const text = valueEl.textContent.match(/([\d.]+)/);
      if (text) {
        return parseFloat(text[1]);
      }
    }
  }
  return 0;
}

// Купити на всю сумму USDT
async function buyAll() {
  console.log('[Gate Trader] Executing BUY order');
  
  await switchToBuyTab();
  await switchToMarket();
  
  // Знаходимо input поле для Amount (GF)
  const amountInput = await waitForElement('input[id*="mantine"][id*="drb"]');
  
  // Знаходимо кнопку Buy GF
  const buyButton = await waitForElement('button:has-text("Buy GF")');
  
  if (!buyButton) {
    // Альтернативний пошук кнопки
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => b.textContent.includes('Buy GF') || b.textContent.includes('Buy'));
    if (btn) {
      console.log('[Gate Trader] Clicking Buy button');
      btn.click();
      await new Promise(r => setTimeout(r, 1000));
    }
  } else {
    buyButton.click();
    await new Promise(r => setTimeout(r, 1000));
  }
}

// Продати все GF
async function sellAll() {
  console.log('[Gate Trader] Executing SELL order');
  
  await switchToSellTab();
  await switchToMarket();
  
  // Знаходимо кнопку Sell GF
  const buttons = Array.from(document.querySelectorAll('button'));
  const sellButton = buttons.find(b => b.textContent.includes('Sell GF') || b.textContent.includes('Sell'));
  
  if (sellButton) {
    console.log('[Gate Trader] Clicking Sell button');
    sellButton.click();
    await new Promise(r => setTimeout(r, 1000));
  }
}

// Основна функція трейдінгу
async function startTrading() {
  await waitForLoad();
  
  console.log('[Gate Trader] Trading started. Target:', targetVolume, 'USDT');
  
  let cycleCount = 0;
  
  while (isRunning && totalVolume < targetVolume) {
    try {
      cycleCount++;
      console.log(`[Gate Trader] Cycle ${cycleCount}`);
      
      // Покупка
      await buyAll();
      await new Promise(r => setTimeout(r, 1000)); // 1s delay
      
      // Продажа
      await sellAll();
      await new Promise(r => setTimeout(r, 1000)); // 1s delay
      
      // Оновлюємо загальний об'єм (приблизно)
      const balance = getUSDTBalance();
      totalVolume += balance * 2; // покупка + продажа
      
      console.log(`[Gate Trader] Total volume: ${totalVolume.toFixed(2)} / ${targetVolume} USDT`);
      
    } catch (error) {
      console.error('[Gate Trader] Error:', error);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  
  console.log('[Gate Trader] Trading completed!');
  isRunning = false;
}

console.log('[Gate Trader] Content script loaded');
