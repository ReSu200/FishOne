/**
 * 配置与数据存储封装。
 * - 设置存放于 chrome.storage.sync（体积小、可跨设备同步）
 * - 小说正文与阅读进度存放于 chrome.storage.local（体积大）
 */
(function (global) {
  'use strict';

  const SETTINGS_KEY = 'fishone.settings';
  const NOVEL_KEY = 'fishone.novel';
  const PROGRESS_KEY = 'fishone.progress';
  const USAGE_KEY = 'fishone.usage';
  const AI_HISTORY_KEY = 'fishone.aiHistory';
  const AI_HISTORY_LIMIT = 10;

  const DEFAULT_SETTINGS = {
    reader: {
      left: 60,
      top: 60,
      width: 520,
      height: 380,
      fontSize: 16,
      lineHeight: 1.8,
      textColor: '#e9edf1',
      bgColor: '#0e1116',
      bgOpacity: 0.9,
      blur: 10,
      radius: 14,
      border: true,
      aiSplit: 45
    },
    ai: {
      apiKey: '',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat',
      temperature: 0.7,
      maxTokens: 1024,
      systemPrompt: ''
    },
    hotkeys: {
      toggle: 'Alt+Q'
    },
    language: 'auto',
    theme: 'dark'
  };

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function deepMerge(base, patch) {
    const out = deepClone(base);
    if (!isPlainObject(patch)) return out;
    Object.keys(patch).forEach(function (key) {
      const next = patch[key];
      if (isPlainObject(next) && isPlainObject(out[key])) {
        out[key] = deepMerge(out[key], next);
      } else if (next !== undefined) {
        out[key] = next;
      }
    });
    return out;
  }

  function area(name) {
    return name === 'local' ? chrome.storage.local : chrome.storage.sync;
  }

  // 扩展被重新加载后，旧页面里的内容脚本会失去 chrome.* 上下文；
  // 这里提前判断，避免抛出未捕获的 "Extension context invalidated"
  function alive() {
    try {
      return !!(chrome && chrome.runtime && chrome.runtime.id && chrome.storage);
    } catch (err) {
      return false;
    }
  }

  function readArea(name, key) {
    return new Promise(function (resolve) {
      try {
        if (!alive()) {
          resolve(undefined);
          return;
        }
        area(name).get(key, function (result) {
          void chrome.runtime.lastError;
          resolve(result ? result[key] : undefined);
        });
      } catch (err) {
        resolve(undefined);
      }
    });
  }

  function writeArea(name, key, value) {
    return new Promise(function (resolve) {
      try {
        if (!alive()) {
          resolve(value);
          return;
        }
        const payload = {};
        payload[key] = value;
        area(name).set(payload, function () {
          void chrome.runtime.lastError;
          resolve(value);
        });
      } catch (err) {
        resolve(value);
      }
    });
  }

  function removeArea(name, keys) {
    return new Promise(function (resolve) {
      try {
        if (!alive()) {
          resolve();
          return;
        }
        area(name).remove(keys, function () {
          void chrome.runtime.lastError;
          resolve();
        });
      } catch (err) {
        resolve();
      }
    });
  }

  async function getSettings() {
    const stored = await readArea('sync', SETTINGS_KEY);
    return deepMerge(DEFAULT_SETTINGS, stored || {});
  }

  async function saveSettings(settings) {
    const merged = deepMerge(DEFAULT_SETTINGS, settings || {});
    await writeArea('sync', SETTINGS_KEY, merged);
    return merged;
  }

  /**
   * 支持点路径更新，例如 patchSettings({ 'reader.width': 600 })
   */
  async function patchSettings(patch) {
    const current = await getSettings();
    const expanded = {};
    Object.keys(patch || {}).forEach(function (path) {
      const parts = path.split('.');
      let cursor = expanded;
      for (let i = 0; i < parts.length - 1; i += 1) {
        cursor[parts[i]] = cursor[parts[i]] || {};
        cursor = cursor[parts[i]];
      }
      cursor[parts[parts.length - 1]] = patch[path];
    });
    return saveSettings(deepMerge(current, expanded));
  }

  async function resetSettings() {
    await removeArea('sync', SETTINGS_KEY);
    return deepClone(DEFAULT_SETTINGS);
  }

  async function getNovel() {
    return (await readArea('local', NOVEL_KEY)) || null;
  }

  async function setNovel(novel) {
    await writeArea('local', NOVEL_KEY, novel);
    return novel;
  }

  async function clearNovel() {
    await removeArea('local', [NOVEL_KEY, PROGRESS_KEY]);
  }

  async function getProgress() {
    return (await readArea('local', PROGRESS_KEY)) || null;
  }

  async function saveProgress(progress) {
    return writeArea('local', PROGRESS_KEY, Object.assign({}, progress, { updatedAt: Date.now() }));
  }

  function toCount(value) {
    const num = Number(value);
    return isFinite(num) && num > 0 ? Math.round(num) : 0;
  }

  function normalizeUsage(usage) {
    const source = usage && typeof usage === 'object' ? usage : {};
    return {
      prompt: toCount(source.prompt),
      completion: toCount(source.completion),
      total: toCount(source.total),
      calls: toCount(source.calls),
      estimatedCalls: toCount(source.estimatedCalls),
      lastAt: toCount(source.lastAt)
    };
  }

  async function getUsage() {
    return normalizeUsage(await readArea('local', USAGE_KEY));
  }

  /**
   * 累加一次 API 调用的用量；estimated 为 true 表示该次数值为估算值
   */
  async function addUsage(usage) {
    const current = await getUsage();
    const add = normalizeUsage(usage);
    const next = {
      prompt: current.prompt + add.prompt,
      completion: current.completion + add.completion,
      total: current.total + add.total,
      calls: current.calls + 1,
      estimatedCalls: current.estimatedCalls + (usage && usage.estimated ? 1 : 0),
      lastAt: Date.now()
    };
    await writeArea('local', USAGE_KEY, next);
    return next;
  }

  async function clearUsage() {
    await removeArea('local', [USAGE_KEY]);
  }

  function normalizeAiHistory(list) {
    if (!Array.isArray(list)) return [];
    return list.filter(function (item) {
      return item && typeof item === 'object' && typeof item.text === 'string';
    }).slice(0, AI_HISTORY_LIMIT);
  }

  async function getAiHistory() {
    return normalizeAiHistory(await readArea('local', AI_HISTORY_KEY));
  }

  /**
   * 新增一条总结记录，最新的排在最前，最多保留 10 条
   */
  async function addAiHistory(entry) {
    if (!entry) return getAiHistory();
    const list = await getAiHistory();
    const item = Object.assign({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      at: Date.now()
    }, entry);
    const next = [item].concat(list.filter(function (old) {
      return old.id !== item.id;
    })).slice(0, AI_HISTORY_LIMIT);
    await writeArea('local', AI_HISTORY_KEY, next);
    return next;
  }

  async function removeAiHistory(id) {
    const list = await getAiHistory();
    const next = list.filter(function (item) {
      return item.id !== id;
    });
    await writeArea('local', AI_HISTORY_KEY, next);
    return next;
  }

  async function clearAiHistory() {
    await removeArea('local', [AI_HISTORY_KEY]);
  }

  function onChanged(callback) {
    if (!alive()) return;
    chrome.storage.onChanged.addListener(function (changes, areaName) {
      if (changes[SETTINGS_KEY]) {
        callback({
          type: 'settings',
          area: areaName,
          settings: deepMerge(DEFAULT_SETTINGS, changes[SETTINGS_KEY].newValue || {})
        });
      }
      if (changes[NOVEL_KEY]) {
        callback({
          type: 'novel',
          area: areaName,
          novel: changes[NOVEL_KEY].newValue || null
        });
      }
      if (changes[USAGE_KEY]) {
        callback({
          type: 'usage',
          area: areaName,
          usage: normalizeUsage(changes[USAGE_KEY].newValue)
        });
      }
    });
  }

  global.FishStore = {
    SETTINGS_KEY: SETTINGS_KEY,
    NOVEL_KEY: NOVEL_KEY,
    PROGRESS_KEY: PROGRESS_KEY,
    USAGE_KEY: USAGE_KEY,
    AI_HISTORY_KEY: AI_HISTORY_KEY,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    defaults: function () {
      return deepClone(DEFAULT_SETTINGS);
    },
    merge: deepMerge,
    getSettings: getSettings,
    saveSettings: saveSettings,
    patchSettings: patchSettings,
    resetSettings: resetSettings,
    getNovel: getNovel,
    setNovel: setNovel,
    clearNovel: clearNovel,
    getProgress: getProgress,
    saveProgress: saveProgress,
    getUsage: getUsage,
    addUsage: addUsage,
    clearUsage: clearUsage,
    getAiHistory: getAiHistory,
    addAiHistory: addAiHistory,
    removeAiHistory: removeAiHistory,
    clearAiHistory: clearAiHistory,
    onChanged: onChanged
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
