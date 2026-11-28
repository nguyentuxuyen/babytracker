import { suggestJuiceFruits } from './juicePresets';

describe('suggestJuiceFruits', () => {
  it('puts recently drunk fruits first, then the defaults, without duplicates', () => {
    const activities = [
      { type: 'juice', timestamp: new Date(2026, 10, 27, 9), details: { fruit: 'Táo' } },
      { type: 'juice', timestamp: new Date(2026, 10, 28, 9), details: { fruit: ' Lê  ' } },
      { type: 'juice', timestamp: new Date(2026, 10, 26, 9), details: { fruit: '' } },
      { type: 'feeding', timestamp: new Date(2026, 10, 28, 10), details: { fruit: 'Sữa' } }
    ];
    expect(suggestJuiceFruits(activities, ['Cam', 'táo', 'Nho'])).toEqual(['Lê', 'Táo', 'Cam', 'Nho']);
  });

  it('keeps at most `count` fruits', () => {
    expect(suggestJuiceFruits([], ['A', 'B', 'C'], 2)).toEqual(['A', 'B']);
  });
});
