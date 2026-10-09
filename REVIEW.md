# BabyTracker — Review nghiệp vụ & code

> Rà soát ngày 2026-10-08 tại commit `41a7a06`. Tổng quan dự án: [PROJECT.md](PROJECT.md).
> Khi sửa xong mục nào thì xoá/gạch mục đó để file này luôn phản ánh hiện trạng.

**Cách kiểm chứng**: đọc toàn bộ `api/`, `src/firebase`, `contexts`, `services`, `hooks`, `utils`, `App.tsx`, `TimelinePage`, `FoodHistoryPage`, phần logic của `ActivitiesPageNew` / `StatsPageNewGlass` / `BabyInfoPageNew`; phần JSX dài và `MilestonesPage`/`WonderWeeksPage`/`LoginPage` chỉ grep. Đã chạy: `tsc --noEmit` (0 lỗi ngoài file test), test 3/3 pass. **Chưa chạy app thật** — các mục ghi "(suy từ SDK)" là suy luận từ hành vi thư viện, chưa tái hiện.

> **Cập nhật 2026-10-09** (nhánh `claude/project-thread-7fth2h`): đã sửa 1.1–1.6, 1.8, 2.1, 2.2, 2.3 (ghi mới dựa vào cache offline của Firestore, queue cũ chỉ còn được xả), 3.1, 3.3, 4.1, 4.5 (`createdAt`), 5.1 (thêm `firestore.rules`), 5.3, 5.4, 5.5, 5.7. Dữ liệu activity giờ có một định nghĩa chung ở `src/domain/activitySchema.js`; dữ liệu cũ chuẩn hoá bằng `scripts/normalizeActivities.js`. Báo cáo kiến trúc/bảo mật đầy đủ nằm ngoài repo (project files `review/babytracker-review-2026-10-09.md`).

Mức độ: 🔴 sai dữ liệu / tính năng không chạy · 🟠 rủi ro hoặc sai trong tình huống cụ thể · 🟡 chất lượng code.

---

## 1. Ghi bằng AI (assistant)

| # | Mức | Vấn đề | Vị trí |
|---|---|---|---|
| 1.1 | 🔴 | Lệnh **không nêu giờ** bị ghi theo giờ của `selectedDate`, không phải giờ hiện tại. `selectedDate` khởi tạo lúc mở app, và thành `00:00` sau khi chọn ngày ở dải 4 ngày. Mở app 8h, 14h nói "ミルク120ml" → ghi 8h hoặc 0h. | `assistantCore.ts:70-80`, `DateContext.tsx:23`, `RecentDaysStrip.tsx:19-24` |
| 1.2 | 🔴 | Parser cục bộ ghi giấc ngủ vào field `durationMinutes`, cả app đọc `duration` → giấc ngủ ghi bằng AI có thời lượng 0. Test đang khẳng định field sai. | `assistantCore.ts:163`, `assistantCore.test.ts:16` |
| 1.3 | 🔴 | Parser cục bộ để `amount` / `durationMinutes` là `undefined` khi câu không có số, rồi ghi thẳng Firestore từ client. Firestore từ chối giá trị `undefined` → "bé ngủ", "cho bú" báo lỗi thay vì lưu (suy từ SDK). | `assistantCore.ts:151,179`, `assistantApi.ts:27` |
| 1.4 | 🔴 | Tã ghi bằng parser cục bộ không có `isUrine`/`isStool` → không được đếm vào おしっこ/うんち. | `assistantCore.ts:136-143` |
| 1.5 | 🟠 | Nhánh Gemini: prompt không có "giờ hiện tại" và múi giờ; `selectedDate` gửi dạng ISO UTC → trước 9h sáng JST là ngày hôm trước. Model phải đoán ngày giờ. | `gemini.js:61-64`, `assistantApi.ts:94` |
| 1.6 | 🟠 | `/api/mcp` ghi `activityType`, `details`, `babyId` do Gemini/client trả về mà không kiểm tra (type lạ, field lạ, số âm đều vào DB). | `mcp.js:20-35` |
| 1.7 | 🟠 | Parser chỉ có từ khoá tiếng Việt trong khi UI và voice là tiếng Nhật: hầu hết câu Nhật đi Gemini (chậm, tốn quota); riêng câu có `ml` bị ép thành feeding/milk. Trên localhost câu `unknown` ném lỗi "未対応のツール: unknown". | `assistantCore.ts:90-104,173`, `assistantApi.ts:77-87` |
| 1.8 | 🟠 | So khớp từ khoá bằng `includes`: `ngu` khớp "nguội", `tả`/`tã` khớp giữa từ; regex giờ `12.5` → 12:05; thứ tự ưu tiên food > diaper > sleep > feeding nên "ăn xong ngủ" thành sleep. | `assistantCore.ts:26,104-109` |
| 1.9 | 🟡 | Comment trong `AssistantComposer.tsx:67-69` và `assistantApi.ts:79` mô tả sai luồng (nói production luôn đi Gemini). | — |

## 2. Offline & đồng bộ

| # | Mức | Vấn đề | Vị trí |
|---|---|---|---|
| 2.1 | 🔴 | `syncPendingActivities` không có khoá: chạy đồng thời khi mount và khi `online` → cùng một item được `addDoc` 2 lần (bản ghi trùng). Cuối hàm ghi đè queue bằng `remainingQueue` → item mới enqueue trong lúc sync bị mất. | `firestore.ts:526-565`, `App.tsx:549-582` |
| 2.2 | 🔴 | Xoá bản ghi `offline-…`: `deleteDoc` trên id không tồn tại vẫn trả `true`, UI ẩn đi nhưng item còn trong queue → hiện lại và sync lên sau. | `firestore.ts:568-577` |
| 2.3 | 🟠 | Hai cơ chế offline chồng nhau. Với persistence bật, `addDoc` khi mất mạng **không throw mà treo** đến khi có mạng (suy từ SDK) → queue localStorage hầu như không được dùng, còn form thì kẹt spinner vì `await`. Nên chọn một: bỏ `await` chờ server và dựa vào persistence, hoặc bỏ persistence cho write. | `config.ts:20`, `firestore.ts:473-501`, `ActivitiesPageNew.tsx:658` |
| 2.4 | 🟠 | Handler `visibilitychange` giữ `selectedDate` cũ (effect chỉ phụ thuộc `currentUser`); `offline-sync-complete` gọi `refreshActivities()` = hôm nay. Sau khi đổi ngày rồi quay lại app, context nạp dữ liệu của ngày khác với ngày đang chọn. Ảnh hưởng hiện tại nhỏ vì Home chỉ còn dùng cho wake-window. | `ActivitiesPageNew.tsx:252-302` |
| 2.5 | 🟠 | `refreshActivities` không huỷ request cũ → đổi ngày nhanh, response về sau ghi đè. | `BabyContext.tsx:139-148` |

## 3. Thông báo / nhắc nhở

| # | Mức | Vấn đề | Vị trí |
|---|---|---|---|
| 3.1 | 🔴 | Cron nhắc duyệt `db.collection('users').get()`, nhưng không code nào tạo document `users/{uid}` (chỉ có subcollection) → truy vấn trả rỗng, **không bao giờ gửi push** — trừ khi document đó được tạo tay. Nên dùng `collectionGroup('pushSubscriptions')`. | `pushDispatchReminders.js:29` |
| 3.2 | 🔴 | `vercel.json` không có `crons` → endpoint nhắc không được gọi nếu không có cron bên ngoài. | `vercel.json` |
| 3.3 | 🟠 | Đổi chu kỳ nhắc gọi lại `pushSubscribe`, ghi đè `lastSentAt: null` và `createdAt` → gửi ngay một thông báo thừa. | `pushSubscribe.js:23-32`, `App.tsx:645-655` |
| 3.4 | 🟠 | Nhắc trong app (`setInterval` + `Notification`) và Web Push chạy song song, mỗi bên tự tính `lastSent` → có thể nhắc đôi. | `App.tsx:666-691` |
| 3.5 | 🟠 | Nghiệp vụ: nhắc theo chu kỳ cố định, không quan tâm bé vừa được ghi hoạt động hay đang ngủ. Hữu ích hơn nếu tính từ cữ bú gần nhất. | — |
| 3.6 | 🟡 | Nội dung push là tiếng Việt, link `/activities`; mọi lỗi ở `push*` trả 401 kể cả lỗi cấu hình/DB. | `pushDispatchReminders.js:49-51`, `pushSendTest.js:27,50`, `service-worker.ts:76` |

## 4. Dữ liệu & thống kê

| # | Mức | Vấn đề | Vị trí |
|---|---|---|---|
| 4.1 | 🔴 | `logMilk` ghi `details.note`, app đọc `details.notes` → ghi chú từ Siri không hiển thị. Nếu `DEFAULT_BABY_ID` ≠ uid thì bản ghi bị trang 分析 lọc mất (`a.babyId === baby.id`). | `logMilk.js:58-61`, `StatsPageNewGlass.tsx:73-75` |
| 4.2 | 🟠 | `getActivities` giới hạn `limit(3000)` mới nhất. Khoảng 20 bản ghi/ngày thì sau ~5 tháng, biểu đồ tăng trưởng và lịch sử ăn dặm bị cắt âm thầm. Mỗi lần mở 分析/食事 đọc lại tới 3000 document. `FoodHistoryPage` tải toàn bộ chỉ để lọc món ăn dặm. | `firestore.ts:314-327`, `FoodHistoryPage.tsx:46` |
| 4.3 | 🟠 | Ô chọn ngày ở Timeline dùng `toISOString().slice(0,10)` → trước 9h sáng JST hiển thị ngày hôm trước (vi phạm quy ước múi giờ; Home làm đúng). | `TimelinePage.tsx:228` |
| 4.4 | 🟠 | Giấc ngủ: `timestamp` là giờ kết thúc, nên giấc qua đêm tính trọn cho ngày thức dậy; giấc ghi bằng AI lại dùng giờ người dùng nói làm `timestamp`. Danh sách ẩn ở Home còn cộng `duration` vào `timestamp` như thể đó là giờ bắt đầu. Chưa có quy ước thống nhất. | `ActivitiesPageNew.tsx:373,1599`, `dailyStats.ts:40` |
| 4.5 | 🟠 | Lưu hồ sơ bé ghi đè `createdAt` mỗi lần (dùng `serverTimestamp()` với `merge`). `BabyInfoPage.handleSave` bỏ qua kết quả lưu rồi `window.location.reload()`. | `firestore.ts:193,247`, `BabyInfoPageNew.tsx:97-100` |
| 4.6 | 🟠 | Header luôn gắn "くん" bất kể giới tính (bé gái nên là "ちゃん"). | `App.tsx:147` |
| 4.7 | 🟠 | Wake-window chỉ xét giấc ngủ trong ngày đang nạp → đầu ngày, trước giấc đầu tiên, không có cảnh báo dù bé đã thức lâu. | `ActivitiesPageNew.tsx:881-917` |
| 4.8 | 🟡 | `details.time` lưu thừa (trùng `timestamp`). `renameFoodItem`/`deleteFoodItem` so khớp phân biệt hoa thường trong khi `addFoodItem` thì không. Milestones ghi 2 nơi, đọc 3 nơi. | `firestore.ts:691-736`, `MilestonesPage.tsx:319-356` |

## 5. Bảo mật & vận hành

| # | Mức | Vấn đề | Vị trí |
|---|---|---|---|
| 5.1 | 🟠 | Firestore rules không có trong repo → không rà soát được quyền truy cập. Cần xác nhận rules chỉ cho `request.auth.uid == userId`; truy vấn cũ `babies where mail == email` gợi ý rules có thể đang mở đọc cả collection `babies`. | `firestore.ts:116-146` |
| 5.2 | 🟠 | Đăng nhập Google mở cho mọi tài khoản → bất kỳ ai cũng gọi được `/api/mcp` (tốn quota Gemini), không có rate limit hay giới hạn độ dài `text`. | `LoginPage.tsx:52-53`, `mcp.js:106-109` |
| 5.3 | 🟠 | Secret nhận qua query string (`?secret=`) ở `logMilk` và `pushDispatchReminders` → lọt vào log truy cập. Tài liệu `scripts/QUICK_REFERENCE.md` và `SIRI_SHORTCUT_NATURAL_LANGUAGE.md` ghi `mySecret123`; nếu đó là giá trị thật thì cần đổi. | `logMilk.js:29`, `pushDispatchReminders.js:5` |
| 5.8 | 🔴 | Trên Vercel chỉ có 2 biến môi trường: `FIREBASE_SERVICE_ACCOUNT`, `GEMINI_API_KEY` (kiểm tra 2026-10-09). Thiếu `LOG_SECRET`, `SERVICE_ACCOUNT_USER_UID` → `/api/logMilk` luôn trả 401; thiếu `VAPID_*`, `REACT_APP_VAPID_PUBLIC_KEY`, `REMINDER_CRON_SECRET` → push không đăng ký và không gửi được. | Vercel project settings |
| 5.4 | 🟠 | `logMilk` tự init Admin: thiếu env thì `admin.firestore()` ném lỗi ngay khi load module, không hỗ trợ biến `_BASE64`. Nên dùng `_admin.js`. | `logMilk.js:1-21` |
| 5.5 | 🟡 | `/api/mcp` trả `details: error.message` nội bộ cho client và log nội dung người dùng nhập; Gemini key đặt trên URL thay vì header `x-goog-api-key`. | `mcp.js:104-110,163-166`, `gemini.js:80` |
| 5.6 | 🟡 | Khoảng 45 `console.log` chạy ở production, trong đó có email người dùng. | `PrivateRoute.tsx:13`, `BabyContext.tsx:35`, `LoginPage.tsx` |
| 5.7 | 🟡 | Home nuốt mọi lỗi toàn cục (`unhandledrejection` → `preventDefault`) nên lỗi thật không hiện trong console. | `ActivitiesPageNew.tsx:774-791` |

## 6. Chất lượng code

- **`ActivitiesPageNew.tsx` còn 2134 dòng** (đã xoá ~1070 dòng UI ẩn và các hàm chỉ phục vụ chúng, 2026-10-08). Còn sót: state `editingActivity` không bao giờ khác `null` nữa, nên nhánh "sửa" trong `handleSubmit` (xoá rồi tạo lại) và các chỗ form kiểm tra `editingActivity` là code chết — gỡ khi tách file này. Số dòng tham chiếu tới file này ở các mục trên đã lệch: từ dòng ~715 trở đi trừ khoảng 45–130, từ phần JSX trở đi trừ khoảng 1070.
- **Hai nguồn auth**: `hooks/useAuth` (trả `user`) và `contexts/AuthContext` (trả `currentUser`) cùng đăng ký listener; `StatsPageNewGlass` lại gọi `getCurrentUser()` một lần lúc mount.
- **Hai bản sao state activities**: context và state cục bộ của Home, cập nhật cục bộ bằng closure cũ (`setActivities([... , ...activities])`).
- **Ba file theme**, hai `ThemeProvider` lồng nhau (`styles/m3-theme` ở index, `theme/theme` ở App); `styles/theme.ts` không ai dùng.
- ~~File chết, dependency không dùng, CDN icon font thừa~~ — đã dọn 2026-10-08 trên nhánh `chore/remove-dead-code` (build + test pass). `scripts/IMPORT_GUIDE.md` và `QUICK_REFERENCE.md` vẫn nhắc tới các script import đã xoá (vốn là file rỗng).
- **Kiểu dữ liệu**: `types/index.ts` lệch với dữ liệu thật; ~45 chỗ `any`; `dailyStats.ts` và Home tự khai báo `Activity` riêng.
- **Trùng lặp**: reducer tổng hợp trong `StatsPageNewGlass` chép lại cho day/week/month; `mergeFoodItems` có ở cả `firestore.ts` và Home; khối catch trong `getActivitiesByDate*` lặp lại logic lọc.
- **Ngôn ngữ lẫn lộn**: định dạng ngày giờ `vi-VN` (Timeline, Stats, FoodHistory), nhãn `Week N`, `min`, `Solid Food`, thông báo lỗi đăng nhập tiếng Việt trong UI tiếng Nhật; `<html lang="en">`.
- **Nền tảng cũ**: React 17, CRA 4.0.3 (ngừng bảo trì, phải bật `--openssl-legacy-provider`), TS 4.
- **Test**: chỉ 3 test; `tsc --noEmit` báo lỗi ở file test vì thiếu `@types/jest`. Không có test cho offline queue, sleep timer, API.
- **Tài liệu**: `README.md` là khung mẫu rỗng; `.env.production` đang được track dù `.gitignore` có `.env*` (nội dung hiện không nhạy cảm).

---

## Thứ tự nên xử lý

1. Sửa parser AI: 1.1 → 1.4 (nhỏ, cùng file `assistantCore.ts`, sửa kèm test).
2. Offline: 2.1, 2.2, rồi quyết định giữ cơ chế nào (2.3).
3. Nhắc nhở: 3.1 + 3.2 (hiện tính năng push gần như không chạy), sau đó 3.3–3.5.
4. `logMilk` (4.1, 5.3, 5.4) và xác nhận Firestore rules (5.1), giới hạn `/api/mcp` (5.2, 1.6).
5. Dọn `ActivitiesPageNew.tsx` và file chết (mục 6) — giảm mạnh chi phí đọc code về sau.
