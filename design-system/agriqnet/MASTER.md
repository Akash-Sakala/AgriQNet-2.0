# AgriQNet design system: MASTER

Source of truth for every screen in `apps/web`. A page file in `pages/` overrides this one for that page only.
Built with `/ui-ux-pro-max:design-system`. The ui-ux-pro-max generator (`"agriculture farmer advisory mobile app" --design-system --variance 4 --motion 4 --density 3`) was used for rules only: **Organic Biophilic** style, contrast ≥ 4.5:1, visible focus, reduced motion, avoid AI purple/pink gradients and generic design. We did **not** adopt its generic palette (#15803D) or Playfair Display; AgriQNet keeps its own identity.

## Who and where

Low-literacy farmers in Karnataka, Kannada-first (also Hindi, Telugu, English). Budget Android phones, outdoors in sunlight, one thumb, often with dirty or wet hands. Officers use the same app with a few extra tools.

## Principles

1. **Picture + word, never colour alone.** Every choice, state and severity has an icon and a word.
2. **Voice everywhere.** Each screen can be read aloud; questions can be spoken.
3. **One job per screen, one primary action.** The primary action is the biggest thing on screen.
4. **Plain words.** Sentence case. No jargon ("GenAI", "ML", "precision", "hyper-local"). An action keeps its name through the flow ("Send code" → "Code sent").
5. **Honest waiting.** Every wait says what is happening, can time out, and can be retried.
6. **Boldness in one place.** The living-sky home card is the signature moment; everything else is calm.

## 1. Primitive tokens

| Token | Values |
|---|---|
| agri (forest) | 50 #EEF4EF · 100 #DCE8DF · 200 #B7D0BF · 300 #8BB29A · 400 #5E9175 · 500 #3E7759 · 600 #2B6046 · 700 #1F4D3A · 800 #183D2E · 900 #112C21 · 950 #0A1C15 |
| gray (warm) | 50 #FAF8F3 · 100 #F2EFE7 · 200 #E6E1D5 · 300 #D3CCBD · 400 #A39B89 · **500 #6A6356** · **600 #4E483D** · 700 #3D372E · 800 #2E2A23 · 900 #1E2A24 |
| cream / paper / ink | #F7F4EC / #FFFDF8 / #1E2A24 |
| gold | 100 #F6EDCB · 300 #E2C766 · 500 #C9A227 · 700 #7A600F |
| clay (danger) | 50 #FDF1EE · 600 #B4371F · 700 #932B17 |
| amber (warning) | 50 #FDF5E7 · 600 #A35A0B · 700 #8A4B0F |
| sky (info) | 50 #EAF3F7 · 600 #2A6585 |

gray 500/600/700 and gold 700 were darkened from the old values (#7D7566, #5E574B, #463F35, #8A6D12) so existing text passes contrast without touching components.

## 2. Semantic tokens (CSS variables in `tokens.css`)

| Token | Default | Sun theme | Use |
|---|---|---|---|
| `--bg` | cream #F7F4EC | #FFFFFF | page |
| `--surface` | paper #FFFDF8 | #FFFFFF | cards, sheets |
| `--surface-sunk` | gray-100 #F2EFE7 | #F2F2F2 | inputs, wells |
| `--text` | ink #1E2A24 | #0F1A14 | body, headings |
| `--text-muted` | #4E483D | #1E2A24 | secondary text |
| `--border` | gray-200 #E6E1D5 | #1E2A24 | dividers, card edges |
| `--border-strong` | gray-300 #D3CCBD | #0F1A14 | inputs, buttons |
| `--primary` / `--on-primary` | agri-700 / #FFFFFF | agri-900 / #FFFFFF | main action |
| `--accent` / `--on-accent` | gold-500 / ink | gold-500 / #0F1A14 | highlight, active step |
| `--danger` | #B4371F | #932B17 | errors, red zone |
| `--warning` | #A35A0B | #8A4B0F | caution |
| `--success` | agri-600 | agri-800 | done |
| `--ring` | gold-500 | #0F1A14 | focus outline |

### Contrast (WCAG ratio, checked)

| Pair | Default | Sun |
|---|---|---|
| text on bg | 13.5 | 17.8 |
| text-muted on bg | 8.2 | 14.9 |
| text-muted on surface | 8.9 | 14.9 |
| gray-500 on bg (hints, captions) | 5.4 | n/a |
| on-primary on primary | 9.6 | 14.9 |
| on-accent on accent | 6.1 | 7.4 |
| danger on bg | 5.4 | 8.1 |
| warning on bg | 4.7 | 6.8 |
| agri-700 link on bg | 8.8 | 12.0 |
| gold-700 on bg | 5.4 | n/a |

Every pair is ≥ 4.5:1; body text pairs are ≥ 7:1. gray-400 (2.7:1) is for borders, disabled controls and decoration only, never for text.

## 3. Type

- Families: **Fraunces** (headings, Latin), **Noto Serif Kannada / Telugu / Devanagari** (headings, Indic), **Inter** + **Noto Sans** Indic (body).
- Scale (phone / desktop): body **18 / 17px**, small 16px, caption **15px minimum**, h3 20px, h2 24px, h1 28 / 32px, display 40 / 48px.
- Nav labels ≥ 13px and may wrap to 2 lines; never truncate Indic text.
- Line height 1.5 body (1.6 for Indic), 1.15 display. Letter spacing −0.01em on headings only.
- No ALL CAPS labels. No eyebrow labels above headings.

## 4. Space, shape, depth

- 4px base; spacious density: 8 · 12 · 16 · 24 · 32 · 48 · 64.
- Radii, three only: **12** (controls, chips), **20** (cards), **28** (sheets, hero).
- Shadows: `soft` (resting card), `lift` (raised: menus, selected tiles). No other shadows.
- Touch targets ≥ 48×48 on farmer screens, ≥ 8px apart.

## 5. Motion

| Token | Value | Use |
|---|---|---|
| `--dur-fast` | 120ms | exits, press |
| `--dur-base` | 200ms | screen enter, toggles |
| `--dur-slow` | 320ms | sheets, result reveal |
| `--dur-hero` | 600ms | one-time hero settle |
| `--ease-standard` | cubic-bezier(.22,1,.36,1) | enters |
| `--ease-exit` | cubic-bezier(.4,0,1,1) | exits |
| spring | stiffness 420, damping 36 | pills, ticks |

Rules: motion only for feedback and state change, plus the one hero (living sky). Transform and opacity only. Exits faster than enters. List reveals stagger ≤ 60ms, max 6 items. `prefers-reduced-motion` and the in-app "Reduce motion" switch → instant or fade-only; the hero renders a still frame.

## 6. Components (states: default / pressed / focus / disabled / loading / error)

- **BigChoice tile** (`ChoiceGrid`): 2px border; selected = agri-700 border, agri-50 fill, tick badge pops in (spring). Min 96px tall. Pressed scale .96.
- **PrimaryButton**: min 52px, radius 12–16, agri-700, bold 18px. Loading = the button becomes the progress area (stages text + bar), never only greyed. Disabled = 50% opacity + reason text nearby.
- **SecondaryButton**: paper fill, 2px agri-700 border.
- **SpeakButton**: round 44px (56 large); idle outline, playing filled agri-700 with stop square.
- **MicButton**: idle outline; listening = danger fill + level ring + "Speak now" label.
- **ScreenTitle**: Back (48px, word visible ≥ sm), screen icon chip, title, plain subtitle, one read-aloud.
- **AlertCard**: severity stripe + icon + word, pest photo, distance, Listen, "What to do".
- **StatusBanner**: info / warning / danger / success with icon + text; errors use `role="alert"`.
- **WorkingOn**: staged messages (aria-live polite), easing progress bar, slow-wait notice at 25s with Keep waiting / Try again.
- **BottomNav**: 5 items, icon + label ≥ 13px, active pill (spring).
- **Sheet / Modal**: radius 28 top, drag handle on phones, Esc + backdrop close, focus trapped.

## 7. Themes

- **Default**: warm cream.
- **Sunlight** (`<html data-theme="sun">`): pure white surfaces, near-black text, 2px dark borders on interactive elements, no translucency/blur, thicker focus ring and chart lines. Toggle in the header and the phone menu; remembered on the device.

## 8. Copy and voice

Plain verbs, sentence case, short sentences. Errors say what happened and what to do, with no apology. Empty states invite the next action. Pluralise with `Intl.PluralRules` (never "(s)"). Every new string goes into all four files in `apps/web/utils/i18n/`.

## 9. Pre-delivery checklist

- [ ] Icons from one family (Phosphor); icon-only buttons labelled; decorative icons `aria-hidden`
- [ ] Targets ≥ 48px; text ≥ 15px; contrast per table above
- [ ] Never colour alone
- [ ] Waits staged with timeout and retry; errors recoverable, `role="alert"`
- [ ] Reduced motion respected; transform/opacity only
- [ ] 360 / 375 / 768 / 1280 widths; no horizontal page scroll; one scroll context per screen
- [ ] English and Kannada checked; read-aloud covers new content
