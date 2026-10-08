// Search key that ignores case, hiragana/katakana and Vietnamese diacritics.
export const toFoodSearchKey = (value: string): string =>
    value
        .trim()
        .toLocaleLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/đ/g, 'd')
        .replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));

export const filterFoodItems = (items: string[], query: string): string[] => {
    const key = toFoodSearchKey(query);
    if (!key) return items;
    return items.filter((item) => toFoodSearchKey(item).includes(key));
};

// Moves `name` to the end of the stored menu, keeping the spelling already stored.
// The menu is stored oldest-used first; readers reverse it to show recent items first.
export const moveFoodItemToEnd = (items: string[], name: string): string[] => {
    const trimmed = name.trim();
    if (!trimmed) return items;
    const key = trimmed.toLocaleLowerCase();
    const stored = items.find((item) => item.toLocaleLowerCase() === key) || trimmed;
    return [...items.filter((item) => item.toLocaleLowerCase() !== key), stored];
};
