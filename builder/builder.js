/*
 * TRPL Popup Builder
 * Designs a pop-up, previews it with the real runtime, and hands back code to paste into
 * Google Tag Manager. The builder cannot change the live site: nothing here publishes.
 */
(function () {
  "use strict";

  var TZ = "America/Denver";
  var P = window.TRPLPopup;
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return [].slice.call((el || document).querySelectorAll(s)); };

  /* ------------------------------------------------------------------ */
  /* Brand                                                               */
  /* ------------------------------------------------------------------ */
  var PALETTE = [
    { name: "Dark Gray", hex: "#25282A" }, { name: "White", hex: "#FFFFFF" }, { name: "Sand", hex: "#D1CCBD" },
    { name: "Deep Orange", hex: "#E7805D" }, { name: "Sunset Orange", hex: "#FC924E" }, { name: "Sunset Pink", hex: "#F36079" },
    { name: "Sunset Yellow", hex: "#F9D635" }, { name: "Spring Green", hex: "#87BB41" }, { name: "Bright Forest", hex: "#8FC895" },
    { name: "Dark Forest", hex: "#1B4532" }, { name: "Night Sky", hex: "#092A4D" }, { name: "Gray Sky", hex: "#99ADC5" }
  ];
  /* The eight approved pairings from the rsvp.labs builder, mapped to pop-up roles, plus plain White. */
  var PRESETS = [
    { name: "White",          bg: "#FFFFFF", text: "#25282A", head: "#092A4D", btnBg: "#E7805D", btnText: "#25282A" },
    { name: "Badlands Night", bg: "#25282A", text: "#FFFFFF", head: "#FC924E", btnBg: "#FC924E", btnText: "#25282A" },
    { name: "Elkhorn",        bg: "#1B4532", text: "#FFFFFF", head: "#87BB41", btnBg: "#87BB41", btnText: "#25282A" },
    { name: "Night Sky",      bg: "#092A4D", text: "#FFFFFF", head: "#F9D635", btnBg: "#F9D635", btnText: "#092A4D" },
    { name: "Sunset",         bg: "#E7805D", text: "#25282A", head: "#25282A", btnBg: "#25282A", btnText: "#FFFFFF" },
    { name: "Gray Sky",       bg: "#99ADC5", text: "#25282A", head: "#092A4D", btnBg: "#092A4D", btnText: "#FFFFFF" },
    { name: "Sand & Forest",  bg: "#D1CCBD", text: "#25282A", head: "#1B4532", btnBg: "#1B4532", btnText: "#FFFFFF" },
    { name: "Prairie Dusk",   bg: "#25282A", text: "#FFFFFF", head: "#F36079", btnBg: "#F36079", btnText: "#25282A" },
    { name: "Bright Forest",  bg: "#8FC895", text: "#25282A", head: "#1B4532", btnBg: "#1B4532", btnText: "#FFFFFF" }
  ];
  var COLOR_ROLES = [["bg", "Background"], ["text", "Body text"], ["head", "Headline"], ["btnBg", "Button"], ["btnText", "Button text"]];
  /* House terminology, from Brand/brand.json */
  var TERMS = [
    [/\bteddy\b/i, "“Teddy” is not used in prose. Use Theodore Roosevelt or T.R."],
    [/\bvisitors?\b/i, "House style prefers “participants” to “visitors”."],
    [/\bguests?\b/i, "House style prefers “participants” to “guests”."],
    [/\bdonors?\b/i, "House style prefers “benefactors” to “donors”."],
    [/\bboard members?\b/i, "House style prefers “Trustees” to “board members”."],
    [/\bTR\b/, "Write T.R. with periods."]
  ];

  var FORMATS = [
    { key: "banner-top", label: "Banner, top", note: "Folds down, pushes the page", format: "banner", pos: "top", tag: "banner-top" },
    { key: "banner-bottom", label: "Banner, bottom", note: "Folds up from the bottom", format: "banner", pos: "bottom", tag: "banner-bottom" },
    { key: "popup", label: "Pop-up", note: "Panel over a dimmed page", format: "popup", tag: "pop-up" },
    { key: "slidein", label: "Slide-in", note: "Corner card", format: "slidein", tag: "slide-in" },
    { key: "takeover", label: "Takeover", note: "Fills the window", format: "takeover", tag: "takeover" }
  ];
  var ACTIONS = [
    ["url", "Go to a web address", "https://www.trlibrary.com/…"], ["close", "Close the pop-up", ""], ["popup", "Open another pop-up", "its id"],
    ["tel", "Call a phone number", "+17015551234"], ["mailto", "Start an email", "name@trlibrary.com"], ["copy", "Copy text", "text to copy"],
    ["event", "Send an event to GTM", "event_name"]
  ];
  var TRIGGERS = [["load", "As soon as the page loads"], ["delay", "After a number of seconds"], ["scroll", "After scrolling part of the page"], ["exit", "When the visitor moves to leave"], ["none", "Only from a link or button"]];
  var OPS = [["starts", "starts with"], ["contains", "contains"], ["is", "is exactly"], ["ends", "ends with"], ["regex", "matches pattern"]];
  var STANDING = [
    { t: "path", op: "ends", v: "/print" }, { t: "path", op: "starts", v: "/tickets" }, { t: "path", op: "starts", v: "/rsvp" },
    { t: "path", op: "starts", v: "/privacy" }, { t: "path", op: "starts", v: "/node/" }, { t: "path", op: "starts", v: "/user" }
  ];
  var DEVICES = { desktop: [1280, 800], tablet: [768, 1024], phone: [375, 740] };
  var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  var SITEMAP = { paths: [], fetched: "", count: 0 };
  var S = null, dev = "desktop", frameReady = false, renderTimer = null;

  /* ------------------------------------------------------------------ */
  /* Helpers                                                             */
  /* ------------------------------------------------------------------ */
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function get(o, path) { var p = path.split("."); for (var i = 0; i < p.length; i++) { if (o == null) return undefined; o = o[p[i]]; } return o; }
  function set(o, path, v) { var p = path.split("."); for (var i = 0; i < p.length - 1; i++) { if (o[p[i]] == null) o[p[i]] = {}; o = o[p[i]]; } o[p[p.length - 1]] = v; }
  function el(tag, attrs, html) { var e = document.createElement(tag); if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]); if (html != null) e.innerHTML = html; return e; }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function todayStr() { return localFromMs(Date.now()).slice(0, 10); }

  function tzOffsetMin(ms) {
    var f = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    var p = {}; f.formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = x.value; });
    var asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, (+p.hour) % 24, +p.minute, +p.second);
    return Math.round((asUTC - ms) / 60000);
  }
  function localToISO(local) {
    var m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)/.exec(local || ""); if (!m) return "";
    var wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    var off = tzOffsetMin(wall - tzOffsetMin(wall) * 60000);
    var a = Math.abs(off);
    return m[1] + "-" + m[2] + "-" + m[3] + "T" + m[4] + ":" + m[5] + ":00" + (off < 0 ? "-" : "+") + pad(Math.floor(a / 60)) + ":" + pad(a % 60);
  }
  function localFromMs(ms) { return new Date(ms + tzOffsetMin(ms) * 60000).toISOString().slice(0, 16); }
  function isoToLocal(iso) { var t = Date.parse(iso); return isNaN(t) ? "" : localFromMs(t); }

  function slugify(s) { return String(s || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30).replace(/-+$/, ""); }
  function makeId() { var base = slugify(S.name); var ym = (S.startLocal || todayStr()).slice(0, 7); return base ? (ym + "-" + base).slice(0, 40).replace(/-+$/, "") : ""; }
  function okUrl(u, links) { u = String(u || "").trim(); return /^https:\/\//i.test(u) || /^\/(?!\/)/.test(u) || (links && /^#/.test(u)); }

  function lum(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || ""); if (!m) return 0;
    var n = parseInt(m[1], 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function ratio(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }

  function toast(msg) { var t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, 2600); }
  function copyText(text, msg) {
    var done = function () { toast(msg || "Copied"); };
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(done, fallback); } else fallback();
    function fallback() { var ta = el("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); done(); } catch (e) { toast("Copy failed. Select the text and copy it by hand."); } ta.remove(); }
  }
  /* In-page dialog. No native alert/confirm/prompt anywhere in this tool. */
  function dialog(opts) {
    var m = $("#modal"); $("#mTitle").textContent = opts.title; var b = $("#mBody"); b.innerHTML = ""; if (opts.body) b.appendChild(opts.body);
    var acts = $("#mActs"); acts.innerHTML = "";
    var prev = document.activeElement;
    function close() { m.hidden = true; document.removeEventListener("keydown", onKey, true); if (prev && prev.focus) prev.focus(); }
    function onKey(e) { if (e.key === "Escape") { e.stopPropagation(); close(); } }
    (opts.buttons || [{ label: "OK", primary: true }]).forEach(function (bt) {
      var btn = el("button", { type: "button", "class": "mini" + (bt.primary ? " pri" : "") }); btn.textContent = bt.label;
      btn.addEventListener("click", function () { if (!bt.onClick || bt.onClick() !== false) close(); });
      acts.appendChild(btn);
    });
    m.hidden = false; document.addEventListener("keydown", onKey, true);
    var f = b.querySelector("input,textarea") || acts.querySelector("button"); if (f) f.focus();
  }

  /* ------------------------------------------------------------------ */
  /* State                                                               */
  /* ------------------------------------------------------------------ */
  function newSet() { return { include: [], exclude: clone(STANDING), conds: [], match: "all", trigger: { type: "load", seconds: 5, percent: 50 } }; }
  function blank() {
    return {
      name: "", id: "", idTouched: false, isEdit: false,
      format: "popup", bannerPos: "top", slidePos: "bottom-right", size: "m", backdropClose: true, priority: 5,
      presetName: "White", theme: { bg: "#FFFFFF", text: "#25282A", head: "#092A4D", btnBg: "#E7805D", btnText: "#25282A" },
      content: {
        eyebrow: "", headline: "", body: "", image: { url: "", alt: "", pos: "top" },
        buttons: [{ label: "", action: "url", value: "", newTab: false, convert: true }, { label: "", action: "close", value: "", newTab: false, convert: false }],
        form: { formId: "", fallbackUrl: "", fallbackLabel: "" }
      },
      hideImagePhone: false,
      mode: "auto", devices: { desktop: true, tablet: true, phone: true },
      startLocal: "", endLocal: localFromMs(Date.now() + 30 * 86400000).slice(0, 11) + "23:59", days: [], from: "", to: "",
      sets: [newSet()],
      freq: { close: { mode: "days", days: 30 }, convert: { mode: "days", days: 365 } }
    };
  }
  function formatKey() { return S.format === "banner" ? "banner-" + S.bannerPos : S.format; }
  function formatInfo() { var k = formatKey(); return FORMATS.filter(function (f) { return f.key === k; })[0]; }

  function exportCond(c) { var o = { t: c.t || "path", op: c.op }; if (c.op !== "home" && c.op !== "exists" && c.op !== "empty") o.v = c.v; if (c.k) o.k = c.k; if (c.not) o.not = true; return o; }
  function exportSet(s, gtm) {
    var o = {};
    if (s.include.length) o.include = s.include.map(exportCond);
    if (s.exclude.length) o.exclude = s.exclude.map(exportCond);
    if (!gtm) {
      if (s.conds.length) { o.conds = s.conds.filter(function (c) { return c.t !== "query" || c.k; }).map(exportCond); if (!o.conds.length) delete o.conds; if (s.match === "any") o.match = "any"; }
      var t = { type: s.trigger.type };
      if (t.type === "delay") t.seconds = Math.max(0, +s.trigger.seconds || 0);
      if (t.type === "scroll") t.percent = Math.min(100, Math.max(1, +s.trigger.percent || 50));
      o.trigger = t;
    }
    return o;
  }
  function toConfig() {
    var c = { v: 1, id: S.id, name: S.name || S.id, format: S.format };
    if (S.format === "banner") c.position = S.bannerPos;
    if (S.format === "slidein") c.position = S.slidePos;
    if (S.format === "popup") { c.size = S.size; if (!S.backdropClose) c.backdropClose = false; }
    if (+S.priority) c.priority = +S.priority;
    c.theme = { bg: S.theme.bg, text: S.theme.text, head: S.theme.head, btnBg: S.theme.btnBg, btnText: S.theme.btnText };
    var ct = {}, sc = S.content;
    if (sc.eyebrow.trim()) ct.eyebrow = sc.eyebrow.trim();
    if (sc.headline.trim()) ct.headline = sc.headline.trim();
    if (sc.body && sc.body.replace(/<[^>]*>/g, "").trim()) ct.body = sc.body;
    if (S.format !== "banner" && sc.image.url.trim()) {
      ct.image = { url: sc.image.url.trim(), alt: sc.image.alt.trim(), pos: sc.image.pos };
      if (S.hideImagePhone) ct.hide = { image: "phone" };
    }
    ct.buttons = sc.buttons.filter(function (b) { return b.label.trim(); }).map(function (b, i) {
      var o = { label: b.label.trim(), action: b.action };
      if (b.action !== "close") o.value = String(b.value || "").trim();
      if (b.action === "url" && b.newTab) o.newTab = true;
      if (b.convert && b.action !== "close") o.convert = true;
      if (i === 1) o.style = "secondary";
      return o;
    });
    if (!ct.buttons.length) delete ct.buttons;
    if (S.format !== "banner" && sc.form.formId.trim()) {
      ct.form = { type: "ctct", formId: sc.form.formId.trim() };
      if (sc.form.fallbackUrl.trim()) { ct.form.fallbackUrl = sc.form.fallbackUrl.trim(); ct.form.fallbackLabel = sc.form.fallbackLabel.trim() || "Sign up"; }
    }
    c.content = ct;
    var r = {};
    if (S.mode === "gtm") { r.mode = "gtm"; r.sets = [exportSet(S.sets[0], true)]; }   // kept so the trigger settings survive an import
    else r.sets = S.sets.map(function (s) { return exportSet(s, false); });
    var d = ["desktop", "tablet", "phone"].filter(function (k) { return S.devices[k]; });
    if (d.length && d.length < 3) r.devices = d;
    var sch = {};
    if (S.startLocal) sch.start = localToISO(S.startLocal);
    if (S.endLocal) sch.end = localToISO(S.endLocal);
    if (S.days.length) sch.days = S.days.slice().sort();
    if (S.from && S.to) { sch.from = S.from; sch.to = S.to; }
    if (Object.keys(sch).length) r.schedule = sch;
    c.rules = r;
    var f = { close: { mode: S.freq.close.mode }, convert: { mode: S.freq.convert.mode } };
    if (f.close.mode === "days") f.close.days = Math.max(1, +S.freq.close.days || 30);
    if (f.convert.mode === "days") f.convert.days = Math.max(1, +S.freq.convert.days || 365);
    c.freq = f;
    return c;
  }
  /* Everything that comes in through Import or a share link is untrusted: coerce and allow-list it. */
  function str(v, max) { return typeof v === "string" ? v.slice(0, max || 2000) : ""; }
  function oneOf(v, list, fallback) { return list.indexOf(v) > -1 ? v : fallback; }
  function hex(v, fallback) { return typeof v === "string" && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(v) ? v : fallback; }
  function importCond(c) {
    c = c && typeof c === "object" ? c : {};
    var t = oneOf(c.t, ["path", "query", "referrer"], "path");
    var ops = t === "path" ? ["starts", "contains", "is", "ends", "regex", "home"] : t === "query" ? ["is", "contains", "exists"] : ["contains", "empty"];
    return { t: t, op: oneOf(c.op, ops, ops[0]), v: str(c.v, 300), k: str(c.k, 60), not: !!c.not };
  }
  function fromConfig(c) {
    var obj = function (v) { return v && typeof v === "object" ? v : {}; }, arr = function (v) { return Array.isArray(v) ? v : []; };
    c = obj(c);
    var s = blank(); var ct = obj(c.content), r = obj(c.rules), sch = obj(r.schedule);
    s.name = str(c.name, 60); s.id = str(c.id, 40).toLowerCase().replace(/[^a-z0-9-]/g, "-"); s.idTouched = true; s.isEdit = true;
    s.format = oneOf(c.format, ["banner", "popup", "slidein", "takeover"], "popup");
    if (s.format === "banner") s.bannerPos = c.position === "bottom" ? "bottom" : "top";
    if (s.format === "slidein") s.slidePos = c.position === "bottom-left" ? "bottom-left" : "bottom-right";
    s.size = oneOf(c.size, ["s", "m", "l"], "m"); s.backdropClose = c.backdropClose !== false; s.priority = Math.max(0, Math.min(99, +c.priority || 0));
    var th = obj(c.theme);
    COLOR_ROLES.forEach(function (x) { s.theme[x[0]] = hex(th[x[0]], s.theme[x[0]]); });
    var hit = PRESETS.filter(function (p) { return COLOR_ROLES.every(function (x) { return p[x[0]].toLowerCase() === String(s.theme[x[0]]).toLowerCase(); }); })[0];
    s.presetName = hit ? hit.name : "";
    s.content.eyebrow = str(ct.eyebrow, 60); s.content.headline = str(ct.headline, 90); s.content.body = cleanBody(str(ct.body, 4000));
    var im = obj(ct.image);
    if (im.url) s.content.image = { url: str(im.url, 500), alt: str(im.alt, 140), pos: oneOf(im.pos, ["top", "left", "right", "bg"], "top") };
    s.hideImagePhone = obj(ct.hide).image === "phone";
    arr(ct.buttons).slice(0, 2).forEach(function (b, i) { b = obj(b); s.content.buttons[i] = { label: str(b.label, 40), action: oneOf(b.action, ACTIONS.map(function (a) { return a[0]; }), "url"), value: str(b.value, 500), newTab: !!b.newTab, convert: !!b.convert }; });
    var fm = obj(ct.form);
    if (fm.formId) s.content.form = { formId: str(fm.formId, 64), fallbackUrl: str(fm.fallbackUrl, 500), fallbackLabel: str(fm.fallbackLabel, 40) };
    s.mode = r.mode === "gtm" ? "gtm" : "auto";
    var dv = arr(r.devices);
    if (dv.length) s.devices = { desktop: dv.indexOf("desktop") > -1, tablet: dv.indexOf("tablet") > -1, phone: dv.indexOf("phone") > -1 };
    s.startLocal = sch.start ? isoToLocal(str(sch.start, 40)) : ""; s.endLocal = sch.end ? isoToLocal(str(sch.end, 40)) : "";
    s.days = arr(sch.days).filter(function (d) { return d === (d | 0) && d >= 0 && d <= 6; });
    s.from = /^\d\d:\d\d$/.test(sch.from) ? sch.from : ""; s.to = /^\d\d:\d\d$/.test(sch.to) ? sch.to : "";
    var sets = arr(r.sets);
    if (sets.length) s.sets = sets.slice(0, 8).map(function (x) {
      x = obj(x); var t = obj(x.trigger);
      return { include: arr(x.include).map(importCond), exclude: arr(x.exclude).map(importCond), conds: arr(x.conds).map(importCond), match: x.match === "any" ? "any" : "all",
        trigger: { type: oneOf(t.type, TRIGGERS.map(function (g) { return g[0]; }), "load"), seconds: Math.max(0, Math.min(600, +t.seconds || 0)) || (t.seconds === 0 ? 0 : 5), percent: Math.max(1, Math.min(100, +t.percent || 50)) } };
    });
    var f = obj(c.freq), fc = obj(f.close), fv = obj(f.convert);
    if (f.close) s.freq.close = { mode: oneOf(fc.mode, ["days", "session", "always", "never"], "days"), days: Math.max(1, Math.min(400, +fc.days || 30)) };
    if (f.convert) s.freq.convert = { mode: oneOf(fv.mode, ["days", "never"], "days"), days: Math.max(1, Math.min(400, +fv.days || 365)) };
    return s;
  }

  /* ------------------------------------------------------------------ */
  /* Code in, code out                                                   */
  /* ------------------------------------------------------------------ */
  function snippet(c) {
    c = clone(c); c._c = P.checksum(c);
    // "<" is escaped so the code cannot end its own script tag; "{{" so GTM does not read it as a variable.
    var json = JSON.stringify(c).replace(/</g, "\\u003c").replace(/\{\{/g, "{\\u007b");
    return "<!-- TRPL Popup · " + c.id + " · built " + todayStr() + " · to edit, paste this code into the builder (Import code) -->\n" +
      "<script>\n(window.TRPLPopup = window.TRPLPopup || []).push([\"register\", " + json + "]);\n</" + "script>";
  }
  function showSnippet(id) { return "<script>(window.TRPLPopup = window.TRPLPopup || []).push([\"show\", \"" + id + "\"]);</" + "script>"; }
  function b64e(s) { return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
  function b64d(s) { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return decodeURIComponent(escape(atob(s))); }
  function extractObject(text, from) {
    var start = text.indexOf("{", from); if (start < 0) return null;
    var depth = 0, inStr = false, q = "", i;
    for (i = start; i < text.length; i++) {
      var ch = text.charAt(i);
      if (inStr) { if (ch === "\\") i++; else if (ch === q) inStr = false; continue; }
      if (ch === '"' || ch === "'") { inStr = true; q = ch; continue; }
      if (ch === "{") depth++; else if (ch === "}") { depth--; if (depth === 0) return text.slice(start, i + 1); }
    }
    return null;
  }
  function parseImport(text) {
    text = String(text || "").trim();
    var at = text.indexOf("register");
    var m = at < 0 ? /#c=([A-Za-z0-9_-]+)\s*$/.exec(text) : null;
    if (m) { try { return JSON.parse(b64d(m[1])); } catch (e) { return null; } }
    var raw = extractObject(text, at < 0 ? 0 : at);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e2) { return null; }
  }

  /* ------------------------------------------------------------------ */
  /* Page rules and the sitemap                                          */
  /* ------------------------------------------------------------------ */
  function describe(c) {
    if (c.op === "home") return "Homepage";
    if (c.op === "regex") { var m = /^\^\/([a-z0-9-]+)\(\/\|\$\)$/i.exec(c.v); return m ? "/" + m[1] + " section" : "pattern <code>" + esc(c.v) + "</code>"; }
    var w = { is: "is", starts: "starts with", contains: "contains", ends: "ends with" }[c.op] || "rule";
    return w + " <code>" + esc(c.v) + "</code>";
  }
  function reEsc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function toRegex(c) {
    var v = String(c.v || ""); if (c.op !== "regex" && v.length > 1) v = v.replace(/\/+$/, "");
    switch (c.op) {
      case "home": return "^/$";
      case "is": return "^" + reEsc(v) + "/?$";
      case "starts": return "^" + reEsc(v);
      case "contains": return reEsc(v);
      case "ends": return reEsc(v) + "/?$";
      default: return c.v;
    }
  }
  function sections() {
    var counts = {};
    SITEMAP.paths.forEach(function (p) { var seg = p.split("/")[1]; if (seg) counts[seg] = (counts[seg] || 0) + 1; });
    return Object.keys(counts).filter(function (k) { return counts[k] >= 2; }).sort(function (a, b) { return counts[b] - counts[a]; }).map(function (k) { return { seg: k, n: counts[k] }; });
  }
  function matches(s) { return SITEMAP.paths.filter(function (p) { return P.matchPath(s, p); }); }
  function sameCond(a, b) { return a.op === b.op && String(a.v || "") === String(b.v || ""); }

  function renderSets() {
    var wrap = $("#setsWrap"); wrap.innerHTML = "";
    var gtm = S.mode === "gtm";
    var list = gtm ? S.sets.slice(0, 1) : S.sets;
    var secs = sections();
    list.forEach(function (s, i) {
      var box = el("div", { "class": "setbox", "data-set": i });
      var h = "<h3>" + (gtm ? "Pages (for the GTM trigger)" : "Rule set " + (i + 1)) + "<span class='sp'></span>" + (!gtm && S.sets.length > 1 ? "<button type='button' class='mini' data-act='delset'>Remove</button>" : "") + "</h3>";
      h += "<div class='sub'>Show on</div><div class='chips' data-list='include'>" + (s.include.length ? s.include.map(function (c, j) { return "<span class='chip'>" + describe(c) + "<button type='button' data-act='rm' data-list='include' data-j='" + j + "' aria-label='Remove'>×</button></span>"; }).join("") : "<span class='empty'>Every page</span>") + "</div>";
      h += "<div class='sub'>Never on</div><div class='chips' data-list='exclude'>" + (s.exclude.length ? s.exclude.map(function (c, j) { return "<span class='chip ex'>" + describe(c) + "<button type='button' data-act='rm' data-list='exclude' data-j='" + j + "' aria-label='Remove'>×</button></span>"; }).join("") : "<span class='empty'>No exclusions</span>") + "</div>";
      h += "<div class='sub'>Add site sections</div><div class='chips'>" +
        "<button type='button' class='mini' data-act='sec' data-seg=''>Homepage</button>" +
        secs.map(function (x) { return "<button type='button' class='mini' data-act='sec' data-seg='" + esc(x.seg) + "'>/" + esc(x.seg) + " <span class='n'>" + x.n + "</span></button>"; }).join("") + "</div>";
      h += "<span class='hint'>Click to show on a section. Shift-click to exclude it.</span>";
      h += "<div class='sub'>Find a page</div><input type='text' data-act='search' placeholder='Type part of an address, e.g. itineraries' spellcheck='false'><div class='results' hidden></div>";
      h += "<div class='sub'>Add a rule by hand</div><div class='row'><select data-f='op' class='fix' style='flex-basis:130px'>" + OPS.map(function (o) { return "<option value='" + o[0] + "'>" + o[1] + "</option>"; }).join("") + "</select><input type='text' data-f='val' placeholder='/visit' spellcheck='false'><button type='button' class='mini fix' data-act='addinc'>Show on</button><button type='button' class='mini fix' data-act='addexc'>Never on</button></div>";
      h += "<div class='match' data-match></div>";
      h += "<div class='row' style='margin-top:.4rem'><input type='text' data-act='test' placeholder='Test an address, e.g. /visit/hours' spellcheck='false'><span class='fix' data-testout style='font-size:12.5px;min-width:90px'></span></div>";
      if (!gtm) {
        h += "<div class='sub'>Also require <span class='n' style='font-weight:400'>(optional)</span></div><div data-conds></div><button type='button' class='mini' data-act='addcond'>Add a condition</button>";
        h += "<div class='sub'>Fire</div><div class='row'><select data-f='trig'>" + TRIGGERS.map(function (t) { return "<option value='" + t[0] + "'" + (s.trigger.type === t[0] ? " selected" : "") + ">" + t[1] + "</option>"; }).join("") + "</select>" +
          "<label class='fix' style='flex-basis:110px;margin:0' data-trignum></label></div>";
      } else {
        h += "<span class='hint'>Timing comes from the GTM trigger. The page rules above are turned into the trigger settings in step 6.</span>";
      }
      box.innerHTML = h;
      wrap.appendChild(box);
      renderConds(box, s); renderTrigNum(box, s); renderMatch(box, s);
    });
    if (!gtm) { var add = el("button", { type: "button", "class": "mini", id: "addSet" }); add.textContent = "Add another rule set"; wrap.appendChild(add); wrap.appendChild(el("span", { "class": "hint" }, "The pop-up shows when any one rule set is satisfied.")); }
  }
  function renderConds(box, s) {
    var host = box.querySelector("[data-conds]"); if (!host) return;
    host.innerHTML = s.conds.map(function (c, j) {
      return "<div class='row' data-cond='" + j + "' style='margin-bottom:.3rem'>" +
        "<select data-cf='t' class='fix' style='flex-basis:118px'><option value='query'" + (c.t === "query" ? " selected" : "") + ">URL parameter</option><option value='referrer'" + (c.t === "referrer" ? " selected" : "") + ">Came from</option></select>" +
        (c.t === "query" ? "<input type='text' data-cf='k' placeholder='utm_source' value='" + esc(c.k) + "' spellcheck='false'>" : "") +
        "<select data-cf='op' class='fix' style='flex-basis:110px'>" + (c.t === "query" ? [["is", "is"], ["contains", "contains"], ["exists", "is present"]] : [["contains", "contains"], ["empty", "is empty"]]).map(function (o) { return "<option value='" + o[0] + "'" + (c.op === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select>" +
        (c.op === "exists" || c.op === "empty" ? "" : "<input type='text' data-cf='v' value='" + esc(c.v) + "' placeholder='" + (c.t === "query" ? "newsletter" : "facebook.com") + "' spellcheck='false'>") +
        "<label class='check fix' style='margin:0'><input type='checkbox' data-cf='not'" + (c.not ? " checked" : "") + "> not</label>" +
        "<button type='button' class='mini fix' data-act='rmcond' data-j='" + j + "' aria-label='Remove condition'>×</button></div>";
    }).join("");
  }
  function renderTrigNum(box, s) {
    var host = box.querySelector("[data-trignum]"); if (!host) return;
    if (s.trigger.type === "delay") host.innerHTML = "<span class='lb'>Seconds</span><input type='number' min='0' max='600' data-f='seconds' value='" + (+s.trigger.seconds || 0) + "'>";
    else if (s.trigger.type === "scroll") host.innerHTML = "<span class='lb'>Percent</span><input type='number' min='1' max='100' data-f='percent' value='" + (+s.trigger.percent || 50) + "'>";
    else host.innerHTML = "";
  }
  function renderMatch(box, s) {
    var host = box.querySelector("[data-match]"), m = matches(s), total = SITEMAP.paths.length;
    if (!total) { host.innerHTML = "The sitemap could not be loaded, so matching pages cannot be listed."; return; }
    host.className = "match" + (m.length ? "" : " zero");
    host.innerHTML = "<strong>Matches " + m.length.toLocaleString() + " of " + total.toLocaleString() + " pages</strong> in the sitemap (" + esc(SITEMAP.fetched) + ")." +
      (m.length ? "<details><summary>See the pages</summary><ul>" + m.slice(0, 400).map(function (p) { return "<li>" + esc(p) + "</li>"; }).join("") + (m.length > 400 ? "<li>… and " + (m.length - 400) + " more</li>" : "") + "</ul></details>" : " Nothing on the site would show this pop-up.");
  }
  function addCond(s, list, cond) {
    if (!s[list].some(function (c) { return sameCond(c, cond); })) s[list].push(cond);
    var other = list === "include" ? "exclude" : "include";
    s[other] = s[other].filter(function (c) { return !sameCond(c, cond); });
  }
  function bindSets() {
    var wrap = $("#setsWrap");
    wrap.addEventListener("click", function (e) {
      var t = e.target.closest("[data-act],#addSet"); if (!t) return;
      if (t.id === "addSet") { S.sets.push(newSet()); renderSets(); changed(); return; }
      var box = t.closest(".setbox"), i = +box.getAttribute("data-set"), s = S.sets[i], act = t.getAttribute("data-act");
      if (act === "delset") { S.sets.splice(i, 1); }
      else if (act === "rm") { s[t.getAttribute("data-list")].splice(+t.getAttribute("data-j"), 1); }
      else if (act === "sec") { var seg = t.getAttribute("data-seg"); addCond(s, e.shiftKey ? "exclude" : "include", seg ? { t: "path", op: "regex", v: "^/" + seg + "(/|$)" } : { t: "path", op: "home", v: "" }); }
      else if (act === "addinc" || act === "addexc") {
        var v = box.querySelector("[data-f=val]").value.trim(), op = box.querySelector("[data-f=op]").value;
        if (!v) { toast("Type an address or part of one first."); return; }
        if (op === "regex") { try { new RegExp(v); } catch (err) { toast("That pattern is not valid."); return; } if (/\(\?[=!<]|\\[1-9]/.test(v)) { toast("GTM cannot use look-arounds or back-references. Simplify the pattern."); return; } if (/\([^)]*[+*][^)]*\)\s*[+*{]/.test(v)) { toast("That pattern repeats a repeat, which can freeze a browser. Simplify it."); return; } }
        else if (v.charAt(0) !== "/" && op !== "contains" && op !== "ends") v = "/" + v;
        addCond(s, act === "addinc" ? "include" : "exclude", { t: "path", op: op, v: v });
      }
      else if (act === "pick" || act === "pickex") { addCond(s, act === "pick" ? "include" : "exclude", { t: "path", op: "is", v: t.getAttribute("data-p") }); }
      else if (act === "addcond") { s.conds.push({ t: "query", k: "", op: "is", v: "", not: false }); }
      else if (act === "rmcond") { s.conds.splice(+t.getAttribute("data-j"), 1); }
      else return;
      renderSets(); changed();
    });
    wrap.addEventListener("input", function (e) {
      var t = e.target, box = t.closest(".setbox"); if (!box) return;
      var s = S.sets[+box.getAttribute("data-set")], act = t.getAttribute("data-act");
      if (act === "search") {
        var qv = t.value.trim().toLowerCase(), res = box.querySelector(".results");
        if (qv.length < 2) { res.hidden = true; return; }
        var hits = SITEMAP.paths.filter(function (p) { return p.toLowerCase().indexOf(qv) > -1; }).slice(0, 40);
        res.hidden = false;
        res.innerHTML = hits.length ? hits.map(function (p) { return "<div><span class='mono' title='" + esc(p) + "'>" + esc(p) + "</span><button type='button' class='mini' data-act='pick' data-p='" + esc(p) + "'>Show on</button><button type='button' class='mini' data-act='pickex' data-p='" + esc(p) + "'>Never on</button></div>"; }).join("") : "<div><span class='empty'>No page in the sitemap contains that.</span></div>";
        return;
      }
      if (act === "test") {
        var out = box.querySelector("[data-testout]"), v = t.value.trim();
        if (!v) { out.textContent = ""; return; }
        try { if (/^https?:\/\//i.test(v)) v = new URL(v).pathname; } catch (err) {}
        if (v.charAt(0) !== "/") v = "/" + v;
        var ok = P.matchPath(s, v.split("?")[0].split("#")[0]);
        out.innerHTML = ok ? "<b style='color:#1B4532'>Would show</b>" : "<b style='color:#a8321e'>Would not show</b>";
        return;
      }
      var f = t.getAttribute("data-f");
      if (f === "seconds" || f === "percent") { s.trigger[f] = +t.value; changed(); return; }
      var cf = t.getAttribute("data-cf");
      if (cf && (cf === "k" || cf === "v")) { s.conds[+t.closest("[data-cond]").getAttribute("data-cond")][cf] = t.value; changed(); }
    });
    wrap.addEventListener("change", function (e) {
      var t = e.target, box = t.closest(".setbox"); if (!box) return;
      var s = S.sets[+box.getAttribute("data-set")];
      if (t.getAttribute("data-f") === "trig") { s.trigger.type = t.value; renderTrigNum(box, s); changed(); return; }
      var cf = t.getAttribute("data-cf");
      if (cf === "t" || cf === "op" || cf === "not") {
        var c = s.conds[+t.closest("[data-cond]").getAttribute("data-cond")];
        if (cf === "not") c.not = t.checked; else c[cf] = t.value;
        if (cf === "t") { c.op = c.t === "query" ? "is" : "contains"; c.k = ""; c.v = ""; }
        renderConds(box, s); changed();
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Static controls                                                     */
  /* ------------------------------------------------------------------ */
  function renderCards() {
    $("#formats").innerHTML = FORMATS.map(function (f) { return "<button type='button' class='card' data-fmt='" + f.key + "' aria-pressed='" + (formatKey() === f.key) + "'>" + f.label + "<small>" + f.note + "</small></button>"; }).join("");
    $("#modes").innerHTML = [["auto", "The pop-up's own rules", "One GTM tag on All Pages. Set the rules here."], ["gtm", "A GTM trigger", "For form submits, clicks and other GTM events."]].map(function (m) { return "<button type='button' class='card' data-mode='" + m[0] + "' aria-pressed='" + (S.mode === m[0]) + "'>" + m[1] + "<small>" + m[2] + "</small></button>"; }).join("");
    $("#presets").innerHTML = PRESETS.map(function (p, i) { return "<button type='button' class='card preset' data-preset='" + i + "' aria-pressed='" + (S.presetName === p.name) + "'><span class='strip'><i style='background:" + p.bg + "'></i><i style='background:" + p.head + "'></i><i style='background:" + p.btnBg + "'></i></span><span class='nm'>" + esc(p.name) + "</span></button>"; }).join("");
    $("#colors").innerHTML = COLOR_ROLES.map(function (r) {
      return "<span class='lb' style='margin-top:.6rem'>" + r[1] + "</span><div class='swatches' data-role='" + r[0] + "'>" + PALETTE.map(function (c) { return "<button type='button' title='" + c.name + "' aria-label='" + r[1] + ": " + c.name + "' data-hex='" + c.hex + "' style='background:" + c.hex + "' aria-pressed='" + (S.theme[r[0]].toLowerCase() === c.hex.toLowerCase()) + "'></button>"; }).join("") + "</div>";
    }).join("");
    $("#devices").innerHTML = ["desktop", "tablet", "phone"].map(function (d) { return "<label class='check'><input type='checkbox' data-dev-rule='" + d + "'" + (S.devices[d] ? " checked" : "") + "> " + d.charAt(0).toUpperCase() + d.slice(1) + "</label>"; }).join("");
    $("#days").innerHTML = DAYS.map(function (d, i) { return "<label class='check'><input type='checkbox' data-day='" + i + "'" + (S.days.indexOf(i) > -1 ? " checked" : "") + "> " + d + "</label>"; }).join("");
    var c = [["Body text", ratio(S.theme.text, S.theme.bg), 4.5], ["Headline", ratio(S.theme.head, S.theme.bg), 3], ["Button", ratio(S.theme.btnText, S.theme.btnBg), 4.5]];
    $("#contrast").innerHTML = "Contrast: " + c.map(function (x) { return x[0] + " <b class='" + (x[1] >= x[2] ? "ok" : "no") + "'>" + x[1].toFixed(1) + ":1 " + (x[1] >= x[2] ? "passes" : "fails") + "</b>"; }).join(" · ");
  }
  function renderButtons() {
    [0, 1].forEach(function (i) {
      var b = S.content.buttons[i], a = ACTIONS.filter(function (x) { return x[0] === b.action; })[0] || ACTIONS[0];
      $("#btn" + i).innerHTML =
        "<div class='row'><label><span class='lb'>Text</span><input type='text' data-b='" + i + "' data-bf='label' maxlength='40' value='" + esc(b.label) + "' placeholder='" + (i ? "Not now" : "Reserve tickets") + "'></label>" +
        "<label><span class='lb'>When clicked</span><select data-b='" + i + "' data-bf='action'>" + ACTIONS.map(function (x) { return "<option value='" + x[0] + "'" + (x[0] === b.action ? " selected" : "") + ">" + x[1] + "</option>"; }).join("") + "</select></label></div>" +
        (b.action === "close" ? "" : "<label><input type='text' data-b='" + i + "' data-bf='value' value='" + esc(b.value) + "' placeholder='" + esc(a[2]) + "' spellcheck='false' aria-label='Button " + (i + 1) + " target'></label>") +
        "<div class='row'>" + (b.action === "url" ? "<label class='check'><input type='checkbox' data-b='" + i + "' data-bf='newTab'" + (b.newTab ? " checked" : "") + "> Open in a new tab</label>" : "") +
        (b.action === "close" ? "" : "<label class='check'><input type='checkbox' data-b='" + i + "' data-bf='convert'" + (b.convert ? " checked" : "") + "> Counts as a click-through</label>") + "</div>";
    });
  }
  function syncStatic() {
    $$("[data-k]").forEach(function (inp) {
      var v = get(S, inp.getAttribute("data-k"));
      if (inp.type === "checkbox") inp.checked = !!v; else if (document.activeElement !== inp) inp.value = v == null ? "" : v;
    });
    var fmt = S.format;
    $("#optPopup").hidden = fmt !== "popup"; $("#optSlide").hidden = fmt !== "slidein";
    $("#imageBlock").hidden = fmt === "banner"; $("#formBlock").hidden = fmt === "banner";
    var opts = fmt === "popup" ? [["top", "On top"], ["left", "Left side"], ["right", "Right side"]] : fmt === "takeover" ? [["bg", "Background"], ["top", "Above the text"]] : [["top", "On top"]];
    if (!opts.some(function (o) { return o[0] === S.content.image.pos; })) S.content.image.pos = opts[0][0];
    $("#imgPos").innerHTML = opts.map(function (o) { return "<option value='" + o[0] + "'" + (o[0] === S.content.image.pos ? " selected" : "") + ">" + o[1] + "</option>"; }).join("");
    $("#closeDays").hidden = S.freq.close.mode !== "days"; $("#convDays").hidden = S.freq.convert.mode !== "days";
    var body = $("#body"); if (document.activeElement !== body && body.innerHTML !== S.content.body) body.innerHTML = S.content.body;
  }
  function renderAll() { syncStatic(); renderCards(); renderButtons(); renderSets(); changed(true); }

  /* ------------------------------------------------------------------ */
  /* Checks and hand-off                                                 */
  /* ------------------------------------------------------------------ */
  function checks(c) {
    var out = [], ct = c.content || {}, text = [ct.eyebrow, ct.headline, (ct.body || "").replace(/<[^>]*>/g, " ")].concat((ct.buttons || []).map(function (b) { return b.label; })).join(" ");
    if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(c.id || "")) out.push(["stop", "Give the pop-up a name so it gets an id (lowercase letters, numbers and hyphens)."]);
    if (!ct.headline && !ct.body) out.push(["stop", "Add a headline or body text."]);
    (ct.buttons || []).forEach(function (b, i) {
      if (b.action === "url" && !okUrl(b.value, true)) out.push(["stop", "Button " + (i + 1) + " needs a full https:// address (or one starting with /)."]);
      if ((b.action === "popup" || b.action === "tel" || b.action === "mailto" || b.action === "copy" || b.action === "event") && !b.value) out.push(["stop", "Button " + (i + 1) + " needs a value for its action."]);
    });
    if (ct.image && !okUrl(ct.image.url)) out.push(["stop", "The image address must start with https://."]);
    if (ct.image && ct.image.pos !== "bg" && !ct.image.alt) out.push(["warn", "Add an image description for screen-reader users, unless the image is purely decorative."]);
    if (ct.form && !/^[A-Za-z0-9-]{8,64}$/.test(ct.form.formId)) out.push(["stop", "The Constant Contact form ID does not look right."]);
    if (ct.form && !ct.form.fallbackUrl) out.push(["warn", "Add a fallback link for the sign-up form in case the form does not load."]);
    if (!(ct.buttons || []).length && !ct.form && c.format !== "banner") out.push(["warn", "There is no button. Visitors can only close it."]);
    if (!S.devices.desktop && !S.devices.tablet && !S.devices.phone) out.push(["stop", "Tick at least one device."]);
    if ((S.from && !S.to) || (!S.from && S.to)) out.push(["warn", "“Only between” needs both times. With one missing it is ignored."]);
    var sch = (c.rules || {}).schedule || {};
    if (!sch.end) out.push(["warn", "No end date. Give it one so it stops by itself."]);
    else if (Date.parse(sch.end) < Date.now()) out.push(["stop", "The end date is in the past."]);
    if (sch.start && sch.end && Date.parse(sch.start) >= Date.parse(sch.end)) out.push(["stop", "The start date is after the end date."]);
    if (ratio(c.theme.text, c.theme.bg) < 4.5) out.push(["warn", "Body text contrast is below 4.5:1."]);
    if (ratio(c.theme.head, c.theme.bg) < 3) out.push(["warn", "Headline contrast is below 3:1."]);
    if (ratio(c.theme.btnText, c.theme.btnBg) < 4.5) out.push(["warn", "Button text contrast is below 4.5:1."]);
    TERMS.forEach(function (t) { if (t[0].test(text)) out.push(["warn", t[1]]); });
    var phones = !c.rules.devices || c.rules.devices.indexOf("phone") > -1;
    if ((c.format === "takeover" || c.format === "popup") && phones && c.rules.sets && c.rules.sets.some(function (s) { return (s.trigger || {}).type === "load"; })) out.push(["warn", "This covers the page the moment it loads on phones. Google can demote pages that do that. Add a delay or a scroll trigger, or leave phones out."]);
    if (c.rules.sets) c.rules.sets.forEach(function (s, i) { if (SITEMAP.paths.length && !matches(s).length && (s.include || []).length) out.push(["warn", "Rule set " + (i + 1) + " matches no page in the sitemap."]); });
    if (c.format === "banner" && ((ct.headline || "") + (ct.body || "").replace(/<[^>]*>/g, "")).length > 110) out.push(["warn", "Banner copy is long. It will wrap to several lines on phones."]);
    return out;
  }
  function gtmTrigger(c) {
    var s = S.sets[0], inc = s.include.map(toRegex), exc = s.exclude.map(toRegex);
    var rows = [["Trigger name", "TRPL Popup – Trigger – " + c.id], ["Trigger type", "Page View (or the event you want: Form Submission, Click, Custom Event…)"], ["This trigger fires on", inc.length || exc.length ? "Some Page Views" : "All Page Views"]];
    if (inc.length) rows.push(["Condition", "Page Path · matches RegEx (ignore case) · <code class='mono'>" + esc(inc.join("|")) + "</code>"]);
    if (exc.length) rows.push(["Condition", "Page Path · does not match RegEx (ignore case) · <code class='mono'>" + esc(exc.join("|")) + "</code>"]);
    return "<div class='sub'>Second tag: what fires it</div><span class='hint'>Create one more Custom HTML tag named <b>TRPL Popup – Show – " + esc(c.id) + "</b> with the line below, and attach this trigger to it.</span>" +
      "<div class='copyline'><code id='showCode'>" + esc(showSnippet(c.id)) + "</code><button type='button' class='mini' data-copy='showCode'>Copy</button></div>" +
      "<table class='kv'>" + rows.map(function (r) { return "<tr><th>" + r[0] + "</th><td>" + r[1] + "</td></tr>"; }).join("") + "</table>";
  }
  function handoff(c) {
    var list = checks(c), stops = list.filter(function (x) { return x[0] === "stop"; });
    $("#checks").innerHTML = list.length ? list.map(function (x) { return "<li class='" + (x[0] === "stop" ? "stop" : "") + "'>" + esc(x[1]) + "</li>"; }).join("") : "<li class='fine'>Ready to copy.</li>";
    var fi = formatInfo(), tag = "TRPL Popup – " + (c.id || "…") + " (" + fi.tag + ")";
    $("#tagName").textContent = tag;
    $("#verName").textContent = "Popup: " + (S.isEdit ? "edit " : "add ") + (c.id || "…");
    $("#steps").innerHTML = (S.isEdit ? [
      "Click <b>Copy for GTM</b> above.",
      "In GTM, open the tag <b>" + esc(tag) + "</b>.",
      "Select everything in the HTML box and paste over it. <b>Save</b>.",
      "<b>Preview</b>, check the pop-up on the site, then <b>Submit</b> with the version name above."
    ] : [
      "Click <b>Copy for GTM</b> above.",
      "In GTM: <b>Tags</b> → open <b>TRPL Popup – TEMPLATE (copy me)</b> → <b>⋮</b> → <b>Copy</b>.",
      "Rename the copy to the tag name above. Select everything in the HTML box and paste. <b>Save</b>.",
      "<b>Preview</b>, check the pop-up on the site, then <b>Submit</b> with the version name above."
    ]).map(function (s) { return "<li>" + s + "</li>"; }).join("") +
      "<li>To take it down later: on the tag, <b>⋮</b> → <b>Pause</b>, then Submit.</li>";
    $("#gtmFired").innerHTML = S.mode === "gtm" && /^[a-z0-9][a-z0-9-]{1,39}$/.test(c.id) ? gtmTrigger(c) : "";
    $("#out").value = stops.length ? "Fix the items marked above and the code will appear here." : snippet(c);
    return stops.length;
  }

  /* ------------------------------------------------------------------ */
  /* Preview                                                             */
  /* ------------------------------------------------------------------ */
  function fit() {
    var st = $("#stage"), fr = $("#frame"), d = DEVICES[dev];
    var sc = Math.min(1, (st.clientWidth - 24) / d[0], (st.clientHeight - 24) / d[1]);
    fr.style.width = d[0] + "px"; fr.style.height = d[1] + "px";
    fr.style.transform = "translateX(-50%) scale(" + sc + ")";
  }
  function sendPreview() {
    if (!frameReady) return;
    var c = toConfig(); if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(c.id)) c.id = "preview";
    $("#pstatus").textContent = "";
    $("#frame").contentWindow.postMessage({ type: "trplpop-preview", config: c, neighbours: { chat: $("#nChat").checked, alert: $("#nAlert").checked } }, window.location.origin);
    clearTimeout(sendPreview.t);
    sendPreview.t = setTimeout(function () {
      if (!sendPreview.shown) $("#pstatus").textContent = $("#nAlert").checked ? "Not showing: this format waits while the ticket alert is on screen. Untick “Ticket alert” to see it." : "Nothing to show yet.";
    }, 1800);
    sendPreview.shown = false;
  }
  function changed(skipPreviewDelay) {
    if (!S.idTouched) { S.id = makeId(); var idInp = $("[data-k=id]"); if (document.activeElement !== idInp) idInp.value = S.id; }
    var c = toConfig();
    handoff(c);
    try { localStorage.setItem("trplpop_builder_draft", JSON.stringify(S)); } catch (e) {}
    clearTimeout(renderTimer);
    renderTimer = setTimeout(sendPreview, skipPreviewDelay ? 0 : 350);
  }

  /* ------------------------------------------------------------------ */
  /* Wiring                                                              */
  /* ------------------------------------------------------------------ */
  function cleanBody(html) {
    var tpl = el("template"); tpl.innerHTML = html; var out = el("div");
    (function walk(from, to) {
      [].slice.call(from.childNodes).forEach(function (n) {
        if (n.nodeType === 3) { to.appendChild(document.createTextNode(n.nodeValue)); return; }
        if (n.nodeType !== 1) return;
        var tag = n.tagName; if (tag === "DIV") tag = "P";
        if (!{ P: 1, BR: 1, B: 1, STRONG: 1, I: 1, EM: 1, A: 1, UL: 1, OL: 1, LI: 1 }[tag]) { walk(n, to); return; }
        var e = document.createElement(tag.toLowerCase());
        if (tag === "A") { var h = (n.getAttribute("href") || "").trim(); if (!/^(https:\/\/|mailto:|tel:|\/(?!\/)|#)/i.test(h)) { walk(n, to); return; } e.setAttribute("href", h); }
        walk(n, e); to.appendChild(e);
      });
    })(tpl.content, out);
    return out.innerHTML.replace(/<p><\/p>/g, "");
  }
  function bind() {
    $("#form").addEventListener("input", function (e) {
      var t = e.target, k = t.getAttribute("data-k");
      if (k) {
        var v = t.type === "checkbox" ? t.checked : (t.type === "number" ? +t.value : t.value);
        if (k === "id") { v = String(v).toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40); S.idTouched = !!v; if (t.value !== v) t.value = v; }
        set(S, k, v);
        if (k.indexOf("freq.") === 0 || k === "content.image.pos") syncStatic();
        changed(); return;
      }
      var bi = t.getAttribute("data-b");
      if (bi != null) { var f = t.getAttribute("data-bf"); S.content.buttons[+bi][f] = t.type === "checkbox" ? t.checked : t.value; if (f === "action") renderButtons(); changed(); return; }
      if (t.hasAttribute("data-dev-rule")) { S.devices[t.getAttribute("data-dev-rule")] = t.checked; changed(); return; }
      if (t.hasAttribute("data-day")) { var d = +t.getAttribute("data-day"), ix = S.days.indexOf(d); if (t.checked && ix < 0) S.days.push(d); if (!t.checked && ix > -1) S.days.splice(ix, 1); changed(); }
    });
    $("#form").addEventListener("change", function (e) { var t = e.target; if (t.getAttribute("data-k") && t.tagName === "SELECT") { set(S, t.getAttribute("data-k"), t.value); syncStatic(); changed(); } });
    $("#form").addEventListener("click", function (e) {
      var t = e.target.closest("[data-fmt],[data-mode],[data-preset],[data-hex],[data-copy],[data-cmd]"); if (!t) return;
      if (t.hasAttribute("data-fmt")) { var f = FORMATS.filter(function (x) { return x.key === t.getAttribute("data-fmt"); })[0]; S.format = f.format; if (f.pos) S.bannerPos = f.pos; syncStatic(); renderCards(); changed(); }
      else if (t.hasAttribute("data-mode")) { S.mode = t.getAttribute("data-mode"); renderCards(); renderSets(); changed(); }
      else if (t.hasAttribute("data-preset")) { var p = PRESETS[+t.getAttribute("data-preset")]; S.presetName = p.name; COLOR_ROLES.forEach(function (r) { S.theme[r[0]] = p[r[0]]; }); renderCards(); changed(); }
      else if (t.hasAttribute("data-hex")) { S.theme[t.parentNode.getAttribute("data-role")] = t.getAttribute("data-hex"); S.presetName = ""; renderCards(); changed(); }
      else if (t.hasAttribute("data-copy")) { copyText($("#" + t.getAttribute("data-copy")).textContent); }
      else if (t.hasAttribute("data-cmd")) {
        var cmd = t.getAttribute("data-cmd"), body = $("#body"); body.focus();
        if (cmd === "link") {
          var sel = window.getSelection(), range = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
          var inp = el("input", { type: "url", placeholder: "https://www.trlibrary.com/…" }), w = el("div"); w.appendChild(el("span", { "class": "hint" }, "Select the words first, then give the address.")); w.appendChild(inp);
          dialog({ title: "Link", body: w, buttons: [{ label: "Cancel" }, { label: "Add link", primary: true, onClick: function () {
            var u = inp.value.trim(); if (!/^(https:\/\/|mailto:|tel:|\/(?!\/))/i.test(u)) { toast("Use a full https:// address."); return false; }
            body.focus(); if (range) { sel.removeAllRanges(); sel.addRange(range); }
            document.execCommand("createLink", false, u); S.content.body = cleanBody(body.innerHTML); changed();
          } }] });
        } else { document.execCommand(cmd, false, null); S.content.body = cleanBody(body.innerHTML); changed(); }
      }
    });
    var body = $("#body");
    body.addEventListener("input", function () { S.content.body = cleanBody(body.innerHTML); changed(); });
    body.addEventListener("paste", function (e) { e.preventDefault(); var txt = (e.clipboardData || window.clipboardData).getData("text/plain"); document.execCommand("insertText", false, txt); });
    bindSets();

    $("#btnCopy").addEventListener("click", function () {
      var c = toConfig();
      if (handoff(c)) { toast("Fix the items marked in red first."); return; }
      copyText(snippet(c), "Code copied. Paste it into the GTM tag.");
    });
    $("#btnShare").addEventListener("click", function () {
      copyText(window.location.origin + window.location.pathname + "#c=" + b64e(JSON.stringify(toConfig())), "Share link copied");
    });
    $("#btnImport").addEventListener("click", function () {
      var ta = el("textarea", { rows: "9", spellcheck: "false", placeholder: "Paste the HTML from a TRPL Popup tag in GTM, or a share link" }); ta.className = "code"; ta.style.height = "190px";
      var w = el("div"); w.appendChild(el("span", { "class": "hint" }, "This replaces what is in the builder now.")); w.appendChild(ta);
      dialog({ title: "Import code", body: w, buttons: [{ label: "Cancel" }, { label: "Import", primary: true, onClick: function () {
        var c = parseImport(ta.value);
        if (!c || !c.format) { toast("That does not look like pop-up code. Copy the whole HTML box from the GTM tag."); return false; }
        var intact = !c._c || c._c === P.checksum(c);
        try { S = fromConfig(c); } catch (err) { toast("That code could not be read."); return false; }
        renderAll();
        toast(intact ? "Imported " + (c.id || "") : "Imported, but the code had been edited by hand. Check it carefully.");
      } }] });
    });
    $("#btnReset").addEventListener("click", function () {
      dialog({ title: "Start over?", body: el("p", null, "This clears everything in the builder. Pop-ups already in GTM are not affected."), buttons: [{ label: "Cancel" }, { label: "Start over", primary: true, onClick: function () { S = blank(); history.replaceState(null, "", window.location.pathname); renderAll(); } }] });
    });
    $("#devs").addEventListener("click", function (e) { var b = e.target.closest("[data-dev]"); if (!b) return; dev = b.getAttribute("data-dev"); $$("#devs button").forEach(function (x) { x.setAttribute("aria-pressed", x === b); }); fit(); setTimeout(sendPreview, 150); });
    $("#nChat").addEventListener("change", sendPreview); $("#nAlert").addEventListener("change", sendPreview);
    $("#btnReplay").addEventListener("click", sendPreview);
    window.addEventListener("resize", fit);
    window.addEventListener("message", function (e) {
      if (e.origin !== window.location.origin) return; var m = e.data || {};
      if (m.type === "trplpop-preview-ready") { frameReady = true; sendPreview(); }
      if (m.type === "trplpop-preview-event" && m.event === "show") { sendPreview.shown = true; $("#pstatus").textContent = ""; }
      if (m.type === "trplpop-preview-event" && m.event === "close" && m.action !== "replace") $("#pstatus").textContent = "Closed. Click Replay to see it again.";
      if (m.type === "trplpop-preview-status" && m.error) $("#pstatus").textContent = "";
    });
  }

  function start() {
    var fromHash = /#c=/.test(window.location.hash) ? parseImport(window.location.hash) : null;
    if (fromHash && fromHash.format) { try { S = fromConfig(fromHash); } catch (e) { S = null; } }
    else { try { var d = JSON.parse(localStorage.getItem("trplpop_builder_draft") || "null"); if (d && d.content && d.sets && d.theme && d.freq) { d.content.body = cleanBody(String(d.content.body || "")); S = d; } } catch (e) { S = null; } }
    if (!S) S = blank();
    bind(); fit(); renderAll();
    fetch("../data/sitemap.json").then(function (r) { return r.ok ? r.json() : Promise.reject(); }).then(function (j) { SITEMAP = j; renderSets(); changed(true); }).catch(function () { renderSets(); });
    try { frameReady = frameReady || !!$("#frame").contentWindow.TRPLPopup; } catch (e) {}
    if (frameReady) sendPreview();
  }

  start();
  window.__trplBuilder = { toConfig: toConfig, fromConfig: function (c) { S = fromConfig(c); renderAll(); }, snippet: snippet, parseImport: parseImport, localToISO: localToISO, isoToLocal: isoToLocal, state: function () { return S; } };
})();
