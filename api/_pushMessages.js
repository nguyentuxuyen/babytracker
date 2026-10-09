// Push payload text per UI language. The client stores its language on the subscription.
const MESSAGES = {
  ja: {
    reminderTitle: 'Baby Tracker リマインダー',
    reminderBody: '記録を更新する時間です 👶',
    testTitle: 'Baby Tracker',
    testBody: 'Baby Tracker からのテスト通知です 👶'
  },
  en: {
    reminderTitle: 'Baby Tracker Reminder',
    reminderBody: 'Time to update your baby\'s log 👶',
    testTitle: 'Baby Tracker',
    testBody: 'This is a test notification from Baby Tracker 👶'
  },
  vi: {
    reminderTitle: 'Nhắc nhở Baby Tracker',
    reminderBody: 'Đến giờ cập nhật hoạt động cho bé 👶',
    testTitle: 'Baby Tracker',
    testBody: 'Đây là thông báo thử nghiệm từ Baby Tracker 👶'
  }
};

const DEFAULT_LANGUAGE = 'vi';

const normalizeLanguage = (value) => (Object.prototype.hasOwnProperty.call(MESSAGES, value) ? value : DEFAULT_LANGUAGE);

const pushMessages = (language) => MESSAGES[normalizeLanguage(language)];

module.exports = { normalizeLanguage, pushMessages };
