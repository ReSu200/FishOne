(function () {
  'use strict';

  const I = window.FishI18n;
  const S = window.FishStore;
  const N = window.FishNovel;

  const $ = function (id) {
    return document.getElementById(id);
  };

  let settings = null;
  let novel = null;
  let status = null;
  let toastTimer = null;

  function toast(message) {
    if (!message) return;
    const el = $('toast');
    el.textContent = message;
    el.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove('on');
    }, 2000);
  }

  function setHint(text, isError) {
    const el = $('hint');
    el.textContent = text || '';
    el.classList.toggle('error', !!isError);
  }

  function fmt(value) {
    try {
      return Number(value || 0).toLocaleString(I.lang === 'en' ? 'en-US' : 'zh-CN');
    } catch (err) {
      return String(value || 0);
    }
  }

  function defaultHint() {
    const key = settings && settings.hotkeys ? settings.hotkeys.toggle : '';
    return key ? I.t('footerHint', { key: key }) : '';
  }

  function renderNovel() {
    const nameEl = $('novel-name');
    const badge = $('novel-badge');
    const meta = $('novel-meta');
    const bar = $('progress-bar');
    const importBtn = $('btn-import');

    if (!novel) {
      nameEl.textContent = I.t('noNovel');
      nameEl.classList.add('empty');
      badge.textContent = '—';
      meta.textContent = I.t('noNovelHintPopup');
      bar.style.width = '0%';
      importBtn.textContent = I.t('importNovel');
      importBtn.classList.add('primary');
      $('btn-toggle').disabled = true;
      $('btn-prev').disabled = true;
      $('btn-next').disabled = true;
      return;
    }

    nameEl.textContent = novel.name;
    nameEl.classList.remove('empty');
    badge.textContent = I.t('chars', { n: fmt(novel.text.length) });
    importBtn.textContent = I.t('reimport');
    importBtn.classList.remove('primary');
    $('btn-toggle').disabled = false;
    $('btn-prev').disabled = false;
    $('btn-next').disabled = false;
    renderProgress();
  }

  function renderProgress() {
    const bar = $('progress-bar');
    const meta = $('novel-meta');
    if (!novel) return;
    const total = status && status.total ? status.total : novel.text.length;
    const pos = status && typeof status.charPos === 'number' ? status.charPos : 0;
    const pct = total > 0 ? (pos / total) * 100 : 0;
    bar.style.width = pct.toFixed(2) + '%';
    meta.textContent = pct.toFixed(1) + '% · ' + fmt(pos) + ' / ' + fmt(total);
  }

  function applyStatus(next) {
    if (!next) return;
    status = next;
    const btn = $('btn-toggle');
    if (next.visible) {
      btn.textContent = I.t('hideReader');
      btn.classList.remove('primary');
    } else {
      btn.textContent = I.t('showReader');
      btn.classList.add('primary');
    }
    renderProgress();
  }

  async function queryStatus() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs && tabs[0];
      if (!tab || !tab.id) throw new Error('no-tab');
      const res = await chrome.tabs.sendMessage(tab.id, { type: 'FO_PING' });
      if (res && res.ok) {
        applyStatus(res);
        setHint(defaultHint(), false);
        return;
      }
      throw new Error('no-response');
    } catch (err) {
      setHint(I.t('unsupportedPage'), true);
      const btn = $('btn-toggle');
      btn.textContent = I.t('showReader');
      btn.classList.add('primary');
    }
  }

  async function sendAction(message) {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs && tabs[0];
      if (!tab || !tab.id) throw new Error('no-tab');
      const res = await chrome.tabs.sendMessage(tab.id, message);
      if (res && res.ok) {
        applyStatus(res);
        setHint(defaultHint(), false);
        return true;
      }
      return false;
    } catch (err) {
      setHint(I.t('unsupportedPage'), true);
      return false;
    }
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
      const next = N.createNovel(data.name, text);
      await S.saveProgress({ novelId: next.id, charPos: 0, total: next.text.length });
      await S.setNovel(next);
      novel = next;
      status = null;
      renderNovel();
      toast(I.t('imported'));
    } catch (err) {
      if (err && err.message === 'unsupported-file') {
        toast(I.t('unsupportedFile'));
      } else {
        toast(I.t('importFailed', { msg: err && err.message ? err.message : String(err) }));
      }
    }
  }

  function bind() {
    $('btn-import').addEventListener('click', function () {
      $('file-input').click();
    });

    $('file-input').addEventListener('change', function (event) {
      const file = event.target.files && event.target.files[0];
      handleFile(file).finally(function () {
        event.target.value = '';
      });
    });

    $('btn-toggle').addEventListener('click', function () {
      sendAction({ type: 'FO_TOGGLE' });
    });

    $('btn-prev').addEventListener('click', function () {
      sendAction({ type: 'FO_PREV' });
    });

    $('btn-next').addEventListener('click', function () {
      sendAction({ type: 'FO_NEXT' });
    });

    $('btn-settings').addEventListener('click', function () {
      chrome.runtime.openOptionsPage();
    });

    $('btn-options').addEventListener('click', function () {
      chrome.runtime.openOptionsPage();
    });
  }

  async function init() {
    settings = await S.getSettings();
    I.setLang(settings.language);
    document.documentElement.setAttribute('data-theme', settings.theme === 'light' ? 'light' : 'dark');
    I.applyDom(document);
    novel = await S.getNovel();

    const progress = await S.getProgress();
    if (novel && progress && progress.novelId === novel.id) {
      status = { ok: true, hasNovel: true, visible: false, charPos: progress.charPos || 0, total: novel.text.length };
    }

    renderNovel();
    setHint(defaultHint(), false);
    bind();
    await queryStatus();
  }

  init().catch(function (err) {
    setHint(String(err && err.message ? err.message : err), true);
  });
})();

