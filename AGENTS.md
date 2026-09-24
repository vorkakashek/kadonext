# Kado / kadonext: compact working context

## What this project is

- Russian-first portfolio and lead-generation site for Kado, an author-led design/development studio. The repository and canonical domain use `kadonext` / `kadonext.com`.
- Core promise: expressive turnkey websites, from structure and visual concept through development and launch.
- Brand formula: “Свобода формы. Порядок процесса.” Visual tone is editorial, calm and tactile; motion should feel organic but controlled.
- Kado is one accountable author-led studio, not a fictional large agency. Speak confidently and precisely, but do not simulate scale, make absolute promises, or hide behind jargon.
- The initial commercial focus is hospitality, local brands and service businesses that need a distinctive, technically sound digital presence. Sell the outcome and process—not the stack.

## Brand guardrails

- Write in Russian by default: calm, concrete, professional and human. Short sentences; one idea per block; explain technology through client benefit. Use first person where personal responsibility matters.
- Use `KADO` as the public brand in Russian-facing communication. `kadonext` is the repository/domain identifier, not a second public brand name. The informal `Кадо` is acceptable where the user explicitly wants an informal tone.
- The cultural reference in Kadō is compositional discipline, whitespace, attentive lines and natural asymmetry—not Japanese decoration. Never introduce sakura, arbitrary kanji, a red sun circle, ikebana props or pseudo-Asian typography merely for atmosphere.
- Visual direction is managed asymmetry: a rigorous grid, large type, generous whitespace, project imagery and occasional organic lines. The studio shell must frame client work rather than overpower it.
- Beauty must not trade away legibility, navigation, accessibility, performance, search visibility or a clear next step. Motion supports hierarchy and transitions; it must never make the interface slower or less understandable.
- Default delivery approach is SSG-first. A persistent server/SSR is an exception justified by real runtime requirements; explain this as speed, simplicity, security and predictable ownership cost, not as a trend.

## Current implementation

- Nuxt 4 / Vue 3 / TypeScript, Tailwind 4, GSAP/ScrollTrigger, Three.js and Lenis 1.3.26. Static output (`nitro.preset: static`, prerendered routes).
- `/` is the real product today: interactive Three.js sphere swarm in the hero; one `FlowSurface` morphs continuously through Hero → Kado → Cases; the Cases section switches among Audience, Keys Store, Балтика Brew and SCHMIDT.
- `FlowSurfaceHost.vue` owns the surface motion contract. Desktop uses a base velocity cap of `1.55` normalized segments/second and may rise to `3.1` only while compressing a stale multi-waypoint backlog; the final Hero reveal remains capped at `1.15`. Named navigation and scroll share the route-decision/snapshot contract. Desktop crosses Kado without retargeting/stopping there; mobile has a guarded Cases → Hero bridge and releases stale term/word pins during fast reverse scrolls.
- Lenis smooths stepped mouse-wheel input only. Mobile touch scrolling is intentionally native (`syncTouch: false`) for direct 1:1 finger response; touch events do not attach the Lenis/GSAP animation ticker.
- Global experience: short brand preloader, header, custom cursor/scrollbar, Page Canvas menu, iris/SPA transitions and baked page previews.
- `/projects` now has a project catalog and `/projects/[id]` has minimal prerendered case-detail pages with a visual entry transition. `/services`, `/about` and `/contact` remain `PageStub` shells. Full case narratives, real contact flow, i18n, analytics and legal/production SEO work are not implemented.

## Where truth lives

- Runtime behavior: `app/`; key orchestration is in `app/pages/index.vue`, `FlowSurfaceHost.vue`, `HeroSwarmCanvas.vue`, `HomeCases.vue`, `PageCanvas.vue` and `SiteHeader.vue`.
- Scroll input is configured in `app/plugins/lenis.client.ts`; continuous-progress math is in `app/utils/flowSurfaceMorph.ts`, while route coalescing and atomic visual snapshots live in `app/utils/flowSurfaceContract.ts`. Treat `FlowSurfaceHost.vue` as the final authority for waypoint/pin ownership, mobile bridge state and surface cleanup.
- Case/nav data: `app/utils/homeCases.ts` and `app/utils/siteNav.ts`.
- Responsive values: `design-tokens/responsive.json` is canonical. Run `npm run tokens:fluid`; never hand-edit `app/assets/css/fluid.generated.css`.
- Brand, positioning, service offer, naming, tone, visual foundations and SSG policy: `docs/brand-and-website-brief.md`.
- Page content, case-study framing, About and contact scenarios: `docs/content-cases-contact-and-studio.md`.
- Design-system rules and implementation decisions: `docs/kado-design-system-spec.md` and `docs/kado/`.
- Motion behavior and interaction constraints: `docs/motion-and-interaction-spec.md`.
- Visual direction, prototype scope and reference interpretation: `docs/visual-direction-and-live-prototype.md`.
- Naming exploration is reference only: `docs/studio-naming-bank.md`. Do not treat alternatives there as an instruction to rename the studio.
- `docs/brand-film-concept.md` is a concept source, not an approved production brief; confirm before implementing it.
- `docs/idea-archive.md` is explicitly not a backlog. Do not revive rejected/deferred ideas unless the user asks.
- `docs/` and root `assets/` are intentionally gitignored local reference material; shipped media is under `public/`.

## Non-negotiable engineering constraints

- Performance comes before decorative richness. Target stable 60 fps on real mobile Safari/Chrome; desktop smoothness is not sufficient evidence.
- Avoid full-surface SVG `feTurbulence`, stacked expensive live effects and unnecessary per-frame DOM/layout reads. Prefer baked textures/assets, instancing and transform/opacity animation.
- Use `--app-screen` / `100svh` for full-screen geometry. Do not base fixed/snap layouts on `100dvh`; mobile browser chrome height changes must not rebuild everything.
- Keep one coherent motion experience; do not add a system reduced-motion mode. Pause WebGL/animation when hidden or out of view, and keep iOS motion permission behind a user gesture.
- Start development with `npm run dev` (`--host` is required). iOS device-motion QA needs an HTTPS tunnel, not plain LAN HTTP.
- If a development server is already running for the user, reuse it and leave it running unless the user explicitly asks to stop/restart it.
- Do not run browser-based visual scenario QA or invoke the browser visual-check skill after changes unless the user explicitly asks for visual/browser verification. Continue to run proportionate non-visual checks such as builds and static validation.
- Keep mobile touch scrolling native. Do not re-enable Lenis `syncTouch`, clamp touch deltas, reduce `touchMultiplier`, or otherwise trade finger-to-page response for story pacing without explicit user approval and real-device comparison. Control pacing in the animation/morph layer instead.
- Preserve the page/overlay stacking model documented in `app/pages/index.vue`; careless Teleports or visibility changes can drop the Android WebGL buffer or break the closing iris.
- The desktop Kado↔Cases soft scrub was accepted on 2026-08-20. Tap haptics are still not authorized by that acceptance; keep them deferred unless the user asks.

## Baseline and known risks (2026-08-20)

- The working tree is intentionally dirty with ongoing navigation, case-transition, cursor/header, Lenis and FlowSurface work plus the user’s `.vscode/`. Always run `git status` and inspect targeted diffs; do not assume changes in adjacent files belong to the current task.
- `npm run build` passed. Expected warnings: remote font-provider metadata can be unavailable in a restricted network; one client chunk is about 539 kB minified and exceeds Vite’s 500 kB warning threshold.
- Current dev console also reports a pre-existing Vue hydration mismatch on `img.header-logo` (`style=""` on the server versus `opacity:1` on the client). It is unrelated to Lenis/FlowSurface but remains open.
- Desktop and emulated-mobile browser QA covered extreme Cases → Hero jumps after the surface limiter changes. Real Safari/Chrome touch QA is still required after switching mobile back to native scrolling.
- There is no dedicated test, lint or typecheck script. Verification currently means at least a production build plus focused browser/device QA for animation changes.
- Main maintainability risk: several interaction components are 1k–1.6k lines and share state through `usePageCanvas` / `useFlowSurfaceMask`; prefer narrow changes and trace state/cleanup before refactoring.

## Collaboration history and context hygiene

- The implementation history is captured well by git: the initial site, Page Canvas/iris navigation, iOS/WebGL hardening, gyro controls, Cases and the waypoint corridor were developed through Cursor-agent-assisted commits.
- Do not bulk-read old agent/chat logs. At least one historical studio task embeds multi-megabyte base64 screenshots and can expand to millions of tokens. Use task summaries, git history and targeted turn/file reads with strict limits.
- Communicate with the user in Russian by default. Be concrete and visually literate; favor measured performance and a coherent interaction system over adding more spectacle.
