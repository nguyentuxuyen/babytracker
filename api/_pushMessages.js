// Push payload text per UI language. The client stores its language on the subscription.
const MESSAGES = {
  ja: {
    reminderTitle: 'Baby Tracker リマインダー',
    reminderBody: '記録を更新する時間です 👶',
    testTitle: 'Baby Tracker',
    testBody: 'Baby Tracker からのテスト通知です 👶',
    reviewTitle: '昨日のふりかえり 🌤️',
    reviewLabels: { milk: 'ミルク', solids: '離乳食', sleep: '睡眠' },
    reviewStatus: { ok: '十分', low: '少なめ', high: '多め', notLogged: '記録なし' }
  },
  en: {
    reminderTitle: 'Baby Tracker Reminder',
    reminderBody: 'Time to update your baby\'s log 👶',
    testTitle: 'Baby Tracker',
    testBody: 'This is a test notification from Baby Tracker 👶',
    reviewTitle: 'Yesterday in review 🌤️',
    reviewLabels: { milk: 'milk', solids: 'solids', sleep: 'sleep' },
    reviewStatus: { ok: 'enough', low: 'low', high: 'more than usual', notLogged: 'not logged' }
  },
  vi: {
    reminderTitle: 'Nhắc nhở Baby Tracker',
    reminderBody: 'Đến giờ cập nhật hoạt động cho bé 👶',
    testTitle: 'Baby Tracker',
    testBody: 'Đây là thông báo thử nghiệm từ Baby Tracker 👶',
    reviewTitle: 'Đánh giá ngày hôm qua 🌤️',
    reviewLabels: { milk: 'sữa', solids: 'ăn dặm', sleep: 'ngủ' },
    reviewStatus: { ok: 'đủ', low: 'thiếu', high: 'nhiều hơn thường lệ', notLogged: 'chưa ghi' }
  }
};

const DEFAULT_LANGUAGE = 'vi';

const normalizeLanguage = (value) => (Object.prototype.hasOwnProperty.call(MESSAGES, value) ? value : DEFAULT_LANGUAGE);

const pushMessages = (language) => MESSAGES[normalizeLanguage(language)];

module.exports = { normalizeLanguage, pushMessages };
