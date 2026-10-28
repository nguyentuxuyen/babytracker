import { fitWithin } from './imageCompress';

describe('fitWithin', () => {
    it('keeps small photos as they are', () => {
        expect(fitWithin(1200, 900, 1600)).toEqual({ width: 1200, height: 900 });
    });

    it('scales the longest side down to the limit and keeps the ratio', () => {
        expect(fitWithin(4032, 3024, 1600)).toEqual({ width: 1600, height: 1200 });
        expect(fitWithin(3024, 4032, 1600)).toEqual({ width: 1200, height: 1600 });
    });

    it('ignores empty sizes', () => {
        expect(fitWithin(0, 0, 1600)).toEqual({ width: 0, height: 0 });
    });
});
