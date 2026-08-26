// TastePilot publication runtime — tiny, framework-free, optional.
// The publication reads perfectly with JavaScript disabled.
(function () {
  "use strict";

  /* ----- Light / Dark / Auto ----- */
  var KEY = "tastepilot-theme";
  var root = document.documentElement;
  var control = document.querySelector(".theme-control");
  if (control) {
    var buttons = control.querySelectorAll("[data-theme-choice]");
    var apply = function (choice) {
      if (choice === "light" || choice === "dark") {
        root.setAttribute("data-theme", choice);
      } else {
        choice = "auto";
        root.removeAttribute("data-theme");
      }
      buttons.forEach(function (b) {
        b.setAttribute(
          "aria-pressed",
          String(b.getAttribute("data-theme-choice") === choice),
        );
      });
    };
    var saved = null;
    try { saved = localStorage.getItem(KEY); } catch (e) { /* private mode */ }
    apply(saved);
    buttons.forEach(function (b) {
      b.addEventListener("click", function () {
        var choice = b.getAttribute("data-theme-choice");
        try { localStorage.setItem(KEY, choice); } catch (e) { /* ignore */ }
        apply(choice);
      });
    });
    control.hidden = false;
  }

  /* ----- Motion reveals (gentle/editorial) ----- */
  // Rules: never touch native scrolling; body text stays stable; respect
  // prefers-reduced-motion; without JS or IO support everything is visible.
  var motion = root.getAttribute("data-motion") || "none";
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (motion !== "none" && !reduced && "IntersectionObserver" in window) {
    var selector = motion === "gentle"
      ? ".art, .image, .statistic--oversized, .statistic--panel"
      : ".art, .image, .statistic, .pull-quote, .section-heading";
    var targets = document.querySelectorAll(selector);
    targets.forEach(function (el) { el.classList.add("motion-hidden"); });
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          // Reveal when entering the viewport — and also when fast scrolling
          // has jumped past an element: content must never stay invisible.
          var passed = entry.boundingClientRect.bottom < 0;
          if (entry.isIntersecting || passed) {
            entry.target.classList.add("motion-revealed");
            entry.target.classList.remove("motion-hidden");
            observer.unobserve(entry.target);
          }
        });
      },
      // The huge top margin makes anything already scrolled past count as
      // intersecting, so an instant scroll jump can never strand hidden
      // content above the viewport.
      { rootMargin: "20000px 0px -8% 0px" },
    );
    targets.forEach(function (el) { observer.observe(el); });
  }
})();
