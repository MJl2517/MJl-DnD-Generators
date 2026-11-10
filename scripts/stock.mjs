import { defaultRarityForTier, GEM_TIERS, raritiesForTier, rollArmory, rollGems, TIER_ECONOMY, TIER_LABELS,
  weaponCategory } from "./rules.mjs";
import { gold, itemLink, previewStatus, tierOptions } from "./ui.mjs";

const ID = "mjl-dnd-generators";
const WEAPONS = { simple: "Простое оружие", martial: "Воинское оружие", magic: "Магическое оружие" };
const STOCK_PACKS = ["ag-fifthpendium.equipment", "fifthpendium.items"];
const INDEX_FIELDS = ["system.identifier", "system.type.value", "system.type.baseItem", "system.price.value",
  "system.price.denomination", "system.properties", "system.rarity", "system.source.rules", "system.source.book"];

async function readStock(kind) {
  const packs = STOCK_PACKS.map(id => game.packs.get(id)).filter(Boolean);
  const entries = await Promise.all(packs.map(async pack => {
    const index = await pack.getIndex({ fields: INDEX_FIELDS });
    return index.contents.flatMap(item => {
      const system = item.system;
      const book = system?.source?.book;
      if (!system?.type || system.source?.rules !== "2024" || !["PHB 2024", "DMG 2024"].includes(book)) return [];
      const { value, denomination } = system.price ?? {};
      const price = value / CONFIG.DND5E.currencies[denomination]?.conversion;
      if (!Number.isFinite(price) || price <= 0) return [];
      const category = kind === "gems" && item.type === "loot" && system.type.value === "gem" ? "gem"
        : kind === "armory" && item.type === "weapon" ? weaponCategory(system) : undefined;
      if (!category || (category === "gem" && !GEM_TIERS.some(values => values.includes(price)))) return [];
      // The DMG's mundane weapons are siege gear and optional modern or futuristic firearms.
      if ((category === "simple" || category === "martial") && book === "DMG 2024") return [];
      const identifier = system.identifier || item.name.toLowerCase().trim();
      const key = category === "gem" ? `${identifier}:${price}`
        : `${category}:${identifier}:${system.type.baseItem ?? ""}:${system.rarity ?? ""}`;
      return [{ key, uuid: item.uuid, category, rarity: system.rarity, price }];
    });
  }));
  const unique = new Map();
  for (const item of entries.flat()) {
    if (!unique.has(item.key)) unique.set(item.key, item);
  }
  if (!unique.size) throw new Error("Подключите компендиум Fifthpendium с подходящими предметами.");
  return [...unique.values()];
}

const numberField = (name, label, min, max, value) =>
  `<label>${label}<input type="number" name="${name}" min="${min}" max="${max}" value="${value}" required></label>`;

const rarityLabel = rarity => game.i18n.localize(CONFIG.DND5E.itemRarity[rarity] ?? rarity);

export function openGems() {
  return openStock({
    kind: "gems", title: "Самоцветы", subtitle: "Драгоценные камни из Руководства Мастера 2024", icon: "fa-gem",
    fields: `<label>Цена за камень<select name="value"></select></label>
      ${numberField("quantity", "Количество камней", 1, 100, 4)}`,
    setTier: (fields, tier) => fields.value.replaceChildren(new Option("Случайная по тиру", "0"),
      ...GEM_TIERS[tier - 1].map(value => new Option(gold(value), value))),
    roll: (pool, fields, tier) => rollGems(pool, tier, Number(fields.value.value), fields.quantity.valueAsNumber)
  });
}

export function openArmory() {
  return openStock({
    kind: "armory", title: "Ассортимент оружейной", subtitle: "Оружие из Книги игрока и Руководства Мастера 2024", icon: "fa-swords",
    fields: `<fieldset class="mjl-book-sources"><legend>Типы оружия</legend>
      ${Object.entries(WEAPONS).map(([name, label]) =>
        `<label><input type="checkbox" name="${name}" ${name === "magic" ? "" : "checked"}>${label}</label>`).join("")}
      </fieldset>
      <label class="mjl-stock-rarity">Максимальная редкость магического оружия<select name="rarity"></select></label>`,
    setTier: (fields, tier) => {
      fields.rarity.replaceChildren(...raritiesForTier(tier).map(rarity => new Option(rarityLabel(rarity), rarity)));
      fields.rarity.value = defaultRarityForTier(tier);
    },
    roll: (pool, fields, tier) => rollArmory(pool, tier, Object.keys(WEAPONS).filter(name => fields.namedItem(name).checked),
      fields.rarity.value, WEAPONS)
  });
}

function openStock({ kind, title, subtitle, icon, fields, setTier, roll }) {
  const dialogId = `${ID}-${kind}`;
  const existing = foundry.applications.instances.get(dialogId);
  if (existing) return existing.bringToFront();

  let stock;
  let busy = false;
  let saved = false;
  const initial = "Выберите параметры и сгенерируйте список.";
  const { DialogV2 } = foundry.applications.api;
  const dialog = new DialogV2({
    id: dialogId,
    classes: ["mjl-brand", ID, "mjl-stock"],
    window: { title: "MJl - DnD Generators", icon: `fa-solid ${icon}`, resizable: true },
    position: { width: 800 },
    form: { closeOnSubmit: false },
    content: `<header class="mjl-book-heading">
      <span class="mjl-book-glyph"><i class="fa-solid ${icon}" aria-hidden="true"></i></span>
      <div><h2>${title}</h2><p>${subtitle}</p></div></header>
      <div class="mjl-book-layout">
        <fieldset class="mjl-book-options" aria-label="Параметры генерации">
          <label>Тир партии<select name="tier">${tierOptions()}</select></label>${fields}
          <div class="mjl-stock-budget mjl-book-copy"></div></fieldset>
        <section class="mjl-book-result" aria-label="Результат генерации">
          <div class="mjl-book-preview">${previewStatus(initial, icon)}</div>
        </section>
      </div>`,
    buttons: [
      { action: "roll", label: "Сгенерировать", icon: "fa-solid fa-dice", default: true,
        callback: (_event, button) => run(button.form, generate) },
      { action: "save", label: "Создать предметы", icon: "fa-solid fa-box-archive", disabled: true,
        callback: (_event, button) => run(button.form, save) }
    ],
    submit: () => setTimeout(syncSave, 0)
  });

  function syncSave() {
    const button = dialog.element?.querySelector('[data-action="save"]');
    if (button) button.disabled = !stock || saved || busy;
  }

  async function run(form, action) {
    if (!game.user.isGM || busy) return;
    const settings = form.querySelector(".mjl-book-options");
    settings.disabled = busy = true;
    try {
      await action(form, form.querySelector(".mjl-book-preview"));
    } catch (error) {
      ui.notifications.error(error.message);
      if (!stock) form.querySelector(".mjl-book-preview").innerHTML = previewStatus(error.message, "fa-triangle-exclamation");
      console.error(ID, error);
    } finally {
      settings.disabled = busy = false;
      if (dialog.rendered) dialog.setPosition();
    }
  }

  async function generate(form, preview) {
    stock = undefined;
    saved = false;
    preview.innerHTML = previewStatus("Читаю компендиумы…", "fa-hourglass-half");
    const tier = Number(form.elements.tier.value);
    const rows = roll(await readStock(kind), form.elements, tier);
    const items = await Promise.all(rows.map(row => fromUuid(row.uuid)));
    if (items.some(item => !item)) throw new Error("Один из предметов не найден в компендиуме. Повторите генерацию.");
    const total = rows.reduce((sum, row) => sum + row.price * row.quantity, 0);
    const quantity = rows.reduce((sum, row) => sum + row.quantity, 0);
    preview.innerHTML = `<div class="mjl-book-price"><div><span>Общая стоимость</span><strong>${gold(total)}</strong></div>
      <small>Тир ${TIER_LABELS[tier - 1]} · Предметов: ${quantity}</small></div><div class="mjl-book-entries mjl-stock-list"></div>`;
    const list = preview.querySelector(".mjl-stock-list");
    rows.forEach((row, index) => {
      const details = row.category === "gem" ? `${row.quantity} шт. × ${gold(row.price)}`
        : [WEAPONS[row.category], row.category === "magic" ? rarityLabel(row.rarity) : null, gold(row.price)].filter(Boolean).join(" · ");
      list.append(itemLink(items[index], details, icon));
    });
    stock = rows.map((row, index) => ({ item: items[index], quantity: row.quantity }));
  }

  async function save(_form, preview) {
    if (!stock || saved) return;
    const data = stock.map(({ item, quantity }) => {
      const copy = game.items.fromCompendium(item, { clearFolder: true });
      copy.system.quantity = quantity;
      return copy;
    });
    const created = await Item.createDocuments(data);
    if (!created.length) throw new Error("Создание предметов отменено.");
    saved = true;
    const status = document.createElement("p");
    status.setAttribute("role", "status");
    status.className = "mjl-book-copy";
    status.textContent = `Создано карточек во вкладке «Предметы»: ${created.length} из ${data.length}.`;
    preview.append(status);
  }

  dialog.addEventListener("render", () => {
    const form = dialog.element.querySelector("form");
    const updateTier = () => {
      const tier = Number(form.elements.tier.value);
      const { startingGold, hoard } = TIER_ECONOMY[tier - 1];
      setTier(form.elements, tier);
      form.querySelector(".mjl-stock-budget").innerHTML = `<p>Денежная часть среднего клада: <strong>${gold(hoard)}</strong></p>
        <p>Стартовые деньги героя: ${startingGold ? `<strong>+${gold(startingGold)}</strong>` : "обычное снаряжение"}</p>`;
    };
    updateTier();
    form.addEventListener("change", event => {
      if (event.target === form.elements.tier) updateTier();
      if (!stock) return;
      stock = undefined;
      dialog.element.querySelector(".mjl-book-preview").innerHTML = previewStatus(initial, icon);
      syncSave();
      dialog.setPosition();
    });
  }, { once: true });
  return dialog.render({ force: true });
}
