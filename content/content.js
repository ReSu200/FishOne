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
  const AI_BOOK_LIMIT = 8000;

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
  let aiRawText = '';
  let aiScopeChars = 0;
  let aiRunScope = 'page';
  let aiRunCharPos = 0;
  let aiStartedAt = 0;
  let aiPromptTimer = null;

  const state = {
    visible: false,
    charPos: 0,
    pageCharCount: 0,
    pageText: '',
    history: [],
    dirty: false,
    aiScope: 'page',
    aiSplit: 45
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
    const rgb = toRgb(color);
    const a = clamp(typeof alpha === 'number' ? alpha : 1, 0, 1);
    return 'rgba(' + rgb.r + ', ' + rgb.g + ', ' + rgb.b + ', ' + a + ')';
  }

  function toRgb(color) {
    let hex = String(color || '#000000').trim().replace('#', '');
    if (hex.length === 3) {
      hex = hex.split('').map(function (c) { return c + c; }).join('');
    }
    if (!/^[0-9a-f]{6}$/i.test(hex)) hex = '000000';
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16)
    };
  }

  function isLightColor(color) {
    const rgb = toRgb(color);
    const lum = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
    return lum > 0.55;
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
      '  <div class="fo-split"></div>',
      '  <div class="fo-empty">',
      '    <div class="fo-empty-icon">' + ICON.book + '</div>',
      '    <div class="fo-empty-title" data-i18n="noNovel"></div>',
      '    <div class="fo-empty-hint" data-i18n="noNovelHint"></div>',
      '    <button class="fo-btn" data-act="import" data-i18n="importNovel"></button>',
      '  </div>',
      '  <div class="fo-ai">',
      '    <div class="fo-ai-head">',
      '      <div class="fo-ai-tabs">',
      '        <button class="fo-ai-tab fo-on" data-act="ai-tab" data-tab="summary" data-i18n="aiTabSummary"></button>',
      '        <button class="fo-ai-tab" data-act="ai-tab" data-tab="history" data-i18n="aiTabHistory"></button>',
      '      </div>',
      '      <button class="fo-btn" data-act="ai-close" data-i18n-title="close">' + ICON.close + '</button>',
      '    </div>',
      '    <div class="fo-ai-view fo-ai-view-summary" data-view="summary">',
      '      <div class="fo-ai-scope">',
      '        <span class="fo-ai-scope-label" data-i18n="aiScopeLabel"></span>',
      '        <div class="fo-ai-seg">',
      '          <button data-act="ai-scope" data-scope="page" data-i18n="aiScopePage"></button>',
      '          <button data-act="ai-scope" data-scope="recent" data-i18n="aiScopeRecent"></button>',
      '          <button data-act="ai-scope" data-scope="book" data-i18n="aiScopeBook" data-i18n-title="aiScopeBookHint"></button>',
      '        </div>',
      '      </div>',
      '      <div class="fo-ai-estimate"></div>',
      '      <div class="fo-ai-label">',
      '        <span data-i18n="aiResultLabel"></span>',
      '        <button class="fo-btn" data-act="ai-copy" data-i18n="aiCopy"></button>',
      '      </div>',
      '      <div class="fo-ai-result"></div>',
      '      <div class="fo-ai-meta"></div>',
      '      <div class="fo-ai-actions">',
      '        <button class="fo-btn fo-primary" data-act="ai-run"></button>',
      '        <span class="fo-ai-status"></span>',
      '      </div>',
      '      <details class="fo-ai-adv">',
      '        <summary data-i18n="aiAdvanced"></summary>',
      '        <textarea class="fo-ai-system" data-i18n-placeholder="systemPromptPlaceholder"></textarea>',
      '        <div class="fo-ai-adv-hint" data-i18n="aiAdvancedHint"></div>',
      '      </details>',
      '    </div>',
      '    <div class="fo-ai-view fo-ai-view-history" data-view="history">',
      '      <div class="fo-ai-hist-head">',
      '        <span data-i18n="aiHistoryTitle"></span>',
      '        <button class="fo-btn" data-act="ai-hist-clear" data-i18n="aiHistoryClear"></button>',
      '      </div>',
      '      <div class="fo-ai-hist"></div>',
      '    </div>',
      '  </div>',
      '</div>',
      '<div class="fo-foot">',
      '  <div class="fo-mode" role="group">',
      '    <button class="fo-mode-btn" data-act="mode" data-mode="page"></button>',
      '    <button class="fo-mode-btn" data-act="mode" data-mode="scroll"></button>',
      '  </div>',
      '  <div class="fo-foot-nav">',
      '    <button class="fo-btn" data-act="prev" data-i18n="prevPage"></button>',
      '    <div class="fo-meta"></div>',
      '    <button class="fo-btn" data-act="next" data-i18n="nextPage"></button>',
      '  </div>',
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
    els.split = panel.querySelector('.fo-split');
    els.empty = panel.querySelector('.fo-empty');
    els.emptyTitle = panel.querySelector('.fo-empty-title');
    els.emptyHint = panel.querySelector('.fo-empty-hint');
    els.meta = panel.querySelector('.fo-meta');
    els.modeBtns = Array.prototype.slice.call(panel.querySelectorAll('.fo-mode-btn'));
    els.footNav = panel.querySelector('.fo-foot-nav');
    els.resize = panel.querySelector('.fo-resize');
    els.toast = panel.querySelector('.fo-toast');
    els.fileInput = panel.querySelector('.fo-file');
    els.aiPanel = panel.querySelector('.fo-ai');
    els.aiTabs = panel.querySelector('.fo-ai-tabs');
    els.aiSummaryView = panel.querySelector('.fo-ai-view-summary');
    els.aiHistoryView = panel.querySelector('.fo-ai-view-history');
    els.aiSeg = panel.querySelector('.fo-ai-seg');
    els.aiEstimate = panel.querySelector('.fo-ai-estimate');
    els.aiResult = panel.querySelector('.fo-ai-result');
    els.aiMeta = panel.querySelector('.fo-ai-meta');
    els.aiStatus = panel.querySelector('.fo-ai-status');
    els.aiRun = panel.querySelector('[data-act="ai-run"]');
    els.aiCopy = panel.querySelector('[data-act="ai-copy"]');
    els.aiSystem = panel.querySelector('.fo-ai-system');
    els.aiHist = panel.querySelector('.fo-ai-hist');

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
    const split = clamp(Number(r.aiSplit) || 45, 30, 65);
    state.aiSplit = split;

    host.style.width = width + 'px';
    host.style.height = height + 'px';
    host.style.left = left + 'px';
    host.style.top = top + 'px';
    host.style.display = state.visible ? 'block' : 'none';
    host.style.setProperty('--fo-ai-split', split + '%');

    host.style.setProperty('--fo-bg', colorWithAlpha(r.bgColor, r.bgOpacity));
    host.style.setProperty('--fo-blur', (Number(r.blur) || 0) + 'px');
    host.style.setProperty('--fo-radius', (Number(r.radius) || 0) + 'px');
    host.style.setProperty('--fo-text', r.textColor || '#e9edf1');
    host.style.setProperty('--fo-font-size', (Number(r.fontSize) || 16) + 'px');
    host.style.setProperty('--fo-line-height', String(Number(r.lineHeight) || 1.8));
    host.style.setProperty('--fo-border-width', r.border === false ? '0px' : '1px');

    // AI 面板固定用与阅读器明暗相反的实色配色，避免自定义半透明背景导致对比度不足
    const aiLight = isLightColor(r.bgColor);
    host.style.setProperty('--fo-ai-bg', aiLight ? '#ffffff' : '#0e1117');
    host.style.setProperty('--fo-ai-fg', aiLight ? '#1b2027' : '#e9edf1');
    host.style.setProperty('--fo-ai-line', aiLight ? 'rgba(15, 23, 42, 0.16)' : 'rgba(255, 255, 255, 0.14)');
    host.style.setProperty('--fo-ai-soft', aiLight ? 'rgba(15, 23, 42, 0.05)' : 'rgba(255, 255, 255, 0.06)');
    host.style.setProperty('--fo-ai-muted', aiLight ? 'rgba(15, 23, 42, 0.6)' : 'rgba(233, 237, 241, 0.62)');

    // 提示条跟随主题明暗取反色，保证在浅色/深色阅读器上都清晰可读
    host.style.setProperty('--fo-toast-bg', aiLight ? 'rgba(255, 255, 255, 0.97)' : 'rgba(24, 29, 37, 0.96)');
    host.style.setProperty('--fo-toast-fg', aiLight ? '#1b2027' : '#e9edf1');
    host.style.setProperty('--fo-toast-line', aiLight ? 'rgba(15, 23, 42, 0.14)' : 'rgba(255, 255, 255, 0.16)');

    els.head.querySelector('[data-act="hide"]').setAttribute('title', I.t('hideReader'));
    els.head.querySelector('[data-act="options"]').setAttribute('title', I.t('settings'));
    els.head.querySelector('[data-act="ai"]').setAttribute('title', I.t('ai'));
    els.fileInput.setAttribute('accept', '.txt,text/plain');
    updateAiLayout();
    applyModeChrome();
  }

  function isScrollMode() {
    return !!(settings && settings.reader && settings.reader.mode === 'scroll');
  }

  /**
   * 同步底栏的模式按钮、翻页按钮显隐与相关文案
   */
  function applyModeChrome() {
    if (!els.panel) return;
    const scroll = isScrollMode();
    els.panel.classList.toggle('fo-mode-scroll', scroll);
    els.text.classList.toggle('fo-scroll', scroll);
    if (els.modeBtns) {
      els.modeBtns.forEach(function (btn) {
        const mode = btn.getAttribute('data-mode');
        btn.classList.toggle('fo-on', (mode === 'scroll') === scroll);
        btn.textContent = I.t(mode === 'scroll' ? 'modeScroll' : 'modePage');
        btn.setAttribute('title', I.t(mode === 'scroll' ? 'modeScrollHint' : 'modePageHint'));
      });
    }
    const pageScope = els.aiSeg ? els.aiSeg.querySelector('[data-scope="page"]') : null;
    if (pageScope) pageScope.textContent = I.t(scroll ? 'aiScopeScreen' : 'aiScopePage');
  }

  function setMode(mode) {
    if (!settings || !settings.reader) return;
    const next = mode === 'scroll' ? 'scroll' : 'page';
    if (settings.reader.mode === next) return;
    settings.reader.mode = next;
    applyModeChrome();
    if (state.visible) render();
    S.patchSettings({ 'reader.mode': next }).catch(function () {
      /* noop */
    });
  }

  function updateStaticText() {
    if (!shadow) return;
    I.applyDom(shadow);
    els.emptyTitle.textContent = I.t('noNovel');
    els.emptyHint.textContent = I.t('noNovelHint');
    const importBtn = els.empty.querySelector('[data-act="import"]');
    if (importBtn) importBtn.textContent = I.t('importNovel');
    els.aiCopy.textContent = I.t('aiCopy');
    if (!aiBusy) els.aiRun.textContent = I.t(aiRawText ? 'aiRerun' : 'aiRun');
    els.aiResult.classList.toggle('fo-placeholder', !aiRawText);
    els.aiResult.setAttribute('data-ph', I.t('aiResultEmpty'));
    updateAiEstimate();
    if (els.aiHistoryView && els.aiHistoryView.classList.contains('fo-on')) renderAiHistory();
    applyModeChrome();
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
    clearTimeout(pageIndex.timer);
    pageIndex.timer = null;
    syncVisibility();
    persistProgress(true);
    if (els.aiPanel) els.aiPanel.classList.remove('fo-on');
    updateAiLayout();
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

  function measurePage(start, estimate) {
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

    const unit = estimate || estimateCharsPerPage();
    let lo = Math.max(1, Math.round(unit * 0.4));
    let hi = Math.min(remaining, Math.round(unit * 3));
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

  function fitPage(start) {
    return measurePage(start, state.pageCharCount);
  }

  function skipLeadingSpace(text, pos) {
    let p = pos;
    while (p < text.length && (text[p] === '\n' || text[p] === ' ' || text[p] === '\t')) p += 1;
    return p;
  }

  /* ------------------------------ 页码索引 ------------------------------ */

  // 全书页码要按当前排版逐页量一遍，耗时随字数增长；
  // 这里分片推进（每片约 12ms），未算完时先用平均值估算，算完后自动校正
  const pageIndex = {
    sig: '',
    starts: [0],
    done: true,
    timer: null
  };

  function layoutSignature() {
    const cs = getComputedStyle(els.text);
    return [
      novel ? novel.id + ':' + novel.text.length : '',
      els.text.clientWidth,
      els.text.clientHeight,
      cs.fontSize,
      cs.lineHeight,
      cs.fontFamily,
      cs.textAlign
    ].join('|');
  }

  function resetPageIndex() {
    clearTimeout(pageIndex.timer);
    pageIndex.timer = null;
    pageIndex.sig = layoutSignature();
    pageIndex.starts = [0];
    pageIndex.done = !novel || !novel.text;
    if (!pageIndex.done) buildPageIndex();
  }

  function buildPageIndex() {
    if (!state.visible || !novel || !novel.text || isScrollMode()) {
      pageIndex.timer = null;
      return;
    }
    const text = novel.text;
    const started = performance.now();
    let estimate = state.pageCharCount || estimateCharsPerPage();

    while (performance.now() - started < 12) {
      const start = pageIndex.starts[pageIndex.starts.length - 1];
      const count = measurePage(start, estimate);
      const next = start + count;
      if (next >= text.length) {
        pageIndex.done = true;
        break;
      }
      pageIndex.starts.push(next);
      estimate = count;
    }

    if (pageIndex.done) {
      pageIndex.timer = null;
      updateChrome();
      return;
    }
    pageIndex.timer = setTimeout(buildPageIndex, 0);
  }

  function ensurePageIndex() {
    if (!novel || !novel.text) {
      pageIndex.done = true;
      return;
    }
    if (pageIndex.sig !== layoutSignature()) {
      resetPageIndex();
      return;
    }
    if (!pageIndex.done && !pageIndex.timer) buildPageIndex();
  }

  function knownPageNumber(pos) {
    const starts = pageIndex.starts;
    let lo = 0;
    let hi = starts.length - 1;
    let idx = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (starts[mid] <= pos) {
        idx = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return idx + 1;
  }

  function pageStats() {
    const total = novel && novel.text ? novel.text.length : 0;
    const starts = pageIndex.starts;
    const lastStart = starts[starts.length - 1];
    if (pageIndex.done) {
      return { page: knownPageNumber(state.charPos), total: starts.length, exact: true };
    }
    const completed = starts.length - 1;
    const avg = completed > 0
      ? lastStart / completed
      : (state.pageCharCount || estimateCharsPerPage());
    const estimateTotal = Math.max(starts.length, Math.ceil(total / Math.max(1, avg)));
    if (state.charPos <= lastStart) {
      return { page: knownPageNumber(state.charPos), total: estimateTotal, exact: false };
    }
    return {
      page: completed + 1 + Math.floor((state.charPos - lastStart) / Math.max(1, avg)),
      total: estimateTotal,
      exact: false
    };
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

  /* ------------------------------ 滚动模式 ------------------------------ */

  // 每块约为两屏文字量，只保留可视区前后少量块，长书也不会撑爆 DOM
  const SCROLL_BLOCK_FACTOR = 2;
  const SCROLL_MAX_BLOCKS = 6;

  const scrollState = {
    blocks: [],
    unit: 0,
    raf: 0
  };

  function scrollUnit() {
    if (!scrollState.unit) scrollState.unit = Math.max(1, state.pageCharCount || estimateCharsPerPage());
    return scrollState.unit;
  }

  function createBlock(start) {
    const text = novel.text;
    const size = Math.max(1, Math.min(text.length - start, scrollUnit() * SCROLL_BLOCK_FACTOR));
    const end = Math.min(text.length, start + size);
    const el = document.createElement('div');
    el.className = 'fo-block';
    el.setAttribute('data-start', String(start));
    el.setAttribute('data-end', String(end));
    el.textContent = text.slice(start, end);
    return { start: start, end: end, el: el };
  }

  function appendBlock() {
    const last = scrollState.blocks[scrollState.blocks.length - 1];
    if (!last || last.end >= novel.text.length) return false;
    const block = createBlock(last.end);
    els.text.appendChild(block.el);
    scrollState.blocks.push(block);
    return true;
  }

  function prependBlock() {
    const first = scrollState.blocks[0];
    if (!first || first.start <= 0) return false;
    const size = Math.min(first.start, scrollUnit() * SCROLL_BLOCK_FACTOR);
    const block = createBlock(first.start - size);
    const before = els.text.scrollHeight;
    els.text.insertBefore(block.el, first.el);
    scrollState.blocks.unshift(block);
    // 前插后补偿滚动位置，避免视觉跳动
    els.text.scrollTop += els.text.scrollHeight - before;
    return true;
  }

  function scrollRect() {
    return els.text.getBoundingClientRect();
  }

  // 接近上下边界时补块，滚远的块及时丢弃
  function ensureScrollEdges() {
    const rect = scrollRect();
    let guard = 0;
    while (guard < 8) {
      const last = scrollState.blocks[scrollState.blocks.length - 1];
      if (!last || last.end >= novel.text.length) break;
      if (last.el.getBoundingClientRect().bottom > rect.bottom + rect.height * 0.8) break;
      if (!appendBlock()) break;
      guard += 1;
    }

    guard = 0;
    while (guard < 8) {
      const first = scrollState.blocks[0];
      if (!first || first.start <= 0) break;
      // 只有首块顶部离开视口上方不远时，才需要向上补内容
      if (first.el.getBoundingClientRect().top <= rect.top - rect.height * 0.6) break;
      if (!prependBlock()) break;
      guard += 1;
    }

    while (scrollState.blocks.length > SCROLL_MAX_BLOCKS) {
      const first = scrollState.blocks[0];
      const last = scrollState.blocks[scrollState.blocks.length - 1];
      const firstRect = first.el.getBoundingClientRect();
      const lastRect = last.el.getBoundingClientRect();
      if (firstRect.bottom < rect.top - rect.height * 0.5 && scrollState.blocks.length > 2) {
        const before = els.text.scrollHeight;
        els.text.removeChild(first.el);
        scrollState.blocks.shift();
        els.text.scrollTop = Math.max(0, els.text.scrollTop - (before - els.text.scrollHeight));
      } else if (lastRect.top > rect.bottom + rect.height * 0.5) {
        els.text.removeChild(last.el);
        scrollState.blocks.pop();
      } else {
        break;
      }
    }
  }

  /**
   * 按块内文字比例换算当前屏幕对应的字符区间
   */
  function visibleRange() {
    const rect = scrollRect();
    let start = null;
    let end = null;
    scrollState.blocks.forEach(function (block) {
      const r = block.el.getBoundingClientRect();
      if (r.bottom <= rect.top + 1 || r.top >= rect.bottom - 1) return;
      const len = block.end - block.start;
      const overhead = Math.max(0, rect.top - r.top);
      const below = Math.max(0, r.bottom - rect.bottom);
      const s = block.start + (r.height > 0 ? Math.floor(len * overhead / r.height) : 0);
      const e = block.end - (r.height > 0 ? Math.floor(len * below / r.height) : 0);
      if (start === null) start = s;
      end = Math.max(e, s + 1);
    });

    if (start === null) {
      const first = scrollState.blocks[0];
      const last = scrollState.blocks[scrollState.blocks.length - 1];
      start = first ? first.start : 0;
      end = last ? last.end : 0;
    }

    const total = novel.text.length;
    start = clamp(start, 0, Math.max(0, total - 1));
    end = clamp(Math.max(end, start + 1), start + 1, total);
    return { start: start, end: end };
  }

  function syncScrollPosition() {
    if (!novel || !novel.text) return;
    const range = visibleRange();
    state.charPos = range.start;
    state.pageText = novel.text.slice(range.start, range.end);
    state.pageCharCount = Math.max(1, range.end - range.start);
  }

  function renderScroll() {
    clearTimeout(pageIndex.timer);
    pageIndex.timer = null;
    const text = novel.text;
    els.text.textContent = '';
    scrollState.blocks = [];
    scrollState.unit = 0;
    const first = createBlock(state.charPos);
    els.text.appendChild(first.el);
    scrollState.blocks.push(first);
    els.text.scrollTop = 0;
    ensureScrollEdges();
    syncScrollPosition();
  }

  function onTextScroll() {
    if (!state.visible || !isScrollMode()) return;
    if (scrollState.raf) return;
    scrollState.raf = requestAnimationFrame(function () {
      scrollState.raf = 0;
      if (!state.visible || !isScrollMode()) return;
      ensureScrollEdges();
      syncScrollPosition();
      updateChrome();
      if (els.aiPanel && els.aiPanel.classList.contains('fo-on')) updateAiEstimate();
      scheduleSave();
    });
  }

  function scrollByStep(direction, big) {
    const cs = getComputedStyle(els.text);
    const step = big
      ? Math.max(80, els.text.clientHeight * 0.9)
      : Math.max(24, (parseFloat(cs.lineHeight) || 28) * 3);
    const top = els.text.scrollTop + direction * step;
    if (els.text.scrollTo) els.text.scrollTo({ top: top, behavior: 'smooth' });
    else els.text.scrollTop = top;
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

    applyModeChrome();

    const text = novel.text;
    if (state.charPos >= text.length) state.charPos = 0;
    state.charPos = skipLeadingSpace(text, state.charPos);

    if (isScrollMode()) {
      renderScroll();
      if (options && options.animate) playFade();
      updateChrome();
      if (els.aiPanel && els.aiPanel.classList.contains('fo-on')) updateAiEstimate();
      scheduleSave();
      return;
    }

    const count = fitPage(state.charPos);
    state.pageCharCount = count;
    state.pageText = text.slice(state.charPos, state.charPos + count);
    els.text.textContent = state.pageText;

    if (options && options.animate) playFade();
    ensurePageIndex();
    updateChrome();
    if (els.aiPanel && els.aiPanel.classList.contains('fo-on')) updateAiEstimate();
    scheduleSave();
  }

  function updateChrome() {
    const total = novel && novel.text ? novel.text.length : 0;
    const pos = Math.min(state.charPos, total);
    const pct = total > 0 ? (pos / total) * 100 : 0;

    els.progressBar.style.width = pct.toFixed(2) + '%';
    els.titleName.textContent = novel ? novel.name : I.t('appName');
    els.titlePage.textContent = total > 0 ? pct.toFixed(1) + '%' : '';
    if (novel && isScrollMode()) {
      els.meta.textContent = I.t('wordsMeta', {
        pos: numberText(pos),
        total: numberText(total)
      });
    } else if (novel) {
      const stats = pageStats();
      els.meta.textContent = I.t('pageMeta', {
        page: numberText(stats.page),
        total: numberText(stats.total)
      });
    } else {
      els.meta.textContent = '';
    }
    els.meta.setAttribute('title', I.t('pageHint'));
    els.body.setAttribute('title', I.t('pageHint'));
  }

  function nextPage() {
    if (!novel) {
      showToast(I.t('noNovel'));
      return;
    }
    if (isScrollMode()) {
      scrollByStep(1, true);
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
    if (isScrollMode()) {
      scrollByStep(-1, true);
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
      updateAiLayout();
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        updateAiLayout();
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
      updateAiLayout();
      if (state.visible) render();
    }

    els.resize.addEventListener('pointerup', finish);
    els.resize.addEventListener('pointercancel', finish);
  }

  /**
   * AI 面板宽度拖动（30%~65%），松手后写入 settings.reader.aiSplit
   */
  function bindSplit() {
    let drag = null;

    els.split.addEventListener('pointerdown', function (event) {
      if (event.button !== 0) return;
      const rect = els.body.getBoundingClientRect();
      drag = {
        x: event.clientX,
        width: rect.width,
        pct: clamp(Number(state.aiSplit) || 45, 30, 65)
      };
      els.split.classList.add('fo-dragging');
      try {
        els.split.setPointerCapture(event.pointerId);
      } catch (err) {
        /* noop */
      }
      event.preventDefault();
      event.stopPropagation();
    });

    els.split.addEventListener('pointermove', function (event) {
      if (!drag || !drag.width) return;
      const pct = clamp(drag.pct - ((event.clientX - drag.x) / drag.width) * 100, 30, 65);
      state.aiSplit = pct;
      host.style.setProperty('--fo-ai-split', pct.toFixed(1) + '%');
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (state.visible) render();
      }, 100);
    });

    function finish(event) {
      if (!drag) return;
      drag = null;
      els.split.classList.remove('fo-dragging');
      try {
        els.split.releasePointerCapture(event.pointerId);
      } catch (err) {
        /* noop */
      }
      const pct = Math.round(clamp(state.aiSplit || 45, 30, 65));
      S.patchSettings({ 'reader.aiSplit': pct }).catch(function () {
        /* noop */
      });
      if (state.visible) render();
    }

    els.split.addEventListener('pointerup', finish);
    els.split.addEventListener('pointercancel', finish);
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
    const path = event.composedPath ? event.composedPath() : [];
    if (isScrollMode()) {
      // 滚动模式：正文自身滚动，其余区域一律吞掉滚轮，避免带动背后的网页
      let inText = false;
      let inAi = false;
      for (let i = 0; i < path.length; i += 1) {
        if (path[i] === els.aiPanel) inAi = true;
        if (path[i] === els.text) inText = true;
      }
      if (inAi) return;
      if (inText) {
        const el = els.text;
        const atTop = el.scrollTop <= 0;
        const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
        if ((event.deltaY < 0 && !atTop) || (event.deltaY > 0 && !atBottom)) return;
      }
      event.preventDefault();
      return;
    }
    // AI 面板内滚动查看结果时不应触发翻页
    for (let i = 0; i < path.length; i += 1) {
      if (path[i] === els.aiPanel) return;
    }
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

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function inlineMarkup(text) {
    return escapeHtml(text).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  }

  /**
   * 轻量 Markdown 渲染：标题 / 有序无序列表 / 加粗 / 分段
   * 只接受纯文本输入，先转义再拼接标签，避免结果里的 HTML 被直接执行
   */
  function renderMarkdown(text) {
    const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
    const out = [];
    let list = null;
    let para = [];

    function flushPara() {
      if (!para.length) return;
      out.push('<p>' + inlineMarkup(para.join(' ')) + '</p>');
      para = [];
    }

    function flushList() {
      if (!list) return;
      out.push('<' + list.type + '>' + list.items.map(function (item) {
        return '<li>' + inlineMarkup(item) + '</li>';
      }).join('') + '</' + list.type + '>');
      list = null;
    }

    lines.forEach(function (raw) {
      const line = raw.trim();
      if (!line) {
        flushPara();
        flushList();
        return;
      }
      let match = line.match(/^(#{1,4})\s+(.*)$/);
      if (match) {
        flushPara();
        flushList();
        const tag = match[1].length <= 2 ? 'h3' : 'h4';
        out.push('<' + tag + '>' + inlineMarkup(match[2]) + '</' + tag + '>');
        return;
      }
      match = line.match(/^[-*·•]\s+(.*)$/);
      if (match) {
        flushPara();
        if (!list || list.type !== 'ul') {
          flushList();
          list = { type: 'ul', items: [] };
        }
        list.items.push(match[1]);
        return;
      }
      match = line.match(/^\d+[.、)]\s*(.*)$/);
      if (match) {
        flushPara();
        if (!list || list.type !== 'ol') {
          flushList();
          list = { type: 'ol', items: [] };
        }
        list.items.push(match[1]);
        return;
      }
      flushList();
      para.push(line);
    });

    flushPara();
    flushList();
    return out.join('');
  }

  function setAiStatus(text, isError) {
    els.aiStatus.textContent = text || '';
    els.aiStatus.classList.toggle('fo-error', !!isError);
  }

  function resetAiResult() {
    aiRawText = '';
    els.aiResult.innerHTML = '';
    els.aiResult.classList.add('fo-placeholder');
    els.aiMeta.textContent = '';
    els.aiResult.scrollTop = 0;
  }

  function estimateTokensByChars(chars) {
    return Math.ceil(Number(chars || 0) / 1.5);
  }

  function scopeLabel(scope) {
    if (scope === 'recent') return I.t('aiScopeRecent');
    if (scope === 'book') return I.t('aiScopeBook');
    return I.t(isScrollMode() ? 'aiScopeScreen' : 'aiScopePage');
  }

  /**
   * 按范围取待总结文本：本页、最近三页（近似）、整本前 8,000 字
   */
  function aiScopeText(scope) {
    if (!novel || !novel.text) return '';
    const text = novel.text;
    if (scope === 'book') return text.slice(0, AI_BOOK_LIMIT);
    const span = Math.max(1, state.pageCharCount || 600);
    if (scope === 'recent') {
      const start = Math.max(0, state.charPos - span * 2);
      const end = Math.min(text.length, state.charPos + span);
      return text.slice(start, Math.max(end, start + 1));
    }
    return state.pageText || text.slice(state.charPos, state.charPos + span);
  }

  function updateAiEstimate() {
    if (!els.aiEstimate) return;
    const text = aiScopeText(state.aiScope);
    els.aiEstimate.textContent = I.t('aiEstimate', {
      chars: numberText(text.length),
      tokens: numberText(estimateTokensByChars(text.length))
    });
  }

  function setAiScope(scope) {
    state.aiScope = scope === 'recent' || scope === 'book' ? scope : 'page';
    if (els.aiSeg) {
      els.aiSeg.querySelectorAll('[data-scope]').forEach(function (btn) {
        btn.classList.toggle('fo-on', btn.getAttribute('data-scope') === state.aiScope);
      });
    }
    updateAiEstimate();
  }

  /**
   * 根据阅读器宽度决定 AI 面板是右侧分栏还是覆盖模式
   */
  function updateAiLayout() {
    if (!host || !els.body) return;
    const width = host.clientWidth || (settings ? Number(settings.reader.width) || 0 : 0);
    const overlay = width > 0 && width < 560;
    els.body.classList.toggle('fo-ai-overlay', overlay);
    els.body.classList.toggle('fo-ai-on', els.aiPanel.classList.contains('fo-on'));
  }

  // 布局变化（分栏开关、拖动分隔条）后需要重新分页，charPos 保持不变
  function refitSoon() {
    if (!state.visible) return Promise.resolve();
    return nextFrame().then(function () {
      if (state.visible) render();
    });
  }

  function openAiPanel() {
    if (!novel) {
      showToast(I.t('noNovel'));
      return;
    }
    if (els.aiPanel.classList.contains('fo-on')) return;
    els.aiPanel.classList.add('fo-on');
    updateAiLayout();
    els.aiSystem.value = (settings.ai && settings.ai.systemPrompt) || '';
    setAiScope(state.aiScope);
    switchAiTab('summary');
    els.aiResult.scrollTop = 0;
    setAiStatus('');
    // 按分栏后的宽度重新分页，让「本页」估算与屏幕上看到的一致；
    // 是否开始总结交给用户点击按钮确认
    refitSoon();
  }

  function closeAiPanel() {
    stopAi();
    els.aiPanel.classList.remove('fo-on');
    updateAiLayout();
    refitSoon();
  }

  function switchAiTab(tab) {
    const history = tab === 'history';
    if (els.aiTabs) {
      els.aiTabs.querySelectorAll('[data-tab]').forEach(function (btn) {
        btn.classList.toggle('fo-on', btn.getAttribute('data-tab') === tab);
      });
    }
    els.aiSummaryView.classList.toggle('fo-on', !history);
    els.aiHistoryView.classList.toggle('fo-on', history);
    if (history) renderAiHistory();
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
    els.aiRun.textContent = I.t(aiRawText ? 'aiRerun' : 'aiRun');
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
      aiRawText += message.text || '';
      els.aiResult.classList.remove('fo-placeholder');
      els.aiResult.innerHTML = renderMarkdown(aiRawText);
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
    if (message.type === 'done') {
      finishAi();
      if (message.text && !aiRawText) aiRawText = message.text;
      els.aiResult.innerHTML = renderMarkdown(aiRawText);
      updateAiMeta(message.usage);
      saveAiHistory(message.usage);
      return;
    }
    if (message.type === 'aborted') {
      finishAi();
      if (!aiRawText) resetAiResult();
    }
  }

  function finishAi() {
    disconnectAi();
    aiBusy = false;
    els.aiRun.disabled = false;
    els.aiRun.textContent = I.t(aiRawText ? 'aiRerun' : 'aiRun');
    els.aiResult.classList.toggle('fo-placeholder', !aiRawText);
    if (els.aiStatus.classList.contains('fo-error')) return;
    setAiStatus('');
  }

  function updateAiMeta(usage) {
    if (!aiRawText) return;
    const approx = usage && !usage.estimated ? '' : '~';
    const tokens = usage && usage.total
      ? usage.total
      : estimateTokensByChars(aiScopeChars) + estimateTokensByChars(aiRawText.length);
    const sec = aiStartedAt ? ((Date.now() - aiStartedAt) / 1000).toFixed(1) : '0.0';
    els.aiMeta.textContent = I.t('aiMetaLine', {
      scope: scopeLabel(aiRunScope),
      chars: numberText(aiScopeChars),
      sec: sec,
      tokens: approx + numberText(tokens)
    });
  }

  function saveAiHistory(usage) {
    if (!aiRawText || !novel) return;
    const tokens = usage && usage.total
      ? usage.total
      : estimateTokensByChars(aiScopeChars) + estimateTokensByChars(aiRawText.length);
    S.addAiHistory({
      scope: aiRunScope,
      chars: aiScopeChars,
      charPos: aiRunCharPos,
      novelId: novel.id,
      tokens: tokens,
      text: aiRawText
    }).then(function () {
      if (els.aiHistoryView.classList.contains('fo-on')) renderAiHistory();
    }).catch(function () {
      /* noop */
    });
  }

  function startAi() {
    if (aiBusy) return;
    if (!settings.ai || !settings.ai.apiKey) {
      setAiStatus(I.t('aiNoKey'), true);
      return;
    }
    const text = aiScopeText(state.aiScope).trim();
    if (!text) {
      setAiStatus(I.t('aiNeedText'), true);
      return;
    }

    resetAiResult();
    aiBusy = true;
    aiScopeChars = text.length;
    aiRunScope = state.aiScope;
    aiRunCharPos = state.charPos;
    aiStartedAt = Date.now();
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
        els.aiRun.textContent = I.t(aiRawText ? 'aiRerun' : 'aiRun');
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
    const text = aiRawText || els.aiResult.textContent || '';
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

  async function renderAiHistory() {
    if (!els.aiHist) return;
    const list = await S.getAiHistory();
    els.aiHist.textContent = '';
    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'fo-ai-hist-empty';
      empty.textContent = I.t('aiHistoryEmpty');
      els.aiHist.appendChild(empty);
      return;
    }

    list.forEach(function (item) {
      const card = document.createElement('div');
      card.className = 'fo-ai-hist-item';

      const meta = document.createElement('div');
      meta.className = 'fo-ai-hist-meta';
      const time = document.createElement('span');
      time.textContent = new Date(item.at || Date.now()).toLocaleString(I.lang === 'en' ? 'en-US' : 'zh-CN');
      const brief = document.createElement('span');
      brief.textContent = I.t('aiHistoryMeta', {
        scope: scopeLabel(item.scope),
        chars: numberText(item.chars || 0),
        tokens: numberText(item.tokens || 0)
      });
      meta.appendChild(time);
      meta.appendChild(brief);

      const body = document.createElement('div');
      body.className = 'fo-ai-hist-text';
      body.innerHTML = renderMarkdown(item.text || '');

      const acts = document.createElement('div');
      acts.className = 'fo-ai-hist-acts';
      const jump = document.createElement('button');
      jump.className = 'fo-btn';
      jump.setAttribute('data-act', 'ai-hist-jump');
      jump.setAttribute('data-id', item.id);
      jump.textContent = I.t('aiHistoryJump');
      const remove = document.createElement('button');
      remove.className = 'fo-btn';
      remove.setAttribute('data-act', 'ai-hist-del');
      remove.setAttribute('data-id', item.id);
      remove.textContent = I.t('aiHistoryDelete');
      acts.appendChild(jump);
      acts.appendChild(remove);

      card.appendChild(meta);
      card.appendChild(body);
      card.appendChild(acts);
      els.aiHist.appendChild(card);
    });
  }

  async function jumpToAiHistory(id) {
    const list = await S.getAiHistory();
    const item = list.filter(function (entry) { return entry.id === id; })[0];
    if (!item || !novel) return;
    if (item.novelId && novel.id && item.novelId !== novel.id) {
      showToast(I.t('aiHistoryMismatch'));
      return;
    }
    state.charPos = clamp(Number(item.charPos) || 0, 0, Math.max(0, novel.text.length - 1));
    state.history = [];
    render({ animate: true });
    showToast(I.t('aiHistoryJumped'));
  }

  async function deleteAiHistory(id) {
    await S.removeAiHistory(id);
    renderAiHistory();
  }

  async function clearAiHistory() {
    if (!window.confirm(I.t('aiHistoryClearConfirm'))) return;
    await S.clearAiHistory();
    renderAiHistory();
    showToast(I.t('aiHistoryCleared'));
  }

  function onSystemPromptInput() {
    clearTimeout(aiPromptTimer);
    const value = els.aiSystem.value;
    aiPromptTimer = setTimeout(function () {
      S.patchSettings({ 'ai.systemPrompt': value }).catch(function () {
        /* noop */
      });
    }, 400);
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
      else if (act === 'ai-run') {
        if (aiBusy) stopAi();
        else startAi();
      } else if (act === 'ai-scope') setAiScope(btn.getAttribute('data-scope'));
      else if (act === 'ai-tab') switchAiTab(btn.getAttribute('data-tab'));
      else if (act === 'ai-hist-jump') jumpToAiHistory(btn.getAttribute('data-id'));
      else if (act === 'ai-hist-del') deleteAiHistory(btn.getAttribute('data-id'));
      else if (act === 'ai-hist-clear') clearAiHistory();
      else if (act === 'ai-copy') copyAiResult();
      else if (act === 'prev') prevPage();
      else if (act === 'next') nextPage();
      else if (act === 'mode') setMode(btn.getAttribute('data-mode'));
      else if (act === 'import') els.fileInput.click();
    });

    els.fileInput.addEventListener('change', function (event) {
      const input = event.target;
      const file = input && input.files ? input.files[0] : null;
      importFile(file).finally(function () {
        // 事件对象在异步回调里可能已失效，使用前面保存的元素引用
        if (input) input.value = '';
      });
    });

    els.aiSystem.addEventListener('input', onSystemPromptInput);

    els.body.addEventListener('wheel', onWheel, { passive: false });
    els.text.addEventListener('scroll', onTextScroll, { passive: true });
    els.panel.addEventListener('contextmenu', function (event) {
      event.stopPropagation();
    });

    bindDrag();
    bindResize();
    bindSplit();
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

