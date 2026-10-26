/**
 * 轻量运行时国际化：Chrome 自带的 i18n 只跟随浏览器语言，无法在运行时切换，
 * 因此界面文案统一由这里管理，支持「中文 / English」即时切换。
 */
(function (global) {
  'use strict';

  const MESSAGES = {
    zh_CN: {
      appName: '摸鱼一号',
      appTagline: '安全摸鱼，安静看书',

      // 小说
      novel: '小说',
      importNovel: '导入小说',
      reimport: '重新导入',
      noNovel: '尚未导入小说',
      noNovelHint: '请在下方导入 .txt 文本文件',
      noNovelHintPopup: '导入 txt 文件后即可开始阅读',
      chars: '{n} 字',
      progress: '进度',
      clearNovel: '清除小说',
      clearConfirm: '确定要清除已导入的小说和阅读进度吗？',
      importFailed: '导入失败：{msg}',
      imported: '小说已导入',
      emptyFile: '文件内容为空',
      unsupportedFile: '仅支持 .txt 文本文件',
      pickFile: '选择文件',

      // 阅读器
      reader: '阅读器',
      showReader: '显示阅读器',
      hideReader: '隐藏阅读器',
      prevPage: '上一页',
      nextPage: '下一页',
      pageHint: '滚轮 / ↑↓ / PageUp·PageDown 翻页',
      endOfNovel: '已到最后一页',
      startOfNovel: '已经是第一页',
      unsupportedPage: '当前页面无法使用阅读器，请在普通网页中打开',
      noReader: '阅读器未注入，请刷新页面后重试',
      close: '关闭',
      settings: '设置',
      openSettings: '打开设置',

      // AI
      ai: 'AI 总结',
      aiPanelTitle: 'AI 总结',
      aiInputLabel: '待总结的内容（可编辑）',
      aiPlaceholder: '粘贴或编辑需要总结的小说内容…',
      aiRun: '开始总结',
      aiStop: '停止',
      aiThinking: '正在生成…',
      aiResultLabel: '总结结果',
      aiNoKey: '请先在设置中填写 API Key',
      aiError: '请求失败：{msg}',
      aiCopy: '复制',
      copied: '已复制',

      // 设置页
      optionsTitle: '设置',
      optionsSubtitle: '配置属于你的摸鱼阅读体验',
      secDisplay: '显示与尺寸',
      secDisplayDesc: '阅读器悬浮在网页上的位置与大小',
      secStyle: '外观',
      secStyleDesc: '背景、文字与圆角，越低调越安全',
      secAi: 'AI 模型',
      secAiDesc: '兼容 OpenAI 协议的任意服务，密钥仅保存在本地浏览器',
      secHotkey: '快捷键',
      secHotkeyDesc: '一键隐藏阅读器，领导走过也不慌',
      secGeneral: '通用',
      secGeneralDesc: '语言与数据管理',
      secTokens: 'Token 统计',
      secTokensDesc: '查看 AI 总结调用的 Token 消耗',
      statPrompt: '提示 Tokens',
      statCompletion: '补全 Tokens',
      statTotal: '合计 Tokens',
      statCalls: '调用次数',
      lastCall: '最近调用：{time}',
      usageEstimated: '其中 {n} 次为估算值（服务未返回用量）',
      usageEmpty: '暂无调用记录',
      clearUsage: '清空统计',
      clearUsageConfirm: '确定清空所有 Token 统计？此操作不可恢复。',
      usageCleared: 'Token 统计已清空',
      secSponsor: '赞助',
      secSponsorDesc: '了解这个插件，或请作者喝杯咖啡',
      aboutTitle: '关于 FishOne',
      aboutText: 'FishOne（摸鱼一号）是一个把小说藏在网页角落的 Edge 扩展：导入本地 txt、自定义显示区域与透明度、滚轮与方向键翻页、一键隐身，还能用你自己的 AI 接口总结当前段落。全部数据只留在本机浏览器，不联网上传。',
      aboutVersion: '版本 {v}',
      rewardTitle: '打赏支持',
      rewardDesc: '如果它让你的上班时间轻松了一点，欢迎扫码支持作者。收款码来自本机上传或扩展内置图片，不会联网。',
      alipay: '支付宝',
      wechat: '微信',
      uploadQr: '上传收款码',
      replaceQr: '替换',
      removeQr: '删除',
      qrEmpty: '尚未放置收款码',
      qrHint: '支持 PNG / JPG，超过 720px 会自动缩小；仅保存在本机。',
      qrSaved: '收款码已保存',
      qrRemoved: '收款码已移除',
      imageOnly: '请选择图片文件',
      qrTooBig: '图片过大，请换一张更小的收款码',

      left: '左侧距离 (px)',
      top: '顶部距离 (px)',
      width: '宽度 (px)',
      height: '高度 (px)',
      fontSize: '字号 (px)',
      lineHeight: '行高倍数',
      textColor: '文字颜色',
      bgColor: '背景颜色',
      bgOpacity: '背景不透明度',
      bgOpacityHint: '数值越低越透明，越不容易被发现',
      blur: '背景模糊 (px)',
      blurHint: '毛玻璃效果，与透明度配合使用',
      radius: '圆角 (px)',
      border: '显示边框',

      apiKey: 'API Key',
      baseUrl: 'Base URL',
      model: '模型',
      temperature: 'Temperature',
      maxTokens: '最大输出 Tokens',
      systemPrompt: '系统提示词（可选）',
      systemPromptPlaceholder: '例如：请用简洁的中文分点总结剧情',
      testAi: '测试连接',
      testing: '测试中…',
      testOk: '连接成功（{ms} ms）',
      testFail: '连接失败：{msg}',
      showKey: '显示',
      hideKey: '隐藏',
      advanced: '高级参数',

      language: '界面语言',
      langAuto: '跟随浏览器',
      langZh: '中文',
      langEn: 'English',
      theme: '界面主题',
      themeDark: '黑夜',
      themeLight: '白天',

      hotkeyLabel: '隐藏 / 显示快捷键',
      hotkeyPlaceholder: '点击后按下组合键',
      hotkeyRecording: '请按下组合键…',
      hotkeyInvalid: '需要包含 Ctrl / Alt 中的修饰键，或使用 F1–F12',
      hotkeyHint: '在网页内生效，录制后立即保存，例如 Alt+Q。',
      hotkeyBrowser: '浏览器级快捷键',
      hotkeyBrowserValue: 'Ctrl + Shift + F（默认）',
      openShortcutPage: '打开浏览器快捷键设置',

      save: '保存设置',
      saved: '设置已保存',
      reset: '恢复默认',
      resetConfirm: '确定要恢复全部默认设置吗？',
      generalHint: '所有设置保存在浏览器本地，不会上传。',

      // 弹窗
      popupReaderOn: '阅读器已显示',
      popupReaderOff: '阅读器已隐藏',
      openOptions: '设置',
      footerHint: '快捷键 {key} 一键隐藏',
      novelLoadedShort: '当前小说',
      noActiveTab: '无法连接当前页面，请刷新后再试'
    },

    en: {
      appName: 'FishOne',
      appTagline: 'Read at work, quietly',

      novel: 'Novel',
      importNovel: 'Import novel',
      reimport: 'Replace',
      noNovel: 'No novel yet',
      noNovelHint: 'Import a .txt file below',
      noNovelHintPopup: 'Import a .txt file to start reading',
      chars: '{n} chars',
      progress: 'Progress',
      clearNovel: 'Clear novel',
      clearConfirm: 'Remove the imported novel and reading progress?',
      importFailed: 'Import failed: {msg}',
      imported: 'Novel imported',
      emptyFile: 'The file is empty',
      unsupportedFile: 'Only .txt files are supported',
      pickFile: 'Choose file',

      reader: 'Reader',
      showReader: 'Show reader',
      hideReader: 'Hide reader',
      prevPage: 'Prev',
      nextPage: 'Next',
      pageHint: 'Wheel / ↑↓ / PageUp·PageDown',
      endOfNovel: 'This is the last page',
      startOfNovel: 'This is the first page',
      unsupportedPage: 'The reader is unavailable on this page. Try a normal website.',
      noReader: 'Reader not injected. Please refresh the page.',
      close: 'Close',
      settings: 'Settings',
      openSettings: 'Open settings',

      ai: 'AI summary',
      aiPanelTitle: 'AI summary',
      aiInputLabel: 'Content to summarize (editable)',
      aiPlaceholder: 'Paste or edit the text you want to summarize…',
      aiRun: 'Summarize',
      aiStop: 'Stop',
      aiThinking: 'Generating…',
      aiResultLabel: 'Result',
      aiNoKey: 'Please set your API Key in settings first',
      aiError: 'Request failed: {msg}',
      aiCopy: 'Copy',
      copied: 'Copied',

      optionsTitle: 'Settings',
      optionsSubtitle: 'Tune your own covert reading experience',
      secDisplay: 'Display & size',
      secDisplayDesc: 'Where the floating reader sits and how big it is',
      secStyle: 'Appearance',
      secStyleDesc: 'Background, text and corners — the quieter the better',
      secAi: 'AI model',
      secAiDesc: 'Any OpenAI-compatible service. Your key stays in this browser.',
      secHotkey: 'Shortcuts',
      secHotkeyDesc: 'Hide instantly when someone walks by',
      secGeneral: 'General',
      secGeneralDesc: 'Language and data',
      secTokens: 'Token usage',
      secTokensDesc: 'Token spend for AI summary calls',
      statPrompt: 'Prompt tokens',
      statCompletion: 'Completion tokens',
      statTotal: 'Total tokens',
      statCalls: 'Calls',
      lastCall: 'Last call: {time}',
      usageEstimated: '{n} estimated call(s) — provider returned no usage',
      usageEmpty: 'No calls recorded yet',
      clearUsage: 'Clear stats',
      clearUsageConfirm: 'Clear all token statistics? This cannot be undone.',
      usageCleared: 'Token statistics cleared',
      secSponsor: 'Sponsor',
      secSponsorDesc: 'Meet the extension, or buy the author a coffee',
      aboutTitle: 'About FishOne',
      aboutText: 'FishOne hides a novel in a corner of any web page: import a local .txt, tune size and opacity, flip pages with the wheel or arrow keys, hide it with one shortcut, and summarize the current passage with your own AI endpoint. Everything stays in this browser — nothing is uploaded.',
      aboutVersion: 'Version {v}',
      rewardTitle: 'Support the author',
      rewardDesc: 'If FishOne makes your workday a bit lighter, scan the code to say thanks. QR images come from this browser or the bundled defaults — never from the network.',
      alipay: 'Alipay',
      wechat: 'WeChat',
      uploadQr: 'Upload QR code',
      replaceQr: 'Replace',
      removeQr: 'Remove',
      qrEmpty: 'No QR code yet',
      qrHint: 'PNG / JPG supported, resized to 720px when larger; stored on this device only.',
      qrSaved: 'QR code saved',
      qrRemoved: 'QR code removed',
      imageOnly: 'Please choose an image file',
      qrTooBig: 'Image too large — try a smaller QR code',

      left: 'Left (px)',
      top: 'Top (px)',
      width: 'Width (px)',
      height: 'Height (px)',
      fontSize: 'Font size (px)',
      lineHeight: 'Line height',
      textColor: 'Text color',
      bgColor: 'Background',
      bgOpacity: 'Background opacity',
      bgOpacityHint: 'Lower means more transparent and less noticeable',
      blur: 'Background blur (px)',
      blurHint: 'Frosted glass, works with opacity',
      radius: 'Corner radius (px)',
      border: 'Show border',

      apiKey: 'API Key',
      baseUrl: 'Base URL',
      model: 'Model',
      temperature: 'Temperature',
      maxTokens: 'Max output tokens',
      systemPrompt: 'System prompt (optional)',
      systemPromptPlaceholder: 'e.g. Summarize the plot in concise bullet points',
      testAi: 'Test connection',
      testing: 'Testing…',
      testOk: 'Connected ({ms} ms)',
      testFail: 'Connection failed: {msg}',
      showKey: 'Show',
      hideKey: 'Hide',
      advanced: 'Advanced',

      language: 'Language',
      langAuto: 'Auto',
      langZh: '中文',
      langEn: 'English',
      theme: 'Theme',
      themeDark: 'Dark',
      themeLight: 'Light',

      hotkeyLabel: 'Hide / show shortcut',
      hotkeyPlaceholder: 'Click and press keys',
      hotkeyRecording: 'Press a key combination…',
      hotkeyInvalid: 'Needs a Ctrl / Alt modifier, or use F1–F12',
      hotkeyHint: 'Works inside web pages, saved immediately, e.g. Alt+Q.',
      hotkeyBrowser: 'Browser-level shortcut',
      hotkeyBrowserValue: 'Ctrl + Shift + F (default)',
      openShortcutPage: 'Open browser shortcut settings',

      save: 'Save settings',
      saved: 'Settings saved',
      reset: 'Reset to defaults',
      resetConfirm: 'Reset all settings to defaults?',
      generalHint: 'Everything is stored locally in your browser and never uploaded.',

      popupReaderOn: 'Reader is visible',
      popupReaderOff: 'Reader is hidden',
      openOptions: 'Settings',
      footerHint: 'Press {key} to hide instantly',
      novelLoadedShort: 'Current novel',
      noActiveTab: 'Cannot reach this page. Please refresh and try again.'
    }
  };

  let lang = 'zh_CN';

  function detectLang() {
    const nav = (global.navigator && global.navigator.language) || 'zh-CN';
    return String(nav).toLowerCase().indexOf('zh') === 0 ? 'zh_CN' : 'en';
  }

  function resolveLang(pref) {
    if (!pref || pref === 'auto') return detectLang();
    return MESSAGES[pref] ? pref : detectLang();
  }

  function setLang(pref) {
    lang = resolveLang(pref);
    return lang;
  }

  function t(key, vars) {
    const table = MESSAGES[lang] || MESSAGES.zh_CN;
    let text = table[key] || MESSAGES.zh_CN[key] || key;
    if (vars) {
      text = text.replace(/\{(\w+)\}/g, function (m, name) {
        return vars[name] === undefined ? m : String(vars[name]);
      });
    }
    return text;
  }

  function applyDom(root) {
    root = root || global.document;
    if (!root) return;
    root.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    root.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
    });
    root.querySelectorAll('[data-i18n-title]').forEach(function (el) {
      el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
    });
  }

  global.FishI18n = {
    t: t,
    setLang: setLang,
    resolveLang: resolveLang,
    detectLang: detectLang,
    applyDom: applyDom,
    get lang() {
      return lang;
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
