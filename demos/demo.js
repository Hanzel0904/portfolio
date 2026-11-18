document.querySelectorAll(".tabs button").forEach(function (button) {
  button.addEventListener("click", function () {
    var name = button.getAttribute("data-panel");
    document.querySelectorAll(".tabs button").forEach(function (item) {
      item.setAttribute("aria-selected", item === button ? "true" : "false");
    });
    document.querySelectorAll(".panel").forEach(function (panel) {
      panel.classList.toggle("active", panel.id === name);
    });
  });
});
