/*!
 * TRPL Popup runtime — Theodore Roosevelt Presidential Library
 * https://popup.labs.trlibrary.com/popup.js
 *
 * Loaded once per page by Google Tag Manager:
 *   <script async src="https://popup.labs.trlibrary.com/popup.js"></script>
 *
 * Each pop-up is registered by its own GTM tag (snippet produced by the builder):
 *   (window.TRPLPopup = window.TRPLPopup || []).push(["register", { ...settings... }]);
 *
 * Pop-up settings are data. This script never evaluates code from a pop-up.
 * Test switches (any page URL): ?trplpop_debug=1  ?trplpop_clear=1  ?trplpop_off=1
 *                               ?trplpop_preview=<id of a registered pop-up>
 */
(function (win, doc) {
  "use strict";

  var VERSION = "1.0.0";
  var prior = win.TRPLPopup;
  if (prior && prior.__trplpop) return;                       // already running
  var backlog = prior && prior.length ? [].slice.call(prior) : [];

  /* ------------------------------------------------------------------ */
  /* Guards                                                              */
  /* ------------------------------------------------------------------ */
  var ALLOWED_HOST = /(^|\.)trlibrary\.com$|^localhost$|^127\.0\.0\.1$|^theodore-roosevelt-presidential-library\.github\.io$/i;
  var qs = parseQuery(win.location.search);
  var hostOk = ALLOWED_HOST.test(win.location.hostname);
  var OFF = !hostOk || qs.trplpop_off === "1";

  var site = {
    fixedTop: ["#top-header"],                 // fixed elements a top banner must push down
    ticketAlert: "#trpl-float",                // ticket sell-out alert (takes priority)
    ticketAlertScript: "trpl-float",           // substring of its script src
    chatLauncher: "button.deyra-chatbot-button",
    chatPanel: "#deyra-chat-modal",
    chatLiftVar: "--deyra-btn-vertical-offset",
    mobileMax: 600,
    tabletMax: 1024,
    sessionOverlayCap: 0,                      // 0 = no cap on pop-ups/takeovers per visit
    quietHoursAfterClose: 0,                   // 0 = no site-wide quiet period
    fontsCss: "",
    timezone: "America/Denver",
    debug: qs.trplpop_debug === "1"
  };

  var FONT_DISPLAY = "'Dharma Gothic E','dharma-gothic-e','Dharma Gothic','Arial Narrow',Impact,sans-serif";
  var FONT_BODY = "'ITC Clearface','itc-clearface','Clearface',Georgia,serif";
  var FONT_UI = "Frutiger,'Frutiger Next','Frutiger Next Pro','frutiger-next','Helvetica Neue',Arial,sans-serif";

  var Z_OVERLAY = 2147483000, Z_TOP = 100000, Z_BOTTOM = 99990, Z_CORNER = 99995;

  function bare() { return Object.create(null); }
  var campaigns = bare();      // id -> settings
  var order = [];              // registration order
  var instances = bare();      // id -> live instance
  var zoneBusy = bare();       // zone -> id currently showing
  var zoneUsed = bare();       // zone -> true once used on this page view
  var shownThisPage = bare();
  var armed = bare();          // id -> true once triggers are attached
  var ID_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;
  var previewSeq = 0;
  var waiting = [];            // requests held back by neighbours
  var batch = [], batchTimer = null;
  var listeners = {};
  var cleanups = [];           // trigger teardown fns
  var started = false, bootAt = now();
  var floatSeenExpectedAt = 0, floatSettledByEvent = false;
  var tickTimer = null;

  /* ------------------------------------------------------------------ */
  /* Small utilities                                                     */
  /* ------------------------------------------------------------------ */
  function now() { return new Date().getTime(); }
  function log() {
    if (!site.debug || !win.console) return;
    var a = ["[TRPLPopup]"].concat([].slice.call(arguments));
    try { win.console.log.apply(win.console, a); } catch (e) {}
  }
  function parseQuery(s) {
    var out = bare(); s = (s || "").replace(/^\?/, "");
    if (!s) return out;
    var parts = s.split("&");
    for (var i = 0; i < parts.length; i++) {
      var eq = parts[i].indexOf("=");
      var key = eq < 0 ? parts[i] : parts[i].slice(0, eq), val = eq < 0 ? "" : parts[i].slice(eq + 1);
      try { out[decodeURIComponent(key)] = decodeURIComponent(val.replace(/\+/g, " ")); } catch (e) {}
    }
    return out;
  }
  function isArr(a) { return Object.prototype.toString.call(a) === "[object Array]"; }
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function vw() { return win.innerWidth || doc.documentElement.clientWidth; }
  function vh() { return win.innerHeight || doc.documentElement.clientHeight; }
  function device() {
    var w = vw();
    return w <= site.mobileMax ? "phone" : (w <= site.tabletMax ? "tablet" : "desktop");
  }
  function q(sel) { try { return sel ? doc.querySelector(sel) : null; } catch (e) { return null; } }

  /* Canonical serialisation + checksum. GTM minifies Custom HTML, so the check
     is made on the parsed settings, never on the pasted text. */
  function stable(v) {
    if (v === null || typeof v !== "object") return JSON.stringify(v);
    if (isArr(v)) {
      var a = [];
      for (var i = 0; i < v.length; i++) a.push(stable(v[i] === undefined ? null : v[i]));
      return "[" + a.join(",") + "]";
    }
    var keys = [], k;
    for (k in v) if (Object.prototype.hasOwnProperty.call(v, k) && k !== "_c" && v[k] !== undefined) keys.push(k);
    keys.sort();
    var o = [];
    for (var j = 0; j < keys.length; j++) o.push(JSON.stringify(keys[j]) + ":" + stable(v[keys[j]]));
    return "{" + o.join(",") + "}";
  }
  function checksum(cfg) {
    var s = stable(cfg), h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h.toString(36) + "-" + s.length.toString(36);
  }

  /* URL and HTML safety ------------------------------------------------ */
  function safeUrl(u, kinds) {
    u = String(u == null ? "" : u).replace(/^\s+|\s+$/g, "");
    if (!u) return "";
    kinds = kinds || "link";
    if (/^https:\/\//i.test(u)) return u;
    if (/^\/(?!\/)/.test(u)) return u;                       // site-relative
    if (kinds === "link") {
      if (/^#/.test(u)) return u;
      if (/^mailto:[^\s]+$/i.test(u)) return u;
      if (/^tel:[+0-9().\-\s]+$/i.test(u)) return u;
    }
    return "";
  }
  var ALLOWED_TAGS = { P: 1, BR: 1, B: 1, STRONG: 1, I: 1, EM: 1, A: 1, UL: 1, OL: 1, LI: 1, SPAN: 1 };
  function sanitizeInto(target, html) {
    var tpl = doc.createElement("template");
    tpl.innerHTML = String(html == null ? "" : html);
    var src = tpl.content || tpl;
    (function walk(from, to) {
      for (var n = from.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === 3) { to.appendChild(doc.createTextNode(n.nodeValue)); continue; }
        if (n.nodeType !== 1) continue;
        var tag = n.tagName.toUpperCase();
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "IFRAME" || tag === "OBJECT" || tag === "TEMPLATE") continue;
        if (!ALLOWED_TAGS[tag]) { walk(n, to); continue; }   // unwrap unknown tags, keep their text
        var el = doc.createElement(tag.toLowerCase());
        if (tag === "A") {
          var href = safeUrl(n.getAttribute("href"));
          if (!href) { walk(n, to); continue; }
          el.setAttribute("href", href);
          if (/^https:\/\//i.test(href) && !sameSite(href)) { el.setAttribute("target", "_blank"); el.setAttribute("rel", "noopener"); }
        }
        walk(n, el);
        to.appendChild(el);
      }
    })(src, target);
  }
  function sameSite(href) {
    var a = doc.createElement("a"); a.href = href;
    return /(^|\.)trlibrary\.com$/i.test(a.hostname) || a.hostname === win.location.hostname;
  }

  /* ------------------------------------------------------------------ */
  /* Visitor state: one compact first-party cookie + session storage     */
  /* ------------------------------------------------------------------ */
  var COOKIE = "trplpop", EPOCH = 1767225600000;              // 2026-01-01T00:00:00Z
  function mins(t) { return Math.max(0, Math.round(((t || now()) - EPOCH) / 60000)); }
  function unmins(m) { return m * 60000 + EPOCH; }
  function cookieDomain() {
    return /(^|\.)trlibrary\.com$/i.test(win.location.hostname) ? "; domain=.trlibrary.com" : "";
  }
  function readRaw() {
    var m = doc.cookie.match(/(?:^|;\s*)trplpop=([^;]*)/);
    var v = m ? m[1] : "";
    if (!v) { try { v = win.localStorage.getItem(COOKIE) || ""; } catch (e) {} }
    try { return decodeURIComponent(v); } catch (e2) { return ""; }
  }
  function loadState() {
    var raw = readRaw(), st = bare();
    if (raw.indexOf("1!") !== 0) return st;
    var parts = raw.slice(2).split("!");
    for (var i = 0; i < parts.length; i++) {
      var f = parts[i].split("~");
      if (!f[0]) continue;
      st[f[0]] = { s: parseInt(f[1], 36) || 0, c: parseInt(f[2], 36) || 0, v: parseInt(f[3], 36) || 0 };
    }
    return st;
  }
  function saveState(st) {
    var ids = [], k;
    for (k in st) if (Object.prototype.hasOwnProperty.call(st, k)) ids.push(k);
    ids.sort(function (a, b) {
      var x = st[a], y = st[b], ra = a in campaigns || a === "_g", rb = b in campaigns || b === "_g";
      if (ra !== rb) return ra ? -1 : 1;                       // history for live pop-ups is kept first
      return Math.max(y.s, y.c, y.v) - Math.max(x.s, x.c, x.v);
    });
    ids = ids.slice(0, 40);                                    // newest 40 keep the cookie small
    var out = [];
    for (var i = 0; i < ids.length; i++) {
      var e = st[ids[i]];
      out.push([ids[i], (e.s || 0).toString(36), (e.c || 0).toString(36), (e.v || 0).toString(36)].join("~"));
    }
    var val = encodeURIComponent("1!" + out.join("!"));
    try {
      doc.cookie = COOKIE + "=" + val + "; path=/; max-age=" + (400 * 86400) + "; SameSite=Lax" +
        (win.location.protocol === "https:" ? "; Secure" : "") + cookieDomain();
    } catch (e) {}
    try { win.localStorage.setItem(COOKIE, val); } catch (e2) {}
  }
  function clearState() {
    try {
      doc.cookie = COOKIE + "=; path=/; max-age=0" + cookieDomain();
      doc.cookie = COOKIE + "=; path=/; max-age=0";
    } catch (e) {}
    try { win.localStorage.removeItem(COOKIE); } catch (e2) {}
    try { win.sessionStorage.removeItem(COOKIE + "_s"); } catch (e3) {}
  }
  function mark(id, field) {
    var st = loadState();
    var e = st[id] || { s: 0, c: 0, v: 0 };
    e[field] = mins();
    st[id] = e;
    saveState(st);
  }
  function loadSession() {
    try { return JSON.parse(win.sessionStorage.getItem(COOKIE + "_s") || "{}") || {}; } catch (e) { return {}; }
  }
  function saveSession(s) { try { win.sessionStorage.setItem(COOKIE + "_s", JSON.stringify(s)); } catch (e) {} }

  function frequencyAllows(c) {
    var st = loadState(), e = st[c.id], f = c.freq || {}, t = now();
    var g = st._g;
    if (site.quietHoursAfterClose > 0 && g && g.c && t - unmins(g.c) < site.quietHoursAfterClose * 3600000) {
      return "site-wide quiet period after a close";
    }
    if (!e) return "";
    var conv = f.convert || { mode: "days", days: 365 };
    var close = f.close || { mode: "days", days: 30 };
    if (e.v) {
      if (conv.mode === "never") return "already converted (never show again)";
      if (t - unmins(e.v) < (conv.days || 365) * 86400000) return "converted within " + (conv.days || 365) + " days";
    }
    if (e.c) {
      if (close.mode === "never") return "closed before (never show again)";
      if (close.mode === "session") { if ((loadSession().closed || {})[c.id]) return "closed earlier this visit"; }
      else if (close.mode !== "always" && t - unmins(e.c) < (close.days == null ? 30 : close.days) * 86400000) {
        return "closed within " + (close.days == null ? 30 : close.days) + " days";
      }
    }
    return "";
  }

  /* ------------------------------------------------------------------ */
  /* Rules                                                               */
  /* ------------------------------------------------------------------ */
  function normPath(p) {
    p = String(p || "/");
    if (p.length > 1) p = p.replace(/\/+$/, "");
    return p || "/";
  }
  function strTest(op, value, hay) {
    var v = String(value == null ? "" : value).toLowerCase(), h = String(hay == null ? "" : hay).toLowerCase();
    switch (op) {
      case "is": return h === v;
      case "contains": return h.indexOf(v) !== -1;
      case "starts": return h.indexOf(v) === 0;
      case "ends": return v.length <= h.length && h.lastIndexOf(v) === h.length - v.length;
      case "regex": try { return new RegExp(String(value), "i").test(String(hay).slice(0, 300)); } catch (e) { return false; }
      case "empty": return h === "";
      case "exists": return hay != null;
    }
    return false;
  }
  function pathTest(cond, path) {
    if (!cond) return false;
    if (cond.op === "home") return path === "/";
    var raw = String(cond.v == null ? "" : cond.v);
    if (!raw) return false;                                    // an empty rule matches nothing
    if (cond.op === "regex") return strTest("regex", raw, path);
    if (cond.op === "starts" && raw.length > 1 && /\/$/.test(raw)) {
      // "/node/" means the folder: /node and /node/123, but not /nodes
      return strTest("starts", raw, path) || strTest("is", raw.slice(0, -1), path);
    }
    return strTest(cond.op, normPath(raw), path);
  }
  function condTest(cond, ctx) {
    if (!cond) return false;
    var r = false;
    switch (cond.t) {
      case "path": r = pathTest(cond, ctx.path); break;
      case "query":
        var has = (cond.k || "") in ctx.query;
        r = cond.op === "exists" ? has : (has && strTest(cond.op, cond.v, ctx.query[cond.k]));
        break;
      case "referrer": r = strTest(cond.op, cond.v, ctx.referrer); break;
      case "hash": r = strTest(cond.op, cond.v, ctx.hash); break;
    }
    return cond.not ? !r : r;
  }
  function context() {
    return {
      path: normPath(win.location.pathname),
      query: parseQuery(win.location.search),
      referrer: doc.referrer || "",
      hash: (win.location.hash || "").replace(/^#/, "")
    };
  }
  function setMatches(set, ctx) {
    set = set || {};
    var i, inc = set.include || [], exc = set.exclude || [], conds = set.conds || [];
    if (inc.length) {
      var any = false;
      for (i = 0; i < inc.length; i++) if (pathTest(inc[i], ctx.path)) { any = true; break; }
      if (!any) return false;
    }
    for (i = 0; i < exc.length; i++) if (pathTest(exc[i], ctx.path)) return false;
    if (conds.length) {
      var all = true, some = false;
      for (i = 0; i < conds.length; i++) { if (condTest(conds[i], ctx)) some = true; else all = false; }
      if (set.match === "any" ? !some : !all) return false;
    }
    return true;
  }
  function zoned(tz) {
    // Day of week (0 = Sunday) and minutes past midnight in the site's time zone.
    try {
      var parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
      var o = {};
      for (var i = 0; i < parts.length; i++) o[parts[i].type] = parts[i].value;
      var d = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[o.weekday];
      return { day: d, min: (parseInt(o.hour, 10) % 24) * 60 + parseInt(o.minute, 10) };
    } catch (e) {
      var n = new Date();
      return { day: n.getDay(), min: n.getHours() * 60 + n.getMinutes() };
    }
  }
  function hm(s) { var m = /^(\d{1,2}):(\d{2})$/.exec(s || ""); return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null; }
  function scheduleAllows(c) {
    var s = (c.rules || {}).schedule || {}, t = now();
    if (s.start && !isNaN(Date.parse(s.start)) && t < Date.parse(s.start)) return "before its start date";
    if (s.end && !isNaN(Date.parse(s.end)) && t > Date.parse(s.end)) return "past its end date";
    if ((s.days && s.days.length) || s.from || s.to) {
      var z = zoned(site.timezone);
      if (s.days && s.days.length) {
        var ok = false;
        for (var i = 0; i < s.days.length; i++) if (s.days[i] === z.day) ok = true;
        if (!ok) return "not scheduled for this day of the week";
      }
      var a = hm(s.from), b = hm(s.to);
      if (a != null && b != null) {
        var inside = a <= b ? (z.min >= a && z.min < b) : (z.min >= a || z.min < b);
        if (!inside) return "outside its scheduled hours";
      }
    }
    return "";
  }
  function deviceAllows(c) {
    var d = (c.rules || {}).devices;
    if (!d || !d.length) return "";
    var cur = device();
    for (var i = 0; i < d.length; i++) if (d[i] === cur) return "";
    return "not set to show on " + cur;
  }

  /* ------------------------------------------------------------------ */
  /* Events                                                              */
  /* ------------------------------------------------------------------ */
  function emit(name, inst, action) {
    var c = inst.c;
    var detail = {
      popup_id: c.id, popup_name: c.name || c.id, popup_format: formatLabel(c),
      popup_trigger: inst.trigger || "", popup_action: action || "", popup_variant: c.variant || ""
    };
    if (!inst.silent) {
      var dl = { event: "trpl_popup_" + name };
      for (var k in detail) dl[k] = detail[k];
      win.dataLayer = win.dataLayer || [];
      try { win.dataLayer.push(dl); } catch (e) {}
    }
    var short = { impression: "show", interaction: "action", conversion: "convert", close: "close" }[name];
    try {
      var ev;
      if (typeof win.CustomEvent === "function") ev = new win.CustomEvent("trplpopup:" + short, { detail: detail });
      else { ev = doc.createEvent("CustomEvent"); ev.initCustomEvent("trplpopup:" + short, false, false, detail); }
      doc.dispatchEvent(ev);
    } catch (e2) {}
    var ls = listeners[short] || [];
    for (var i = 0; i < ls.length; i++) { try { ls[i](detail); } catch (e3) {} }
  }
  function formatLabel(c) {
    if (c.format === "banner") return "banner-" + (c.position === "bottom" ? "bottom" : "top");
    return c.format;
  }

  /* ------------------------------------------------------------------ */
  /* Neighbours: ticket alert, chat launcher, fixed header               */
  /* ------------------------------------------------------------------ */
  function floatEl() { return q(site.ticketAlert); }
  function floatExpected() {
    if (win.__trplFloatLoaded) return true;
    try { return !!doc.querySelector('script[src*="' + site.ticketAlertScript + '"]'); } catch (e) { return false; }
  }
  function floatSettled() {
    if (floatSettledByEvent || floatEl()) return true;
    var t = now();
    if (floatExpected()) {
      if (!floatSeenExpectedAt) floatSeenExpectedAt = t;
      return t - floatSeenExpectedAt > 6000;                   // it loaded and decided to stay quiet
    }
    return t - bootAt > 600;                                   // no sign of it on this page
  }
  function chatOpen() {
    var p = q(site.chatPanel);
    if (!p) return false;
    if (typeof p.open === "boolean") return p.open;
    var r = p.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  function zoneOf(c) {
    if (c.format === "banner") return c.position === "bottom" ? "bottom" : "top";
    if (c.format === "slidein") return "corner";
    return "overlay";
  }
  /* Why a pop-up must wait right now, or "" if it may show. Ticket alert wins. */
  function blockedBy(c, alreadyShowing) {
    var z = zoneOf(c);
    if (z === "top" || z === "overlay") return "";
    var phone = vw() <= site.mobileMax;
    var caresAboutAlert = z === "bottom" || phone || c.position === "bottom-left";
    if (caresAboutAlert && !alreadyShowing && !floatSettled()) return "waiting to see whether the ticket alert appears";
    var f = floatEl();
    if (z === "bottom" && f) return "ticket alert is showing (bottom banner waits)";
    if (z === "corner") {
      if (f && phone) return "ticket alert is showing (slide-in waits on phones)";
      if (f && c.position === "bottom-left") return "ticket alert holds the lower-left corner";
      if (chatOpen()) return "chat panel is open";
    }
    return "";
  }
  function cornerOffset(inst) {
    var base = 16, L = q(site.chatLauncher), bb = instances[zoneBusy.bottom];
    if (bb && bb.visible && !bb.suspended) base += bb.height();
    if (inst.c.position !== "bottom-left" || vw() <= site.mobileMax) {
      if (L) {
        var r = L.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && r.bottom > vh() * 0.5 && r.right > vw() * 0.5) {
          base = Math.max(base, Math.round(vh() - r.top + 12));
        }
      }
    }
    return base;
  }

  var pushStyle = null, liftState = null;
  function reduceRule() {
    return "@media (prefers-reduced-motion:reduce){" + ["html"].concat(site.fixedTop).join(",") + "{transition:none !important}}";
  }
  function applyTopPush(h) {
    if (!pushStyle) { pushStyle = doc.createElement("style"); pushStyle.id = "trplpop-push"; doc.head.appendChild(pushStyle); }
    var css = "html{margin-top:" + h + "px !important;transition:margin-top .35s ease}";
    for (var i = 0; i < site.fixedTop.length; i++) {
      var el = q(site.fixedTop[i]);
      if (!el) continue;
      if (el.__trplpopTop == null) {
        // measured before our own rule touches it; re-checked later if it is not fixed yet
        var cs = win.getComputedStyle(el);
        if (cs.position === "fixed" || cs.position === "sticky") el.__trplpopTop = parseFloat(cs.top) || 0;
      }
      if (el.__trplpopTop == null) continue;
      css += site.fixedTop[i] + "{top:" + (el.__trplpopTop + h) + "px !important;transition:top .35s ease}";
    }
    css += reduceRule();
    if (pushStyle.textContent !== css) pushStyle.textContent = css;
  }
  function clearTopPush() {
    if (!pushStyle) return;
    var s = pushStyle; pushStyle = null;
    // restore fixed elements to their own top, animate, then remove the rule
    var css = "html{margin-top:0px !important;transition:margin-top .35s ease}";
    for (var i = 0; i < site.fixedTop.length; i++) {
      var el = q(site.fixedTop[i]);
      if (el && el.__trplpopTop != null) css += site.fixedTop[i] + "{top:" + el.__trplpopTop + "px !important;transition:top .35s ease}";
    }
    s.textContent = css + reduceRule();
    setTimeout(function () { if (s.parentNode) s.parentNode.removeChild(s); }, 400);
  }
  function applyBottomLift(h) {
    var L = q(site.chatLauncher);
    if (!L || !site.chatLiftVar) return;
    if (!liftState || liftState.el !== L) {
      var cur = L.style.getPropertyValue(site.chatLiftVar);
      liftState = { el: L, orig: cur, base: parseFloat(cur) || 0 };
    }
    var want = (liftState.base + h) + "px";
    if (L.style.getPropertyValue(site.chatLiftVar) !== want) L.style.setProperty(site.chatLiftVar, want);
  }
  function clearBottomLift() {
    if (!liftState) return;
    try {
      if (liftState.orig) liftState.el.style.setProperty(site.chatLiftVar, liftState.orig);
      else liftState.el.style.removeProperty(site.chatLiftVar);
    } catch (e) {}
    liftState = null;
  }

  /* ------------------------------------------------------------------ */
  /* Rendering                                                           */
  /* ------------------------------------------------------------------ */
  function css(c) {
    var t = c.theme || {};
    var bg = colour(t.bg, "#FFFFFF"), text = colour(t.text, "#25282A"), head = colour(t.head, text);
    var bb = colour(t.btnBg, "#E7805D"), bt = colour(t.btnText, "#25282A");
    var scrim = unit(t.scrim, 0.62), tint = unit(t.imageTint, 0.72);
    return [
      ":host{all:initial}",
      "*{box-sizing:border-box}",
      ".wrap{font-family:" + FONT_BODY + ";color:" + text + ";line-height:1.5;font-size:17px;-webkit-font-smoothing:antialiased}",
      ".box{background:" + bg + ";color:" + text + ";position:relative}",
      ".head{font-family:" + FONT_DISPLAY + ";text-transform:uppercase;letter-spacing:.03em;line-height:1.02;color:" + head + ";margin:0 0 .35em;font-weight:700}",
      ".eyebrow{font-family:" + FONT_UI + ";font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;margin:0 0 .6em}",
      ".body{margin:0 0 1em}.body p{margin:0 0 .7em}.body p:last-child{margin-bottom:0}.body ul,.body ol{margin:0 0 .7em 1.2em;padding:0}",
      ".body a{color:inherit;text-decoration:underline;text-underline-offset:2px}",
      ".btns{display:flex;flex-wrap:wrap;gap:.6rem;align-items:center}",
      ".btn{font-family:" + FONT_UI + ";font-weight:700;font-size:.95rem;line-height:1.2;display:inline-block;padding:.72em 1.5em;border-radius:2px;text-decoration:none;cursor:pointer;border:2px solid " + bb + ";background:" + bb + ";color:" + bt + ";text-align:center}",
      ".btn:hover{filter:brightness(1.07)}",
      ".btn.secondary{background:transparent;color:" + text + ";border-color:currentColor}",
      ".btn:focus-visible,.x:focus-visible,.body a:focus-visible{outline:3px solid " + head + ";outline-offset:2px}",
      ".x{position:absolute;top:6px;right:6px;width:44px;height:44px;border:0;background:transparent;color:" + text + ";cursor:pointer;font-size:22px;line-height:1;display:flex;align-items:center;justify-content:center;opacity:.75;z-index:2;border-radius:50%}",
      ".x:hover{opacity:1}",
      ".has-media>.x{background:" + bg + ";opacity:.92;width:38px;height:38px;top:8px;right:8px;font-size:18px}",
      ".media img{display:block;width:100%;height:100%;object-fit:cover}",
      ".note{font-family:" + FONT_UI + ";font-size:.8rem;margin:.5rem 0 0}.note:empty{display:none}",
      ".formslot{margin:0 0 1em}",

      /* banner */
      ".fmt-banner{position:fixed;left:0;right:0;z-index:" + Z_TOP + ";transition:transform .35s ease}",
      ".fmt-banner.top{top:0;transform:translateY(-100%)}",
      ".fmt-banner.bottom{bottom:0;transform:translateY(100%);z-index:" + Z_BOTTOM + ";box-shadow:0 -4px 18px rgba(9,42,77,.18)}",
      ".fmt-banner.on{transform:none}",
      ".fmt-banner .box{display:flex;align-items:center;justify-content:center;gap:.4rem 1.4rem;flex-wrap:wrap;padding:.7rem 3.4rem .7rem 1.2rem;min-height:56px}",
      ".fmt-banner .copy{display:flex;align-items:baseline;gap:.2rem .9rem;flex-wrap:wrap;justify-content:center;text-align:center}",
      ".fmt-banner .head{font-size:1.55rem;margin:0}",
      ".fmt-banner .body{margin:0;font-size:.98rem}.fmt-banner .eyebrow{margin:0}",
      ".fmt-banner .btn{padding:.5em 1.15em;font-size:.88rem}",
      ".fmt-banner .x{top:50%;right:6px;transform:translateY(-50%)}",

      /* pop-up */
      ".scrim{position:fixed;top:0;right:0;bottom:0;left:0;z-index:" + Z_OVERLAY + ";background:rgba(12,20,28," + scrim + ");display:flex;align-items:center;justify-content:center;padding:16px;opacity:0;transition:opacity .3s ease}",
      ".scrim.on{opacity:1}",
      ".fmt-popup{width:100%;max-height:calc(100vh - 32px);overflow:auto;border-radius:4px;box-shadow:0 18px 60px rgba(0,0,0,.4);transform:translateY(14px) scale(.985);transition:transform .3s ease;display:flex;flex-direction:column}",
      ".scrim.on .fmt-popup{transform:none}",
      ".size-s{max-width:420px}.size-m{max-width:580px}.size-l{max-width:820px}",
      ".fmt-popup .copy{padding:2.2rem 2rem 2rem}",
      ".fmt-popup .head{font-size:2.6rem}.size-l .head{font-size:3.2rem}.size-s .head{font-size:2.2rem}",
      ".fmt-popup .media{flex:0 0 auto;max-height:260px;overflow:hidden}",
      ".fmt-popup.img-left,.fmt-popup.img-right{flex-direction:row}",
      ".fmt-popup.img-right .media{order:2}",
      ".fmt-popup.img-left .media,.fmt-popup.img-right .media{flex:0 0 42%;max-height:none;min-height:280px}",
      ".fmt-popup.img-left .copy,.fmt-popup.img-right .copy{flex:1 1 auto;align-self:center}",

      /* slide-in */
      ".fmt-slidein{position:fixed;z-index:" + Z_CORNER + ";width:360px;max-width:calc(100vw - 32px);max-height:70vh;overflow:auto;border-radius:4px;box-shadow:0 8px 30px rgba(9,42,77,.3);opacity:0;transform:translateY(24px);transition:opacity .35s ease,transform .35s ease,bottom .25s ease}",
      ".fmt-slidein.right{right:16px}.fmt-slidein.left{left:16px}",
      ".fmt-slidein.on{opacity:1;transform:none}",
      ".fmt-slidein .copy{padding:1.3rem 1.3rem 1.25rem}",
      ".fmt-slidein .head{font-size:1.75rem;margin-right:1.6rem}",
      ".fmt-slidein .body{font-size:.95rem}",
      ".fmt-slidein .media{max-height:150px;overflow:hidden}",
      ".fmt-slidein .btn{font-size:.88rem;padding:.6em 1.2em}",

      /* takeover */
      ".fmt-takeover{position:fixed;top:0;right:0;bottom:0;left:0;z-index:" + Z_OVERLAY + ";display:flex;align-items:center;justify-content:center;overflow:auto;opacity:0;transition:opacity .35s ease;background:" + bg + "}",
      ".fmt-takeover.on{opacity:1}",
      ".fmt-takeover .bgimg{position:absolute;top:0;right:0;bottom:0;left:0;background-size:cover;background-position:center}",
      ".fmt-takeover .bgimg:after{content:'';position:absolute;top:0;right:0;bottom:0;left:0;background:" + bg + ";opacity:" + tint + "}",
      ".fmt-takeover .box{background:transparent;position:relative;max-width:760px;width:100%;padding:4.5rem 2rem 3rem;text-align:center;margin:auto}",
      ".fmt-takeover .head{font-size:4.6rem}",
      ".fmt-takeover .body{font-size:1.15rem;max-width:36em;margin-left:auto;margin-right:auto}",
      ".fmt-takeover .btns{justify-content:center}",
      ".fmt-takeover .media{max-width:420px;margin:0 auto 1.6rem;max-height:240px;overflow:hidden;border-radius:3px}",
      ".fmt-takeover>.x{position:fixed;top:12px;right:12px;width:48px;height:48px;font-size:26px}",

      ".off{pointer-events:none;visibility:hidden;transition:opacity .35s ease,transform .35s ease,visibility 0s linear .35s !important}",
      ".fmt-slidein.off{opacity:0;transform:translateY(24px)}",
      ".fmt-banner.bottom.off{transform:translateY(100%)}",

      "@media (max-width:600px){",
      ".wrap{font-size:16px}",
      ".hide-phone{display:none !important}",
      ".fmt-banner .box{padding:.7rem 3rem .75rem .9rem;gap:.5rem}",
      ".fmt-banner .copy{flex-direction:column;align-items:center;gap:.1rem}",
      ".fmt-banner .head{font-size:1.4rem}.fmt-banner .body{font-size:.92rem}",
      ".scrim{padding:12px}",
      ".fmt-popup,.fmt-popup.img-left,.fmt-popup.img-right{flex-direction:column;max-width:none;width:92vw;max-height:calc(100vh - 24px)}",
      ".fmt-popup.img-right .media{order:0}",
      ".fmt-popup.img-left .media,.fmt-popup.img-right .media{flex:0 0 auto;min-height:0;max-height:180px}",
      ".fmt-popup .media{max-height:180px}",
      ".fmt-popup .copy{padding:1.6rem 1.25rem 1.4rem}",
      ".fmt-popup .head,.size-l .head,.size-s .head{font-size:2.15rem}",
      ".fmt-popup .btn{flex:1 1 100%}",
      ".fmt-slidein,.fmt-slidein.right,.fmt-slidein.left{left:10px;right:10px;width:auto;max-width:none;max-height:60vh}",
      ".fmt-slidein .media{max-height:110px}",
      ".fmt-takeover .box{padding:4rem 1.25rem 2rem}",
      ".fmt-takeover .head{font-size:2.9rem}.fmt-takeover .body{font-size:1.02rem}",
      ".fmt-takeover .btn{flex:1 1 100%}",
      "}",
      "@media (min-width:601px){.hide-desktop{display:none !important}}",
      "@media (prefers-reduced-motion:reduce){.fmt-banner,.scrim,.fmt-popup,.fmt-slidein,.fmt-takeover{transition:none !important}}"
    ].join("");
  }

  /* Theme values go into a stylesheet, so only plain hex colours and 0–1 numbers are accepted. */
  function colour(v, fallback) { return typeof v === "string" && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(v) ? v : fallback; }
  function unit(v, fallback) { return typeof v === "number" && v >= 0 && v <= 1 ? v : fallback; }

  function hideClass(c, key) {
    var h = (c.content || {}).hide || {};
    return h[key] === "phone" ? " hide-phone" : (h[key] === "desktop" ? " hide-desktop" : "");
  }

  function Instance(c, opts) {
    this.c = c;
    this.trigger = opts.trigger || "";
    this.silent = !!opts.silent;          // builder preview: no state, no data layer
    this.zone = zoneOf(c);
    this.visible = false;
    this.suspended = false;
    this.closed = false;
    this.build();
  }
  Instance.prototype.build = function () {
    var c = this.c, self = this, ct = c.content || {};
    var host = doc.createElement("div");
    host.id = "trplpop-" + c.id;
    host.setAttribute("data-trplpop", c.format);
    var root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
    var style = doc.createElement("style");
    style.textContent = css(c);
    root.appendChild(style);

    var wrap = doc.createElement("div");
    wrap.className = "wrap";
    root.appendChild(wrap);

    var modal = this.zone === "overlay";
    var outer, box = doc.createElement("div");
    box.className = "box";
    var headId = "trplpop-h";

    if (c.format === "banner") {
      outer = doc.createElement("div");
      outer.className = "fmt-banner " + (c.position === "bottom" ? "bottom" : "top");
      outer.setAttribute("role", "region");
      outer.setAttribute("aria-label", ct.headline || "Announcement");
      outer.appendChild(box);
    } else if (c.format === "slidein") {
      outer = box;
      box.className += " fmt-slidein " + (c.position === "bottom-left" ? "left" : "right");
      box.setAttribute("role", "complementary");
      box.setAttribute("aria-label", ct.headline || "Announcement");
    } else if (c.format === "takeover") {
      outer = doc.createElement("div");
      outer.className = "fmt-takeover";
      var bgu = ct.image && ct.image.pos === "bg" ? safeUrl(ct.image.url, "image") : "";
      if (bgu) {
        var bgd = doc.createElement("div");
        bgd.className = "bgimg" + hideClass(c, "image");
        bgd.style.backgroundImage = 'url("' + bgu.replace(/["\\\n\r]/g, "") + '")';
        outer.appendChild(bgd);
      }
      outer.appendChild(box);
    } else {
      outer = doc.createElement("div");
      outer.className = "scrim";
      var ip = ct.image && ct.image.url ? (ct.image.pos === "left" || ct.image.pos === "right" ? " img-" + ct.image.pos : "") : "";
      box.className += " fmt-popup size-" + (c.size === "s" || c.size === "l" ? c.size : "m") + ip;
      outer.appendChild(box);
    }
    if (modal) {
      var dlg = c.format === "takeover" ? outer : box;
      dlg.setAttribute("role", "dialog");
      dlg.setAttribute("aria-modal", "true");
      if (ct.headline) dlg.setAttribute("aria-labelledby", headId); else dlg.setAttribute("aria-label", "Announcement");
      dlg.setAttribute("tabindex", "-1");
    }

    // close button
    var x = doc.createElement("button");
    x.type = "button"; x.className = "x"; x.setAttribute("aria-label", "Close");
    x.appendChild(doc.createTextNode("✕"));
    x.addEventListener("click", function () { self.close("x"); });
    (c.format === "takeover" ? outer : box).appendChild(x);

    // image (not for banners; takeover background handled above)
    var imgUrl = ct.image ? safeUrl(ct.image.url, "image") : "";
    if (imgUrl && c.format !== "banner" && !(c.format === "takeover" && ct.image.pos === "bg")) {
      var media = doc.createElement("div");
      media.className = "media" + hideClass(c, "image");
      var img = doc.createElement("img");
      img.src = imgUrl; img.alt = ct.image.alt || ""; img.decoding = "async";
      media.appendChild(img);
      box.appendChild(media);
      box.className += " has-media";
    }

    var copy = doc.createElement("div");
    copy.className = "copy";
    if (ct.eyebrow) {
      var eb = doc.createElement("p");
      eb.className = "eyebrow" + hideClass(c, "eyebrow");
      eb.appendChild(doc.createTextNode(ct.eyebrow));
      copy.appendChild(eb);
    }
    if (ct.headline) {
      var h = doc.createElement(modal ? "h2" : "p");
      h.className = "head"; h.id = headId;
      h.appendChild(doc.createTextNode(ct.headline));
      copy.appendChild(h);
    }
    if (ct.body) {
      var b = doc.createElement("div");
      b.className = "body" + hideClass(c, "body");
      sanitizeInto(b, ct.body);
      copy.appendChild(b);
    }
    box.appendChild(copy);

    // Constant Contact inline form: lives in the page (light DOM) and is slotted in,
    // because the Constant Contact widget cannot see inside a shadow root.
    var btnParent = c.format === "banner" ? box : copy;
    if (ct.form && ct.form.type === "ctct" && /^[A-Za-z0-9-]{8,64}$/.test(ct.form.formId || "") && c.format !== "banner") {
      var slotWrap = doc.createElement("div");
      slotWrap.className = "formslot";
      var slot = doc.createElement("slot");
      slot.name = "form";
      slotWrap.appendChild(slot);
      copy.appendChild(slotWrap);
      var light = doc.createElement("div");
      light.setAttribute("slot", "form");
      var f = doc.createElement("div");
      f.className = "ctct-inline-form";
      f.setAttribute("data-form-id", ct.form.formId);
      light.appendChild(f);
      host.appendChild(light);
      this.formEl = f;
    }

    var btns = doc.createElement("div");
    btns.className = "btns";
    var list = ct.buttons || [];
    for (var i = 0; i < list.length && i < 2; i++) {
      var el = this.button(list[i], i);
      if (el) btns.appendChild(el);
    }
    if (btns.firstChild) btnParent.appendChild(btns);
    var note = doc.createElement("p");
    note.className = "note"; note.setAttribute("aria-live", "polite");
    this.note = note;
    if (c.format !== "banner") copy.appendChild(note);

    wrap.appendChild(outer);
    this.host = host; this.root = root; this.outer = outer; this.box = box;

    if (c.format === "popup") {
      outer.addEventListener("mousedown", function (e) {
        if (e.target === outer && c.backdropClose !== false) self.close("backdrop");
      });
    }
    this.onKey = function (e) {
      if (!self.visible || self.suspended) return;
      if (e.key === "Escape" || e.keyCode === 27) {
        if (modal) { e.stopPropagation(); self.close("esc"); }
        return;
      }
      if (modal && (e.key === "Tab" || e.keyCode === 9)) self.trap(e);
    };
  };
  Instance.prototype.button = function (b, i) {
    if (!b || !b.label) return null;
    var self = this, c = this.c, el, act = b.action || "url";
    var cls = "btn " + (b.style === "secondary" || (i === 1 && b.style !== "primary") ? "secondary" : "primary") + (i === 1 ? hideClass(c, "button2") : "");
    if (act === "url" || act === "tel" || act === "mailto") {
      var href = act === "url" ? safeUrl(b.value) : safeUrl((act === "tel" ? "tel:" : "mailto:") + String(b.value || "").replace(/^(tel:|mailto:)/i, ""));
      if (!href) return null;
      el = doc.createElement("a");
      el.setAttribute("href", href);
      if (b.newTab) { el.setAttribute("target", "_blank"); el.setAttribute("rel", "noopener"); }
    } else {
      el = doc.createElement("button");
      el.type = "button";
    }
    el.className = cls;
    el.appendChild(doc.createTextNode(b.label));
    el.addEventListener("click", function (e) {
      var label = "button" + (i + 1) + ":" + act;
      emit("interaction", self, label);
      if (b.convert) self.convert(label);
      if (act === "close") self.close("button");
      else if (act === "popup") { e.preventDefault(); var target = String(b.value || ""); self.close("button"); setTimeout(function () { show(target, { force: true, trigger: "click" }); }, 380); }
      else if (act === "event") {
        var name = String(b.value || "").toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 22);
        if (name && !self.silent) { win.dataLayer = win.dataLayer || []; win.dataLayer.push({ event: "trpl_popup_custom_" + name, popup_id: c.id }); }
        if (b.closeAfter !== false) self.close("button");
      } else if (act === "copy") {
        var txt = String(b.value || "");
        var done = function (ok) { self.note.textContent = ok ? "Copied: " + txt : txt; };
        if (win.navigator.clipboard && win.navigator.clipboard.writeText) win.navigator.clipboard.writeText(txt).then(function () { done(true); }, function () { done(false); });
        else done(false);
      } else if (b.newTab && b.convert) { setTimeout(function () { self.close("button"); }, 60); }
    });
    return el;
  };
  Instance.prototype.height = function () {
    try { return Math.round(this.outer.getBoundingClientRect().height); } catch (e) { return 0; }
  };
  Instance.prototype.focusables = function () {
    var sel = "a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex='-1'])";
    var list = [].slice.call(this.root.querySelectorAll(sel));
    if (this.formEl) {
      // the form sits in the page (slotted), between the copy and the buttons: keep that order
      var inForm = [].slice.call(this.formEl.querySelectorAll(sel)), slot = this.root.querySelector(".formslot"), at = list.length;
      for (var i = 0; i < list.length; i++) {
        if (slot && (slot.compareDocumentPosition(list[i]) & 4)) { at = i; break; }   // 4 = list[i] follows the slot
      }
      list = list.slice(0, at).concat(inForm, list.slice(at));
    }
    return list.filter(function (el) { return el.offsetParent !== null || el.getClientRects().length; });
  };
  Instance.prototype.trap = function (e) {
    var f = this.focusables();
    if (!f.length) { e.preventDefault(); return; }
    var first = f[0], last = f[f.length - 1];
    var active = this.root.activeElement || doc.activeElement;
    if (this.formEl && this.formEl.contains(doc.activeElement)) active = doc.activeElement;
    var idx = f.indexOf(active);
    if (e.shiftKey && (active === first || idx === -1)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (active === last || idx === -1)) { e.preventDefault(); first.focus(); }
  };
  Instance.prototype.show = function () {
    var self = this, c = this.c;
    // a top banner is first on the page visually, so it is first in reading and tab order too
    if (this.zone === "top" && doc.body.firstChild) doc.body.insertBefore(this.host, doc.body.firstChild);
    else doc.body.appendChild(this.host);
    doc.addEventListener("keydown", this.onKey, true);
    this.visible = true;
    if (this.zone === "overlay") {
      this.prevFocus = this.inheritFocus || doc.activeElement;
      this.lock = doc.createElement("style");
      this.lock.textContent = "html{overflow:hidden !important}";
      doc.head.appendChild(this.lock);
    }
    this.layout();
    // two frames so the starting state is painted before the transition
    var raf = win.requestAnimationFrame || function (fn) { return setTimeout(fn, 16); };
    raf(function () { raf(function () {
      if (self.closed) return;
      if (!self.suspended) self.on(true);
      self.layout();
      if (self.zone === "overlay") {
        var target = c.format === "takeover" ? self.outer : self.box;
        try { target.focus({ preventScroll: true }); } catch (e) { try { target.focus(); } catch (e2) {} }
      }
    }); });
    if (this.zone === "top" && win.ResizeObserver) {
      this.ro = new win.ResizeObserver(function () { self.layout(); });
      this.ro.observe(this.box);
    }
    if (!this.silent) mark(c.id, "s");
    emit("impression", this, "");
    if (this.formEl) this.watchForm();
  };
  Instance.prototype.on = function (v) {
    var el = this.c.format === "slidein" ? this.box : this.outer;
    if (v) { el.classList.add("on"); el.classList.remove("off"); }
    else { el.classList.remove("on"); }
  };
  Instance.prototype.layout = function () {
    if (this.closed) return;
    if (this.zone === "top") applyTopPush(this.suspended ? 0 : this.height());
    if (this.zone === "bottom") { if (this.suspended) clearBottomLift(); else applyBottomLift(this.height()); }
    if (this.zone === "corner") this.box.style.bottom = cornerOffset(this) + "px";
  };
  Instance.prototype.suspend = function (v) {
    if (this.suspended === v || this.closed) return;
    this.suspended = v;
    var el = this.c.format === "slidein" ? this.box : this.outer;
    if (v) { el.classList.add("off"); el.classList.remove("on"); el.setAttribute("aria-hidden", "true"); el.setAttribute("inert", ""); }
    else { el.classList.remove("off"); el.classList.add("on"); el.removeAttribute("aria-hidden"); el.removeAttribute("inert"); }
    this.layout();
  };
  Instance.prototype.convert = function (label) {
    if (this.converted) return;
    this.converted = true;
    if (!this.silent) mark(this.c.id, "v");
    emit("conversion", this, label || "");
  };
  Instance.prototype.watchForm = function () {
    // Best effort: Constant Contact swaps the form for a thank-you message on success.
    var self = this, f = this.formEl, tries = 0;
    this.formTimer = setInterval(function () {
      tries++;
      if (self.closed) { clearInterval(self.formTimer); return; }
      var ok = f.querySelector(".ctct-form-success, [id^='success_message']");
      if (ok && (ok.offsetParent !== null || ok.getClientRects().length)) {
        clearInterval(self.formTimer);
        self.convert("form:ctct");
        return;
      }
      if (tries === 6 && !f.firstChild) {
        // The Constant Contact widget did not render the form. Offer the fallback link.
        var fb = (self.c.content.form || {});
        var href = safeUrl(fb.fallbackUrl);
        if (href) {
          var a = doc.createElement("a");
          a.className = "btn primary"; a.setAttribute("href", href);
          a.appendChild(doc.createTextNode(fb.fallbackLabel || "Sign up"));
          a.addEventListener("click", function () { emit("interaction", self, "form-fallback"); self.convert("form-fallback"); });
          var holder = self.root.querySelector(".formslot");
          if (holder) { holder.textContent = ""; holder.appendChild(a); }
        }
        log(self.c.id, "Constant Contact form did not render; fallback " + (href ? "shown" : "not set"));
      }
      if (tries > 1200) clearInterval(self.formTimer);
    }, 500);
  };
  Instance.prototype.close = function (reason) {
    if (this.closed) return;
    this.closed = true;
    var self = this, c = this.c;
    this.on(false);
    doc.removeEventListener("keydown", this.onKey, true);
    if (this.ro) { try { this.ro.disconnect(); } catch (e) {} }
    if (this.formTimer) clearInterval(this.formTimer);
    if (this.zone === "top") clearTopPush();
    if (this.zone === "bottom") clearBottomLift();
    if (!this.silent && reason !== "replace") {
      if (!this.converted) mark(c.id, "c");
      if (!this.converted) mark("_g", "c");
      var s = loadSession(); s.closed = s.closed || {}; s.closed[c.id] = 1; saveSession(s);
    }
    emit("close", this, reason || "");
    this.finishTimer = setTimeout(function () { self.finish(); }, reason === "replace" ? 0 : 380);
  };
  Instance.prototype.finish = function () {
    if (this.finished) return;
    this.finished = true;
    clearTimeout(this.finishTimer);
    var c = this.c;
    if (this.host.parentNode) this.host.parentNode.removeChild(this.host);
    if (this.lock && this.lock.parentNode) this.lock.parentNode.removeChild(this.lock);
    // give focus back only if nothing else has taken it since (another pop-up, or the visitor)
    var a = doc.activeElement;
    if (this.prevFocus && this.prevFocus.focus && doc.contains(this.prevFocus) && (!a || a === doc.body || a === this.host)) {
      try { this.prevFocus.focus({ preventScroll: true }); } catch (e) {}
    }
    this.visible = false;
    if (instances[c.id] === this) {
      delete instances[c.id];
      if (zoneBusy[this.zone] === c.id) delete zoneBusy[this.zone];
    }
    tick();
  };

  /* ------------------------------------------------------------------ */
  /* Queue and zones                                                     */
  /* ------------------------------------------------------------------ */
  function request(c, trigger, force) {
    if (OFF) return;
    if (instances[c.id] && instances[c.id].closed && force) instances[c.id].finish();   // still fading out: finish now
    if (instances[c.id]) return;
    if (!force && shownThisPage[c.id]) return;
    batch.push({ c: c, trigger: trigger, force: !!force, at: now() });
    if (!batchTimer) batchTimer = setTimeout(flush, force ? 0 : 60);
  }
  function flush() {
    batchTimer = null;
    var items = batch; batch = [];
    items.sort(function (a, b) {
      if (a.force !== b.force) return a.force ? -1 : 1;
      return (b.c.priority || 0) - (a.c.priority || 0);
    });
    for (var i = 0; i < items.length; i++) place(items[i]);
    ensureTick();
  }
  function place(item) {
    var c = item.c, z = zoneOf(c);
    if (instances[c.id]) return;
    if (item.force) {
      var cur = instances[zoneBusy[z]];
      if (cur) { item.inheritFocus = cur.prevFocus; cur.prevFocus = null; cur.close("replace"); cur.finish(); }
      for (var w = waiting.length - 1; w >= 0; w--) if (zoneOf(waiting[w].c) === z) waiting.splice(w, 1);
      delete zoneBusy[z];
    } else {
      if (zoneUsed[z]) { log(c.id, "skipped: the " + z + " zone was already used on this page view"); return; }
      if (zoneBusy[z]) { log(c.id, "skipped: the " + z + " zone is busy"); return; }
      if (z === "overlay" && site.sessionOverlayCap > 0 && (loadSession().ov || 0) >= site.sessionOverlayCap) {
        log(c.id, "skipped: per-visit cap on pop-ups reached"); return;
      }
    }
    var why = blockedBy(c);
    if (why) {
      zoneUsed[z] = true;                 // it holds its place in line
      zoneBusy[z] = c.id;
      waiting.push(item);
      log(c.id, "waiting: " + why);
      return;
    }
    reveal(item);
  }
  function reveal(item) {
    var c = item.c, z = zoneOf(c);
    var inst = new Instance(c, { trigger: item.trigger, silent: !!c.__preview || item.trigger === "preview" });
    if (item.inheritFocus) inst.inheritFocus = item.inheritFocus;
    instances[c.id] = inst;
    zoneBusy[z] = c.id;
    zoneUsed[z] = true;
    shownThisPage[c.id] = true;
    if (z === "overlay" && !inst.silent) { var s = loadSession(); s.ov = (s.ov || 0) + 1; saveSession(s); }
    log(c.id, "showing (" + item.trigger + ")");
    inst.show();
  }
  function tick() {
    var i, k;
    // release anything that was waiting on a neighbour
    for (i = waiting.length - 1; i >= 0; i--) {
      var it = waiting[i];
      if (!blockedBy(it.c)) {
        waiting.splice(i, 1);
        reveal(it);
      }
    }
    // suspend or resume what is showing, and keep it clear of its neighbours
    for (k in instances) {
      var inst = instances[k];
      if (inst.closed) continue;
      if (inst.zone === "bottom" || inst.zone === "corner") {
        var why = blockedBy(inst.c, true);
        if (why && !inst.suspended) log(k, "stepping aside: " + why);
        inst.suspend(!!why);
      }
      inst.layout();
    }
    var busy = waiting.length;
    for (k in instances) busy++;
    if (!busy && tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  }
  function ensureTick() {
    if (!tickTimer) tickTimer = setInterval(tick, 400);
  }

  /* ------------------------------------------------------------------ */
  /* Triggers                                                            */
  /* ------------------------------------------------------------------ */
  function addCleanup(fn) { cleanups.push(fn); }
  function arm(c, set) {
    var tr = set.trigger || { type: "load" };
    var fired = false;
    function fire(name) {
      if (fired) return; fired = true;
      var why = frequencyAllows(c);          // re-check: state may have changed since arming
      if (why) { log(c.id, "not shown: " + why); return; }
      request(c, name);
    }
    if (tr.type === "delay") {
      var t = setTimeout(function () { fire("delay"); }, Math.max(0, (tr.seconds || 0)) * 1000);
      addCleanup(function () { clearTimeout(t); });
    } else if (tr.type === "scroll") {
      var pct = Math.min(100, Math.max(1, tr.percent || 50));
      var onScroll = function () {
        var max = Math.max(doc.documentElement.scrollHeight, doc.body ? doc.body.scrollHeight : 0) - vh();
        var y = win.pageYOffset || doc.documentElement.scrollTop || 0;
        if (max <= 0 || (y / max) * 100 >= pct) { win.removeEventListener("scroll", onScroll); fire("scroll"); }
      };
      win.addEventListener("scroll", onScroll, { passive: true });
      addCleanup(function () { win.removeEventListener("scroll", onScroll); });
      var st = setTimeout(onScroll, 300);
      addCleanup(function () { clearTimeout(st); });
    } else if (tr.type === "exit") {
      var onOut = function (e) {
        if (!e.relatedTarget && e.clientY <= 0) { doc.removeEventListener("mouseout", onOut); fire("exit"); }
      };
      doc.addEventListener("mouseout", onOut);
      addCleanup(function () { doc.removeEventListener("mouseout", onOut); });
      // phones: a quick scroll back up after reading some way down
      var maxY = 0, lastY = 0, lastT = now();
      var onUp = function () {
        var y = win.pageYOffset || 0, t2 = now();
        if (y > maxY) maxY = y;
        var dt = t2 - lastT, dy = lastY - y;
        if (vw() <= site.tabletMax && maxY > vh() * 0.6 && dy > 90 && dt < 350) { win.removeEventListener("scroll", onUp); fire("exit"); }
        lastY = y; lastT = t2;
      };
      win.addEventListener("scroll", onUp, { passive: true });
      addCleanup(function () { win.removeEventListener("scroll", onUp); });
    } else if (tr.type === "none") {
      /* shown only by a click or a GTM "show" call */
    } else {
      fire("load");
    }
  }

  function consider(c) {
    if (OFF || !started || armed[c.id]) return;
    if (c.__preview) return;
    armed[c.id] = true;
    if (qs.trplpop_preview && qs.trplpop_preview === c.id) {
      log(c.id, "forced by ?trplpop_preview");
      request(c, "preview", true);
      return;
    }
    var rules = c.rules || {};
    if (rules.mode === "gtm") { log(c.id, "waits for a GTM show call"); return; }
    var why = scheduleAllows(c) || deviceAllows(c) || frequencyAllows(c);
    if (why) { log(c.id, "not shown: " + why); return; }
    var sets = rules.sets && rules.sets.length ? rules.sets : [{}];
    var ctx = context(), matched = 0;
    for (var i = 0; i < sets.length; i++) {
      if (setMatches(sets[i], ctx)) { matched++; arm(c, sets[i]); }
    }
    if (!matched) log(c.id, "not shown: no rule set matches " + ctx.path);
    else log(c.id, matched + " rule set(s) match; trigger armed");
  }

  /* ------------------------------------------------------------------ */
  /* Public interface                                                    */
  /* ------------------------------------------------------------------ */
  function validate(c) {
    if (!c || typeof c !== "object") return "settings missing";
    if (typeof c.id !== "string" || !ID_RE.test(c.id)) return "invalid id";
    if (!{ banner: 1, popup: 1, slidein: 1, takeover: 1 }[c.format]) return "unknown format";
    return "";
  }
  function register(c, opts) {
    var bad = validate(c);
    if (bad) { log("register refused:", bad, c && c.id); return false; }
    if (!(opts && opts.preview)) {
      if (!c._c || c._c !== checksum(c)) {
        log(c.id, "register refused: settings do not match their check value (incomplete paste or hand edit). Re-copy from the builder.");
        return false;
      }
    }
    if (!campaigns[c.id]) order.push(c.id);
    campaigns[c.id] = c;
    delete armed[c.id];
    log(c.id, "registered");
    try { consider(c); } catch (e) { log(c.id, "registered, but its rules could not be read", e); }
    return true;
  }
  function show(id, opts) {
    opts = opts || {};
    if (typeof id !== "string" || !ID_RE.test(id)) { log("show ignored: not a valid id"); return; }
    var c = campaigns[id];
    if (!c) {
      // The pop-up's own tag may not have run yet. Try again shortly, a few times.
      opts._tries = (opts._tries || 0) + 1;
      if (opts._tries <= 20) setTimeout(function () { show(id, opts); }, 250);
      else log(id, "show ignored: no pop-up registered with this id");
      return;
    }
    if (OFF) return;
    // "force" (a link the visitor clicked) skips page, device and frequency rules, never the schedule
    var why = scheduleAllows(c) || (opts.force ? "" : deviceAllows(c) || frequencyAllows(c));
    if (why) { log(id, "not shown: " + why); return; }
    request(c, opts.trigger || "gtm", !!opts.force);
  }
  function close(id, reason) {
    if (id) {
      if (instances[id]) instances[id].close(reason || "api");
      for (var w = waiting.length - 1; w >= 0; w--) {
        if (waiting[w].c.id === id) { var z = zoneOf(waiting[w].c); waiting.splice(w, 1); if (zoneBusy[z] === id) delete zoneBusy[z]; }
      }
      return;
    }
    for (var k in instances) instances[k].close(reason || "api");
  }
  function teardownPage() {
    for (var i = 0; i < cleanups.length; i++) { try { cleanups[i](); } catch (e) {} }
    cleanups = [];
    for (var k in instances) instances[k].close("replace");
    instances = bare();
    waiting = []; batch = []; zoneBusy = bare(); zoneUsed = bare(); shownThisPage = bare(); armed = bare();
  }
  function reset() {
    teardownPage();
    bootAt = now(); floatSeenExpectedAt = 0;
    setTimeout(function () { for (var i = 0; i < order.length; i++) { try { consider(campaigns[order[i]]); } catch (e) {} } }, 0);
  }
  function preview(c) {
    // Builder only: render immediately, record nothing, send nothing to the data layer.
    teardownPage();
    var bad = validate(c);
    if (bad) return bad;
    var copy = JSON.parse(JSON.stringify(c));
    copy.__preview = true;
    campaigns[copy.id] = copy;
    var seq = ++previewSeq;
    setTimeout(function () { if (seq === previewSeq) request(copy, "preview", true); }, 20);
    return "";
  }
  function configure(o) {
    if (!o || typeof o !== "object") return;
    var SIMPLE = /^[#.]?[A-Za-z][\w-]*$/;                     // one id, class or tag; nothing that could widen a CSS rule
    for (var k in o) {
      if (!Object.prototype.hasOwnProperty.call(o, k) || !Object.prototype.hasOwnProperty.call(site, k)) continue;
      var v = o[k];
      if (k === "fixedTop") { if (isArr(v)) site.fixedTop = v.filter(function (x) { return typeof x === "string" && SIMPLE.test(x); }); continue; }
      if (typeof v !== typeof site[k]) continue;
      if (k === "fontsCss" && v && !/^https:\/\/(use\.typekit\.net|p\.typekit\.net|fonts\.googleapis\.com|[a-z0-9.-]+\.trlibrary\.com)\//i.test(v)) continue;
      site[k] = v;
    }
    if (site.fontsCss && !doc.getElementById("trplpop-fonts")) {
      var l = doc.createElement("link");
      l.id = "trplpop-fonts"; l.rel = "stylesheet"; l.href = site.fontsCss;
      doc.head.appendChild(l);
    }
  }
  function handle(cmd) {
    // one faulty pop-up must never stop the others
    try {
      if (!cmd) return;
      if (!isArr(cmd)) cmd = [].slice.call(cmd);
      var name = cmd[0];
      if (name === "register") return register(cmd[1]);
      if (name === "show") return show(cmd[1], cmd[2]);
      if (name === "close") return close(cmd[1]);
      if (name === "config") return configure(cmd[1]);
      if (name === "reset") return reset();
    } catch (e) {
      if (win.console && win.console.warn) win.console.warn("[TRPLPopup] ignored a command that failed:", e);
    }
  }

  var api = {
    __trplpop: true,
    version: VERSION,
    push: function () { for (var i = 0; i < arguments.length; i++) handle(arguments[i]); return 0; },
    register: register,
    show: show,
    close: close,
    reset: reset,
    preview: preview,
    config: configure,
    checksum: checksum,
    matchPath: function (set, path) {      // used by the builder so its page list and the live site agree
      return setMatches({ include: (set || {}).include, exclude: (set || {}).exclude }, { path: normPath(path), query: {}, referrer: "", hash: "" });
    },
    on: function (ev, fn) { if (typeof fn === "function") (listeners[ev] = listeners[ev] || []).push(fn); },
    state: function () { return { visitor: loadState(), session: loadSession(), showing: Object.keys(instances), waiting: waiting.map(function (w) { return w.c.id; }), registered: order.slice() }; }
  };
  win.TRPLPopup = api;

  if (!hostOk) { if (win.console && qs.trplpop_debug === "1") win.console.log("[TRPLPopup] not enabled on this hostname"); return; }
  if (qs.trplpop_clear === "1") clearState();

  // Links that open a pop-up: href="#popup:<id>" or data-trpl-popup="<id>"
  doc.addEventListener("click", function (e) {
    var el = e.target;
    while (el && el !== doc && el.nodeType === 1) {
      var id = el.getAttribute("data-trpl-popup");
      if (!id && el.tagName === "A") {
        var m = /#popup:([a-z0-9-]+)$/.exec(el.getAttribute("href") || "");
        if (m) id = m[1];
      }
      if (id) {
        if (campaigns[id]) { e.preventDefault(); show(id, { force: true, trigger: "click" }); }
        return;
      }
      el = el.parentNode;
    }
  }, false);
  doc.addEventListener("trplfloat:state", function () { floatSettledByEvent = true; tick(); });
  win.addEventListener("resize", function () { tick(); });

  function start() {
    if (started) return;
    started = true; bootAt = now();
    for (var i = 0; i < backlog.length; i++) handle(backlog[i]);
    backlog = [];
    for (var j = 0; j < order.length; j++) { try { consider(campaigns[order[j]]); } catch (e) { log(order[j], "skipped after an error", e); } }
    var m = /^#popup:([a-z0-9-]+)$/.exec(win.location.hash || "");
    if (m) show(m[1], { force: true, trigger: "click" });
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", start);
  else start();
})(window, document);
