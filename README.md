# Matthew Wang — personal site

Personal site for Matthew Wang. Plain HTML, CSS and JavaScript. No framework, no build step. GSAP (loaded from cdnjs) runs the motion.

## How it goes live

The site is hosted on **GitHub Pages**, served from the root of the `main` branch. Every push to `main` redeploys it automatically, usually within a minute or two, at <https://mzwang74.github.io>. There is nothing else to run or deploy.

```sh
git add -A
git commit -m "Describe the change"
git push
```

Check the deploy under the repo's **Actions** tab if a change doesn't show up.

## Preview before pushing (optional)

Pages load fine straight from GitHub, but to check a change before it goes live, serve the folder locally:

```sh
cd ~/mzwang74.github.io
python -m http.server 8000
```

Then open <http://localhost:8000> and stop it with Ctrl+C. (Opening the HTML files directly with `file://` breaks the gradient's module script, so use the server.)

## Files

| File | What it is |
|---|---|
| `index.html` | Home page: intro over the water, then the Work panel with the Experience and Projects rows |
| `experience/wise.html`, `eliot.html`, `regor.html` | One page per job |
| `projects/build-vs-buy.html`, `donor-outreach.html`, `director.html`, `this-website.html` | One page per project |
| `about.html` | "Outside": swimming and interests |
| `resume.html` | Web resume. The Download PDF button is commented out until `assets/Matthew-Wang-Resume.pdf` exists (no phone number) |
| `assets/css/style.css` | All styles. Colours are tokens at the top of the file |
| `assets/js/theme.js` | Light/dark toggle |
| `assets/js/water.js` | The canvas background: flowing dots and pixel-art fish |
| `assets/js/gradient.js` | The navy shader gradient under the dots (react-three-fiber + Three.js from a CDN), synced to the dots' waves |
| `assets/js/motion.js` | GSAP: intro, the scroll "dive", row reveals, count-ups |
| `404.html` | Shown by GitHub Pages for missing URLs |
| `robots.txt`, `sitemap.xml`, `.nojekyll` | Search engine and GitHub Pages housekeeping |

## How to edit

All content is filled in. If you add placeholder text, wrap it in `<mark data-todo>[TODO: ...]</mark>` so it shows up highlighted, and find leftovers with `grep -rn "TODO" --include="*.html" .`

- **Facts**: every number on the site comes from the resume. Keep it that way.
- **Adding a work page**: copy an existing page in `experience/` or `projects/`, add a row for it in `index.html`, and add it to `sitemap.xml`. The row's number and title and the page's header share a pair of `view-transition-name`s (for example `vt-wise-num` and `vt-wise-title`). Give the new page its own pair, and never use the same name twice on one page. Update the "Next" row at the bottom of the neighbouring pages.
- **Result numbers**: write the real number in the HTML and repeat it in `data-count`. The script only animates up to it.
- **Motion hooks**: `data-enter` comes in on page load, `data-reveal` comes in on scroll. Remove the attribute to stop an element animating.
- **Colours**: change `--accent` (site accent and violet fish), `--fish-white` (white fish) or `--water-dot` (the dots) in `assets/css/style.css`. Each is defined twice: once in the base `:root` (light), once in the dark block. Dark is the default.
- **Privacy**: no phone number or street address anywhere, including the PDF.

## Hosting and domain

GitHub Pages (free), HTTPS enforced. Canonical URLs, `sitemap.xml` and `robots.txt` all point at `https://mzwang74.github.io`.

If a custom domain is added later: set it in the repo's Settings → Pages, add GitHub's four A records and a `www` CNAME at the registrar, enforce HTTPS, then update the canonical and `og:url` tags on every page plus `sitemap.xml` and `robots.txt` to the new domain.
