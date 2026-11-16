/*
	Interactive network viewer for GraphML files.
	No dependencies: parses the GraphML, runs a small force-directed layout and draws SVG.

	Usage:
		<div class="network" data-src="../data/tea.graphml"
		     data-label="name" data-group="community" data-weight="weight"></div>
		<script src="../assets/js/network.js"></script>

	The data-label / data-group / data-weight attributes are optional; the script
	guesses common attribute names when they are missing.

	Interaction: drag a node to pull the network, hover (or tap) a node to see its
	neighbours, hover a legend entry to see a community, "Shake" to re-run the layout.
*/
(function () {
	"use strict";

	var SVGNS = "http://www.w3.org/2000/svg";
	var PALETTE = ["#49bf9d", "#e07a5f", "#3d5a80", "#e9b44c", "#9b5de5",
		"#5fa8d3", "#c0587e", "#8a9a5b", "#b5838d", "#6d6875"];
	var LABEL_KEYS = ["label", "name", "Label", "Name", "title"];
	var GROUP_KEYS = ["community", "group", "type", "category", "modularity_class", "cluster", "Group", "Type", "Category"];
	var WEIGHT_KEYS = ["weight", "Weight", "value"];
	var HIDDEN_ATTRS = ["x", "y", "r", "g", "b", "size", "url", "kind", "about"];

	function each(list, fn) { Array.prototype.forEach.call(list, fn); }
	function pick(obj, keys) {
		for (var i = 0; i < keys.length; i++) if (obj[keys[i]] !== undefined && obj[keys[i]] !== "") return keys[i];
		return null;
	}
	function el(name, attrs, parent) {
		var e = document.createElementNS(SVGNS, name);
		for (var k in attrs) e.setAttribute(k, attrs[k]);
		if (parent) parent.appendChild(e);
		return e;
	}
	function convert(value, type) {
		if (type === "int" || type === "long" || type === "float" || type === "double") {
			var n = Number(value);
			return isNaN(n) ? value : n;
		}
		if (type === "boolean") return value === "true";
		return value;
	}

	/* ---------- GraphML ---------- */

	function parseGraphML(text) {
		var doc = new DOMParser().parseFromString(text, "application/xml");
		if (doc.getElementsByTagName("parsererror").length) throw new Error("The file is not valid GraphML.");

		var keys = {};
		each(doc.getElementsByTagName("key"), function (k) {
			var name = k.getAttribute("attr.name") || k.getAttribute("id");
			if (k.getAttribute("yfiles.type") === "nodegraphics") name = "label"; // yEd labels
			var def = null;
			each(k.childNodes, function (c) { if (c.localName === "default") def = c.textContent.trim(); });
			keys[k.getAttribute("id")] = { name: name, scope: k.getAttribute("for") || "all", type: k.getAttribute("attr.type"), def: def };
		});

		function readData(node, scope) {
			var out = {};
			Object.keys(keys).forEach(function (id) {
				var k = keys[id];
				if ((k.scope === scope || k.scope === "all") && k.def !== null) out[k.name] = convert(k.def, k.type);
			});
			each(node.childNodes, function (c) {
				if (c.localName !== "data") return;
				var k = keys[c.getAttribute("key")];
				out[k ? k.name : c.getAttribute("key")] = convert(c.textContent.trim(), k && k.type);
			});
			return out;
		}

		var nodes = [], byId = {};
		each(doc.getElementsByTagName("node"), function (n) {
			var node = { id: n.getAttribute("id"), data: readData(n, "node"), neighbours: {}, degree: 0, strength: 0 };
			byId[node.id] = node;
			nodes.push(node);
		});

		var links = [], seen = {};
		each(doc.getElementsByTagName("edge"), function (e) {
			var s = byId[e.getAttribute("source")], t = byId[e.getAttribute("target")];
			if (!s || !t || s === t) return;
			var data = readData(e, "edge");
			var wKey = pick(data, WEIGHT_KEYS);
			var w = wKey ? Number(data[wKey]) || 1 : 1;
			var id = s.id < t.id ? s.id + "|" + t.id : t.id + "|" + s.id;
			if (seen[id]) { seen[id].weight += w; return; }
			var link = { source: s, target: t, weight: w };
			seen[id] = link;
			links.push(link);
		});

		links.forEach(function (l) {
			l.source.neighbours[l.target.id] = true;
			l.target.neighbours[l.source.id] = true;
			l.source.degree++; l.target.degree++;
			l.source.strength += l.weight; l.target.strength += l.weight;
		});

		return { nodes: nodes, links: links };
	}

	function parseJSON(text) {
		var raw = JSON.parse(text), byId = {}, nodes = [], links = [];
		raw.nodes.forEach(function (d) {
			var node = { id: String(d.id), data: d, neighbours: {}, degree: 0, strength: 0 };
			byId[node.id] = node; nodes.push(node);
		});
		raw.links.forEach(function (d) {
			var s = byId[String(d.source)], t = byId[String(d.target)];
			if (!s || !t || s === t) return;
			var link = { source: s, target: t, weight: Number(d.weight) || 1 };
			links.push(link);
			s.neighbours[t.id] = true; t.neighbours[s.id] = true;
			s.degree++; t.degree++; s.strength += link.weight; t.strength += link.weight;
		});
		return { nodes: nodes, links: links };
	}

	/* ---------- Viewer ---------- */

	function Viewer(root, graph) {
		var self = this;
		this.root = root;
		this.nodes = graph.nodes;
		this.links = graph.links;
		this.alpha = 1;
		this.alphaTarget = 0;
		this.running = false;
		this.map = root.classList.contains("map");

		var sample = this.nodes[0] ? this.nodes[0].data : {};
		var labelKey = root.getAttribute("data-label") || pick(sample, LABEL_KEYS);
		var groupKey = root.getAttribute("data-group") || pick(sample, GROUP_KEYS);
		this.groupKey = groupKey;

		// Groups, ordered by size so the largest gets the first colour.
		var counts = {};
		this.nodes.forEach(function (n) {
			n.label = labelKey && n.data[labelKey] !== undefined ? String(n.data[labelKey]).trim() : n.id;
			n.group = groupKey ? String(n.data[groupKey]) : "";
			counts[n.group] = (counts[n.group] || 0) + 1;
		});
		this.groups = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
		var colour = {};
		this.groups.forEach(function (g, i) { colour[g] = PALETTE[i % PALETTE.length]; });

		var maxStrength = Math.max.apply(null, this.nodes.map(function (n) { return n.strength; }).concat([1]));
		var maxWeight = Math.max.apply(null, this.links.map(function (l) { return l.weight; }).concat([1]));
		this.nodes.forEach(function (n) {
			n.size = n.data.size !== undefined ? Number(n.data.size) : Math.sqrt(n.strength / maxStrength);
			n.r = 4 + 12 * n.size;
			n.colour = n.data.colour || (groupKey ? colour[n.group] : PALETTE[0]);
		});

		// Show labels for the best-connected nodes; the rest appear on hover.
		var ranked = this.nodes.slice().sort(function (a, b) { return b.strength - a.strength; });
		var showCount = this.nodes.length <= 40 ? this.nodes.length : Math.max(10, Math.round(this.nodes.length * 0.15));
		ranked.forEach(function (n, i) { n.showLabel = i < showCount; });
		if (root.getAttribute("data-labels") === "all") this.nodes.forEach(function (n) { n.showLabel = true; });

		this.links.forEach(function (l) {
			l.strength = 1 / Math.min(l.source.degree, l.target.degree);
			l.width = 0.6 + 3 * (l.weight / maxWeight);
		});

		this.build(maxWeight);
		this.resize();
		this.scatter();
		this.start();

		window.addEventListener("resize", function () {
			var oldW = self.width;
			self.resize();
			if (Math.abs(self.width - oldW) > 40) { self.reheat(0.3); }
		});
	}

	Viewer.prototype.build = function () {
		var self = this, root = this.root;
		root.innerHTML = "";
		root.classList.add("network-ready");

		var toolbar = document.createElement("div");
		if (this.map) toolbar.hidden = true;
		toolbar.className = "network-toolbar";
		toolbar.innerHTML =
			'<p class="network-stats">' + this.nodes.length + " nodes · " + this.links.length + " links</p>" +
			'<button type="button" class="button small network-shake">Shake</button>';
		root.appendChild(toolbar);
		toolbar.querySelector(".network-shake").addEventListener("click", function () {
			self.clearFocus(true);
			self.scatter();
			self.reheat(1);
		});

		var stage = document.createElement("div");
		stage.className = "network-stage";
		root.appendChild(stage);
		this.stage = stage;

		var svg = el("svg", { "class": "network-svg", role: "img", "aria-label": "Interactive network with " + this.nodes.length + " nodes. Drag nodes to move them." }, stage);
		this.svg = svg;
		var linkLayer = el("g", { "class": "network-links" }, svg);
		var nodeLayer = el("g", { "class": "network-nodes" }, svg);

		this.links.forEach(function (l) {
			l.el = el("line", { "stroke-width": l.width.toFixed(2) }, linkLayer);
		});

		var focusable = this.nodes.length <= 150;
		this.nodes.forEach(function (n) {
			var g = el("g", { "class": "network-node" + (n.showLabel ? " show-label" : "") }, nodeLayer);
			if (n.data.kind) g.setAttribute("data-kind", n.data.kind);
			if (n.data.url) { g.setAttribute("role", "link"); }
			if (focusable) { g.setAttribute("tabindex", "0"); g.setAttribute("aria-label", n.label); }
			el("circle", { r: n.r.toFixed(1), fill: n.colour }, g);
			var t = el("text", { x: (n.r + 3).toFixed(1), y: "0.35em" }, g);
			t.textContent = n.label;
			n.el = g;
			g.__node = n;
		});

		var tip = document.createElement("div");
		tip.className = "network-tooltip";
		tip.setAttribute("role", "status");
		stage.appendChild(tip);
		this.tip = tip;

		if (!this.map && this.groupKey && this.groups.length > 1 && this.groups.length <= PALETTE.length) {
			var legend = document.createElement("ul");
			legend.className = "network-legend";
			this.groups.forEach(function (g, i) {
				var members = self.nodes.filter(function (n) { return n.group === g; });
				var top = members.slice().sort(function (a, b) { return b.strength - a.strength; })[0];
				var li = document.createElement("li");
				li.tabIndex = 0;
				li.innerHTML = '<span class="swatch" style="background:' + members[0].colour + '"></span>' +
					escapeHtml(top ? top.label : g) + ' <span class="network-muted">+' + (members.length - 1) + "</span>";
				li.title = members.map(function (n) { return n.label; }).join(", ");
				li.addEventListener("mouseenter", function () { self.focusGroup(g); });
				li.addEventListener("focus", function () { self.focusGroup(g); });
				li.addEventListener("mouseleave", function () { self.clearFocus(); });
				li.addEventListener("blur", function () { self.clearFocus(); });
				legend.appendChild(li);
			});
			root.appendChild(legend);
		}

		this.bindPointer();
	};

	Viewer.prototype.resize = function () {
		var w = this.stage.clientWidth || 600;
		var h = this.map
			? Math.round(w < 560 ? Math.min(520, w * 1.15) : Math.max(380, Math.min(600, w * 0.6)))
			: Math.round(w < 560 ? Math.min(560, w * 1.25) : Math.max(380, Math.min(640, w * 0.75)));

		// Spacing and node size follow the space available per node, so phones get a tighter layout.
		var perNode = w * h / Math.max(this.nodes.length, 1);
		this.charge = -Math.max(50, Math.min(this.map ? (w < 560 ? 260 : 650) : 300, (this.map ? 0.06 : 0.025) * perNode));
		this.linkDistance = Math.max(18, Math.min(this.map ? 140 : 80, (this.map ? 1.1 : 0.7) * Math.sqrt(perNode)));
		var scale = Math.max(0.6, Math.min(1, w / 700));
		this.nodes.forEach(function (n) {
			n.r = (4 + 12 * n.size) * scale;
			if (n.el) {
				n.el.firstChild.setAttribute("r", n.r.toFixed(1));
				n.el.lastChild.__left = null;
			}
		});

		var dx = (w - (this.width || w)) / 2, dy = (h - (this.height || h)) / 2;
		this.width = w; this.height = h;
		this.svg.setAttribute("viewBox", "0 0 " + w + " " + h);
		this.svg.setAttribute("height", h);
		if (this.nodes[0] && this.nodes[0].x === undefined) return; // not laid out yet
		if (dx || dy) this.nodes.forEach(function (n) { n.x += dx; n.y += dy; });
		this.draw();
	};

	Viewer.prototype.scatter = function () {
		var w = this.width, h = this.height, count = this.nodes.length;
		// Phyllotaxis spiral, like d3: evenly spread, deterministic.
		this.nodes.forEach(function (n, i) {
			var radius = 10 * Math.sqrt(0.5 + i), angle = i * Math.PI * (3 - Math.sqrt(5));
			n.x = w / 2 + radius * Math.cos(angle) * Math.min(1, w / (25 * Math.sqrt(count) + 1));
			n.y = h / 2 + radius * Math.sin(angle) * Math.min(1, h / (25 * Math.sqrt(count) + 1));
			n.vx = 0; n.vy = 0;
		});
	};

	/* ---------- Simulation ---------- */

	Viewer.prototype.tick = function () {
		var nodes = this.nodes, links = this.links, alpha = this.alpha;
		var i, j, a, b, dx, dy, d2, d, f;
		var count = nodes.length;

		// Repulsion between every pair (fine for a few hundred nodes) plus collision.
		for (i = 0; i < count; i++) {
			a = nodes[i];
			for (j = i + 1; j < count; j++) {
				b = nodes[j];
				dx = b.x - a.x; dy = b.y - a.y;
				if (dx === 0 && dy === 0) { dx = (Math.random() - 0.5) * 1e-3; dy = (Math.random() - 0.5) * 1e-3; }
				d2 = dx * dx + dy * dy;
				if (d2 < 1) d2 = 1;
				f = this.charge * alpha / d2;
				a.vx += dx * f; a.vy += dy * f;
				b.vx -= dx * f; b.vy -= dy * f;
				var minD = a.r + b.r + (this.map ? 26 : 2);
				if (d2 < minD * minD) {
					d = Math.sqrt(d2);
					var push = (minD - d) / d * 0.5;
					a.vx -= dx * push * 0.5; a.vy -= dy * push * 0.5;
					b.vx += dx * push * 0.5; b.vy += dy * push * 0.5;
				}
			}
		}

		// Springs along links.
		for (i = 0; i < links.length; i++) {
			var l = links[i];
			a = l.source; b = l.target;
			dx = b.x + b.vx - a.x - a.vx;
			dy = b.y + b.vy - a.y - a.vy;
			d = Math.sqrt(dx * dx + dy * dy) || 1e-6;
			f = (d - this.linkDistance) / d * alpha * l.strength;
			dx *= f; dy *= f;
			var bias = a.degree / (a.degree + b.degree);
			b.vx -= dx * bias; b.vy -= dy * bias;
			a.vx += dx * (1 - bias); a.vy += dy * (1 - bias);
		}

		// Gentle pull to the centre keeps separate components on screen.
		var cx = this.width / 2, cy = this.height / 2, gravity = 0.08 * alpha;
		for (i = 0; i < count; i++) {
			a = nodes[i];
			a.vx += (cx - a.x) * gravity;
			a.vy += (cy - a.y) * gravity;
		}

		// Integrate, damp, keep inside the frame.
		for (i = 0; i < count; i++) {
			a = nodes[i];
			if (a.fx != null) { a.x = a.fx; a.y = a.fy; a.vx = 0; a.vy = 0; continue; }
			a.vx *= 0.6; a.vy *= 0.6;
			a.x += a.vx; a.y += a.vy;
			var m = a.r + (this.map ? 28 : 2);
			a.x = Math.max(m, Math.min(this.width - m, a.x));
			a.y = Math.max(m, Math.min(this.height - m, a.y));
		}

		this.alpha += (this.alphaTarget - this.alpha) * 0.0228;
	};

	Viewer.prototype.draw = function () {
		this.links.forEach(function (l) {
			if (!l.el || l.source.x === undefined) return;
			l.el.setAttribute("x1", l.source.x.toFixed(1));
			l.el.setAttribute("y1", l.source.y.toFixed(1));
			l.el.setAttribute("x2", l.target.x.toFixed(1));
			l.el.setAttribute("y2", l.target.y.toFixed(1));
		});
		var w = this.width;
		this.nodes.forEach(function (n) {
			if (!n.el || n.x === undefined) return;
			n.el.setAttribute("transform", "translate(" + n.x.toFixed(1) + "," + n.y.toFixed(1) + ")");
			// Put labels on the left when a node sits near the right edge.
			var t = n.el.lastChild, left = n.x > w * 0.75;
			if (t.__left !== left) {
				t.__left = left;
				t.setAttribute("x", (left ? -(n.r + 3) : n.r + 3).toFixed(1));
				t.setAttribute("text-anchor", left ? "end" : "start");
			}
		});
		if (this.tipNode) this.placeTip(this.tipNode);
	};

	Viewer.prototype.start = function () {
		var self = this;
		if (this.running) return;
		var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		if (reduced && this.alphaTarget === 0) {
			// Settle the layout at once instead of animating it.
			while (this.alpha > 0.002) this.tick();
			this.draw();
			return;
		}
		this.running = true;
		(function frame() {
			self.tick();
			self.draw();
			if (self.alpha > 0.002 || self.alphaTarget > 0) requestAnimationFrame(frame);
			else self.running = false;
		})();
	};

	Viewer.prototype.reheat = function (alpha) {
		this.alpha = Math.max(this.alpha, alpha);
		this.start();
	};

	/* ---------- Interaction ---------- */

	Viewer.prototype.toLocal = function (evt) {
		var pt = this.svg.createSVGPoint();
		pt.x = evt.clientX; pt.y = evt.clientY;
		return pt.matrixTransform(this.svg.getScreenCTM().inverse());
	};

	Viewer.prototype.bindPointer = function () {
		var self = this, svg = this.svg, drag = null;

		function nodeFrom(target) {
			while (target && target !== svg) {
				if (target.__node) return target.__node;
				target = target.parentNode;
			}
			return null;
		}

		svg.addEventListener("pointerdown", function (e) {
			var n = nodeFrom(e.target);
			if (!n) { self.clearFocus(true); return; }
			e.preventDefault();
			svg.setPointerCapture(e.pointerId);
			var p = self.toLocal(e);
			drag = { node: n, id: e.pointerId, ox: n.x - p.x, oy: n.y - p.y, sx: e.clientX, sy: e.clientY, moved: false };
			n.fx = n.x; n.fy = n.y;
			self.root.classList.add("dragging");
			self.focusNode(n);
		});

		svg.addEventListener("pointermove", function (e) {
			if (drag && e.pointerId === drag.id) {
				if (!drag.moved && Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) > 3) {
					drag.moved = true;
					self.hideTip();
					self.alphaTarget = 0.3;
					self.reheat(0.3);
				}
				var p = self.toLocal(e);
				drag.node.fx = Math.max(drag.node.r, Math.min(self.width - drag.node.r, p.x + drag.ox));
				drag.node.fy = Math.max(drag.node.r, Math.min(self.height - drag.node.r, p.y + drag.oy));
				if (!self.running) self.draw();
				return;
			}
			if (e.pointerType === "mouse") {
				var n = nodeFrom(e.target);
				if (n && n !== self.focused) self.focusNode(n);
				else if (!n && self.focused && !self.pinned) self.clearFocus();
			}
		});

		function end(e) {
			if (!drag || e.pointerId !== drag.id) return;
			var n = drag.node;
			n.fx = null; n.fy = null;
			self.alphaTarget = 0;
			self.root.classList.remove("dragging");
			// A tap without movement keeps the neighbourhood highlighted (useful on touch screens).
			if (!drag.moved && n.data.url) { window.location.href = n.data.url; drag = null; return; }
			self.pinned = !drag.moved ? n : null;
			if (drag.moved && e.pointerType !== "mouse") self.clearFocus(true);
			drag = null;
		}
		svg.addEventListener("pointerup", end);
		svg.addEventListener("pointercancel", end);
		svg.addEventListener("pointerleave", function (e) {
			if (!drag && e.pointerType === "mouse" && !self.pinned) self.clearFocus();
		});

		svg.addEventListener("focusin", function (e) { var n = nodeFrom(e.target); if (n) self.focusNode(n); });
		svg.addEventListener("focusout", function () { if (!self.pinned) self.clearFocus(); });
		this.root.addEventListener("keydown", function (e) {
			if (e.key === "Escape") self.clearFocus(true);
			if (e.key === "Enter" && self.focused && self.focused.data.url) window.location.href = self.focused.data.url;
		});
	};

	Viewer.prototype.focusNode = function (n) {
		this.focused = n;
		this.root.classList.add("has-focus");
		this.nodes.forEach(function (m) { m.el.classList.toggle("hl", m === n || !!n.neighbours[m.id]); m.el.classList.toggle("active", m === n); });
		this.links.forEach(function (l) { l.el.classList.toggle("hl", l.source === n || l.target === n); });
		this.showTip(n);
	};

	Viewer.prototype.focusGroup = function (g) {
		this.root.classList.add("has-focus");
		this.nodes.forEach(function (m) { m.el.classList.toggle("hl", m.group === g); m.el.classList.remove("active"); });
		this.links.forEach(function (l) { l.el.classList.toggle("hl", l.source.group === g && l.target.group === g); });
		this.hideTip();
	};

	Viewer.prototype.clearFocus = function (force) {
		if (this.pinned && !force) return;
		this.pinned = null;
		this.focused = null;
		this.root.classList.remove("has-focus");
		this.nodes.forEach(function (m) { m.el.classList.remove("hl", "active"); });
		this.links.forEach(function (l) { l.el.classList.remove("hl"); });
		this.hideTip();
	};

	Viewer.prototype.showTip = function (n) {
		var self = this;
		if (this.map) {
			if (!n.data.about) { this.hideTip(); return; }
			this.tip.innerHTML = "<strong>" + escapeHtml(n.label) + "</strong><span>" + escapeHtml(n.data.about) + "</span>";
			this.tip.classList.add("visible");
			this.tipNode = n;
			this.placeTip(n);
			return;
		}
		var partners = Object.keys(n.neighbours).map(function (id) {
			var link = self.links.filter(function (l) { return (l.source === n && l.target.id === id) || (l.target === n && l.source.id === id); })[0];
			var other = link.source === n ? link.target : link.source;
			return { label: other.label, weight: link.weight };
		}).sort(function (a, b) { return b.weight - a.weight; });

		var html = "<strong>" + escapeHtml(n.label) + "</strong>";
		html += "<span>" + n.degree + (n.degree === 1 ? " connection" : " connections") + "</span>";
		if (partners.length) {
			html += "<span>Most often with: " + partners.slice(0, 4).map(function (p) {
				return escapeHtml(p.label) + (p.weight !== 1 ? " (" + p.weight + ")" : "");
			}).join(", ") + "</span>";
		}
		Object.keys(n.data).forEach(function (k) {
			if (HIDDEN_ATTRS.indexOf(k) > -1 || LABEL_KEYS.indexOf(k) > -1 || k === self.groupKey) return;
			html += "<span>" + escapeHtml(k) + ": " + escapeHtml(n.data[k]) + "</span>";
		});
		this.tip.innerHTML = html;
		this.tip.classList.add("visible");
		this.tipNode = n;
		this.placeTip(n);
	};

	Viewer.prototype.placeTip = function (n) {
		var scale = this.stage.clientWidth / this.width;
		var tw = this.tip.offsetWidth, th = this.tip.offsetHeight;
		var x = n.x * scale + n.r + 12, y = n.y * scale - th / 2;
		if (x + tw > this.stage.clientWidth - 4) x = n.x * scale - n.r - 12 - tw;
		y = Math.max(4, Math.min(this.stage.clientHeight - th - 4, y));
		this.tip.style.transform = "translate(" + Math.max(4, x) + "px," + y + "px)";
	};

	Viewer.prototype.hideTip = function () {
		this.tip.classList.remove("visible");
		this.tipNode = null;
	};

	function escapeHtml(value) {
		return String(value == null ? "" : value)
			.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;").replace(/'/g, "&#039;");
	}

	/* ---------- Boot ---------- */

	each(document.querySelectorAll(".network"), function (root) {
		var inline = root.querySelector('script[type="application/json"]');
		if (inline) {
			try { new Viewer(root, parseJSON(inline.textContent)); }
			catch (err) { console.error(err); root.innerHTML = '<p class="network-message">The network could not be loaded.</p>'; }
			return;
		}
		if (!root.getAttribute("data-src")) return;
		fetch(root.getAttribute("data-src"))
			.then(function (r) { if (!r.ok) throw new Error("Could not load " + root.getAttribute("data-src")); return r.text(); })
			.then(function (text) { new Viewer(root, parseGraphML(text)); })
			.catch(function (err) {
				console.error(err);
				root.innerHTML = '<p class="network-message">The network could not be loaded.</p>';
			});
	});
})();
