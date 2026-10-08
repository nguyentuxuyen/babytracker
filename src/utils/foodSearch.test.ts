import { filterFoodItems, moveFoodItemToEnd } from './foodSearch';

describe('filterFoodItems', () => {
    const items = ['ニンジン', 'にんじん、トマト', 'cháo gà', 'Udon'];

    it('matches hiragana and katakana interchangeably', () => {
        expect(filterFoodItems(items, 'にんじん')).toEqual(['ニンジン', 'にんじん、トマト']);
        expect(filterFoodItems(items, 'トマト')).toEqual(['にんじん、トマト']);
        expect(filterFoodItems(items, 'とまと')).toEqual(['にんじん、トマト']);
    });

    it('ignores case and Vietnamese diacritics', () => {
        expect(filterFoodItems(items, 'chao ga')).toEqual(['cháo gà']);
        expect(filterFoodItems(items, 'UDON')).toEqual(['Udon']);
    });

    it('returns everything for an empty query', () => {
        expect(filterFoodItems(items, '  ')).toEqual(items);
    });
});

describe('moveFoodItemToEnd', () => {
    it('moves an existing item to the end and keeps its stored spelling', () => {
        expect(moveFoodItemToEnd(['Udon', 'cơm', 'phở'], 'udon')).toEqual(['cơm', 'phở', 'Udon']);
    });

    it('appends a new item', () => {
        expect(moveFoodItemToEnd(['cơm'], ' phở ')).toEqual(['cơm', 'phở']);
    });

    it('ignores an empty name', () => {
        expect(moveFoodItemToEnd(['cơm'], '  ')).toEqual(['cơm']);
    });
});
