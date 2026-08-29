// Mini-Syntax-Highlighter — keine Library, tokenbasiert auf dem escaped Text.
// Unterstuetzt: js, py, generic (Strings/Zahlen/Kommentare).
(function () {
  'use strict';

  const KEYWORDS = {
    js: 'const let var function return if else for while do switch case break continue new class extends import export from default async await try catch finally throw typeof instanceof of in null undefined true false this super yield static get set'.split(' '),
    py: 'def return if elif else for while in not and or import from as class try except finally raise with lambda pass break continue global nonlocal yield assert del is None True False self'.split(' '),
    generic: [],
  };

  function highlight(text, lang) {
    const kw = new Set(KEYWORDS[lang] || []);
    // Tokenizer auf dem Rohtext (bereits HTML-escaped im <pre>, daher hier
    // auf textContent arbeiten und escaped wieder einsetzen)
    const out = [];
    let i = 0;
    const n = text.length;

    const isIdent = (c) => /[A-Za-z0-9_$]/.test(c);

    while (i < n) {
      const c = text[i];
      const two = text.slice(i, i + 2);

      // Kommentare
      if ((lang === 'js' && two === '//') || (lang === 'py' && c === '#')) {
        let j = text.indexOf('\n', i);
        if (j === -1) j = n;
        out.push(span('com', text.slice(i, j)));
        i = j;
        continue;
      }
      if (lang === 'js' && two === '/*') {
        let j = text.indexOf('*/', i + 2);
        j = j === -1 ? n : j + 2;
        out.push(span('com', text.slice(i, j)));
        i = j;
        continue;
      }

      // Strings
      if (c === '"' || c === "'" || c === '`') {
        let j = i + 1;
        while (j < n && text[j] !== c) {
          if (text[j] === '\\') j++;
          j++;
        }
        j = Math.min(j + 1, n);
        out.push(span('str', text.slice(i, j)));
        i = j;
        continue;
      }

      // Zahlen
      if (/[0-9]/.test(c) && (i === 0 || !isIdent(text[i - 1]))) {
        let j = i;
        while (j < n && /[0-9._xXbBoOa-fA-F]/.test(text[j])) j++;
        out.push(span('num', text.slice(i, j)));
        i = j;
        continue;
      }

      // Identifier / Keyword
      if (/[A-Za-z_$]/.test(c)) {
        let j = i;
        while (j < n && isIdent(text[j])) j++;
        const word = text.slice(i, j);
        out.push(kw.has(word) ? span('kw', word) : esc(word));
        i = j;
        continue;
      }

      out.push(esc(c));
      i++;
    }
    return out.join('');
  }

  function esc(s) {
    return s.replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }

  function span(cls, s) {
    return '<span class="tok-' + cls + '">' + esc(s) + '</span>';
  }

  const pre = document.getElementById('code');
  if (pre) {
    const lang = pre.dataset.lang || 'generic';
    pre.innerHTML = highlight(pre.textContent, lang);
  }

  // Export fuer Wiederverwendung / Tests
  window.miniHighlight = highlight;
})();
