# Marble radio — UI component

**[Live demo](https://domvybe.com/components/marble-radio/)** · [Step-by-step tutorial](https://domvybe.com/library/marble-radio/) · [Download the ZIP](https://github.com/UlviShabanbayli/domvybe-marble-radio/releases/latest/download/marble-radio-source.zip)

A plan picker made of glass marbles: choose a plan and its marble rolls down a polished stone channel into the seat, overshoots a little and settles, while the old one rolls back up.

Open `index.html` through any local static server (for example `python3 -m http.server`) and try it with a mouse,
a finger or the keyboard. Plain HTML, CSS and JavaScript; no build step, no libraries.

- `index.html` — the pricing page: the skip link, the stage canvas and the CSS stage, the header (logo, nav, Sign in), the eyebrow, the title and the line under it, the radio group (three buttons with role=radio and roving tabindex), the marble hit areas, the price and Continue with its busy and done states, Change plan, the status line, the caption, and a pre-paint script (old keys, ?nofx)
- `css` — marble.css: the header, the title, the label columns and their states (hover, checked, focus, disabled, locked), the price and the button states (busy spinner, done tick), the status line and the caption, the CSS stone and CSS glass marbles without WebGL, the tablet, phone, short-landscape and large-screen layouts, reduced motion
- `js` — app.js (the plans and the stored choice, mouse, touch and keyboard input, the layout that fits the stage between the title and the price, the rolling physics with the overshoot, Continue and Change plan, the scheduler that redraws only where a marble moved and sleeps at rest), scene.js (the ray-traced stage shader: the polished stone slab with its rail, channels and seats, the glass marbles with their cat's-eye swirls, caustics and shadows, and the projection shared with the CSS stage), gl.js (a small WebGL 2 / WebGL 1 helper with baked textures and scissored redraws)

Glasshouse and its plans are made up, and the page sends nothing: Continue simulates a 900 ms request, so put your own
in `js/app.js` (the plans are data at the top, `PLANS`). Everything is made in code: the stone slab, its channels and
seats, the glass marbles with their swirls, the caustics and the shadows are one ray-traced WebGL shader (the stone
texture is baked once), and every word, the price and the buttons are HTML; no AI pictures. The plans are a real radio
group (`role=radiogroup` with three `role=radio` buttons and one tab stop), so arrow keys and screen readers work as
usual; the marbles are pointer aliases of those radios. Only the chosen plan is kept in `localStorage` (`dv89.plan`).
At rest nothing is drawn except the seated marble turning slowly, and the loop sleeps when the tab is hidden or under
reduced motion. Without WebGL (or with `?nofx`, or when the context is lost) the stone and the marbles are CSS, moved by
the same physics; `?disabled=team` (or solo, studio) shows a plan as unavailable and `?fxdpr=2` renders the stage
sharper. The page reads Google Fonts (Inter, Newsreader).

It respects `prefers-reduced-motion`. Made by Ulvi (Code with Ulvi) · domvybe.com

## Licence

MIT — see [LICENSE](LICENSE). Use it in your own projects, commercial ones included.
