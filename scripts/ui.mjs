import { TIERS, TIER_LABELS } from "./rules.mjs";

const formatNumber = new Intl.NumberFormat("ru-RU");

export const gold = value => `${formatNumber.format(value)} зм`;
export const tierOptions = () => TIERS.map(([min, max], i) =>
  `<option value="${i + 1}">${TIER_LABELS[i]} · уровни ${min}–${max}</option>`).join("");

export function itemButton(item, dragData = item.toDragData?.() ?? { type: "Item", uuid: item.uuid }) {
  const button = document.createElement("button");
  button.type = "button";
  button.draggable = true;
  button.textContent = item.name;
  button.addEventListener("click", async event => {
    event.stopPropagation();
    try {
      const sheet = item.sheet ?? (await fromUuid(item.uuid))?.sheet;
      if (!sheet) throw new Error("Карточка предмета недоступна.");
      await sheet.render({ force: true });
    } catch (error) {
      ui.notifications.error(`Не удалось открыть «${item.name}». ${error.message}`);
    }
  });
  button.addEventListener("dragstart", event => {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
  });
  return button;
}

export function itemCard(item, details, icon = "fa-book", dragData) {
  const button = itemButton(item, dragData);
  button.className = "mjl-book-card";
  button.innerHTML = `<span class="mjl-book-cover" aria-hidden="true"><i class="fa-solid ${icon}"></i></span>
    <span class="mjl-book-card-text"><strong></strong><small></small></span>
    <i class="fa-solid fa-up-right-and-down-left-from-center" aria-hidden="true"></i>`;
  button.querySelector("strong").textContent = item.name;
  button.querySelector("small").textContent = details;
  const cover = document.createElement("img");
  cover.alt = "";
  cover.draggable = false;
  cover.addEventListener("error", () => cover.remove(), { once: true });
  cover.src = item.img;
  button.querySelector(".mjl-book-cover").append(cover);
  return button;
}

export function previewStatus(text, icon = "fa-book-open") {
  return `<p class="mjl-book-status" role="status"><i class="fa-solid ${icon}" aria-hidden="true"></i>
    <span>${foundry.utils.escapeHTML(text)}</span></p>`;
}
