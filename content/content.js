/**
 * FishOne 阅读器主脚本（注入到每个网页，使用 Shadow DOM 隔离样式）
 */
(function () {
  'use strict';

  if (window.__fishoneReaderLoaded) return;
  window.__fishoneReaderLoaded = true;

  const I = window.FishI18n;
  const S = window.FishStore;
  const N = window.FishNovel;

  const Z_INDEX = '2147483647';
  const MIN_WIDTH = 300;
  const MIN_HEIGHT = 220;

  let settings = null;
  let novel = null;
  let host = null;
  let shadow = null;
  let cssReady = null;
  let els = {};

  let saveTimer = null;
  let toastTimer = null;
  let resizeTimer = null;
  let lastWheelAt = 0;

  let aiPort = null;
  let aiBusy = false;

  const state = {
    visible: false,
    charPos: 0,
    pageCharCount: 0,
    pageText: '',
    history: [],
    dirty: false
  };

  /* ------------------------------ 工具函数 ------------------------------ */

  function clamp(value, min, max) {
    if (max < min) max = min;
    return Math.min(Math.max(value, min), max);
  }

  function nextFrame() {
    return new Promise(function (resolve) {
      requestAnimationFrame(function () {
        requestAnimationFrame(resolve);
      });
    });
  }

  function colorWithAlpha(color, alpha) {
    let hex = String(color || '#000000').trim().replace('#', '');
    if (hex.length === 3) {
      hex = hex.split('').map(function (c) { return c + c; }).join('');
    }
    if (!/^[0-9a-f]{6}$/i.test(hex)) hex = '000000';
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const a = clamp(typeof alpha === 'number' ? alpha : 1, 0, 1);
    return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + a + ')';
  }

  function isEditable(target) {
    if (!target || !target.tagName) return false;
    const tag = target.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
  }

  function numberText(value) {
    try {
      return Number(value || 0).toLocaleString(I.lang === 'en' ? 'en-US' : 'zh-CN');
    } catch (err) {
      return String(value || 0);
    }
  }

  /* ------------------------------ 界面构建 ------------------------------ */

  const ICON = {
    ai: '<svg viewBox="0 0 24 24"><path d="M12 3l1.7 4.6L18 9.3l-4.3 1.7L12 15.6l-1.7-4.6L6 9.3l4.3-1.7z"/><path d="M18 15l.9 2.4L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.6z"/></svg>',
    gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    book: '<svg viewBox="0 0 24 24"><path d="M4 5.5A2.5 2.5 0 016.5 3H19v15H6.5A2.5 2.5 0 004 20.5z"/><path d="M4 20.5A2.5 2.5 0 016.5 18H19v3H6.5"/></svg>'
  };

  function buildUi() {
    host = document.createElement('div');
    host.id = 'fishone-reader-host';
    host.setAttribute('style', 'all: initial; position: fixed; z-index: ' + Z_INDEX + '; display: none;');

    shadow = host.attachShadow({ mode: 'open' });

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('content/content.css');
    cssReady = new Promise(function (resolve) {
      link.addEventListener('load', resolve);
      link.addEventListener('error', resolve);
    });
    shadow.appendChild(link);

    const panel = document.createElement('div');
    panel.className = 'fo-panel';
    panel.innerHTML = [
      '<div class="fo-head">',
      '  <div class="fo-title">',
      '    <span class="fo-title-name"></span>',
      '    <span class="fo-title-page"></span>',
      '  </div>',
      '  <div class="fo-actions">',
      '    <button class="fo-btn fo-accent" data-act="ai" data-i18n-title="ai">AI</button>',
      '    <button class="fo-btn" data-act="options" data-i18n-title="settings">' + ICON.gear + '</button>',
      '    <button class="fo-btn" data-act="hide" data-i18n-title="hideReader">' + ICON.close + '</button>',
      '  </div>',
      '</div>',
      '<div class="fo-progress"><i></i></div>',
      '<div class="fo-body">',
      '  <div class="fo-text"></div>',
      '  <div class="fo-measure"></div>',
      '  <div class="fo-empty">',
      '    <div class="fo-empty-icon">' + ICON.book + '</div>',
      '    <div class="fo-empty-title" data-i18n="noNovel"></div>',
      '    <div class="fo-empty-hint" data-i18n="noNovelHint"></div>',
      '    <button class="fo-btn" data-act="import" data-i18n="importNovel"></button>',
      '  </div>',
      '  <div class="fo-ai">',
      '    <div class="fo-ai-head">',
      '      <span data-i18n="aiPanelTitle"></span>',
      '      <button class="fo-btn" data-act="ai-close" data-i18n-title="close">' + ICON.close + '</button>',
      '    </div>',
      '    <div class="fo-ai-label"><span data-i18n="aiInputLabel"></span></div>',
      '    <textarea class="fo-ai-input" data-i18n-placeholder="aiPlaceholder"></textarea>',
      '    <div class="fo-ai-label">',
      '      <span data-i18n="aiResultLabel"></span>',
      '      <button class="fo-btn" data-act="ai-copy" data-i18n="aiCopy"></button>',
      '    </div>',
      '    <div class="fo-ai-result"></div>',
      '    <div class="fo-ai-actions">',
      '      <button class="fo-btn fo-primary" data-act="ai-run" data-i18n="aiRun"></button>',
      '      <span class="fo-ai-status"></span>',
      '    </div>',
      '  </div>',
      '</div>',
      '<div class="fo-foot">',
      '  <button class="fo-btn" data-act="prev" data-i18n="prevPage"></button>',
      '  <div class="fo-meta"></div>',
      '  <button class="fo-btn" data-act="next" data-i18n="nextPage"></button>',
      '</div>',
      '<div class="fo-resize"></div>',
      '<div class="fo-toast"></div>',
      '<input type="file" class="fo-file" accept=".txt,text/plain">'
    ].join('');

    shadow.appendChild(panel);

    els.panel = panel;
    els.head = panel.querySelector('.fo-head');
    els.titleName = panel.querySelector('.fo-title-name');
    els.titlePage = panel.querySelector('.fo-title-page');
    els.progressBar = panel.querySelector('.fo-progress > i');
    els.body = panel.querySelector('.fo-body');
    els.text = panel.querySelector('.fo-text');
    els.measure = panel.querySelector('.fo-measure');
    els.empty = panel.querySelector('.fo-empty');
    els.emptyTitle = panel.querySelector('.fo-empty-title');
    els.emptyHint = panel.querySelector('.fo-empty-hint');
    els.meta = panel.querySelector('.fo-meta');
    els.resize = panel.querySelector('.fo-resize');
    els.toast = panel.querySelector('.fo-toast');
    els.fileInput = panel.querySelector('.fo-file');
    els.aiPanel = panel.querySelector('.fo-ai');
    els.aiInput = panel.querySelector('.fo-ai-input');
    els.aiResult = panel.querySelector('.fo-ai-result');
    els.aiStatus = panel.querySelector('.fo-ai-status');
    els.aiRun = panel.querySelector('[data-act="ai-run"]');
    els.aiCopy = panel.querySelector('[data-act="ai-copy"]');

    document.documentElement.appendChild(host);
  }

  /* ------------------------------ 设置应用 ------------------------------ */

  function viewport() {
    return {
      width: window.innerWidth || document.documentElement.clientWidth || 1280,
      height: window.innerHeight || document.documentElement.clientHeight || 800
    };
  }

  function applySettings() {
    if (!host || !settings) return;
    const r = settings.reader;
    const vp = viewport();
    const width = Math.max(MIN_WIDTH, Math.min(Number(r.width) || 520, vp.width - 20));
    const height = Math.max(MIN_HEIGHT, Math.min(Number(r.height) || 380, vp.height - 20));
    const left = clamp(Number(r.left) || 60, -(width - 120), Math.max(0, vp.width - 120));
    const top = clamp(Number(r.top) || 60, 0, Math.max(0, vp.height - 80));

    host.style.width = width + 'px';
    host.style.height = height + 'px';
    host.style.left = left + 'px';
    host.style.top = top + 'px';
    host.style.display = state.visible ? 'block' : 'none';

    host.style.setProperty('--fo-bg', colorWithAlpha(r.bgColor, r.bgOpacity));
    host.style.setProperty('--fo-blur', (Number(r.blur) || 0) + 'px');
    host.style.setProperty('--fo-radius', (Number(r.radius) || 0) + 'px');
    host.style.setProperty('--fo-text', r.textColor || '#e9edf1');
    host.style.setProperty('--fo-font-size', (Number(r.fontSize) || 16) + 'px');
    host.style.setProperty('--fo-line-height', String(Number(r.lineHeight) || 1.8));
    host.style.setProperty('--fo-border-width', r.border === false ? '0px' : '1px');

    els.head.querySelector('[data-act="hide"]').setAttribute('title', I.t('hideReader'));
    els.head.querySelector('[data-act="options"]').setAttribute('title', I.t('settings'));
    els.head.querySelector('[data-act="ai"]').setAttribute('title', I.t('ai'));
    els.fileInput.setAttribute('accept', '.txt,text/plain');
  }

  function updateStaticText() {
    if (!shadow) return;
    I.applyDom(shadow);
    els.emptyTitle.textContent = I.t('noNovel');
    els.emptyHint.textContent = I.t('noNovelHint');
    const importBtn = els.empty.querySelector('[data-act="import"]');
    if (importBtn) importBtn.textContent = I.t('importNovel');
    els.aiCopy.textContent = I.t('aiCopy');
    if (!aiBusy) els.aiRun.textContent = I.t('aiRun');
    if (!els.aiResult.textContent) {
      els.aiResult.classList.add('fo-placeholder');
    }
    updateChrome();
  }

  /* ------------------------------ 显示 / 隐藏 ------------------------------ */

  function syncVisibility() {
    if (!host) return;
    host.style.display = state.visible ? 'block' : 'none';
    els.panel.classList.toggle('fo-on', state.visible);
  }

  async function show() {
    if (!settings) return;
    if (state.visible && host.style.display === 'block') return;
    state.visible = true;
    syncVisibility();
    if (cssReady) await cssReady;
    applySettings();
    if (!novel) {
      els.empty.classList.add('fo-on');
      els.text.textContent = '';
      updateChrome();
      return;
    }
    els.empty.classList.remove('fo-on');
    els.panel.classList.remove('fo-enter');
    void els.panel.offsetWidth;
    els.panel.classList.add('fo-enter');
    render();
  }

  function hide() {
    if (!state.visible) return;
    state.visible = false;
    syncVisibility();
    persistProgress(true);
    if (els.aiPanel) els.aiPanel.classList.remove('fo-on');
    stopAi();
  }

  function toggle() {
    if (state.visible) hide();
    else show();
  }

  function showEmpty(on) {
    els.empty.classList.toggle('fo-on', !!on);
    if (on) els.text.textContent = '';
  }

  /* ------------------------------ 分页渲染 ------------------------------ */

  function estimateCharsPerPage() {
    const el = els.text;
    const cs = getComputedStyle(el);
    const fontSize = parseFloat(cs.fontSize) || 16;
    const lineHeight = parseFloat(cs.lineHeight) || fontSize * 1.8;
    const width = el.clientWidth;
    const height = el.clientHeight;
    if (width <= 0 || height <= 0) return 300;
    const charsPerLine = Math.max(8, Math.floor(width / fontSize));
    const lines = Math.max(1, Math.floor(height / lineHeight));
    return Math.max(40, charsPerLine * lines);
  }

  function measureHeight(text) {
    els.measure.textContent = text;
    return els.measure.scrollHeight;
  }

  function fitPage(start) {
    const text = novel.text;
    const remaining = text.length - start;
    if (remaining <= 0) return 0;

    const maxHeight = els.text.clientHeight - 2;
    if (maxHeight <= 0) return Math.min(remaining, 600);

    const cs = getComputedStyle(els.text);
    els.measure.style.width = els.text.clientWidth + 'px';
    els.measure.style.fontSize = cs.fontSize;
    els.measure.style.lineHeight = cs.lineHeight;
    els.measure.style.fontFamily = cs.fontFamily;
    els.measure.style.textAlign = cs.textAlign;

    const estimate = state.pageCharCount || estimateCharsPerPage();
    let lo = Math.max(1, Math.round(estimate * 0.4));
    let hi = Math.min(remaining, Math.round(estimate * 3));
    let best = Math.min(lo, remaining);

    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (measureHeight(text.slice(start, start + mid)) <= maxHeight) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    if (best < remaining) {
      const slice = text.slice(start, start + best);
      const breakAt = Math.max(slice.lastIndexOf('\n'), slice.lastIndexOf(' '));
      if (breakAt > best * 0.75) best = breakAt + 1;
    }

    // 兜底：确保整页（含换行调整）不会超出一行
    let guard = 0;
    while (best > 1 && measureHeight(text.slice(start, start + best)) > maxHeight && guard < 200) {
      best -= 1;
      guard += 1;
    }

    return Math.max(1, Math.min(best, remaining));
  }

  function skipLeadingSpace(text, pos) {
    let p = pos;
    while (p < text.length && (text[p] === '\n' || text[p] === ' ' || text[p] === '\t')) p += 1;
    return p;
  }

  function playFade() {
    if (!els.text.animate) return;
    try {
      els.text.animate(
        [
          { opacity: 0, transform: 'translateY(5px)' },
          { opacity: 1, transform: 'translateY(0)' }
        ],
        { duration: 150, easing: 'ease-out' }
      );
    } catch (err) {
      /* noop */
    }
  }

  function render(options) {
    if (!state.visible) {
      state.dirty = true;
      return;
    }
    if (!novel || !novel.text) {
      showEmpty(true);
      updateChrome();
      return;
    }
    showEmpty(false);

    const text = novel.text;
    if (state.charPos >= text.length) state.charPos = 0;
    state.charPos = skipLeadingSpace(text, state.charPos);

    const count = fitPage(state.charPos);
    state.pageCharCount = count;
    state.pageText = text.slice(state.charPos, state.charPos + count);
    els.text.textContent = state.pageText;

    if (options && options.animate) playFade();
    updateChrome();
    scheduleSave();
  }

  function updateChrome() {
    const total = novel && novel.text ? novel.text.length : 0;
    const pos = Math.min(state.charPos, total);
    const pct = total > 0 ? (pos / total) * 100 : 0;

    els.progressBar.style.width = pct.toFixed(2) + '%';
    els.titleName.textContent = novel ? novel.name : I.t('appName');
    els.titlePage.textContent = total > 0 ? pct.toFixed(1) + '%' : '';
    els.meta.textContent = novel
      ? numberText(pos) + ' / ' + numberText(total)
      : '';
    els.meta.setAttribute('title', I.t('pageHint'));
    els.body.setAttribute('title', I.t('pageHint'));
  }

  function nextPage() {
    if (!novel) {
      showToast(I.t('noNovel'));
      return;
    }
    const total = novel.text.length;
    if (state.charPos + state.pageCharCount >= total) {
      showToast(I.t('endOfNovel'));
      return;
    }
    state.history.push(state.charPos);
    if (state.history.length > 300) state.history.shift();
    state.charPos = state.charPos + state.pageCharCount;
    render({ animate: true });
  }

  function prevPage() {
    if (!novel) {
      showToast(I.t('noNovel'));
      return;
    }
    if (state.history.length) {
      state.charPos = state.history.pop();
    } else {
      state.charPos = Math.max(0, state.charPos - Math.max(1, state.pageCharCount));
    }
    render({ animate: true });
  }

  /* ------------------------------ 进度保存 ------------------------------ */

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      persistProgress(false);
    }, 500);
  }

  function persistProgress(immediate) {
    if (!novel) return;
    clearTimeout(saveTimer);
    const payload = {
      novelId: novel.id,
      charPos: state.charPos,
      total: novel.text.length
    };
    try {
      const result = S.saveProgress(payload);
      if (immediate && result && result.catch) result.catch(function () {});
    } catch (err) {
      /* noop */
    }
  }

  /* ------------------------------ 提示条 ------------------------------ */

  function showToast(message) {
    if (!message) return;
    els.toast.textContent = message;
    els.toast.classList.add('fo-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      els.toast.classList.remove('fo-on');
    }, 1900);
  }

  /* ------------------------------ 拖拽与缩放 ------------------------------ */

  function persistRect(left, top, width, height) {
    const patch = {};
    if (typeof left === 'number') patch['reader.left'] = Math.round(left);
    if (typeof top === 'number') patch['reader.top'] = Math.round(top);
    if (typeof width === 'number') patch['reader.width'] = Math.round(width);
    if (typeof height === 'number') patch['reader.height'] = Math.round(height);
    S.patchSettings(patch).catch(function () {});
  }

  function bindDrag() {
    let drag = null;

    els.head.addEventListener('pointerdown', function (event) {
      if (event.button !== 0) return;
      if (event.target.closest('[data-act]')) return;
      const rect = host.getBoundingClientRect();
      drag = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
      els.head.classList.add('fo-dragging');
      try {
        els.head.setPointerCapture(event.pointerId);
      } catch (err) {
        /* noop */
      }
      event.preventDefault();
    });

    els.head.addEventListener('pointermove', function (event) {
      if (!drag) return;
      const rect = host.getBoundingClientRect();
      const vp = viewport();
      const left = clamp(drag.left + event.clientX - drag.x, -(rect.width - 120), vp.width - 120);
      const top = clamp(drag.top + event.clientY - drag.y, 0, vp.height - 64);
      host.style.left = left + 'px';
      host.style.top = top + 'px';
    });

    function finish(event) {
      if (!drag) return;
      const rect = host.getBoundingClientRect();
      drag = null;
      els.head.classList.remove('fo-dragging');
      try {
        els.head.releasePointerCapture(event.pointerId);
      } catch (err) {
        /* noop */
      }
      persistRect(rect.left, rect.top);
    }

    els.head.addEventListener('pointerup', finish);
    els.head.addEventListener('pointercancel', finish);
  }

  function bindResize() {
    let resize = null;

    els.resize.addEventListener('pointerdown', function (event) {
      if (event.button !== 0) return;
      const rect = host.getBoundingClientRect();
      resize = { x: event.clientX, y: event.clientY, width: rect.width, height: rect.height };
      try {
        els.resize.setPointerCapture(event.pointerId);
      } catch (err) {
        /* noop */
      }
      event.preventDefault();
      event.stopPropagation();
    });

    els.resize.addEventListener('pointermove', function (event) {
      if (!resize) return;
      const vp = viewport();
      const rect = host.getBoundingClientRect();
      const width = clamp(resize.width + event.clientX - resize.x, MIN_WIDTH, vp.width - rect.left);
      const height = clamp(resize.height + event.clientY - resize.y, MIN_HEIGHT, vp.height - rect.top);
      host.style.width = width + 'px';
      host.style.height = height + 'px';
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (state.visible) render();
      }, 120);
    });

    function finish(event) {
      if (!resize) return;
      const rect = host.getBoundingClientRect();
      resize = null;
      try {
        els.resize.releasePointerCapture(event.pointerId);
      } catch (err) {
        /* noop */
      }
      persistRect(undefined, undefined, rect.width, rect.height);
      if (state.visible) render();
    }

    els.resize.addEventListener('pointerup', finish);
    els.resize.addEventListener('pointercancel', finish);
  }

  /* ------------------------------ 键盘 / 滚轮 ------------------------------ */

  function matchHotkey(event, combo) {
    if (!combo) return false;
    const parts = String(combo).split('+').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
    const key = parts.pop();
    if (!key) return false;
    const needCtrl = parts.indexOf('ctrl') >= 0;
    const needAlt = parts.indexOf('alt') >= 0;
    const needShift = parts.indexOf('shift') >= 0;
    const needMeta = parts.indexOf('meta') >= 0;
    if (!!event.ctrlKey !== needCtrl) return false;
    if (!!event.altKey !== needAlt) return false;
    if (!!event.shiftKey !== needShift) return false;
    if (!!event.metaKey !== needMeta) return false;

    const pressed = String(event.key || '').toLowerCase();
    if (pressed === key) return true;
    if (/^[a-z]$/.test(key) && event.code === 'Key' + key.toUpperCase()) return true;
    return false;
  }

  function onKeyDown(event) {
    if (event.isComposing) return;

    // 自定义快捷键无论阅读器是否显示都可用（否则隐藏后就无法唤回）
    const hotkey = settings && settings.hotkeys ? settings.hotkeys.toggle : '';
    if (matchHotkey(event, hotkey)) {
      event.preventDefault();
      event.stopPropagation();
      toggle();
      return;
    }

    if (!state.visible) return;

    const target = event.composedPath ? event.composedPath()[0] : event.target;
    if (isEditable(target)) {
      if (event.key === 'Escape' && els.aiPanel.classList.contains('fo-on')) {
        closeAiPanel();
      }
      return;
    }

    let handled = true;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight':
      case 'PageDown':
        nextPage();
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
      case 'PageUp':
        prevPage();
        break;
      case 'Escape':
        if (els.aiPanel.classList.contains('fo-on')) closeAiPanel();
        else handled = false;
        break;
      default:
        handled = false;
    }

    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function onWheel(event) {
    if (!state.visible) return;
    event.preventDefault();
    event.stopPropagation();
    const delta = Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    if (Math.abs(delta) < 1) return;
    const now = Date.now();
    if (now - lastWheelAt < 220) return;
    lastWheelAt = now;
    if (delta > 0) nextPage();
    else prevPage();
  }

  /* ------------------------------ AI 总结 ------------------------------ */

  function resetAiResult() {
    els.aiResult.textContent = '';
    els.aiResult.classList.add('fo-placeholder');
  }

  function setAiStatus(text, isError) {
    els.aiStatus.textContent = text || '';
    els.aiStatus.classList.toggle('fo-error', !!isError);
  }

  function openAiPanel() {
    if (!novel) {
      showToast(I.t('noNovel'));
      return;
    }
    els.aiPanel.classList.add('fo-on');
    if (!els.aiInput.value.trim()) {
      els.aiInput.value = state.pageText || '';
    }
    els.aiResult.scrollTop = 0;
    setAiStatus('');
    updateStaticText();
  }

  function closeAiPanel() {
    stopAi();
    els.aiPanel.classList.remove('fo-on');
  }

  function stopAi() {
    if (!aiBusy) return;
    try {
      if (aiPort) aiPort.postMessage({ type: 'stop' });
    } catch (err) {
      /* noop */
    }
    disconnectAi();
    aiBusy = false;
    els.aiRun.disabled = false;
    els.aiRun.textContent = I.t('aiRun');
    setAiStatus('');
  }

  function disconnectAi() {
    if (!aiPort) return;
    try {
      aiPort.disconnect();
    } catch (err) {
      /* noop */
    }
    aiPort = null;
  }

  function handleAiMessage(message) {
    if (!message || !message.type) return;
    if (message.type === 'delta') {
      if (els.aiResult.classList.contains('fo-placeholder')) {
        els.aiResult.classList.remove('fo-placeholder');
        els.aiResult.textContent = '';
      }
      els.aiResult.textContent += message.text || '';
      els.aiResult.scrollTop = els.aiResult.scrollHeight;
      return;
    }
    if (message.type === 'error') {
      finishAi();
      if (message.message === 'no-api-key') {
        setAiStatus(I.t('aiNoKey'), true);
      } else {
        setAiStatus(I.t('aiError', { msg: message.message || 'unknown' }), true);
      }
      return;
    }
    if (message.type === 'done' || message.type === 'aborted') {
      finishAi();
      if (message.type === 'aborted' && !els.aiResult.textContent) {
        els.aiResult.textContent = '';
        els.aiResult.classList.add('fo-placeholder');
      }
    }
  }

  function finishAi() {
    disconnectAi();
    aiBusy = false;
    els.aiRun.disabled = false;
    els.aiRun.textContent = I.t('aiRun');
    if (els.aiResult.textContent) els.aiResult.classList.remove('fo-placeholder');
    if (els.aiStatus.classList.contains('fo-error')) return;
    setAiStatus('');
  }

  function runAi() {
    if (aiBusy) {
      stopAi();
      return;
    }
    const text = els.aiInput.value.trim();
    if (!text) return;
    if (!settings.ai.apiKey) {
      setAiStatus(I.t('aiNoKey'), true);
      return;
    }

    resetAiResult();
    aiBusy = true;
    els.aiRun.disabled = false;
    els.aiRun.textContent = I.t('aiStop');
    setAiStatus(I.t('aiThinking'));

    aiPort = chrome.runtime.connect({ name: 'fishone-ai' });
    aiPort.onMessage.addListener(handleAiMessage);
    aiPort.onDisconnect.addListener(function () {
      const err = chrome.runtime.lastError;
      if (aiBusy) {
        aiBusy = false;
        els.aiRun.disabled = false;
        els.aiRun.textContent = I.t('aiRun');
        if (err) setAiStatus(I.t('aiError', { msg: err.message }), true);
      }
      aiPort = null;
    });

    try {
      aiPort.postMessage({ type: 'start', text: text, lang: I.lang });
    } catch (err) {
      finishAi();
      setAiStatus(I.t('aiError', { msg: err && err.message ? err.message : String(err) }), true);
    }
  }

  function copyAiResult() {
    const text = els.aiResult.textContent || '';
    if (!text) return;
    const done = function () {
      showToast(I.t('copied'));
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () {});
      }
    } catch (err) {
      /* noop */
    }
  }

  /* ------------------------------ 小说导入 ------------------------------ */

  async function importFile(file) {
    if (!file) return;
    if (!/\.txt$/i.test(file.name || '')) {
      showToast(I.t('unsupportedFile'));
      return;
    }
    try {
      const data = await N.readFile(file);
      const text = N.normalizeText(data.text);
      if (!text) {
        showToast(I.t('emptyFile'));
        return;
      }
      const next = N.createNovel(data.name, text);
      await S.saveProgress({ novelId: next.id, charPos: 0, total: next.text.length });
      await S.setNovel(next);
      showToast(I.t('imported'));
    } catch (err) {
      showToast(I.t('importFailed', { msg: err && err.message ? err.message : String(err) }));
    }
  }

  /* ------------------------------ 事件绑定 ------------------------------ */

  function bindPanelEvents() {
    shadow.addEventListener('click', function (event) {
      const btn = event.target && event.target.closest ? event.target.closest('[data-act]') : null;
      if (!btn) return;
      const act = btn.getAttribute('data-act');

      if (act === 'hide') hide();
      else if (act === 'options') {
        try {
          chrome.runtime.sendMessage({ type: 'FO_OPEN_OPTIONS' });
        } catch (err) {
          /* noop */
        }
      } else if (act === 'ai') openAiPanel();
      else if (act === 'ai-close') closeAiPanel();
      else if (act === 'ai-run') runAi();
      else if (act === 'ai-copy') copyAiResult();
      else if (act === 'prev') prevPage();
      else if (act === 'next') nextPage();
      else if (act === 'import') els.fileInput.click();
    });

    els.fileInput.addEventListener('change', function (event) {
      const file = event.target.files && event.target.files[0];
      importFile(file).finally(function () {
        event.target.value = '';
      });
    });

    els.body.addEventListener('wheel', onWheel, { passive: false });
    els.panel.addEventListener('contextmenu', function (event) {
      event.stopPropagation();
    });

    bindDrag();
    bindResize();
  }

  function bindGlobalEvents() {
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('resize', function () {
      applySettings();
      if (state.visible) render();
    });
    window.addEventListener('pagehide', function () {
      persistProgress(true);
    });
  }

  function bindStorage() {
    S.onChanged(function (change) {
      if (change.type === 'settings') {
        settings = change.settings;
        I.setLang(settings.language);
        updateStaticText();
        applySettings();
        if (state.visible) render();
        return;
      }
      if (change.type === 'novel') {
        novel = change.novel;
        state.charPos = 0;
        state.history = [];
        state.pageCharCount = 0;
        state.pageText = '';
        if (novel) {
          if (!state.visible) show();
          else render();
        } else {
          hide();
        }
      }
    });
  }

  function statusPayload() {
    return {
      ok: true,
      hasNovel: !!novel,
      visible: state.visible,
      name: novel ? novel.name : '',
      charPos: state.charPos,
      total: novel ? novel.text.length : 0,
      charCount: novel ? novel.text.length : 0
    };
  }

  function bindMessages() {
    chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
      if (!message || !message.type) return false;
      switch (message.type) {
        case 'FO_PING':
        case 'FO_STATUS':
          sendResponse(statusPayload());
          return false;
        case 'FO_TOGGLE':
          toggle();
          sendResponse(statusPayload());
          return false;
        case 'FO_SHOW':
          show();
          sendResponse(statusPayload());
          return false;
        case 'FO_HIDE':
          hide();
          sendResponse(statusPayload());
          return false;
        case 'FO_NEXT':
          nextPage();
          sendResponse(statusPayload());
          return false;
        case 'FO_PREV':
          prevPage();
          sendResponse(statusPayload());
          return false;
        default:
          return false;
      }
    });
  }

  /* ------------------------------ 启动 ------------------------------ */

  async function init() {
    try {
      settings = await S.getSettings();
      I.setLang(settings.language);
      novel = await S.getNovel();
      const progress = await S.getProgress();
      if (novel && progress && progress.novelId === novel.id && typeof progress.charPos === 'number') {
        state.charPos = clamp(progress.charPos, 0, Math.max(0, novel.text.length - 1));
        state.pageCharCount = 0;
      }

      buildUi();
      updateStaticText();
      applySettings();
      bindPanelEvents();
      bindGlobalEvents();
      bindStorage();
      bindMessages();

      if (cssReady) await cssReady;
      applySettings();
    } catch (err) {
      // 注入失败不应影响宿主页面
    }
  }

  init();
})();

