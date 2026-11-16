/* Cycles the words in the home-page headline. Stays still for people who prefer reduced motion. */
(function () {
	"use strict";
	var el = document.querySelector(".rotator");
	if (!el || (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) return;
	var words = (el.getAttribute("data-words") || "").split("|").filter(Boolean);
	if (words.length < 2) return;
	var i = words.indexOf(el.textContent.trim());
	setInterval(function () {
		el.classList.add("swap");
		setTimeout(function () {
			i = (i + 1) % words.length;
			el.textContent = words[i];
			el.classList.remove("swap");
		}, 260);
	}, 2800);
})();
