// content.js - Gate Volume Trader
// Автоматизация торговли на Gate.io через DOM

let isRunning = false;
let totalVolume = 0;
let targetVolume = 0;

// Слушаем сообщения от popup
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

// Ждем загрузки страницы
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
  const buyTab = await waitForElement('[id^="tab-buy"]');
  if (buyTab && !buyTab.classList.contains('selected')) {
    buyTab.click();
    await new Promise(r => setTimeout(r, 500));
  }
}

// Переключение на вкладку Sell
async function switchToSellTab() {
  console.log('[Gate Trader] Switching to Sell tab');
  const sellTab = await waitForElement('[id^="tab-sell"]');
  if (sellTab && !sellTab.classList.contains('selected')) {
    sellTab.click();
    await new Promise(r => setTimeout(r, 500));
  }
}

// Переключение на Market
async function switchToMarket() {
  console.log('[Gate Trader] Switching to Market mode');
  const marketTab = await waitForElement('[id^="tab-marketPrice"]');
  if (marketTab && !marketTab.getAttribute('aria-selected')) {
    marketTab.click();
    await new Promise(r => setTimeout(r, 500));
  }
}

// Получить текущий баланс USDT
function getUSDTBalance() {
  // Ищем текст "USDT Balance" и берем значение рядом
  const balanceTexts = Array.from(document.querySelectorAll('*')).filter(el => 
    el.textContent.includes('USDT Balance')
  );
  
  if (balanceTexts.length > 0) {
    const parent = balanceTexts[0].closest('div');
    const valueEl = parent?.querySelector('*:last-child');
    if (valueEl) {
      const match = valueEl.textContent.match(/([\d.]+)/);
      if (match) {
        return parseFloat(match[1]);
      }
    }
  }
  return 0;
}

// Получить текущий баланс GF
function getGFBalance() {
  const balanceTexts = Array.from(document.querySelectorAll('*')).filter(el => 
    el.textContent.includes('GF Balance')
  );
  
  if (balanceTexts.length > 0) {
    const parent = balanceTexts[0].closest('div');
    const valueEl = parent?.querySelector('*:last-child');
    if (valueEl) {
      const match = valueEl.textContent.match(/([\d.]+)/);
      if (match) {
        return parseFloat(match[1]);
      }
    }
  }
  return 0;
}

// Получить текущую цену GF
function getCurrentPrice() {
  // Ищем элемент с ценой в хедере
  const priceEl = document.querySelector('[class*="coin"] [class*="price"]');
  if (priceEl) {
    const match = priceEl.textContent.match(/([\d.]+)/);
    if (match) {
      return parseFloat(match[1]);
    }
  }
  return 0;
}

// Выполнить покупку
async function executeBuy() {
  console.log('[Gate Trader] Executing BUY');
  
  try {
    await switchToBuyTab();
    await switchToMarket();
    await new Promise(r => setTimeout(r, 1000));
    
    // Найти поле Amount и кнопку Buy
    const amountInput = await waitForElement('input[id*="mantine"][aria-label="Amount"], input[placeholder*="Amount"]');
    const buyButton = await waitForElement('button:has-text("Buy GF"), button[class*="buy"]');
    
    if (!amountInput || !buyButton) {
      console.error('[Gate Trader] Buy elements not found');
      return false;
    }
    
    // Получить максимальное количество для покупки
    const usdtBalance = getUSDTBalance();
    const currentPrice = getCurrentPrice();
    const maxBuyAmount = usdtBalance / currentPrice;
    
    console.log('[Gate Trader] USDT Balance:', usdtBalance);
    console.log('[Gate Trader] Current Price:', currentPrice);
    console.log('[Gate Trader] Max Buy Amount:', maxBuyAmount);
    
    // Вводим количество
    amountInput.focus();
    amountInput.value = maxBuyAmount.toString();
    amountInput.dispatchEvent(new Event('input', { bubbles: true }));
    amountInput.dispatchEvent(new Event('change', { bubbles: true }));
    
    await new Promise(r => setTimeout(r, 500));
    
    // Кликаем Buy
    buyButton.click();
    console.log('[Gate Trader] Buy order placed');
    
    // Обновляем общий объем
    totalVolume += usdtBalance;
    
    return true;
  } catch (error) {
    console.error('[Gate Trader] Buy error:', error);
    return false;
  }
}

// Выполнить продажу
async function executeSell() {
  console.log('[Gate Trader] Executing SELL');
  
  try {
    await switchToSellTab();
    await switchToMarket();
    await new Promise(r => setTimeout(r, 1000));
    
    // Найти поле Amount и кнопку Sell
    const amountInput = await waitForElement('input[id*="mantine"][aria-label="Amount"], input[placeholder*="Amount"]');
    const sellButton = await waitForElement('button:has-text("Sell GF"), button[class*="sell"]');
    
    if (!amountInput || !sellButton) {
      console.error('[Gate Trader] Sell elements not found');
      return false;
    }
    
    // Получить баланс GF
    const gfBalance = getGFBalance();
    
    console.log('[Gate Trader] GF Balance:', gfBalance);
    
    // Вводим количество
    amountInput.focus();
    amountInput.value = gfBalance.toString();
    amountInput.dispatchEvent(new Event('input', { bubbles: true }));
    amountInput.dispatchEvent(new Event('change', { bubbles: true }));
    
    await new Promise(r => setTimeout(r, 500));
    
    // Кликаем Sell
    sellButton.click();
    console.log('[Gate Trader] Sell order placed');
    
    return true;
  } catch (error) {
    console.error('[Gate Trader] Sell error:', error);
    return false;
  }
}

// Основной цикл торговли
async function tradingCycle() {
  if (!isRunning) return;
  
  try {
    console.log('[Gate Trader] Starting cycle. Total volume:', totalVolume, '/', targetVolume);
    
    // Покупка
    const buySuccess = await executeBuy();
    if (!buySuccess) {
      console.error('[Gate Trader] Buy failed');
      return;
    }
    
    // Ждем 1 секунду
    await new Promise(r => setTimeout(r, 1000));
    
    // Продажа
    const sellSuccess = await executeSell();
    if (!sellSuccess) {
      console.error('[Gate Trader] Sell failed');
      return;
    }
    
    // Проверяем достигнут ли целевой объем
    if (totalVolume >= targetVolume) {
      console.log('[Gate Trader] Target volume reached!');
      isRunning = false;
      chrome.runtime.sendMessage({action: 'tradingComplete', totalVolume});
      return;
    }
    
    // Ждем перед следующим циклом
    await new Promise(r => setTimeout(r, 2000));
    
    // Запускаем следующий цикл
    if (isRunning) {
      tradingCycle();
    }
  } catch (error) {
    console.error('[Gate Trader] Cycle error:', error);
    isRunning = false;
  }
}

// Запуск торговли
async function startTrading() {
  await waitForLoad();
  console.log('[Gate Trader] Page loaded, starting trading cycle');
  tradingCycle();
}

console.log('[Gate Trader] Content script loaded');
