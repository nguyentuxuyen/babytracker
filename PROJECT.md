# BabyTracker — Project Reference

> Mô tả nghiệp vụ, kiến trúc và quy ước của dự án. Đọc file này trước, **không cần đọc lại toàn bộ code**.
> Danh sách lỗi / điểm chưa tốt đã biết: xem [REVIEW.md](REVIEW.md).
> Cập nhật lần cuối: 2026-10-12 (đối chiếu với code ở commit `a627f66`, sau PR #7).

---

## 1. Mục tiêu sản phẩm

PWA theo dõi hoạt động hằng ngày của trẻ sơ sinh (bú sữa, ăn dặm, ngủ, tã, tắm, số đo, ghi chú). UI có **3 ngôn ngữ vi / en / ja, mặc định tiếng Việt** (xem §8.2). Mỗi tài khoản có **đúng 1 bé** (`babies/{uid}`, `baby.id === uid`).

Giá trị lưu trong DB vẫn là tiếng Việt (`stoolColor`/`stoolConsistency`), notes giấc ngủ mới ghi prefix `開始:`. Dữ liệu cũ có `type` kiểu `'thay tã'`, prefix `Bắt đầu:`… — `normalizeActivityRecord` trong `activitySchema.mjs` đọc được cả hai.

---

## 2. Tech Stack

| Tầng | Công nghệ |
|---|---|
| Frontend | **React 17**, TypeScript 5, **Vite 6** (`vite-plugin-pwa` cho service worker), Vitest |
| UI | MUI v5, icon `lucide-react` (bọc trong `components/common/icons.tsx`), `recharts` |
| Routing | React Router v5 |
| Đa ngôn ngữ | `i18next` 22 + `react-i18next` 12 (bản cuối còn hỗ trợ TypeScript 4) — ja / en / vi |
| Database | Firestore client SDK v9, bật `enableMultiTabIndexedDbPersistence` |
| Auth | Firebase Auth: email/password **và Google popup** (không có UI đăng ký email) |
| Backend | Vercel Serverless Functions (`api/*.js`, CommonJS) + Firebase Admin |
| AI | Gemini REST (`api/gemini.js`, model `gemini-3.1-flash-lite`), gọi qua `POST /api/mcp` (xem §5.2) |
| PWA | Workbox service worker (`src/service-worker.ts`) + Web Push (`web-push`) |
| CI | GitHub Actions `.github/workflows/ci.yml`: typecheck, `npm test`, nạp thử mọi `api/*.js`, build — chạy cho mọi PR và push `main` |
| Deploy | Vercel, alias `https://babytracker-lyart.vercel.app` |

Lệnh: `npm run dev` (web, cổng 3000), `npm run dev:vercel` (web + api), `npm run build` (typecheck + build vào `build/`), `npm test` (Vitest).
Deploy: project Vercel đã nối với GitHub `nguyentuxuyen/babytracker` (từ 2026-10-09) — push/merge vào `main` tự deploy production, push nhánh khác tạo preview. Deploy tay vẫn dùng được: `npx vercel --prod --yes`.
Dữ liệu activity: mọi nơi ghi/đọc đi qua `src/domain/activitySchema.mjs` (ES module; API nạp qua `api/_schema.js`). Chạy app với Firebase emulator: `VITE_FIREBASE_EMULATORS=true npm run dev`.

---

## 3. Cấu trúc thư mục (file đang dùng thật)

```
src/
  index.tsx                  # ThemeProvider(styles/m3-theme) + đăng ký service worker
  App.tsx                    # Providers, Header (menu tài khoản: ngôn ngữ, sửa bản dịch, changelog), xả queue offline cũ, reminder/push
  routes/AppRouter.tsx       # Route lazy + BottomNav, bọc ErrorBoundary
  domain/
    activitySchema.mjs       # ĐỊNH NGHĨA DUY NHẤT của activity: buildActivityDoc (ghi), normalizeActivityRecord (đọc + sửa dữ liệu cũ)
    activitySchema.d.mts     # kiểu TypeScript cho file trên
  contexts/
    AuthContext.tsx          # currentUser, login/logout
    BabyContext.tsx          # baby + activities CỦA 1 NGÀY (refreshActivities(date))
    DateContext.tsx          # selectedDate dùng chung Home/Timeline
  firebase/
    config.ts                # init app, db, auth (+ emulator khi VITE_FIREBASE_EMULATORS=true)
    auth.ts                  # login/register/logout helpers
    firestore.ts             # TẤT CẢ đọc/ghi Firestore phía client
  i18n/
    index.ts, format.ts      # khởi tạo i18next, localeTag()
    overrides.ts             # áp bản dịch người dùng tự sửa
    locales/{vi,en,ja}.json
  pages/
    ActivitiesPageNew.tsx    # Home (/ và /activities): quick actions, sleep timer, form nhập, dialog AI
    TimelinePage.tsx         # Tab "Nhật ký" (/timeline): xem §5.9
    StatsPageNewGlass.tsx    # Tab "Thống kê" (/statistics): biểu đồ + GrowthChart (WHO)
    FoodHistoryPage.tsx      # Tab "Ăn dặm" (/food-history): tóm tắt, xem theo món / theo ngày, tìm kiếm
    BabyInfoPageNew.tsx      # Hồ sơ bé + quản lý food menu (mở từ menu Header, không qua route)
    TranslationsPage.tsx     # "Sửa bản dịch" (mở từ menu Header, không qua route)
    LoginPage.tsx            # /login
    MilestonesPage.tsx, WonderWeeksPage.tsx   # route còn, không có trong nav
  components/
    layout/BottomNav.tsx     # 5 mục
    common/AssistantComposer.tsx   # ô nhập AI + voice (ngôn ngữ theo localeTag())
    common/DayStatsCard.tsx        # thẻ tóm tắt 1 ngày + so sánh với hôm trước (Timeline)
    common/RecentDaysStrip.tsx     # dải 4 ngày gần nhất
    common/RecentActivityList.tsx, activityDisplay.tsx, FormControls.tsx, LanguageSwitcher.tsx
    common/GrowthChart.tsx, LineChart.tsx, icons.tsx
    ErrorBoundary.tsx, PrivateRoute.tsx
  services/
    assistantCore.ts         # parser regex cục bộ (từ khoá TIẾNG VIỆT) → AssistantCommand
    assistantApi.ts          # quyết định local hay gọi /api/mcp
  hooks/useAuth.ts           # listener auth riêng (trùng với AuthContext) — pages đang dùng cái này
  hooks/useSleepTimer.ts     # đọc ongoingSleep + đếm giây
  utils/  dailyStats.ts, foodSearch.ts, milkPresets.ts, growthStandards.ts, pushNotifications.ts, reminderSettings.ts, changelog.ts
  types/index.ts             # Baby, Activity (kiểu details lấy từ activitySchema.d.mts), Changelog
  config/changelogSeed.json  # changelog fallback khi Firestore không có
  theme/theme.ts             # theme dùng trong App.tsx (lồng trong m3-theme)

api/
  _admin.js   # init Firebase Admin, không throw khi thiếu env → kiểm tra `if (!db)`
  _auth.js    # verify Bearer Firebase ID token
  _schema.js  # nạp src/domain/activitySchema.mjs cho code CommonJS
  _secrets.js # so sánh secret (header hoặc `Authorization: Bearer`), không nhận qua query string
  _time.js    # đọc giờ theo utcOffsetMinutes của người dùng (mặc định JST)
  _push.js, _pushMessages.js, _subscriptions.js   # VAPID, nội dung push theo ngôn ngữ, whitelist endpoint
  gemini.js   # text → { tool, params, preview }
  mcp.js      # endpoint AI, xem §5.2
  logMilk.js  # POST từ Siri Shortcut, auth bằng header x-log-secret
  pushSubscribe.js / pushUnsubscribe.js / pushSendTest.js   # cần Bearer token
  pushDispatchReminders.js   # cron gửi nhắc, auth bằng x-reminder-secret

scripts/      # syncChangelogToFirebase.js, normalizeActivities.js (chuẩn hoá dữ liệu cũ), parse_milk_shortcut.js, tài liệu Siri
firestore.rules              # security rules (deploy tay: `npx firebase-tools deploy --only firestore:rules`)
```

---

## 4. Firestore Data Model

| Path | Nội dung |
|---|---|
| `babies/{uid}` | `name, birthDate, dueDate, gender('male'\|'female'), birthWeight(g), birthHeight(cm), avatarUrl, mail, foodMenu: string[], createdAt, updatedAt` |
| `users/{uid}/activities/{id}` | `babyId, type, timestamp, details, schemaVersion, createdAt` — luôn tạo bằng `buildActivityDoc` |
| `users/{uid}/ongoingSleep/{babyId}` | `startTime, createdAt` — giấc ngủ đang chạy |
| `users/{uid}/usage/assistant` | `day, count, updatedAt` — số lần gọi Gemini trong ngày (UTC), chỉ server ghi |
| `users/{uid}/pushSubscriptions/{subId}` (id = sha256 của endpoint, chỉ server ghi) | `uid, endpoint, keys, enabled, intervalMinutes, language('ja'\|'en'\|'vi'), lastSentAt, createdAt, updatedAt` |
| `users/{uid}/settings/translations` | `overrides: { vi\|ja\|en: { 'nav.home': 'text', … } }, updatedAt` — chữ người dùng tự sửa ở trang "Sửa bản dịch" |
| `users/{uid}/milestones/data` **và** `users/{uid}/babies/{babyId}/milestones/data` | trạng thái cột mốc (ghi cả 2 nơi, đọc 3 nơi) |
| `app_meta/changelog/meta/current`, `app_meta/changelog/releases/*` | version + changelog (sync bằng `npm run changelog:sync`) |

Lưu ý: **document `users/{uid}` không được code nào tạo ra**, chỉ có subcollection.
Danh sách món ăn dặm nằm ở `babies/{uid}.foodMenu` (không phải collection `foodItems`). Mảng lưu theo thứ tự **dùng cũ nhất trước**: `addFoodItem` đưa món vừa thêm/vừa dùng xuống cuối, `getFoodItems` đảo ngược để món gần nhất lên đầu. Form Home hiện 8 món đầu thành chip "最近の食品"; tìm kiếm dùng `utils/foodSearch.ts` (bỏ qua hoa/thường, hiragana/katakana, dấu tiếng Việt).

### `details` theo `type`

Nguồn chuẩn là `normalizeDetails` trong `src/domain/activitySchema.mjs`; bảng dưới chỉ tóm tắt.

| type | fields |
|---|---|
| `feeding` | `foodType` ('milk'\|'solid'), `amount` (ml hoặc g, 0 nếu không có), `notes`; khi `solid` thêm `foodItem`, `foodPreference` ('enthusiastic'\|'normal'\|'dislike'\|'allergic'), `isAllergic` |
| `sleep` | `duration` (phút), `notes` chứa `開始: HH:MM:SS` (dữ liệu cũ: `Bắt đầu:`). **`timestamp` = giờ KẾT THÚC** |
| `diaper` | `isUrine`, `isStool`, `stoolColor` (mảng 'vàng'\|'nâu'\|'xám'), `stoolConsistency` ('lỏng'\|'bình thường'\|'khô', chỉ khi `isStool`), `notes` |
| `measurement` | `weight` (g), `height` (cm), `temperature` (°C), `notes` — field nào ≤ 0 thì bỏ |
| `bath`, `memo` | `notes` |
| `dailyRating` | `rating` (1–5), `notes` — loại cũ, chỉ còn để đọc dữ liệu cũ, UI không tạo mới |

Ghi: `buildActivityDoc` chuẩn hoá và ném `ActivityValidationError` khi giá trị vô lý (sữa > 2000, ngủ > 24h, cân nặng > 50kg, nhiệt độ ngoài 30–45°C…). Đọc: `normalizeActivityRecord` sửa các dạng cũ (`durationMinutes`, lượng sữa nằm trong `time`, `stoolShape`, màu tiếng Anh…). Dữ liệu cũ trong DB chuẩn hoá một lần bằng `scripts/normalizeActivities.js`.
`src/types/index.ts` lấy kiểu `details` từ `activitySchema.d.mts`, nên luôn khớp với schema.

---

## 5. Luồng nghiệp vụ

### 5.1 Ghi thủ công (Home)
Quick action → bottom sheet → `handleSubmit` (ActivitiesPageNew): `timestamp = new Date(selectedDate)` + `setHours(h, m)` → `firestore.saveActivity` (qua `buildActivityDoc`). Có "bulk mode" nhập nhiều giờ cho cùng một loại. Nút chọn nhanh lượng sữa = 5 lượng dùng nhiều nhất trong 14 ngày (`utils/milkPresets.ts`), thiếu dữ liệu thì dùng 60/90/120/150/180 ml.

### 5.2 Ghi bằng AI
Nút ＋ ở BottomNav → `/?add=1` → dialog `AssistantComposer` (gõ hoặc voice theo ngôn ngữ đang chọn).
1. `parseAssistantCommand` (regex, từ khoá tiếng Việt + `ml`) → `tool`. Câu không nêu giờ → giờ hiện tại trên ngày đang chọn; giờ ở tương lai (> 5 phút) của hôm nay → lùi về hôm qua.
2. `executeAssistantCommand`: nếu **localhost HOẶC parser cục bộ hiểu được** → ghi Firestore trực tiếp từ client. Chỉ khi `tool === 'unknown'` trên production mới gọi `/api/mcp`.
3. Tools: `create_activity`, `add_food_item`.

**`POST /api/mcp`** (`api/mcp.js`)
- Auth: header `Authorization: Bearer <Firebase ID token>`. Mọi ghi chép vào tài khoản của token (`babyId = uid`); `babyId` trong body bị bỏ qua.
- Body dạng Gemini: `{ text, selectedDate: 'YYYY-MM-DD', utcOffsetMinutes }`. `text` 1–300 ký tự. Mỗi lần gọi trừ 1 lượt quota ngày (`users/{uid}/usage/assistant`, mặc định 100, đổi bằng `ASSISTANT_DAILY_LIMIT`). `gemini.js` gửi kèm "giờ hiện tại" và ngày đang chọn theo múi giờ người dùng (`utcOffsetMinutes`, mặc định JST) → nhận `{ tool, params, preview }`.
- Body dạng trực tiếp (cũ): `{ tool, params, utcOffsetMinutes }` — không qua Gemini, không trừ quota.
- `create_activity` đi qua `buildActivityDoc`; giờ không có offset (`2026-10-09T14:20`) được hiểu theo múi giờ người dùng (`api/_time.js`). `add_food_item` thêm vào `babies/{uid}.foodMenu` nếu chưa có (không phân biệt hoa/thường).
- Lỗi (`{ success: false, error, code }`, message tiếng Nhật): 400 `TEXT_LENGTH` / tool lạ, 401 token sai/hết hạn, 422 `TOOL_UNKNOWN` hoặc `ACTIVITY_INVALID`, 429 `AI_QUOTA_EXCEEDED`, 500 `FIREBASE_ADMIN_NOT_CONFIGURED` / `GEMINI_NOT_CONFIGURED`, 502 lỗi Gemini.

### 5.3 Siri Shortcut
`POST /api/logMilk` body `{ amountMl, timestamp?, note? }`, header `x-log-secret` (hoặc `Authorization: Bearer`) = `LOG_SECRET`. Ghi vào user `SERVICE_ACCOUNT_USER_UID` (babyId = uid đó).

### 5.4 Sleep timer
Bắt đầu → `startOngoingSleep`. Dừng → tính `duration`, lưu activity `sleep` (timestamp = lúc dừng, notes `開始: …`) song song với `clearOngoingSleep`; lỗi thì khôi phục timer. Timeline cho sửa giờ bắt đầu/kết thúc (`updateActivity`).

### 5.5 Cảnh báo wake window (Home, chỉ hôm nay)
Từ giấc ngủ gần nhất trong ngày: ≥2h "sắp đến giờ ngủ", ≥2.5h "dễ quá giấc".

### 5.6 Offline
- Ghi mới dựa hoàn toàn vào cache offline của Firestore (IndexedDB persistence): `saveActivity` không chờ server khi mất mạng, `isPendingWrite` cho biết bản ghi chưa đồng bộ.
- Hàng đợi cũ ở `localStorage` key `offline-activity-queue:{uid}` chỉ còn được **xả**: `App.tsx` gọi `syncPendingActivities` khi mount / `online` / event `offline-queue-updated`; không thêm mục mới.

### 5.7 Nhắc nhở
Cài đặt ở `localStorage` (`baby-tracker-reminder-settings`, mặc định 180 phút). Hai cơ chế song song: `setInterval` + `new Notification` khi app đang mở, và Web Push qua `pushDispatchReminders` (cần cron ngoài gọi — `vercel.json` **không** khai báo cron). Nhắc theo chu kỳ cố định, không dựa vào hoạt động cuối. Nội dung push lấy theo `language` lưu trên subscription (`api/_pushMessages.js`, thiếu thì dùng tiếng Việt); đổi ngôn ngữ khi đang bật push sẽ đăng ký lại để cập nhật. Server chỉ gửi tới endpoint của các push service đã biết (`api/_subscriptions.js`).

### 5.8 Thống kê & ăn dặm
`StatsPageNewGlass` và `FoodHistoryPage` gọi `getActivities` (toàn bộ lịch sử, `limit(5000)`) rồi tổng hợp phía client theo ngày/tuần/tháng/khoảng. `FoodHistoryPage`: thẻ tóm tắt, xem theo món hoặc theo ngày, tìm kiếm không phân biệt dấu (`utils/foodSearch.ts`), chip phản ứng (thích / bình thường / không thích / dị ứng).

### 5.9 Tab Nhật ký (Timeline)
`TimelinePage` (`/timeline`) dùng chung `selectedDate` với Home (`DateContext`), chọn ngày bằng `RecentDaysStrip` hoặc date picker.
- Tải `getActivitiesByDateRange(uid, selectedDate, 2)` = ngày đang chọn + ngày trước đó.
- `DayStatsCard`: tóm tắt ngày (sữa, ăn dặm, ngủ, tã…) bằng `calculateStatsForDate`, footer so sánh với hôm trước và badge thay đổi.
- Danh sách hoạt động trong ngày; bấm để sửa (lượng, giờ, notes, tè/ị; giấc ngủ sửa được giờ bắt đầu + kết thúc và cập nhật `開始:` trong notes) → `updateActivity`; xoá thì hiện snackbar "Hoàn tác" vài giây, hết giờ mới gọi `deleteActivity`.

---

## 6. Navigation

Nhãn lấy từ i18n (`nav.*`); bảng dưới ghi bản tiếng Việt mặc định.

| Index | Khoá i18n | Hành động |
|---|---|---|
| 0 | `nav.home` | `/` |
| 1 | `nav.records` (Nhật ký) | `/timeline` |
| 2 | `nav.add` (＋, không có nhãn) | `/?add=1` → mở dialog AI |
| 3 | `nav.stats` (Thống kê) | `/statistics` |
| 4 | `nav.food` (Ăn dặm) | `/food-history` |

Route khác: `/login`, `/activities` (= Home), `/baby-info`, `/milestones`, `/wonder-weeks`. "Sửa bản dịch" và hồ sơ bé mở từ menu tài khoản trên Header.

---

## 7. Biến môi trường

Server (Vercel → Settings → Environment Variables):

| Biến | Bắt buộc | Dùng ở |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT` (JSON) hoặc `FIREBASE_SERVICE_ACCOUNT_BASE64` | **Có** — thiếu thì mọi API trả 500 | `_admin.js` (và `scripts/` khi chạy tay) |
| `GEMINI_API_KEY` | **Có** cho ghi bằng AI trên production | `gemini.js` |
| `ASSISTANT_DAILY_LIMIT` | Không (mặc định 100) | `mcp.js` — số lượt Gemini/người/ngày |
| `LOG_SECRET` | **Có** cho Siri Shortcut | `logMilk.js` |
| `SERVICE_ACCOUNT_USER_UID` | **Có** cho Siri Shortcut | `logMilk.js` — uid nhận bản ghi |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | **Có** cho Web Push | `_push.js` |
| `REMINDER_CRON_SECRET` (hoặc `CRON_SECRET`) | **Có** cho nhắc bằng push | `pushDispatchReminders.js` |

Client (build time, Vite nhận cả tiền tố `REACT_APP_` và `VITE_`):

| Biến | Bắt buộc | Dùng ở |
|---|---|---|
| `REACT_APP_VAPID_PUBLIC_KEY` (hoặc `VITE_VAPID_PUBLIC_KEY`) | **Có** cho Web Push, phải trùng `VAPID_PUBLIC_KEY` | `utils/pushNotifications.ts` |
| `REACT_APP_VERSION` | Không (mặc định version trong `package.json`) | `App.tsx` — nhãn version, so với changelog |
| `VITE_FIREBASE_EMULATORS` | Không — `true` để dùng Firebase emulator khi dev | `firebase/config.ts` |

`DEFAULT_BABY_ID` không còn dùng (mỗi tài khoản 1 bé, `babyId = uid`).
Firebase web config hard-code trong `src/firebase/config.ts` (project `baby-tracker-app-e7e1d`). Security rules ở `firestore.rules` trong repo — **phải deploy tay**, Vercel không deploy.

---

## 8. Quy ước

1. **Múi giờ**: tạo timestamp bằng `new Date(selectedDate)` + `setHours(h, m, 0, 0)`. Không dùng `new Date('YYYY-MM-DD')` hay `toISOString().slice(0, 10)` để lấy ngày (lệch theo UTC).
2. Text hiển thị: luôn qua `t('…')` (`react-i18next`), không viết cứng. Bản dịch ở `src/i18n/locales/{ja,en,vi}.json` — thêm khoá thì thêm đủ 3 file (test `src/i18n/i18n.test.ts` kiểm tra). Mặc định tiếng Việt; người dùng đổi trong menu tài khoản hoặc màn đăng nhập, lưu ở `localStorage` (`babytracker.language`). Người dùng sửa chữ hiển thị ở menu tài khoản → "Sửa bản dịch" (`TranslationsPage`): lưu ở `users/{uid}/settings/translations`, cache `localStorage` (`babytracker.translationOverrides`), áp lên bản gốc bằng `src/i18n/overrides.ts`. Ngày giờ format bằng `localeTag()`. Code/comment/log: tiếng Anh.
3. Regex giờ bắt đầu ngủ phải bắt cả `Bắt đầu:` và `開始:`.
4. API: kiểm tra `if (!db)` trước khi dùng Admin.
5. Sau deploy, PWA cần đóng/mở lại để nhận bundle mới (SW dùng `skipWaiting` + `clientsClaim`).
6. Tăng version: `package.json` + `src/config/changelogSeed.json`, rồi `npm run changelog:sync`.
7. Mọi ghi activity (client, API, script) phải qua `buildActivityDoc`, mọi đọc qua `normalizeActivityRecord` (`src/domain/activitySchema.mjs`). Thêm field/type mới thì sửa ở đó + `activitySchema.d.mts` + test.
