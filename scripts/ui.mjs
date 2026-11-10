import { TIERS, TIER_LABELS } from "./rules.mjs";

const formatNumber = new Intl.NumberFormat("ru-RU");

export const gold = value => `${formatNumber.format(value)} зм`;
export const tierOptions = () => TIERS.map(([min, max], i) =>
  `<option value="${i + 1}">${TIER_LABELS[i]} · уровни ${min}–${max}</option>`).join("");

export function itemLink(item, action, icon = "fa-book", appearance = item) {
  const link = item.toAnchor({ classes: ["mjl-book-link"], attrs: { href: "#", "aria-label": `${action} · ${appearance.name}` } });
  link.innerHTML = `<span class="mjl-book-cover" aria-hidden="true"><i class="fa-solid ${icon}"></i></span>
    <span class="mjl-book-link-text"><strong></strong><small></small></span>
    <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>`;
  link.querySelector("strong").textContent = appearance.name;
  link.querySelector("small").textContent = action;
  const cover = document.createElement("img");
  cover.alt = "";
  cover.addEventListener("error", () => cover.remove(), { once: true });
  cover.src = appearance.img;
  link.querySelector(".mjl-book-cover").append(cover);
  return link;
}

export function previewStatus(text, icon = "fa-book-open") {
  return `<p class="mjl-book-status" role="status"><i class="fa-solid ${icon}" aria-hidden="true"></i>
    <span>${foundry.utils.escapeHTML(text)}</span></p>`;
}
