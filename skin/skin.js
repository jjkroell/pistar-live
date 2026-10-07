/*
 * Pi-Star skin helper, injected into every stock page by nginx.
 *  - theme (shared with /live/), current-page link, theme toggle
 *  - Configuration: sticky "Apply changes" bar for the main settings form
 *  - Admin: swaps the stock dashboard for the /live/ layout, keeping every
 *    admin tool (talkgroup, reflector and link managers) working in place.
 */
(function () {
  'use strict';
  var LIVE_V = '4';   // bump with /live/app.css or app.js changes (cache)
  var root = document.documentElement;
  try { var t = localStorage.getItem('live-theme'); if (t) root.dataset.theme = t; } catch (e) {}

  function each(list, fn) { Array.prototype.forEach.call(list, fn); }

  /* ---------- Header: current page + theme toggle ---------- */

  function header() {
    if (/\/admin\/wifi\.php/.test(location.pathname)) document.body.classList.add('ps-wifi');

    var bar = document.querySelector('.header p');
    if (!bar) return;
    var here = location.pathname.replace(/\/index\.php$/, '/');
    each(bar.querySelectorAll('a'), function (a) {
      var p = a.pathname && a.pathname.replace(/\/index\.php$/, '/');
      if (p && p === here && a.protocol !== 'javascript:') a.setAttribute('aria-current', 'page');
    });

    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'ps-theme';
    b.setAttribute('aria-label', 'Switch colour theme');
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z"/></svg>';
    b.addEventListener('click', function () {
      var dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
      root.dataset.theme = dark ? 'light' : 'dark';
      try { localStorage.setItem('live-theme', root.dataset.theme); } catch (e) {}
      // Keep the embedded Wi-Fi panel in step.
      each(document.querySelectorAll('iframe'), function (f) {
        try { f.contentDocument.documentElement.dataset.theme = root.dataset.theme; } catch (e) {}
      });
    });
    bar.appendChild(b);
  }

  /* ---------- Settings pages: one sticky apply bar ---------- */

  // Replaces the repeated static "Apply Changes" buttons with a single bar
  // that clicks one of Pi-Star's own (now hidden) buttons, so the submit
  // works exactly as before: same onclick, same submitted name/value.
  function applyBar(form, buttons) {
    if (!form || !buttons.length) return;
    var stock = buttons[0];

    buttons.forEach(function (btn) {
      btn.classList.add('ps-static-apply');
      // Configuration wraps each button in its own <div>; hide that too.
      var wrap = btn.parentElement;
      if (wrap && wrap !== form && wrap.tagName === 'DIV' && wrap.querySelectorAll('input, button, select, textarea').length === 1) {
        wrap.classList.add('ps-static-apply');
      }
    });

    var bar = document.createElement('div');
    bar.className = 'ps-applybar';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Save settings');
    bar.innerHTML = '<span class="ps-applybar-msg" aria-live="polite">No unsaved changes</span>' +
      '<button type="button" class="ps-applybar-btn"></button>';
    var btn = bar.querySelector('button');
    var msg = bar.querySelector('.ps-applybar-msg');
    var label = stock.value || 'Apply Changes';
    btn.textContent = label;
    form.appendChild(bar);

    // Saving makes the Pi rewrite its config and restart services, which can
    // take a while on a Pi Zero. Show that at once and ignore repeat clicks:
    // a second click would send the form again on the expert editors.
    var busy = false;
    function setBusy(on) {
      busy = on;
      bar.classList.toggle('is-busy', on);
      btn.disabled = on;
      btn.textContent = on ? 'Applying…' : label;
      if (on) msg.textContent = 'Saving and restarting services. This can take up to a minute.';
    }
    btn.addEventListener('click', function () {
      if (busy) return;
      setBusy(true);
      if (stock.type === 'submit') {
        // A submit button can be stopped by form validation; only stay busy if the form really went.
        var sent = false;
        var onSubmit = function () { sent = true; };
        form.addEventListener('submit', onSubmit, { once: true });
        stock.click();
        setTimeout(function () {
          form.removeEventListener('submit', onSubmit);
          if (!sent) { setBusy(false); msg.textContent = 'Check the highlighted field, then apply again.'; }
        }, 0);
      } else {
        stock.click();   // Pi-Star's submitform(): disables its buttons and submits
      }
    });
    // Coming back with the browser's Back button can restore this page from cache mid-save.
    window.addEventListener('pageshow', function (e) { if (e.persisted) setBusy(false); });

    function dirty() {
      if (busy) return;
      bar.classList.add('is-dirty');
      msg.textContent = 'You have unsaved changes';
    }
    form.addEventListener('input', dirty);
    form.addEventListener('change', dirty);
    // The on/off switches are labels driving hidden checkboxes; keyboard
    // toggling sets .checked without an event, so watch the labels too.
    each(form.querySelectorAll('.switch label'), function (l) {
      l.addEventListener('keydown', function (e) { if (e.key === ' ' || e.key === 'Enter') dirty(); });
    });
  }

  function settingsPages() {
    var path = location.pathname;
    if (/\/admin\/configure\.php$/.test(path)) {
      var cfgForm = document.getElementById('config');
      if (cfgForm) applyBar(cfgForm, [].slice.call(cfgForm.querySelectorAll('input[type="button"][onclick*="submitform"]')));
    } else if (/\/admin\/expert\/(edit|fulledit)_[\w-]+\.php$/.test(path)) {
      // Each editor has one settings form; its Apply button is repeated per section.
      each(document.querySelectorAll('form'), function (f) {
        var subs = [].slice.call(f.querySelectorAll('input[type="submit"]'));
        if (!subs.length) return;
        var same = subs.every(function (x) { return x.value === subs[0].value && x.name === subs[0].name; });
        if (same) applyBar(f, subs);
      });
    }
  }

  /* ---------- Power and Backup: icon buttons ---------- */

  var ACTIONS = {
    reboot:   { title: 'Reboot', desc: 'Restarts the hotspot. It is back on the air in about 90 seconds.',
                icon: '<path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/>' },
    shutdown: { title: 'Shut down', desc: 'Powers the Pi off safely. Unplug and reconnect power to start it again.',
                icon: '<path d="M12 3v8"/><path d="M6.34 6.34a8 8 0 1 0 11.32 0"/>' },
    download: { title: 'Download backup', desc: 'Saves your configuration to a zip file. Passwords are not included.',
                icon: '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>' },
    update:   { title: 'Start update', desc: 'Takes several minutes. Keep the hotspot powered on until it finishes.',
                icon: '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>' },
    upgrade:  { title: 'Start upgrade', desc: 'Takes several minutes. Keep the hotspot powered on until it finishes.',
                icon: '<path d="M12 20V9"/><path d="m7 14 5-5 5 5"/><path d="M5 4h14"/>' },
    restore:  { title: 'Restore backup', desc: 'Choose a backup zip below first. This replaces your current configuration.',
                icon: '<path d="M12 20V9"/><path d="m7 14 5-5 5 5"/><path d="M5 4h14"/>' }
  };

  function actionButtons() {
    each(document.querySelectorAll('button[name="action"], button[name="confirm_update"]'), function (b) {
      var key = b.name === 'confirm_update'
        ? (/upgrade/.test(location.pathname) ? 'upgrade' : 'update')
        : b.value;
      var a = ACTIONS[key];
      if (!a || !b.querySelector('img')) return;
      var cell = b.parentNode;
      // Drop the stock caption ("Reboot<br>") that sat right above the image,
      // but keep any explanatory paragraph (Update/Upgrade).
      while (b.previousSibling && (b.previousSibling.nodeType === 3 || b.previousSibling.nodeName === 'BR')) {
        cell.removeChild(b.previousSibling);
      }
      if (b.nextSibling && b.nextSibling.nodeName === 'BR') cell.removeChild(b.nextSibling);
      b.removeAttribute('style');
      b.className = 'ps-action ps-action-' + key;
      b.innerHTML = '<span class="ps-action-icon" aria-hidden="true"><svg viewBox="0 0 24 24">' + a.icon + '</svg></span>' +
        '<span class="ps-action-text"><span class="ps-action-title">' + a.title + '</span>' +
        '<span class="ps-action-desc">' + a.desc + '</span></span>';
      // Restore's file picker sits under its button, with a label.
      var file = cell.querySelector('input[type="file"]');
      if (file) {
        var label = document.createElement('label');
        label.className = 'ps-file';
        label.htmlFor = file.id;
        label.textContent = 'Backup file';
        b.insertAdjacentElement('afterend', file);
        b.insertAdjacentElement('afterend', label);
      }
    });
  }

  /* ---------- Admin: live layout ---------- */

  function adminLayout() {
    if (!/^\/admin\/(index\.php)?$/.test(location.pathname)) return;
    var nav = document.querySelector('.container > .nav');
    var content = document.querySelector('.container > .content');
    var headerEl = document.querySelector('.container > .header');
    // Only the MMDVMHost dashboard has this shape; leave anything else stock.
    if (!nav || !content || !headerEl || !document.getElementById('repeaterInfo')) return;

    var replaced = ['lastHerd', 'localTxs', 'Pages', 'cssConnects'];
    var tools = [];
    each(content.children, function (el) {
      if (el.tagName === 'SCRIPT' || el.tagName === 'BR') return;
      if (replaced.indexOf(el.id) !== -1) return;
      tools.push(el);
    });

    var sys = document.getElementById('sysInfo');
    var sysWrap = sys && sys.closest('.contentwide');

    fetch('/live/cfg.php', { cache: 'no-store', credentials: 'same-origin' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (cfg) {
        var mount = document.createElement('div');
        mount.id = 'liveRoot';
        mount.className = 'ps-embed';
        headerEl.insertAdjacentElement('afterend', mount);

        document.addEventListener('pistar-live:mounted', function (e) {
          var slot = e.detail.slot;
          if (tools.length && slot) {
            var panel = document.createElement('section');
            panel.className = 'panel ps-tools';
            panel.setAttribute('aria-label', 'Network tools');
            tools.forEach(function (el) { panel.appendChild(el); });
            slot.appendChild(panel);
            // Some tools (e.g. BrandMeister links) are empty until their own
            // refresh fills them; show the panel only when there is something in it.
            var sync = function () {
              panel.hidden = !panel.textContent.trim() && !panel.querySelector('input, select, button, table, img');
            };
            sync();
            new MutationObserver(sync).observe(panel, { childList: true, subtree: true, characterData: true });
          }
          // Stop the stock refresh loops this layout replaces (each reschedules
          // itself by name, so a no-op ends the loop after its current tick).
          ['reloadRepeaterInfo', 'reloadLocalTx', 'reloadLastHerd', 'reloadPages', 'reloadcssConnections', 'reloadSysInfo']
            .forEach(function (fn) { if (typeof window[fn] === 'function') window[fn] = function () {}; });
          nav.hidden = true;
          content.hidden = true;
          if (sysWrap) sysWrap.hidden = true;
          document.body.classList.add('ps-admin-live');
        }, { once: true });

        window.PISTAR_LIVE = { cfg: cfg, services: true };
        var css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = '/live/app.css?v=' + LIVE_V;
        document.head.appendChild(css);
        var js = document.createElement('script');
        js.src = '/live/app.js?v=' + LIVE_V;
        document.body.appendChild(js);
      })
      .catch(function () { /* leave the stock admin page as it is */ });
  }

  function ready() {
    header();
    settingsPages();
    actionButtons();
    adminLayout();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
})();
