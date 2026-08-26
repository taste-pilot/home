// TastePilot site — theme control only. The page works fully without this script.
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
