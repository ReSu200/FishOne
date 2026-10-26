(function () {
  'use strict';

  const I = window.FishI18n;
  const S = window.FishStore;
  const N = window.FishNovel;

  const $ = function (id) {
    return document.getElementById(id);
  };

  let settings = null;
  let toastTimer = null;
  let currentNovel = null;

  /* ------------------------------ 基础工具 ------------------------------ */

  function toast(message) {
    if (!message) return;
    const el = $('toast');
    el.textContent = message;
    el.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove('on');
    }, 2200);
  }

  function fmt(value) {
    try {
      return Number(value || 0).toLocaleString(I.lang === 'en' ? 'en-US' : 'zh-CN');
    } catch (err) {
      return String(value || 0);
    }
  }

  function clampNumber(value, fallback, min, max) {
    const num = Number(value);
    if (!isFinite(num)) return fallback;
    return Math.min(Math.max(num, min), max);
  }

  function setStatus(text, kind) {
    const el = $('test-status');
    el.textContent = text || '';
    el.className = 'status' + (kind ? ' ' + kind : '');
  }

  function syncKeyButton() {
    const btn = $('toggle-key');
    btn.textContent = $('apiKey').type === 'password' ? I.t('showKey') : I.t('hideKey');
  }

  /* ------------------------------ 主题 ------------------------------ */

  function applyTheme(theme) {
    const next = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    $('theme-light').classList.toggle('active', next === 'light');
    $('theme-dark').classList.toggle('active', next === 'dark');
    return next;
  }

  async function setTheme(theme) {
    const next = applyTheme(theme);
    try {
      settings = await S.patchSettings({ theme: next });
    } catch (err) {
      /* noop */
    }
  }

  /* ------------------------------ 表单读写 ------------------------------ */

  function fillForm(data) {
    const r = data.reader;
    const ai = data.ai;

    $('left').value = r.left;
    $('top').value = r.top;
    $('width').value = r.width;
    $('height').value = r.height;

    $('fontSize').value = r.fontSize;
    $('lineHeight').value = r.lineHeight;
    $('textColor').value = r.textColor;
    $('bgColor').value = r.bgColor;
    $('bgOpacity').value = r.bgOpacity;
    $('blur').value = r.blur;
    $('radius').value = r.radius;
    $('border').checked = r.border !== false;

    $('apiKey').value = ai.apiKey || '';
    $('baseUrl').value = ai.baseUrl || '';
    $('model').value = ai.model || '';
    $('temperature').value = ai.temperature;
    $('maxTokens').value = ai.maxTokens;
    $('systemPrompt').value = ai.systemPrompt || '';

    $('hotkey').value = data.hotkeys && data.hotkeys.toggle ? data.hotkeys.toggle : '';
    $('language').value = data.language || 'auto';

    applyTheme(data.theme);
    syncDecorations();
    syncKeyButton();
  }

  function syncDecorations() {
    $('textColor-hex').textContent = String($('textColor').value || '').toUpperCase();
    $('bgColor-hex').textContent = String($('bgColor').value || '').toUpperCase();
    $('bgOpacity-val').textContent = Math.round(Number($('bgOpacity').value) * 100) + '%';
    $('blur-val').textContent = Math.round(Number($('blur').value)) + 'px';
    $('temperature-val').textContent = Number($('temperature').value).toFixed(1);
  }

  function readAiForm() {
    return {
      apiKey: String($('apiKey').value || '').trim(),
      baseUrl: String($('baseUrl').value || '').trim(),
      model: String($('model').value || '').trim(),
      temperature: clampNumber($('temperature').value, 0.7, 0, 2),
      maxTokens: Math.round(clampNumber($('maxTokens').value, 1024, 64, 8192)),
      systemPrompt: String($('systemPrompt').value || '')
    };
  }

  function collect() {
    const base = settings || S.defaults();
    return {
      reader: {
        left: Math.round(clampNumber($('left').value, base.reader.left, 0, 4000)),
        top: Math.round(clampNumber($('top').value, base.reader.top, 0, 3000)),
        width: Math.round(clampNumber($('width').value, base.reader.width, 300, 2400)),
        height: Math.round(clampNumber($('height').value, base.reader.height, 220, 1600)),
        fontSize: Math.round(clampNumber($('fontSize').value, base.reader.fontSize, 11, 32)),
        lineHeight: clampNumber($('lineHeight').value, base.reader.lineHeight, 1.2, 2.6),
        textColor: $('textColor').value || base.reader.textColor,
        bgColor: $('bgColor').value || base.reader.bgColor,
        bgOpacity: clampNumber($('bgOpacity').value, base.reader.bgOpacity, 0.2, 1),
        blur: Math.round(clampNumber($('blur').value, base.reader.blur, 0, 24)),
        radius: Math.round(clampNumber($('radius').value, base.reader.radius, 0, 32)),
        border: $('border').checked
      },
      ai: readAiForm(),
      hotkeys: {
        toggle: String($('hotkey').value || '').trim() || base.hotkeys.toggle
      },
      language: $('language').value || 'auto',
      theme: document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
    };
  }

  /* ------------------------------ 保存 ------------------------------ */

  async function save() {
    const next = collect();
    await S.saveSettings(next);
    settings = next;
    fillForm(settings);
    toast(I.t('saved'));
  }

  /* ------------------------------ AI 测试 ------------------------------ */

  async function testAi() {
    const ai = readAiForm();
    const btn = $('test-ai');
    if (!ai.apiKey) {
      setStatus(I.t('aiNoKey'), 'error');
      return;
    }
    btn.disabled = true;
    setStatus(I.t('testing'));
    try {
      const result = await chrome.runtime.sendMessage({ type: 'FO_TEST_AI', ai: ai });
      if (result && result.ok) {
        setStatus(I.t('testOk', { ms: result.ms }), 'ok');
      } else if (result && result.message === 'no-api-key') {
        setStatus(I.t('aiNoKey'), 'error');
      } else {
        setStatus(I.t('testFail', { msg: (result && result.message) || 'unknown' }), 'error');
      }
    } catch (err) {
      setStatus(I.t('testFail', { msg: err && err.message ? err.message : String(err) }), 'error');
    } finally {
      btn.disabled = false;
    }
  }

  /* ------------------------------ 小说管理 ------------------------------ */

  async function refreshNovelInfo() {
    currentNovel = await S.getNovel();
    const el = $('novel-info');
    if (!currentNovel) {
      el.textContent = I.t('noNovel');
      $('clear-novel').disabled = true;
      return;
    }
    const progress = await S.getProgress();
    let text = currentNovel.name + ' · ' + I.t('chars', { n: fmt(currentNovel.text.length) });
    if (progress && progress.novelId === currentNovel.id && currentNovel.text.length > 0) {
      const pct = (progress.charPos / currentNovel.text.length) * 100;
      text += ' · ' + pct.toFixed(1) + '%';
    }
    el.textContent = text;
    el.title = text;
    $('clear-novel').disabled = false;
  }

  async function handleFile(file) {
    if (!file) return;
    try {
      const data = await N.readFile(file);
      const text = N.normalizeText(data.text);
      if (!text) {
        toast(I.t('emptyFile'));
        return;
      }
      const novel = N.createNovel(data.name, text);
      await S.saveProgress({ novelId: novel.id, charPos: 0, total: novel.text.length });
      await S.setNovel(novel);
      await refreshNovelInfo();
      toast(I.t('imported'));
    } catch (err) {
      if (err && err.message === 'unsupported-file') {
        toast(I.t('unsupportedFile'));
      } else {
        toast(I.t('importFailed', { msg: err && err.message ? err.message : String(err) }));
      }
    }
  }

  /* ------------------------------ 快捷键录制 ------------------------------ */

  function normalizeKeyName(event) {
    const key = event.key;
    if (!key) return '';
    if (/^F\d{1,2}$/.test(key)) return key.toUpperCase();
    if (key === ' ') return 'Space';
    if (key.length === 1) return key.toUpperCase();
    return '';
  }

  function bindHotkeyRecorder() {
    const input = $('hotkey');

    input.addEventListener('focus', function () {
      input.classList.add('recording');
      input.value = '';
      input.setAttribute('placeholder', I.t('hotkeyRecording'));
    });

    input.addEventListener('blur', function () {
      input.classList.remove('recording');
      input.setAttribute('placeholder', I.t('hotkeyPlaceholder'));
      if (!input.value && settings) {
        input.value = settings.hotkeys ? settings.hotkeys.toggle : '';
      }
    });

    input.addEventListener('keydown', function (event) {
      if (event.key === 'Tab') return;
      event.preventDefault();
      event.stopPropagation();

      const comboKey = normalizeKeyName(event);
      const isModifier = ['Control', 'Alt', 'Shift', 'Meta'].indexOf(event.key) >= 0;
      if (isModifier || !comboKey) return;

      const parts = [];
      if (event.ctrlKey) parts.push('Ctrl');
      if (event.altKey) parts.push('Alt');
      if (event.shiftKey) parts.push('Shift');
      if (event.metaKey) parts.push('Meta');

      const isFunctionKey = /^F\d{1,2}$/.test(comboKey);
      if (parts.length === 0 && !isFunctionKey) {
        toast(I.t('hotkeyInvalid'));
        return;
      }

      const combo = parts.concat(comboKey).join('+');
      input.value = combo;
      input.blur();
      S.patchSettings({ 'hotkeys.toggle': combo }).then(function (next) {
        settings = next;
        refreshFooterHints();
        toast(I.t('saved'));
      });
    });
  }

  function refreshFooterHints() {
    // 仅快捷键提示需要即时刷新（其他文案由 i18n 统一处理）
    if (settings) {
      $('hotkey').value = settings.hotkeys ? settings.hotkeys.toggle : '';
    }
  }

  /* ------------------------------ 面板切换 ------------------------------ */

  function switchPanel(name) {
    document.querySelectorAll('.nav-item').forEach(function (item) {
      const on = item.getAttribute('data-panel') === name;
      item.classList.toggle('active', on);
      item.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.querySelectorAll('.panel').forEach(function (panel) {
      panel.classList.toggle('active', panel.id === 'panel-' + name);
    });
  }

  /* ------------------------------ Token 统计 ------------------------------ */

  function fmtTime(timestamp) {
    if (!timestamp) return '';
    try {
      return new Date(timestamp).toLocaleString(I.lang === 'en' ? 'en-US' : 'zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (err) {
      return new Date(timestamp).toLocaleString();
    }
  }

  function renderUsage(usage) {
    $('usage-prompt').textContent = fmt(usage.prompt);
    $('usage-completion').textContent = fmt(usage.completion);
    $('usage-total').textContent = fmt(usage.total);
    $('usage-calls').textContent = fmt(usage.calls);

    const notes = [];
    if (usage.lastAt) notes.push(I.t('lastCall', { time: fmtTime(usage.lastAt) }));
    if (usage.estimatedCalls > 0) notes.push(I.t('usageEstimated', { n: fmt(usage.estimatedCalls) }));
    $('usage-note').textContent = usage.calls > 0 ? notes.join(' · ') : I.t('usageEmpty');
  }

  async function refreshUsage() {
    renderUsage(await S.getUsage());
  }

  /* ------------------------------ 事件绑定 ------------------------------ */

  function bind() {
    document.querySelectorAll('.nav-item').forEach(function (item) {
      item.addEventListener('click', function () {
        switchPanel(item.getAttribute('data-panel'));
      });
    });

    $('save').addEventListener('click', function () {
      save().catch(function (err) {
        toast(String(err && err.message ? err.message : err));
      });
    });

    $('theme-light').addEventListener('click', function () {
      setTheme('light');
    });

    $('theme-dark').addEventListener('click', function () {
      setTheme('dark');
    });

    $('reset').addEventListener('click', async function () {
      if (!window.confirm(I.t('resetConfirm'))) return;
      settings = await S.resetSettings();
      I.setLang(settings.language);
      I.applyDom(document);
      fillForm(settings);
      await refreshNovelInfo();
      toast(I.t('saved'));
    });

    $('language').addEventListener('change', async function () {
      const lang = $('language').value;
      I.setLang(lang);
      I.applyDom(document);
      try {
        settings = await S.patchSettings({ language: lang });
      } catch (err) {
        /* noop */
      }
      fillForm(settings);
      await refreshNovelInfo();
      await refreshUsage();
    });

    $('toggle-key').addEventListener('click', function () {
      const input = $('apiKey');
      input.type = input.type === 'password' ? 'text' : 'password';
      syncKeyButton();
    });

    $('test-ai').addEventListener('click', testAi);

    $('clear-usage').addEventListener('click', async function () {
      if (!window.confirm(I.t('clearUsageConfirm'))) return;
      await S.clearUsage();
      await refreshUsage();
      toast(I.t('usageCleared'));
    });

    $('open-shortcuts').addEventListener('click', function () {
      const isEdge = /Edg\//.test(navigator.userAgent);
      chrome.tabs.create({
        url: isEdge ? 'edge://extensions/shortcuts' : 'chrome://extensions/shortcuts'
      });
    });

    $('import-novel').addEventListener('click', function () {
      $('file-input').click();
    });

    $('file-input').addEventListener('change', function (event) {
      const file = event.target.files && event.target.files[0];
      handleFile(file).finally(function () {
        event.target.value = '';
      });
    });

    $('clear-novel').addEventListener('click', async function () {
      if (!window.confirm(I.t('clearConfirm'))) return;
      await S.clearNovel();
      await refreshNovelInfo();
      toast(I.t('clearNovel'));
    });

    ['bgOpacity', 'blur', 'temperature', 'textColor', 'bgColor'].forEach(function (id) {
      $(id).addEventListener('input', syncDecorations);
    });

    // 小说在其他页面被导入 / 清除时，这里同步刷新
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area === 'sync' && changes['fishone.settings']) {
        const next = changes['fishone.settings'].newValue || {};
        if (next.theme && next.theme !== document.documentElement.getAttribute('data-theme')) {
          applyTheme(next.theme);
        }
        return;
      }
      if (area !== 'local') return;
      if (changes['fishone.novel'] || changes['fishone.progress']) {
        refreshNovelInfo();
      }
      if (changes['fishone.usage']) {
        refreshUsage();
      }
    });

    bindHotkeyRecorder();
  }

  /* ------------------------------ 启动 ------------------------------ */

  async function init() {
    settings = await S.getSettings();
    I.setLang(settings.language);
    I.applyDom(document);
    fillForm(settings);
    bind();
    await refreshNovelInfo();
    await refreshUsage();
  }

  init().catch(function (err) {
    setStatus(String(err && err.message ? err.message : err), 'error');
  });
})();

