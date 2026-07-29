import { parseAssistantCommand } from './assistantCore';

describe('parseAssistantCommand', () => {
  it('parses diaper change commands locally', () => {
    const command = parseAssistantCommand('đổi bỉm');

    expect(command.tool).toBe('create_activity');
    expect(command.params.activityType).toBe('diaper');
  });

  it('parses sleep commands locally', () => {
    const command = parseAssistantCommand('bé ngủ 45 phút');

    expect(command.tool).toBe('create_activity');
    expect(command.params.activityType).toBe('sleep');
    expect(command.params.details.durationMinutes).toBe(45);
  });
});
