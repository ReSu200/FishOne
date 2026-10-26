/**
 * OpenAI 协议兼容的 AI 调用封装（在 Service Worker 中使用）。
 */
(function (global) {
  'use strict';

  function normalizeChatEndpoint(baseUrl) {
    let base = String(baseUrl || '').trim().replace(/\/+$/, '');
    if (!base) throw new Error('Base URL 不能为空');
    if (/\/chat\/completions$/i.test(base)) return base;
    if (/\/v\d+(\.\d+)?$/i.test(base)) return base + '/chat/completions';
    return base + '/v1/chat/completions';
  }

  function buildSummaryMessages(options) {
    const opts = options || {};
    const isEn = opts.lang === 'en';
    const custom = String(opts.systemPrompt || '').trim();
    const system = custom || (isEn
      ? 'You are a careful reading assistant. Summarize the given novel excerpt in clear, concise language: key plot points, characters involved, and any cliffhanger. Do not invent details. Use short bullet points where helpful.'
      : '你是一位细致的小说阅读助手。请用简洁清晰的中文总结给定的小说片段：概括关键剧情、涉及的人物，以及是否存在悬念或转折。不要编造原文没有的信息，必要时用短句分点说明。');
    const content = (isEn ? 'Novel excerpt:\n\n' : '小说片段：\n\n') + String(opts.text || '');
    return [
      { role: 'system', content: system },
      { role: 'user', content: content }
    ];
  }

  async function describeError(response) {
    let detail = '';
    try {
      const text = await response.text();
      try {
        const json = JSON.parse(text);
        detail = (json.error && (json.error.message || json.error.type)) || json.message || '';
      } catch (e) {
        detail = text;
      }
    } catch (e) {
      detail = '';
    }
    detail = String(detail || '').trim();
    if (detail.length > 300) detail = detail.slice(0, 300) + '…';
    return detail || 'HTTP ' + response.status + ' ' + (response.statusText || '');
  }

  function withTimeout(ms) {
    const controller = new AbortController();
    const timer = setTimeout(function () {
      controller.abort(new Error('请求超时'));
    }, ms);
    return {
      signal: controller.signal,
      clear: function () {
        clearTimeout(timer);
      }
    };
  }

  async function streamChat(options) {
    const opts = options || {};
    if (!opts.apiKey) throw new Error('missing api key');
    const url = normalizeChatEndpoint(opts.baseUrl);
    const guard = withTimeout(opts.timeout || 120000);
    const externalSignal = opts.signal;
    if (externalSignal) {
      externalSignal.addEventListener('abort', function () {
        guard.clear();
      });
    }

    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + opts.apiKey
        },
        body: JSON.stringify({
          model: opts.model,
          messages: opts.messages,
          temperature: typeof opts.temperature === 'number' ? opts.temperature : 0.7,
          max_tokens: opts.maxTokens || 1024,
          stream: true
        }),
        signal: guard.signal
      });
    } catch (err) {
      guard.clear();
      throw new Error(err && err.message ? err.message : '网络请求失败');
    }

    if (!response.ok) {
      const detail = await describeError(response);
      guard.clear();
      throw new Error(detail);
    }

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    const emit = typeof opts.onDelta === 'function' ? opts.onDelta : function () {};

    if (!contentType.includes('event-stream') || !response.body) {
      const json = await response.json();
      const choice = (json.choices && json.choices[0]) || {};
      const text = (choice.message && choice.message.content) || choice.text || '';
      guard.clear();
      if (text) emit(text);
      return text;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';

    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        let newlineIndex;
        while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newlineIndex).replace(/\r$/, '').trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (!line || line.charAt(0) === ':') continue;
          if (line.indexOf('data:') !== 0) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const json = JSON.parse(payload);
            const choice = (json.choices && json.choices[0]) || {};
            const delta = (choice.delta && choice.delta.content) || '';
            if (delta) {
              full += delta;
              emit(delta);
            }
          } catch (e) {
            // 忽略无法解析的心跳数据
          }
        }
      }
    } finally {
      guard.clear();
      try {
        reader.releaseLock();
      } catch (e) {
        /* noop */
      }
    }

    return full;
  }

  async function testConnection(options) {
    const opts = options || {};
    if (!opts.apiKey) throw new Error('missing api key');
    const url = normalizeChatEndpoint(opts.baseUrl);
    const guard = withTimeout(20000);
    const started = Date.now();
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + opts.apiKey
        },
        body: JSON.stringify({
          model: opts.model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 16,
          stream: false
        }),
        signal: guard.signal
      });
      if (!response.ok) {
        throw new Error(await describeError(response));
      }
      await response.text();
      return { ok: true, ms: Date.now() - started };
    } finally {
      guard.clear();
    }
  }

  global.FishAI = {
    normalizeChatEndpoint: normalizeChatEndpoint,
    buildSummaryMessages: buildSummaryMessages,
    streamChat: streamChat,
    testConnection: testConnection
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
