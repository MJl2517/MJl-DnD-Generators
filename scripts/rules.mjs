export const TIERS = [[1, 4], [5, 10], [11, 16], [17, 20]];

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
