import assert from "node:assert/strict";
import { rollSpellbook, TIERS } from "../scripts/rules.mjs";

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
