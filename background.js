/**
 * Service Worker：AI 请求转发（规避页面 CORS）、浏览器级快捷键、跨页面设置。
 */
importScripts('lib/ai.js', 'lib/storage.js');

const SETTINGS_KEY = 'fishone.settings';

function estimateTokens(text) {
  // 粗略估算：中英混排平均约 1.5 个字符 ≈ 1 token
  const len = String(text || '').length;
  return Math.ceil(len / 1.5);
}

/**
 * 记录一次总结调用的 Token 用量；服务未返回 usage 时退化为字符估算
 */
async function recordUsage(messages, resultText, usage) {
  if (usage) {
    await FishStore.addUsage(usage);
    return;
  }
  await FishStore.addUsage(estimateUsage(messages, resultText));
}

/**
 * 服务未返回 usage 时按字符估算，estimated 供界面区分「约」
 */
function estimateUsage(messages, resultText) {
  const promptText = (messages || []).map(function (item) {
    return item && item.content ? item.content : '';
  }).join('\n');
  const prompt = estimateTokens(promptText);
  const completion = estimateTokens(resultText);
  return {
    prompt: prompt,
    completion: completion,
    total: prompt + completion,
    estimated: true
  };
}

async function readSettings() {
  try {
    const result = await chrome.storage.sync.get(SETTINGS_KEY);
    return result && result[SETTINGS_KEY] ? result[SETTINGS_KEY] : {};
  } catch (err) {
    return {};
  }
}

function safePost(port, message) {
  try {
    port.postMessage(message);
  } catch (err) {
    /* 端口已断开 */
  }
}

chrome.runtime.onConnect.addListener(function (port) {
  if (port.name !== 'fishone-ai') return;

  let controller = null;

  port.onDisconnect.addListener(function () {
    if (controller) controller.abort();
  });

  port.onMessage.addListener(async function (message) {
    if (!message || typeof message !== 'object') return;

    if (message.type === 'stop') {
      if (controller) controller.abort();
      return;
    }

    if (message.type === 'start') {
      if (controller) controller.abort();
      controller = new AbortController();

      const settings = await readSettings();
      const ai = settings.ai || {};

      if (!ai.apiKey) {
        safePost(port, { type: 'error', message: 'no-api-key' });
        return;
      }

      const messages = FishAI.buildSummaryMessages({
        text: message.text,
        lang: message.lang,
        systemPrompt: ai.systemPrompt
      });

      try {
        let reportedUsage = null;
        const result = await FishAI.streamChat({
          apiKey: ai.apiKey,
          baseUrl: ai.baseUrl,
          model: ai.model,
          messages: messages,
          temperature: ai.temperature,
          maxTokens: ai.maxTokens,
          signal: controller.signal,
          onDelta: function (delta) {
            safePost(port, { type: 'delta', text: delta });
          },
          onUsage: function (usage) {
            reportedUsage = usage;
          }
        });
        if (!controller.signal.aborted) {
          const finalUsage = reportedUsage || estimateUsage(messages, result);
          safePost(port, { type: 'done', text: result, usage: finalUsage });
          recordUsage(messages, result, reportedUsage).catch(function () {
            /* 统计失败不影响阅读体验 */
          });
        }
      } catch (err) {
        const message2 = err && err.message ? err.message : String(err);
        if (message2 !== 'The user aborted a request.' && message2 !== 'AbortError') {
          safePost(port, { type: 'error', message: message2 });
        } else {
          safePost(port, { type: 'aborted' });
        }
      }
    }
  });
});

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (!message || typeof message !== 'object') return false;

  if (message.type === 'FO_OPEN_OPTIONS') {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === 'FO_TEST_AI') {
    const ai = message.ai || {};
    if (!ai.apiKey) {
      sendResponse({ ok: false, message: 'no-api-key' });
      return false;
    }
    FishAI.testConnection({
      apiKey: ai.apiKey,
      baseUrl: ai.baseUrl,
      model: ai.model
    })
      .then(function (result) {
        sendResponse({ ok: true, ms: result.ms });
      })
      .catch(function (err) {
        sendResponse({ ok: false, message: err && err.message ? err.message : String(err) });
      });
    return true;
  }

  return false;
});

chrome.commands.onCommand.addListener(async function (command) {
  if (command !== 'toggle-reader') return;
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs && tabs[0];
    if (!tab || !tab.id) return;
    await chrome.tabs.sendMessage(tab.id, { type: 'FO_TOGGLE' });
  } catch (err) {
    // 当前标签页无法注入阅读器（如浏览器内部页面），静默忽略
  }
});
