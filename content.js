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
  } else if (request.action === 'marketBuy') {
    handleMarketBuy(request.usdtAmount).then(resp => sendResponse(resp)).catch(err => sendResponse({ok: false, error: err.message}));
    return true; // async
  } else if (request.action === 'marketSellAll') {
    handleMarketSellAll().then(resp => sendResponse(resp)).catch(err => sendResponse({ok: false, error: err.message}));
    return true; // async
  }
  return true;
});

// Helper: wait
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper: find button by text
function findButtonByText(text) {
  const buttons = Array.from(document.querySelectorAll('button'));
  return buttons.find(btn => btn.textContent.trim().includes(text));
}

// Покупка по рынку
async function handleMarketBuy(usdtAmount) {
  try {
    console.log('[Gate Trader] Executing market BUY for $' + usdtAmount);
    
    // 1. Убедимся что мы на вкладке Buy
    const buyTab = findButtonByText('Buy');
    if (buyTab && !buyTab.classList.contains('active')) {
      buyTab.click();
      await sleep(300);
    }
    
    // 2. Найти инпут Amount
    const amountInput = document.querySelector('input[placeholder*="Amount"], input[placeholder*="amount"]');
    if (!amountInput) throw new Error('Amount input not found');
    
    // 3. Вычислить сумму в GF (по текущей цене)
    const priceEl = document.querySelector('[class*="price"]');
    const currentPrice = priceEl ? parseFloat(priceEl.textContent) : 0.0042; // fallback
    const gfAmount = (usdtAmount / currentPrice).toFixed(2);
    
    // 4. Ввести количество
    amountInput.focus();
    amountInput.value = gfAmount;
    amountInput.dispatchEvent(new Event('input', { bubbles: true }));
    amountInput.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(200);
    
    // 5. Найти и нажать кнопку Buy
    const buyButton = document.querySelector('.main-btn[class*="buy"], button[class*="buy"][class*="main"]');
    if (!buyButton) throw new Error('Buy button not found');
    
    buyButton.click();
    await sleep(500);
    
    // 6. Подтвердить в модалке
    await confirmModal();
    
    console.log('[Gate Trader] ✓ BUY completed');
    return { ok: true };
  } catch (err) {
    console.error('[Gate Trader] BUY error:', err);
    return { ok: false, error: err.message };
  }
}

// Продажа всего
async function handleMarketSellAll() {
  try {
    console.log('[Gate Trader] Executing market SELL ALL');
    
    // 1. Переключиться на Sell
    const sellTab = findButtonByText('Sell');
    if (sellTab) {
      sellTab.click();
      await sleep(300);
    }
    
    // 2. Найти кнопку MAX или 100%
    const maxBtn = findButtonByText('Max') || findButtonByText('100');
    if (maxBtn) {
      maxBtn.click();
      await sleep(200);
    }
    
    // 3. Нажать Sell
    const sellButton = document.querySelector('.main-btn[class*="sell"], button[class*="sell"][class*="main"]');
    if (!sellButton) throw new Error('Sell button not found');
    
    sellButton.click();
    await sleep(500);
    
    // 4. Подтвердить
    await confirmModal();
    
    console.log('[Gate Trader] ✓ SELL completed');
    return { ok: true };
  } catch (err) {
    console.error('[Gate Trader] SELL error:', err);
    return { ok: false, error: err.message };
  }
}

// Подтвердить модальное окно
async function confirmModal() {
  await sleep(300);
  const confirmBtn = findButtonByText('Confirm') || document.querySelector('button[class*="confirm"]');
  if (confirmBtn) {
    confirmBtn.click();
    await sleep(500);
  }
}

console.log('[Gate Trader] Content script loaded');
