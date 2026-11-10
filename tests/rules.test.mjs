import assert from "node:assert/strict";
import { defaultRarityForTier, GEM_TIERS, rollArmory, rollGems, rollSpellbook, TIERS, weaponCategory,
  WEAPON_RARITIES } from "../scripts/rules.mjs";

const pool = Array.from({ length: 10 }, (_, level) =>
  Array.from({ length: 12 }, (_, index) => ({ key: `${level}-${index}`, level }))
).flat();

for (const [index, [min, max]] of TIERS.entries()) {
  for (let level = min; level <= max; level++) {
    const book = rollSpellbook([...pool, ...pool], index + 1, level, () => 0);
    assert.equal(book.spells.length, 6 + 2 * (level - 1));
    assert.equal(new Set(book.spells.map(spell => spell.key)).size, book.spells.length);
    assert(book.spells.every(spell => spell.level >= 1));
    assert.equal(Math.max(...book.spells.map(spell => spell.level)), Math.min(9, Math.ceil(level / 2)));
    assert.equal(book.contentsPrice, book.spells.reduce((sum, spell) => sum + spell.level * 10, 0));
    assert.equal(book.copyCost, book.contentsPrice * 5);
    assert.equal(book.copyHours, book.contentsPrice / 5);
  }
}

assert.equal(rollSpellbook(pool.filter(spell => spell.level === 1), 1, 3).spells.length, 10);
assert.throws(() => rollSpellbook([], 1, 1), /недостаточно/);
assert.throws(() => rollSpellbook(pool, 1, 5), /соответствовать/);

const gems = [10, 50, 100, 500, 1000, 5000].map(price => ({ uuid: `gem-${price}`, price }));
assert.deepEqual(GEM_TIERS, [[10, 50], [10, 50, 100], [100, 500, 1000], [500, 1000, 5000]]);
assert.deepEqual(rollGems(gems, 1, 50, 4, () => 0), [{ ...gems[1], quantity: 4 }]);
assert.equal(rollGems(gems, 4, 0, 1, () => 0.99)[0].price, 5000);
assert.throws(() => rollGems(gems, 1, 100, 1), /в пределах тира/);

const labels = { simple: "Простое", martial: "Воинское", magic: "Магическое" };
const weapons = [
  { uuid: "dagger", category: "simple" }, { uuid: "sword", category: "martial" },
  ...WEAPON_RARITIES.map(rarity => ({ uuid: rarity, category: "magic", rarity }))
];
assert.equal(weaponCategory({ type: { value: "simpleR" }, properties: [] }), "simple");
assert.equal(weaponCategory({ type: { value: "simpleM", baseItem: "dagger" }, rarity: "rare" }), "magic");
assert.equal(weaponCategory({ type: { value: "martialM" }, rarity: "rare" }), undefined);
assert.deepEqual([1, 2, 3, 4].map(defaultRarityForTier), ["uncommon", "uncommon", "rare", "rare"]);
const armory = rollArmory(weapons, 4, ["simple", "magic"], "legendary", labels, () => 0);
assert.deepEqual(armory.map(weapon => weapon.uuid), ["dagger", "rare"]);
assert.equal(rollArmory(weapons, 1, ["magic"], "rare", labels, () => 0.53)[0].rarity, "common");
assert.equal(rollArmory(weapons, 1, ["magic"], "rare", labels, () => 0.54)[0].rarity, "uncommon");
assert.throws(() => rollArmory(weapons, 4, ["magic"], "uncommon", labels), /предел редкости/);
assert.throws(() => rollArmory([], 1, ["magic"], "rare", labels), /подходящих позиций/);
assert.throws(() => rollArmory(weapons, 1, [], "rare", labels), /хотя бы один/);
