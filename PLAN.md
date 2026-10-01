# TRPL Popup — Replacement Plan for OptinMonster

Status: phases 1 and 2 built and tested locally on 2026-10-01. Not yet deployed, not yet in GTM. See "Build status" below.
Home: `https://popup.labs.trlibrary.com` (GitHub Pages, this repo).

## Build status (2026-10-01)

| Piece | State |
|---|---|
| Runtime `popup.js`: four formats, page rules, triggers, frequency, queue, ticket alert, chat launcher and fixed-header handling, data-layer events, JavaScript interface | Built. 140 automated checks pass at phone, tablet and desktop widths. |
| Builder: editor, brand presets, sitemap page rules, live preview, Copy the code, open existing, share link | Built at `/builder/` as a five-step guided flow in plain language. 69 automated checks pass. |
| Demo page | Built (`/demo/`). |
| Sitemap copy and nightly refresh job | Built. The job starts once the repo is pushed. Confirmed that trlibrary.com does not allow its sitemap to be read from another domain, so the copy is needed. |
| One-time GTM import file | Written, not yet imported into GTM. GTM shows every change before confirming. |
| Constant Contact form block | Written, unproven. Needs a real form ID and a test on the live site. |
| Still to build (phase 4) | Success and yes/no views, collapsed tab, countdown, visitor-history rules, A/B split, location. |
| Not done | OptinMonster inventory, GitHub Pages setup, GTM import, cutover. |

Differences from the plan as first written: brand colours and pairings live in the builder script rather than a separate `brand/tokens.json`; page rules are "show on / never on" lists plus optional conditions per rule set; a pop-up's rule set holds one trigger.

## 1. Goal

Replace OptinMonster with an in-house pop-up system that TRPL staff can run without a developer:

- a **builder** that applies the brand system and produces mobile-responsive pop-ups;
- a **runtime script** loaded through Google Tag Manager that decides what shows, where and how often;
- everything served from GitHub Pages, with no monthly licence.

## 2. Decisions made (2026-10-01)

| Topic | Decision |
|---|---|
| GTM's role | Hybrid. One GTM tag loads the runtime on every page. Each pop-up carries its own display rules from the builder, and any pop-up can also be fired by a GTM trigger. |
| Publishing | The builder hands back a snippet and instructions; the snippet is pasted into its own GTM tag and goes live with a GTM publish. Chosen over a Publish button because it adds no new credential (section 14). |
| Email capture | Two modes: buttons and links, and an embedded Constant Contact sign-up form. No native form, no relay service. |
| Ticket alert | Stays a separate tool and takes priority. Marketing pop-ups work around it (section 9). |
| Repo visibility | Public is fine. The repo holds only the tool; pop-up content lives in GTM. |
| Who can put a pop-up on the site | Only people with GTM publish rights. Nobody else, whatever they can open or read (section 14). |
| GTM hand-off | Copy and paste. No GTM setting is typed by hand; the builder states the exact settings (section 10). |
| Page rules | The builder knows the site's sitemap and shows which pages a rule matches (section 7). |
| Builder access | Open, at `/builder/`, linked from the front page. The four-digit code, unlisted folder and no-index rules were removed on 2026-10-01 once publishing moved to GTM: the builder cannot change the live site, so there was nothing left for them to protect. |

## 3. What exists today

Read from the public site and GTM container on 2026-10-01.

| Item | Finding |
|---|---|
| GTM container | `GTM-N3888GS9`, loaded by Drupal's Google Tag module. |
| OptinMonster | Account-wide embed in a GTM Custom HTML tag, firing on all pages. Which campaigns are live is not visible without an account login. |
| Constant Contact | The sign-up form widget script and tracking script are already loaded through GTM. |
| Ticket alert | `trpl-float.js`, fired by GTM only on `/` and paths containing `/visit`. Docks lower-left on desktop; full-width along the bottom at 600px and under. Dismissal lasts the rest of the Mountain Time day (localStorage). |
| AI chat widget | The Deyra chat launcher is fixed to the right edge of the page. A lower-right slide-in has to clear it. Exact geometry still to be measured in a browser. |
| Site header | `#top-header` is `position: fixed; top: 0`. A top banner that "pushes the page down" has to move this header too. |
| Consent | No cookie-consent banner; consent mode is off. |
| Sitemap | `https://www.trlibrary.com/sitemap.xml`, one file, 1,057 URLs on 2026-10-01. |
| Analytics | GA4, Google Ads, Meta Pixel, Clarity, Hotjar and PostHog are present. |
| Brand source | `Brand/brand.json` holds colours, type and terminology. `DigitalInvite` holds the eight approved colour pairings used by the rsvp.labs builder. |

## 4. Architecture

Three parts. The builder and runtime are static files on GitHub Pages; the pop-ups themselves live in GTM.

```
Builder ──copy snippet──▶ GTM tag "TRPL Popup – <name>" ──GTM publish──▶ live

GTM (All Pages) ──loads──▶ popup.js   (rules, queue, rendering, frequency, events)
GTM (per pop-up) ─registers─▶ the pop-up's settings with popup.js
```

**Runtime (`popup.js`).** One dependency-free script at a URL that never changes, so the loader tag is set once. It collects the pop-ups GTM registers, evaluates rules, manages the queue and frequency state, renders into a shadow root so site CSS and pop-up CSS cannot affect each other, and reports events to the data layer.

**Pop-up settings.** Each pop-up is a block of structured settings (content, design, rules, frequency) inside its own GTM tag. It arrives with the GTM container, so there is no extra request per page view. The settings are data, not code.

**Builder.** A single page in the rsvp.labs pattern: settings on the left, live preview on the right, brand presets, share link, import, no native browser dialogs.

Proposed repo layout:

```
index.html              landing page with links to the builder and the demo
builder/                builder page, script and preview frame
popup.js                runtime (evergreen URL)
data/sitemap.json       site paths, refreshed nightly by a GitHub Action
gtm/trpl-popup-setup.json   one-time GTM import: loader, template tag, GA4 tag, trigger, variables
demo/                   test page with a mock fixed header, the ticket alert and a chat launcher
tests/                  Playwright checks at phone, tablet and desktop widths
CNAME                   popup.labs.trlibrary.com
```

## 5. Formats

| Format | Desktop | Phone | OptinMonster equivalent |
|---|---|---|---|
| **Banner, top** | Folds down from the top and pushes the page and the fixed header down. Dismissible. | Same; copy and button stack. | Floating Bar (top) |
| **Banner, bottom** | Folds up from the bottom, overlays the page. | Same; yields to the ticket alert. | Floating Bar (bottom) |
| **Pop-up** | Centred panel over a dimmed page. Small, medium, large. Image on top or to one side. | Panel at about 90% width, image on top, or a bottom sheet. | Popup |
| **Slide-in** | Slides in at the lower right, clear of the chat launcher. Optional collapsed tab. Other corners available. | Full-width card along the bottom; waits for the ticket alert. | Slide-in |
| **Takeover** | Fills the window. Background colour, photo or brand pairing. | Fills the screen; close control always in reach. | Fullscreen |

Later, if wanted: an inline placement (a pop-up design rendered inside the page at a marked spot).

Every format gets separate desktop and phone previews in the builder, and a block can be hidden on one or the other.

## 6. Content and actions

**Blocks:** headline, body text, image, one or two buttons, Constant Contact form, countdown to a fixed date, divider. A live ticket-availability block (reusing the ticketing widgets) is a candidate for a later phase.

**Views:** a main view at launch. A success view and a two-step yes/no view follow in phase 4.

**Button and link actions** (a fixed list, no free-form script):

| Action | Notes |
|---|---|
| Go to a URL | Same tab or new tab. Counts as a conversion if marked. |
| Close | Sets the "closed" state. |
| Go to another view | Phase 4. |
| Open another pop-up | By id. |
| Call or email | `tel:` and `mailto:` links. |
| Copy text | For a promo code. |
| Send a data-layer event | A named event GTM can act on. This is the route for anything custom. |

**Constant Contact form.** The pop-up holds a Constant Contact inline form, rendered by the widget script GTM already loads. Two things are unproven and get a spike in phase 0: that a form container added after page load renders, and that a successful submission can be detected so the pop-up can count a conversion. Fallback if either fails: a button to the hosted sign-up page.

## 7. Display rules

Rules work as in OptinMonster: a pop-up has one or more rule sets; it shows when any one rule set passes; inside a set, rules combine with ALL or ANY.

| Rule | Plan |
|---|---|
| Page path: is, contains, starts with, ends with, pattern, homepage, and their negations | Phase 1 |
| Time on page, scroll depth (percent) | Phase 1 |
| Exit intent: mouse leaving the window on desktop, fast scroll-up on phones | Phase 1 |
| Schedule: start and end, days of week, hours, in Mountain Time by default | Phase 1 |
| Device: desktop, tablet, phone | Phase 1 |
| Click to open: any link or button marked for a pop-up | Phase 1 |
| Fired by GTM | Phase 1 |
| Query string and UTM values, URL hash, referrer | Phase 1 |
| New or returning visitor, pages viewed this session, time on site, inactivity | Phase 4 |
| Cookie, localStorage, JavaScript variable or data-layer value | Phase 4 |
| Element exists or scrolls into view | Phase 4 |
| Has seen, closed or converted on another pop-up; has visited a page | Phase 4 |
| A/B split | Phase 4. Random split in the browser, variant reported to GA4. |
| Location (country, state, city) | Phase 4, needs one small helper outside Pages (section 12). |
| Ad-blocker detection, e-commerce cart rules, spin-to-win, sound effects | Not planned. |

### Page rules built on the sitemap

trlibrary.com does not allow its sitemap to be read from another domain in the browser (confirmed 2026-10-01), so a scheduled GitHub Action copies it into `data/sitemap.json` each night. The whole list of paths is about 29 KB.

Site shape on 2026-10-01:

| Section | Pages | Section | Pages |
|---|---|---|---|
| `/video` | 431 | `/staff-members` | 43 |
| `/tr` | 196 | `/node` (no friendly URL) | 35 |
| `/quiz` | 82 | `/calendar` | 26 |
| `/podcast` | 68 | `/support`, `/membership` | 9 |
| `/visit` | 65 | `/tickets` | 3 |
| `/about` | 48 | everything else | 51 |

What the builder does with it:

- **Section picker.** Tick sections to include or exclude; the builder writes the rule.
- **Page search.** Type to find a specific page instead of typing its path.
- **Live match list.** Every rule shows "matches N of 1,057 pages" with the list, so an over-broad or mistyped rule is visible before it ships.
- **Presets**, such as visit-planning pages, T.R. history pages, giving pages, and "everywhere except video, quiz and staff pages".
- **Standing exclusions**, on by default and removable: print views (`…/print`), the ticket purchase pages (`/tickets`), RSVP pages (`/rsvp`), `/privacy`, and unaliased `/node/` pages.
- Matching ignores letter case, because some live paths contain capitals.

The sitemap is a guide, not the whole site. Search results, unlisted landing pages and error pages are not in it, so the tester also accepts any URL typed in. Rules look at the path only, not the query string.

## 8. Frequency and cookies

Per pop-up, mirroring OptinMonster's three settings:

| Setting | Options | Default |
|---|---|---|
| After it is closed, show again | after N days, next visit, every time rules are met, never | 30 days |
| After a conversion, show again | after N days, never | 365 days |
| Remember that it was seen | for N days | 30 days |

Site-wide: an optional cap such as "one interruptive pop-up per visit" and an optional quiet period after any close.

**Storage.** One compact first-party cookie on `.trlibrary.com`, so state carries across `www`, `shop` and `labs` subdomains, holding seen, closed and converted timestamps per pop-up and pruned to live campaigns. Session counters live in sessionStorage. No personal data is stored.

**Known limit.** Safari caps cookies written by scripts at about seven days. A "30 days" setting behaves as roughly seven for Safari visitors who do not return within the week. OptinMonster has the same limit. To be re-verified during testing.

**Test switches** on any page URL: `?trplpop_preview=<id>` forces a pop-up that GTM has registered (unpublished ones are tested in GTM's preview mode; a link never carries pop-up content, so nobody can craft a URL that shows their own message on trlibrary.com), `?trplpop_clear=1` wipes pop-up state, `?trplpop_debug=1` logs why each pop-up did or did not show, `?trplpop_off=1` disables the runtime.

## 9. Living with the rest of the page

The runtime treats the screen as zones: top, bottom, left corner, right corner, overlay. One item per zone; an overlay (pop-up or takeover) is exclusive.

| Neighbour | Rule |
|---|---|
| **Ticket alert, desktop** | It keeps the lower-left corner. Slide-ins use the lower right. A bottom banner waits until the alert is dismissed or confirmed absent. |
| **Ticket alert, phone** | It owns the bottom of the screen. Slide-ins and bottom banners wait; if the alert appears while one is showing, the pop-up collapses. |
| **Chat launcher** | Slide-ins sit above it and stand down while the chat panel is open. |
| **Fixed header** | A top banner moves `#top-header` down by its own height and restores it on close. |
| **Stacking order** | Pop-up overlays sit above the header and the ticket alert. |

The ticket alert decides whether to show only after it has fetched availability, so the runtime has to wait for its answer. One small additive change to `TicketingWidgets` is proposed: `trpl-float.js` announces its state (`shown`, `none`, `dismissed`) with a DOM event. Until then the runtime watches for the `#trpl-float` element.

Only one interruptive pop-up shows per page view. When several qualify, the builder's priority number decides.

## 10. GTM: exact settings

Adding or changing a pop-up is copy and paste. No GTM setting is typed by hand.

### One-time setup

The repo ships `gtm/trpl-popup-setup.json`. In GTM: **Admin → Import Container**, choose the file, pick the existing workspace, **Merge**, **Rename conflicting tags, triggers, and variables**, **Confirm**. It creates:

| Item | Type | Settings |
|---|---|---|
| `TRPL Popup – Loader` | Tag · Custom HTML | HTML: `<script async src="https://popup.labs.trlibrary.com/popup.js"></script>` · Support document.write: off · Advanced Settings → Tag firing options: **Once per page** · Triggering: **All Pages** |
| `TRPL Popup – TEMPLATE (copy me)` | Tag · Custom HTML | HTML is a comment only, so it does nothing when it fires. Tag firing options: **Once per page** · Triggering: **All Pages**. Exists to be copied. |
| `TRPL Popup – GA4 events` | Tag · Google Analytics: GA4 Event | Measurement ID: the site's existing GA4 ID · Event Name: `{{Event}}` · six event parameters mapped to the variables below · Triggering: `TRPL Popup – events` |
| `TRPL Popup – events` | Trigger · Custom Event | Event name: `^trpl_popup_` · Use regex matching: on · fires on All Custom Events |
| `TRPL Popup – DLV – popup_id`, and the same for `popup_name`, `popup_format`, `popup_trigger`, `popup_action`, `popup_variant` | Variables · Data Layer Variable | Data Layer Variable Name equals the parameter name · Version 2 |
| `TRPL Popup` | Folder | Holds all of the above and every pop-up tag. |

At cutover the OptinMonster tag is paused in the same publish.

### Naming

Every name is generated by the builder and pasted, never typed, so the container stays uniform. Everything sits in the `TRPL Popup` folder and starts with `TRPL Popup – `, which keeps it together in GTM's alphabetical lists and out of the way of other tags.

| Thing | Pattern | Example |
|---|---|---|
| Pop-up id | `YYYY-MM-short-name`: lowercase, hyphens, 40 characters at most | `2026-10-fall-membership` |
| Pop-up tag | `TRPL Popup – <id> (<format>)` | `TRPL Popup – 2026-10-fall-membership (slide-in)` |
| Trigger for a GTM-fired pop-up | `TRPL Popup – Trigger – <id>` | `TRPL Popup – Trigger – 2026-10-fall-membership` |
| System tags and trigger | fixed names from the import file | `TRPL Popup – Loader` |
| Variables | `TRPL Popup – DLV – <parameter>` | `TRPL Popup – DLV – popup_id` |
| Version name on Submit | `Popup: <add, edit or pause> <id>` | `Popup: add 2026-10-fall-membership` |
| Data-layer events | `trpl_popup_<event>` | `trpl_popup_impression` |

Rules that keep it clean:

- **An id is never reused.** It is the key for "already seen or closed" state in visitors' browsers and for GA4 reporting, so a recycled id would inherit the old pop-up's history. Editing keeps the id; duplicating makes a new one.
- **Names carry no status.** GTM already shows paused tags; "live" or "old" in a name goes stale.
- **Every pop-up has an end date in its settings**, so one that is forgotten stops showing on its own.
- **Clean-up:** a pop-up paused for more than 30 days is deleted. GTM's version history keeps it recoverable.
- If the live container already follows a naming convention, these patterns are adjusted to match it before the import file is built.

### New pop-up

1. Builder, Publish step: **Copy the code**. The builder also shows the tag name to use.
2. GTM: **Tags → `TRPL Popup – TEMPLATE (copy me)` → ⋮ → Copy**. The copy inherits the trigger and firing option.
3. Rename the copy to the name the builder gave, select everything in the HTML box, paste.
4. **Save → Preview**, check the pop-up on the site, then **Submit** using the version name the builder gave.

If the template tag is ever missing, the settings to reproduce are: Tag type **Custom HTML**; Support document.write **off**; Advanced Settings → Tag firing options → **Once per page**; Triggering → **All Pages**.

### Edit or take down

- **Edit:** in the builder, **Open an existing pop-up**, paste the tag's current HTML, change it, **Copy the code**; in GTM open the tag, replace the HTML, Save, Submit.
- **Take down:** on the tag, **⋮ → Pause**, then Submit.

### The snippet

```html
<!-- TRPL Popup · 2026-10-fall-membership · built 2026-10-01 · edit by importing this code into the builder -->
<script>
(window.TRPLPopup = window.TRPLPopup || []).push(["register", {"id":"2026-10-fall-membership","format":"slide-in", ... }]);
</script>
```

- The snippet is its own editable source: the builder re-imports it exactly, as rsvp.labs does.
- Plain settings only, written in syntax every GTM container accepts.
- The builder never emits `{{`, which GTM would read as a variable reference.
- It carries a length check, so a clipped paste is refused by the runtime instead of half-rendering.
- Registration works whether the loader or the pop-up tag runs first.

### When GTM decides instead of the pop-up's own rules

Choosing **Fired by GTM** in the builder produces a second, two-line snippet and prints the trigger to create. Example:

```html
<script>(window.TRPLPopup = window.TRPLPopup || []).push(["show", "2026-10-fall-membership"]);</script>
```

| GTM field | Value |
|---|---|
| Trigger type | Page View |
| This trigger fires on | Some Page Views |
| Condition | `Page Path` · `matches RegEx (ignore case)` · `^/visit(/|$)` |

The builder writes page patterns only in the form GTM's own matcher accepts and uses the identical pattern in the runtime, so the two cannot disagree. The match list from section 7 is shown beside it.

### Analytics

Data-layer events: `trpl_popup_impression`, `trpl_popup_interaction`, `trpl_popup_conversion`, `trpl_popup_close`, each with `popup_id`, `popup_name`, `popup_format`, `popup_trigger`, `popup_action` and `popup_variant`. These become GA4 events and replace OptinMonster's own counts. The matching custom dimensions need registering in GA4 once.

## 11. JavaScript interface

```js
TRPLPopup.show(id)      // open a pop-up; frequency rules still apply unless { force: true }
TRPLPopup.close(id)
TRPLPopup.reset()       // re-evaluate after a client-side page change
TRPLPopup.on(event, fn) // show, close, convert, action
```

The same events are dispatched on `document` as `trplpopup:show`, `trplpopup:close`, `trplpopup:convert` and `trplpopup:action`.

Any link can open a pop-up by pointing at `#popup:<id>`, which Drupal editors can do without touching code.

Custom script does not live in pop-ups. Anything bespoke listens for these events from a GTM tag, where scripts are already reviewed and versioned.

## 12. Location targeting

A browser cannot see its own IP address, and the public databases (MaxMind GeoLite, DB-IP Lite) are downloads that need something to run the lookup, so GitHub Pages alone cannot do this. Three workable routes:

| Route | What it gives | Trade-off |
|---|---|---|
| **Cloudflare Worker** (recommended) | Country, state, city, metro, postal code and time zone from Cloudflare's own data. No database to maintain. Free plan allows 100,000 requests a day. | About twenty lines of code hosted outside GitHub Pages; needs a Cloudflare account. |
| Free look-up API called from the browser | Country, state, city with no key. | Free tiers are small (ipwho.is: 1,000 requests a day per site) and terms change; a paid tier would be needed at site traffic. |
| Browser time zone | Zero cost, no request. | Coarse: tells Mountain from Central from Eastern, nothing finer. |

Design: location is a pluggable provider. The look-up runs only when a live pop-up has a location rule, the answer is cached for the visit, and the pop-up system keeps working if the provider is down.

Accuracy: reliable for country and state; weaker for city, especially for rural and mobile connections, which often resolve to a carrier hub. State-level rules ("North Dakota and neighbouring states" versus everyone else) are sound. A radius around Medora is not.

## 13. Builder

- Five guided steps: Format, Message, Look, Where & when, Publish. Plain-language labels; less common settings (reference name, hand-written rules, extra conditions, GTM-fired mode, priority, the raw code) sit under "More options" in each step. Problems link back to the step that fixes them.
- **Brand presets:** the eight approved pairings from the rsvp.labs builder, with fonts and colours from `Brand/brand.json`. Colour pickers are limited to the brand palette.
- **Guardrails:** live contrast check; accent colours restricted to headlines per the guidelines; a copy check for house terminology from `brand.json`.
- **Fonts:** the website's own: Dharma Gothic E (headlines), Clearface (text), Frutiger (buttons, labels), under the family names the trlibrary.com theme declares. On the site they resolve from the theme with no extra request. `fonts.css` copies the theme's declarations and points at the same files on www.trlibrary.com; the builder, preview, demo and front page link to it, and `popup.js` adds it on any page where the fonts are missing. Fallbacks are the website's size-matched stand-ins, then system fonts.
- **Images:** hosted on Drupal or the DAM and pasted as URLs, as with rsvp.labs.
- **Preview:** desktop, tablet and phone frames, with a mock ticket alert and chat launcher that can be toggled on.
- **Page rules:** section picker, page search and live match list from the sitemap (section 7).
- **Hand-offs:** one **Copy the code** button, with the tag name, version name and exact GTM steps shown beside it (section 10); **Copy everything to send to a colleague** for handing the GTM step to someone else; open an existing pop-up from a pasted snippet; a share link for passing a draft to a colleague.
- **Inventory:** the list of pop-ups is the list of *TRPL Popup* tags in GTM.
- In-page overlays only; no native `alert`, `confirm` or `prompt`.

## 14. Publishing and safeguards

**How it works.** The builder produces a snippet. It goes into a new Custom HTML tag in GTM, is checked in GTM's preview mode on the live site, and goes live when the container is published. GTM's version history is the audit trail and the rollback.

**Why GTM instead of a Publish button.** A Publish button needs a GitHub token sitting in each editor's browser, which would be a second way to change what appears on trlibrary.com; a leaked token with write access to this repo could alter the runtime script itself. Publishing through GTM adds no new credential. The people who can change the live site are exactly the people who can already publish the container, behind Google sign-in.

**Who can create a live pop-up.** Only someone who can publish the GTM container. A stranger who finds the builder and gets past the code can design a pop-up on their own screen and nothing more: the builder has no connection to the live site, and no link or URL parameter can make trlibrary.com display pop-up content that GTM did not supply. As a further guard, `popup.js` runs only on TRPL's own hostnames, so the script cannot be used to put TRPL-styled pop-ups on someone else's site.

**Pop-ups contain no script.** The snippet holds structured settings only: known block types, sanitised text, `https` links and the fixed action list. The runtime ignores anything else.

**Builder access.** The builder is open at `/builder/`. It cannot change anything live, so it needs no gate; the controls that matter are GTM publish rights and write access to this repo.

**Things to know.**

- A published GTM container is public. A pop-up scheduled for a future date is readable by anyone who inspects it. Embargoed copy stays in an unpublished GTM workspace until release.
- Every new pop-up or edit is a GTM publish, which takes a few minutes and GTM access.
- Fastest off-switch: pause the pop-up's tag, or the loader tag to stop everything.
- Later option if GTM becomes a bottleneck: a Publish button writing to a separate, data-only repo, so its token could never touch the runtime. The pop-up format stays the same either way.

## 15. Accessibility, performance, search

- Pop-ups and takeovers trap focus, close on Escape, return focus on close and are announced as dialogs. Banners and slide-ins are not modal.
- Motion is reduced for visitors who ask for that in their system settings.
- Close controls are at least 44px and always visible on phones.
- The runtime stays small and loads images only when a pop-up is about to show. A top banner reserves its space in one step to avoid a jumpy page.
- Google penalises pages that cover content with an interstitial as soon as a visitor arrives from search on a phone. The builder warns when a takeover is set to show immediately on phones.

## 16. Phases

**Phase 0 — Inventory and proofs.** List every live OptinMonster campaign with its type, rules, cookie settings and recent results; confirm the plan's renewal date. Measure the chat launcher. Prove the Constant Contact form inside a late-rendered container. Confirm who has GTM publish rights. Read the live GTM container (export or in the browser) so the import file and instructions use its real trigger, variable and folder names. Confirm the builder cannot read the sitemap directly and that a pop-up's settings fit comfortably in one Custom HTML tag.
*Done when:* there is a list of pop-ups to rebuild and no unknowns left in sections 6 and 9.

**Phase 1 — Runtime.** `popup.js`, the four formats, phase-1 rules, frequency state, zone and queue logic, data-layer events, the JavaScript interface, the demo page and automated checks.
*Done when:* all four formats pass the checks at three widths on the demo page, alongside the real ticket alert.

**Phase 2 — Builder.** Editor, brand presets, previews, sitemap-aware page rules, Copy the code with instructions, the one-time GTM import file, share link, import.
*Done when:* a pop-up can be built, pasted into GTM, seen in GTM preview on the live site, and re-imported into the builder without loss.

**Phase 3 — Cutover.** Import the one-time setup file into a GTM workspace and test in preview mode; publish with no campaigns; rebuild OptinMonster campaigns one at a time, pausing each original; pause the OptinMonster tag; cancel the subscription after two clean weeks. Write the runbook in Outline.
*Done when:* OptinMonster is out of the container and GA4 shows pop-up events.

**Phase 4 — Parity extras.** Constant Contact success handling, success and yes/no views, collapsed tab, countdown, the remaining rules, A/B split, location.

## 17. Open items

1. OptinMonster inventory: needs an account login.
2. Which sites at launch: `www.trlibrary.com` only, or also the shop and other properties.
3. Location: whether a Cloudflare Worker is acceptable as the one piece outside GitHub Pages, and whether TRPL has a Cloudflare account.
4. Who has GTM publish rights; they are the pop-up publishers.
5. Slide-in and chat launcher: confirmed as a real conflict. Measure the launcher and its open panel in a browser, then choose between sitting above the launcher (planned) and moving to the lower left on pages where the ticket alert never loads.
