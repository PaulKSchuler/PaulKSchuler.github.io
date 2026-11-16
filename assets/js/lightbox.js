/* Minimal photo lightbox: click a gallery tile, use arrow keys or buttons to browse, Esc to close. */
(function () {
	"use strict";

	var links = Array.prototype.slice.call(document.querySelectorAll(".gallery a"));
	if (!links.length) return;

	var box = document.createElement("div");
	box.className = "lightbox";
	box.setAttribute("role", "dialog");
	box.setAttribute("aria-modal", "true");
	box.setAttribute("aria-label", "Photo viewer");
	box.innerHTML =
		'<button class="lb-close" aria-label="Close">&times;</button>' +
		'<button class="lb-prev" aria-label="Previous photo">&lsaquo;</button>' +
		'<figure><img alt="" /><figcaption></figcaption></figure>' +
		'<button class="lb-next" aria-label="Next photo">&rsaquo;</button>';
	document.body.appendChild(box);

	var img = box.querySelector("img");
	var caption = box.querySelector("figcaption");
	var group = [];
	var index = 0;
	var opener = null;

	function show(i) {
		index = (i + group.length) % group.length;
		var link = group[index];
		img.src = link.href;
		img.alt = link.querySelector("img").alt;
		caption.textContent = link.getAttribute("data-caption") || "";
	}

	function open(link) {
		var name = link.getAttribute("data-gallery");
		group = links.filter(function (l) { return l.getAttribute("data-gallery") === name; });
		opener = link;
		show(group.indexOf(link));
		box.classList.add("open");
		document.body.style.overflow = "hidden";
		box.querySelector(".lb-close").focus();
	}

	function close() {
		box.classList.remove("open");
		img.removeAttribute("src");
		document.body.style.overflow = "";
		if (opener) opener.focus();
	}

	links.forEach(function (link) {
		link.addEventListener("click", function (e) {
			e.preventDefault();
			open(link);
		});
	});

	box.querySelector(".lb-close").addEventListener("click", close);
	box.querySelector(".lb-prev").addEventListener("click", function () { show(index - 1); });
	box.querySelector(".lb-next").addEventListener("click", function () { show(index + 1); });
	box.addEventListener("click", function (e) { if (e.target === box) close(); });

	document.addEventListener("keydown", function (e) {
		if (!box.classList.contains("open")) return;
		if (e.key === "Escape") close();
		else if (e.key === "ArrowLeft") show(index - 1);
		else if (e.key === "ArrowRight") show(index + 1);
	});
})();
