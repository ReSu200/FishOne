/**
 * 小说文本处理：编码识别（UTF-8 / GBK / UTF-16）、文本规范化。
 */
(function (global) {
  'use strict';

  function decodeBuffer(buffer) {
    const bytes = new Uint8Array(buffer);
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      return new TextDecoder('utf-8').decode(bytes.subarray(3));
    }
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
      return new TextDecoder('utf-16le').decode(bytes.subarray(2));
    }
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
      return new TextDecoder('utf-16be').decode(bytes.subarray(2));
    }
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch (err) {
      // 中文 txt 常见 GBK 编码
      try {
        return new TextDecoder('gbk').decode(bytes);
      } catch (err2) {
        return new TextDecoder('utf-8').decode(bytes);
      }
    }
  }

  function normalizeText(raw) {
    return String(raw || '')
      .replace(/\r\n?/g, '\n')
      .replace(/\u0000/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^\n+/, '')
      .replace(/\s+$/, '');
  }

  function createNovel(name, rawText) {
    const text = normalizeText(rawText);
    return {
      id: 'novel-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
      name: String(name || '未命名').replace(/\.txt$/i, ''),
      text: text,
      size: text.length,
      importedAt: Date.now()
    };
  }

  function readFile(file) {
    return new Promise(function (resolve, reject) {
      if (!/\.txt$/i.test(file.name || '')) {
        reject(new Error('unsupported-file'));
        return;
      }
      const reader = new FileReader();
      reader.onload = function () {
        resolve({ name: file.name, text: decodeBuffer(reader.result) });
      };
      reader.onerror = function () {
        reject(reader.error || new Error('read-error'));
      };
      reader.readAsArrayBuffer(file);
    });
  }

  global.FishNovel = {
    decodeBuffer: decodeBuffer,
    normalizeText: normalizeText,
    createNovel: createNovel,
    readFile: readFile
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
