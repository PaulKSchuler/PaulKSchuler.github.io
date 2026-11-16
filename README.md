# paul-schuler.com

Personal website of Paul Schuler, served by GitHub Pages at <https://paul-schuler.com>.
The design has one theme: the site is a network. A slow constellation drifts behind every
page, the navigation is a line of nodes, and the home page is a draggable map of the site.

## Pages

| URL | File |
| --- | --- |
| `/` | `index.html` (hero + site map) |
| `/research/` | `research/index.html` |
| `/interests/` | `interests/index.html` (tea network from `data/tea.graphml`, concerts from `concert_lists.ods`) |
| `/photography/` | `photography/index.html` (City, Nature, Everyday galleries) |

## Files

- `assets/css/style.css` – the whole stylesheet. Section colours are CSS variables at the top.
- `assets/js/constellation.js` – background network on a canvas.
- `assets/js/network.js` – interactive force-directed viewer. Reads a GraphML file (`data-src`) or inline JSON (`<script type="application/json">`). Add class `map` for the home-page style (labels always on, click follows `url`).
- `assets/js/concerts.js` – concert timeline. Needs SheetJS, loaded from a CDN in `interests/index.html`.
- `assets/js/lightbox.js` – photo viewer.
- `assets/js/rotator.js` – cycles the last word of the home-page headline.
- `_old/` – the previous Strata template and pages, kept out of git.

## Editing content

- **Site map**: the nodes and links are the JSON block inside `index.html`. Each node has `name`, `kind` (`me`, `page` or `topic`), `size`, `colour`, `url` and `about` (the hover text).
- **Headline words**: the `data-words` attribute in `index.html`, separated by `|`.
- **Tea network**: replace `data/tea.graphml`. Nodes need a `name`; edges can carry a `weight`; a `community` attribute sets the colours.
- **Concerts**: edit `concert_lists.ods` (Artist, Date, Venue, Place, Link to setlist). Rows without a date are skipped.
- **Photos**: the gallery lists in `photography/index.html`.

## Preview locally

```
python3 -m http.server 8000
```

then open <http://localhost:8000>.
