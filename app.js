/* Pi-Star live dashboard client. Read-only: it only ever GETs. */
(function () {
  'use strict';

  // Settings come from the page (#cfg) or, when another page mounts the
  // layout (the restyled /admin/), from window.PISTAR_LIVE.cfg.
  // The header, LCD readout and the data.php poll belong to the shell
  // (shell.js); this file subscribes to it.
  var embed = window.PISTAR_LIVE || {};
  var cfgEl = document.getElementById('cfg');
  var cfg = embed.cfg || JSON.parse(cfgEl.textContent);
  var shell = window.PistarShell;
  var U = shell.util;
  var esc = U.esc, utc = U.utc, now = U.now, ago = U.ago, liveText = U.liveText,
    modeLabel = U.modeLabel, targetLabel = U.targetLabel, callHtml = U.callHtml;
  var CCS_MS = 15000;          // stock css_connections.php cadence
  var PAGES_MS = 5000;         // stock pages.php cadence
  var LIST_LEN = 20;           // stock lists show the last 20 calls
  var HISTORY_MS = 6000;       // full 100-call gateway history: refresh at most this often,
                               // plus straight away whenever a call starts or ends
  var VOICE_MODES = /^(D-Star|DMR.*|YSF|P25|NXDN|M17)$/;   // localtx.php filter

  var $ = function (id) { return document.getElementById(id); };

  /* ---------- Layout ---------- */

  var ADMIN = embed.mode === 'admin';   // the /admin/ control page (stock page, restyled)
  var ADMIN_RECENT = 10;

  var ICON = {
    logs:   '<path d="M4 5h16M4 10h16M4 15h10M4 20h7"/>',
    config: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    expert: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>',
    calib:  '<circle cx="12" cy="12" r="8"/><path d="M12 4v3M12 17v3M4 12h3M17 12h3"/><circle cx="12" cy="12" r="1.5"/>',
    update: '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>',
    backup: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/>',
    power:  '<path d="M12 3v8"/><path d="M6.34 6.34a8 8 0 1 0 11.32 0"/>'
  };
  var CONTROLS = [
    ['/admin/live_modem_log.php', 'logs', 'Live logs', 'Follow the MMDVMHost log as it is written.'],
    ['/admin/configure.php', 'config', 'Configuration', 'Callsign, modes, frequencies, networks and Wi-Fi.'],
    ['/admin/expert/', 'expert', 'Expert editors', 'Edit the MMDVMHost and gateway config files directly.'],
    ['/admin/calibration.php', 'calib', 'Calibrate', 'Measure and set your modem\'s frequency offset.'],
    ['/admin/update.php', 'update', 'Update', 'Install the latest Pi-Star updates.'],
    ['/admin/config_backup.php', 'backup', 'Backup / restore', 'Save or restore your configuration.'],
    ['/admin/power.php', 'power', 'Power', 'Reboot or shut down the hotspot.']
  ];

  function optionalPanels() {
    return (cfg.dstarNet ? '<section class="panel" aria-label="D-Star CCS connections"><div id="ccs" class="frag"></div></section>' : '') +
      (cfg.pocsag ? '<section class="panel" aria-labelledby="pgTitle"><div class="panel-head"><h2 id="pgTitle">POCSAG pages</h2></div><div id="pages" class="frag"></div></section>' : '');
  }

  function buildLayout(root) {
    var tz = esc(cfg.tzAbbr || '');
    if (ADMIN) {
      root.innerHTML =
        '<main class="layout">' +
        '<div class="primary">' +
          '<section class="panel sys-panel" id="system" aria-labelledby="sysTitle" hidden>' +
            '<div class="panel-head"><h2 id="sysTitle">System</h2></div>' +
            '<div class="sys-grid"><dl class="kv" id="sysList"></dl><div id="sysServices"></div></div>' +
            '<p class="sys-alert" id="sysAlert" hidden></p>' +
          '</section>' +
          '<section class="panel" aria-labelledby="toolsTitle">' +
            '<div class="panel-head"><h2 id="toolsTitle">Network tools</h2></div>' +
            '<div id="liveSlot"></div>' +
            '<p class="empty" id="toolsEmpty">Nothing to manage for this setup. Talkgroup and link controls appear here ' +
              'when you use BrandMeister or TGIF, or the YSF, P25, NXDN, M17 or D-Star networks.</p>' +
          '</section>' +
          '<section class="panel" aria-labelledby="ctlTitle">' +
            '<div class="panel-head"><h2 id="ctlTitle">Controls</h2></div>' +
            '<div class="controls">' + CONTROLS.map(function (c) {
              return '<a class="control control-' + c[1] + '" href="' + c[0] + '">' +
                '<span class="control-icon" aria-hidden="true"><svg viewBox="0 0 24 24">' + ICON[c[1]] + '</svg></span>' +
                '<span class="control-text"><span class="control-title">' + c[2] + '</span>' +
                '<span class="control-desc">' + c[3] + '</span></span></a>';
            }).join('') + '</div>' +
          '</section>' +
          '<section class="panel" aria-labelledby="gwTitle"><div class="panel-head"><h2 id="gwTitle">Recent activity</h2>' +
            '<a class="panel-note" href="/live/">All activity on the dashboard</a></div><div id="gateway" class="activity"></div></section>' +
          optionalPanels() +
        '</div>' +
        '<aside class="secondary" aria-label="Hotspot status"><div id="status" class="contents"></div></aside>' +
        '</main>';
      return;
    }
    root.innerHTML =
      '<main class="layout">' +
      '<div class="primary">' +
        '<div id="liveSlot" class="contents"></div>' +
        '<section class="panel" aria-labelledby="gwTitle"><div class="panel-head"><h2 id="gwTitle">Gateway activity</h2>' +
          '<span class="panel-note">Last 100 calls' + (tz ? ', times in ' + tz : '') + '</span></div><div id="gateway" class="activity activity-scroll" tabindex="0" aria-label="Gateway activity, scrollable"></div></section>' +
        '<section class="panel" aria-labelledby="rfTitle"><div class="panel-head"><h2 id="rfTitle">Local RF activity</h2></div><div id="localrf" class="activity"></div></section>' +
        optionalPanels() +
      '</div>' +
      '<aside class="secondary" aria-label="Hotspot status">' +
        '<div id="status" class="contents"></div>' +
        '<section class="card" id="system" aria-labelledby="sysTitle" hidden><h2 id="sysTitle">System</h2>' +
          '<dl class="kv" id="sysList"></dl><div id="sysServices"></div><p class="sys-alert" id="sysAlert" hidden></p></section>' +
      '</aside>' +
      '</main>';
  }
  buildLayout($('liveRoot'));
  var lastData = null;
  var history = null;          // last 100 calls as events (data.php?history=1)
  var historyAt = 0;
  var historySig = '';         // newest call when the history was fetched
  var PHONE = window.matchMedia('(max-width: 640px)');
  var PHONE_LEN = 25;
  var showAll = false;

  $('gateway').addEventListener('click', function (e) {
    if (!e.target.closest('[data-show-all]')) return;
    showAll = true;
    render();
  });
  if (PHONE.addEventListener) PHONE.addEventListener('change', function () { render(); });

  /* ---------- Helpers ---------- */

  var fmtTime = new Intl.DateTimeFormat(undefined, { timeZone: cfg.tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  var fmtDay = new Intl.DateTimeFormat(undefined, { timeZone: cfg.tz, month: 'short', day: 'numeric' });
  function dayKey(d) { return fmtDay.format(d); }

  // Same thresholds as lh.php / localtx.php.
  function berClass(v) {
    var f = parseFloat(v);
    if (!v || isNaN(f) || f === 0) return '';
    if (f <= 1.9) return 'q-good';
    if (f <= 4.9) return 'q-warn';
    return 'q-bad';
  }
  function lossClass(v) {
    var f = parseFloat(v);
    if (!v || isNaN(f) || f < 1) return '';
    if (f === 1) return 'q-good';
    if (f <= 3) return 'q-warn';
    return 'q-bad';
  }

  /* ---------- Status cards (stock repeater info) ---------- */

  var STATE_TIP = { fault: 'Enabled, but its service is not running' };

  function renderStatus(sections) {
    var out = '';
    sections.forEach(function (sec) {
      var lamps = sec.items.filter(function (i) { return i.type === 'lamp'; });
      var rest = sec.items.filter(function (i) { return i.type !== 'lamp' && !(i.type === 'kv' && i.key === 'Trx'); });
      if (!lamps.length && !rest.length) return;
      out += '<section class="card"><h2>' + esc(sec.title) + '</h2>';
      if (lamps.length) {
        out += '<ul class="lamps">' + lamps.map(function (l) {
          var st = l.state || 'off';
          var tip = STATE_TIP[st] ? ' title="' + STATE_TIP[st] + '"' : '';
          return '<li class="is-' + st + '"' + tip + '><span>' + esc(l.text) + '</span></li>';
        }).join('') + '</ul>';
      }
      if (rest.length) {
        out += '<dl class="kv">';
        rest.forEach(function (i) {
          var cls = i.state && i.state !== 'mode' ? ' class="is-' + i.state + '"' : '';
          if (i.type === 'sub') out += '</dl><h3>' + esc(i.text) + '</h3><dl class="kv">';
          else if (i.type === 'value') out += '<dd class="full' + (i.state ? ' is-' + i.state : '') + '">' + esc(i.text) + '</dd>';
          else out += '<dt>' + esc(i.key) + '</dt><dd' + cls + '>' + esc(i.text) + '</dd>';
        });
        out += '</dl>';
      }
      out += '</section>';
    });
    $('status').innerHTML = out.replace(/<dl class="kv"><\/dl>/g, '');
  }

  /* ---------- Activity lists ---------- */

  function durCell(r) {
    if (r.live) return '<span class="pill ' + (r.src === 'RF' ? 'pill-rx' : 'pill-tx') + '">On air ' + liveText(r) + '</span>';
    if (r.dur === 'DMR Data' || r.dur === 'POCSAG Data') return '<span class="pill pill-data">' + esc(r.dur) + '</span>';
    return esc(r.dur);
  }

  function renderList(el, rows, local) {
    if (!rows.length) {
      el.innerHTML = '<p class="empty">' + (local ? 'No calls received over RF yet.' : 'No calls yet. Activity appears here as it happens.') + '</p>';
      return;
    }
    var today = dayKey(now());
    var head = '<thead><tr><th>Time</th><th>Callsign</th><th>Target</th><th>Mode</th><th>Source</th><th class="num">Dur (s)</th>' +
      (local ? '' : '<th class="num">Loss</th>') + '<th class="num">BER</th>' + (local ? '<th>RSSI</th>' : '') + '</tr></thead>';
    var body = rows.map(function (r) {
      var t = utc(r.time);
      var day = dayKey(t);
      var when = '<td class="when c-when">' + fmtTime.format(t) + (day !== today ? '<small>' + esc(day) + '</small>' : '') + '</td>';
      var special = r.live || r.dur === 'DMR Data' || r.dur === 'POCSAG Data';
      var src = r.src === 'RF' ? '<span class="src-rf">RF</span>' : esc(r.src);
      var cells = when +
        '<td class="call c-call">' + callHtml(r, true) + '</td>' +
        '<td class="c-target">' + esc(targetLabel(r.target)) + '</td>' +
        '<td class="mode c-x">' + esc(modeLabel(r.mode)) + '</td>' +
        '<td class="c-x">' + src + '</td>';
      if (special) {
        cells += '<td class="num c-x" colspan="' + (local ? 2 : 3) + '">' + durCell(r) + '</td>';
      } else {
        cells += '<td class="num c-x">' + esc(r.dur) + '</td>' +
          (local ? '' : '<td class="num c-x ' + lossClass(r.loss) + '">' + esc(r.loss) + '</td>') +
          '<td class="num c-x ' + berClass(r.ber) + '">' + esc(r.ber) + '</td>';
      }
      if (local) cells += '<td class="rssi c-x">' + esc(r.rssi) + '</td>';

      // Compact summary used only by the narrow-screen layout.
      var meta = '<span>' + esc(modeLabel(r.mode)) + '</span><span>' + src + '</span>';
      if (special) meta += durCell(r);
      else {
        meta += '<span data-k="Dur">' + esc(r.dur) + 's</span>';
        if (!local && r.loss) meta += '<span data-k="Loss" class="' + lossClass(r.loss) + '">' + esc(r.loss) + '</span>';
        if (r.ber) meta += '<span data-k="BER" class="' + berClass(r.ber) + '">' + esc(r.ber) + '</span>';
      }
      if (local && r.rssi) meta += '<span class="rssi">' + esc(r.rssi) + '</span>';
      cells += '<td class="c-meta">' + meta + '</td>';

      return '<tr' + (r.live ? ' class="is-live"' : '') + '>' + cells + '</tr>';
    }).join('');
    el.innerHTML = '<table class="act">' + head + '<tbody>' + body + '</tbody></table>';
  }

  /* ---------- Render + polling ---------- */

  function render() {
    if (!lastData) return;
    var sections = U.parseRepeaterInfo(lastData.repeaterInfo || '');
    var rows = lastData.lastHeard || [];
    renderStatus(sections);
    var gw = $('gateway');
    var keep = gw.scrollTop;          // re-rendering must not jump the list back to the top
    var calls = ADMIN ? rows.slice(0, ADMIN_RECENT) : (history || rows.slice(0, LIST_LEN));
    // Phones show the list in the page (no inner scroll box): newest few, then "Show all".
    var cut = !ADMIN && !showAll && PHONE.matches && calls.length > PHONE_LEN;
    renderList(gw, cut ? calls.slice(0, PHONE_LEN) : calls, false);
    if (cut) gw.insertAdjacentHTML('beforeend', '<button type="button" class="show-all" data-show-all>Show all ' + calls.length + ' calls</button>');
    gw.scrollTop = keep;
    if ($('localrf')) renderList($('localrf'), rows.filter(function (r) { return r.src === 'RF' && VOICE_MODES.test(r.mode); }).slice(0, LIST_LEN), true);
  }

  // Re-render between polls so live counters tick smoothly.
  setInterval(function () {
    if (lastData && lastData.lastHeard && lastData.lastHeard.some(function (r) { return r.live; })) render();
  }, 1000);

  // Identifies the newest call and whether it's still on air.
  function callSig(rows) {
    var r = rows && rows[0];
    return r ? [r.time, r.call, r.mode, r.live, r.dur].join('|') : '';
  }
  function wantHistory() {
    if (ADMIN) return false;           // Admin shows only recent calls
    return !history || Date.now() - historyAt > HISTORY_MS ||
      (lastData && callSig(lastData.lastHeard) !== historySig);
  }

  shell.subscribe(function (data) {
    lastData = data;
    if (data.history) {
      history = data.history;
      historyAt = Date.now();
      historySig = callSig(data.lastHeard);
    }
    render();
  }, { fast: true, wantHistory: wantHistory });

  function fragment(id, url, every) {
    var el = $(id);
    if (!el) return;
    (function load() {
      if (document.hidden) { setTimeout(load, every); return; }
      fetch(url, { cache: 'no-store' })
        .then(function (res) { return res.ok ? res.text() : ''; })
        .then(function (html) {
          // Stock fragments are server-escaped; drop any script just in case.
          el.innerHTML = html.replace(/<script[\s\S]*?<\/script>/gi, '');
          var sec = el.closest('.panel');
          if (sec) sec.hidden = !el.textContent.trim();
        })
        .catch(function () {})
        .then(function () { setTimeout(load, every); });
    })();
  }

  /* ---------- System health ---------- */

  var SYS_MS = 10000;

  function uptimeText(s) {
    var d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
    if (d) return d + ' d ' + h + ' h';
    if (h) return h + ' h ' + m + ' min';
    return m + ' min';
  }
  function pctClass(p, warn, bad) { return p >= bad ? 'is-fault' : p >= warn ? 'is-warn' : 'is-on'; }
  function row(key, value, cls, meterPct) {
    var textCls = cls === 'is-on' ? '' : cls;   // healthy values stay plain; the meter carries the colour
    return '<dt>' + key + '</dt><dd' + (textCls ? ' class="' + textCls + '"' : '') + '>' + value +
      (meterPct != null ? '<span class="meter"><i class="' + cls + '" style="width:' + Math.min(100, Math.max(2, meterPct)) + '%"></i></span>' : '') + '</dd>';
  }

  function renderSystem(s) {
    var html = '';
    // Admin only: the host details the stock admin panel showed.
    if (s.host) {
      html += row('Hostname', esc(s.host.name), '');
      if (s.host.platform) html += row('Platform', esc(s.host.platform), '');
      if (s.host.kernel) html += row('Kernel', esc(s.host.kernel), '');
      if (s.host.ip) html += row('IP address', esc(s.host.ip), '');
    }
    if (s.tempC != null) {
      var f = Math.round((s.tempC * 9 / 5 + 32) * 10) / 10;
      var tc = s.tempC >= 69 ? 'is-fault' : s.tempC >= 50 ? 'is-warn' : 'is-on';
      html += row('CPU temp', s.tempC.toFixed(1) + '°C / ' + f.toFixed(1) + '°F', tc, s.tempC / 85 * 100);
    }
    if (s.load) {
      var per = s.load[0] / (s.cores || 1) * 100;
      html += row('CPU load', s.load.map(function (v) { return v.toFixed(2); }).join(' / '), pctClass(per, 70, 100), per);
    }
    if (s.memUsedPct != null) html += row('Memory', s.memUsedPct + '% of ' + s.memTotalMB + ' MB', pctClass(s.memUsedPct, 80, 92), s.memUsedPct);
    if (s.diskUsedPct != null) html += row('Disk', s.diskFreeGB + ' GB free', pctClass(s.diskUsedPct, 85, 95), s.diskUsedPct);
    if (s.uptime != null) html += row('Uptime', uptimeText(s.uptime), '');
    $('sysList').innerHTML = html;

    var svc = '';
    if (s.services) {
      svc = '<h3>Services</h3><ul class="lamps lamps-list">' + s.services.map(function (x) {
        // Only MMDVMHost being down matters in MMDVMHost mode; the rest are optional.
        var st = x.running ? 'on' : (x.critical ? 'fault' : 'off');
        return '<li class="is-' + st + '" title="' + (x.running ? 'Running' : 'Not running') + '"><span>' + esc(x.name) + '</span></li>';
      }).join('') + '</ul>';
    }
    $('sysServices').innerHTML = svc;

    var alert = $('sysAlert'), p = s.power;
    if (p && (p.underVoltageNow || p.throttledNow)) {
      alert.className = 'sys-alert is-fault';
      alert.textContent = p.underVoltageNow
        ? 'Under-voltage right now. Use a stronger power supply or a shorter USB cable; low voltage can corrupt the SD card.'
        : 'The CPU is being throttled right now, usually from heat.';
      alert.hidden = false;
    } else if (p && (p.underVoltageSeen || p.throttledSeen)) {
      alert.className = 'sys-alert';
      alert.textContent = (p.underVoltageSeen ? 'Under-voltage' : 'CPU throttling') + ' has happened since the last reboot.';
      alert.hidden = false;
    } else {
      alert.hidden = true;
    }
    $('system').hidden = false;
  }

  (function loadSystem() {
    if (document.hidden) { setTimeout(loadSystem, SYS_MS); return; }
    fetch('/live/sys.php' + (ADMIN ? '?services=1' : ''), { cache: 'no-store' })
      .then(function (res) { if (!res.ok) throw new Error(res.status); return res.json(); })
      .then(renderSystem)
      .catch(function () {})
      .then(function () { setTimeout(loadSystem, SYS_MS); });
  })();

  document.dispatchEvent(new CustomEvent('pistar-live:mounted', { detail: { slot: $('liveSlot') } }));

  if (cfg.dstarNet) fragment('ccs', '/dstarrepeater/css_connections.php', CCS_MS);
  if (cfg.pocsag) fragment('pages', '/mmdvmhost/pages.php', PAGES_MS);
})();
