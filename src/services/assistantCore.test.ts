import { parseAssistantCommand } from './assistantCore';
import { buildActivityDoc } from '../domain/activitySchema.mjs';

// 2026-10-09 14:20 local time
const now = new Date(2026, 9, 9, 14, 20);
const today = new Date(2026, 9, 9, 0, 0);

const parse = (text: string, selectedDate: Date = today) =>
  parseAssistantCommand(text, { selectedDate, babyId: 'baby-1', now });

describe('parseAssistantCommand', () => {
  it('parses diaper change commands locally', () => {
    const command = parse('đổi bỉm');

    expect(command.tool).toBe('create_activity');
    expect(command.params.activityType).toBe('diaper');
    expect(command.params.details).toMatchObject({ isUrine: true, isStool: false });
  });

  it('marks stool when the sentence says so', () => {
    expect(parse('thay tã bé đi ị').params.details).toMatchObject({ isStool: true, isUrine: false });
    expect(parse('おむつ うんち').params.details).toMatchObject({ isStool: true });
  });

  it('stores sleep length in details.duration', () => {
    const command = parse('bé ngủ 45 phút');

    expect(command.tool).toBe('create_activity');
    expect(command.params.activityType).toBe('sleep');
    expect(command.params.details.duration).toBe(45);
    expect(command.params.details.durationMinutes).toBeUndefined();
  });

  it('reads hours for sleep and puts the timestamp at wake-up', () => {
    const command = parse('ngủ lúc 12:00 2 tiếng');

    expect(command.params.details.duration).toBe(120);
    expect(new Date(command.params.timestamp)).toEqual(new Date(2026, 9, 9, 14, 0));
  });

  it('uses the current time when no time is named, not midnight of the selected day', () => {
    const command = parse('bú 120ml');

    expect(command.params.details.amount).toBe(120);
    expect(new Date(command.params.timestamp)).toEqual(new Date(2026, 9, 9, 14, 20));
  });

  it('keeps the selected past day but takes the current time of day', () => {
    const command = parse('bú 90ml', new Date(2026, 9, 7));

    expect(new Date(command.params.timestamp)).toEqual(new Date(2026, 9, 7, 14, 20));
  });

  it('puts a named time later than now on the previous day', () => {
    const command = parse('bú 100ml lúc 23:00');

    expect(new Date(command.params.timestamp)).toEqual(new Date(2026, 9, 8, 23, 0));
  });

  it('treats a volume in ml as feeding even when sleep is mentioned', () => {
    expect(parse('bú 120ml rồi ngủ').params.activityType).toBe('feeding');
  });

  it('does not match keywords inside other words', () => {
    expect(parse('sữa nguội').params.activityType).toBe('feeding');
  });

  it('understands basic Japanese commands', () => {
    expect(parse('ミルク 120ml').params.activityType).toBe('feeding');
    expect(parse('昼寝 30分').params.details.duration).toBe(30);
  });

  it('does not read "12.5" as a clock time', () => {
    expect(new Date(parse('bú 12.5ml').params.timestamp)).toEqual(new Date(2026, 9, 9, 14, 20));
  });

  it('produces params that pass the activity schema without undefined values', () => {
    ['bé ngủ', 'cho bú', 'đổi tã', 'bú 100ml lúc 9h'].forEach((text) => {
      const { params } = parse(text);
      const built = buildActivityDoc({
        babyId: params.babyId,
        type: params.activityType,
        timestamp: params.timestamp,
        details: params.details
      });
      expect(JSON.stringify(built.details)).not.toContain('undefined');
      Object.values(built.details).forEach((value) => expect(value).not.toBeUndefined());
    });
  });
});
