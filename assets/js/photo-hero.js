/* Large photo at the top of the photography page. Picks a random photo from the
   galleries every few minutes (or when asked), crossfading between the two images. */
(function () {
	"use strict";
	var hero = document.querySelector(".photo-hero");
	if (!hero) return;
	var imgs = hero.querySelectorAll(".photo-hero-img");
	var caption = hero.querySelector(".photo-hero-caption");
	var button = hero.querySelector(".photo-hero-shuffle");
	var links = Array.prototype.slice.call(document.querySelectorAll(".gallery a"));
	if (links.length < 2) return;

	var INTERVAL = 3 * 60 * 1000;
	var current = links.findIndex(function (l) { return l.href === imgs[0].src; });
	var front = 0, timer, busy = false;

	function pick() {
		var i;
		do { i = Math.floor(Math.random() * links.length); } while (i === current);
		return i;
	}

	function show(i) {
		if (busy) return;
		busy = true;
		var link = links[i], back = imgs[1 - front], old = imgs[front];
		var loader = new Image();
		loader.onload = function () {
			back.src = link.href;
			back.alt = link.querySelector("img").alt;
			back.removeAttribute("aria-hidden");
			old.setAttribute("aria-hidden", "true");
			requestAnimationFrame(function () {
				back.classList.remove("next");
				old.classList.add("next");
			});
			caption.textContent = link.getAttribute("data-caption") || "";
			current = i; front = 1 - front; busy = false;
		};
		loader.onerror = function () { busy = false; };
		loader.src = link.href;
	}

	function schedule() {
		clearInterval(timer);
		if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
		timer = setInterval(function () { if (!document.hidden) show(pick()); }, INTERVAL);
	}

	button.addEventListener("click", function () { show(pick()); schedule(); });
	imgs.forEach(function (img) {
		img.addEventListener("click", function () { if (current > -1) links[current].click(); });
	});
	schedule();
})();
