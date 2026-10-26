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
      border: true
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
    language: 'auto'
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

  function readArea(name, key) {
    return new Promise(function (resolve) {
      area(name).get(key, function (result) {
        resolve(result ? result[key] : undefined);
      });
    });
  }

  function writeArea(name, key, value) {
    return new Promise(function (resolve) {
      const payload = {};
      payload[key] = value;
      area(name).set(payload, function () {
        resolve(value);
      });
    });
  }

  function removeArea(name, keys) {
    return new Promise(function (resolve) {
      area(name).remove(keys, function () {
        resolve();
      });
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

  function onChanged(callback) {
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
    });
  }

  global.FishStore = {
    SETTINGS_KEY: SETTINGS_KEY,
    NOVEL_KEY: NOVEL_KEY,
    PROGRESS_KEY: PROGRESS_KEY,
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
    onChanged: onChanged
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
