/*
	Concerts: a timeline and a stylised map, both fed by concert_lists.ods
	(columns: Artist, Date, Venue, Place, Link to setlist). Needs SheetJS.

	Timeline: one dot per concert on a year axis.
	Map: cities placed by their real coordinates on a plain grid, sized by the
	number of concerts. Click a city to see its venues, click a venue to list the gigs.
*/
(function () {
	"use strict";

	var root = document.getElementById("concert-timeline");
	var searchInput = document.getElementById("concert-search");
	var countElement = document.getElementById("concert-count");
	var viewButtons = document.querySelectorAll("[data-concert-view]");
	if (!root || !searchInput) return;

	var concerts = [], filtered = [];
	var view = "timeline";          // "timeline" | "map"
	var openCity = null, openVenue = null;

	// Coordinates for the cities in the list (longitude, latitude). Add a line for any new city.
	var CITIES = {
		"glasgow": [-4.25, 55.86], "edinburgh": [-3.19, 55.95], "london": [-0.13, 51.51],
		"manchester": [-2.24, 53.48], "dublin": [-6.26, 53.35], "berlin": [13.40, 52.52],
		"freiburg": [7.85, 47.99], "hamburg": [9.99, 53.55], "munich": [11.58, 48.14],
		"münchen": [11.58, 48.14], "cologne": [6.96, 50.94], "köln": [6.96, 50.94],
		"frankfurt": [8.68, 50.11], "leipzig": [12.37, 51.34], "dresden": [13.74, 51.05],
		"stuttgart": [9.18, 48.78], "basel": [7.59, 47.56], "zurich": [8.54, 47.38], "zürich": [8.54, 47.38],
		"bern": [7.45, 46.95], "geneva": [6.14, 46.20], "lausanne": [6.63, 46.52],
		"st-triphon": [6.97, 46.29], "saint-triphon": [6.97, 46.29], "ollon": [6.99, 46.30],
		"vienna": [16.37, 48.21], "wien": [16.37, 48.21], "amsterdam": [4.90, 52.37],
		"paris": [2.35, 48.86], "barcelona": [2.17, 41.39], "madrid": [-3.70, 40.42],
		"lisbon": [-9.14, 38.72], "linköping": [15.62, 58.41], "linkoping": [15.62, 58.41],
		"stockholm": [18.07, 59.33], "gothenburg": [11.97, 57.71], "copenhagen": [12.57, 55.68],
		"oslo": [10.75, 59.91], "helsinki": [24.94, 60.17], "brussels": [4.35, 50.85],
		"prague": [14.42, 50.08], "milan": [9.19, 45.46], "rome": [12.50, 41.90]
	};

	/* ---------- helpers ---------- */

	function parseDate(value) {
		if (!value) return null;
		if (value instanceof Date && !isNaN(value.getTime())) return value;
		var text = String(value).trim(), m;
		if ((m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) return new Date(Date.UTC(+m[1], m[2] - 1, +m[3]));
		if ((m = text.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})$/))) return new Date(Date.UTC(+m[3], m[2] - 1, +m[1]));
		var d = new Date(text);
		return isNaN(d.getTime()) ? null : d;
	}
	function formatDate(date) {
		return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
	}
	function esc(v) {
		return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
	}
	function field(row, names) {
		var keys = Object.keys(row);
		for (var i = 0; i < names.length; i++) {
			var k = keys.find(function (key) { return key.trim().toLowerCase() === names[i].toLowerCase(); });
			if (k !== undefined) return row[k];
		}
		return "";
	}
	function plural(n, word) { return n + " " + word + (n === 1 ? "" : "s"); }
	function groupBy(list, key) {
		var map = {};
		list.forEach(function (c) { (map[key(c)] = map[key(c)] || []).push(c); });
		return map;
	}

	/* ---------- tooltip ---------- */

	function tip(wrap) { return wrap.querySelector(".concert-tooltip"); }
	function showTip(anchor, html, wrap) {
		var t = tip(wrap); if (!t) return;
		t.innerHTML = html;
		var wr = wrap.getBoundingClientRect(), ar = anchor.getBoundingClientRect();
		var left = ar.left - wr.left + ar.width / 2, top = ar.top - wr.top - t.offsetHeight - 10;
		left = Math.max(8, Math.min(left, wrap.clientWidth - t.offsetWidth - 8));
		if (top < 8) top = ar.bottom - wr.top + 10;
		t.style.left = left + "px"; t.style.top = top + "px";
		t.classList.add("visible");
	}
	function hideTip(wrap) { var t = tip(wrap); if (t) t.classList.remove("visible"); }
	function bindTips(wrap, selector, html) {
		wrap.querySelectorAll(selector).forEach(function (el) {
			var c = html(el);
			el.addEventListener("mouseenter", function () { showTip(el, c, wrap); });
			el.addEventListener("mouseleave", function () { hideTip(wrap); });
			el.addEventListener("focus", function () { showTip(el, c, wrap); });
			el.addEventListener("blur", function () { hideTip(wrap); });
		});
	}
	function concertTip(c) {
		var h = "<strong>" + esc(c.band) + "</strong>" + esc(formatDate(c.date));
		if (c.venue) h += "<br>" + esc(c.venue);
		if (c.place) h += "<br>" + esc(c.place);
		if (c.link) h += '<br><a href="' + esc(c.link) + '" target="_blank" rel="noopener noreferrer">Setlist</a>';
		return h;
	}

	/* ---------- timeline ---------- */

	function renderTimeline() {
		var dates = filtered.map(function (d) { return d.date.getTime(); });
		var yearMs = 365.2425 * 864e5;
		var start = Math.min.apply(null, dates) - yearMs * 0.5, end = Math.max.apply(null, dates) + yearMs * 0.5;
		var y0 = new Date(start).getUTCFullYear(), y1 = new Date(end).getUTCFullYear();
		var step = (y1 - y0) > 12 ? 5 : (y1 - y0) > 6 ? 2 : 1;
		var years = [];
		for (var y = Math.ceil(y0 / step) * step; y <= y1; y += step) years.push(y);
		var width = Math.max(900, years.length * 110), height = 260, pad = 30, axisY = 170, usable = width - 2 * pad;
		var x = function (t) { return pad + (t - start) / (end - start) * usable; };

		var svg = '<svg id="concert-svg" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Timeline of concerts">';
		svg += '<line class="timeline-axis" x1="' + pad + '" y1="' + axisY + '" x2="' + (width - pad) + '" y2="' + axisY + '"></line>';
		years.forEach(function (year) {
			var px = x(Date.UTC(year, 0, 1));
			svg += '<line class="timeline-tick" x1="' + px + '" y1="55" x2="' + px + '" y2="' + (axisY + 10) + '"></line>';
			svg += '<text class="timeline-year" x="' + px + '" y="' + (axisY + 30) + '" text-anchor="middle">' + year + '</text>';
		});
		var levels = [axisY - 18, axisY - 42, axisY - 66, axisY - 90], occupied = levels.map(function () { return []; });
		filtered.forEach(function (c, i) {
			var px = x(c.date.getTime()), level = 0;
			for (var l = 0; l < levels.length; l++) if (!occupied[l].some(function (p) { return Math.abs(p - px) < 13; })) { level = l; break; }
			occupied[level].push(px);
			svg += '<circle class="concert-dot" tabindex="0" cx="' + px + '" cy="' + levels[level] + '" r="5" data-index="' + i + '" aria-label="' + esc(c.band + ", " + formatDate(c.date)) + '"></circle>';
		});
		svg += "</svg>";
		root.innerHTML = '<div class="timeline-wrap">' + svg + '<div class="concert-tooltip" role="tooltip"></div></div>';
		var wrap = root.querySelector(".timeline-wrap");
		bindTips(wrap, ".concert-dot", function (el) { return concertTip(filtered[+el.dataset.index]); });
	}

	/* ---------- map ---------- */

	function cityKey(c) { return (c.place || "Unknown").trim(); }
	function coords(place) { return CITIES[place.trim().toLowerCase()] || null; }

	function renderMap() {
		var byCity = groupBy(filtered, cityKey);
		var names = Object.keys(byCity);
		var located = names.filter(function (n) { return n !== "Unknown" && coords(n); });
		var unlocated = names.filter(function (n) { return located.indexOf(n) < 0; });

		var width = Math.max(340, root.clientWidth || 900), narrow = width < 600, height = Math.round(narrow ? width * 1.1 : Math.min(460, width * 0.5)), pad = narrow ? 40 : 60;
		// Fit the projection to the cities in the data, keeping a sensible minimum span.
		var lons = located.map(function (n) { return coords(n)[0]; }), lats = located.map(function (n) { return coords(n)[1]; });
		var minLon = Math.min.apply(null, lons), maxLon = Math.max.apply(null, lons), minLat = Math.min.apply(null, lats), maxLat = Math.max.apply(null, lats);
		if (!located.length) { minLon = -10; maxLon = 20; minLat = 40; maxLat = 60; }
		var spanLon = Math.max(maxLon - minLon, 8), spanLat = Math.max(maxLat - minLat, 5);
		var cLon = (minLon + maxLon) / 2, cLat = (minLat + maxLat) / 2;
		// Longitude degrees shrink with latitude; keep the aspect roughly true.
		var kx = Math.cos(cLat * Math.PI / 180);
		var scale = Math.min((width - 2 * pad) / (spanLon * kx), (height - 2 * pad) / spanLat) * 0.85;
		var px = function (lon) { return width / 2 + (lon - cLon) * kx * scale; };
		var py = function (lat) { return height / 2 - (lat - cLat) * scale; };

		var svg = '<svg id="concert-map" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Map of concert cities">';
		// graticule: one line per 2 degrees
		var gstep = spanLat > 20 ? 5 : 2;
		for (var lon = Math.floor((cLon - spanLon) / gstep) * gstep; lon <= cLon + spanLon; lon += gstep) {
			svg += '<line class="map-grid" x1="' + px(lon).toFixed(1) + '" y1="0" x2="' + px(lon).toFixed(1) + '" y2="' + height + '"></line>';
		}
		for (var lat = Math.floor((cLat - spanLat) / gstep) * gstep; lat <= cLat + spanLat; lat += gstep) {
			svg += '<line class="map-grid" x1="0" y1="' + py(lat).toFixed(1) + '" x2="' + width + '" y2="' + py(lat).toFixed(1) + '"></line>';
		}
		var maxN = Math.max.apply(null, names.map(function (n) { return byCity[n].length; }));
		var r = function (n) { return (narrow ? 5 : 6) + (narrow ? 13 : 18) * Math.sqrt(n / maxN); };
		// Project, then push overlapping cities apart so neighbours such as Glasgow and Edinburgh stay readable.
		var placed = located.map(function (n) { var c = coords(n); return { n: n, x: px(c[0]), y: py(c[1]), r: r(byCity[n].length) }; });
		for (var iter = 0; iter < 60; iter++) {
			for (var a = 0; a < placed.length; a++) for (var b = a + 1; b < placed.length; b++) {
				var A = placed[a], B = placed[b], dx = B.x - A.x, dy = B.y - A.y, d = Math.sqrt(dx * dx + dy * dy) || 0.01;
				var min = A.r + B.r + 26;
				if (d < min) { var push = (min - d) / 2, ux = dx / d, uy = dy / d; A.x -= ux * push; A.y -= uy * push; B.x += ux * push; B.y += uy * push; }
			}
		}
		placed.forEach(function (p) {
			var n = p.n, count = byCity[n].length, cx = p.x, cy = p.y;
			svg += '<g class="map-city" tabindex="0" role="button" data-city="' + esc(n) + '" aria-label="' + esc(n + ", " + plural(count, "concert")) + '" transform="translate(' + cx.toFixed(1) + ',' + cy.toFixed(1) + ')">' +
				'<circle class="map-halo" r="' + (r(count) + 8).toFixed(1) + '"></circle>' +
				'<circle class="map-node" r="' + r(count).toFixed(1) + '"></circle>' +
				'<text class="map-count" text-anchor="middle" dy="0.35em">' + count + '</text>' +
				'<text class="map-label" text-anchor="middle" y="' + (r(count) + 16).toFixed(1) + '">' + esc(n) + '</text></g>';
		});
		// cities without coordinates sit in a row at the bottom
		unlocated.forEach(function (n, i) {
			var count = byCity[n].length, cx = pad + i * 120, cy = height - 28;
			svg += '<g class="map-city unlocated" tabindex="0" role="button" data-city="' + esc(n) + '" transform="translate(' + cx + ',' + cy + ')">' +
				'<circle class="map-node" r="' + r(count).toFixed(1) + '"></circle>' +
				'<text class="map-count" text-anchor="middle" dy="0.35em">' + count + '</text>' +
				'<text class="map-label" x="' + (r(count) + 6).toFixed(1) + '" dy="0.35em">' + esc(n) + ' (no coordinates)</text></g>';
		});
		svg += "</svg>";
		root.innerHTML = '<div class="map-wrap"><p class="map-hint">' + plural(names.length, "city").replace("citys", "cities") + ". Click one to see its venues.</p>" + svg + '<div class="concert-tooltip" role="tooltip"></div></div>';
		var wrap = root.querySelector(".map-wrap");
		bindTips(wrap, ".map-city", function (el) {
			var n = el.dataset.city, venues = Object.keys(groupBy(byCity[n], function (c) { return c.venue || "Unknown venue"; }));
			return "<strong>" + esc(n) + "</strong>" + plural(byCity[n].length, "concert") + " at " + plural(venues.length, "venue");
		});
		wrap.querySelectorAll(".map-city").forEach(function (el) {
			var go = function () { openCity = el.dataset.city; openVenue = null; render(); };
			el.addEventListener("click", go);
			el.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
		});
	}

	function renderCity() {
		var inCity = filtered.filter(function (c) { return cityKey(c) === openCity; });
		if (!inCity.length) { openCity = null; return renderMap(); }
		var byVenue = groupBy(inCity, function (c) { return c.venue || "Unknown venue"; });
		var venues = Object.keys(byVenue).sort(function (a, b) { return byVenue[b].length - byVenue[a].length; });
		var width = Math.max(340, root.clientWidth || 900), narrow = width < 600, height = Math.round(narrow ? width * 1.05 : 420), cx = width / 2, cy = height / 2;
		var maxN = Math.max.apply(null, venues.map(function (v) { return byVenue[v].length; }));
		var r = function (n) { return 8 + 16 * Math.sqrt(n / maxN); };
		var radius = Math.min(narrow ? width * 0.36 : 150, 70 + venues.length * 14);

		var svg = '<svg id="concert-map" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Venues in ' + esc(openCity) + '">';
		var pos = venues.map(function (v, i) {
			var a = -Math.PI / 2 + i * 2 * Math.PI / venues.length;
			return venues.length === 1 ? [cx + radius, cy] : [cx + Math.cos(a) * radius * (narrow ? 1.05 : 1.6), cy + Math.sin(a) * radius];
		});
		pos.forEach(function (p) { svg += '<line class="map-link" x1="' + cx + '" y1="' + cy + '" x2="' + p[0].toFixed(1) + '" y2="' + p[1].toFixed(1) + '"></line>'; });
		svg += '<g class="map-centre" transform="translate(' + cx + ',' + cy + ')"><circle r="' + (narrow ? 24 : 30) + '"></circle><text text-anchor="middle" dy="0.35em">' + esc(openCity) + '</text></g>';
		venues.forEach(function (v, i) {
			var n = byVenue[v].length, p = pos[i], rr = r(n), active = v === openVenue;
			svg += '<g class="map-venue' + (active ? ' active' : '') + '" tabindex="0" role="button" data-venue="' + esc(v) + '" aria-label="' + esc(v + ", " + plural(n, "concert")) + '" transform="translate(' + p[0].toFixed(1) + ',' + p[1].toFixed(1) + ')">' +
				'<circle class="map-node" r="' + rr.toFixed(1) + '"></circle><text class="map-count" text-anchor="middle" dy="0.35em">' + n + '</text>' +
				'<text class="map-label" text-anchor="middle" y="' + (rr + 16).toFixed(1) + '">' + esc(v) + '</text></g>';
		});
		svg += "</svg>";

		var list = "";
		if (openVenue && byVenue[openVenue]) {
			list = '<ol class="venue-list"><li class="venue-list-head">' + esc(openVenue) + "</li>" + byVenue[openVenue].slice().sort(function (a, b) { return b.date - a.date; }).map(function (c) {
				return "<li><span class=\"venue-date\">" + esc(formatDate(c.date)) + "</span> " + esc(c.band) +
					(c.link ? ' <a href="' + esc(c.link) + '" target="_blank" rel="noopener noreferrer">setlist</a>' : "") + "</li>";
			}).join("") + "</ol>";
		}
		root.innerHTML = '<div class="map-wrap"><p class="map-hint"><button type="button" class="button small map-back">All cities</button> ' +
			esc(openCity) + ": " + plural(inCity.length, "concert") + " at " + plural(venues.length, "venue") + ". Click a venue for the gigs.</p>" + svg + list + "</div>";
		var wrap = root.querySelector(".map-wrap");
		wrap.querySelector(".map-back").addEventListener("click", function () { openCity = null; openVenue = null; render(); });
		wrap.querySelectorAll(".map-venue").forEach(function (el) {
			var go = function () { openVenue = el.dataset.venue === openVenue ? null : el.dataset.venue; render(); };
			el.addEventListener("click", go);
			el.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
		});
	}

	/* ---------- control ---------- */

	function render() {
		if (!filtered.length) {
			root.innerHTML = '<p class="timeline-message">No concerts found.</p>';
			countElement.textContent = "";
			return;
		}
		countElement.textContent = plural(filtered.length, "concert");
		if (view === "map") { if (openCity) renderCity(); else renderMap(); }
		else renderTimeline();
	}

	function applyFilter() {
		var q = searchInput.value.trim().toLowerCase();
		filtered = concerts.filter(function (c) {
			return !q || [c.band, c.venue, c.place].some(function (s) { return s && s.toLowerCase().indexOf(q) > -1; });
		});
		render();
	}

	viewButtons.forEach(function (b) {
		b.addEventListener("click", function () {
			view = b.dataset.concertView;
			openCity = null; openVenue = null;
			viewButtons.forEach(function (o) { o.setAttribute("aria-pressed", o === b ? "true" : "false"); });
			render();
		});
	});

	async function load() {
		try {
			var res = await fetch("../concert_lists.ods", { cache: "no-store" });
			if (!res.ok) throw new Error("Could not load concert_lists.ods");
			var wb = XLSX.read(await res.arrayBuffer(), { type: "array", cellDates: true });
			var rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
			concerts = rows.map(function (row) {
				var date = parseDate(field(row, ["Date"])), band = String(field(row, ["Artist", "Band"])).trim();
				if (!date || !band) return null;
				return { date: date, band: band, venue: String(field(row, ["Venue"])).trim(),
					place: String(field(row, ["Place", "City"])).trim(), link: String(field(row, ["Link to setlist", "Setlist", "Link"])).trim() };
			}).filter(Boolean).sort(function (a, b) { return a.date - b.date; });
			applyFilter();
		} catch (err) {
			console.error(err);
			root.innerHTML = '<p class="timeline-message">Could not load <code>concert_lists.ods</code>.</p>';
			countElement.textContent = "";
		}
	}

	searchInput.addEventListener("input", applyFilter);
	var resizeTimer;
	window.addEventListener("resize", function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(function () { if (view === "map" && filtered.length) render(); }, 200); });
	(function waitForXlsx(tries) {
		if (window.XLSX) return load();
		if (tries > 100) { root.innerHTML = '<p class="timeline-message">The spreadsheet library could not be loaded, so the timeline cannot be shown.</p>'; return; }
		setTimeout(function () { waitForXlsx(tries + 1); }, 100);
	})(0);
})();
