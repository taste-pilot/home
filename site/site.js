// TastePilot site — theme control + demo switcher. The page works without JS
// (the iframe simply shows Modern Editorial and the buttons do nothing).
(function () {
  var iframe = document.getElementById("demo-iframe");
  var buttons = document.querySelectorAll("[data-demo-src]");
  if (iframe) {
    buttons.forEach(function (b) {
      b.addEventListener("click", function () {
        iframe.src = b.getAttribute("data-demo-src");
        buttons.forEach(function (other) {
          other.setAttribute("aria-pressed", String(other === b));
        });
      });
    });
  }
})();
(function () {
  var KEY = "tastepilot-theme";
  var root = document.documentElement;
  var buttons = document.querySelectorAll("[data-theme-choice]");

  function apply(choice) {
    if (choice === "light" || choice === "dark") {
      root.setAttribute("data-theme", choice);
    } else {
      choice = "auto";
      root.removeAttribute("data-theme");
    }
    buttons.forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-theme-choice") === choice));
    });
  }

  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) { /* private mode etc. */ }
  apply(saved);

  buttons.forEach(function (b) {
    b.addEventListener("click", function () {
      var choice = b.getAttribute("data-theme-choice");
      try { localStorage.setItem(KEY, choice); } catch (e) { /* ignore */ }
      apply(choice);
    });
  });
})();
