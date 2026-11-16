# paul-schuler.com

Personal website of Paul Schuler, built on the [Strata](https://html5up.net/strata) template by HTML5 UP and served by GitHub Pages at <https://paul-schuler.com>.

## Pages

| URL | File |
| --- | --- |
| `/` | `index.html` |
| `/research/` | `research/index.html` |
| `/interests/` | `interests/index.html` (concert timeline reads `concert_lists.ods`) |
| `/photography/` | `photography/index.html` (City, Nature, Everyday galleries) |

Shared styles live in `assets/css/site.css`; the photo viewer in `assets/js/lightbox.js`.

## Updating the concert timeline

Edit `concert_lists.ods` (columns: Artist, Date, Venue, Place, Link to setlist). Dates can be `DD/MM/YYYY` or `YYYY-MM-DD`. Rows without a date are skipped.

## Preview locally

```
python3 -m http.server 8000
```

then open <http://localhost:8000>.
