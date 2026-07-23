# BabyTracker — Project Reference

> Tài liệu này mô tả toàn bộ nghiệp vụ, kiến trúc và quy ước của dự án.  
> Đây là **nguồn sự thật duy nhất** để AI agent hoặc thành viên mới hiểu dự án mà không cần đọc thêm tài liệu khác.

---

## 1. Mục tiêu sản phẩm

Ứng dụng PWA (Progressive Web App) theo dõi hoạt động hằng ngày của trẻ sơ sinh, hướng đến phụ huynh người Nhật. Toàn bộ ngôn ngữ hiển thị trong UI là **tiếng Nhật**. Nội dung data ghi chú trong Firebase có thể chứa prefix tiếng Việt cũ (`Bắt đầu:`) — phải xử lý tương thích song song với prefix Nhật (`開始:`).

---

## 2. Tech Stack

| Tầng | Công nghệ |
|---|---|
| Frontend | React 18, TypeScript, Create React App |
| UI | Material UI (MUI) v5 |
| Routing | React Router v5 |
| Database | Firebase Firestore (client SDK) |
| Auth | Firebase Authentication (email/password) |
| Backend API | Vercel Serverless Functions (Node.js, `api/`) |
| Admin SDK | Firebase Admin (`api/_admin.js`) |
| Deploy | Vercel (`vercel.json`), alias `https://babytracker-lyart.vercel.app` |
| PWA | CRA service worker + Web Push (`api/push*`) |

---

## 3. Cấu trúc thư mục

```
src/
  App.tsx                      # Root: Header, Auth wrapper, Reminder logic
  index.tsx                    # Entry point
  routes/AppRouter.tsx         # Lazy-loaded route definitions
  contexts/
    AuthContext.tsx             # Firebase auth state
    BabyContext.tsx             # Baby data + activities global state
    DateContext.tsx             # Selected date for calendar navigation
  firebase/
    config.ts                  # Firebase client init
    auth.ts                    # Auth helpers (getCurrentUser)
    firestore.ts               # All Firestore read/write helpers
  pages/
    ActivitiesPageNew.tsx      # Trang chủ (/) + tab 最近の記録 (/recent-activities)
    BabyInfoPageNew.tsx        # Thông tin bé + chỉnh sửa hồ sơ
    StatsPageNewGlass.tsx      # Thống kê biểu đồ (成長)
    FoodHistoryPage.tsx        # Lịch sử đồ ăn dặm (食事)
    LoginPage.tsx              # Đăng nhập
    MilestonesPage.tsx         # Ẩn khỏi nav (route vẫn tồn tại)
    WonderWeeksPage.tsx        # Ẩn khỏi nav (route vẫn tồn tại)
  components/
    layout/BottomNav.tsx       # Bottom navigation (4 tab: ホーム/履歴/成長/食事)
    common/AssistantComposer.tsx  # AI assistant input box
    common/GrowthChart.tsx     # Biểu đồ tăng trưởng
    SleepTimerDisplay.tsx      # Timer đếm giấc ngủ real-time
    PrivateRoute.tsx           # HOC bảo vệ route cần login
  services/
    assistantCore.ts           # Parse câu lệnh tự nhiên → AssistantCommand
    assistantApi.ts            # Gọi /api/mcp hoặc fallback Firestore trực tiếp
  hooks/
    useActivities.ts
    useAuth.ts
    useDailyRating.ts
    useFirestore.ts
    useSleepTimer.ts
  utils/
    dailyStats.ts              # Tính thống kê theo ngày
    growthStandards.ts         # Chuẩn WHO cho biểu đồ tăng trưởng
    pushNotifications.ts       # Web Push subscribe/unsubscribe
    reminderSettings.ts        # Cài đặt nhắc nhở (localStorage)
  types/index.ts               # Kiểu dữ liệu chung (Baby, Activity...)
  theme/theme.ts               # MUI theme

api/
  _admin.js                    # Firebase Admin init (safe, không crash khi thiếu env)
  _auth.js                     # Verify Firebase ID token từ Bearer header
  mcp.js                       # AI assistant endpoint (POST /api/mcp)
  logMilk.js                   # Endpoint log sữa từ Siri Shortcut (POST /api/logMilk)
  pushSubscribe.js             # Đăng ký Web Push
  pushUnsubscribe.js           # Hủy đăng ký Web Push
  pushDispatchReminders.js     # Cron gửi nhắc nhở
  pushSendTest.js              # Test gửi push
```

---

## 4. Firebase Data Model

### `babies/{userId}`
```
{
  name: string,
  birthDate: Timestamp,
  dueDate: Timestamp | null,
  gender: 'male' | 'female',
  birthWeight: number,   // grams
  birthHeight: number,   // cm
  avatarUrl: string,
  mail: string           // email, dùng để backward-compat tìm theo email cũ
}
```

### `users/{userId}/activities/{activityId}`
```
{
  babyId: string,
  type: 'feeding' | 'sleep' | 'diaper' | 'bath' | 'measurement' | 'memo',
  timestamp: Timestamp,
  details: { ... },     // xem bảng dưới
  createdAt: Timestamp
}
```

#### Chi tiết `details` theo từng `type`

| type | fields |
|---|---|
| `feeding` | `amount` (ml, number), `foodType` ('milk'&#124;'solid'), `foodItem` (string), `foodPreference` ('enthusiastic'&#124;'normal'&#124;'dislike'&#124;'allergic'), `isAllergic` (bool), `notes` |
| `sleep` | `duration` (minutes, number), `notes` (chứa `開始: HH:MM:SS` hoặc `Bắt đầu: HH:MM:SS` — tương thích cả 2) |
| `diaper` | `isUrine` (bool), `isStool` (bool), `stoolColor` (array: 'vàng'&#124;'nâu'&#124;'xám'), `stoolConsistency` ('lỏng'&#124;'bình thường'&#124;'khô'), `notes` |
| `measurement` | `weight` (g), `height` (cm), `temperature` (°C), `notes` |
| `bath` | `notes` |
| `memo` | `notes` |

### `users/{userId}/ongoingSleep/{babyId}`
Giấc ngủ đang diễn ra (timer chạy background):
```
{ startTime: Timestamp, babyId: string }
```

### `users/{userId}/foodItems`
Danh sách tên món ăn dặm đã từng dùng, phục vụ Autocomplete.

### `users/{userId}/milestones/{babyId}`
Cột mốc phát triển, lưu trạng thái checked.

---

## 5. Luồng hoạt động chính

### 5.1 Log hoạt động thủ công
1. User bấm nút shortcut (Milk / Diaper / Sleep / Bath / Measurement / Memo) trên trang chủ.
2. Bottom sheet form mở, pre-fill `time` = giờ hiện tại.
3. User điền thông tin → submit.
4. `handleSubmit` tạo `timestamp = new Date(selectedDate).setHours(h, m)`.
5. Gọi `firestore.saveActivity(uid, activityData)`.
6. Nếu offline → đẩy vào `localStorage` queue, sync lại khi online.

### 5.2 Log hoạt động bằng AI (AssistantComposer)
1. User nhập câu tự nhiên (VD: `ミルク120ml 9:15`).
2. `parseAssistantCommand` (assistantCore.ts) parse → `AssistantCommand`.
   - Hỗ trợ nhiều dạng giờ: `9:15`, `9h15`, `9時15`, `9 giờ`, `9h`, `9時`, bare hour `21`.
   - Parse lượng ml: regex `(\d+)\s*ml`.
3. `executeAssistantCommand` (assistantApi.ts):
   - Trên localhost → gọi Firestore trực tiếp (fallback local).
   - Trên production → `POST /api/mcp` với Bearer token.
4. `/api/mcp` verify token → ghi Firestore bằng Admin SDK.

### 5.3 Log sữa từ Siri Shortcut
`POST /api/logMilk` với body `{ amountMl, babyId?, timestamp?, note? }`.  
Không cần auth token — dùng `SERVICE_ACCOUNT_USER_UID` env.

### 5.4 Sleep Timer
- Bấm **Sleep** → `firestore.startOngoingSleep(uid, babyId, startTime)`.
- Timer hiển thị trên nút bằng `SleepTimerDisplay`.
- Bấm lại → `firestore.stopOngoingSleep(uid, babyId)` → tự tính `duration`, tạo activity `sleep`.

### 5.5 Offline Queue
- `firestore.saveActivity` bắt lỗi network → `enqueueActivity` → `localStorage`.
- Khi app resume hoặc online → `syncPendingActivities` gửi lại.
- Event `offline-sync-complete` emit để UI reload.

---

## 6. Bottom Navigation

Thứ tự hiện tại (4 tab):

| Index | Label | Route |
|---|---|---|
| 0 | ホーム | `/` |
| 1 | 履歴 | `/recent-activities` |
| 2 | 成長 | `/statistics` |
| 3 | 食事 | `/food-history` |

> Route `/milestones` và `/wonder-weeks` **vẫn tồn tại** trong AppRouter nhưng không xuất hiện trong nav.

---

## 7. Trang chủ vs 最近の記録

Cả 2 tab đều dùng cùng component `ActivitiesPageNew.tsx`, phân biệt bằng:
```ts
const isRecentActivitiesTab = location.pathname === '/recent-activities';
```

- **Trang chủ** (`/`): Hiển thị AssistantComposer, Wake Window alert, quick action buttons, Summary.
- **最近の記録** (`/recent-activities`): Chỉ hiển thị date picker + timeline activities.

---

## 8. Quy ước ngôn ngữ UI

| Phạm vi | Ngôn ngữ |
|---|---|
| Tất cả text hiển thị cho người dùng | **Tiếng Nhật** |
| Code, comment, console.log | Tiếng Anh |
| Data notes cũ trong Firestore (`Bắt đầu:`) | Tương thích với prefix Nhật mới (`開始:`) |

---

## 9. Serverless API (`api/`)

### Biến môi trường bắt buộc trên Vercel

| Biến | Mô tả |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | JSON string của Firebase service account key |
| `FIREBASE_SERVICE_ACCOUNT_BASE64` | (thay thế) base64 của JSON trên |
| `SERVICE_ACCOUNT_USER_UID` | UID của user dùng cho logMilk endpoint |
| `DEFAULT_BABY_ID` | BabyId mặc định cho logMilk nếu không truyền |
| `VAPID_PUBLIC_KEY` | Web Push VAPID public key |
| `VAPID_PRIVATE_KEY` | Web Push VAPID private key |

### `POST /api/mcp`
- Auth: Bearer Firebase ID token (header `Authorization`).
- Body: `{ tool: string, params: object }`.
- Tools hỗ trợ: `create_activity`, `add_food_item`.
- Trả về JSON `{ success, tool, message, data }`.
- Nếu Firebase Admin chưa init → 500 với `code: FIREBASE_ADMIN_NOT_CONFIGURED`.

---

## 10. Các điểm kỹ thuật quan trọng

1. **Múi giờ**: Luôn dùng `new Date(selectedDate)` + `setHours(h, m, 0, 0)` để tạo timestamp. **Không dùng** `new Date('YYYY-MM-DD')` vì JS parse theo UTC gây lệch múi giờ.
2. **Firebase Admin an toàn**: `api/_admin.js` không throw ở module-load. Kiểm tra `if (!db)` trước khi dùng.
3. **Offline queue**: Activities được queue ở localStorage với key `offline-activity-queue:{userId}`. Auto-sync khi online.
4. **Sleep notes backward compat**: Regex parse start time phải bắt cả `Bắt đầu:` và `開始:`.
5. **PWA cache**: Sau deploy, user cần hard-refresh hoặc close/reopen PWA để nhận bundle mới.
6. **Build command**: `npm run build` (dùng `cross-env NODE_OPTIONS=--openssl-legacy-provider react-scripts build`).
7. **Deploy**: `npx vercel --prod --yes`.
