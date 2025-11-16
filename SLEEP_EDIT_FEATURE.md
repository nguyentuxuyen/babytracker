# Tính năng Edit Activity Ngủ với Giờ Bắt Đầu và Kết Thúc

## 🎯 Vấn đề đã giải quyết

### Trước đây:
1. **Không có giờ bắt đầu và giờ kết thúc khi edit activity ngủ**
   - Form edit chỉ có trường "Thời lượng (phút)"
   - User không biết rõ bé ngủ từ lúc nào đến lúc nào
   - Khó chỉnh sửa thời gian chính xác nếu nhập sai

2. **Không thấy event "dậy" trên timeline**
   - Activity ngủ chỉ hiển thị tại thời điểm kết thúc (wake up time)
   - Không có cách rõ ràng để thấy "bé dậy lúc mấy giờ"
   - Badge "qua đêm" có nhưng thông tin vẫn chưa đủ chi tiết

### Bây giờ:
✅ **Form edit sleep có đầy đủ thông tin:**
- 🕐 Giờ bắt đầu (start time)
- 🕐 Giờ kết thúc/dậy (wake up time)
- ⏱️ Thời lượng (duration)

✅ **Timeline rõ ràng hơn:**
- Hiển thị "Giờ kết thúc (dậy)" với giá trị chính xác
- User có thể click vào để chỉnh sửa cả start và end time
- Badge "qua đêm" kết hợp với mô tả chi tiết

---

## 📸 Giao diện Form Edit Sleep

### Form hiện tại:

```
┌─────────────────────────────────┐
│   Edit Activity                 │
├─────────────────────────────────┤
│                                 │
│  🕐 Giờ bắt đầu                │
│  [  20:00  ]                    │
│                                 │
│  🕐 Giờ kết thúc (dậy)         │
│  [  07:00  ]                    │
│                                 │
│  ⏱️ Thời lượng (phút)          │
│  [   420   ]                    │
│                                 │
│  💭 Notes                       │
│  [ Ngủ ngon zZz ]               │
│                                 │
│  [Lưu]  [Hủy]  [Xóa]           │
│                                 │
└─────────────────────────────────┘
```

---

## 🔧 Cách hoạt động

### 1. **Giờ bắt đầu (Start Time)**
```typescript
// Parse từ notes field
const startTimeMatch = formData.notes.match(/Bắt đầu: (\d{1,2}):(\d{2}):(\d{2})/);
// Hiển thị dạng HH:MM
value = `${match[1].padStart(2, '0')}:${match[2]}`

// Khi user thay đổi:
onChange = (newStartTime) => {
  const newNotes = `Bắt đầu: ${newStartTime}:00`;
  setFormData({ ...formData, notes: newNotes });
}
```

### 2. **Giờ kết thúc (End Time / Wake Up Time)**
```typescript
// Lấy từ activity.timestamp (thời điểm kết thúc)
const endTime = new Date(editingActivity.timestamp);
value = endTime.toTimeString().slice(0, 5) // HH:MM

// Khi user thay đổi:
onChange = (newEndTime) => {
  const [hours, minutes] = newEndTime.split(':');
  const newTimestamp = new Date(selectedDate);
  newTimestamp.setHours(parseInt(hours), parseInt(minutes), 0, 0);
  setFormData({ ...formData, timestamp: newTimestamp.toISOString() });
}
```

### 3. **Submit Logic**
```typescript
// Trong handleSubmit:
let timestamp: Date;
if (formData.timestamp) {
  // User đã edit end time
  timestamp = new Date(formData.timestamp);
} else {
  // Tạo mới hoặc không đổi end time
  const [hours, minutes] = formData.time.split(':').map(Number);
  timestamp = new Date(selectedDate);
  timestamp.setHours(hours, minutes, 0, 0);
}
```

---

## 💡 Use Cases

### Case 1: Edit giờ bắt đầu ngủ
**Tình huống:** Bé ngủ lúc 20:00 nhưng user nhập nhầm là 20:30

**Trước:**
- Phải xóa activity và tạo lại
- Mất thông tin notes nếu có

**Bây giờ:**
1. Click vào activity ngủ
2. Sửa "Giờ bắt đầu" từ 20:30 → 20:00
3. Lưu lại
4. ✅ Notes tự động update: `Bắt đầu: 20:00:00`

### Case 2: Edit giờ dậy (kết thúc)
**Tình huống:** Bé dậy lúc 07:00 nhưng user ghi nhầm là 07:30

**Trước:**
- Không có cách nào sửa trực tiếp
- Phải xóa và tạo lại toàn bộ

**Bây giờ:**
1. Click vào activity ngủ
2. Sửa "Giờ kết thúc (dậy)" từ 07:30 → 07:00
3. Lưu lại
4. ✅ Activity.timestamp tự động update
5. ✅ Timeline hiển thị đúng thời gian mới

### Case 3: Giấc ngủ qua đêm
**Tình huống:** Bé ngủ 20:00 hôm 14/11 đến 07:00 sáng 15/11

**Timeline trên 15/11 hiển thị:**
```
07:00  ┌──────────────────────────┐
       │ 😴 Sleep                 │
       │ 420min (qua đêm)         │
       │                          │
       │ 😴 Ngủ qua đêm từ       │
       │ 14/11 lúc 20:00 đến     │
       │ 07:00 sáng               │
       └──────────────────────────┘
```

**Click vào để edit:**
- Giờ bắt đầu: `20:00` (từ notes)
- Giờ kết thúc (dậy): `07:00` (từ timestamp)
- Thời lượng: `420` phút

---

## 🎨 UI/UX Improvements

### 1. **Time Pickers**
- Type: `<input type="time">` - Native HTML5 time picker
- Format: HH:MM (24-hour format)
- InputLabelProps: `{ shrink: true }` - Label luôn ở trên
- Styling: Giống với các input khác (Material-UI style)

### 2. **Labels rõ ràng**
- ✅ "Giờ bắt đầu" - Ai cũng hiểu
- ✅ "Giờ kết thúc (dậy)" - Nhấn mạnh ý nghĩa "wake up"
- ✅ "Thời lượng (phút)" - Vẫn giữ để tiện tính toán

### 3. **Responsive**
- Mobile: 2 time pickers xếp ngang (flex gap: 2)
- Mỗi field chiếm 50% width
- Dễ dàng nhập liệu trên smartphone

---

## 📊 Data Flow

### Activity Model
```typescript
interface Activity {
  id: string;
  type: 'sleep' | 'feeding' | ...;
  timestamp: Date;  // Thời điểm KẾT THÚC (wake up time)
  details: {
    duration: number;  // Phút
    notes: string;     // "Bắt đầu: HH:MM:SS"
  }
}
```

### Form State
```typescript
const formData = {
  type: 'sleep',
  time: '07:00',              // HH:MM - default end time
  duration: '420',            // Phút
  notes: 'Bắt đầu: 20:00:00', // Chứa start time
  timestamp: '2025-11-15T07:00:00.000Z' // ISO string - optional
}
```

### Save Logic
1. User sửa "Giờ bắt đầu" → Update `formData.notes`
2. User sửa "Giờ kết thúc (dậy)" → Update `formData.timestamp`
3. Click "Lưu" → `handleSubmit()`:
   - Dùng `formData.timestamp` nếu có (đã edit)
   - Nếu không, tạo timestamp từ `formData.time`
   - Lưu vào Firebase với timestamp mới

---

## ✅ Testing Checklist

- [x] Build thành công
- [ ] Form edit hiển thị đúng giờ bắt đầu và kết thúc
- [ ] Sửa giờ bắt đầu → Notes được update
- [ ] Sửa giờ kết thúc → Timestamp được update
- [ ] Timeline hiển thị thời gian mới sau khi save
- [ ] Giấc ngủ qua đêm vẫn hiển thị badge "qua đêm"
- [ ] Giấc ngủ thường (không qua đêm) hoạt động bình thường
- [ ] Mobile responsive - 2 time pickers ngang nhau

---

## 🚀 Deployment

```bash
# Build đã thành công
npm run build
# ✅ Compiled successfully
# 35.49 KB (+266 B) main.71863a03.chunk.js

# Deploy to production
vercel --prod
```

---

## 📝 Technical Notes

### Files Changed
- `src/pages/ActivitiesPageNew.tsx`

### Changes Made
1. **Added timestamp to formData state** (line ~103)
   ```typescript
   timestamp?: string;
   ```

2. **Added time pickers for sleep** (line ~2459)
   - Giờ bắt đầu (start time)
   - Giờ kết thúc (end time)

3. **Updated handleSubmit** (line ~385)
   - Check if `formData.timestamp` exists
   - Use it instead of calculating from `formData.time`

4. **Updated handleEditActivity** (line ~803)
   - Store `activity.timestamp.toISOString()` in formData

5. **Updated form reset** (line ~598)
   - Reset `timestamp: undefined`

### No Breaking Changes
- Backward compatible với dữ liệu cũ
- Activities cũ vẫn hiển thị bình thường
- Chỉ thêm tính năng mới, không thay đổi cấu trúc data

---

**Ngày implement:** 15/11/2025  
**Build status:** ✅ Successful (+266 B)  
**Ready to test:** Yes  
**Breaking changes:** None
