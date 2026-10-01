/*
 * TRPL Popup — automated checks.
 *   NODE_PATH=$(npm root -g) node tests/run.js
 * Serves the repo on localhost, drives Chromium through the runtime at phone, tablet and
 * desktop widths, and writes screenshots to tests/out/.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(__dirname, "out");
const PORT = 8765;
const MIME = { ".html": "text/html", ".js": "application/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".css": "text/css", ".txt": "text/plain" };

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split("?")[0]);
      if (p.endsWith("/")) p += "index.html";
      const file = path.join(ROOT, p);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end("not found"); return; }
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(PORT, "0.0.0.0", () => resolve(srv));
  });
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail || "" });
  console.log((ok ? "  PASS  " : "  FAIL  ") + name + (detail && !ok ? "  -> " + detail : ""));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const VIEWPORTS = { phone: { width: 375, height: 740 }, tablet: { width: 768, height: 1024 }, desktop: { width: 1280, height: 800 } };
const THEME = { bg: "#FFFFFF", text: "#25282A", head: "#092A4D", btnBg: "#E7805D", btnText: "#25282A" };
const TICKETS = { label: "Reserve tickets", action: "url", value: "https://www.trlibrary.com/tickets", convert: true, newTab: true };
const LATER = { label: "Not now", action: "close", style: "secondary" };

function cfg(over) {
  return Object.assign({
    id: "t-" + Math.random().toString(36).slice(2, 8), name: "Test", format: "popup", theme: THEME,
    content: { headline: "Test headline", body: "<p>Body copy for the test.</p>", buttons: [TICKETS, LATER] },
    rules: { sets: [{ trigger: { type: "load" } }] }
  }, over);
}
async function open(browser, vp, url) {
  const ctx = await browser.newContext({ viewport: VIEWPORTS[vp] });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => check("no page errors (" + vp + ")", false, String(e)));
  await page.goto("http://localhost:" + PORT + (url || "/demo/index.html?trplpop_debug=1"));
  await page.waitForFunction(() => window.TRPLPopup && window.TRPLPopup.__trplpop);
  return { ctx, page };
}
async function register(page, c) {
  return page.evaluate((c) => { c._c = window.TRPLPopup.checksum(c); return window.TRPLPopup.register(c); }, c);
}
const host = (id) => "#trplpop-" + id;
async function shown(page, id, cls, timeout) {
  try { await page.waitForSelector(host(id) + " ." + (cls || "on"), { timeout: timeout || 3000 }); return true; } catch (e) { return false; }
}
async function gone(page, id) {
  try { await page.waitForSelector(host(id), { state: "detached", timeout: 3000 }); return true; } catch (e) { return false; }
}
async function noOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}
async function addFloat(page) {
  await page.evaluate(() => { if (!document.getElementById("trpl-float")) document.getElementById("t-float").click(); });
}
async function removeFloat(page) {
  await page.evaluate(() => { if (document.getElementById("trpl-float")) document.getElementById("t-float").click(); });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve();
  const browser = await chromium.launch();

  /* ---- 1. registration guard ---- */
  console.log("\nRegistration");
  {
    const { ctx, page } = await open(browser, "desktop");
    const noCheck = await page.evaluate(() => window.TRPLPopup.register({ id: "nocheck-1", format: "popup", content: { headline: "x" } }));
    check("settings without a check value are refused", noCheck === false);
    const tampered = await page.evaluate(() => {
      const c = { id: "tamper-1", format: "popup", content: { headline: "Original" }, rules: { mode: "gtm" } };
      c._c = window.TRPLPopup.checksum(c); c.content.headline = "Changed";
      return window.TRPLPopup.register(c);
    });
    check("settings edited after copying are refused", tampered === false);
    const badFormat = await page.evaluate(() => { const c = { id: "bad-1", format: "wheel" }; c._c = window.TRPLPopup.checksum(c); return window.TRPLPopup.register(c); });
    check("unknown formats are refused", badFormat === false);
    const minified = await page.evaluate(() => {
      // GTM minifies snippets: key order and quoting change, values do not.
      const a = { id: "min-1", format: "popup", content: { headline: "A", body: "<p>b</p>" }, rules: { mode: "gtm" } };
      const b = { rules: { mode: "gtm" }, content: { body: "<p>b</p>", headline: "A" }, format: "popup", id: "min-1" };
      return window.TRPLPopup.checksum(a) === window.TRPLPopup.checksum(b);
    });
    check("check value survives key reordering (GTM minification)", minified);
    await ctx.close();
  }

  /* ---- 2. each format at each width ---- */
  console.log("\nFormats");
  const formats = [
    { key: "banner-top", c: { format: "banner", position: "top" }, cls: "fmt-banner.on" },
    { key: "banner-bottom", c: { format: "banner", position: "bottom" }, cls: "fmt-banner.on" },
    { key: "popup", c: { format: "popup", size: "m", content: { eyebrow: "Now open", headline: "In the Room", body: "<p>Sixty years on the front lines of history.</p>", image: { url: "/demo/sample.svg", alt: "Placeholder", pos: "top" }, buttons: [TICKETS, LATER] } }, cls: "scrim.on" },
    { key: "popup-side", c: { format: "popup", size: "l", content: { headline: "Weekends sell out", body: "<p>Reserve a time before the drive.</p>", image: { url: "/demo/sample.svg", alt: "Placeholder", pos: "left" }, buttons: [TICKETS, LATER] } }, cls: "scrim.on" },
    { key: "slidein", c: { format: "slidein", position: "bottom-right" }, cls: "fmt-slidein.on" },
    { key: "takeover", c: { format: "takeover", theme: { bg: "#25282A", text: "#FFFFFF", head: "#FC924E", btnBg: "#FC924E", btnText: "#25282A" }, content: { eyebrow: "Medora, North Dakota", headline: "Dare greatly", body: "<p>The Library is open.</p>", image: { url: "/demo/sample.svg", alt: "", pos: "bg" }, buttons: [TICKETS, LATER] } }, cls: "fmt-takeover.on" }
  ];
  for (const vp of Object.keys(VIEWPORTS)) {
    for (const f of formats) {
      const { ctx, page } = await open(browser, vp);
      const c = cfg(Object.assign({ id: "f-" + f.key }, f.c));
      await register(page, c);
      const ok = await shown(page, c.id, f.cls);
      check(f.key + " renders at " + vp, ok);
      await sleep(500);
      check(f.key + " causes no sideways scroll at " + vp, await noOverflow(page));
      const fits = await page.evaluate((id) => {
        const root = document.querySelector("#trplpop-" + id).shadowRoot;
        const x = root.querySelector(".x").getBoundingClientRect();
        return x.width >= 38 && x.height >= 38 && x.left >= 0 && x.right <= window.innerWidth + 1 && x.top >= 0 && x.bottom <= window.innerHeight + 1;
      }, c.id);
      check(f.key + " close control is on screen and large enough at " + vp, fits);
      await page.screenshot({ path: path.join(OUT, f.key + "-" + vp + ".png") });
      await ctx.close();
    }
  }

  /* ---- 3. top banner pushes the page and the fixed header ---- */
  console.log("\nTop banner and fixed header");
  {
    const { ctx, page } = await open(browser, "desktop");
    const c = cfg({ id: "push-1", format: "banner", position: "top" });
    await register(page, c);
    await shown(page, c.id, "fmt-banner.on");
    await sleep(600);
    const m = await page.evaluate((id) => {
      const b = document.querySelector("#trplpop-" + id).shadowRoot.querySelector(".fmt-banner").getBoundingClientRect();
      const h = document.getElementById("top-header").getBoundingClientRect();
      return { banner: Math.round(b.height), bannerTop: Math.round(b.top), headerTop: Math.round(h.top), margin: Math.round(parseFloat(getComputedStyle(document.documentElement).marginTop)) };
    }, c.id);
    check("banner sits at the very top", m.bannerTop === 0, JSON.stringify(m));
    check("fixed header moves down by the banner height", m.headerTop === m.banner && m.banner > 30, JSON.stringify(m));
    check("page content moves down by the banner height", m.margin === m.banner, JSON.stringify(m));
    await page.click(host(c.id) + " .x");
    await gone(page, c.id);
    await sleep(500);
    const after = await page.evaluate(() => ({ headerTop: Math.round(document.getElementById("top-header").getBoundingClientRect().top), margin: Math.round(parseFloat(getComputedStyle(document.documentElement).marginTop)) }));
    check("header and page return to place after closing", after.headerTop === 0 && after.margin === 0, JSON.stringify(after));
    await ctx.close();
  }

  /* ---- 4. frequency ---- */
  console.log("\nFrequency");
  {
    const { ctx, page } = await open(browser, "desktop");
    const c = cfg({ id: "freq-1", format: "banner", position: "top", freq: { close: { mode: "days", days: 30 } } });
    await register(page, c);
    await shown(page, c.id, "fmt-banner.on");
    await page.click(host(c.id) + " .x");
    await gone(page, c.id);
    const st = await page.evaluate(() => window.TRPLPopup.state().visitor["freq-1"]);
    check("closing records seen and closed times", st && st.s > 0 && st.c > 0, JSON.stringify(st));
    await page.reload();
    await page.waitForFunction(() => window.TRPLPopup && window.TRPLPopup.__trplpop);
    await register(page, c);
    await sleep(700);
    check("a closed pop-up stays away on the next page view", !(await page.$(host(c.id))));
    const c2 = cfg({ id: "freq-2", format: "banner", position: "top", freq: { close: { mode: "always" } } });
    await register(page, c2); await shown(page, c2.id, "fmt-banner.on");
    await page.click(host(c2.id) + " .x"); await gone(page, c2.id);
    await page.reload(); await page.waitForFunction(() => window.TRPLPopup && window.TRPLPopup.__trplpop);
    await register(page, c2);
    check("'every time' shows again after a close", await shown(page, c2.id, "fmt-banner.on"));
    // conversion
    const c3 = cfg({ id: "freq-3", format: "popup", content: { headline: "Convert", buttons: [{ label: "Go", action: "event", value: "test_click", convert: true }] } });
    await register(page, c3); await shown(page, c3.id, "scrim.on");
    await page.click(host(c3.id) + " .btn.primary");
    await gone(page, c3.id);
    const dl = await page.evaluate(() => (window.dataLayer || []).filter((e) => e.popup_id === "freq-3").map((e) => e.event));
    check("data layer receives impression, interaction, conversion, close", ["trpl_popup_impression", "trpl_popup_interaction", "trpl_popup_conversion", "trpl_popup_close"].every((e) => dl.includes(e)), dl.join(","));
    check("custom event action reaches the data layer", await page.evaluate(() => (window.dataLayer || []).some((e) => e.event === "trpl_popup_custom_test_click")));
    const v = await page.evaluate(() => window.TRPLPopup.state().visitor["freq-3"]);
    check("conversion is recorded and close is not", v && v.v > 0 && v.c === 0, JSON.stringify(v));
    await page.goto("http://localhost:" + PORT + "/demo/index.html?trplpop_clear=1");
    await page.waitForFunction(() => window.TRPLPopup && window.TRPLPopup.__trplpop);
    check("?trplpop_clear=1 wipes visitor state", await page.evaluate(() => Object.keys(window.TRPLPopup.state().visitor).length === 0));
    await ctx.close();
  }

  /* ---- 5. rules ---- */
  console.log("\nRules");
  {
    const { ctx, page } = await open(browser, "desktop");
    const fresh = async () => { await page.goto("http://localhost:" + PORT + "/demo/index.html?trplpop_debug=1"); await page.waitForFunction(() => window.TRPLPopup && window.TRPLPopup.__trplpop); };
    const r = async (id, rules, extra) => { await fresh(); const c = cfg(Object.assign({ id, format: "slidein", rules }, extra || {})); const reg = await register(page, c); if (reg !== true) throw new Error("rule test pop-up " + id + " was not registered"); await sleep(450); return !!(await page.$(host(id))); };
    check("path include that matches shows", await r("r-inc", { sets: [{ include: [{ t: "path", op: "starts", v: "/demo" }], trigger: { type: "load" } }] }));
    check("path include that does not match stays hidden", !(await r("r-inc2", { sets: [{ include: [{ t: "path", op: "regex", v: "^/visit(/|$)" }], trigger: { type: "load" } }] })));
    check("path exclusion wins over inclusion", !(await r("r-exc", { sets: [{ include: [{ t: "path", op: "contains", v: "demo" }], exclude: [{ t: "path", op: "ends", v: "index.html" }], trigger: { type: "load" } }] })));
    check("path matching ignores letter case", await r("r-case", { sets: [{ include: [{ t: "path", op: "starts", v: "/DEMO" }], trigger: { type: "load" } }] }));
    check("device rule excludes desktop", !(await r("r-dev", { devices: ["phone"], sets: [{ trigger: { type: "load" } }] })));
    check("past end date stays hidden", !(await r("r-end", { schedule: { end: "2026-01-02T00:00:00-07:00" }, sets: [{ trigger: { type: "load" } }] })));
    check("future start date stays hidden", !(await r("r-start", { schedule: { start: "2099-01-01T00:00:00-07:00" }, sets: [{ trigger: { type: "load" } }] })));
    check("query condition matches ?trplpop_debug", await r("r-q", { sets: [{ conds: [{ t: "query", k: "trplpop_debug", op: "is", v: "1" }], trigger: { type: "load" } }] }));
    check("negated query condition hides", !(await r("r-q2", { sets: [{ conds: [{ t: "query", k: "trplpop_debug", op: "exists", not: true }], trigger: { type: "load" } }] })));
    check("second rule set can match when the first does not", await r("r-or", { sets: [{ include: [{ t: "path", op: "is", v: "/nope" }], trigger: { type: "load" } }, { include: [{ t: "path", op: "starts", v: "/demo" }], trigger: { type: "load" } }] }));

    // GTM-fired
    await fresh();
    const g = cfg({ id: "r-gtm", format: "slidein", rules: { mode: "gtm" } });
    await register(page, g); await sleep(400);
    check("GTM-fired pop-up waits for a show call", !(await page.$(host(g.id))));
    await page.evaluate(() => window.TRPLPopup.push(["show", "r-gtm"]));
    check("show call from GTM opens it", await shown(page, g.id, "fmt-slidein.on"));
    await page.evaluate(() => window.TRPLPopup.close("r-gtm")); await gone(page, g.id);
    await fresh(); await register(page, g);
    await page.evaluate(() => window.TRPLPopup.push(["show", "r-gtm"])); await sleep(500);
    check("show call respects frequency after a close", !(await page.$(host(g.id))));

    // scroll trigger
    await fresh();
    const s = cfg({ id: "r-scroll", format: "slidein", rules: { sets: [{ trigger: { type: "scroll", percent: 50 } }] } });
    await register(page, s); await sleep(600);
    check("scroll trigger waits", !(await page.$(host(s.id))));
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight * 0.7));
    check("scroll trigger fires past 50%", await shown(page, s.id, "fmt-slidein.on"));
    await fresh();

    // delay trigger
    const d = cfg({ id: "r-delay", format: "slidein", rules: { sets: [{ trigger: { type: "delay", seconds: 1 } }] } });
    await register(page, d); await sleep(400);
    const early = !!(await page.$(host(d.id)));
    check("delay trigger waits, then fires", !early && (await shown(page, d.id, "fmt-slidein.on")));
    await fresh();

    // exit intent
    const e = cfg({ id: "r-exit", format: "popup", rules: { sets: [{ trigger: { type: "exit" } }] } });
    await register(page, e); await sleep(300);
    await page.evaluate(() => document.dispatchEvent(new MouseEvent("mouseout", { clientY: -5, relatedTarget: null, bubbles: true })));
    check("exit intent opens on mouse leaving the top of the window", await shown(page, e.id, "scrim.on"));
    await ctx.close();
  }

  /* ---- 6. one overlay per page view, priority ---- */
  console.log("\nQueue");
  {
    const { ctx, page } = await open(browser, "desktop");
    await page.evaluate((arr) => { arr.forEach((c) => { c._c = window.TRPLPopup.checksum(c); }); arr.forEach((c) => window.TRPLPopup.push(["register", c])); },
      [cfg({ id: "q-low", priority: 1 }), cfg({ id: "q-high", priority: 9 }), cfg({ id: "q-banner", format: "banner", position: "top" })]);
    await sleep(900);
    const which = await page.evaluate(() => window.TRPLPopup.state().showing.sort());
    check("only the higher-priority pop-up shows; a banner may accompany it", which.join(",") === "q-banner,q-high", which.join(","));
    await ctx.close();
  }

  /* ---- 7. accessibility of the modal ---- */
  console.log("\nAccessibility");
  {
    const { ctx, page } = await open(browser, "desktop");
    await page.focus("#t-clear");
    const c = cfg({ id: "a11y-1", format: "popup" });
    await register(page, c); await shown(page, c.id, "scrim.on"); await sleep(400);
    const a = await page.evaluate((id) => {
      const root = document.querySelector("#trplpop-" + id).shadowRoot, box = root.querySelector(".fmt-popup");
      return { role: box.getAttribute("role"), modal: box.getAttribute("aria-modal"), labelled: !!root.getElementById(box.getAttribute("aria-labelledby")), focusInside: root.activeElement !== null, locked: getComputedStyle(document.documentElement).overflow };
    }, c.id);
    check("pop-up is announced as a modal dialog with a label", a.role === "dialog" && a.modal === "true" && a.labelled, JSON.stringify(a));
    check("focus moves into the pop-up and the page stops scrolling", a.focusInside && a.locked === "hidden", JSON.stringify(a));
    for (let i = 0; i < 8; i++) await page.keyboard.press("Tab");
    check("Tab stays inside the pop-up", await page.evaluate((id) => document.querySelector("#trplpop-" + id).shadowRoot.activeElement !== null, c.id));
    await page.keyboard.press("Escape");
    check("Escape closes it", await gone(page, c.id));
    await sleep(100);
    check("focus returns to where it was", await page.evaluate(() => document.activeElement && document.activeElement.id === "t-clear"));
    check("page scrolling is restored", await page.evaluate(() => getComputedStyle(document.documentElement).overflow !== "hidden"));
    await ctx.close();
  }

  /* ---- 8. content safety ---- */
  console.log("\nContent safety");
  {
    const { ctx, page } = await open(browser, "desktop");
    const c = cfg({ id: "safe-1", format: "popup", content: { headline: "<img src=x onerror=window.__pwn=1>", body: '<p onclick="window.__pwn=1">Hi <script>window.__pwn=1</script><a href="javascript:window.__pwn=1">bad</a> <a href="https://www.trlibrary.com/visit">good</a><img src=x onerror="window.__pwn=1"></p>', image: { url: "javascript:alert(1)", pos: "top" }, buttons: [{ label: "Bad", action: "url", value: "javascript:window.__pwn=1" }, { label: "Data", action: "url", value: "data:text/html,<script>1</script>" }] } });
    await register(page, c); await shown(page, c.id, "scrim.on"); await sleep(300);
    const s = await page.evaluate((id) => {
      const root = document.querySelector("#trplpop-" + id).shadowRoot;
      return { pwn: window.__pwn, scripts: root.querySelectorAll("script").length, imgs: root.querySelectorAll("img").length, links: [...root.querySelectorAll("a")].map((a) => a.getAttribute("href")), onclick: root.querySelectorAll("[onclick]").length, btns: root.querySelectorAll(".btn").length, head: root.querySelector(".head").textContent };
    }, c.id);
    check("scripts, handlers and unsafe links are stripped", s.scripts === 0 && s.imgs === 0 && s.onclick === 0 && s.links.join("|") === "https://www.trlibrary.com/visit" && s.btns === 0, JSON.stringify(s));
    check("headline is treated as text, not markup", s.head.indexOf("<img") === 0);
    await ctx.close();
  }

  /* ---- 9. ticket alert and chat launcher ---- */
  console.log("\nNeighbours");
  {
    // bottom banner waits for the ticket alert
    let { ctx, page } = await open(browser, "desktop");
    await addFloat(page);
    const b = cfg({ id: "n-bottom", format: "banner", position: "bottom" });
    await register(page, b); await sleep(1200);
    check("bottom banner waits while the ticket alert is showing", !(await page.$(host(b.id))));
    await removeFloat(page);
    check("bottom banner appears once the ticket alert is gone", await shown(page, b.id, "fmt-banner.on", 4000));
    await sleep(700);
    const lift = await page.evaluate((id) => {
      const bn = document.querySelector("#trplpop-" + id).shadowRoot.querySelector(".fmt-banner").getBoundingClientRect();
      const l = document.querySelector(".deyra-chatbot-button").getBoundingClientRect();
      return { bannerTop: Math.round(bn.top), launcherBottom: Math.round(l.bottom) };
    }, b.id);
    check("chat launcher is lifted clear of the bottom banner", lift.launcherBottom <= lift.bannerTop, JSON.stringify(lift));
    await page.screenshot({ path: path.join(OUT, "neighbours-bottom-banner-desktop.png") });
    await addFloat(page); await sleep(900);
    check("bottom banner steps aside if the ticket alert appears later", await page.evaluate((id) => document.querySelector("#trplpop-" + id).shadowRoot.querySelector(".fmt-banner").classList.contains("off"), b.id));
    await removeFloat(page); await sleep(900);
    await page.click(host(b.id) + " .x"); await gone(page, b.id); await sleep(200);
    check("chat launcher returns to its own position", await page.evaluate(() => { const l = document.querySelector(".deyra-chatbot-button").getBoundingClientRect(); return Math.round(window.innerHeight - l.bottom) === 40; }));
    await ctx.close();

    // slide-in on desktop: clear of the launcher, coexists with the alert, yields to chat panel
    ({ ctx, page } = await open(browser, "desktop"));
    await addFloat(page);
    const s = cfg({ id: "n-slide", format: "slidein", position: "bottom-right" });
    await register(page, s);
    check("desktop slide-in shows alongside the ticket alert", await shown(page, s.id, "fmt-slidein.on", 4000));
    await sleep(900);
    const g = await page.evaluate((id) => {
      const r = document.querySelector("#trplpop-" + id).shadowRoot.querySelector(".fmt-slidein").getBoundingClientRect();
      const l = document.querySelector(".deyra-chatbot-button").getBoundingClientRect();
      const f = document.getElementById("trpl-float").getBoundingClientRect();
      return { slideBottom: Math.round(r.bottom), launcherTop: Math.round(l.top), overlapFloat: !(r.left >= f.right || r.right <= f.left || r.top >= f.bottom || r.bottom <= f.top) };
    }, s.id);
    check("slide-in sits above the chat launcher", g.slideBottom <= g.launcherTop, JSON.stringify(g));
    check("slide-in does not overlap the ticket alert", !g.overlapFloat, JSON.stringify(g));
    await page.screenshot({ path: path.join(OUT, "neighbours-slidein-desktop.png") });
    await page.evaluate(() => document.getElementById("t-panel").click()); await sleep(900);
    check("slide-in steps aside while the chat panel is open", await page.evaluate((id) => document.querySelector("#trplpop-" + id).shadowRoot.querySelector(".fmt-slidein").classList.contains("off"), s.id));
    await page.evaluate(() => document.getElementById("t-panel").click()); await sleep(900);
    check("slide-in returns when the chat panel closes", await page.evaluate((id) => document.querySelector("#trplpop-" + id).shadowRoot.querySelector(".fmt-slidein").classList.contains("on"), s.id));
    await ctx.close();

    // lower-left slide-in is held by the alert on desktop
    ({ ctx, page } = await open(browser, "desktop"));
    await addFloat(page);
    const l = cfg({ id: "n-left", format: "slidein", position: "bottom-left" });
    await register(page, l); await sleep(1200);
    check("lower-left slide-in waits for the ticket alert on desktop", !(await page.$(host(l.id))));
    await ctx.close();

    // phone: slide-in waits for the alert
    ({ ctx, page } = await open(browser, "phone"));
    await addFloat(page);
    const p = cfg({ id: "n-phone", format: "slidein", position: "bottom-right" });
    await register(page, p); await sleep(1200);
    check("phone slide-in waits while the ticket alert is showing", !(await page.$(host(p.id))));
    await page.screenshot({ path: path.join(OUT, "neighbours-phone-alert-only.png") });
    await removeFloat(page);
    check("phone slide-in appears once the ticket alert is dismissed", await shown(page, p.id, "fmt-slidein.on", 4000));
    await sleep(900);
    const pg = await page.evaluate((id) => {
      const r = document.querySelector("#trplpop-" + id).shadowRoot.querySelector(".fmt-slidein").getBoundingClientRect();
      const l = document.querySelector(".deyra-chatbot-button").getBoundingClientRect();
      return { slideBottom: Math.round(r.bottom), launcherTop: Math.round(l.top) };
    }, p.id);
    check("phone slide-in sits above the chat launcher", pg.slideBottom <= pg.launcherTop, JSON.stringify(pg));
    await page.screenshot({ path: path.join(OUT, "neighbours-slidein-phone.png") });
    // top banner and pop-up are unaffected by the alert
    await addFloat(page);
    const t = cfg({ id: "n-top", format: "banner", position: "top" });
    await register(page, t);
    check("top banner shows regardless of the ticket alert", await shown(page, t.id, "fmt-banner.on"));
    await ctx.close();
  }

  /* ---- 10. click links, hostname guard, off switch ---- */
  console.log("\nLinks and guards");
  {
    let { ctx, page } = await open(browser, "desktop");
    await page.click('a[href="#popup:demo-popup"]');
    check("a #popup: link opens its pop-up", await shown(page, "demo-popup", "scrim.on"));
    await page.keyboard.press("Escape"); await gone(page, "demo-popup");
    await page.click('a[href="#popup:demo-popup"]');
    check("a link opens it again even after a close", await shown(page, "demo-popup", "scrim.on"));
    await ctx.close();

    ({ ctx, page } = await open(browser, "desktop", "/demo/index.html?trplpop_off=1"));
    await register(page, cfg({ id: "off-1" })); await sleep(500);
    check("?trplpop_off=1 disables the runtime", !(await page.$(host("off-1"))));
    await ctx.close();

    ctx = await browser.newContext({ viewport: VIEWPORTS.desktop });
    page = await ctx.newPage();
    await page.goto("http://0.0.0.0:" + PORT + "/demo/index.html");
    await sleep(300);
    await page.evaluate((c) => { c._c = window.TRPLPopup.checksum(c); window.TRPLPopup.register(c); window.TRPLPopup.show(c.id, { force: true }); }, cfg({ id: "host-1" }));
    await sleep(600);
    check("runtime stays inert on a hostname that is not TRPL's", !(await page.$(host("host-1"))));
    await ctx.close();

    ({ ctx, page } = await open(browser, "desktop", "/demo/index.html?trplpop_preview=demo-takeover"));
    check("?trplpop_preview=<id> forces a registered pop-up", await shown(page, "demo-takeover", "fmt-takeover.on"));
    await ctx.close();
  }


  /* ---- 11. hardening found in review ---- */
  console.log("\nHardening");
  {
    let { ctx, page } = await open(browser, "desktop");
    // theme values cannot carry CSS
    const evil = cfg({ id: "h-theme", format: "popup", theme: { bg: "#FFFFFF", text: "red}.x{display:none!important}.wrap::after{content:'INJECTED'}.d{color:red", head: "url(http://example.com/x)", btnBg: "#E7805D", btnText: "#25282A", scrim: "0}*{display:none" } });
    await register(page, evil); await shown(page, evil.id, "scrim.on"); await sleep(300);
    const th = await page.evaluate((id) => {
      const root = document.querySelector("#trplpop-" + id).shadowRoot, css = root.querySelector("style").textContent;
      return { x: getComputedStyle(root.querySelector(".x")).display, injected: css.includes("INJECTED") || css.includes("example.com") || css.includes("display:none!important") };
    }, evil.id);
    check("theme values that are not plain hex colours are discarded", th.x !== "none" && !th.injected, JSON.stringify(th));
    await page.keyboard.press("Escape"); await gone(page, evil.id);

    // inherited object names are not pop-ups
    await page.evaluate(() => { window.TRPLPopup.push(["show", "__proto__", { force: true }]); window.TRPLPopup.push(["show", "constructor", { force: true }]); window.TRPLPopup.show("toString", { force: true }); });
    await sleep(700);
    check("ids like __proto__ and constructor open nothing", (await page.$$("[data-trplpop]")).length === 0);
    await ctx.close();
    ({ ctx, page } = await open(browser, "desktop", "/demo/index.html#popup:constructor"));
    await sleep(700);
    check("a crafted #popup:constructor link opens nothing", (await page.$$("[data-trplpop]")).length === 0 && !(await page.evaluate(() => document.cookie.includes("undefined"))));

    // a faulty registration does not stop the next one
    await page.evaluate((arr) => { arr.forEach((c) => { c._c = window.TRPLPopup.checksum(c); }); window.TRPLPopup.push(["register", arr[0]], ["register", null], ["nonsense"], ["register", arr[1]]); },
      [cfg({ id: "h-bad", rules: { sets: [null, 7, { include: [null], conds: [null] }] } }), cfg({ id: "h-good", format: "banner", position: "top" })]);
    check("a malformed pop-up does not stop the next one registering", await shown(page, "h-good", "fmt-banner.on"));
    check("path rule 'starts with /node/' leaves /nodes-and-links alone", await page.evaluate(() => { const s = { exclude: [{ t: "path", op: "starts", v: "/node/" }] }; return window.TRPLPopup.matchPath(s, "/nodes-and-links") === true && window.TRPLPopup.matchPath(s, "/node/12") === false && window.TRPLPopup.matchPath(s, "/node") === false; }));
    check("an empty rule value matches nothing", await page.evaluate(() => window.TRPLPopup.matchPath({ exclude: [{ t: "path", op: "starts", v: "" }] }, "/visit") === true));
    await ctx.close();

    // query values containing "="
    ({ ctx, page } = await open(browser, "desktop", "/demo/index.html?token=YWJj=="));
    const qv = cfg({ id: "h-query", format: "banner", position: "top", rules: { sets: [{ conds: [{ t: "query", k: "token", op: "is", v: "YWJj==" }], trigger: { type: "load" } }] } });
    await register(page, qv);
    check("URL parameter values containing '=' are read whole", await shown(page, qv.id, "fmt-banner.on"));
    await ctx.close();

    // expired pop-up cannot be opened by a link; preview switch records nothing
    ({ ctx, page } = await open(browser, "desktop"));
    const old = cfg({ id: "h-expired", rules: { mode: "gtm", schedule: { end: "2026-01-02T00:00:00-07:00" } } });
    await register(page, old);
    await page.evaluate(() => window.TRPLPopup.show("h-expired", { force: true, trigger: "click" })); await sleep(500);
    check("a pop-up past its end date cannot be opened by a link", !(await page.$(host("h-expired"))));
    await ctx.close();
    ({ ctx, page } = await open(browser, "desktop", "/demo/index.html?trplpop_preview=demo-popup"));
    await shown(page, "demo-popup", "scrim.on");
    const quiet = await page.evaluate(() => ({ dl: (window.dataLayer || []).filter((e) => e.popup_id === "demo-popup").length, st: !!window.TRPLPopup.state().visitor["demo-popup"] }));
    check("?trplpop_preview shows it without recording an impression", quiet.dl === 0 && !quiet.st, JSON.stringify(quiet));
    await ctx.close();

    // stepping aside before the opening animation has run
    ({ ctx, page } = await open(browser, "desktop"));
    const bb = cfg({ id: "h-early", format: "banner", position: "bottom" });
    await register(page, bb);
    await page.waitForSelector(host(bb.id), { state: "attached", timeout: 4000 });
    await page.evaluate(() => { document.getElementById("t-float").click(); document.dispatchEvent(new CustomEvent("trplfloat:state")); });
    await sleep(1000);
    const early = await page.evaluate((id) => { const b = document.querySelector("#trplpop-" + id).shadowRoot.querySelector(".fmt-banner"); return { off: b.classList.contains("off"), on: b.classList.contains("on"), inert: b.hasAttribute("inert"), vis: getComputedStyle(b).visibility }; }, bb.id);
    check("a banner asked to step aside while opening stays aside", early.off && !early.on, JSON.stringify(early));
    check("a pop-up that has stepped aside cannot be tabbed into", early.inert && early.vis === "hidden", JSON.stringify(early));
    await ctx.close();

    // forced replacement keeps the original focus target
    ({ ctx, page } = await open(browser, "desktop"));
    await page.focus('a[href="#popup:demo-popup"]');
    await page.keyboard.press("Enter"); await shown(page, "demo-popup", "scrim.on"); await sleep(300);
    await page.evaluate(() => window.TRPLPopup.show("demo-takeover", { force: true })); await shown(page, "demo-takeover", "fmt-takeover.on"); await sleep(400);
    check("replacing one pop-up with another leaves a single pop-up", (await page.$$("[data-trplpop]")).length === 1);
    await page.keyboard.press("Escape"); await gone(page, "demo-takeover"); await sleep(100);
    check("focus returns to the original link after a replaced pop-up closes", await page.evaluate(() => document.activeElement && document.activeElement.getAttribute("href") === "#popup:demo-popup"));
    // a link clicked while the same pop-up is still fading out
    await page.click('a[href="#popup:demo-popup"]'); await shown(page, "demo-popup", "scrim.on");
    await page.keyboard.press("Escape"); await sleep(100);
    await page.evaluate(() => window.TRPLPopup.show("demo-popup", { force: true, trigger: "click" }));
    check("a link clicked during the fade-out reopens the pop-up", await shown(page, "demo-popup", "scrim.on"));
    await ctx.close();

    // focus order with a sign-up form in the pop-up
    ({ ctx, page } = await open(browser, "desktop"));
    const fc = cfg({ id: "h-form", format: "popup", content: { headline: "Sign up", form: { type: "ctct", formId: "abcdefgh-1234" }, buttons: [{ label: "Go", action: "close" }, { label: "No", action: "close" }] } });
    await register(page, fc); await shown(page, fc.id, "scrim.on");
    await page.evaluate((id) => { const f = document.querySelector("#trplpop-" + id + " .ctct-inline-form"); f.innerHTML = '<input id="ff1"><input id="ff2">'; }, fc.id);
    await sleep(300);
    const seq = [];
    for (let i = 0; i < 6; i++) { await page.keyboard.press("Tab"); seq.push(await page.evaluate((id) => { const h = document.querySelector("#trplpop-" + id); const a = document.activeElement; if (a && a.id && a.id.indexOf("ff") === 0) return a.id; const s = h.shadowRoot.activeElement; return s ? (s.className.indexOf("x") === 0 ? "x" : s.textContent) : "outside"; }, fc.id)); }
    check("Tab reaches the form fields and then the buttons, in order", seq.join(",") === "x,ff1,ff2,Go,No,x", seq.join(","));
    await ctx.close();
  }

  await browser.close();
  srv.close();
  const failed = results.filter((r) => !r.ok);
  console.log("\n" + (results.length - failed.length) + " of " + results.length + " checks passed.");
  if (failed.length) { console.log("Failed:"); failed.forEach((f) => console.log("  - " + f.name + (f.detail ? "  -> " + f.detail : ""))); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
