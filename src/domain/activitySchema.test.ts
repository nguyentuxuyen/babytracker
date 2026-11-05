import { buildActivityDoc, normalizeActivityRecord, ActivityValidationError, foodNamesOf, foodGramsOf } from './activitySchema.mjs';

const at = new Date(2026, 9, 9, 8, 30);

describe('buildActivityDoc', () => {
  it('drops unknown and duplicated fields and fills defaults', () => {
    const built = buildActivityDoc({
      babyId: 'u1',
      type: 'feeding',
      timestamp: at,
      details: { time: at, amount: '120', notes: ' ok ', foodType: 'milk', foodItem: '', isAllergic: false, foodPreference: 'normal', junk: 1 }
    });

    expect(built).toEqual({
      babyId: 'u1',
      type: 'feeding',
      timestamp: at,
      details: { foodType: 'milk', amount: 120, notes: 'ok' },
      schemaVersion: 1
    });
  });

  it('keeps solid-food fields only for solid food', () => {
    const built = buildActivityDoc({
      babyId: 'u1', type: 'feeding', timestamp: at,
      details: { foodType: 'solid', amount: 30, foodItem: 'Cháo', foodPreference: 'allergic' }
    });

    expect(built.details).toEqual({ foodType: 'solid', amount: 30, notes: '', foodItem: 'Cháo', foodItems: ['Cháo'], foodPreference: 'allergic', isAllergic: true });
  });

  it('keeps every dish of a meal with several foods', () => {
    const built = buildActivityDoc({
      babyId: 'u1', type: 'feeding', timestamp: at,
      details: { foodType: 'solid', amount: 50, foodItems: [' Cháo  bí ', 'Chuối', 'chuối', '', 'Sữa chua'] }
    });

    expect(built.details).toMatchObject({ foodItem: 'Cháo bí, Chuối, Sữa chua', foodItems: ['Cháo bí', 'Chuối', 'Sữa chua'] });
  });

  it('keeps grams per dish and makes the meal amount their total', () => {
    const built = buildActivityDoc({
      babyId: 'u1', type: 'feeding', timestamp: at,
      details: { foodType: 'solid', amount: 999, foodItems: ['Cơm', 'Chuối', 'cơm'], foodGrams: [50, '20', 10] }
    });

    expect(built.details).toMatchObject({ amount: 80, foodItems: ['Cơm', 'Chuối'], foodGrams: [60, 20] });
  });

  it('drops grams per dish when none were given or there is one dish', () => {
    const solid = (details: Record<string, unknown>) => buildActivityDoc({ babyId: 'u1', type: 'feeding', timestamp: at, details: { foodType: 'solid', ...details } }).details;
    expect(solid({ amount: 40, foodItems: ['Cơm', 'Chuối'], foodGrams: [0, 0] })).not.toHaveProperty('foodGrams');
    expect(solid({ amount: 40, foodItems: ['Cơm'], foodGrams: [30] })).toMatchObject({ amount: 40 });
    expect(solid({ amount: 40, foodItems: ['Cơm'], foodGrams: [30] })).not.toHaveProperty('foodGrams');
  });

  it('treats a meal with only foodItems as solid food', () => {
    const built = buildActivityDoc({ babyId: 'u1', type: 'feeding', timestamp: at, details: { foodItems: ['Bơ'] } });
    expect(built.details).toMatchObject({ foodType: 'solid', foodItems: ['Bơ'] });
  });

  it('keeps a known milk kind on milk feeds only', () => {
    const milk = (details: Record<string, unknown>) => buildActivityDoc({ babyId: 'u1', type: 'feeding', timestamp: at, details }).details;
    expect(milk({ foodType: 'milk', amount: 90, milkType: 'breast' })).toEqual({ foodType: 'milk', amount: 90, notes: '', milkType: 'breast' });
    expect(milk({ foodType: 'milk', amount: 90, milkType: 'goat' })).toEqual({ foodType: 'milk', amount: 90, notes: '' });
    expect(milk({ foodType: 'solid', amount: 30, foodItem: 'Cháo', milkType: 'formula' })).not.toHaveProperty('milkType');
  });

  it('never stores undefined', () => {
    const built = buildActivityDoc({ babyId: 'u1', type: 'sleep', timestamp: at.toISOString(), details: { durationMinutes: undefined } });

    expect(built.details).toEqual({ duration: 0, notes: '' });
    expect(built.timestamp).toEqual(at);
  });

  it('rejects unknown types, bad timestamps and absurd numbers', () => {
    expect(() => buildActivityDoc({ babyId: 'u1', type: 'party', timestamp: at })).toThrow(ActivityValidationError);
    expect(() => buildActivityDoc({ babyId: 'u1', type: 'memo', timestamp: 'not a date' })).toThrow(ActivityValidationError);
    expect(() => buildActivityDoc({ babyId: 'u1', type: 'feeding', timestamp: at, details: { amount: 99999 } })).toThrow(/amount/);
    expect(() => buildActivityDoc({ babyId: '', type: 'memo', timestamp: at })).toThrow(/babyId/);
  });

  it('only keeps stool details when there was stool', () => {
    expect(buildActivityDoc({ babyId: 'u1', type: 'diaper', timestamp: at, details: { isUrine: true, isStool: false, stoolColor: ['vàng'] } }).details)
      .toEqual({ isUrine: true, isStool: false, stoolColor: [], notes: '' });
  });
});

describe('foodGramsOf', () => {
  it('uses grams of weighed dishes and shares out the rest', () => {
    expect(foodGramsOf({ amount: 100, foodItems: ['Cơm', 'Chuối', 'Bơ'], foodGrams: [60, 0, 0] })).toEqual([
      { name: 'Cơm', grams: 60, estimated: false },
      { name: 'Chuối', grams: 20, estimated: true },
      { name: 'Bơ', grams: 20, estimated: true }
    ]);
    expect(foodGramsOf({ amount: 30, foodItem: 'Cháo' })).toEqual([{ name: 'Cháo', grams: 30, estimated: false }]);
  });
});

describe('foodNamesOf', () => {
  it('reads older single-food records', () => {
    expect(foodNamesOf({ foodItem: 'Cà rốt' })).toEqual(['Cà rốt']);
    expect(foodNamesOf({ foodItem: '' })).toEqual([]);
    expect(foodNamesOf(undefined)).toEqual([]);
  });
});

describe('normalizeActivityRecord (reading older documents)', () => {
  const firestoreTimestamp = { toDate: () => at };

  it('maps legacy Vietnamese type names and amount stored in time', () => {
    const activity = normalizeActivityRecord('a1', { type: 'sữa', timestamp: firestoreTimestamp, details: { time: 90 } }, 'u1');

    expect(activity).toMatchObject({ id: 'a1', babyId: 'u1', type: 'feeding', timestamp: at, details: { amount: 90, foodType: 'milk' } });
  });

  it('reads sleep written by the old assistant (durationMinutes)', () => {
    expect(normalizeActivityRecord('a2', { type: 'sleep', timestamp: firestoreTimestamp, details: { durationMinutes: 45 } })!.details.duration).toBe(45);
  });

  it('reads Siri notes stored as `note`', () => {
    expect(normalizeActivityRecord('a3', { type: 'feeding', timestamp: firestoreTimestamp, details: { amount: 100, note: 'siri' } })!.details.notes).toBe('siri');
  });

  it('infers diaper flags from old AI notes and converts legacy stool fields', () => {
    expect(normalizeActivityRecord('a4', { type: 'diaper', timestamp: firestoreTimestamp, details: { notes: 'thay tã bé đi ị' } })!.details)
      .toMatchObject({ isStool: true, isUrine: false });
    expect(normalizeActivityRecord('a5', { type: 'diaper', timestamp: firestoreTimestamp, details: { isUrine: false, isStool: true, stoolColor: 'yellow', stoolShape: 'watery' } })!.details)
      .toMatchObject({ stoolColor: ['vàng'], stoolConsistency: 'lỏng' });
  });

  it('falls back to details.time or createdAt when timestamp is missing, and skips records without any', () => {
    expect(normalizeActivityRecord('a6', { type: 'memo', details: { time: at.toISOString() } })!.timestamp).toEqual(at);
    expect(normalizeActivityRecord('a7', { type: 'memo', createdAt: { seconds: at.getTime() / 1000, nanoseconds: 0 } })!.timestamp).toEqual(at);
    expect(normalizeActivityRecord('a8', { type: 'memo' })).toBeNull();
  });
});
