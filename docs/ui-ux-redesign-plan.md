# AgriQNet — UI/UX Redesign Plan (ranked, with skill prompts)

Audit of the running web app (`apps/web`, http://localhost:3000) on 20 Nov 2026, at phone (375×812) and desktop (1280×800) sizes, in demo mode, across all 9 screens: Language gate, Login, Home, Weather, Pest photo, Alerts, Ask, Which crop?, Fertilizer, Alert Network, plus the Library shelf.

Skills used to build this plan and named in every prompt below:

| Skill (slash command) | What it does in this plan |
|---|---|
| `/ui-ux-pro-max:ui-ux-pro-max` | UX rule database (130 guidelines, priority 1→10), `--design-system`, `--domain ux / gsap / chart`, `--stack react / shadcn`, pre-delivery checklist (`references/pro-rules.md`) |
| `/ui-ux-pro-max:ui-styling` | Tailwind v4 + shadcn/ui setup, theming with CSS variables, accessible Radix components, responsive patterns |
| `/ui-ux-pro-max:design-system` | 3-layer tokens (primitive → semantic → component), component state specs, persisted `MASTER.md` |
| `/frontend-design:frontend-design` | Distinct visual direction, one memorable "hero" moment, restraint, anti-template checks, plain-language copy |
| `/ui-ux-pro-max:design` (icon sub-skill) | Custom SVG icon/illustration set for crops, pests, weather states |
| `/ui-ux-pro-max:banner-design` | Library book-cover art (generated covers instead of repeated title text) |

---

## 1. Decisions you made (these constrain every prompt)

| Question | Your answer | What it means in the prompts |
|---|---|---|
| Visual direction | **Evolve current** | Keep forest green `agri-*`, warm cream/paper, harvest gold, Fraunces + Inter + Noto Indic. No new palette. Fix hierarchy and weak points. |
| Primary audience | **Low-literacy farmers** | Voice-first, picture-first, Kannada-first, cheap Android phones, outdoor sunlight, one-thumb use. |
| Motion | **Purposeful + 1 hero moment** | Motion only for feedback and state change. One signature animation: the "living sky" home weather card. Reduced-motion respected. |
| Structural scope | **Rebuild Weather natively; move to a real Tailwind build** | Replace the `apps/weather` iframe inside `SmartWeather.tsx`; replace the `cdn.tailwindcss.com` script with Vite + Tailwind v4. |
| Not in scope (declined) | URL routing, merging Crop + Fertilizer | Keep the in-memory `view` state navigation. Keep two screens, but they share the farm profile. |
| Login | **Phone + OTP** | Remove the password field. Twilio is already in the stack. |
| Themes | **Sunlight high-contrast toggle** | One extra `data-theme="sun"`. No full dark mode. |
| Prompt format | **Copy-paste per item** | One self-contained prompt per improvement below. |

---

## 2. What works well (keep it)

- **Picture + word choices everywhere** (`ChoiceGrid` in `components/ui/Kit.tsx`): soil swatches, crop photos, tick marks. Meaning never depends on colour alone.
- **Read-aloud and mic on most screens** (`SpeakButton`, `MicButton`), with Sarvam fallback.
- **Language gate**: script glyph tiles (ಕ / हि / తె / A) with a speaker per language. This is the right first screen.
- **Phone bottom bar with 5 items**, a shared-layout pill animation, `MotionConfig reducedMotion="user"`, visible gold focus ring, 44px+ targets in most places.
- **Earthy token set** in `index.html` (`agri`, warm `gray`, `cream`, `paper`, `gold`). It already avoids the generic SaaS look.
- **App Tour** that walks through every feature.

---

## 3. Findings (evidence from the live app)

| # | Screen | What I saw | Severity |
|---|---|---|---|
| F1 | Which crop? | After **Analyze Farm** (about 20s spinner) the **whole app went blank**. Console: `TypeError: Cannot read properties of undefined (reading 'water')` at `CropAdvisor.tsx` (`crop.requirements.water`, lines 584/593). The AI returned a crop without `requirements`. There is **no React error boundary** anywhere. | Critical |
| F2 | Global | Tailwind runs from `cdn.tailwindcss.com` (development-only build; styles are compiled in the browser at runtime, which is slow on budget phones). Tokens live in an inline `<script>`, so shadcn/ui and real theming can't be used. | High |
| F3 | Home | The "This week in Bengaluru Urban" advice card shows grey skeleton bars plus "Preparing advice for your district…" for a long time, with no timeout, retry or partial content. | High |
| F4 | Which crop? / Weather | Long AI waits show a bare spinner ("Analyzing…", "Loading Weather Station…") with no stages and no sense of progress. The empty state then disappears and the screen looks frozen. | High |
| F5 | Weather | The screen is an **iframe of a second app** (`apps/weather`, port 5175) with its own **dark theme**, its own search bar and theme toggle, and a **scroll area nested inside the page scroll**. The chart's y-axis starts at 0°, x-labels ("5 pm, 8 am, 11 pm…") are hard to read, and the subtitle "Hyper-local weather data for precision farming" is jargon. | High |
| F6 | Login | Phone **+ password** is a barrier for low-literacy users. The tagline is truncated ("Your intelligent companion for modern, sustainable f…"). | High |
| F7 | Home | Six identical feature cards, each with its own speaker button (6 speakers on one screen). Every card has the same weight, so there is no "what should I do today". The alert banner reads "**1 pest alert(s)** near you" in lowercase ("rice leaf caterpillar"). "Rain chance today: 0%" wraps onto two lines on a phone. | Medium |
| F8 | Which crop? / Fertilizer | The tab names "**GenAI Advisor / Precision Model (ML)**" are engineering words. Fertilizer asks again for soil type, which the farm profile could fill in. One long scrolling form. The empty state says "Fill the form to get started" even though every field is already pre-selected. Labels use `text-xs uppercase` (`CropAdvisor.tsx:359`). | Medium |
| F9 | Ask | The chat lives in a card with a fixed height (`h-[calc(100dvh-170px)]`) inside the page, so it is cramped on a phone. The welcome message is scrolled out of view. The placeholder is truncated ("Type or tap the mic an…"). The mic is the same size as Send even though voice should come first. The trash icon has no label and no confirmation. | Medium |
| F10 | Global | Small text: bottom-nav labels are `text-[11px]`, many subtitles are 12–13px, and grey-500 text sits on cream. This is weak in outdoor sunlight. | Medium |
| F11 | Alert Network | District labels on the Karnataka map are about 6px on a phone, and the map can't be zoomed. The farmer's own district isn't marked "You are here". The stat tiles ("Waiting for check") read like an officer dashboard on a farmer's screen. | Medium |
| F12 | Pest photo | The 1-2-3 stepper hides its labels on phones (`hidden sm:inline`), so it shows bare numbers. There is no camera framing guide and no "scanning" feedback while the model runs. | Medium |
| F13 | Language gate | The first paint shows a faded logo on an empty green screen for about 1s before the tiles fade in (entrance stagger is too slow for a first screen). | Low |
| F14 | Library | Cover art repeats the title, which is printed again under the cover. A browser scrollbar is visible under the horizontal shelf. | Low |
| F15 | Global | Two icon libraries are mixed (Lucide in chrome, Phosphor in content). Pluralisation uses "(s)". Kannada/Telugu string lengths aren't tested against layouts. | Low |

UX database rules that back these up (`/ui-ux-pro-max:ui-ux-pro-max --domain ux`): *Error Recovery: "Try again button + help link"*, *Error Messages: role="alert"*, *Progress Indicators: "Step 2 of 4"*, *Contrast 4.5:1 minimum (aim for 7:1 outdoors)*, *Touch target ≥ 44×44*, *Truncation: handle long content*, *Mobile keyboards: `inputmode`*. GSAP preset note: *loading loops should pause when hidden and stop under reduced-motion*.

---

## 4. Ranked improvements

Ranking = (impact on a farmer completing a task) × (severity) ÷ (effort), with dependencies pulled forward. Run the prompts in this order: #2 unlocks styling for everything after it, and #0 must run before all of them.

| Rank | Improvement | Fixes | Impact | Effort | Skills |
|---|---|---|---|---|---|
| 0 | Persist the design system (`MASTER.md` + tokens) | groundwork | — | S | design-system, ui-ux-pro-max |
| 1 | Crash-proof screens: error boundaries + safe AI parsing | F1 | Critical | S | ui-ux-pro-max |
| 2 | Real Tailwind v4 build + semantic tokens + shadcn base | F2 | High | M | ui-styling, design-system |
| 3 | Honest waiting: staged progress, timeouts, retry, skeletons | F3, F4 | High | M | ui-ux-pro-max, frontend-design |
| 4 | Native Weather screen ("Can I spray today?") | F5 | High | L | frontend-design, ui-ux-pro-max, ui-styling |
| 5 | Phone + OTP onboarding | F6 | High | M | ui-ux-pro-max, ui-styling |
| 6 | Home: "Today on your farm" + living-sky hero moment | F7 | High | M | frontend-design, ui-ux-pro-max |
| 7 | Sunlight mode + readable type scale | F10 | Medium-High | S | design-system, ui-ux-pro-max |
| 8 | Voice-first Ask screen | F9 | Medium | M | ui-ux-pro-max, ui-styling |
| 9 | Crop & Fertilizer: farmer words, profile prefill, guided steps | F8 | Medium | M | ui-ux-pro-max, frontend-design |
| 10 | Pest photo: camera guide + scan reveal | F12 | Medium | M | frontend-design, ui-ux-pro-max |
| 11 | Alerts & Network map for farmers | F11 | Medium | M | ui-ux-pro-max (chart), frontend-design |
| 12 | Motion system (tokens, direction-aware transitions, faster first paint) | F13 | Low-Medium | S | ui-ux-pro-max (gsap/ux), frontend-design |
| 13 | Consistency pass: one icon set, plural rules, Indic text-length QA | F15 | Low | S | ui-ux-pro-max, design (icons) |
| 14 | Library shelf polish + generated covers | F14 | Low | S | banner-design, frontend-design |

---

## 5. Prompts

**How to use them**

- Paste one prompt per Claude Code session, from the repo root. Each prompt starts with the skills to load. When a message names several skills, Claude invokes each of them.
- Every prompt assumes #0 has run, so `design-system/agriqnet/MASTER.md` exists. Each prompt tells Claude to read it first.
- Every prompt ends with the same verification: screenshots at 375×812 and 1280×800 in the built-in browser, in **English and Kannada**, and a zero-error console.
- Keep demo mode working (`Try Demo Mode`, `Officer demo`). Don't change backend behaviour beyond what a prompt says.

---

### #0 — Persist the design system (run first)

```text
/ui-ux-pro-max:design-system /ui-ux-pro-max:ui-ux-pro-max

Goal: turn AgriQNet's existing "earthy premium" look into a persisted, 3-layer design system that every later redesign prompt reads first. We are EVOLVING the current identity, not replacing it.

Source of truth for current tokens: apps/web/index.html (inline tailwind.config: agri 50–950, warm gray 50–900, cream #F7F4EC, paper #FFFDF8, gold 100/300/500/700, ink #1E2A24; fonts Fraunces + Inter + Noto Sans/Serif Kannada/Telugu/Devanagari; shadows soft/lift; focus ring 3px gold).

Steps:
1. Run the ui-ux-pro-max design-system generator for context only:
   python "<ui-ux-pro-max skill dir>/scripts/search.py" "agriculture farmer advisory mobile app" --design-system -p "AgriQNet" --variance 4 --motion 4 --density 3
   Use its rules (Organic Biophilic style, contrast/reduced-motion/visible-focus requirements, AVOID list). Do NOT adopt its generic palette (#15803D etc.) or its Playfair font. Our existing tokens win.
2. Check design-system/agriqnet/MASTER.md doesn't exist yet (never --force without asking me). Then write it with:
   - Primitive tokens: the current palettes above, unchanged.
   - Semantic tokens: background, surface, surface-raised, text, text-muted (must reach ≥ 7:1 on cream for body copy), primary/on-primary, accent (gold)/on-accent, danger, warning, success, info, border, ring. Map each one to a primitive.
   - A "sun" theme override (high-contrast outdoor mode): text #0F1A14, muted text ≥ 7:1, borders 2px, surfaces pure #FFFFFF, no translucent/blurred chrome.
   - Type scale for low-literacy readers: base 18px phone / 17px desktop, minimum 15px for any text, nav labels ≥ 13px, line-height 1.5 body / 1.15 display. Fraunces for headings only (Latin); Noto Serif Indic for Indic headings.
   - Spacing (4px base, spacious density), radii (only 3 values: 12 control, 20 card, 28 sheet), and the 2 existing shadows.
   - Motion tokens: durations 120 / 200 / 320 / 600ms, easings standard [0.22,1,0.36,1] and exit [0.4,0,1,1], a spring preset, and the rule "motion only for feedback/state change + 1 hero moment".
   - Component specs with states (default/hover/pressed/focus/disabled/loading/error) for: BigChoice tile (ChoiceGrid), PrimaryButton, SpeakButton, MicButton, ScreenTitle, AlertCard, StatusBanner, BottomNav, Sheet/Modal.
   - Voice & copy rules: plain verbs, sentence case, no ALL CAPS labels, no jargon (no "GenAI", "ML", "precision", "hyper-local"), action names that stay the same through a flow.
3. Also write design-system/agriqnet/tokens.css (CSS variables, :root + [data-theme="sun"]), ready for Tailwind v4 @theme inline in prompt #2.
4. Add page override stubs in design-system/agriqnet/pages/: home.md, weather.md, ask.md, crop.md, pest.md, alerts.md, auth.md. One paragraph each with the page's job and its primary action.

Don't modify any app code in this step.
Done when: MASTER.md + tokens.css + page stubs exist, every semantic text/background pair is listed with its contrast ratio, and every pair reaches ≥ 4.5:1 (≥ 7:1 in the sun theme).
```

---

### #1 — Crash-proof screens: error boundaries + safe AI parsing (Critical)

```text
/ui-ux-pro-max:ui-ux-pro-max

Bug (reproduced): on "Which crop?" → Analyze Farm, the whole app white-screens. Console: TypeError: Cannot read properties of undefined (reading 'water') in apps/web/components/CropAdvisor.tsx (crop.requirements.water at ~L584 and ~L593; also selectedCrop.requirements.water ~L360). The Gemini JSON sometimes omits `requirements`. There is no React error boundary in apps/web.

Read design-system/agriqnet/MASTER.md first. Use ui-ux-pro-max --domain ux for "error recovery" and "error messages aria-live".

Tasks:
1. Add a typed normalizer for every AI/LLM response the web app renders (CropAdvisor, FertilizerAdvisor, Home district advice, PestCheck result, ChatModule). Missing fields get safe defaults ('' / [] / null) and are hidden in the UI, never rendered as "undefined". Put the normalizers next to the services (services/geminiService.ts, services/platformService.ts), not in components.
2. Add a reusable <ScreenErrorBoundary> wrapping each screen inside App.tsx's screen() switch, plus one top-level boundary. Fallback UI in the farmer's language (add i18n keys to utils/i18n/{en,kn,hi,te}.json): an illustration/icon, a one-line plain explanation ("Something went wrong on this screen."), a big "Try again" button that resets the boundary and re-mounts the screen, and a secondary "Go to Home" button. Include a SpeakButton that reads the message. role="alert".
3. A failed AI call (network, timeout, bad JSON) must show an inline error card with Retry inside the screen, keeping the farmer's form inputs. Never a blank screen, never a raw error string.
4. Log the boundary error to console.error with the screen name (useful for the demo).

Don't change the visual design of the working states.
Acceptance:
- Reproduce with a mocked response missing `requirements`: crops render without the water line, no crash.
- Throw inside any screen (temporary test): fallback shows, Try again recovers, the bottom nav stays usable.
- Verify at 375×812 in English + Kannada; screenshot the fallback; console has no uncaught errors.
```

---

### #2 — Real Tailwind v4 build + semantic tokens + shadcn base

```text
/ui-ux-pro-max:ui-styling /ui-ux-pro-max:design-system /ui-ux-pro-max:ui-ux-pro-max

Context: apps/web (Vite 6 + React 19) loads Tailwind from <script src="https://cdn.tailwindcss.com"> with the theme in an inline tailwind.config in index.html, plus global CSS in an inline <style>. This is the dev-only runtime compiler: slow on budget Android phones and blocks shadcn/ui and proper theming. Decision: move to a real build.

Read design-system/agriqnet/MASTER.md and tokens.css first. Use ui-ux-pro-max --stack shadcn "tailwind v4 vite theme tokens" and --stack react for guidance.

Tasks:
1. Install Tailwind v4 with @tailwindcss/vite in apps/web. Create apps/web/styles/index.css with @import "tailwindcss"; import the design-system tokens; expose them with @theme inline so EXISTING class names keep working unchanged (bg-agri-700, text-gray-600, bg-cream, bg-paper, text-ink, gold-*, shadow-soft, shadow-lift, font-display). Zero visual diff is the goal of this step.
2. Move the inline <style> rules (body font stack, h1–h3 Fraunces/Noto Serif, :focus-visible gold ring, scrollbar, .furrows, .shimmer + reduced-motion) into the CSS file. Remove the CDN script and inline config from index.html.
3. Add semantic utilities (bg-surface, text-muted, border-subtle, ring-focus …) mapped to CSS variables so [data-theme="sun"] on <html> can switch them (used by prompt #7). Don't refactor components to them yet. Only add them.
4. Initialise shadcn/ui (components.json, @/ alias to apps/web) using our CSS variables, not the default zinc theme. Add only: button, dialog, sheet, sonner (toasts), tooltip, skeleton, progress. Restyle them to MASTER.md component specs (radii 12/20/28, agri primary, gold focus ring, 48px min height for buttons).
5. Self-host or preload the Google Fonts subset actually used; add font-display: swap. Keep Noto Indic fonts.
6. Run `npm --prefix apps/web run build` and check the CSS bundle size.

Acceptance:
- Every screen looks pixel-identical (compare before/after screenshots at 375 and 1280 for Home, Crop, Alerts, Ask, Auth).
- No reference to cdn.tailwindcss.com remains. Build passes. Lighthouse mobile performance on Home improves (report before/after).
- `npm start` from the repo root still launches everything.
```

---

### #3 — Honest waiting: staged progress, timeouts, retry, skeletons

```text
/ui-ux-pro-max:ui-ux-pro-max /frontend-design:frontend-design

Problem (observed): Crop "Analyze Farm" shows a bare "Analyzing…" spinner for ~20s; the empty state vanishes and the screen looks frozen. Home's "This week in <district>" advice card shows grey skeleton bars + "Preparing advice for your district…" indefinitely (apps/web/components/Home.tsx, PlatformService.advice). Weather shows "Loading Weather Station…". Farmers on slow networks give up or tap again.

Read design-system/agriqnet/MASTER.md. Query ui-ux-pro-max --domain ux "long running progress feedback" and --domain gsap "loading skeleton" (follow its rules: pause when hidden, stop under reduced motion, no fancy loader for <300ms waits).

Build one reusable <WorkingOn> component in components/ui/ and use it for every AI/network wait (CropAdvisor, FertilizerAdvisor, PestCheck analysis, Home advice, Library ask, Chat answer):
1. Staged plain-language messages that advance on a timer and match what really happens, in the user's language (i18n keys in all 4 json files). Example for Crop: "Reading your soil and water…" → "Checking this season in <district>…" → "Comparing crops that grow well here…" → "Almost ready…". Each line gets a small icon. The current stage is announced via aria-live="polite".
2. A determinate-looking progress bar that eases toward 90% and completes on response (no fake 100%).
3. A skeleton shaped like the real result (crop cards with image box + 2 lines), not generic bars.
4. Timeouts: after 25s show "This is taking longer than usual" + a Keep waiting / Try again choice. On failure, the inline error card from prompt #1 with Retry; inputs are preserved.
5. Double-tap protection: the primary button becomes the progress area. It is not just disabled and greyed out.
6. Home advice: show cached/previous advice immediately with a "Updating…" chip; if nothing is cached, after 8s replace the skeleton with 2–3 static seasonal tips for the district's crops plus "Try again".
7. When the result arrives: smooth scroll to the result, staggered reveal of result cards (≤ 60ms stagger, 320ms, transform/opacity only), and auto-offer read-aloud (SpeakButton pulses once).

Motion must respect prefers-reduced-motion (instant states, messages still change).
Acceptance: throttle the network to "Slow 3G" in DevTools and record that every wait shows stages + progress, a timeout path, and a retry path. Screenshots at 375 in English and Kannada.
```

---

### #4 — Native Weather screen ("Can I spray today?")

```text
/frontend-design:frontend-design /ui-ux-pro-max:ui-ux-pro-max /ui-ux-pro-max:ui-styling

Decision: replace the iframe in apps/web/components/SmartWeather.tsx (which embeds the separate apps/weather Vite app at WEATHER_APP_URL :5175, with its own dark theme, search bar, theme toggle and nested scroll) with a native screen in the main app's design system.

Read design-system/agriqnet/MASTER.md + pages/weather.md. Port the data logic, not the UI, from apps/weather/src/api/weather.ts, apps/weather/src/api/agri-advisor.ts, apps/weather/src/hooks/use-weather.ts, and the rules in components/farm-weather-alerts.tsx and disaster-alert-portal.tsx into apps/web/services/weatherService.ts. Use the farmer's district from the profile (user.districtId / coordinates in data/karnataka-districts.json). Keep city search as a secondary "Check another place" sheet.

Screen job: answer the farmer's real questions in under 3 seconds. Layout, top to bottom:
1. Farm verdict strip: 3–4 big yes/no/caution cards with icons and one-line reasons: "Spray pesticide today?", "Irrigate today?", "Harvest / dry crop?", "Field work". Derive them from rain probability, wind speed, humidity and temperature thresholds (put the thresholds in one documented config). Colour + icon + word (never colour alone).
2. Now: big temperature, feels-like, condition with an illustrated icon, rain chance, wind, humidity. No wrapping on 360px wide.
3. Next 24 hours: horizontal hour strip with rain-probability bars under each hour, clear 12-hour labels ("6 am"), and a "now" marker.
4. 7 days: rows with day name in the user's language, min–max temperature range bar (like a thermometer), rain drops scaled by probability.
5. Weather warnings: reuse the Alerts weather section style.
Chart rules (query ui-ux-pro-max --domain chart "hourly temperature rain probability"): y-axis must not start at 0°, label the units, tooltips also on tap, colours from tokens, no blue default line.

Copy: subtitle "Rain and heat for your farm, this week", not "Hyper-local weather data for precision farming". One SpeakButton reads the verdict strip + today's summary in the farmer's language.
Remove the iframe and the WEATHER_APP_URL dependency from the web app (leave apps/weather in the repo untouched; just stop embedding it). Keep the home hero weather card's data in sync with this service.
Loading uses <WorkingOn> from prompt #3; errors use the inline error card from prompt #1.
Acceptance: one scroll context only; works at 360px; Kannada strings fit; screenshot verdict strip in English + Kannada; console clean.
```

---

### #5 — Phone + OTP onboarding

```text
/ui-ux-pro-max:ui-ux-pro-max /ui-ux-pro-max:ui-styling

Decision: remove the password. New flow: Language gate (keep) → Phone number → 6-digit OTP → (new users) District → Crops → Home. Current files: apps/web/components/AuthPage.tsx, LanguageGate.tsx, DistrictPicker.tsx, services/dbService.ts, services/twilioService.ts; backend services/api/src/routes/auth.js + src/lib/auth.js.

Read design-system/agriqnet/MASTER.md + pages/auth.md. Query ui-ux-pro-max --domain ux for "accessible authentication", "mobile keyboards inputmode", "inline validation".

Backend (minimal): add POST /auth/otp/request {phone} and POST /auth/otp/verify {phone, code}. Use Twilio Verify when env keys are present; otherwise, in dev/demo, accept a fixed code that is shown on-screen in a dev-only banner. Rate-limit requests (1 per 30s per phone). Return the same token/user shape as today's login so the rest of the app is unchanged. Keep the existing password login route working for old accounts, but don't show it.

Frontend:
1. One question per screen, big type, progress dots ("Step 2 of 4" for new users), a Back button, and a SpeakButton reading each step's question.
2. Phone: +91 fixed prefix chip, input type="tel" inputmode="numeric" autocomplete="tel-national", formatted as "98765 43210", big "Send code" button, and a mic option (spoken digits → number).
3. OTP: 6 separate boxes with autocomplete="one-time-code", paste support, auto-submit on 6 digits, a resend timer ("Send again in 0:24"), and a "Wrong number? Change" link. Errors next to the field with role="alert", in plain words.
4. New user: district picker with "Use my location" + list, then crops as a ChoiceGrid with photos (reuse cropChoices). Name is optional and asked last.
5. Fix the truncated tagline: short, sentence case, wraps instead of ellipsis. Keep "Try demo" and "Officer demo" as quiet secondary buttons.
6. Transitions between steps slide in the direction of travel (forward = from right; Back = from left), 240ms, reduced-motion → crossfade.
Acceptance: full new-user and returning-user runs in demo/dev mode at 375 in Kannada and English; every input reachable by keyboard; screenshots of each step.
```

---

### #6 — Home: "Today on your farm" + the living-sky hero moment

```text
/frontend-design:frontend-design /ui-ux-pro-max:ui-ux-pro-max

Context: apps/web/components/Home.tsx. Today: green hero card (district + temperature), red alert banner "1 pest alert(s) near you" with a lowercase pest name, then 6 identical feature cards each with its own speaker button, a Library shelf, and the district advice card. Every card has the same weight, so nothing says what to do today.

Read design-system/agriqnet/MASTER.md + pages/home.md. Follow frontend-design: spend boldness in ONE place (the hero), keep the rest quiet, no card-kit sameness.

Redesign:
1. HERO MOMENT, "living sky": the hero card's background is an SVG/CSS scene that reflects the real current weather and time of day: sun arc position by hour, drifting clouds when cloudy, light rain streaks when rain probability > 50%, dusk tint after 6 pm, a field horizon line at the bottom (reuse the .furrows texture). Animate with transform/opacity only, ≤ 30fps-friendly, paused when off-screen or tab hidden, static frame under prefers-reduced-motion. Use the gsap domain in ui-ux-pro-max for an ambient-loop pattern with cleanup, or motion/react if GSAP isn't installed. Keep district name, temperature, condition, rain chance and the "edit farm" pencil. Make sure "Rain chance today: 0%" never wraps on a 360px screen.
2. "Today on your farm" block right under the hero: 1–3 prioritised action rows built from the existing data (pest alerts in the district, the weather verdict from prompt #4, district advice). Each row: icon, one plain sentence ("Rice leaf caterpillar is spreading in your district — check your field"), and one action button ("See what to do"). Empty state: "Nothing urgent today" + a calm illustration.
3. Feature launcher hierarchy: 3 primary large tiles (Pest photo, Weather, Ask) and 4 secondary compact tiles (Which crop?, Fertilizer, Alerts, Library). Remove the 6 per-tile speaker buttons; one "Read this screen" button in the header reads the hero + today block + tile names. Long-press (500ms) on a tile reads its description.
4. Copy fixes: plural rules via Intl.PluralRules in all 4 languages ("1 pest alert near you" / "3 pest alerts near you"); pest names in sentence case; the greeting uses the farmer's language ("ನಮಸ್ಕಾರ" in kn, etc.).
5. Advice card: use the staged loading/fallback from prompt #3.
Acceptance: screenshots of the hero at 4 states (sunny day, cloudy, rain, evening) by mocking weather; 375 + 1280; English + Kannada; reduced-motion screenshot; no layout shift (CLS < 0.1) when advice loads.
```

---

### #7 — Sunlight mode + readable type scale

```text
/ui-ux-pro-max:design-system /ui-ux-pro-max:ui-ux-pro-max

Decision: one extra high-contrast "Sunlight" theme (no full dark mode). Context: farmers read the phone outdoors. Current UI uses text-[11px] bottom-nav labels (App.tsx), many 12–13px subtitles, and gray-500 on cream.

Read design-system/agriqnet/MASTER.md (type scale + sun theme from prompt #0) and use the semantic utilities from prompt #2.

Tasks:
1. Apply the MASTER type scale app-wide: body 18px on phones, nothing below 15px, nav labels ≥ 13px (allow 2 lines, no truncation in Kannada/Telugu), subtitles ≥ 15px. Replace text-gray-400/500 body copy with the semantic muted token (≥ 7:1 on cream).
2. Add a Sunlight toggle (sun icon + word) in the header next to the language button, and in the phone menu. It sets <html data-theme="sun">, is remembered in localStorage (wrapped in try/catch), and the SpeakButton announces "Sunlight mode on".
3. Sun theme: pure white surfaces, #0F1A14 text, 2px borders on all interactive elements, no backdrop-blur/translucent bars, primary buttons with bolder weight, focus ring stays gold but thicker, icons at full opacity, chart lines thicker.
4. Run a contrast audit (ui-ux-pro-max --domain ux "color contrast") on every token pair in both themes and list any failures fixed.
Acceptance: side-by-side screenshots (normal vs sun) of Home, Weather, Alerts, Crop results at 375 in Kannada; no text under 15px in computed styles (script a check in the browser console and report it).
```

---

### #8 — Voice-first Ask screen

```text
/ui-ux-pro-max:ui-ux-pro-max /ui-ux-pro-max:ui-styling

Context: apps/web/components/ChatModule.tsx. Today: two mode cards ("Any farming question" / "From Farmer Library"), then a chat card with a fixed height h-[calc(100dvh-170px)] inside the scrolling page, so it is cramped on phones. The welcome message is scrolled out of view, the placeholder is truncated ("Type or tap the mic an…"), the mic is as small as Send, and the trash icon has no label or confirmation.

Read design-system/agriqnet/MASTER.md + pages/ask.md. Query ui-ux-pro-max --domain ux "chat input mobile keyboard", "focus management", "live region".

Redesign:
1. On phones the Ask screen is a full-height layout: compact header (Back, title, mode switch as a 2-segment control), message list as THE page scroll, composer pinned above the bottom nav and safe area, and correct behaviour when the keyboard opens (use 100dvh and visualViewport).
2. Voice first: a large round mic (56px+) in the centre of the composer; hold-to-talk or tap-to-toggle with a live waveform/level ring and the transcript appearing in the input; release sends after showing the text for 1s with "Cancel". The text field and Send are secondary.
3. Empty state: a friendly prompt with 4 suggestion chips in the user's language that wrap onto multiple lines (no horizontal scroll), built from the farmer's crops and season ("Best fertilizer for ragi now?").
4. Answers: each bot bubble has a Listen button and a "From: <book>, page N" source chip when in Library mode. Answers stream in, or show the staged <WorkingOn> from prompt #3.
5. Clear chat: labelled "New chat" with a confirm sheet, plus an Undo toast for 5s.
6. Placeholder short enough not to truncate in any language ("Ask your question").
Acceptance: screenshots at 375 with the keyboard open (DevTools device mode) and closed, English + Kannada; a screen-reader pass announces new answers via aria-live; nothing is hidden behind the bottom nav.
```

---

### #9 — Crop & Fertilizer: farmer words, profile prefill, guided steps

```text
/ui-ux-pro-max:ui-ux-pro-max /frontend-design:frontend-design

Context: apps/web/components/CropAdvisor.tsx and FertilizerAdvisor.tsx. Decision: keep them as two screens (no merge), but they share the farm profile. Today: tabs "GenAI Advisor / Precision Model (ML)" (jargon); one long form (location, soil, water, field size); empty state "No recommendations yet. Fill the form to get started." even though every field is pre-selected; Fertilizer asks again for soil; labels use text-xs uppercase.

Read design-system/agriqnet/MASTER.md + pages/crop.md. Query ui-ux-pro-max --domain ux "progressive disclosure", "progress indicators", "form labels".

Tasks:
1. Extend the farm profile (App.tsx MyFarm + Farmer type + /profile API) with soilType, waterSource and fieldSize. Both screens prefill from it, show a summary chip row ("Red soil · Rainfed · Under 2 acres", tap to change), and offer "Save to my farm" after the user changes something.
2. Rename the modes in all 4 languages: "Quick advice" (was GenAI Advisor) and "I have soil test numbers" (was Precision Model ML). The ML mode's N-P-K/pH inputs get numeric keypads, units, typical ranges as helper text, and a "Where do I find these? (Soil Health Card)" explainer with a picture.
3. Guided mode on phones: one question per step with a big ChoiceGrid, a step indicator ("2 of 4") that shows labels on phones too, Back/Next, and auto-advance on single-choice tap (300ms delay, so the tick animation is visible). Desktop keeps the side-by-side form + results layout.
4. Results: a ranked list with a crop photo, a plain match reason ("Grows well in red soil with rain"), water need as a 1–3 drop icon, season, duration in months, and a confidence word (High / Medium / Low) instead of a percentage. One "Listen to all" button. Fertilizer results: a schedule timeline (basal → top dressing) with bag counts per acre for small-field farmers.
5. Remove ALL CAPS labels; fix the empty-state copy to "Your farm is filled in. Tap Analyze to see the best crops."
Acceptance: complete both flows at 375 in Kannada; screenshots of each step + results; the profile change persists across screens.
```

---

### #10 — Pest photo: camera guide + scan reveal

```text
/frontend-design:frontend-design /ui-ux-pro-max:ui-ux-pro-max

Context: apps/web/components/PestCheck.tsx (YOLO pest detector). Today: a 1-2-3 stepper whose labels are hidden on phones (`hidden sm:inline` in Kit.tsx Step), a tip card, "Take photo" and "Choose from gallery". There is no framing guide and no feedback during analysis.

Read design-system/agriqnet/MASTER.md + pages/pest.md.

Tasks:
1. Stepper: show short labels on phones under the dots ("Photo", "Check", "Result"), 15px minimum.
2. Capture: use getUserMedia for an in-app camera view when available (fall back to <input capture>). Show a framing overlay (rounded square + "Fill the box with the insect or leaf"), a light check (warn if the frame is too dark), and a large 72px shutter. A gallery option stays secondary.
3. Analysis feedback (purposeful motion): the captured photo stays on screen with a scan line sweeping over it while <WorkingOn> stages advance ("Looking for insects…", "Matching with known pests…"). Detected bounding boxes then draw in (stroke animation, 400ms) with a label chip. Reduced-motion: no sweep; boxes appear instantly.
4. Result card: pest name (local language + English), a reference photo from utils/pests.ts, severity with icon + word, "What to do now" as 3 numbered steps (this IS a sequence), organic option first, then chemical with a safety icon. Actions: "Warn farmers nearby" (existing report flow) and "Ask about this pest" (opens Ask prefilled).
5. Low confidence: say so plainly ("Not sure. Take a closer photo in daylight") with a retake button, never a confident wrong name.
Acceptance: test with rice-leaf-roller.jpeg from the repo root and one non-pest photo; screenshots at 375 (camera overlay, scanning, result, low-confidence); English + Kannada.
```

---

### #11 — Alerts & Network map for farmers

```text
/ui-ux-pro-max:ui-ux-pro-max /frontend-design:frontend-design

Context: apps/web/components/PestAlerts.tsx, AlertNetwork.tsx, KarnatakaMap.tsx (d3-geo). Today: the map's district labels are ~6px on phones and can't be zoomed; the farmer's district isn't marked; the stat tiles (31 Districts / 0 Waiting for check / 1 Active alerts) read like an officer dashboard; zone colours red/orange/yellow are explained only by a legend.

Read design-system/agriqnet/MASTER.md + pages/alerts.md. Query ui-ux-pro-max --domain chart "choropleth map accessible" and --domain ux "color not only".

Tasks:
1. Role-aware top section: farmers see "Near you" first (alerts in their district and neighbouring districts, sorted by distance), officers keep the stat tiles.
2. Alert cards: pest photo thumbnail, name in sentence case, status word + icon (Spreading / Controlled), distance ("In your district" / "45 km away"), date in the local format, a Listen button and a "What to do" button (opens the pest's guidance from prompt #10).
3. Map: highlight the farmer's district with a thick outline + "You are here" pin; pinch/zoom + pan (d3-zoom or CSS transform with pointer events); show labels only above a zoom threshold, at 13px or larger; tapping a district opens a bottom sheet (shadcn Sheet) instead of a card far below the map. Zones use colour + pattern (hatch for red) + a text label in the sheet.
4. Severity legend uses icons + words, not colour dots alone.
5. "Report pest outbreak" stays primary; after submitting, confirm with a success state ("Report sent. Officers in <district> will check it.") and the new pin animating onto the map once (300ms).
Acceptance: screenshots at 375 (list, map zoomed in/out, district sheet) as farmer and as officer demo; English + Kannada.
```

---

### #12 — Motion system

```text
/ui-ux-pro-max:ui-ux-pro-max /frontend-design:frontend-design

Context: motion/react is used across the app (App.tsx page transition y:10 crossfade 200ms, nav pills, ChoiceGrid tick). The language gate (components/LanguageGate.tsx) shows an almost empty green screen for ~1s before its tiles stagger in. Decision: purposeful motion + one hero moment (the living sky from prompt #6). No decorative scroll reveals.

Read design-system/agriqnet/MASTER.md motion tokens. Query ui-ux-pro-max --domain ux "exit faster than enter", "spring physics", "easing", and --domain gsap only for the hero loop.

Tasks:
1. Create components/ui/motion.ts exporting the duration/easing/spring tokens and 4 presets: screenEnter, sheet, listReveal (≤ 60ms stagger, max 6 items), confirm (tick pop). Replace ad-hoc numbers across components with these.
2. Direction-aware screen transitions: moving deeper (Home → feature) slides in slightly from the right; Back slides from the left; switching bottom-nav tabs crossfades. Exits are faster than enters (120 vs 200ms).
3. Language gate + Auth: first paint must show the tiles immediately (opacity ≥ 0.6 at 0ms). Keep a single 300ms settle animation, no long stagger.
4. Feedback motion: button press scale 0.97, success tick, an error shake (≤ 2 cycles, 6px) on invalid OTP, the mic level ring, and a toast slide. All of them use transform/opacity only.
5. prefers-reduced-motion: all of the above become instant or fade-only; the hero sky renders a static frame. Also add a "Reduce motion" switch next to Sunlight mode for low-end phones.
Acceptance: record a short screen capture of Home → Crop → Back → Ask at 375; confirm no layout-property animations in DevTools Performance; the reduced-motion run shows no movement.
```

---

### #13 — Consistency pass: one icon set, plural rules, Indic text-length QA

```text
/ui-ux-pro-max:ui-ux-pro-max /ui-ux-pro-max:design

Context: the app mixes lucide-react (header, Kit buttons, CropAdvisor) and @phosphor-icons/react (IconChip, SCREEN map in components/ui/Icons.tsx). Strings use "(s)" plurals (e.g. "pestNearCount": "{n} pest alert(s) near you" in utils/i18n/en.json). Kannada/Telugu strings are often 30–60% longer than English.

Tasks:
1. Standardise on Phosphor (duotone for content, regular for chrome, fill for active nav). Replace the lucide imports; remove the lucide-react dependency if it is unused afterwards. Every icon-only button needs an aria-label; decorative icons get aria-hidden (query --domain icons "icon button accessible label").
2. Use the design skill's icon sub-skill to draw 6 missing farm-specific SVG icons in the same Phosphor-duotone style: soil test card, spraying, irrigation, harvest/drying, pest scan, district pin. Put them in components/ui/Icons.tsx.
3. Add a tiny plural helper using Intl.PluralRules and convert every "(s)" key in all 4 language files (en/kn/hi/te) to one/other forms. Run `npm run i18n:check`.
4. Add a dev-only "?pseudo=long" mode that pads every string by 50%, and review all screens at 360px for clipping/truncation. Fix overflow with wrapping (not ellipsis) for labels and titles.
5. Remove any remaining ALL CAPS labels (CropAdvisor "text-xs uppercase") and "→"-suffixed button text.
Acceptance: grep shows no lucide-react imports; screenshots of Home, Crop and Alerts in pseudo-long mode at 360px with no clipped text.
```

---

### #14 — Library shelf polish + generated covers

```text
/ui-ux-pro-max:banner-design /frontend-design:frontend-design

Context: apps/web/components/Library.tsx and the Home "Farmer Library" shelf. Generated covers repeat the full title in big type, then the title is printed again under the cover; a browser scrollbar shows under the horizontal shelf; the cover style is the same green leaf for every book.

Tasks:
1. Use banner-design (styles: illustrated / duotone, our tokens only) to define a cover system: the colour band encodes the source (ICAR forest green, UAS gold, TNAU clay, farmers' own sage), there is a crop/topic illustration from the icon set in prompt #13, and the cover shows only the short topic word (e.g. "Ragi") plus the source mark. The full title stays below the cover (2 lines max, then "…more" in the detail view).
2. Real PDF covers (like the ICAR Annual Report) keep their thumbnail with a subtle source band.
3. Shelf: scroll-snap, hidden scrollbar with visible edge fade + a "See all" button, cards 140px wide, and tap opens the book sheet with "Ask this book" as the primary action (opens Ask in Library mode, scoped to that book).
4. Library page: filter chips by crop (from the farmer's profile first) and by language available.
Acceptance: screenshots of the Home shelf and the Library page at 375 + 1280 in English + Kannada; no visible scrollbar; covers clearly differ by source.
```

---

## 6. Verification checklist for every prompt (from `ui-ux-pro-max/references/pro-rules.md`)

- [ ] No emoji as icons; one icon family; icon buttons labelled
- [ ] Touch targets ≥ 48×48 on farmer screens, ≥ 8px apart
- [ ] Text ≥ 15px, body 18px on phone, contrast ≥ 4.5:1 (≥ 7:1 in Sunlight mode)
- [ ] Never colour alone (icon + word for severity, zones, verdicts)
- [ ] Every wait has stages, progress, a timeout and a retry; every error has a recovery action and `role="alert"`
- [ ] `prefers-reduced-motion` respected; motion only on transform/opacity
- [ ] Works at 360, 375, 768, 1280; no horizontal page scroll; one scroll context per screen
- [ ] Checked in English **and** Kannada (and spot-checked in Hindi/Telugu)
- [ ] SpeakButton reads the new content in the selected language
- [ ] Demo mode and Officer demo still work; console has zero uncaught errors
