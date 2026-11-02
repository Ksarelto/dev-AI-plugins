document.addEventListener("DOMContentLoaded", () => {
  const blocks = [...document.querySelectorAll("[data-state]")];
  const panel = document.querySelector(".dev-panel");
  if (!panel || !blocks.length) return;
  const show = (name) => blocks.forEach((b) => { b.hidden = b.dataset.state !== name; });
  blocks.forEach((b) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = b.dataset.state;
    button.addEventListener("click", () => show(b.dataset.state));
    panel.append(button);
  });
  show(document.querySelector("main")?.dataset.initialState ?? blocks[0].dataset.state);
});
