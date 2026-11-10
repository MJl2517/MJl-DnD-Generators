import { rollSpellbook, TIERS } from "./rules.mjs";

const ID = "mjl-dnd-generators";
const DIALOG_ID = `${ID}-spellbook`;
const LIBRARY = /^(?:ag-)?fifthpendium(?:-|\.)/;
const BOOK_SOURCES = ["ag-fifthpendium.equipment", "fifthpendium.items"];
const BOOK_TYPES = new Map([
  ["ordinary", { identifier: "spellbook", label: "Обычная книга заклинаний" }],
  ["enduring", { identifier: "enduring-spellbook", label: "Вечная книга заклинаний" }]
]);
const SUPPLEMENTS = new Map([
  ["ag-fifthpendium-arcana-unleashed", "Arcana Unleashed"],
  ["ag-fifthpendium-forgotten-realms", "Forgotten Realms"],
  ["ag-fifthpendium-dndbeyond", "D&D Beyond"]
]);
const TIER_LABELS = ["I", "II", "III", "IV"];
const formatNumber = new Intl.NumberFormat("ru-RU");

Hooks.on("getSceneControlButtons", controls => {
  if (!game.user.isGM || game.system.id !== "dnd5e") return;
  controls[ID] = {
    name: ID,
    title: "Генераторы",
    icon: "fa-solid fa-dice-d20",
    order: 20,
    tools: {
      spellbook: {
        name: "spellbook",
        title: "Книга заклинаний волшебника",
        icon: "fa-solid fa-book-sparkles",
        order: 1,
        button: true,
        onChange: openSpellbook
      }
    }
  };
});

async function loadBase(kind) {
  const book = BOOK_TYPES.get(kind);
  if (!book) throw new Error("Выберите вид книги заклинаний.");
  for (const id of BOOK_SOURCES) {
    const pack = game.packs.get(id);
    if (!pack) continue;
    const index = await pack.getIndex({ fields: ["system.identifier"] });
    const entry = index.find(item => item.system?.identifier === book.identifier);
    if (entry) return pack.getDocument(entry._id);
  }
  throw new Error(`В подключённых библиотеках Fifthpendium не найден предмет «${book.label}».`);
}

async function loadSpellPool(excluded) {
  const allowed = pack => LIBRARY.test(pack.collection) && !excluded.has(pack.collection.split(".")[0]);
  const journals = game.packs.filter(pack => pack.documentName === "JournalEntry" && allowed(pack));
  const pages = await Promise.all(journals.map(async pack => {
    const index = await pack.getIndex({ fields: ["pages.type", "pages.system.type", "pages.system.identifier"] });
    const matches = await Promise.all(index.contents.map(async journal => {
      if (!journal.pages) return [];
      // Foundry can replace a nested page index with a partial object after loading the journal.
      const pages = Array.isArray(journal.pages) ? journal.pages : (await pack.getDocument(journal._id))?.pages.contents;
      return (pages ?? [])
        .filter(page => page.type === "spells" && page.system?.type === "class" && page.system.identifier === "wizard")
        .map(page => page.uuid ?? `${journal.uuid}.JournalEntryPage.${page._id}`);
    }));
    return matches.flat();
  }));
  const lists = await Promise.all(pages.flat().map(uuid => fromUuid(uuid)));
  const uuids = new Set(lists.filter(Boolean).flatMap(list => [
    ...list.system.spells, ...list.system.unlinkedSpells.map(spell => spell.source?.uuid)
  ]));

  const byPack = new Map();
  for (const uuid of uuids) {
    if (!uuid?.startsWith("Compendium.")) continue;
    const { collection, documentId } = foundry.utils.parseUuid(uuid);
    if (collection?.documentName !== "Item" || !allowed(collection)) continue;
    if (!byPack.has(collection)) byPack.set(collection, new Set());
    byPack.get(collection).add(documentId);
  }

  const spells = await Promise.all(Array.from(byPack, async ([pack, ids]) => {
    const index = await pack.getIndex({ fields: ["system.level", "system.identifier", "system.source.rules"] });
    return Array.from(ids, id => index.get(id)).filter(entry => entry?.type === "spell").map(entry => ({
      key: entry.system.identifier || entry.name.trim().toLowerCase(),
      uuid: entry.uuid,
      name: entry.name,
      level: entry.system.level,
      priority: (entry.system.source?.rules === "2024" ? 2 : 0) + Number(pack.collection.startsWith("ag-"))
    }));
  }));
  const pool = spells.flat().sort((a, b) => b.priority - a.priority);
  if (!pool.length) throw new Error("В подключённых библиотеках не найден список заклинаний волшебника.");
  return pool;
}

function spellContents(spells) {
  const groups = Map.groupBy(spells.toSorted((a, b) => a.level - b.level || a.name.localeCompare(b.name, "ru")), spell => spell.level);
  return Array.from(groups, ([level, group]) => `<h4>Круг ${level}</h4><ul>${group.map(spell =>
    `<li>@UUID[${spell.uuid}]</li>`).join("")}</ul>`).join("");
}

function openSpellbook() {
  const existing = foundry.applications.instances.get(DIALOG_ID);
  if (existing) return existing.bringToFront();

  const { DialogV2 } = foundry.applications.api;
  const gold = value => `${formatNumber.format(value)} зм`;
  let result;
  let saved = false;
  let busy = false;

  const dialog = new DialogV2({
    id: DIALOG_ID,
    classes: [ID],
    window: { title: "Книга заклинаний волшебника", icon: "fa-solid fa-book-sparkles", resizable: true },
    position: { width: 560 },
    form: { closeOnSubmit: false },
    content: `
      <p>Соберите трофейную книгу из заклинаний подключённых библиотек Fifthpendium.</p>
      <fieldset class="mjl-book-options">
      <div class="form-group"><label for="${ID}-tier">Тир партии</label><div class="form-fields">
        <select id="${ID}-tier" name="tier">${TIERS.map(([min, max], i) =>
          `<option value="${i + 1}">${TIER_LABELS[i]} · уровни ${min}–${max}</option>`).join("")}</select>
      </div></div>
      <div class="form-group"><label for="${ID}-level">Уровень волшебника</label><div class="form-fields">
        <select id="${ID}-level" name="level"></select>
      </div></div>
      <div class="form-group"><label for="${ID}-kind">Вид книги</label><div class="form-fields">
        <select id="${ID}-kind" name="kind">${Array.from(BOOK_TYPES, ([key, book]) =>
          `<option value="${key}">${book.label}</option>`).join("")}</select>
      </div></div>
      <fieldset class="mjl-book-sources"><legend>Дополнительные источники</legend>
        ${Array.from(SUPPLEMENTS, ([id, label]) => {
          const active = game.modules.get(id)?.active;
          return `<label><input type="checkbox" name="${id}" ${active ? "checked" : "disabled"}>
            ${label}${active ? "" : " (не подключено)"}</label>`;
        }).join("")}
      </fieldset>
      </fieldset>
      <div class="mjl-book-preview" aria-live="polite"><p>Выберите тир и уровень, затем сгенерируйте книгу.</p></div>`,
    buttons: [
      { action: "roll", label: "Сгенерировать", icon: "fa-solid fa-dice", default: true,
        callback: (_event, button) => generate(button.form) },
      { action: "save", label: "Создать предмет", icon: "fa-solid fa-box-archive", disabled: true,
        callback: (_event, button) => save(button.form) }
    ],
    // DialogV2 restores the previous button states after this callback.
    submit: () => setTimeout(syncSave, 0)
  });

  function syncSave() {
    const button = dialog.element?.querySelector('[data-action="save"]');
    if (button) button.disabled = !result || saved || busy;
  }

  async function generate(form) {
    if (busy) return;
    const preview = form.querySelector(".mjl-book-preview");
    const { tier, level, kind } = form.elements;
    const settings = form.querySelector(".mjl-book-options");
    const selectedTier = Number(tier.value);
    const wizardLevel = Number(level.value);
    settings.disabled = busy = true;
    result = undefined;
    saved = false;
    preview.textContent = "Читаю библиотеки и подбираю заклинания…";
    try {
      const base = await loadBase(kind.value);
      const excluded = new Set(Array.from(SUPPLEMENTS.keys()).filter(id => !form.elements.namedItem(id).checked));
      const pool = await loadSpellPool(excluded);
      const book = rollSpellbook(pool, selectedTier, wizardLevel);
      const { value, denomination } = base.system.price;
      const conversion = CONFIG.DND5E.currencies[denomination]?.conversion;
      if (!Number.isFinite(value) || !conversion) throw new Error("У исходной книги нет корректной цены.");
      const basePrice = value / conversion;
      const price = basePrice + book.contentsPrice;
      const contents = spellContents(book.spells);
      const editor = foundry.applications.ux.TextEditor.implementation;
      const html = await editor.enrichHTML(`<h3>@UUID[${base.uuid}]</h3>
        <p>Тир ${TIER_LABELS[selectedTier - 1]} · волшебник ${wizardLevel}-го уровня · заклинаний: ${book.spells.length}</p>
        <p><strong>Цена книги: ${gold(price)}</strong> (${gold(basePrice)} за книгу и ${gold(book.contentsPrice)} за записи).<br>
        Переписать все заклинания: ${gold(book.copyCost)} и ${formatNumber.format(book.copyHours)} ч.</p>${contents}`);
      preview.innerHTML = html;
      result = { base, price, contents, spells: book.spells, selectedTier, wizardLevel };
    } catch (error) {
      preview.textContent = error.message;
      console.error(ID, error);
    } finally {
      settings.disabled = busy = false;
      if (dialog.rendered) dialog.setPosition();
    }
  }

  async function save(form) {
    if (!game.user.isGM || !result || saved || busy) return;
    const { base, price, contents, spells, selectedTier, wizardLevel } = result;
    const settings = form.querySelector(".mjl-book-options");
    settings.disabled = busy = true;
    try {
      const data = game.items.fromCompendium(base, { clearFolder: true });
      data.name = `${base.name} · волшебник ${wizardLevel}-го уровня`;
      data.system.price = { value: price, denomination: "gp" };
      data.system.description.value += `<h3>Записи волшебника ${wizardLevel}-го уровня</h3>${contents}`;
      data.flags[ID] = { tier: selectedTier, wizardLevel, spells: spells.map(spell => spell.uuid) };
      const item = await Item.create(data);
      if (!item) throw new Error("Создание предмета отменено.");
      saved = true;
      ui.notifications.info("Книга добавлена во вкладку «Предметы».");
      item.sheet.render({ force: true });
    } catch (error) {
      ui.notifications.error(error.message);
      console.error(ID, error);
    } finally {
      settings.disabled = busy = false;
    }
  }

  dialog.addEventListener("render", () => {
    const form = dialog.element.querySelector("form");
    const { tier, level } = form.elements;
    const setLevels = () => {
      const [min, max] = TIERS[Number(tier.value) - 1];
      level.replaceChildren(...Array.from({ length: max - min + 1 }, (_, i) => new Option(min + i, min + i)));
    };
    const clearResult = () => {
      if (!result) return;
      result = undefined;
      form.querySelector(".mjl-book-preview").textContent = "Настройки изменились. Сгенерируйте новую книгу.";
      syncSave();
    };
    form.addEventListener("change", event => {
      if (event.target === tier) setLevels();
      clearResult();
    });
    setLevels();
  }, { once: true });
  return dialog.render({ force: true });
}
