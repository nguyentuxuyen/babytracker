# Tính năng Hiển thị Giấc Ngủ Qua Đêm

## 🌙 Vấn đề đã giải quyết

**Trước đây:** Khi bé ngủ qua đêm (ví dụ: từ 8h tối hôm trước đến 7h sáng hôm sau), timeline của ngày hôm sau không hiển thị rõ việc "thức dậy lúc 7h sáng". Người dùng chỉ thấy activity ngủ với thời lượng nhưng không biết đó là giấc ngủ qua đêm.

**Bây giờ:** Timeline hiển thị rõ ràng khi đó là giấc ngủ qua đêm với thông tin đầy đủ.

---

## ✨ Tính năng mới

### 1. **Badge "qua đêm"**
Bên cạnh thời lượng ngủ, nếu đó là giấc ngủ qua đêm, sẽ hiển thị badge màu cam:
```
60min (qua đêm)
```

### 2. **Mô tả chi tiết trong Notes**
Thay vì chỉ hiện "Bắt đầu: 20:00:00", giờ sẽ hiện:
```
😴 Ngủ qua đêm từ 14/11 lúc 20:00 đến 07:00 sáng
```

---

## 🔧 Cách hoạt động

### Logic phát hiện giấc ngủ qua đêm:

```typescript
// 1. Parse thời gian bắt đầu từ notes
const startTimeMatch = activity.details.notes.match(/Bắt đầu: (\d{1,2}):(\d{2}):(\d{2})/);

// 2. Tạo start time từ thông tin parsed
const possibleStartTime = new Date(endTime);
possibleStartTime.setHours(startHour, startMinute, 0, 0);

// 3. Nếu start time > end time, chắc chắn là ngày trước
if (possibleStartTime > endTime) {
    possibleStartTime.setDate(possibleStartTime.getDate() - 1);
}

// 4. Kiểm tra nếu là ngày khác = qua đêm
const isDifferentDay = possibleStartTime.getDate() !== endTime.getDate() ||
                       possibleStartTime.getMonth() !== endTime.getMonth() ||
                       possibleStartTime.getFullYear() !== endTime.getFullYear();
```

---

## 📱 Giao diện

### Timeline trên ngày 15/11 (ngày thức dậy):

```
07:00  ┌──────────────────────────┐
       │ 😴 Sleep                 │
       │ 60min (qua đêm)          │
       │                          │
       │ 😴 Ngủ qua đêm từ       │
       │ 14/11 lúc 20:00 đến     │
       │ 07:00 sáng               │
       └──────────────────────────┘
         │
         │ 2.5h
         │
09:30  ┌──────────────────────────┐
       │ 🍼 Feeding              │
       │ 120ml                    │
       └──────────────────────────┘
```

---

## ✅ Ưu điểm

1. **Rõ ràng hơn**: Người dùng biết ngay đó là giấc ngủ qua đêm
2. **Thông tin đầy đủ**: Hiển thị cả ngày bắt đầu và thời gian chính xác
3. **Trực quan**: Badge màu cam nổi bật, dễ nhận biết
4. **Không phá vỡ UX**: Các giấc ngủ thông thường vẫn hiển thị bình thường

---

## 🎯 Ví dụ sử dụng

### Case 1: Ngủ qua đêm
- Bắt đầu: 14/11 lúc 20:00
- Kết thúc: 15/11 lúc 07:00
- **Hiển thị trên 15/11:**
  - Badge: `420min (qua đêm)`
  - Notes: `😴 Ngủ qua đêm từ 14/11 lúc 20:00 đến 07:00 sáng`

### Case 2: Ngủ trưa (không qua đêm)
- Bắt đầu: 15/11 lúc 13:00
- Kết thúc: 15/11 lúc 15:00
- **Hiển thị trên 15/11:**
  - Badge: `120min` (không có "qua đêm")
  - Notes: `😴 Bắt đầu: 13:00:00`

---

## 🚀 Deployment

Tính năng này đã được build thành công và sẵn sàng deploy:

```bash
npm run build  # ✅ Compiled successfully
vercel --prod  # Deploy to production
```

---

## 📝 Technical Notes

- File thay đổi: `src/pages/ActivitiesPageNew.tsx`
- Không cần thay đổi database schema
- Backward compatible với dữ liệu cũ
- Performance: Không ảnh hưởng đến hiệu suất (chỉ parse regex khi render)

---

**Ngày implement:** 15/11/2025  
**Build status:** ✅ Successful  
**Ready to deploy:** Yes
