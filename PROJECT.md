# BabyTracker — Project Reference

> Mô tả nghiệp vụ, kiến trúc và quy ước của dự án. Đọc file này trước, **không cần đọc lại toàn bộ code**.
> Danh sách lỗi / điểm chưa tốt đã biết: xem [REVIEW.md](REVIEW.md).
> Cập nhật lần cuối: 2026-10-08 (đối chiếu với code ở commit `41a7a06`).

---

## 1. Mục tiêu sản phẩm

PWA theo dõi hoạt động hằng ngày của trẻ sơ sinh (bú sữa, ăn dặm, ngủ, tã, tắm, số đo, ghi chú). UI hiển thị **tiếng Nhật**. Mỗi tài khoản có **đúng 1 bé** (`babies/{uid}`, `baby.id === uid`).

Dữ liệu cũ có thể chứa tiếng Việt (prefix `Bắt đầu:` trong notes giấc ngủ, giá trị `stoolColor`/`stoolConsistency`, `type` kiểu `'thay tã'`) — code phải tương thích song song.

---

## 2. Tech Stack

| Tầng | Công nghệ |
|---|---|
| Frontend | **React 17**, TypeScript 4, Create React App (`react-scripts` 4.0.3) |
| UI | MUI v5, icon `lucide-react` (bọc trong `components/common/icons.tsx`), `recharts` |
| Routing | React Router v5 |
| Database | Firestore client SDK v9, bật `enableMultiTabIndexedDbPersistence` |
| Auth | Firebase Auth: email/password **và Google popup** (không có UI đăng ký email) |
| Backend | Vercel Serverless Functions (`api/*.js`, CommonJS) + Firebase Admin |
| AI | Gemini REST (`api/gemini.js`, model `gemini-3.1-flash-lite`) |
| PWA | Workbox service worker (`src/service-worker.ts`) + Web Push (`web-push`) |
| Deploy | Vercel, alias `https://babytracker-lyart.vercel.app` |

Lệnh: `npm run dev` (web), `npm run dev:vercel` (web + api), `npm run build`, `CI=true npx react-scripts test --watchAll=false`.
Deploy: project Vercel đã nối với GitHub `nguyentuxuyen/babytracker` (từ 2026-10-09) — push/merge vào `main` tự deploy production, push nhánh khác tạo preview. Deploy tay vẫn dùng được: `npx vercel --prod --yes`.
Build cần `NODE_OPTIONS=--openssl-legacy-provider` (đã nằm trong script).

---

## 3. Cấu trúc thư mục (file đang dùng thật)

```
src/
  index.tsx                  # ThemeProvider(styles/m3-theme) + đăng ký service worker
  App.tsx                    # Providers, Header (menu tài khoản, changelog), offline sync, reminder/push
  routes/AppRouter.tsx       # Route lazy + BottomNav
  contexts/
    AuthContext.tsx          # currentUser, login/logout
    BabyContext.tsx          # baby + activities CỦA 1 NGÀY (refreshActivities(date))
    DateContext.tsx          # selectedDate dùng chung Home/Timeline
  firebase/
    config.ts                # init app, db, auth
    auth.ts                  # login/register/logout helpers (thông báo lỗi tiếng Việt)
    firestore.ts             # TẤT CẢ đọc/ghi Firestore + offline queue localStorage
  pages/
    ActivitiesPageNew.tsx    # Home (/ và /activities): quick actions, sleep timer, form nhập, dialog AI
    TimelinePage.tsx         # 記録 (/timeline): danh sách theo ngày, summary 2 ngày, sửa/xoá
    StatsPageNewGlass.tsx    # 分析 (/statistics): biểu đồ + GrowthChart (WHO)
    FoodHistoryPage.tsx      # 食事 (/food-history): lịch sử ăn dặm
    BabyInfoPageNew.tsx      # Hồ sơ bé + quản lý food menu (mở từ menu Header, không qua route)
    LoginPage.tsx            # /login
    MilestonesPage.tsx, WonderWeeksPage.tsx   # route còn, không có trong nav
  components/
    layout/BottomNav.tsx     # 5 mục
    common/AssistantComposer.tsx   # ô nhập AI + voice (ja-JP)
    common/RecentDaysStrip.tsx     # dải 4 ngày gần nhất
    common/GrowthChart.tsx, LineChart.tsx, icons.tsx
    PrivateRoute.tsx
  services/
    assistantCore.ts         # parser regex cục bộ (từ khoá TIẾNG VIỆT) → AssistantCommand
    assistantApi.ts          # quyết định local hay gọi /api/mcp
  hooks/useAuth.ts           # listener auth riêng (trùng với AuthContext) — pages đang dùng cái này
  hooks/useSleepTimer.ts     # đọc ongoingSleep + đếm giây
  utils/  dailyStats.ts, growthStandards.ts, pushNotifications.ts, reminderSettings.ts, changelog.ts
  config/changelogSeed.json  # changelog fallback khi Firestore không có
  theme/theme.ts             # theme dùng trong App.tsx (lồng trong m3-theme)

api/
  _admin.js   # init Firebase Admin, không throw khi thiếu env → kiểm tra `if (!db)`
  _auth.js    # verify Bearer Firebase ID token
  _push.js    # cấu hình VAPID
  gemini.js   # text → { tool, params, preview }
  mcp.js      # POST: { text, selectedDate, babyId } (Gemini) hoặc { tool, params } (legacy)
  logMilk.js  # POST từ Siri Shortcut, auth bằng header x-log-secret
  pushSubscribe.js / pushUnsubscribe.js / pushSendTest.js   # cần Bearer token
  pushDispatchReminders.js   # cron gửi nhắc, auth bằng x-reminder-secret

scripts/      # syncChangelogToFirebase.js, parse_milk_shortcut.js, tài liệu Siri
```

---

## 4. Firestore Data Model

| Path | Nội dung |
|---|---|
| `babies/{uid}` | `name, birthDate, dueDate, gender('male'\|'female'), birthWeight(g), birthHeight(cm), avatarUrl, mail, foodMenu: string[], createdAt, updatedAt` |
| `users/{uid}/activities/{id}` | `babyId, type, timestamp, details, createdAt` |
| `users/{uid}/ongoingSleep/{babyId}` | `startTime, createdAt` — giấc ngủ đang chạy |
| `users/{uid}/pushSubscriptions/{subId}` | `uid, endpoint, keys, enabled, intervalMinutes, lastSentAt, createdAt, updatedAt` |
| `users/{uid}/milestones/data` **và** `users/{uid}/babies/{babyId}/milestones/data` | trạng thái cột mốc (ghi cả 2 nơi, đọc 3 nơi) |
| `app_meta/changelog/meta/current`, `app_meta/changelog/releases/*` | version + changelog (sync bằng `npm run changelog:sync`) |

Lưu ý: **document `users/{uid}` không được code nào tạo ra**, chỉ có subcollection.
Danh sách món ăn dặm nằm ở `babies/{uid}.foodMenu` (không phải collection `foodItems`).

### `details` theo `type`

| type | fields thực tế |
|---|---|
| `feeding` | `amount` (ml hoặc g), `foodType` ('milk'\|'solid'), `foodItem`, `foodPreference` ('enthusiastic'\|'normal'\|'dislike'\|'allergic'), `isAllergic`, `notes`, `time` (thừa) |
| `sleep` | `duration` (phút), `notes` chứa `開始: HH:MM:SS` (hoặc `Bắt đầu:`), `time` (thừa). **`timestamp` = giờ KẾT THÚC** |
| `diaper` | `isUrine`, `isStool`, `stoolColor` (mảng 'vàng'\|'nâu'\|'xám'), `stoolConsistency` ('lỏng'\|'bình thường'\|'khô'), `notes` |
| `measurement` | `weight` (g), `height` (cm), `temperature` (°C), `notes` |
| `bath`, `memo` | `notes` |

`src/types/index.ts` **không khớp** bảng này (thiếu foodType…, stool dùng giá trị tiếng Anh, có `dailyRating` không còn dùng) — các page tự khai báo kiểu riêng và ép `any`.

---

## 5. Luồng nghiệp vụ

### 5.1 Ghi thủ công (Home)
Quick action → bottom sheet → `handleSubmit` (ActivitiesPageNew): `timestamp = new Date(selectedDate)` + `setHours(h, m)` → `firestore.saveActivity`. Có "bulk mode" nhập nhiều giờ cho cùng một loại.

### 5.2 Ghi bằng AI
Nút ＋ ở BottomNav → `/?add=1` → dialog `AssistantComposer` (gõ hoặc voice ja-JP).
1. `parseAssistantCommand` (regex, từ khoá tiếng Việt + `ml`) → `tool`.
2. `executeAssistantCommand`: nếu **localhost HOẶC parser cục bộ hiểu được** → ghi Firestore trực tiếp từ client. Chỉ khi `tool === 'unknown'` trên production mới `POST /api/mcp` `{ text, selectedDate, babyId }` → Gemini → Admin SDK ghi.
3. Tools: `create_activity`, `add_food_item`.

### 5.3 Siri Shortcut
`POST /api/logMilk` body `{ amountMl, babyId?, timestamp?, note? }`, header `x-log-secret` = `LOG_SECRET`. Ghi vào user `SERVICE_ACCOUNT_USER_UID`.

### 5.4 Sleep timer
Bắt đầu → `startOngoingSleep`. Dừng → tính `duration`, lưu activity `sleep` (timestamp = lúc dừng) song song với `clearOngoingSleep`; lỗi thì khôi phục timer. Timeline cho sửa giờ bắt đầu/kết thúc (`updateActivity`).

### 5.5 Cảnh báo wake window (Home, chỉ hôm nay)
Từ giấc ngủ gần nhất trong ngày: ≥2h "sắp đến giờ ngủ", ≥2.5h "dễ quá giấc".

### 5.6 Offline
- Firestore IndexedDB persistence bật.
- Thêm một hàng đợi riêng ở `localStorage` key `offline-activity-queue:{uid}`: `saveActivity` lỗi mạng → enqueue (id `offline-…`); `App.tsx` gọi `syncPendingActivities` khi mount / `online`; phát event `offline-queue-updated`, `offline-sync-complete`.

### 5.7 Nhắc nhở
Cài đặt ở `localStorage` (`baby-tracker-reminder-settings`). Hai cơ chế song song: `setInterval` + `new Notification` khi app đang mở, và Web Push qua `pushDispatchReminders` (cần cron ngoài gọi — `vercel.json` **không** khai báo cron). Nhắc theo chu kỳ cố định 1/2/3/4h, không dựa vào hoạt động cuối.

### 5.8 Thống kê
`StatsPageNewGlass` và `FoodHistoryPage` gọi `getActivities` (toàn bộ lịch sử, `limit(3000)`) rồi tổng hợp phía client theo ngày/tuần/tháng/khoảng. `TimelinePage` gọi `getActivitiesByDateRange(…, 2)` và `calculateStatsForDate`.

---

## 6. Navigation

| Index | Label | Hành động |
|---|---|---|
| 0 | ホーム | `/` |
| 1 | 記録 | `/timeline` |
| 2 | 追加 (＋) | `/?add=1` → mở dialog AI |
| 3 | 分析 | `/statistics` |
| 4 | 食事 | `/food-history` |

Route khác: `/login`, `/activities` (= Home), `/baby-info`, `/milestones`, `/wonder-weeks`.

---

## 7. Biến môi trường

| Biến | Dùng ở |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` hoặc `FIREBASE_SERVICE_ACCOUNT_BASE64` | `_admin.js` (logMilk chỉ đọc bản JSON) |
| `GEMINI_API_KEY` | `gemini.js` |
| `LOG_SECRET`, `SERVICE_ACCOUNT_USER_UID`, `DEFAULT_BABY_ID` | `logMilk.js` |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | `_push.js` |
| `REMINDER_CRON_SECRET` | `pushDispatchReminders.js` |
| `REACT_APP_VAPID_PUBLIC_KEY`, `REACT_APP_VERSION` | client |

Firebase web config hard-code trong `src/firebase/config.ts` (project `baby-tracker-app-e7e1d`). **Firestore security rules không nằm trong repo.**

---

## 8. Quy ước

1. **Múi giờ**: tạo timestamp bằng `new Date(selectedDate)` + `setHours(h, m, 0, 0)`. Không dùng `new Date('YYYY-MM-DD')` hay `toISOString().slice(0, 10)` để lấy ngày (lệch theo UTC).
2. Text hiển thị: tiếng Nhật. Code/comment/log: tiếng Anh.
3. Regex giờ bắt đầu ngủ phải bắt cả `Bắt đầu:` và `開始:`.
4. API: kiểm tra `if (!db)` trước khi dùng Admin.
5. Sau deploy, PWA cần đóng/mở lại để nhận bundle mới (SW dùng `skipWaiting` + `clientsClaim`).
6. Tăng version: `package.json` + `src/config/changelogSeed.json`, rồi `npm run changelog:sync`.
