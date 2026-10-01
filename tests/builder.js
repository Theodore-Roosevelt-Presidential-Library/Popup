/* Builder checks.  NODE_PATH=$(npm root -g) node tests/builder.js <builder-folder> <code> */
const http = require("http"), fs = require("fs"), path = require("path");
const { chromium } = require("playwright");
const ROOT = path.resolve(__dirname, ".."), OUT = path.join(__dirname, "out"), PORT = 8766;
const DIR = process.argv[2], CODE = process.argv[3];
if (!DIR || !CODE) { console.error("usage: node tests/builder.js <builder-folder> <code>"); process.exit(2); }
const MIME = { ".html": "text/html", ".js": "application/javascript", ".json": "application/json", ".svg": "image/svg+xml" };
const results = [];
const check = (n, ok, d) => { results.push({ n, ok: !!ok, d }); console.log((ok ? "  PASS  " : "  FAIL  ") + n + (!ok && d ? "  -> " + d : "")); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  // expected page counts come from the sitemap file itself, which a nightly job rewrites
  const PATHS = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "sitemap.json"), "utf8")).paths;
  const standing = (p) => p.endsWith("/print") || ["/tickets", "/rsvp", "/privacy", "/user"].some((x) => p.startsWith(x)) || p.startsWith("/node/") || p === "/node";
  const TOTAL = PATHS.length.toLocaleString("en-US");
  const N_ALL = PATHS.filter((p) => !standing(p)).length, N_VISIT = PATHS.filter((p) => /^\/visit(\/|$)/.test(p) && !standing(p)).length;
  const says = (n) => "Matches " + n.toLocaleString("en-US") + " of " + TOTAL;
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]); if (p.endsWith("/")) p += "index.html";
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream", "Cache-Control": "no-store" }); fs.createReadStream(f).pipe(res);
  }).listen(PORT);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
  const page = await ctx.newPage();
  const dialogs = []; page.on("dialog", (d) => { dialogs.push(d.type()); d.dismiss(); });
  const errors = []; page.on("pageerror", (e) => errors.push(String(e)));
  const URL = "http://localhost:" + PORT + "/" + DIR + "/";
  await page.goto(URL);

  check("builder is hidden behind the code", await page.isVisible("#gate") && !(await page.isVisible("#app")));
  await page.fill("#code", "0000"); await page.click("#gate button"); await sleep(300);
  check("a wrong code is refused", await page.isVisible("#gate") && (await page.textContent("#gateErr")).length > 0);
  await page.fill("#code", CODE); await page.click("#gate button");
  await page.waitForSelector("#app:not([hidden])");
  check("the right code opens the builder", await page.isVisible("#app"));
  check("page is marked noindex", (await page.getAttribute('meta[name="robots"]', "content")).includes("noindex"));
  await page.waitForFunction(() => document.querySelector("[data-match]") && /Matches/.test(document.querySelector("[data-match]").textContent), null, { timeout: 5000 });

  // empty builder blocks copying
  check("an empty pop-up cannot be copied", (await page.inputValue("#out")).startsWith("Fix the items"));

  await page.fill('[data-k="name"]', "Fall Membership");
  const id = await page.inputValue('[data-k="id"]');
  check("id is built from month and name", /^\d{4}-\d{2}-fall-membership$/.test(id), id);
  await page.fill('[data-k="content.eyebrow"]', "Members");
  await page.fill('[data-k="content.headline"]', "Come back all year");
  await page.click("#body"); await page.keyboard.type("Unlimited entry, with {{braces}} and <tags> in the copy.");
  await page.fill('[data-b="0"][data-bf="label"]', "See membership");
  await page.fill('[data-b="0"][data-bf="value"]', "https://www.trlibrary.com/membership");
  await page.fill('[data-b="1"][data-bf="label"]', "Not now");
  await sleep(200);

  // sitemap rules
  await page.click("summary:has-text('Where and when')");
  const all = await page.textContent("[data-match] strong");
  check("standing exclusions apply before any page is chosen (" + N_ALL + " of " + PATHS.length + ")", all.includes(says(N_ALL)) && N_ALL < PATHS.length, all);
  await page.click('[data-act="sec"][data-seg="visit"]');
  const visit = await page.textContent("[data-match] strong");
  check("ticking the /visit section matches its pages less print views (" + N_VISIT + ")", visit.includes(says(N_VISIT)), visit);
  await page.fill('[data-act="test"]', "https://www.trlibrary.com/visit/hours");
  check("address tester: /visit/hours would show", (await page.textContent("[data-testout]")) === "Would show");
  await page.fill('[data-act="test"]', "/visit/itineraries/one-day/print");
  check("address tester: a print view would not show", (await page.textContent("[data-testout]")) === "Would not show");
  await page.fill('[data-act="search"]', "itinerar");
  await page.waitForSelector(".results:not([hidden]) [data-act='pickex']");
  await page.click(".results [data-act='pickex']");
  const after = await page.textContent("[data-match] strong");
  check("excluding one found page lowers the count by one", after.includes(says(N_VISIT - 1)), after);
  await page.selectOption('[data-f="trig"]', "scroll"); await page.fill('[data-f="percent"]', "40");
  await sleep(300);

  // hand-off
  const out = await page.inputValue("#out");
  check("code is produced once the essentials are filled", out.includes('.push(["register", {') && out.trim().endsWith("</script>"));
  check("code never contains {{ (GTM would read it as a variable)", !out.includes("{{"));
  check("code cannot close its own script tag early", (out.match(/<\/script>/g) || []).length === 1 && !/<tags>/.test(out));
  check("tag name follows the convention", (await page.textContent("#tagName")) === "TRPL Popup – " + id + " (pop-up)", await page.textContent("#tagName"));
  check("version name follows the convention", (await page.textContent("#verName")) === "Popup: add " + id);
  await page.click("#btnCopy"); await sleep(200);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  check("Copy for GTM puts the code on the clipboard", clip === out);

  // the code runs in the runtime exactly as pasted, and again after GTM-style minification
  const demo = await ctx.newPage();
  await demo.goto("http://localhost:" + PORT + "/demo/index.html?trplpop_preview=" + id);
  await demo.waitForFunction(() => window.TRPLPopup && window.TRPLPopup.__trplpop);
  const js = out.replace(/<!--[\s\S]*?-->/, "").replace(/<\/?script>/g, "");
  await demo.evaluate((js) => { new Function(js)(); }, js);
  let ok = true; try { await demo.waitForSelector("#trplpop-" + id + " .scrim.on", { timeout: 3000 }); } catch (e) { ok = false; }
  check("pasted code registers and renders in the runtime", ok);
  const bodyText = await demo.evaluate((id) => document.querySelector("#trplpop-" + id).shadowRoot.querySelector(".body").textContent, id);
  check("braces and angle brackets in copy survive as text", bodyText.includes("{{braces}}") && bodyText.includes("<tags>"), bodyText);
  await demo.close();

  // round trip through Import
  const before = await page.evaluate(() => JSON.stringify(window.__trplBuilder.toConfig()));
  await page.click("#btnReset"); await page.click("#mActs .pri"); await sleep(200);
  check("Start over clears the builder", (await page.inputValue('[data-k="name"]')) === "");
  await page.click("#btnImport"); await page.fill("#mBody textarea", out); await page.click("#mActs .pri"); await sleep(400);
  const afterImp = await page.evaluate(() => JSON.stringify(window.__trplBuilder.toConfig()));
  check("importing the code restores every setting exactly", before === afterImp, "\n" + before + "\n" + afterImp);
  check("after import the steps switch to editing an existing tag", (await page.textContent("#verName")) === "Popup: edit " + id);

  // share link
  await page.click("#btnShare"); await sleep(150);
  const link = await page.evaluate(() => navigator.clipboard.readText());
  // a different browser: no saved draft, and the code must be entered again
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p2 = await ctx2.newPage(); await p2.goto(link);
  check("a share link still asks a new browser for the code", await p2.isVisible("#gate"));
  await p2.fill("#code", CODE); await p2.click("#gate button"); await p2.waitForSelector("#app:not([hidden])"); await sleep(400);
  check("a share link reopens the same pop-up in a different browser", (await p2.evaluate(() => JSON.stringify(window.__trplBuilder.toConfig()))) === before);
  await p2.goto(URL + "#c=THIS-IS-NOT-A-VALID-LINK"); await p2.reload(); await sleep(400);
  check("a broken share link leaves the builder working (it falls back to the saved draft)", (await p2.$$("#formats .card")).length === 5 && (await p2.$$("#presets .card")).length === 9);

  // hostile share links and imports
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const hostile = { id: "2026-10-x", format: "popup", name: "x", theme: { bg: 5, text: "red}*{display:none}", head: "#092A4D" },
    content: { headline: "Hi", body: "<p>ok</p><img src=x onerror=\"window.__pwn=1\"><script>window.__pwn=1</script>", buttons: [{ label: "a", action: "<img src=x onerror=window.__pwn=1>", value: "x" }] },
    rules: { sets: [{ include: [{ t: "path", op: "<img src=x onerror=window.__pwn=1>", v: "/a" }], trigger: { type: "<b>x" } }] } };
  await p2.goto(URL + "#c=" + b64(hostile)); await p2.reload(); await p2.waitForSelector("#app:not([hidden])"); await sleep(600);
  const hz = await p2.evaluate(() => ({ pwn: window.__pwn, imgs: document.querySelectorAll("#form img, #form script").length, cfg: window.__trplBuilder.toConfig() }));
  check("a hostile share link cannot run script in the builder", !hz.pwn && hz.imgs === 0, JSON.stringify(hz).slice(0, 200));
  check("hostile theme, action and rule values are replaced with safe ones", /^#[0-9A-F]{6}$/i.test(hz.cfg.theme.text) && hz.cfg.theme.bg === "#FFFFFF" && hz.cfg.content.buttons[0].action === "url" && hz.cfg.rules.sets[0].include[0].op === "starts" && hz.cfg.rules.sets[0].trigger.type === "load" && !/onerror|script/i.test(hz.cfg.content.body), JSON.stringify(hz.cfg).slice(0, 400));
  await ctx2.close();

  // time zone conversion
  const tz = await page.evaluate(() => [window.__trplBuilder.localToISO("2026-10-15T09:00"), window.__trplBuilder.localToISO("2026-12-15T09:00"), window.__trplBuilder.isoToLocal("2026-10-15T09:00:00-06:00")]);
  check("schedule times are Mountain Time (MDT -06:00, MST -07:00)", tz[0] === "2026-10-15T09:00:00-06:00" && tz[1] === "2026-12-15T09:00:00-07:00" && tz[2] === "2026-10-15T09:00", tz.join(" "));

  // GTM-fired mode
  await page.click('[data-mode="gtm"]'); await sleep(300);
  const fired = await page.textContent("#gtmFired");
  check("GTM-fired mode prints the trigger settings", fired.includes("matches RegEx (ignore case)") && fired.includes("^/visit(/|$)") && fired.includes("does not match RegEx (ignore case)"), fired.slice(0, 300));
  check("GTM-fired mode gives the show line", (await page.textContent("#showCode")).includes('["show", "' + id + '"]'));
  const gtmOut = await page.inputValue("#out"), gtmCfg = await page.evaluate(() => JSON.stringify(window.__trplBuilder.toConfig()));
  await page.click("#btnImport"); await page.fill("#mBody textarea", gtmOut); await page.click("#mActs .pri"); await sleep(400);
  check("GTM-fired page rules survive an import", (await page.evaluate(() => JSON.stringify(window.__trplBuilder.toConfig()))) === gtmCfg && (await page.textContent("#gtmFired")).includes("^/visit(/|$)"));
  await page.click('[data-mode="auto"]');

  // brand and safety checks
  await page.fill('[data-k="content.headline"]', "Teddy welcomes visitors"); await sleep(200);
  const warn = await page.textContent("#checks");
  check("house-style terms are flagged", warn.includes("Teddy") && warn.includes("participants"));
  await page.fill('[data-b="0"][data-bf="value"]', "javascript:alert(1)"); await sleep(200);
  check("an unsafe button address blocks the code", (await page.inputValue("#out")).startsWith("Fix the items"));
  await page.fill('[data-b="0"][data-bf="value"]', "https://www.trlibrary.com/membership");
  await page.fill('[data-k="content.headline"]', "Come back all year");

  // preview in each format and device
  for (const f of ["banner-top", "banner-bottom", "popup", "slidein", "takeover"]) {
    await page.click('[data-fmt="' + f + '"]');
    for (const d of ["desktop", "phone"]) {
      await page.click('[data-dev="' + d + '"]'); await sleep(1500);
      const frame = page.frames().find((x) => x.url().includes("preview.html"));
      const vis = await frame.evaluate(() => { const h = document.querySelector("[data-trplpop]"); if (!h) return false; const r = h.shadowRoot.querySelector(".on"); return !!r; });
      check("preview shows " + f + " at " + d, vis);
      if (d === "desktop" || f === "popup") await page.screenshot({ path: path.join(OUT, "builder-" + f + "-" + d + ".png") });
    }
  }
  check("no native browser dialogs were used", dialogs.length === 0, dialogs.join(","));
  check("no script errors in the builder", errors.length === 0, errors.join(" | "));

  await browser.close(); srv.close();
  const failed = results.filter((r) => !r.ok);
  console.log("\n" + (results.length - failed.length) + " of " + results.length + " builder checks passed.");
  if (failed.length) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
