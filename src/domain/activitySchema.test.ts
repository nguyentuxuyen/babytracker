import { buildActivityDoc, normalizeActivityRecord, ActivityValidationError } from './activitySchema.mjs';

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

    expect(built.details).toEqual({ foodType: 'solid', amount: 30, notes: '', foodItem: 'Cháo', foodPreference: 'allergic', isAllergic: true });
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
