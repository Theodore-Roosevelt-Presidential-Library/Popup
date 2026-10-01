# TRPL Popup

In-house replacement for OptinMonster on trlibrary.com. Three static pieces, served by GitHub Pages at `https://popup.labs.trlibrary.com`:

- **`popup.js`**: the runtime. Google Tag Manager loads it on every page. It decides which pop-up shows, where and how often.
- **The builder** (`/builder/`): designs a pop-up in the brand system, previews it with the real runtime, and hands back code to paste into GTM.
- **`gtm/trpl-popup-setup.json`**: a one-time GTM import that creates the loader tag, a template tag to copy, the GA4 event tag, its trigger and six variables.

Pop-ups live in GTM, one Custom HTML tag each. Only people who can publish the GTM container can put a pop-up on the site. The builder cannot change the live site, and pop-up settings are data: the runtime never runs code from a pop-up.

The full design, decisions and remaining work are in [`PLAN.md`](PLAN.md).

## Formats

| Format | Behaviour |
|---|---|
| Banner, top | Folds down and pushes the page and the fixed header down. |
| Banner, bottom | Folds up from the bottom. Waits for the ticket alert; lifts the chat button clear. |
| Pop-up | Panel over a dimmed page. Three sizes, image on top or to a side. |
| Slide-in | Corner card, lower right above the chat button (or lower left). |
| Takeover | Fills the window. |

All formats are responsive. On phones, slide-ins and bottom banners wait while the ticket alert is on screen.

## One-time setup

1. **GitHub Pages.** Repo Settings → Pages → deploy from `main`, root. The `CNAME` file sets `popup.labs.trlibrary.com`. Turn on Enforce HTTPS.
2. **GTM.** Admin → Import Container → choose `gtm/trpl-popup-setup.json` → existing workspace → Merge → *Rename conflicting tags, triggers, and variables* → review the listed changes → Confirm. Preview, then Submit. This file has not yet been imported anywhere; read GTM's change list before confirming.
3. **GA4.** Register six event-scoped custom dimensions: `popup_id`, `popup_name`, `popup_format`, `popup_trigger`, `popup_action`, `popup_variant`.

## Making a pop-up

1. Open the builder at `https://popup.labs.trlibrary.com/builder/`.
2. Fill in the six panels. Panel 4 lists the pages a rule matches, from a nightly copy of the site's sitemap.
3. Click **Copy for GTM**. The builder shows the tag name and version name to use.
4. In GTM: Tags → `TRPL Popup – TEMPLATE (copy me)` → ⋮ → Copy. Rename the copy, select everything in the HTML box, paste, Save.
5. Preview, check it on the site, Submit.

To edit: copy the tag's HTML into the builder with **Import code**, change it, copy it back over the old HTML. To take one down: pause its tag.

If the template tag is missing, the settings are: Custom HTML; Support document.write off; Advanced Settings → Tag firing options → Once per page; Triggering → All Pages.

## Naming

| Thing | Pattern |
|---|---|
| Pop-up id | `YYYY-MM-short-name`, never reused |
| Pop-up tag | `TRPL Popup – <id> (<format>)` |
| Trigger for a GTM-fired pop-up | `TRPL Popup – Trigger – <id>` |
| Variables | `TRPL Popup – DLV – <parameter>` |
| Version name | `Popup: add|edit|pause <id>` |

## Testing a page

Add to any page URL on a TRPL hostname:

| Switch | Effect |
|---|---|
| `?trplpop_debug=1` | Logs to the console why each pop-up did or did not show. |
| `?trplpop_preview=<id>` | Forces a pop-up that GTM has registered. |
| `?trplpop_clear=1` | Wipes this browser's pop-up history. |
| `?trplpop_off=1` | Disables the runtime for that page view. |

No link can carry pop-up content, so nobody can craft a URL that shows their own message on trlibrary.com. A link can open a pop-up that GTM has registered and that is inside its scheduled dates, nothing else. The runtime only runs on `*.trlibrary.com`, `localhost` and the organisation's `github.io` address.

## Who can change what visitors see

Two routes exist, and both need protecting:

1. **Publishing the GTM container** puts pop-up content on the site.
2. **Pushing to this repo's `main` branch** changes `popup.js`, the script every visitor runs. GitHub Pages deploys it within a minute, with no GTM step in between.

So write access to this repo should be as tight as GTM publish rights. Recommended: a branch protection rule on `main` that requires a pull request, and a short list of people who can merge. The nightly sitemap job can also write to the repo; it runs only `scripts/fetch_sitemap.py` and commits only `data/sitemap.json`.

## For developers

```js
TRPLPopup.show("2026-10-fall-membership");            // frequency rules apply
TRPLPopup.show("2026-10-fall-membership", { force: true });
TRPLPopup.close("2026-10-fall-membership");
TRPLPopup.reset();                                     // after a client-side page change
TRPLPopup.on("show" | "action" | "convert" | "close", fn);
TRPLPopup.push(["config", { sessionOverlayCap: 1 }]);  // site-wide settings, from the loader tag
```

- Any link with `href="#popup:<id>"` or any element with `data-trpl-popup="<id>"` opens that pop-up.
- Data-layer events: `trpl_popup_impression`, `trpl_popup_interaction`, `trpl_popup_conversion`, `trpl_popup_close`. The same events fire on `document` as `trplpopup:show`, `:action`, `:convert`, `:close`.
- Visitor history is one first-party cookie, `trplpop`, on `.trlibrary.com`. No personal data.
- Each pop-up's settings carry a check value. The runtime refuses settings that do not match it (an incomplete paste or a hand edit). The check is made on the parsed settings, so GTM's minifier does not disturb it.
- Site-specific selectors (fixed header, ticket alert, chat button) are in the `site` object at the top of `popup.js` and can be overridden with `config`.

### Running the checks

```sh
NODE_PATH=$(npm root -g) node tests/run.js                       # runtime, 130 checks
NODE_PATH=$(npm root -g) node tests/builder.js                   # builder, 42 checks
```

Both need Node and Playwright with Chromium. Screenshots go to `tests/out/`.

### Other scripts

- `scripts/fetch_sitemap.py` refreshes `data/sitemap.json`. `.github/workflows/sitemap.yml` runs it nightly. If that file is not in the repo yet, create it from `scripts/sitemap.workflow.yml`:
  `mkdir -p .github/workflows && git mv scripts/sitemap.workflow.yml .github/workflows/sitemap.yml`

## Known limits

- The builder is open to anyone with the address. That is by design: it is a design tool and cannot change the live site. Publishing happens only in GTM.
- A published GTM container is public, so a pop-up scheduled for a future date is readable by anyone who inspects it. Keep embargoed copy in an unpublished GTM workspace until release.
- Safari keeps script-written cookies for about seven days, so "30 days" behaves as roughly seven for Safari visitors who do not return within the week.
- The Constant Contact form block is unproven until tried on the live site with a real form.
