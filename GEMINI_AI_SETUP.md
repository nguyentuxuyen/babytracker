# 🤖 Hướng Dẫn Tích Hợp Google Gemini AI

## ✅ Đã hoàn thành:
- ✅ Cài đặt `@google/generative-ai` package
- ✅ Tạo `aiService.ts` với 2 functions:
  - `analyzeActivitiesWithAI()`: Phân tích hoạt động hàng ngày
  - `askBabyCareQuestion()`: Hỏi đáp về chăm sóc bé
- ✅ Tạo `AIAnalysisCard` component (UI đẹp với gradient)
- ✅ Fallback về rule-based nếu không có API key

---

## 🔑 Cách Lấy API Key MIỄN PHÍ:

### Bước 1: Truy cập Google AI Studio
👉 https://makersuite.google.com/app/apikey
hoặc
👉 https://aistudio.google.com/app/apikey

### Bước 2: Đăng nhập với Google Account

### Bước 3: Click "Create API Key"
- Chọn "Create API key in new project" (khuyên dùng)
- hoặc chọn project hiện có

### Bước 4: Copy API Key
- API key có dạng: `AIzaSy...` (39 ký tự)

### Bước 5: Thêm vào `.env.local`
```bash
REACT_APP_GEMINI_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

### Bước 6: Restart development server
```bash
npm start
```

---

## 📊 Free Tier Limits:
- ✅ **60 requests/minute**
- ✅ **1,500 requests/day**
- ✅ **Không cần thẻ tín dụng**
- ✅ **Không giới hạn số ngày sử dụng**

Với baby tracker app, **60 requests/phút là quá đủ** (1 user ~5-10 requests/ngày).

---

## 🚀 Cách Sử Dụng:

### 1. Trong StatsPage (ví dụ):

```tsx
import { AIAnalysisCard } from '../components/common/AIAnalysisCard';
import { generateDailySummary } from '../services/aiService';

// Trong component:
const dailySummary = useMemo(() => 
    generateDailySummary(activities), 
    [activities]
);

// Render:
<AIAnalysisCard 
    summary={dailySummary}
    babyAge={calculateAgeInMonths(baby.birthDate)}
    babyName={baby.name}
/>
```

### 2. Test nhanh:

```tsx
import { analyzeActivitiesWithAI } from './services/aiService';

const testSummary = {
    totalFeedings: 8,
    totalFeedingAmountMl: 600,
    totalDiapers: 6,
    wetDiapers: 4,
    dirtyDiapers: 2,
    totalSleepMinutes: 720 // 12 hours
};

const result = await analyzeActivitiesWithAI(testSummary, 2, 'Bé Tí');
console.log(result);
```

---

## 🎨 Features:

### 1. AI Analysis:
- ✅ Phân tích dữ liệu hàng ngày
- ✅ Gợi ý cụ thể bằng tiếng Việt
- ✅ Flags (ok, low_feedings, fever, etc.)
- ✅ Context-aware (tuổi bé, tên bé)

### 2. AI Q&A:
- ✅ Hỏi bất kỳ câu hỏi nào về chăm sóc bé
- ✅ Có context (tuổi + hoạt động gần đây)
- ✅ Trả lời ngắn gọn, thực tế

### 3. Smart Fallback:
- ✅ Tự động dùng rule-based nếu:
  - Không có API key
  - API lỗi
  - Rate limit exceeded

---

## 🔒 Bảo Mật:

### ✅ Đã làm:
- API key lưu trong `.env.local` (không commit lên Git)
- `.env.local` có trong `.gitignore`

### ⚠️ Lưu ý khi deploy:
1. **Vercel/Netlify**: Thêm environment variable trong dashboard
2. **Firebase Hosting**: Dùng Firebase Functions để ẩn API key

---

## 📱 Demo UI:

```
┌─────────────────────────────────────┐
│  ✨ AI Phân Tích    [Google Gemini] │
├─────────────────────────────────────┤
│  [🧠 Phân tích với AI]              │
│                                     │
│  🏷️ Bình thường  ⚠️ Ăn ít           │
│                                     │
│  ℹ️ Số lần cho ăn hôm nay khá...   │
│  ℹ️ Tổng giấc ngủ tốt, tiếp tục... │
│  ℹ️ Số tã thay bình thường...       │
│                                     │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
│                                     │
│  💬 Hỏi AI về chăm sóc bé           │
│  [Ví dụ: Bé ngủ ít có sao không?]  │
│  [Hỏi AI]                           │
│                                     │
│  ✅ Bé 2 tháng tuổi thường ngủ...   │
└─────────────────────────────────────┘
```

---

## 🧪 Testing:

### Không có API key:
- ✅ Fallback về rule-based analysis
- ✅ Console warning: "Gemini API key not configured"

### Có API key:
- ✅ Gọi Gemini API
- ✅ Parse JSON response
- ✅ Hiển thị suggestions + flags

### Rate limit:
- ✅ Catch error, fallback về rule-based

---

## 🎯 Next Steps (Optional):

### 1. Thêm vào StatsPage:
```tsx
// Add to StatsPageNewGlass.tsx
import { AIAnalysisCard } from '../components/common/AIAnalysisCard';

// Sau phần Daily Stats, thêm:
<AIAnalysisCard 
    summary={dailySummary}
    babyAge={babyAgeInMonths}
    babyName={baby?.name}
/>
```

### 2. Thêm AI button vào Activities:
```tsx
// Quick action: "Ask AI about today"
onClick={() => analyzeActivitiesWithAI(dailySummary)}
```

### 3. Tích hợp vào Wonder Weeks:
```tsx
// Hỏi AI về leap period
askBabyCareQuestion(
    `Bé đang trong tuần thần kỳ ${leapWeek}, nên chú ý gì?`,
    { babyAge, recentActivities }
)
```

---

## 📞 Support:

- **Google AI Studio**: https://ai.google.dev/
- **Gemini API Docs**: https://ai.google.dev/gemini-api/docs
- **Pricing**: https://ai.google.dev/pricing (Free tier rất hào phóng)

---

## ✨ Enjoy AI-Powered Baby Tracking! 🍼
