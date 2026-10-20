// Push payload text per UI language. The client stores its language on the subscription.
const MESSAGES = {
  ja: {
    reminderTitle: 'Baby Tracker リマインダー',
    reminderBody: '記録を更新する時間です 👶',
    testTitle: 'Baby Tracker',
    testBody: 'Baby Tracker からのテスト通知です 👶',
    // Push title with the reviewed day, e.g. 10/20(月).
    reviewTitle: (dd, mm, weekday) => `${mm}/${dd}(${weekday})のふりかえり 🌤️`,
    weekdays: ['日', '月', '火', '水', '木', '金', '土'],
    reviewLabels: { milk: 'ミルク', solids: '離乳食', sleep: '睡眠' },
    reviewStatus: { ok: '十分', low: '少なめ', high: '多め', notLogged: '記録なし' }
  },
  en: {
    reminderTitle: 'Baby Tracker Reminder',
    reminderBody: 'Time to update your baby\'s log 👶',
    testTitle: 'Baby Tracker',
    testBody: 'This is a test notification from Baby Tracker 👶',
    reviewTitle: (dd, mm, weekday) => `Review of ${weekday} ${dd}/${mm} 🌤️`,
    weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    reviewLabels: { milk: 'milk', solids: 'solids', sleep: 'sleep' },
    reviewStatus: { ok: 'enough', low: 'low', high: 'more than usual', notLogged: 'not logged' }
  },
  vi: {
    reminderTitle: 'Nhắc nhở Baby Tracker',
    reminderBody: 'Đến giờ cập nhật hoạt động cho bé 👶',
    testTitle: 'Baby Tracker',
    testBody: 'Đây là thông báo thử nghiệm từ Baby Tracker 👶',
    reviewTitle: (dd, mm, weekday) => `Đánh giá ${weekday}, ${dd}/${mm} 🌤️`,
    weekdays: ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'],
    reviewLabels: { milk: 'sữa', solids: 'ăn dặm', sleep: 'ngủ' },
    reviewStatus: { ok: 'đủ', low: 'thiếu', high: 'nhiều hơn thường lệ', notLogged: 'chưa ghi' }
  }
};

const DEFAULT_LANGUAGE = 'vi';

const normalizeLanguage = (value) => (Object.prototype.hasOwnProperty.call(MESSAGES, value) ? value : DEFAULT_LANGUAGE);

const pushMessages = (language) => MESSAGES[normalizeLanguage(language)];

// Title of the morning review push for a reviewed day "YYYY-MM-DD".
const reviewTitleFor = (language, day) => {
  const messages = pushMessages(language);
  const [year, month, date] = day.split('-').map(Number);
  const weekday = messages.weekdays[new Date(Date.UTC(year, month - 1, date)).getUTCDay()];
  return messages.reviewTitle(String(date).padStart(2, '0'), String(month).padStart(2, '0'), weekday);
};

module.exports = { normalizeLanguage, pushMessages, reviewTitleFor };
