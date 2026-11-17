# mattzwang.com

Personal site for Matthew Wang. Plain HTML, CSS and JavaScript. No framework, no build step. GSAP (loaded from cdnjs) runs the motion.

## Preview locally

```sh
cd ~/Sites/mattzwang/site
python3 -m http.server 8000
```

Then open <http://localhost:8000>. Stop the server with Ctrl+C.

## Files

| File | What it is |
|---|---|
| `index.html` | Home page: intro over the water, then the Work panel with the Experience and Projects rows |
| `experience/wise.html`, `eliot.html`, `regor.html` | One page per job |
| `projects/build-vs-buy.html`, `donor-outreach.html`, `director.html`, `this-website.html` | One page per project |
| `about.html` | "Outside": swimming and interests |
| `resume.html` | Web resume, with a button that downloads the PDF |
| `assets/Matthew-Wang-Resume.pdf` | The PDF resume (add this file yourself, without the phone number) |
| `assets/css/style.css` | All styles. Colours are tokens at the top of the file |
| `assets/js/theme.js` | Light/dark toggle |
| `assets/js/water.js` | The canvas background: flowing dots and pixel-art fish |
| `assets/js/motion.js` | GSAP: intro, the scroll "dive", row reveals, count-ups |
| `404.html` | Shown by GitHub Pages for missing URLs |
| `robots.txt`, `sitemap.xml`, `.nojekyll` | Search engine and GitHub Pages housekeeping |

## How to edit

Everything still to be filled in is wrapped in `<mark data-todo>` and shows up highlighted on the page. List what is left with:

```sh
grep -rn "TODO" --include="*.html" .
```

Replace the whole `<mark data-todo>[TODO: ...]</mark>` element with the real text, so the highlight disappears.

- **Facts**: every number on the site comes from the resume. Keep it that way.
- **Adding a work page**: copy an existing page in `experience/` or `projects/`, add a row for it in `index.html`, and add it to `sitemap.xml`. The row's number and title and the page's header share a pair of `view-transition-name`s (for example `vt-wise-num` and `vt-wise-title`). Give the new page its own pair, and never use the same name twice on one page. Update the "Next" row at the bottom of the neighbouring pages.
- **Result numbers**: write the real number in the HTML and repeat it in `data-count`. The script only animates up to it.
- **Motion hooks**: `data-enter` comes in on page load, `data-reveal` comes in on scroll. Remove the attribute to stop an element animating.
- **Colours**: change `--accent` (site accent and violet fish), `--fish-white` (white fish) or `--water-dot` (the dots) in `assets/css/style.css`. Each is defined twice: once in the base `:root` (light), once in the dark block. Dark is the default.
- **Privacy**: no phone number or street address anywhere, including the PDF.

## Hosting

GitHub Pages, served from the root of the `main` branch. The site lives at <https://mattzwang.com>.
