const PAGES = [
  { id: 'catalogue', label: 'Catalogue', placeholder: true },
  { id: 'checkout-summary', label: 'Checkout', href: 'pages/checkout-summary.html' },
];
document.addEventListener("DOMContentLoaded", () => {
  const nav = document.querySelector("[data-nav]");
  if (!nav) return;
  const prefix = nav.dataset.nav === "page" ? "../" : "";
  for (const page of PAGES) {
    const item = document.createElement(page.placeholder ? "span" : "a");
    item.textContent = page.placeholder ? `${page.label} (not prototyped yet)` : page.label;
    if (!page.placeholder) item.href = prefix + page.href;
    nav.append(item);
  }
});
