/*
	A slow constellation behind the page: drifting points that link up when
	they come close, and lean gently towards the cursor. Pauses when the tab
	is hidden and stays still when the visitor prefers reduced motion.
*/
(function () {
	"use strict";

	var canvas = document.getElementById("constellation");
	if (!canvas) return;
	var ctx = canvas.getContext("2d");
	var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

	var W, H, dpr, points = [], mouse = { x: -1e4, y: -1e4 };
	var LINK = 120, SPEED = 0.18;

	function resize() {
		dpr = Math.min(window.devicePixelRatio || 1, 2);
		W = canvas.clientWidth; H = canvas.clientHeight;
		canvas.width = W * dpr; canvas.height = H * dpr;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		var target = Math.round(Math.min(110, Math.max(35, (W * H) / 16000)));
		while (points.length < target) points.push(make(true));
		points.length = target;
		if (reduced) draw();
	}

	function make(anywhere) {
		var a = Math.random() * Math.PI * 2;
		return {
			x: Math.random() * W, y: anywhere ? Math.random() * H : (Math.random() < 0.5 ? -5 : H + 5),
			vx: Math.cos(a) * SPEED, vy: Math.sin(a) * SPEED,
			r: 1 + Math.random() * 1.6
		};
	}

	function step() {
		for (var i = 0; i < points.length; i++) {
			var p = points[i];
			var dx = mouse.x - p.x, dy = mouse.y - p.y, d2 = dx * dx + dy * dy;
			if (d2 < 220 * 220 && d2 > 1) {
				var f = 0.012 / Math.sqrt(d2);
				p.vx += dx * f; p.vy += dy * f;
			}
			var sp = Math.hypot(p.vx, p.vy);
			if (sp > SPEED * 2.5) { p.vx *= 0.96; p.vy *= 0.96; }
			p.x += p.vx; p.y += p.vy;
			if (p.x < -10) p.x = W + 10; else if (p.x > W + 10) p.x = -10;
			if (p.y < -10) p.y = H + 10; else if (p.y > H + 10) p.y = -10;
		}
	}

	function draw() {
		ctx.clearRect(0, 0, W, H);
		var ink = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() || "#ece8e1";
		ctx.strokeStyle = ink;
		ctx.fillStyle = ink;
		for (var i = 0; i < points.length; i++) {
			var a = points[i];
			for (var j = i + 1; j < points.length; j++) {
				var b = points[j];
				var dx = a.x - b.x, dy = a.y - b.y;
				if (Math.abs(dx) > LINK || Math.abs(dy) > LINK) continue;
				var d = Math.sqrt(dx * dx + dy * dy);
				if (d > LINK) continue;
				ctx.globalAlpha = 0.13 * (1 - d / LINK);
				ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
			}
		}
		ctx.globalAlpha = 0.35;
		for (i = 0; i < points.length; i++) {
			ctx.beginPath(); ctx.arc(points[i].x, points[i].y, points[i].r, 0, Math.PI * 2); ctx.fill();
		}
		ctx.globalAlpha = 1;
	}

	var running = false;
	function loop() {
		if (document.hidden) { running = false; return; }
		step(); draw();
		requestAnimationFrame(loop);
	}
	function start() { if (!running && !reduced) { running = true; requestAnimationFrame(loop); } }

	window.addEventListener("resize", resize);
	window.addEventListener("pointermove", function (e) { mouse.x = e.clientX; mouse.y = e.clientY; }, { passive: true });
	window.addEventListener("pointerleave", function () { mouse.x = -1e4; mouse.y = -1e4; });
	document.addEventListener("visibilitychange", start);

	resize();
	start();
})();
