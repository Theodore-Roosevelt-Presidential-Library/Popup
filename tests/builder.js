/* Builder checks.  NODE_PATH=$(npm root -g) node tests/builder.js */
const http = require("http"), fs = require("fs"), path = require("path");
const { chromium } = require("playwright");
const ROOT = path.resolve(__dirname, ".."), OUT = path.join(__dirname, "out"), PORT = 8766;
const DIR = process.argv[2] || "builder";
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
  const says = (n) => "It will appear on " + n.toLocaleString("en-US") + " of the site’s " + TOTAL + " pages.";

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
  const go = async (n) => { await page.click('#stepper [data-go="' + n + '"]'); await sleep(80); };
  const config = () => page.evaluate(() => JSON.stringify(window.__trplBuilder.toConfig()));
  await page.goto(URL);
  await page.waitForSelector("#formats .card");

  /* ---- opens directly, one step at a time ---- */
  check("the builder opens directly, with no code to enter", (await page.isVisible("#app")) && !(await page.$("#gate")));
  const home = await ctx.newPage(); await home.goto("http://localhost:" + PORT + "/");
  check("the front page links to the builder", (await home.getAttribute('a[href="builder/"]', "href")) === "builder/");
  await home.close();
  check("there are five steps and only the first is showing", (await page.$$("#stepper button")).length === 5 && (await page.isVisible('.step[data-step="0"]')) && !(await page.isVisible('.step[data-step="3"]')));
  check("an empty pop-up cannot be copied", (await page.inputValue("#out")).startsWith("Fix the items"));

  /* ---- plain-language surface: technical terms stay out of sight until asked for ---- */
  const visibleText = async () => page.evaluate(() => { let t = ""; document.querySelectorAll(".step").forEach((s) => { const was = s.hidden; s.hidden = false; t += " " + s.innerText; s.hidden = was; }); return t; });
  const surface = await visibleText();
  const jargon = ["RegEx", "regex", "matches pattern", "Rule set", "URL parameter", "utm_", "data layer", "Custom HTML", " id ", "Conversion", "conversion", "Trigger", "selector", "JSON"].filter((w) => surface.includes(w));
  check("no technical jargon on the main screens", jargon.length === 0, jargon.join(", "));
  check("advanced settings are tucked behind “More options”", !(await page.isVisible('[data-k="id"]')) && (await page.$$("details.more:not([open])")).length >= 4);

  /* ---- step 1: format and name ---- */
  await page.fill('[data-k="name"]', "Fall Membership");
  const id = await page.evaluate(() => window.__trplBuilder.state().id);
  check("the reference name is built from the month and the name", /^\d{4}-\d{2}-fall-membership$/.test(id), id);
  await page.click("#next");
  check("Next moves to the message step", await page.isVisible('.step[data-step="1"]') && (await page.textContent("#next")) === "Next: Look");

  /* ---- step 2: message ---- */
  await page.fill('[data-k="content.headline"]', "Come back all year");
  await page.click("#body"); await page.keyboard.type("Unlimited entry, with {{braces}} and <tags> in the copy.");
  await page.fill('[data-b="0"][data-bf="label"]', "See membership");
  await page.fill('[data-b="0"][data-bf="value"]', "https://www.trlibrary.com/membership");
  check("a second button is offered, not shown by default", (await page.isVisible("#addBtn2")) && !(await page.$('[data-b="1"][data-bf="label"]')));
  await page.click("#addBtn2");
  check("adding a second button fills in “Not now”, set to close the pop-up", (await page.inputValue('[data-b="1"][data-bf="label"]')) === "Not now" && (await page.inputValue('[data-b="1"][data-bf="action"]')) === "close");
  await page.click("#more1 > summary"); await page.fill('[data-k="content.eyebrow"]', "Members");
  await sleep(200);

  /* ---- step 3: look ---- */
  await go(2);
  check("nine color combinations, each shown as a sample", (await page.$$("#presets .card .sample")).length === 9);
  check("the contrast verdict is in plain words", (await page.textContent("#contrast")).includes("Easy to read"));

  /* ---- step 4: where and when ---- */
  await go(3);
  await page.waitForFunction(() => document.querySelector("[data-match]") && /It will appear on/.test(document.querySelector("[data-match]").textContent), null, { timeout: 5000 });
  const all = await page.textContent("#where0 [data-match] strong");
  check("“On every page” still leaves out the skipped pages (" + N_ALL + " of " + PATHS.length + ")", all === says(N_ALL) && N_ALL < PATHS.length, all);
  check("skipped pages are named in plain words", (await page.textContent("#where0")).includes("Ticket pages") && (await page.textContent("#where0")).includes("Print views"));
  await page.check('input[name="where0"][value="some"]'); await sleep(150);
  check("choosing “only certain pages” with nothing picked is flagged", (await page.textContent("#checks")).includes("Choose at least one section or page"));
  check("the step with a problem is marked in the step bar", !!(await page.$('#stepper [data-go="3"].todo')) || (await page.getAttribute('#stepper [data-go="3"]', "aria-current")) === "step");
  await page.click('#where0 [data-act="sec"][data-seg="visit"]');
  const visit = await page.textContent("#where0 [data-match] strong");
  check("picking “Plan a visit” matches its pages less print views (" + N_VISIT + ")", visit === says(N_VISIT) && (await page.textContent('#where0 [data-seg="visit"]')).includes("Plan a visit"), visit);
  await page.fill('#where0 [data-act="search"]', "itinerar");
  await page.waitForSelector("#where0 .results:not([hidden]) [data-act='pickex']");
  await page.click("#where0 .results [data-act='pickex']");
  const after = await page.textContent("#where0 [data-match] strong");
  check("skipping one found page lowers the count by one", after === says(N_VISIT - 1), after);
  await page.check('input[name="when0"][value="scroll"]'); await page.selectOption('#when0 [data-f="percent"]', "25"); await sleep(150);
  check("timing is chosen in plain words", await page.evaluate(() => { const t = window.__trplBuilder.toConfig().rules.sets[0].trigger; return t.type === "scroll" && t.percent === 25; }));
  await page.selectOption("#freqClose", "days:7"); await sleep(100);
  check("“how often” is a plain choice", await page.evaluate(() => { const f = window.__trplBuilder.toConfig().freq.close; return f.mode === "days" && f.days === 7; }));
  await page.click("#more3 > summary");
  await page.fill('#tester [data-act="test"]', "https://www.trlibrary.com/visit/hours");
  check("page checker: /visit/hours would show", (await page.textContent("#tester [data-testout]")) === "It would show");
  await page.fill('#tester [data-act="test"]', "/visit/itineraries/one-day/print");
  check("page checker: a print view would not show", (await page.textContent("#tester [data-testout]")) === "It would not show");
  await page.screenshot({ path: path.join(OUT, "builder-step-where.png"), fullPage: false });

  /* ---- step 5: publish ---- */
  await go(4); await sleep(300);
  check("everything needed is filled in", (await page.textContent("#checks")).includes("ready to copy") || !(await page.$("#checks li.stop")));
  const out = await page.inputValue("#out");
  check("code is produced once the essentials are filled", out.includes('.push(["register", {') && out.trim().endsWith("</script>"));
  check("the code is tucked away until asked for", !(await page.isVisible("#out")));
  check("code never contains {{ (GTM would read it as a variable)", !out.includes("{{"));
  check("code cannot close its own script tag early", (out.match(/<\/script>/g) || []).length === 1 && !/<tags>/.test(out));
  check("tag name follows the convention", (await page.textContent("#tagName")) === "TRPL Popup – " + id + " (pop-up)", await page.textContent("#tagName"));
  check("version name follows the convention", (await page.textContent("#verName")) === "Popup: add " + id);
  await page.click("#btnCopy"); await sleep(200);
  check("“Copy the code” puts the code on the clipboard", (await page.evaluate(() => navigator.clipboard.readText())) === out);
  await page.click("#btnSend"); await sleep(200);
  const sent = await page.evaluate(() => navigator.clipboard.readText());
  check("“Copy everything to send” includes the steps, both names and the code", sent.includes("1. Open Google Tag Manager") && sent.includes("TRPL Popup – " + id + " (pop-up)") && sent.includes("Popup: add " + id) && sent.includes(out));
  await page.screenshot({ path: path.join(OUT, "builder-step-publish.png") });

  // the code runs in the runtime exactly as pasted
  const demo = await ctx.newPage();
  await demo.goto("http://localhost:" + PORT + "/demo/index.html?trplpop_preview=" + id);
  await demo.waitForFunction(() => window.TRPLPopup && window.TRPLPopup.__trplpop);
  const js = out.replace(/<!--[\s\S]*?-->/, "").replace(/<\/?script>/g, "");
  await demo.evaluate((js) => { new Function(js)(); }, js);
  let ok = true; try { await demo.waitForSelector("#trplpop-" + id + " .scrim.on", { timeout: 3000 }); } catch (e) { ok = false; }
  check("pasted code registers and renders in the runtime", ok);
  const bodyText = await demo.evaluate((id) => document.querySelector("#trplpop-" + id).shadowRoot.querySelector(".body").textContent, id);
  check("braces and angle brackets in copy survive as text", bodyText.includes("{{braces}}") && bodyText.includes("<tags>"), bodyText);
  check("both buttons are in the pop-up", await demo.evaluate((id) => document.querySelector("#trplpop-" + id).shadowRoot.querySelectorAll(".btn").length === 2, id));
  await demo.close();

  /* ---- round trips ---- */
  const before = await config();
  await page.click("#btnReset"); await page.click("#mActs .pri"); await sleep(200);
  check("Start over clears the builder and returns to step one", (await page.inputValue('[data-k="name"]')) === "" && (await page.isVisible('.step[data-step="0"]')));
  await page.click("#btnImport"); await page.fill("#mBody textarea", out); await page.click("#mActs .pri"); await sleep(400);
  const afterImp = await config();
  check("opening the code restores every setting exactly", before === afterImp, "\n" + before + "\n" + afterImp);
  check("“More options” opens by itself where the pop-up uses something inside it", await page.evaluate(() => document.getElementById("more1").open === true));
  check("after opening, the steps switch to editing an existing tag", (await page.textContent("#verName")) === "Popup: edit " + id && (await page.textContent("#steps")).includes("Open the tag named"));

  await page.click("#btnShare"); await sleep(150);
  const link = await page.evaluate(() => navigator.clipboard.readText());
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p2 = await ctx2.newPage(); await p2.goto(link);
  await p2.waitForSelector("#formats .card"); await sleep(400);
  check("a shared draft link reopens the same pop-up in a different browser", (await p2.evaluate(() => JSON.stringify(window.__trplBuilder.toConfig()))) === before);
  await p2.goto(URL + "#c=THIS-IS-NOT-A-VALID-LINK"); await p2.reload(); await sleep(400);
  check("a broken link leaves the builder working", (await p2.$$("#formats .card")).length === 5 && (await p2.$$("#presets .card")).length === 9);

  // hostile share links and imports
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const hostile = { id: "2026-10-x", format: "popup", name: "x", theme: { bg: 5, text: "red}*{display:none}", head: "#092A4D" },
    content: { headline: "Hi", body: "<p>ok</p><img src=x onerror=\"window.__pwn=1\"><script>window.__pwn=1</script>", buttons: [{ label: "a", action: "<img src=x onerror=window.__pwn=1>", value: "x" }] },
    rules: { sets: [{ include: [{ t: "path", op: "<img src=x onerror=window.__pwn=1>", v: "/a" }], trigger: { type: "<b>x" } }] } };
  await p2.goto(URL + "#c=" + b64(hostile)); await p2.reload(); await p2.waitForSelector("#formats .card"); await sleep(600);
  const hz = await p2.evaluate(() => ({ pwn: window.__pwn, imgs: document.querySelectorAll("#form img, #form script").length, cfg: window.__trplBuilder.toConfig() }));
  check("a hostile link cannot run script in the builder", !hz.pwn && hz.imgs === 0, JSON.stringify(hz).slice(0, 200));
  check("hostile theme, action and rule values are replaced with safe ones", /^#[0-9A-F]{6}$/i.test(hz.cfg.theme.text) && hz.cfg.theme.bg === "#FFFFFF" && hz.cfg.content.buttons[0].action === "url" && hz.cfg.rules.sets[0].include[0].op === "starts" && hz.cfg.rules.sets[0].trigger.type === "load" && !/onerror|script/i.test(hz.cfg.content.body), JSON.stringify(hz.cfg).slice(0, 400));
  await ctx2.close();

  /* ---- time zone ---- */
  const tz = await page.evaluate(() => [window.__trplBuilder.localToISO("2026-10-15T09:00"), window.__trplBuilder.localToISO("2026-12-15T09:00"), window.__trplBuilder.isoToLocal("2026-10-15T09:00:00-06:00")]);
  check("schedule times are Mountain Time (MDT -06:00, MST -07:00)", tz[0] === "2026-10-15T09:00:00-06:00" && tz[1] === "2026-12-15T09:00:00-07:00" && tz[2] === "2026-10-15T09:00", tz.join(" "));

  /* ---- GTM-fired mode (an advanced option) ---- */
  await go(3);
  if (!(await page.evaluate(() => document.getElementById("more3").open))) await page.click("#more3 > summary");
  await page.check("#gtmMode"); await sleep(300);
  check("with GTM deciding, the timing question disappears", !(await page.isVisible("#whenBlock")));
  await go(4);
  const fired = await page.textContent("#gtmFired");
  check("GTM-fired mode prints the trigger settings", fired.includes("matches RegEx (ignore case)") && fired.includes("^/visit(/|$)") && fired.includes("does not match RegEx (ignore case)"), fired.slice(0, 300));
  check("GTM-fired mode gives the show line", (await page.textContent("#showCode")).includes('["show", "' + id + '"]'));
  const gtmOut = await page.inputValue("#out"), gtmCfg = await config();
  await page.click("#btnImport"); await page.fill("#mBody textarea", gtmOut); await page.click("#mActs .pri"); await sleep(400);
  check("GTM-fired page choices survive being reopened", (await config()) === gtmCfg && (await page.textContent("#gtmFired")).includes("^/visit(/|$)"));
  await go(3);
  check("the advanced panel opens by itself for a GTM-fired pop-up", await page.evaluate(() => document.getElementById("more3").open === true));
  await page.uncheck("#gtmMode");

  /* ---- friendly checks ---- */
  await go(1);
  await page.fill('[data-k="content.headline"]', "Teddy welcomes visitors"); await sleep(200);
  const warn = await page.textContent("#checks");
  check("house-style terms are flagged", warn.includes("Teddy") && warn.includes("participants"));
  await page.fill('[data-b="0"][data-bf="value"]', "javascript:alert(1)"); await sleep(200);
  check("an unsafe button address blocks the code", (await page.inputValue("#out")).startsWith("Fix the items"));
  await go(4);
  check("each problem has a “Fix this” link", (await page.$$("#checks li.stop [data-go]")).length >= 1);
  await page.click("#checks li.stop [data-go]"); await sleep(100);
  check("“Fix this” jumps to the step with the problem", await page.isVisible('.step[data-step="1"]'));
  await page.fill('[data-b="0"][data-bf="value"]', "https://www.trlibrary.com/membership");
  await page.fill('[data-k="content.headline"]', "Come back all year");
  await page.click("#rmBtn2"); await sleep(150);
  check("removing the second button takes it out of the pop-up", await page.evaluate(() => window.__trplBuilder.toConfig().content.buttons.length === 1));

  /* ---- preview in each format and device ---- */
  await go(0);
  for (const f of ["banner-top", "banner-bottom", "popup", "slidein", "takeover"]) {
    await page.click('[data-fmt="' + f + '"]');
    for (const d of ["desktop", "phone"]) {
      await page.click('[data-dev="' + d + '"]'); await sleep(1500);
      const frame = page.frames().find((x) => x.url().includes("preview.html"));
      const vis = await frame.evaluate(() => { const h = document.querySelector("[data-trplpop]"); if (!h) return false; return !!h.shadowRoot.querySelector(".on"); });
      check("preview shows " + f + " at " + d, vis);
      if (f === "popup" && d === "desktop") await page.screenshot({ path: path.join(OUT, "builder-step-format.png") });
    }
  }
  await page.click('[data-dev="desktop"]');
  for (const [n, name] of [[1, "message"], [2, "look"]]) { await go(n); await sleep(500); await page.screenshot({ path: path.join(OUT, "builder-step-" + name + ".png") }); }

  check("no native browser dialogs were used", dialogs.length === 0, dialogs.join(","));
  check("no script errors in the builder", errors.length === 0, errors.join(" | "));

  await browser.close(); srv.close();
  const failed = results.filter((r) => !r.ok);
  console.log("\n" + (results.length - failed.length) + " of " + results.length + " builder checks passed.");
  if (failed.length) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
