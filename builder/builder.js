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
  /*
   * Background photo: one recommended size per format, and the part of it that stays in view on every screen.
   * The photo is scaled to cover the pop-up, so wide pop-ups trim its top and bottom and narrow ones trim its sides.
   * Sizes come from measuring each format at computer, tablet and phone widths with short, typical and long messages
   * (pop-up shapes: banner 1.3 to 34 wide-to-tall, pop-up 0.8 to 3.7, slide-in 1.0 to 2.4, takeover 0.46 to 1.78).
   * "safe" is the middle area every one of those shapes shows.
   */
  var PHOTO_SPECS = {
    banner:   { w: 2400, h: 600,  safeW: 780, safeH: 70,   crop: "On computers a banner is a thin strip, so only a narrow band across the middle of the photo shows. A texture or a wide landscape works; faces and buildings do not." },
    popup:    { w: 1600, h: 1000, safeW: 780, safeH: 430,  crop: "Wide pop-ups on computers trim the top and bottom of the photo. Phones trim the sides." },
    slidein:  { w: 1200, h: 800,  safeW: 810, safeH: 500,  crop: "A short message trims the top and bottom of the photo. A long one trims the sides." },
    takeover: { w: 2400, h: 1600, safeW: 720, safeH: 1350, crop: "Computers trim a little off the top and bottom. Phones are tall and narrow, so they show only the middle third." }
  };
  /* Canva templates at those sizes, with the crop guides drawn in. Leave a link empty to hide it.
     These are the original designs, which open only for people the designs are shared with. To let anyone make
     their own copy, replace each with its Canva template link (in Canva: Share, then Template link). */
  var CANVA_TEMPLATES = {
    banner:   "https://www.canva.com/design/DAHWztAL01Q/edit",
    popup:    "https://www.canva.com/design/DAHWzmxD0Uo/edit",
    slidein:  "https://www.canva.com/design/DAHWzpikiKw/edit",
    takeover: "https://www.canva.com/design/DAHWzkUgY7A/edit"
  };
  var SHADES = [[0, "Not at all"], [0.4, "A little"], [0.65, "Medium"], [0.85, "A lot"]];
  var FOCUS = [["center", "The middle"], ["top", "The top"], ["bottom", "The bottom"], ["left", "The left side"], ["right", "The right side"]];
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
    { key: "banner-top", label: "Banner, top", note: "A strip across the top of the page", format: "banner", pos: "top", tag: "banner-top" },
    { key: "banner-bottom", label: "Banner, bottom", note: "A strip along the bottom", format: "banner", pos: "bottom", tag: "banner-bottom" },
    { key: "popup", label: "Pop-up", note: "A panel in the middle of the page", format: "popup", tag: "pop-up" },
    { key: "slidein", label: "Slide-in", note: "A small card in the corner", format: "slidein", tag: "slide-in" },
    { key: "takeover", label: "Takeover", note: "Fills the whole window", format: "takeover", tag: "takeover" }
  ];
  var ACTIONS = [
    /* [value, what it does, placeholder, label for its value, common?] */
    ["url", "Opens a web page", "https://www.trlibrary.com/tickets", "Web address", 1], ["close", "Closes the pop-up", "", "", 1],
    ["tel", "Calls a phone number", "+17015551234", "Phone number", 0], ["mailto", "Starts an email", "name@trlibrary.com", "Email address", 0],
    ["copy", "Copies text, such as a promo code", "WELCOME10", "Text to copy", 0], ["popup", "Opens another pop-up", "2026-10-fall-membership", "Reference name of the other pop-up", 0],
    ["event", "Sends a signal to Google Tag Manager", "membership_click", "Signal name", 0]
  ];
  var TRIGGERS = [["load", "Right away"], ["delay", "After a number of seconds"], ["scroll", "After scrolling this far down (percent)"], ["exit", "When someone is about to leave"], ["none", "Only when a link opens it"]];
  var OPS = [["starts", "Address starts with"], ["contains", "Address contains"], ["is", "Address is exactly"], ["ends", "Address ends with"], ["regex", "Matches a pattern (advanced)"]];
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
      var btn = el("button", { type: "button", "class": "mini-btn" + (bt.primary ? " pri" : "") }); btn.textContent = bt.label;
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
      name: "", id: "", idTouched: false, isEdit: false, btn2: false, whereSome: false,
      format: "popup", bannerPos: "top", slidePos: "bottom-right", size: "m", backdropClose: true, priority: 5,
      presetName: "White", theme: { bg: "#FFFFFF", text: "#25282A", head: "#092A4D", btnBg: "#E7805D", btnText: "#25282A" },
      photo: { url: "", shade: 0.65, focus: "center" },
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
    if (S.photo.url.trim()) { c.theme.photo = { url: S.photo.url.trim(), shade: S.photo.shade }; if (S.photo.focus !== "center") c.theme.photo.focus = S.photo.focus; }
    var ct = {}, sc = S.content;
    if (sc.eyebrow.trim()) ct.eyebrow = sc.eyebrow.trim();
    if (sc.headline.trim()) ct.headline = sc.headline.trim();
    if (sc.body && sc.body.replace(/<[^>]*>/g, "").trim()) ct.body = sc.body;
    if (S.format !== "banner" && sc.image.url.trim() && sc.image.pos !== "bg") {
      ct.image = { url: sc.image.url.trim(), alt: sc.image.alt.trim(), pos: sc.image.pos };
      if (S.hideImagePhone) ct.hide = { image: "phone" };
    }
    ct.buttons = sc.buttons.filter(function (b, i) { return b.label.trim() && (i === 0 || S.btn2); }).map(function (b, i) {
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
  function importPhoto(p) {
    p = p && typeof p === "object" ? p : {};
    var sh = typeof p.shade === "number" && p.shade >= 0 && p.shade <= 0.95 ? p.shade : 0.65;
    return { url: str(p.url, 500), shade: sh, focus: oneOf(p.focus, FOCUS.map(function (f) { return f[0]; }), "center") };
  }
  /* Takeovers used to carry their background as a picture placed "behind the text". It is now the background photo. */
  function adoptOldBackground(s, tint) {
    if (s.content.image.pos !== "bg") return;
    if (s.content.image.url && !s.photo.url) { s.photo.url = s.content.image.url; s.photo.shade = typeof tint === "number" && tint >= 0 && tint <= 0.95 ? tint : 0.72; }
    s.content.image = { url: "", alt: "", pos: "top" };
  }
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
    s.photo = importPhoto(th.photo);
    adoptOldBackground(s, th.imageTint);
    s.hideImagePhone = obj(ct.hide).image === "phone";
    arr(ct.buttons).slice(0, 2).forEach(function (b, i) { b = obj(b); s.content.buttons[i] = { label: str(b.label, 40), action: oneOf(b.action, ACTIONS.map(function (a) { return a[0]; }), "url"), value: str(b.value, 500), newTab: !!b.newTab, convert: !!b.convert }; });
    s.btn2 = !!s.content.buttons[1].label;
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
    s.whereSome = s.sets[0].include.length > 0;
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
  /* Pages, in plain words                                               */
  /* ------------------------------------------------------------------ */
  var SECTION_NAMES = {
    visit: "Plan a visit", tr: "T.R. history", video: "Videos", quiz: "Quizzes", podcast: "Podcast", about: "About the Library",
    "staff-members": "Staff pages", calendar: "Calendar and events", support: "Support and giving", membership: "Membership",
    tickets: "Tickets", research: "Research", project: "Project updates", "grand-opening": "Grand opening",
    "private-events": "Private events", press: "Press"
  };
  var HIDDEN_SECTIONS = { node: 1, privacy: 1, rsvp: 1, user: 1 };
  var STANDING_NAMES = [["ends", "/print", "Print views"], ["starts", "/tickets", "Ticket pages"], ["starts", "/rsvp", "RSVP pages"],
    ["starts", "/privacy", "Privacy page"], ["starts", "/node/", "Pages without a proper address"], ["starts", "/user", "Staff sign-in pages"]];
  var STEPS = ["Format", "Message", "Look", "Where & when", "Publish"];
  var FREQ_CLOSE = [["days:1", "Wait a day, then it can show again"], ["days:7", "Wait a week"], ["days:30", "Wait 30 days"], ["days:90", "Wait 90 days"],
    ["session", "Show it again on their next visit"], ["always", "Keep showing it every time"], ["never", "Never show it to them again"]];
  var FREQ_CONV = [["days:30", "Leave them alone for 30 days"], ["days:90", "Leave them alone for 90 days"], ["days:365", "Leave them alone for a year"], ["never", "Never show it to them again"]];
  var step = 0;

  function sectionOf(c) { var m = /^\^\/([a-z0-9-]+)\(\/\|\$\)$/i.exec(c.op === "regex" ? String(c.v) : ""); return m ? m[1].toLowerCase() : ""; }
  function describe(c) {
    if (c.op === "home") return "Home page";
    for (var i = 0; i < STANDING_NAMES.length; i++) if (STANDING_NAMES[i][0] === c.op && STANDING_NAMES[i][1] === c.v) return STANDING_NAMES[i][2];
    var seg = sectionOf(c);
    if (seg) return esc(SECTION_NAMES[seg] || "/" + seg + " section");
    if (c.op === "is") return "<code>" + esc(c.v) + "</code>";
    var w = { starts: "addresses starting with", contains: "addresses containing", ends: "addresses ending in", regex: "pattern" }[c.op] || "rule";
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
    return Object.keys(counts).filter(function (k) { return counts[k] >= 2 && !HIDDEN_SECTIONS[k]; }).sort(function (a, b) { return counts[b] - counts[a]; }).map(function (k) { return { seg: k, n: counts[k] }; });
  }
  function matches(s) { return SITEMAP.paths.filter(function (p) { return P.matchPath(s, p); }); }
  function sameCond(a, b) { return a.op === b.op && String(a.v || "") === String(b.v || ""); }
  function addCond(s, list, cond) {
    if (!s[list].some(function (c) { return sameCond(c, cond); })) s[list].push(cond);
    var other = list === "include" ? "exclude" : "include";
    s[other] = s[other].filter(function (c) { return !sameCond(c, cond); });
  }
  function chips(s, list) {
    return s[list].map(function (c, j) { return "<span class='chip" + (list === "exclude" ? " ex" : "") + "'>" + describe(c) + "<button type='button' data-act='rm' data-list='" + list + "' data-j='" + j + "' aria-label='Remove'>×</button></span>"; }).join("");
  }
  function matchHTML(s) {
    var total = SITEMAP.paths.length;
    if (!total) return "<div class='match'>The list of site pages could not be loaded, so matching pages cannot be shown.</div>";
    var m = matches(s);
    return "<div class='match" + (m.length ? "" : " zero") + "' data-match><strong>" + (m.length ? "It will appear on " + m.length.toLocaleString("en-US") + " of the site’s " + total.toLocaleString("en-US") + " pages." : "No page on the site matches, so nobody would see it.") + "</strong>" +
      (m.length ? "<details><summary>See the pages</summary><ul>" + m.slice(0, 400).map(function (p) { return "<li>" + esc(p) + "</li>"; }).join("") + (m.length > 400 ? "<li>… and " + (m.length - 400) + " more</li>" : "") + "</ul></details>" : "") + "</div>";
  }
  function pagePicker(s, i, simple) {
    var some = simple ? S.whereSome : true, h = "";
    if (simple) {
      h += "<label class='opt'><input type='radio' name='where0' value='all'" + (some ? "" : " checked") + "><span>On every page<small>Apart from the skipped pages below.</small></span></label>" +
        "<label class='opt'><input type='radio' name='where0' value='some'" + (some ? " checked" : "") + "><span>Only on certain pages<small>Pick whole sections of the site, or single pages.</small></span></label>";
    }
    if (some) {
      h += "<div class='subhead'>Sections of the site</div><div class='chips'>" +
        "<button type='button' class='mini-btn' data-act='sec' data-seg='' aria-pressed='" + s.include.some(function (c) { return c.op === "home"; }) + "'>Home page</button>" +
        sections().map(function (x) {
          var on = s.include.some(function (c) { return sectionOf(c) === x.seg; });
          return "<button type='button' class='mini-btn' data-act='sec' data-seg='" + esc(x.seg) + "' aria-pressed='" + on + "' title='/" + esc(x.seg) + "'>" + esc(SECTION_NAMES[x.seg] || "/" + x.seg) + " <span class='n'>" + x.n + "</span></button>";
        }).join("") + "</div>" +
        "<div class='subhead'>Showing on</div><div class='chips'>" + (s.include.length ? chips(s, "include") : "<span class='empty'>" + (simple ? "Nothing chosen yet. Pick a section above, or find a page below." : "Every page") + "</span>") + "</div>";
    }
    h += "<div class='subhead'>Find a specific page</div><input type='text' data-act='search' placeholder='Type part of its address, for example: hours' spellcheck='false'><div class='results' hidden></div>" +
      "<div class='subhead'>Skipped pages</div><span class='hint'>Skipped automatically, so a pop-up never gets in the way of buying tickets or sending an RSVP. Remove any you do want it on.</span>" +
      "<div class='chips'>" + (s.exclude.length ? chips(s, "exclude") : "<span class='empty'>No pages are skipped.</span>") + "</div>" + matchHTML(s);
    return "<div class='setui' data-set='" + i + "'>" + h + "</div>";
  }
  function condsHTML(s, i) {
    return "<div class='setui' data-set='" + i + "'>" + s.conds.map(function (c, j) {
      return "<div class='row' data-cond='" + j + "' style='margin-top:.4rem'>" +
        "<select data-cf='t' class='fix' style='flex-basis:150px'><option value='query'" + (c.t === "query" ? " selected" : "") + ">The link they followed has</option><option value='referrer'" + (c.t === "referrer" ? " selected" : "") + ">They came from</option></select>" +
        (c.t === "query" ? "<input type='text' data-cf='k' placeholder='utm_source' value='" + esc(c.k) + "' spellcheck='false' aria-label='Tag in the link'>" : "") +
        "<select data-cf='op' class='fix' style='flex-basis:112px'>" + (c.t === "query" ? [["is", "equal to"], ["contains", "containing"], ["exists", "(any value)"]] : [["contains", "a site containing"], ["empty", "nowhere (typed it in)"]]).map(function (o) { return "<option value='" + o[0] + "'" + (c.op === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select>" +
        (c.op === "exists" || c.op === "empty" ? "" : "<input type='text' data-cf='v' value='" + esc(c.v) + "' placeholder='" + (c.t === "query" ? "newsletter" : "facebook.com") + "' spellcheck='false' aria-label='Value'>") +
        "<label class='check fix' style='margin:0'><input type='checkbox' data-cf='not'" + (c.not ? " checked" : "") + "> not</label>" +
        "<button type='button' class='mini-btn fix' data-act='rmcond' data-j='" + j + "' aria-label='Remove'>×</button></div>";
    }).join("") + "<button type='button' class='mini-btn' data-act='addcond' style='margin-top:.5rem'>Add a condition</button></div>";
  }
  function whenHTML(s) {
    var t = s.trigger, pct = +t.percent || 50, names = { 25: "a quarter of the way", 50: "halfway", 75: "three quarters of the way" };
    function opt(v, inner, small) { return "<label class='opt'><input type='radio' name='when0' value='" + v + "'" + (t.type === v ? " checked" : "") + "><span>" + inner + (small ? "<small>" + small + "</small>" : "") + "</span></label>"; }
    var pctOpts = [25, 50, 75]; if (pctOpts.indexOf(pct) < 0) pctOpts.push(pct);
    return opt("load", "Right away", "As soon as the page opens.") +
      opt("delay", "After <input type='number' min='1' max='600' data-f='seconds' value='" + (+t.seconds || 5) + "' aria-label='Seconds'> seconds on the page") +
      opt("scroll", "After scrolling <select data-f='percent' aria-label='How far'>" + pctOpts.map(function (p) { return "<option value='" + p + "'" + (p === pct ? " selected" : "") + ">" + (names[p] || p + "% of the way") + "</option>"; }).join("") + "</select> down the page") +
      opt("exit", "When someone is about to leave", "On a computer, when the pointer heads for the top of the window. On a phone, on a quick scroll back up.") +
      opt("none", "Only when a link opens it", "Nothing automatic. Any link on the site can open it." + (S.id ? " Link to: <code>#popup:" + esc(S.id) + "</code>" : ""));
  }
  function renderWhere() {
    var s0 = S.sets[0];
    $("#where0").innerHTML = pagePicker(s0, 0, true);
    $("#when0").innerHTML = "<div class='setui' data-set='0'>" + whenHTML(s0) + "</div>";
    $("#whenBlock").hidden = S.mode === "gtm";
    $("#tester").innerHTML = "<div class='setui row' data-set='0'><input type='text' data-act='test' placeholder='Paste or type an address, for example /visit/hours' spellcheck='false'><span class='fix' data-testout style='min-width:120px;font-size:13.5px'></span></div>";
    $("#handRule").innerHTML = "<div class='setui row' data-set='0'><select data-f='op' class='fix' style='flex-basis:190px'>" + OPS.map(function (o) { return "<option value='" + o[0] + "'>" + o[1] + "</option>"; }).join("") + "</select><input type='text' data-f='val' placeholder='/visit' spellcheck='false' aria-label='Address or part of one'><button type='button' class='mini-btn fix' data-act='addinc'>Show here</button><button type='button' class='mini-btn fix' data-act='addexc'>Skip</button></div>";
    $("#conds0").innerHTML = condsHTML(s0, 0);
    var extra = "";
    if (S.mode !== "gtm") {
      S.sets.slice(1).forEach(function (s, k) {
        var i = k + 1;
        extra += "<div class='setbox'><div class='row' style='margin-top:.5rem'><strong>Rule set " + (i + 1) + "</strong><span class='setui fix' data-set='" + i + "'><button type='button' class='mini-btn' data-act='delset'>Remove</button></span></div>" + pagePicker(s, i, false) +
          "<div class='setui' data-set='" + i + "'><div class='subhead'>When</div><div class='row'><select data-f='trig'>" + TRIGGERS.map(function (t) { return "<option value='" + t[0] + "'" + (s.trigger.type === t[0] ? " selected" : "") + ">" + t[1] + "</option>"; }).join("") + "</select>" +
          (s.trigger.type === "delay" ? "<input type='number' class='fix' style='flex-basis:90px' min='0' max='600' data-f='seconds' value='" + (+s.trigger.seconds || 0) + "' aria-label='Seconds'>" : s.trigger.type === "scroll" ? "<input type='number' class='fix' style='flex-basis:90px' min='1' max='100' data-f='percent' value='" + (+s.trigger.percent || 50) + "' aria-label='Percent'>" : "") + "</div></div></div>";
      });
      extra += "<div class='setui' data-set='0'><button type='button' class='mini-btn' data-act='addset' style='margin-top:.5rem'>Add a set of rules</button></div>";
    } else extra = "<span class='hint'>Not used when Google Tag Manager decides the timing.</span>";
    $("#moreSets").innerHTML = extra;
  }
  function bindWhere() {
    var form = $("#form");
    form.addEventListener("click", function (e) {
      var t = e.target.closest("[data-act]"); if (!t) return;
      var ui = t.closest(".setui"); if (!ui) return;
      var i = +ui.getAttribute("data-set"), s = S.sets[i], act = t.getAttribute("data-act");
      if (act === "delset") { S.sets.splice(i, 1); }
      else if (act === "addset") { S.sets.push(newSet()); }
      else if (act === "rm") { s[t.getAttribute("data-list")].splice(+t.getAttribute("data-j"), 1); }
      else if (act === "sec") {
        var seg = t.getAttribute("data-seg"), cond = seg ? { t: "path", op: "regex", v: "^/" + seg + "(/|$)" } : { t: "path", op: "home", v: "" };
        var has = s.include.some(function (c) { return sameCond(c, cond); });
        if (has) s.include = s.include.filter(function (c) { return !sameCond(c, cond); }); else addCond(s, "include", cond);
      }
      else if (act === "addinc" || act === "addexc") {
        var v = ui.querySelector("[data-f=val]").value.trim(), op = ui.querySelector("[data-f=op]").value;
        if (!v) { toast("Type an address, or part of one, first."); return; }
        if (op === "regex") {
          try { new RegExp(v); } catch (err) { toast("That pattern is not valid."); return; }
          if (/\(\?[=!<]|\\[1-9]/.test(v)) { toast("Google Tag Manager cannot use that kind of pattern. Simplify it."); return; }
          if (/\([^)]*[+*][^)]*\)\s*[+*{]/.test(v)) { toast("That pattern repeats a repeat, which can freeze a browser. Simplify it."); return; }
        } else if (v.charAt(0) !== "/" && op !== "contains" && op !== "ends") v = "/" + v;
        addCond(s, act === "addinc" ? "include" : "exclude", { t: "path", op: op, v: v });
        if (act === "addinc" && i === 0) S.whereSome = true;
      }
      else if (act === "pick" || act === "pickex") {
        addCond(s, act === "pick" ? "include" : "exclude", { t: "path", op: "is", v: t.getAttribute("data-p") });
        if (act === "pick" && i === 0) S.whereSome = true;
      }
      else if (act === "addcond") { s.conds.push({ t: "query", k: "", op: "is", v: "", not: false }); }
      else if (act === "rmcond") { s.conds.splice(+t.getAttribute("data-j"), 1); }
      else return;
      renderWhere(); changed();
    });
    form.addEventListener("input", function (e) {
      var t = e.target, ui = t.closest(".setui"); if (!ui) return;
      var i = +ui.getAttribute("data-set"), s = S.sets[i], act = t.getAttribute("data-act");
      if (act === "search") {
        var qv = t.value.trim().toLowerCase(), res = ui.querySelector(".results");
        if (qv.length < 2) { res.hidden = true; return; }
        var hits = SITEMAP.paths.filter(function (p) { return p.toLowerCase().indexOf(qv) > -1; }).slice(0, 40);
        res.hidden = false;
        res.innerHTML = hits.length ? hits.map(function (p) {
          return "<div><span class='mono' title='" + esc(p) + "'>" + esc(p) + "</span><button type='button' class='mini-btn' data-act='pick' data-p='" + esc(p) + "'>Show here</button><button type='button' class='mini-btn' data-act='pickex' data-p='" + esc(p) + "'>Skip</button></div>";
        }).join("") : "<div><span class='empty'>No page on the site has that in its address.</span></div>";
        return;
      }
      if (act === "test") {
        var out = ui.querySelector("[data-testout]"), v = t.value.trim();
        if (!v) { out.textContent = ""; return; }
        try { if (/^https?:\/\//i.test(v)) v = new URL(v).pathname; } catch (err) {}
        if (v.charAt(0) !== "/") v = "/" + v;
        var ok = P.matchPath(s, v.split("?")[0].split("#")[0]);
        out.innerHTML = ok ? "<b style='color:#1B4532'>It would show</b>" : "<b style='color:#A8321E'>It would not show</b>";
        return;
      }
      var f = t.getAttribute("data-f");
      if (f === "seconds") { s.trigger.seconds = +t.value; if (i === 0) { s.trigger.type = "delay"; var r = $("#when0 input[value=delay]"); if (r) r.checked = true; } changed(); return; }
      if (f === "percent" && t.tagName === "INPUT") { s.trigger.percent = +t.value; changed(); return; }
      var cf = t.getAttribute("data-cf");
      if (cf === "k" || cf === "v") { s.conds[+t.closest("[data-cond]").getAttribute("data-cond")][cf] = t.value; changed(); }
    });
    form.addEventListener("change", function (e) {
      var t = e.target;
      if (t.name === "where0") {
        S.whereSome = t.value === "some";
        if (!S.whereSome && S.sets[0].include.length) { S.sets[0].include = []; toast("Now showing on every page."); }
        renderWhere(); changed(); return;
      }
      var ui = t.closest(".setui"); if (!ui) return;
      var i = +ui.getAttribute("data-set"), s = S.sets[i];
      if (t.name === "when0") { s.trigger.type = t.value; changed(); return; }
      var f = t.getAttribute("data-f");
      if (f === "trig") { s.trigger.type = t.value; renderWhere(); changed(); return; }
      if (f === "percent" && t.tagName === "SELECT") { s.trigger.percent = +t.value; s.trigger.type = "scroll"; var r = $("#when0 input[value=scroll]"); if (r) r.checked = true; changed(); return; }
      var cf = t.getAttribute("data-cf");
      if (cf === "t" || cf === "op" || cf === "not") {
        var c = s.conds[+t.closest("[data-cond]").getAttribute("data-cond")];
        if (cf === "not") c.not = t.checked; else c[cf] = t.value;
        if (cf === "t") { c.op = c.t === "query" ? "is" : "contains"; c.k = ""; c.v = ""; }
        renderWhere(); changed();
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* The other controls                                                  */
  /* ------------------------------------------------------------------ */
  function freqValue(o) { return o.mode === "days" ? "days:" + (+o.days || 30) : o.mode; }
  function freqOptions(list, o) {
    var cur = freqValue(o), opts = list.slice();
    if (!opts.some(function (x) { return x[0] === cur; }) && o.mode === "days") opts.splice(0, 0, [cur, "Wait " + (+o.days) + " days"]);
    else if (!opts.some(function (x) { return x[0] === cur; })) opts = FREQ_CLOSE.filter(function (x) { return x[0] === cur; }).concat(opts);
    return opts.map(function (x) { return "<option value='" + x[0] + "'" + (x[0] === cur ? " selected" : "") + ">" + x[1] + "</option>"; }).join("");
  }
  function renderCards() {
    $("#formats").innerHTML = FORMATS.map(function (f) {
      return "<button type='button' class='card' data-fmt='" + f.key + "' aria-pressed='" + (formatKey() === f.key) + "'><span class='mini m-" + f.key + "' aria-hidden='true'><span class='pg'>" + (f.key === "popup" ? "<span class='dim'></span>" : "") + "<span class='el'></span></span></span><span class='t'>" + f.label + "<small>" + f.note + "</small></span></button>";
    }).join("");
    $("#presets").innerHTML = PRESETS.map(function (p, i) {
      return "<button type='button' class='card preset' data-preset='" + i + "' aria-pressed='" + (S.presetName === p.name) + "'><span class='sample' style='background:" + p.bg + ";color:" + p.text + "'><b style='color:" + p.head + "'>Headline</b><u style='background:" + p.btnBg + ";color:" + p.btnText + "'>Button</u></span><span class='t'>" + esc(p.name) + "</span></button>";
    }).join("");
    $("#colors").innerHTML = COLOR_ROLES.map(function (r) {
      return "<span class='lb' style='margin-top:.7rem'>" + r[1] + "</span><div class='swatches' data-role='" + r[0] + "'>" + PALETTE.map(function (c) { return "<button type='button' title='" + c.name + "' aria-label='" + r[1] + ": " + c.name + "' data-hex='" + c.hex + "' style='background:" + c.hex + "' aria-pressed='" + (S.theme[r[0]].toLowerCase() === c.hex.toLowerCase()) + "'></button>"; }).join("") + "</div>";
    }).join("");
    $("#devices").innerHTML = [["desktop", "Computers"], ["tablet", "Tablets"], ["phone", "Phones"]].map(function (d) { return "<label class='check' style='margin-top:0'><input type='checkbox' data-dev-rule='" + d[0] + "'" + (S.devices[d[0]] ? " checked" : "") + "> " + d[1] + "</label>"; }).join("");
    $("#days").innerHTML = DAYS.map(function (d, i) { return "<label class='check' style='margin-top:.2rem'><input type='checkbox' data-day='" + i + "'" + (S.days.indexOf(i) > -1 ? " checked" : "") + "> " + d + "</label>"; }).join("");
    var hard = [];
    if (ratio(S.theme.text, S.theme.bg) < 4.5) hard.push("the text");
    if (ratio(S.theme.head, S.theme.bg) < 3) hard.push("the headline");
    if (ratio(S.theme.btnText, S.theme.btnBg) < 4.5) hard.push("the button");
    var v = $("#contrast");
    v.className = "verdict" + (hard.length ? " no" : "");
    v.textContent = hard.length ? "Hard to read: " + hard.join(", ") + ". Try another combination." : "✓ Easy to read. These colors have enough contrast.";
    $("#freqClose").innerHTML = freqOptions(FREQ_CLOSE, S.freq.close);
    $("#freqConv").innerHTML = freqOptions(FREQ_CONV, S.freq.convert);
  }
  /* Readability over a photo. The shade is the look's background colour laid over the photo, so what sits behind
     the words is somewhere between "shade over black" and "shade over white". The worse of the two is what counts. */
  function mix(hexA, a, grey) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hexA || "") || [0, "000000"], n = parseInt(m[1], 16);
    function ch(v) { v = Math.round(a * v + (1 - a) * grey).toString(16); return v.length < 2 ? "0" + v : v; }
    return "#" + ch((n >> 16) & 255) + ch((n >> 8) & 255) + ch(n & 255);
  }
  function worstOverPhoto(textHex, bgHex, shade) {
    var lo = mix(bgHex, shade, 0), hi = mix(bgHex, shade, 255), t = lum(textHex);
    if (t > lum(lo) && t < lum(hi)) return 1;
    return Math.min(ratio(textHex, lo), ratio(textHex, hi));
  }
  function photoReadability() {
    var t = S.theme, sh = S.photo.shade;
    return Math.min(worstOverPhoto(t.text, t.bg, sh) / 4.5, worstOverPhoto(t.head, t.bg, sh) / 3);   // 1 or more = fine over any photo
  }
  function renderPhoto() {
    if (!S.photo) S.photo = { url: "", shade: 0.65, focus: "center" };
    var fmt = S.format, spec = PHOTO_SPECS[fmt], info = formatInfo(), what = fmt === "popup" ? "pop-up" : fmt === "slidein" ? "slide-in" : fmt, has = !!S.photo.url.trim();
    var dark = lum(S.theme.bg) < 0.25;
    $("#photoWhat").textContent = what;
    $("#photoOpts").hidden = !has;
    $("#photoShadeLabel").textContent = dark ? "Darken the photo" : "Lighten the photo";
    var near = SHADES.reduce(function (best, x) { return Math.abs(x[0] - S.photo.shade) < Math.abs(best[0] - S.photo.shade) ? x : best; }, SHADES[0]);
    $("#photoShade").innerHTML = SHADES.map(function (x) { return "<option value='" + x[0] + "'" + (x === near ? " selected" : "") + ">" + x[1] + "</option>"; }).join("");
    $("#photoFocus").innerHTML = FOCUS.map(function (x) { return "<option value='" + x[0] + "'" + (x[0] === S.photo.focus ? " selected" : "") + ">" + x[1] + "</option>"; }).join("");
    $("#photoShadeHint").textContent = "A layer of the background color goes over the photo so the words stand out. More of it means easier reading and less photo.";
    var r = photoReadability(), v = $("#photoVerdict"), side = dark ? "bright" : "dark";
    v.className = "verdict" + (r >= 1 ? "" : r >= 0.6 ? " maybe" : " no");
    v.textContent = r >= 1 ? "\u2713 Easy to read over any photo."
      : r >= 0.6 ? "Readable over most photos. Check the preview: words over very " + side + " parts of the photo are harder to read."
      : "Hard to read where the words sit over " + side + " parts of the photo. " + (dark ? "Darken" : "Lighten") + " it more.";
    var looks = $("#photoLooks");
    looks.hidden = dark || !has;
    if (!looks.hidden) looks.innerHTML = "This look has dark words, so the layer lightens the photo. For a darkened photo with light words, switch to a dark look:<br>" +
      PRESETS.map(function (p, i) { return lum(p.bg) < 0.25 ? "<button type='button' class='mini-btn' data-preset='" + i + "'>" + esc(p.name) + "</button>" : ""; }).join("");
    var k = 96 / spec.w, fw = Math.round(spec.w * k), fh = Math.max(8, Math.round(spec.h * k)), sw = Math.max(3, Math.round(spec.safeW * k)), shh = Math.max(3, Math.round(spec.safeH * k));
    var link = CANVA_TEMPLATES[fmt];
    $("#photoSpec").innerHTML =
      "<span class='frame' aria-hidden='true' style='width:" + fw + "px;height:" + fh + "px'><i style='left:" + Math.round((fw - sw) / 2) + "px;top:" + Math.round((fh - shh) / 2) + "px;width:" + sw + "px;height:" + shh + "px'></i></span>" +
      "Best photo size for a " + what + "<b class='dim' id='photoDim'>" + spec.w.toLocaleString("en-US") + " \u00d7 " + spec.h.toLocaleString("en-US") + " pixels</b>" +
      "<p>" + spec.crop + "</p>" +
      "<p>Keep anything that matters inside the middle <b id='photoSafe'>" + spec.safeW.toLocaleString("en-US") + " \u00d7 " + spec.safeH.toLocaleString("en-US") + "</b> pixels (the shaded box). Every screen shows that part.</p>" +
      "<p>Save it as a JPG, under about 500 KB. Then check Computer, Tablet and Phone in the preview.</p>" +
      (link ? "<a class='canva' id='photoCanva' href='" + esc(link) + "' target='_blank' rel='noopener'>Open the Canva template for this size</a><span class='hint'>The template is already " + spec.w.toLocaleString("en-US") + " \u00d7 " + spec.h.toLocaleString("en-US") + " and shows the crop lines. Place the photo, delete the guide layer, download as JPG.</span>" : "");
  }
  function buttonEditor(i) {
    var b = S.content.buttons[i], a = ACTIONS.filter(function (x) { return x[0] === b.action; })[0] || ACTIONS[0];
    var common = ACTIONS.filter(function (x) { return x[4]; }), rare = ACTIONS.filter(function (x) { return !x[4]; });
    function o(x) { return "<option value='" + x[0] + "'" + (x[0] === b.action ? " selected" : "") + ">" + x[1] + "</option>"; }
    return "<div class='btnbox'><div class='row'><label><span class='lb'>" + (i ? "Second button text" : "Button text") + "</span><input type='text' data-b='" + i + "' data-bf='label' maxlength='40' value='" + esc(b.label) + "' placeholder='" + (i ? "Not now" : "Reserve tickets") + "'></label>" +
      "<label><span class='lb'>What it does</span><select data-b='" + i + "' data-bf='action'>" + common.map(o).join("") + "<optgroup label='Less common'>" + rare.map(o).join("") + "</optgroup></select></label></div>" +
      (b.action === "close" ? "" : "<label><span class='lb'>" + a[3] + "</span><input type='text' data-b='" + i + "' data-bf='value' value='" + esc(b.value) + "' placeholder='" + esc(a[2]) + "' spellcheck='false'></label>") +
      (b.action === "url" ? "<label class='check'><input type='checkbox' data-b='" + i + "' data-bf='newTab'" + (b.newTab ? " checked" : "") + "> Open it in a new tab</label>" : "") +
      (i ? "<button type='button' class='linkish' id='rmBtn2' style='margin-top:.6rem'>Remove the second button</button>" : "") + "</div>";
  }
  function renderButtons() {
    $("#btn0").innerHTML = buttonEditor(0);
    $("#btn1wrap").innerHTML = S.btn2 ? buttonEditor(1) : "<button type='button' class='linkish' id='addBtn2' style='margin-top:.7rem'>+ Add a second button</button>";
    renderConvOpts();
  }
  function renderConvOpts() {
    var rows = [0, 1].filter(function (i) { return (i === 0 || S.btn2) && S.content.buttons[i].action !== "close"; }).map(function (i) {
      var b = S.content.buttons[i];
      return "<label class='check'><input type='checkbox' data-b='" + i + "' data-bf='convert'" + (b.convert ? " checked" : "") + "> Count a click on " + (b.label ? "“" + esc(b.label) + "”" : "button " + (i + 1)) + " as a success</label>";
    }).join("");
    $("#convOpts").innerHTML = rows ? "<h4>Measuring success</h4><span class='hint'>A success is reported to Google Analytics, and stops the pop-up showing to that person for a while.</span>" + rows : "";
  }
  function syncStatic() {
    $$("[data-k]").forEach(function (inp) {
      var v = get(S, inp.getAttribute("data-k"));
      if (inp.type === "checkbox") inp.checked = !!v; else if (document.activeElement !== inp) inp.value = v == null ? "" : v;
    });
    var fmt = S.format;
    $("#optPopup").hidden = fmt !== "popup"; $("#optSlide").hidden = fmt !== "slidein"; $("#optBackdrop").hidden = fmt !== "popup";
    $("#imageBlock").hidden = fmt === "banner"; $("#formBlock").hidden = fmt === "banner"; $("#optHideImg").hidden = fmt === "banner";
    var opts = fmt === "popup" ? [["top", "On top"], ["left", "On the left"], ["right", "On the right"]] : fmt === "takeover" ? [["top", "Above the text"]] : [["top", "On top"]];
    if (!opts.some(function (o) { return o[0] === S.content.image.pos; })) S.content.image.pos = opts[0][0];
    $("#imgPos").innerHTML = opts.map(function (o) { return "<option value='" + o[0] + "'" + (o[0] === S.content.image.pos ? " selected" : "") + ">" + o[1] + "</option>"; }).join("");
    $("#gtmMode").checked = S.mode === "gtm";
    renderPhoto();
    var body = $("#body"); if (document.activeElement !== body && body.innerHTML !== S.content.body) body.innerHTML = S.content.body;
  }
  /* Open "More options" where a loaded pop-up already uses something inside it. */
  function openUsedOptions() {
    var c = S.content;
    $("#more1").open = !!(c.eyebrow || c.form.formId || S.hideImagePhone);
    $("#more2").open = !S.presetName;
    $("#more3").open = !!(S.days.length || S.from || S.to || S.sets.length > 1 || S.sets[0].conds.length || S.mode === "gtm" || S.sets.some(function (s) { return s.include.concat(s.exclude).some(function (x) { return x.op === "regex" && !sectionOf(x); }); }));
  }
  function renderSteps() {
    var todo = {}; checks(toConfig()).forEach(function (x) { if (x[0] === "stop") todo[x[2]] = true; });
    $("#stepper").innerHTML = STEPS.map(function (s, i) { return "<button type='button' data-go='" + i + "'" + (i === step ? " aria-current='step'" : "") + (todo[i] && i !== step ? " class='todo' title='Something here needs attention'" : "") + "><i>" + (i + 1) + "</i>" + s + "</button>"; }).join("");
    $$(".step").forEach(function (el) { el.hidden = +el.getAttribute("data-step") !== step; });
    $("#prev").hidden = step === 0;
    var nx = $("#next"); nx.hidden = step === STEPS.length - 1; if (!nx.hidden) nx.textContent = "Next: " + STEPS[step + 1];
  }
  function goStep(n) {
    step = Math.max(0, Math.min(STEPS.length - 1, n));
    renderSteps();
    $("#form").scrollTop = 0;
  }
  function renderAll() { syncStatic(); renderCards(); renderButtons(); renderWhere(); openUsedOptions(); changed(true); }

  /* ------------------------------------------------------------------ */
  /* Checks and hand-off                                                 */
  /* ------------------------------------------------------------------ */
  function checks(c) {
    var out = [], ct = c.content || {}, text = [ct.eyebrow, ct.headline, (ct.body || "").replace(/<[^>]*>/g, " ")].concat((ct.buttons || []).map(function (b) { return b.label; })).join(" ");
    function add(level, msg, st) { out.push([level, msg, st]); }
    if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(c.id || "")) add("stop", S.name.trim() ? "The reference name can only use lowercase letters, numbers and hyphens." : "Give the pop-up a name.", 0);
    if (!ct.headline && !ct.body) add("stop", "Add a headline or some text.", 1);
    (ct.buttons || []).forEach(function (b, i) {
      if (b.action === "url" && !okUrl(b.value, true)) add("stop", "The button “" + b.label + "” needs a full web address starting with https://", 1);
      else if (b.action !== "url" && b.action !== "close" && !b.value) add("stop", "The button “" + b.label + "” needs more information for what it does.", 1);
    });
    if (ct.image && !okUrl(ct.image.url)) add("stop", "The picture’s address must start with https://", 1);
    if (ct.image && ct.image.pos !== "bg" && !ct.image.alt) add("warn", "Describe the picture for people who cannot see it.", 1);
    if (ct.form && !/^[A-Za-z0-9-]{8,64}$/.test(ct.form.formId)) add("stop", "The sign-up form ID does not look right.", 1);
    if (ct.form && !ct.form.fallbackUrl) add("warn", "Add a back-up link for the sign-up form in case the form does not load.", 1);
    if (!(ct.buttons || []).length && !ct.form && c.format !== "banner") add("warn", "There is no button, so people can only close it.", 1);
    if (c.format === "banner" && ((ct.headline || "") + (ct.body || "").replace(/<[^>]*>/g, "")).length > 110) add("warn", "That is a lot of words for a banner. It will run to several lines on phones.", 1);
    TERMS.forEach(function (t) { if (t[0].test(text)) add("warn", t[1], 1); });
    if (c.theme.photo && !okUrl(c.theme.photo.url)) add("stop", "The background photo\u2019s address must start with https://", 2);
    else if (c.theme.photo && photoReadability() < 0.6) add("warn", "The words may be hard to read over the background photo.", 2);
    if (ratio(c.theme.text, c.theme.bg) < 4.5 || ratio(c.theme.head, c.theme.bg) < 3 || ratio(c.theme.btnText, c.theme.btnBg) < 4.5) add("warn", "Some of the wording is hard to read in these colors.", 2);
    if (S.mode !== "gtm" && S.whereSome && !S.sets[0].include.length) add("stop", "Choose at least one section or page, or switch to “On every page”.", 3);
    if (!S.devices.desktop && !S.devices.tablet && !S.devices.phone) add("stop", "Choose at least one kind of device.", 3);
    if ((S.from && !S.to) || (!S.from && S.to)) add("warn", "The hours need both a “from” and an “until”. With one missing they are ignored.", 3);
    var sch = (c.rules || {}).schedule || {};
    if (!sch.end) add("warn", "There is no stop date. Add one so it takes itself down.", 3);
    else if (Date.parse(sch.end) < Date.now()) add("stop", "The stop date has already passed.", 3);
    if (sch.start && sch.end && Date.parse(sch.start) >= Date.parse(sch.end)) add("stop", "The start date is after the stop date.", 3);
    var phones = !c.rules.devices || c.rules.devices.indexOf("phone") > -1;
    if ((c.format === "takeover" || c.format === "popup") && phones && c.rules.mode !== "gtm" && c.rules.sets && c.rules.sets.some(function (s) { return (s.trigger || {}).type === "load"; })) add("warn", "On phones this covers the page the moment it opens, and Google can rank pages lower for that. Add a short delay, or leave phones out.", 3);
    if (c.rules.mode !== "gtm" && c.rules.sets) c.rules.sets.forEach(function (s) { if (SITEMAP.paths.length && !matches(s).length) add("warn", "The page choices match no page on the site.", 3); });
    return out;
  }
  function gtmTrigger(c) {
    var s = S.sets[0], inc = s.include.map(toRegex), exc = s.exclude.map(toRegex);
    var rows = [["Trigger name", "TRPL Popup – Trigger – " + c.id], ["Trigger type", "Page View (or the event you want: Form Submission, Click, Custom Event…)"], ["This trigger fires on", inc.length || exc.length ? "Some Page Views" : "All Page Views"]];
    if (inc.length) rows.push(["Condition", "Page Path · matches RegEx (ignore case) · <code class='mono'>" + esc(inc.join("|")) + "</code>"]);
    if (exc.length) rows.push(["Condition", "Page Path · does not match RegEx (ignore case) · <code class='mono'>" + esc(exc.join("|")) + "</code>"]);
    return "<h3>The trigger in Google Tag Manager</h3><span class='hint'>Because Google Tag Manager decides the timing, make one more Custom HTML tag named <b>TRPL Popup – Show – " + esc(c.id) + "</b>, paste the line below into it, and attach a trigger with these settings.</span>" +
      "<div class='copyline'><code id='showCode'>" + esc(showSnippet(c.id)) + "</code><button type='button' class='mini-btn' data-copy='showCode'>Copy</button></div>" +
      "<table class='kv'>" + rows.map(function (r) { return "<tr><th>" + r[0] + "</th><td>" + r[1] + "</td></tr>"; }).join("") + "</table>";
  }
  function stepsList(tag, ver) {
    return S.isEdit ? [
      "Open Google Tag Manager and go to Tags.",
      "Open the tag named " + tag + ".",
      "Click into the HTML box, select everything in it, and paste the code.",
      "Save, then Preview to check the pop-up on the site.",
      "Submit, using the version name " + ver + "."
    ] : [
      "Open Google Tag Manager and go to Tags.",
      "Open the tag named TRPL Popup – TEMPLATE (copy me). Click the ⋮ menu at the top right and choose Copy.",
      "Rename the copy to " + tag + ".",
      "Click into the HTML box, select everything in it, and paste the code.",
      "Save, then Preview to check the pop-up on the site.",
      "Submit, using the version name " + ver + "."
    ];
  }
  function handoff(c) {
    var list = checks(c), stops = list.filter(function (x) { return x[0] === "stop"; });
    $("#checks").innerHTML = list.length ? list.map(function (x) {
      return "<li class='" + (x[0] === "stop" ? "stop" : "") + "'>" + esc(x[1]) + "<button type='button' class='linkish' data-go='" + x[2] + "'>" + (x[0] === "stop" ? "Fix this" : "Take a look") + "</button></li>";
    }).join("") : "<li class='fine'>Everything looks good. It is ready to copy.</li>";
    var fi = formatInfo(), tag = "TRPL Popup – " + (c.id || "…") + " (" + fi.tag + ")", ver = "Popup: " + (S.isEdit ? "edit " : "add ") + (c.id || "…");
    $("#tagName").textContent = tag;
    $("#verName").textContent = ver;
    $("#steps").innerHTML = stepsList("<b>" + esc(tag) + "</b>", "<b>" + esc(ver) + "</b>").map(function (s) { return "<li>" + s.replace("TRPL Popup – TEMPLATE (copy me)", "<b>TRPL Popup – TEMPLATE (copy me)</b>") + "</li>"; }).join("") +
      "<li>To take it down later: open the tag, click ⋮, choose Pause, then Submit.</li>";
    $("#gtmFired").innerHTML = S.mode === "gtm" && /^[a-z0-9][a-z0-9-]{1,39}$/.test(c.id) ? gtmTrigger(c) : "";
    $("#out").value = stops.length ? "Fix the items marked in red and the code will appear here." : snippet(c);
    return stops.length;
  }
  function sendText(c) {
    var fi = formatInfo(), tag = "TRPL Popup – " + c.id + " (" + fi.tag + ")", ver = "Popup: " + (S.isEdit ? "edit " : "add ") + c.id;
    return "Pop-up for Google Tag Manager: " + (c.name || c.id) + "\n\n" +
      stepsList(tag, ver).map(function (s, i) { return (i + 1) + ". " + s; }).join("\n") +
      (S.mode === "gtm" ? "\n\nThis pop-up is fired by a GTM trigger. It also needs a second tag and a trigger; the settings are in the builder (open the code below with “Open an existing pop-up”)." : "") +
      "\n\nTHE CODE\n" + snippet(c) + "\n";
  }

  /* ------------------------------------------------------------------ */
  /* Preview                                                             */
  /* ------------------------------------------------------------------ */
  function fit() {
    var st = $("#stage"), fr = $("#frame"), d = DEVICES[dev];
    var sc = Math.min(1, (st.clientWidth - 28) / d[0], (st.clientHeight - 28) / d[1]);
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
      if (!sendPreview.shown) $("#pstatus").textContent = $("#nAlert").checked ? "Not showing, because this format waits while the ticket alert is on screen. Untick “the ticket alert” to see it." : "Add a headline or some text to see it here.";
    }, 1800);
    sendPreview.shown = false;
  }
  function changed(skipPreviewDelay) {
    if (!S.idTouched) { S.id = makeId(); var idInp = $("[data-k=id]"); if (document.activeElement !== idInp) idInp.value = S.id; }
    var c = toConfig();
    handoff(c);
    renderSteps();
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
    var form = $("#form");
    form.addEventListener("input", function (e) {
      var t = e.target, k = t.getAttribute("data-k");
      if (k) {
        var v = t.type === "checkbox" ? t.checked : (t.type === "number" ? +t.value : t.value);
        if (k === "id") { v = String(v).toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40); S.idTouched = !!v; if (t.value !== v) t.value = v; }
        set(S, k, v);
        if (k === "photo.url") renderPhoto();
        changed(); return;
      }
      var bi = t.getAttribute("data-b");
      if (bi != null) {
        var f = t.getAttribute("data-bf"); S.content.buttons[+bi][f] = t.type === "checkbox" ? t.checked : t.value;
        if (f === "action") renderButtons();
        else if (f === "label") renderConvOpts();
        changed(); return;
      }
      if (t.hasAttribute("data-dev-rule")) { S.devices[t.getAttribute("data-dev-rule")] = t.checked; changed(); return; }
      if (t.hasAttribute("data-day")) { var d = +t.getAttribute("data-day"), ix = S.days.indexOf(d); if (t.checked && ix < 0) S.days.push(d); if (!t.checked && ix > -1) S.days.splice(ix, 1); changed(); }
    });
    form.addEventListener("change", function (e) {
      var t = e.target;
      if (t.getAttribute("data-k") && t.tagName === "SELECT") { set(S, t.getAttribute("data-k"), t.value); syncStatic(); changed(); return; }
      if (t.id === "freqClose" || t.id === "freqConv") {
        var o = t.id === "freqClose" ? S.freq.close : S.freq.convert, m = /^days:(\d+)$/.exec(t.value);
        if (m) { o.mode = "days"; o.days = +m[1]; } else o.mode = t.value;
        changed(); return;
      }
      if (t.id === "gtmMode") { S.mode = t.checked ? "gtm" : "auto"; renderWhere(); changed(); return; }
      if (t.id === "photoShade") { S.photo.shade = +t.value; renderPhoto(); changed(); return; }
      if (t.id === "photoFocus") { S.photo.focus = oneOf(t.value, FOCUS.map(function (f) { return f[0]; }), "center"); changed(); }
    });
    document.addEventListener("click", function (e) {
      var g = e.target.closest("[data-go]");
      if (g) { goStep(+g.getAttribute("data-go")); return; }
      var t = e.target.closest("[data-fmt],[data-preset],[data-hex],[data-copy],[data-cmd],#addBtn2,#rmBtn2"); if (!t) return;
      if (t.id === "addBtn2") { S.btn2 = true; if (!S.content.buttons[1].label) S.content.buttons[1] = { label: "Not now", action: "close", value: "", newTab: false, convert: false }; renderButtons(); changed(); }
      else if (t.id === "rmBtn2") { S.btn2 = false; renderButtons(); changed(); }
      else if (t.hasAttribute("data-fmt")) { var f = FORMATS.filter(function (x) { return x.key === t.getAttribute("data-fmt"); })[0]; S.format = f.format; if (f.pos) S.bannerPos = f.pos; syncStatic(); renderCards(); changed(); }
      else if (t.hasAttribute("data-preset")) { var p = PRESETS[+t.getAttribute("data-preset")]; S.presetName = p.name; COLOR_ROLES.forEach(function (r) { S.theme[r[0]] = p[r[0]]; }); renderCards(); renderPhoto(); changed(); }
      else if (t.hasAttribute("data-hex")) { S.theme[t.parentNode.getAttribute("data-role")] = t.getAttribute("data-hex"); S.presetName = ""; renderCards(); renderPhoto(); changed(); }
      else if (t.hasAttribute("data-copy")) { copyText($("#" + t.getAttribute("data-copy")).textContent); }
      else if (t.hasAttribute("data-cmd")) {
        var cmd = t.getAttribute("data-cmd"), body = $("#body"); body.focus();
        if (cmd === "link") {
          var sel = window.getSelection(), range = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
          var inp = el("input", { type: "url", placeholder: "https://www.trlibrary.com/…" }), w = el("div"); w.appendChild(el("span", { "class": "hint" }, "Select the words first, then give the web address they should lead to.")); w.appendChild(inp);
          dialog({ title: "Add a link", body: w, buttons: [{ label: "Cancel" }, { label: "Add the link", primary: true, onClick: function () {
            var u = inp.value.trim(); if (!/^(https:\/\/|mailto:|tel:|\/(?!\/))/i.test(u)) { toast("Use a full web address starting with https://"); return false; }
            body.focus(); if (range) { sel.removeAllRanges(); sel.addRange(range); }
            document.execCommand("createLink", false, u); S.content.body = cleanBody(body.innerHTML); changed();
          } }] });
        } else { document.execCommand(cmd, false, null); S.content.body = cleanBody(body.innerHTML); changed(); }
      }
    });
    var body = $("#body");
    body.addEventListener("input", function () { S.content.body = cleanBody(body.innerHTML); changed(); });
    body.addEventListener("paste", function (e) { e.preventDefault(); var txt = (e.clipboardData || window.clipboardData).getData("text/plain"); document.execCommand("insertText", false, txt); });
    bindWhere();

    $("#prev").addEventListener("click", function () { goStep(step - 1); });
    $("#next").addEventListener("click", function () { goStep(step + 1); });
    function ready() {
      var c = toConfig();
      if (handoff(c)) { toast("A few things need fixing first. They are marked in red."); $("#form").scrollTop = 0; return null; }
      return c;
    }
    $("#btnCopy").addEventListener("click", function () { var c = ready(); if (c) copyText(snippet(c), "Code copied. Paste it into the tag in Google Tag Manager."); });
    $("#btnSend").addEventListener("click", function () { var c = ready(); if (c) copyText(sendText(c), "Copied. Paste it into an email or a message."); });
    $("#btnShare").addEventListener("click", function () {
      copyText(window.location.origin + window.location.pathname + "#c=" + b64e(JSON.stringify(toConfig())), "Link copied. Anyone who opens it sees this draft.");
    });
    $("#btnImport").addEventListener("click", function () {
      var ta = el("textarea", { rows: "9", spellcheck: "false", placeholder: "Paste here" }); ta.className = "code"; ta.style.height = "190px";
      var w = el("div"); w.appendChild(el("p", { style: "margin:0 0 .6rem" }, "In Google Tag Manager, open the pop-up’s tag and copy everything in its HTML box. Paste it below. A draft link someone shared with you works too.")); w.appendChild(ta);
      w.appendChild(el("span", { "class": "hint" }, "This replaces what is in the builder now."));
      dialog({ title: "Open an existing pop-up", body: w, buttons: [{ label: "Cancel" }, { label: "Open it", primary: true, onClick: function () {
        var c = parseImport(ta.value);
        if (!c || !c.format) { toast("That does not look like a pop-up. Copy the whole HTML box from the tag and try again."); return false; }
        var intact = !c._c || c._c === P.checksum(c);
        try { S = fromConfig(c); } catch (err) { toast("That code could not be read."); return false; }
        step = 0; renderAll();
        toast(intact ? "Opened “" + (S.name || S.id) + "”." : "Opened, but the code had been changed by hand. Check it carefully.");
      } }] });
    });
    $("#btnReset").addEventListener("click", function () {
      dialog({ title: "Start over?", body: el("p", null, "This clears everything in the builder. Pop-ups already on the website are not affected."), buttons: [{ label: "Cancel" }, { label: "Start over", primary: true, onClick: function () { S = blank(); step = 0; history.replaceState(null, "", window.location.pathname); renderAll(); } }] });
    });
    $("#devs").addEventListener("click", function (e) { var b = e.target.closest("[data-dev]"); if (!b) return; dev = b.getAttribute("data-dev"); $$("#devs button").forEach(function (x) { x.setAttribute("aria-pressed", x === b); }); fit(); setTimeout(sendPreview, 150); });
    $("#nChat").addEventListener("change", sendPreview); $("#nAlert").addEventListener("change", sendPreview);
    $("#btnReplay").addEventListener("click", sendPreview);
    window.addEventListener("resize", fit);
    window.addEventListener("message", function (e) {
      if (e.origin !== window.location.origin) return; var m = e.data || {};
      if (m.type === "trplpop-preview-ready") { frameReady = true; sendPreview(); }
      if (m.type === "trplpop-preview-event" && m.event === "show") { sendPreview.shown = true; $("#pstatus").textContent = ""; }
      if (m.type === "trplpop-preview-event" && m.event === "close" && m.action !== "replace") $("#pstatus").textContent = "Closed. Click “Play again” to see it once more.";
    });
  }

  function start() {
    var fromHash = /#c=/.test(window.location.hash) ? parseImport(window.location.hash) : null;
    if (fromHash && fromHash.format) { try { S = fromConfig(fromHash); } catch (e) { S = null; } }
    else { try { var d = JSON.parse(localStorage.getItem("trplpop_builder_draft") || "null"); if (d && d.content && d.sets && d.theme && d.freq) { d.content.body = cleanBody(String(d.content.body || "")); if (d.btn2 == null) d.btn2 = !!d.content.buttons[1].label; if (d.whereSome == null) d.whereSome = d.sets[0].include.length > 0; S = d; } } catch (e) { S = null; } }
    if (!S) S = blank();
    S.photo = importPhoto(S.photo);                    // drafts saved before background photos existed
    adoptOldBackground(S);
    bind(); fit(); renderAll();
    fetch("../data/sitemap.json").then(function (r) { return r.ok ? r.json() : Promise.reject(); }).then(function (j) { SITEMAP = j; renderWhere(); changed(true); }).catch(function () { renderWhere(); });
    try { frameReady = frameReady || !!$("#frame").contentWindow.TRPLPopup; } catch (e) {}
    if (frameReady) sendPreview();
  }

  start();
  window.__trplBuilder = { toConfig: toConfig, fromConfig: function (c) { S = fromConfig(c); renderAll(); }, snippet: snippet, parseImport: parseImport, localToISO: localToISO, isoToLocal: isoToLocal, state: function () { return S; }, goStep: goStep };
})();
