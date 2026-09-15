# Localization Plan

This document describes how to localize the web port of Zeliard from English
into Russian and Interslavic, while keeping the original game logic and asset
loading stable.

## Goals

- Support English, Russian, and Interslavic.
- Use the URL path as the locale selector:
  - `/` and `/en` use English.
  - `/ru` uses Russian.
  - `/isv` uses Interslavic.
- Keep saves locale-independent. A save created in English should load in
  Russian or Interslavic without data migration.
- Localize every visible text surface:
  - opening intro
  - town `.mdt` NPC conversations and town names
  - indoor scenes
  - dungeon `.mdt` names, signposts, and item notifications
  - HUD, inventory, modal dialogs, speed dialog, and labels
  - ending demo and credits
- Preserve the current behavior, timing, control-code effects, and scene flow.

## Locale Codes

Use these locale ids throughout the app:

| Locale | URL path | File suffix | Notes |
| --- | --- | --- | --- |
| English | `/`, `/en` | `en` | Default and fallback locale. |
| Russian | `/ru` | `ru` | Cyrillic text. |
| Interslavic | `/isv` | `isv` | Use `isv`, not `is`; `is` is Icelandic. |

Unknown locale paths should fall back to English for now, with an optional
future 404 or language picker if the project grows beyond these languages.

## Current Text Inventory

### TypeScript text

The following files currently hold English text directly in TypeScript:

- `web/src/scenes/opening-intro.ts`
  - copyright splash
  - story scroll
  - demon speech
  - opening credits
  - balcony and dialogue text
  - final intro scroll
- `web/src/scenes/ending-demo.ts`
  - ending dialogue
  - ending credits
  - port credits
  - monster/servant credit names
- `web/src/scenes/indoor-king.ts`
- `web/src/scenes/indoor-princess.ts`
- `web/src/scenes/indoor-sage.ts`
- `web/src/scenes/indoor-weapon-shop.ts`
- `web/src/scenes/indoor-magic-shop.ts`
- `web/src/scenes/indoor-church.ts`
- `web/src/scenes/indoor-bank.ts`
- `web/src/scenes/indoor-inn.ts`
- `web/src/ui/hud.ts`
- `web/src/ui/inventory-screen.ts`
- `web/src/ui/save-restore.ts`
- `web/src/ui/import-export.ts`
- `web/src/core/speed-change.ts` plus `web/src/main.ts` rendering of the speed
  dialog.
- `web/src/config/engine.ts`
  - dungeon notification strings such as item pickups and boss messages.

### MDT-backed text

The game loads original `.mdt` files from `web/public/game/0`.

Town files:

- `cmap.mdt`: Felishika's Castle
- `mrmp.mdt`: Muralla Town
- `stmp.mdt`: Satono town
- `bsmp.mdt`: Bosque Village
- `hlmp.mdt`: Hellada Town
- `tmmp.mdt`: Tumba
- `drmp.mdt`: Dorado
- `llmp.mdt`: Llama
- `prmp.mdt`: Pureza
- `esmp.mdt`: Esco

Dungeon files:

- `mp10.mdt`, `mp1d.mdt`
- `mp20.mdt`, `mp21.mdt`, `mp2d.mdt`
- `mp30.mdt`, `mp31.mdt`, `mp3d.mdt`
- `mp40.mdt`, `mp41.mdt`, `mp4d.mdt`
- `mp50.mdt`, `mp51.mdt`, `mp5d.mdt`
- `mp60.mdt`, `mp61.mdt`, `mp62.mdt`, `mp6d.mdt`
- `mp70.mdt`, `mp71.mdt`, `mp72.mdt`, `mp73.mdt`, `mp7d.mdt`
- `mp80.mdt`, `mp81.mdt`, `mp82.mdt`, `mp83.mdt`, `mp84.mdt`, `mp8d.mdt`
- `mp90.mdt`
- `mpa0.mdt`

`web/src/engine/mdt.ts` currently reads town and cavern names directly from the
MDT byte data. `web/src/core/conversation.ts` and
`web/src/core/conversation-text.ts` read town NPC conversations as original
byte streams from memory. `web/src/render/dungeon.ts` reads dungeon sign text
byte by byte from the loaded MDT data.

## Architecture

### 1. Add a locale module

Create `web/src/core/locale-utils.ts` with:

- `SUPPORTED_LOCALES = ['en', 'ru', 'isv'] as const`
- `type Locale = typeof SUPPORTED_LOCALES[number]`
- `DEFAULT_LOCALE = 'en'`
- `resolveLocaleFromPath(pathname: string, basePath = import.meta.env.BASE_URL):
  Locale`
- `stripLocaleFromPath(pathname: string): string`
- `buildLocalePath(locale: Locale, restPath = ''): string`

Rules:

- `/ru` and `/ru/...` resolve to `ru`.
- `/isv` and `/isv/...` resolve to `isv`.
- `/en`, `/en/...`, `/`, and unknown first segments resolve to `en`.
- Treat trailing slashes consistently. `/ru/` should not break relative asset or
  fetch paths.
- Account for GitHub Pages deployment under `/zeliard/` if `BASE_URL` is set.
  For example `/zeliard/ru` should resolve to `ru`.

### 2. Add translation data

Create a locale directory:

```text
web/src/locale/
  en.json
  ru.json
  isv.json
  schema.ts
  index.ts
```

If JSON files are imported directly from TypeScript, add
`"resolveJsonModule": true` to `web/tsconfig.json`. If that causes tooling
friction, use `.ts` locale files instead. The rest of this plan assumes JSON
because it is translator-friendly.

`schema.ts` should define the exact shape:

```ts
export interface LocaleMessages {
  meta: {
    locale: string;
    label: string;
  };
  hud: Record<string, string>;
  modal: Record<string, string>;
  inventory: Record<string, string | string[]>;
  dungeon: {
    notifications: Record<string, { leftPad: number; text: string }>;
    signs: Record<string, string[]>;
    names: Record<string, string>;
  };
  town: {
    names: Record<string, string>;
    conversations: Record<string, string>;
  };
  indoor: Record<string, unknown>;
  openingIntro: Record<string, string | string[]>;
  endingDemo: Record<string, unknown>;
}
```

`index.ts` should export:

- `getLocale()`
- `setLocale(locale)`
- `messages`
- `t(key, params?)`
- `getMessages(locale)`
- typed helpers for grouped data where plain key strings are too weak.

Fallback behavior:

- English is the complete source of truth.
- Missing Russian or Interslavic keys fall back to English.
- In development, log missing keys once so incomplete translations are visible.
- In tests, expose a validator that fails if `ru.json` or `isv.json` is missing
  keys that are marked required for release.

### 3. Initialize locale during boot

In `web/src/main.ts`, resolve the locale before scenes, HUD, or asset loaders
are initialized:

```ts
import { resolveLocaleFromPath, setLocale } from './core/locale-utils.js';

const locale = resolveLocaleFromPath(window.location.pathname);
setLocale(locale);
document.documentElement.lang = locale;
```

Do this near the top-level composition root, before `Hud`, `OpeningIntro`,
`EndingDemo`, and indoor scenes can read text.

### 4. Make asset paths absolute or base-aware

The game currently uses paths like `game/0/cmap.mdt` and
`assets/images/opdemo/ttl3_logo.png`. These work from `/ru`, but paths with a
trailing slash such as `/ru/` can resolve relative to `/ru/`.

Choose one of these approaches:

- Preferred: introduce `assetUrl(path: string)` that prefixes
  `import.meta.env.BASE_URL`.
- Acceptable: insert `<base href="/">` for local builds and configure it for
  GitHub Pages.

The helper approach is safer because the project already deploys at a subpath.

Example:

```ts
export function assetUrl(path: string): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}
```

Then use `assetUrl('game/0/cmap.mdt')` and
`assetUrl('assets/images/opdemo/ttl3_logo.png')`.

## Text Extraction Plan

### Phase 1: Shared locale plumbing

1. Create `core/locale-utils.ts`.
2. Create `src/locale/en.json`, `ru.json`, `isv.json`, `schema.ts`, and
   `index.ts`.
3. Add tests for locale path resolution:
   - `/`
   - `/en`
   - `/ru`
   - `/ru/`
   - `/isv`
   - `/zeliard/ru` when base path is `/zeliard/`
   - unknown paths.
4. Add a small translation completeness test that compares locale files against
   English.

### Phase 2: HUD, menus, and modal UI

Move the smallest and lowest-risk text first:

- `PLACE`, `GOLD`, `ENEMY`
- speed dialog text:
  - `Speed change`
  - `Select 0-9:`
  - `(press any key)`
- save/restore/import/export dialogs
- inventory labels:
  - `SELECT-MAGIC:`
  - `WEAR:`
  - `USE:`
  - `INVENTORY`
  - `LEVEL`
  - `EXP`
  - item-use messages.

Verification:

- Unit tests for `Hud`.
- Existing modal and inventory tests.
- Manual smoke run in `/ru` and `/isv`.

### Phase 3: Indoor scenes

Extract text from each indoor scene into structured locale sections. Keep scene
state machines unchanged; only replace constants with locale lookups.

Recommended grouping:

```json
{
  "indoor": {
    "inn": {
      "menu": ["Stay the night", "Leave"],
      "welcome": ["..."],
      "noFunds": "...",
      "thankYou": "...",
      "morning": "..."
    },
    "sage": {
      "menu": ["Go outside", "See Power", "Listen Knowledge", "Record Experience"],
      "introBySageBit": {
        "80": "...",
        "40": "..."
      },
      "knowledge": ["..."],
      "powerResult": ["..."]
    }
  }
}
```

Indoor files to migrate:

1. `indoor-inn.ts`
2. `indoor-bank.ts`
3. `indoor-church.ts`
4. `indoor-weapon-shop.ts`
5. `indoor-magic-shop.ts`
6. `indoor-sage.ts`
7. `indoor-king.ts`
8. `indoor-princess.ts`

Verification:

- Existing indoor scene tests should continue to pass.
- Add one locale-specific test per complex scene that confirms text comes from
  the active locale.
- Visually check wrapped Russian and Interslavic lines in narrow dialogue boxes.

### Phase 4: Opening intro

Replace the top-level text arrays in `opening-intro.ts` with an
`OpeningIntroText` object from the locale bundle:

- `INTRO_COPYRIGHT_LINES`
- `STORY_LINES`
- `DEMON_SPEECH_LINES`
- `CREDITS_LINES`
- `BALCONY_LINES_PART1`
- `BALCONY_LINES_PART2`
- `PRINCESS_DEMON_LINES`
- `PRINCESS_VS_DEMON_LINES`
- `DEMON_FINAL_LINES`
- `STONED_LINES`
- `KING_PRINCESS_LINES`
- `SPIRIT_LINES`
- `KING_SURPRISED_LINES`
- `DUKE_ARRIVED_LINES`
- `DUKE_ESCORTED_LINES`
- `KING_DUKE_LINES1`
- `KING_DUKE_LINES2`
- `KING_DUKE_LINES3`
- `FINAL_SCROLL_LINES`

Important:

- Preserve line breaks where the scene expects fixed line rhythm.
- Keep direct speech quotation marks because Jashiin styling depends on lines
  that start with `"`.
- Russian and Interslavic text will likely be wider. Use the existing wrapping
  helpers where possible, and review the pre-rendered story scroll height.
- The current font, `Press Start 2P`, may not cover Cyrillic. See the font
  section below.

Verification:

- Existing `opening-intro` tests.
- Screenshot checks for `/`, `/ru`, and `/isv`.
- Canvas inspection for missing glyph boxes.

### Phase 5: Ending demo

Extract ending data into `endingDemo`:

- dialogue rows and speaker/timing metadata
- ending credits screens
- copyright screens
- port credits
- serving-monsters labels.

Keep non-text animation data in code unless it becomes coupled to translated
line counts.

Important:

- Some ending timing assumes specific text page lengths. Review any translated
  page that wraps into more rows than English.
- Keep face/lip animation triggers independent of the translated text length
  where possible.

Verification:

- Existing `ending-demo` tests.
- Long playback smoke test through the final credits in each locale.
- Screenshot samples from the King/Princess, Spirit, farewell, and credits
  sections.

### Phase 6: Town MDT names and NPC conversations

Do not mutate gameplay-critical MDT bytes at runtime unless necessary. Instead,
overlay localized text at the point where visible strings are decoded.

Recommended approach:

1. Give every town a stable id based on its MDT path or town index:
   - `town.cmap`
   - `town.mrmp`
   - `town.stmp`
   - `town.bsmp`
   - `town.hlmp`
   - `town.tmmp`
   - `town.drmp`
   - `town.llmp`
   - `town.prmp`
   - `town.esmp`
2. Add localized town names under `town.names`.
3. Add localized NPC conversations under stable keys:
   - `town.cmap.npc.0`
   - `town.cmap.npc.1`
   - etc.
4. Add a converter that turns localized plain text into the existing dialog byte
   stream format used by `parseDialogText`:
   - `/` means forced line break.
   - `\` in original data maps to apostrophe; localized text can use a normal
     apostrophe.
   - retain control-code effects separately.
5. Split visible text from control codes. For example, a conversation that ends
   with `0x81` should have text in locale data and `endCode: "yesNo"` metadata,
   not a literal byte embedded in translated strings.
6. Modify `ConversationManager` dependencies so `getNpcConversationRaw(npcId)`
   can return localized bytes when available, falling back to original MDT bytes.

Why overlay instead of rewriting MDT files:

- Control codes such as `0x81`, `0x83`, `0x87`, `0x89`, and `0x8B` trigger
  gameplay effects.
- Pointer tables and length constraints inside `.mdt` files make direct binary
  patching error-prone.
- Overlaying visible text keeps original map, NPC, and event data untouched.

Extraction tooling:

- Add a script such as `tools/extract_mdt_text.py` or a TypeScript test helper
  that reads each MDT, walks the NPC conversation pointer table, and emits
  English source keys.
- Preserve original control codes as metadata in the emitted output.
- Include source comments with MDT file name, town id, NPC id, and original byte
  address to simplify translation review.

Verification:

- Unit test that English overlay reproduces the same parsed pages as original
  MDT bytes.
- Unit test that every localized conversation keeps the same required control
  codes as English.
- Manual test important event conversations:
  - Elf Crest
  - final Tear collection
  - Asbestos Cape flow
  - Pureza warp building
  - Yes/No and Take/No-Take conversations.

### Phase 7: Dungeon MDT names, signs, and notifications

Dungeon text comes from two places:

- `web/src/config/engine.ts` notification strings.
- MDT sign descriptors decoded by `drawDungeonSign()`.

Plan:

1. Move `NOTIFICATION_STRINGS` into locale data as
   `dungeon.notifications`.
2. Keep `leftPad` in locale data because translated strings have different
   visual widths.
3. Add localized cavern names under `dungeon.names`, keyed by MDT path or map
   id.
4. Overlay dungeon signs in `drawDungeonSign()`:
   - identify the active dungeon MDT/map id and sign index.
   - if localized sign lines exist, draw those lines.
   - otherwise decode original MDT bytes as today.
5. Prefer line arrays for signs instead of embedded slash separators. Convert to
   drawing rows at render time.

Verification:

- Unit test notification lookup and fallback.
- Add tests for sign text lookup by map/sign index.
- Manual test signposts in several dungeons and all notification ids 1-22.

### Phase 8: Font and rendering support

Russian and Interslavic require Cyrillic glyphs. The current retro font may not
cover them.

Tasks:

1. Audit the current web font coverage in the browser.
2. Choose a Cyrillic-capable pixel font. Options:
   - a Press Start 2P compatible fork with Cyrillic support
   - a bundled local WOFF2 pixel font
   - a separate Cyrillic fallback font in the same visual style.
3. Add the font under `web/public/assets/fonts/`.
4. Update `web/public/styles.css` with `@font-face`.
5. Replace hard-coded font strings with shared constants where practical:
   - `GAME_FONT_16`
   - `GAME_FONT_18`
   - `GAME_FONT_24`
6. Test canvas rendering for missing glyph boxes.

Notes:

- Russian text is typically longer than English. Expect to tune wrapping widths,
  line heights, or translation phrasing in intro, ending, and indoor dialogue.
- Do not shrink fonts globally unless screenshot review shows it is necessary.
  Prefer better wrapping and translation edits first.

## URL Routing Behavior

### Local development

Expected behavior:

- `http://localhost:5174/` starts in English.
- `http://localhost:5174/en` starts in English.
- `http://localhost:5174/ru` starts in Russian.
- `http://localhost:5174/isv` starts in Interslavic.

Vite should serve the SPA for those paths. If asset fetches fail from nested
locale paths, convert all runtime URLs through `assetUrl()`.

### GitHub Pages

The live app is deployed under `/zeliard/`. The resolver should support:

- `https://br0x.github.io/zeliard/`
- `https://br0x.github.io/zeliard/en`
- `https://br0x.github.io/zeliard/ru`
- `https://br0x.github.io/zeliard/isv`

If GitHub Pages does not rewrite deep links to `index.html`, add a standard SPA
fallback such as a copied `404.html` that serves the app shell.

## Suggested Implementation Order

1. Locale resolver and tests.
2. Locale data skeleton with complete English.
3. HUD, modal, inventory, speed dialog.
4. Dungeon notifications and names.
5. Indoor scenes.
6. Opening intro.
7. Ending demo.
8. Town MDT conversation overlay.
9. Dungeon sign overlay.
10. Font finalization and visual QA.
11. Translation completeness gates for `ru` and `isv`.

This order gets `/ru` and `/isv` booting early, then migrates text from the
least risky surfaces to the most stateful ones.

## Testing Checklist

Automated:

- `pnpm test`
- `pnpm typecheck`
- `pnpm e2e`
- locale resolver unit tests
- translation completeness tests
- English MDT overlay equivalence tests
- control-code preservation tests for localized conversations.

Manual:

- Boot `/`, `/en`, `/ru`, `/isv`.
- Start the opening intro in each locale.
- Enter every indoor scene in each locale.
- Talk to NPCs in at least one early, middle, and late-game town.
- Trigger a Yes/No conversation and a Take/No-Take conversation.
- Read dungeon signs in at least three dungeons.
- Trigger all dungeon notification categories where practical.
- Finish the game and watch ending dialogue plus credits.
- Check Cyrillic rendering in canvas and DOM HUD.
- Check mobile/touch controls with localized UI labels.

## Translation Workflow

1. Extract complete English source strings.
2. Freeze stable keys before translation begins.
3. Translate `ru.json` and `isv.json`.
4. Run completeness and control-code tests.
5. Review screenshots and adjust wrapping/line breaks.
6. Have a native or fluent reviewer check:
   - fantasy terminology
   - character names
   - item names
   - spell names
   - tone consistency between intro, towns, and ending.

Suggested terminology policy:

- Keep proper names stable unless there is a deliberate localization choice:
  `Zeliard`, `Jashiin`, `Felishika`, `Felicia`, `Garland`, `Esmesanti`.
- Keep item and spell names consistent across shops, inventory, NPCs, and
  notifications.
- For Interslavic, decide once whether to use Latin or Cyrillic script. Because
  the Russian locale already exercises Cyrillic rendering, Latin Interslavic may
  be easier to read for a broader audience; Cyrillic Interslavic may better fit
  the Slavic theme. The chosen script should be reflected in the URL label and
  translation review.

## Risks

- The current font may not render Cyrillic.
- Translated text may overflow fixed-width intro, ending, shop, and sign boxes.
- MDT conversations contain gameplay control codes that must survive
  localization.
- Binary-patching MDT files could break pointers; use runtime overlays first.
- GitHub Pages deep links may require a `404.html` SPA fallback.
- `is.json` should not be used for Interslavic because it conflicts with the
  standard Icelandic locale code.

## Definition of Done

- `/ru` and `/isv` select the correct locale from the URL path.
- English remains available at `/` and `/en`.
- Every visible English string has a locale key or documented exception.
- Russian and Interslavic locale files pass required-key validation.
- Original English behavior and tests still pass.
- Cyrillic text renders without missing glyphs.
- Intro, towns, indoor scenes, dungeons, and ending demo have been manually
  checked for overflow and broken timing.
