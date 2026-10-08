/*
 * Pi-Star Live shell: the faceplate header on every page (/live/ loads it
 * directly; nginx injects it into the stock pages).
 *
 *  - callsign plate, LCD readout, one nav (+ Tools menu), theme knob
 *  - on stock pages: hides Pi-Star's own header, keeps any of its links the
 *    nav doesn't cover (Expert quick edits, Factory reset, Download log...)
 *    in a page title row underneath
 *  - the ONE poller of /live/data.php. The dashboard (app.js) subscribes
 *    instead of polling itself, so the Pi parses the log once per tick.
 *
 * Read-only: it only ever GETs.
 */
(function () {
  'use strict';
  var root = document.documentElement;
  try { var t = localStorage.getItem('live-theme'); if (t) root.dataset.theme = t; } catch (e) {}

  // Embedded copies of a page (the Wi-Fi panel on Configuration) get the theme only.
  var top = window.self === window.top;
  if (top) root.classList.add('has-shell');

  var POLL_FAST = 1500;     // the dashboard: stock lh.php cadence
  var POLL_SLOW = 4000;     // any other page: the LCD only

  /* ---------- Helpers (shared with app.js) ---------- */

  var skewMs = 0;           // server clock minus browser clock
  var lookup = 'RadioID';
  var idLookup = 'https://database.radioid.net/database/view?id=';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function utc(s) { return new Date(s.replace(' ', 'T') + 'Z'); }
  function now() { return new Date(Date.now() + skewMs); }
  function ago(d) {
    var s = Math.max(0, Math.round((now() - d) / 1000));
    if (s < 60) return s + 's ago';
    var m = Math.floor(s / 60);
    if (m < 60) return m + ' min ago';
    var h = Math.floor(m / 60);
    if (h < 24) return h + ' h ' + (m % 60) + ' min ago';
    return Math.floor(h / 24) + ' d ago';
  }
  function liveSecs(r) { return Math.max(0, Math.round((now() - utc(r.time)) / 1000)); }
  function liveText(r) { var s = liveSecs(r); return s < 999 ? s + 's' : '999s+'; }
  function modeLabel(m) { return m.replace('Slot ', 'TS'); }
  function targetLabel(t) { return t.replace(/ /g, ' ').trim(); }

  var PIN = '<svg viewBox="0 0 24 24"><path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>';

  // Callsign link rules ported from lh.php.
  function callHtml(r, withAprs) {
    var callLookup = lookup === 'QRZ'
      ? 'https://www.qrz.com/db/'
      : 'https://database.radioid.net/database/view?callsign=';
    var c = r.call;
    if (/^\d+$/.test(c)) {
      return +c > 9999
        ? '<a href="' + idLookup + encodeURIComponent(c) + '" target="_blank" rel="noopener">' + esc(c) + '</a>'
        : esc(c);
    }
    if (!/[A-Za-z].*[0-9]|[0-9].*[A-Za-z]/.test(c)) return esc(c);
    var base = c.indexOf('-') > 0 ? c.slice(0, c.indexOf('-')) : c;
    var html = '<a href="' + callLookup + encodeURIComponent(base) + '" target="_blank" rel="noopener" title="Look up ' + esc(base) + '">' + esc(base) + '</a>';
    if (r.suffix) html += '/' + esc(r.suffix);
    if (withAprs) {
      html += '<a class="aprs" href="https://aprs.fi/#!call=' + encodeURIComponent(base) + '*" target="_blank" rel="noopener" aria-label="Find ' + esc(base) + ' on aprs.fi" title="Find on aprs.fi">' + PIN + '</a>';
    }
    return html;
  }

  // Stock repeaterinfo cells carry state as an inline background colour.
  function cellState(el) {
    var bg = (el.getAttribute('style') || '').toLowerCase().match(/background:\s*(#[0-9a-f]{3,6})/);
    if (!bg) return '';
    var c = bg[1];
    if (c === '#0b0' || c === '#1d1' || c === '#4aa361') return 'on';
    if (c === '#606060') return 'off';
    if (c === '#b00' || c === '#f33') return 'fault';
    if (c === '#ffffff' || c === '#fff') return '';
    return 'mode';          // "Listening <mode>" tints
  }

  // The stock repeaterinfo.php HTML as sections of lamps / key-values.
  // Tables are read by position, not title: titles are translated.
  function parseRepeaterInfo(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    return Array.prototype.map.call(doc.querySelectorAll('table'), function (table) {
      var sec = { title: '', items: [] };
      Array.prototype.forEach.call(table.rows, function (tr) {
        var cells = tr.cells;
        var txt = function (c) { return c.textContent.replace(/ /g, ' ').trim(); };
        if (cells.length === 1) {
          var c = cells[0];
          if (c.tagName === 'TH') {
            if (!sec.title) sec.title = txt(c);
            else sec.items.push({ type: 'sub', text: txt(c) });
          } else {
            sec.items.push({ type: 'value', text: txt(c), state: cellState(c) });
          }
        } else if (cells.length === 2 && cells[0].tagName === 'TH') {
          sec.items.push({ type: 'kv', key: txt(cells[0]), text: txt(cells[1]), state: cellState(cells[1]) });
        } else {
          Array.prototype.forEach.call(cells, function (c) {
            sec.items.push({ type: 'lamp', text: txt(c), state: cellState(c) });
          });
        }
      });
      return sec;
    });
  }
  function findKv(sections, key) {
    for (var s = 0; s < sections.length; s++) {
      for (var i = 0; i < sections[s].items.length; i++) {
        var it = sections[s].items[i];
        if (it.type === 'kv' && it.key === key) return it;
      }
    }
    return null;
  }

  /* ---------- Config ---------- */

  // /live/ embeds its settings; stock pages fetch them once.
  var cfgPromise = new Promise(function (resolve, reject) {
    function fromPage() {
      var el = document.getElementById('cfg');
      if (el) { resolve(JSON.parse(el.textContent)); return; }
      fetch('/live/cfg.php', { cache: 'no-store', credentials: 'same-origin' })
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(resolve, reject);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fromPage);
    else fromPage();
  });

  /* ---------- Feed: the one /live/data.php poller ---------- */

  var subscribers = [];
  var historyWanted = null;     // fn() -> bool, from the dashboard
  var fast = false;
  var lastData = null;
  var failures = 0;
  var timer = null;
  var polling = false;

  function schedule(ms) { clearTimeout(timer); timer = setTimeout(poll, ms); }
  function poll() {
    if (document.hidden) return;          // resumes on visibilitychange
    var hist = historyWanted && historyWanted();
    fetch('/live/data.php' + (hist ? '?history=1' : ''), { cache: 'no-store' })
      .then(function (res) { if (!res.ok) throw new Error(res.status); return res.json(); })
      .then(function (data) {
        skewMs = utc(data.now) - Date.now();
        lastData = data;
        failures = 0;
        setStale(false);
        renderLcd();
        subscribers.forEach(function (fn) { fn(data); });
      })
      .catch(function () {
        failures++;
        if (failures >= 2) setStale(true);
      })
      .then(function () {
        var ms = fast ? POLL_FAST : POLL_SLOW;
        schedule(failures ? ms * 2 : ms);
      });
  }
  function startPolling() {
    if (polling) return;
    polling = true;
    schedule(0);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) schedule(0); });
    // Live "on air" counter ticks between polls.
    setInterval(function () {
      if (lastData && lastData.lastHeard && lastData.lastHeard[0] && lastData.lastHeard[0].live) renderLcd();
    }, 1000);
  }

  /* ---------- LCD ---------- */

  var $ = function (id) { return document.getElementById(id); };

  function lcdHtml() {
    return '<section class="lcd" id="readout" data-state="idle" aria-live="polite" aria-label="Radio status">' +
      '<div class="ro-state"><span class="lamp-big" aria-hidden="true"></span><span id="roState">Connecting</span></div>' +
      '<div class="ro-call"><span class="ro-label" id="roLabel">&nbsp;</span><span class="ro-callsign" id="roCall">&nbsp;</span></div>' +
      '<dl class="ro-fields">' +
        '<div><dt>Target</dt><dd id="roTarget">&nbsp;</dd></div>' +
        '<div><dt>Mode</dt><dd id="roMode">&nbsp;</dd></div>' +
        '<div><dt>Source</dt><dd id="roSrc">&nbsp;</dd></div>' +
        '<div><dt id="roTimeLabel">Duration</dt><dd id="roTime">&nbsp;</dd></div>' +
      '</dl>' +
    '</section>';
  }

  var staleNow = false;
  function setStale(on) {
    staleNow = on;
    var el = $('shellStale');
    if (el) el.hidden = !on;
    if (on && $('readout')) {
      $('readout').dataset.state = 'offline';
      $('roState').textContent = 'No contact';
    }
  }

  function renderLcd() {
    if (!$('readout') || !lastData || staleNow) return;
    var sections = parseRepeaterInfo(lastData.repeaterInfo || '');
    var rows = lastData.lastHeard || [];
    var trx = findKv(sections, 'Trx');
    var trxText = trx ? trx.text : '';
    var state = 'idle';
    if (/^TX/i.test(trxText)) state = 'tx';
    else if (/^RX/i.test(trxText)) state = 'rx';
    else if (/^OFFLINE/i.test(trxText)) state = 'offline';
    $('readout').dataset.state = state;
    $('roState').textContent = trxText || 'Unknown';

    var r = rows[0];
    if (!r) {
      $('roLabel').textContent = 'Nothing heard yet today';
      $('roCall').innerHTML = '&nbsp;';
      ['roTarget', 'roMode', 'roSrc', 'roTime'].forEach(function (id) { $(id).textContent = '-'; });
      return;
    }
    $('roLabel').textContent = r.live ? (r.src === 'RF' ? 'Receiving' : 'Transmitting from network') : 'Last heard';
    $('roCall').innerHTML = callHtml(r, false);
    $('roTarget').textContent = targetLabel(r.target) || '-';
    $('roMode').textContent = modeLabel(r.mode);
    $('roSrc').textContent = r.src || '-';
    if (r.live) {
      $('roTimeLabel').textContent = 'On air';
      $('roTime').textContent = liveText(r);
    } else {
      var hasDur = r.dur && !isNaN(parseFloat(r.dur));
      $('roTimeLabel').textContent = hasDur ? 'Duration' : 'Heard';
      $('roTime').textContent = hasDur ? r.dur + 's, ' + ago(utc(r.time)) : ago(utc(r.time));
    }
  }

  /* ---------- Header ---------- */

  function norm(p) { return (p || '').replace(/\/index\.php$/, '/'); }

  var KEYS = [
    // [href, label, matches the current path]
    ['/live/', 'Dashboard', /^\/live\/(index\.php)?$/],
    ['/admin/', 'Admin', /^\/admin\/(index\.php)?$/],
    ['/admin/live_modem_log.php', 'Live logs', /^\/admin\/live_modem_log\.php$/],
    ['/admin/configure.php', 'Configuration', /^\/admin\/configure\.php$/],
    ['/admin/expert/', 'Expert', /^\/admin\/expert\/(?!upgrade\.php)/]
  ];
  var TOOLS = [
    ['/admin/calibration.php', 'Calibrate'],
    ['/admin/update.php', 'Update'],
    ['/admin/expert/upgrade.php', 'Upgrade'],
    ['/admin/config_backup.php', 'Backup and restore'],
    ['/admin/power.php', 'Power'],
    null,
    ['/index.php', 'Classic dashboard']
  ];
  var TITLES = {
    '/index.php': 'Classic dashboard',
    '/admin/live_modem_log.php': 'Live logs',
    '/admin/configure.php': 'Configuration',
    '/admin/calibration.php': 'Calibrate',
    '/admin/update.php': 'Update',
    '/admin/expert/upgrade.php': 'Upgrade',
    '/admin/config_backup.php': 'Backup and restore',
    '/admin/power.php': 'Power',
    '/admin/expert/ssh_access.php': 'SSH access',
    '/admin/expert/jitter_test.php': 'Jitter test',
    '/admin/expert/modem_fw_upgrade.php': 'Modem firmware'
  };
  // Pages that open with their own content: no title row.
  var HOME = /^\/(live\/(index\.php)?|admin\/(index\.php)?)$/;

  var CHEVRON = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="m2 3.5 3 3 3-3"/></svg>';
  var MOON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z"/></svg>';

  function buildHeader(cfg) {
    var path = location.pathname;
    var mmdvm = cfg.mmdvm !== false;
    var dash = mmdvm ? '/live/' : '/index.php';
    lookup = cfg.lookup || 'RadioID';

    var keys = KEYS.map(function (k) {
      var href = k[0] === '/live/' ? dash : k[0];
      var cur = k[0] === '/live/' ? (mmdvm ? k[2].test(path) : path === '/' || path === '/index.php') : k[2].test(path);
      return '<a class="fp-key" href="' + href + '"' + (cur ? ' aria-current="page"' : '') + '>' + k[1] + '</a>';
    }).join('');
    var toolsCurrent = false;
    var menu = TOOLS.map(function (t) {
      if (!t) return '<hr>';
      if (t[0] === '/index.php' && !mmdvm) return '';      // that IS the dashboard here
      var cur = norm(path) === norm(t[0]);
      if (cur) toolsCurrent = true;
      return '<a href="' + t[0] + '"' + (cur ? ' aria-current="page"' : '') + '>' + t[1] + '</a>';
    }).join('').replace(/<hr>$/, '');

    var sub = [cfg.hostname, cfg.pistarVersion ? 'Pi-Star ' + cfg.pistarVersion : ''].filter(Boolean).join(' · ');
    var fp = document.createElement('header');
    fp.className = 'fp';
    fp.innerHTML =
      '<div class="fp-inner">' +
        '<div class="fp-top">' +
          '<a class="fp-plate" href="' + dash + '" aria-label="' + esc(cfg.call) + ' dashboard">' +
            '<span class="fp-call">' + esc(cfg.call || 'Pi-Star') + '</span>' +
            '<span class="fp-sub">' + esc(sub) + '</span></a>' +
          (mmdvm ? lcdHtml() : '<span></span>') +
          '<button type="button" class="fp-knob" id="themeToggle" aria-label="Switch colour theme">' + MOON + '</button>' +
        '</div>' +
        '<nav class="fp-keys" aria-label="Pi-Star pages">' + keys +
          '<details class="fp-more' + (toolsCurrent ? ' is-current' : '') + '"><summary>Tools ' + CHEVRON + '</summary>' +
          '<div class="fp-menu">' + menu + '</div></details>' +
        '</nav>' +
      '</div>';
    document.body.insertBefore(fp, document.body.firstChild);

    var stale = document.createElement('div');
    stale.className = 'shell-stale';
    stale.id = 'shellStale';
    stale.hidden = true;
    stale.innerHTML = '<span>Can\'t reach the hotspot. Retrying every few seconds.</span>';
    fp.insertAdjacentElement('afterend', stale);

    pageHead(fp, stale, path);
    wireMenu(fp.querySelector('.fp-more'));
    tabBar(path, dash, mmdvm);
    $('themeToggle').addEventListener('click', toggleTheme);
    if (mmdvm) startPolling();
  }

  // Title row for stock pages, carrying the stock header's extra links.
  function pageHead(fp, after, path) {
    var stock = document.querySelector('.container > .header') || document.querySelector('.header');
    var covered = {};
    KEYS.concat(TOOLS).forEach(function (k) { if (k) covered[norm(k[0])] = 1; });
    covered['/'] = 1;

    var tabs = document.createElement('nav');
    tabs.className = 'pg-tabs';
    tabs.setAttribute('aria-label', 'On this page');
    var title = TITLES[path] || '';

    if (stock) {
      var bars = stock.querySelectorAll('p');
      Array.prototype.forEach.call(bars, function (bar, i) {
        if (i === 0) {
          // Main link bar: keep only what the faceplate nav lacks.
          Array.prototype.forEach.call(bar.querySelectorAll('a'), function (a) {
            var js = a.protocol === 'javascript:';
            if (!js && covered[norm(a.pathname)]) return;
            tabs.appendChild(a);
          });
        } else {
          tabs.appendChild(bar);     // expert: Quick edit / Full edit / Tools groups
        }
      });
      if (!title) {
        var h1 = stock.querySelector('h1');
        title = h1 ? h1.textContent.replace(/^\s*Pi-Star\s*(-\s*)?Digital Voice\s*(-\s*)?/i, '').trim() : '';
      }
      if (/^\/admin\/expert\//.test(path) && !TITLES[path]) title = 'Expert editors';
    }
    var here = norm(path);
    Array.prototype.forEach.call(tabs.querySelectorAll('a'), function (a) {
      if (a.protocol !== 'javascript:' && norm(a.pathname) === here) a.setAttribute('aria-current', 'page');
    });

    if (HOME.test(path) && !tabs.querySelector('a')) return;
    var head = document.createElement('div');
    head.className = 'pg-head';
    if (title && !HOME.test(path)) {
      var h = document.createElement('h1');
      h.className = 'pg-title';
      h.textContent = title;
      head.appendChild(h);
    }
    if (tabs.querySelector('a')) head.appendChild(tabs);
    if (head.firstChild) after.insertAdjacentElement('afterend', head);

    // Drop a first table heading that just repeats the title ("Power", "Live Logs").
    var th = title && document.querySelector('.container table th');
    if (th && th.parentNode.cells.length === 1 && th.textContent.trim().toLowerCase() === title.toLowerCase()) {
      th.parentNode.classList.add('ps-dup-title');
    }
  }

  /* ---------- Phones: bottom tab bar (shown under 641px, see shell.css) ---------- */

  var TAB_ICON = {
    dash:   '<path d="M4 15a8 8 0 0 1 16 0"/><path d="m12 15 4.5-4.5"/><path d="M3 19h18"/>',
    admin:  '<rect x="4" y="4" width="6.5" height="6.5" rx="1.2"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.2"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.2"/>',
    logs:   '<path d="M4 6h16M4 11h16M4 16h10M4 21h7"/>',
    config: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    more:   '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>'
  };

  function tabBar(path, dash, mmdvm) {
    function icon(k) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + TAB_ICON[k] + '</svg>'; }
    var tabs = [
      [dash, 'dash', 'Dashboard', mmdvm ? KEYS[0][2].test(path) : path === '/' || path === '/index.php'],
      ['/admin/', 'admin', 'Admin', KEYS[1][2].test(path)],
      ['/admin/live_modem_log.php', 'logs', 'Logs', KEYS[2][2].test(path)],
      ['/admin/configure.php', 'config', 'Config', KEYS[3][2].test(path)]
    ];
    var sheet = [['/admin/expert/', 'Expert editors', KEYS[4][2].test(path)]].concat(TOOLS.map(function (t) {
      if (!t) return null;
      if (t[0] === '/index.php' && !mmdvm) return null;
      return [t[0], t[1], norm(path) === norm(t[0])];
    }));
    var moreCur = sheet.some(function (t) { return t && t[2]; });

    var bar = document.createElement('nav');
    bar.className = 'tabbar';
    bar.setAttribute('aria-label', 'Pi-Star pages');
    bar.innerHTML = tabs.map(function (t) {
      return '<a class="tab" href="' + t[0] + '"' + (t[3] ? ' aria-current="page"' : '') + '>' + icon(t[1]) + '<span>' + t[2] + '</span></a>';
    }).join('') +
      '<button type="button" class="tab' + (moreCur ? ' is-current' : '') + '" id="tabMore" aria-expanded="false" aria-controls="tabSheet">' +
        icon('more') + '<span>More</span></button>' +
      '<div class="tab-sheet" id="tabSheet" hidden>' + sheet.map(function (t) {
        return t ? '<a href="' + t[0] + '"' + (t[2] ? ' aria-current="page"' : '') + '>' + t[1] + '</a>' : '';
      }).join('') + '</div>';
    document.body.appendChild(bar);

    var btn = bar.querySelector('#tabMore'), panel = bar.querySelector('#tabSheet');
    function setOpen(on) { panel.hidden = !on; btn.setAttribute('aria-expanded', on ? 'true' : 'false'); }
    btn.addEventListener('click', function (e) { e.stopPropagation(); setOpen(panel.hidden); });
    document.addEventListener('click', function (e) { if (!panel.hidden && !panel.contains(e.target)) setOpen(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) { setOpen(false); btn.focus(); } });
  }

  function wireMenu(d) {
    if (!d) return;
    document.addEventListener('click', function (e) { if (d.open && !d.contains(e.target)) d.open = false; });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && d.open) { d.open = false; d.querySelector('summary').focus(); }
    });
  }

  function toggleTheme() {
    var dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('live-theme', root.dataset.theme); } catch (e) {}
    // Keep embedded pages (the Wi-Fi panel) in step.
    Array.prototype.forEach.call(document.querySelectorAll('iframe'), function (f) {
      try { f.contentDocument.documentElement.dataset.theme = root.dataset.theme; } catch (e) {}
    });
  }

  if (top) {
    cfgPromise.then(function (cfg) {
      try { buildHeader(cfg); } catch (e) { root.classList.remove('has-shell'); throw e; }
    }, function () {
      root.classList.remove('has-shell');     // no settings: keep the stock header
    });
  }

  /* ---------- API for app.js ---------- */

  window.PistarShell = {
    cfg: cfgPromise,
    // fn(data) after every poll. opts.fast: poll at the dashboard cadence;
    // opts.wantHistory(): add ?history=1 to the next request when true.
    subscribe: function (fn, opts) {
      subscribers.push(fn);
      if (opts && opts.fast) fast = true;
      if (opts && opts.wantHistory) historyWanted = opts.wantHistory;
      if (lastData) fn(lastData);
      if (polling) schedule(0);
    },
    util: {
      esc: esc, utc: utc, now: now, ago: ago, liveText: liveText,
      modeLabel: modeLabel, targetLabel: targetLabel, callHtml: callHtml,
      parseRepeaterInfo: parseRepeaterInfo, findKv: findKv
    }
  };
})();
