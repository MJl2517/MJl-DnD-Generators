export const LIBRARY = /^(?:ag-)?fifthpendium(?:-|\.)/;
export const TIERS = [[1, 4], [5, 10], [11, 16], [17, 20]];
export const TIER_LABELS = ["I", "II", "III", "IV"];
// PHB 2024, Starting Equipment at Higher Levels; DMG 2024, Random Treasure Hoard (with errata).
export const TIER_ECONOMY = [
  { startingGold: 0, hoard: 500 }, { startingGold: 637.5, hoard: 4400 },
  { startingGold: 6375, hoard: 36000 }, { startingGold: 21375, hoard: 330000 }
];
// Keep up to three denominations at or below one tenth of a typical hoard per item.
const valueTiers = values => TIER_ECONOMY.map(({ hoard }) => values.filter(price => price * 10 <= hoard).slice(-3));
export const GEM_TIERS = valueTiers([10, 50, 100, 500, 1000, 5000]);
export const ART_TIERS = valueTiers([25, 250, 750, 2500, 7500]);
const TRADE_ANIMALS = new Set(["chicken", "cow", "goat", "ox", "pig", "sheep"]);

export function isTradeGood(item, inTradeFolder) {
  // DMG livestock share the same Loot subtype as other trade goods.
  return !TRADE_ANIMALS.has(item.system.identifier) &&
    (inTradeFolder || (item.type === "loot" && item.system.type?.value === "trade"));
}
export const WEAPON_RARITIES = ["common", "uncommon", "rare", "veryRare", "legendary"];
const MODIFIERS = new Set(["weapon-1", "weapon-2", "weapon-3", "silvered-weapon", "adamantine-weapon", "vicious-weapon"]);
const RARITY_VALUES = [100, 400, 4000, 40000, 200000];
export const WEAPON_BONUS_PROFILES = WEAPON_RARITIES.slice(1, 4).map((rarity, profileIndex) => ({
  rarity, profileIndex, price: RARITY_VALUES[profileIndex + 1], identifier: `weapon-${profileIndex + 1}`
}));
const RARITY_WEIGHTS = [[54, 37, 9, 0, 0], [30, 51, 17, 2, 0], [11, 23, 36, 23, 7], [0, 0, 20, 44, 36]];

export const raritiesForTier = tier => WEAPON_RARITIES.filter((_, index) => RARITY_WEIGHTS[tier - 1]?.[index]);

export function defaultRarityForTier(tier) {
  const { startingGold, hoard } = TIER_ECONOMY[tier - 1];
  const allowed = raritiesForTier(tier);
  return allowed.findLast(rarity => RARITY_VALUES[WEAPON_RARITIES.indexOf(rarity)] <= (startingGold || hoard)) ?? allowed[0];
}

export function weaponCategory({ type, rarity, properties, identifier }) {
  if (!type.baseItem && MODIFIERS.has(identifier) && WEAPON_RARITIES.includes(rarity)) return "modifier";
  if (!["simpleM", "simpleR", "martialM", "martialR"].includes(type.value)) return;
  if (rarity || properties?.includes("mgc")) {
    if (type.baseItem && WEAPON_RARITIES.includes(rarity)) return "magic";
    return;
  }
  return type.value.startsWith("simple") ? "simple" : "martial";
}

export function expandWeaponVariants(pool) {
  const bases = new Map();
  for (const row of pool) {
    if (row.custom || (row.category !== "simple" && row.category !== "martial")) continue;
    const key = row.baseItem || row.uuid;
    // A focus staff can share the quarterstaff base. Prefer the weapon's own PHB entry.
    if (!bases.has(key) || row.identifier?.replaceAll("-", "") === key) bases.set(key, row);
  }
  return pool.flatMap(row => {
    if (row.category !== "modifier") return [row];
    return [...bases.values()].filter(base => row.identifier !== "adamantine-weapon" || base.weaponType.endsWith("M")).map(base => ({
      category: "magic", rarity: row.rarity, uuid: base.uuid, modifierUuid: row.uuid, profileIndex: row.profileIndex,
      price: Math.round((row.price + base.price) * 100) / 100
    }));
  });
}

export function rollStock(pool, { tier, count, value = 0, bands }, random = Math.random) {
  const budget = TIER_ECONOMY[tier - 1]?.hoard / 10;
  const values = bands?.[tier - 1];
  if (!budget || (value !== 0 && !values?.includes(value)) || !Number.isInteger(count) || count < 1 || count > 100) {
    throw new Error("Выберите стоимость в пределах тира и укажите от 1 до 100 предметов.");
  }
  const eligible = pool.filter(entry => {
    if (value) return entry.price === value;
    if (!values || entry.custom) return entry.price <= budget;
    return values.includes(entry.price);
  });
  if (!eligible.length) throw new Error("В подключённых компендиумах нет предметов подходящей стоимости.");
  const available = values ? [...Map.groupBy(eligible, entry => entry.price).values()] : [eligible];
  const stock = new Map();
  for (let i = 0; i < count; i++) {
    const band = available[Math.floor(random() * available.length)];
    const entry = band[Math.floor(random() * band.length)];
    if (!stock.has(entry.uuid)) stock.set(entry.uuid, { ...entry, quantity: 0 });
    stock.get(entry.uuid).quantity++;
  }
  return [...stock.values()];
}

const MUNDANE_STOCK = { simple: 3, martial: 5 };

export function rollArmory(pool, tier, categories, rarity, labels, random = Math.random) {
  const allowed = raritiesForTier(tier);
  const limit = WEAPON_RARITIES.indexOf(rarity);
  if (!allowed.length || (categories.includes("magic") && !allowed.includes(rarity))) {
    throw new Error("Выберите тир и подходящий предел редкости.");
  }
  if (!categories.length) throw new Error("Отметьте хотя бы один тип оружия.");
  const weights = new Map(allowed.filter(rarity => WEAPON_RARITIES.indexOf(rarity) <= limit).map(rarity =>
    [rarity, RARITY_WEIGHTS[tier - 1][WEAPON_RARITIES.indexOf(rarity)]]));

  return categories.flatMap(category => {
    const available = pool.filter(entry => entry.category === category &&
      (category !== "magic" || weights.has(entry.rarity)));
    if (!available.length) throw new Error(`${labels[category]}: подходящих позиций в компендиуме нет.`);
    if (category !== "magic") return Array.from({ length: Math.min(MUNDANE_STOCK[category], available.length) }, () => ({
      ...available.splice(Math.floor(random() * available.length), 1)[0], quantity: 1
    }));

    const groups = Map.groupBy(available, entry => entry.rarity);
    const remaining = [...weights].filter(([rarity]) => groups.has(rarity));
    let roll = random() * remaining.reduce((sum, [, weight]) => sum + weight, 0);
    const [rarity] = remaining.find(([, weight]) => (roll -= weight) < 0);
    const group = groups.get(rarity);
    return [{ ...group[Math.floor(random() * group.length)], quantity: 1 }];
  });
}

export function rollSpellbook(pool, tier, wizardLevel, random = Math.random) {
  const range = TIERS[tier - 1];
  if (!range || !Number.isInteger(wizardLevel) || wizardLevel < range[0] || wizardLevel > range[1]) {
    throw new Error("Уровень волшебника должен соответствовать выбранному тиру.");
  }

  const byLevel = Array.from({ length: 10 }, () => []);
  const seen = new Set();
  for (const spell of pool) {
    if (!Number.isInteger(spell.level) || spell.level < 1 || spell.level > 9 || seen.has(spell.key)) continue;
    seen.add(spell.key);
    byLevel[spell.level].push(spell);
  }

  const spells = [];
  for (let level = 1; level <= wizardLevel; level++) {
    const maxRank = Math.min(9, Math.ceil(level / 2));
    const count = level === 1 ? 6 : 2;
    for (let i = 0; i < count; i++) {
      // Favor newly available spells, falling back to lower ranks when a rank runs out.
      const available = byLevel.slice(1, maxRank + 1).findLast(group => group.length);
      if (!available) throw new Error(`В библиотеках недостаточно заклинаний для книги волшебника ${wizardLevel}-го уровня.`);
      spells.push(available.splice(Math.floor(random() * available.length), 1)[0]);
    }
  }

  const ranks = spells.reduce((total, spell) => total + spell.level, 0);
  return { spells, contentsPrice: ranks * 10, copyCost: ranks * 50, copyHours: ranks * 2 };
}
