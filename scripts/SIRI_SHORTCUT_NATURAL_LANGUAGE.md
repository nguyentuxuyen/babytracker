# Siri Shortcut: Natural Language Milk Logging

Hướng dẫn setup Siri Shortcut để nói câu tự nhiên như "Log 150ml milk" hoặc "1.5 liters"

## 🎯 Tính năng
- Nói tự nhiên: "Log 150ml milk", "150 milliliters", "1.5 liters", "0.15L"
- Tự động parse số và đơn vị (ml/L)
- Tự động convert L → ml
- Lưu vào Firebase và hiển thị trên web

---

## 📱 Cách setup Shortcut (từng bước)

### Bước 1: Tạo Shortcut mới
1. Mở **Shortcuts app** trên iPhone
2. Tap **"+"** (góc trên bên phải)
3. Tap **"Add Action"**

### Bước 2: Add "Dictate Text"
1. Search "Dictate Text" → tap để add
2. **QUAN TRỌNG:** Tap vào "Dictate Text" action
3. Chọn **Language: English** (hoặc ngôn ngữ bạn muốn)
4. **Stop Listening:** After Pause (để tự động dừng khi bạn ngừng nói)
5. Variable name sẽ tự động là "Dictated Text"

**Lúc này Shortcut sẽ hỏi bạn nói gì khi chạy.**

### Bước 3: Add "Run JavaScript for Automation"
1. Tap **"+"** để add action mới
2. Search "Run JavaScript" → chọn **"Run JavaScript for Automation"**
   - ⚠️ KHÔNG chọn "Run JavaScript on Text" hay "Run JavaScript in Safari"
3. Tap vào field **"Script"**
4. **Delete placeholder code** và paste toàn bộ nội dung file `parse_milk_shortcut.js`:

```javascript
/*
  parse_milk_shortcut.js - Copy toàn bộ code này vào Shortcuts
*/

function run(input) {
  try {
    // Handle different input formats from Shortcuts
    let text = '';
    if (typeof input === 'string') {
      text = input;
    } else if (input && typeof input === 'object') {
      text = input.text || input.input || String(input);
    }
    
    text = text.trim().toLowerCase();
    
    if (!text) {
      return null;
    }

    // Regex to capture number and optional unit
    const pattern = /(\d+(?:[.,]\d+)?)\s*(ml|milliliter|milliliters|millilitre|millilitres|l|litre|litres|liter|liters)?/i;
    const match = text.match(pattern);
    
    if (!match) {
      return null;
    }

    let numStr = match[1].replace(',', '.');
    let value = parseFloat(numStr);
    
    if (isNaN(value)) {
      return null;
    }

    const unit = (match[2] || '').toLowerCase();
    
    if (unit && (unit.startsWith('l') || unit === 'liter' || unit === 'litre')) {
      value = value * 1000.0;
    }
    
    const ml = Math.round(value);
    return ml;
    
  } catch (err) {
    return null;
  }
}
```

5. Sau khi paste code, tap **"Dictated Text"** variable phía dưới script
6. Tap **"Select Variable"** → chọn **"Dictated Text"** từ danh sách
   - Script sẽ nhận "Dictated Text" làm input parameter

**Variable name sẽ tự động là "JavaScript Result"**

### Bước 4: Add "If" condition (fallback nếu parse fail)
1. Tap **"+"** → Search "If" → add action
2. Condition: **"JavaScript Result"** **"is not"** **"Number"**
   - Tap "Choose" → select variable "JavaScript Result"
   - Tap "is" → change to "is not"
   - Tap "Text" → change to "Number"
3. **Inside "If" block:** Add "Ask for Input"
   - Prompt: "I didn't catch that. How many ml?"
   - Input Type: **Number**
   - Variable name: "Provided Input"
4. **Inside "Otherwise" block:** Add "Set Variable"
   - Variable name: "Provided Input"
   - Value: [Select] "JavaScript Result"
5. Tap "End If"

**Giờ bạn có variable "Provided Input" chứa số ml (từ JavaScript hoặc manual input)**

### Bước 5: Add "Get Contents of URL"
1. Tap **"+"** → Search "Get Contents of URL"
2. URL: `https://baby-tracker-app-1.vercel.app/api/logMilk`
3. Tap **"Show More"** để xem thêm options
4. **Method:** POST
5. **Headers:** Tap "Add new field"
   - Key: `x-log-secret`
   - Value: `<YOUR_LOG_SECRET>` (hoặc LOG_SECRET của bạn)
6. **Request Body:** JSON
7. Tap để add JSON fields:
   - Field 1:
     - Key: `amountMl`
     - Value: [Select Variable] **"Provided Input"**
   - Field 2:
     - Key: `note`
     - Value: `via Siri` (type text)

**Variable name: "Contents of URL"**

### Bước 6: Add "Show Result" (Optional)
1. Tap **"+"** → Search "Show Result"
2. Text: **"Logged [Provided Input] ml"**
   - Type "Logged ", tap variable icon, select "Provided Input", type " ml"

### Bước 7: Đặt tên và config Shortcut
1. Tap tên Shortcut ở trên (mặc định "New Shortcut")
2. Đổi tên thành: **"Log Milk"**
3. Tap **(i)** icon (góc trên bên phải)
4. **Add to Home Screen** (nếu muốn)
5. **Show in Share Sheet:** OFF (không cần)
6. **Show in Siri:** Tự động ON khi bạn đặt tên

### Bước 8: Test!
1. Nói: **"Hey Siri, Log Milk"**
2. Siri sẽ prompt: (màn hình hiện chờ bạn nói)
3. Nói: **"150 milliliters"** hoặc **"Log 150ml milk"** hoặc **"1.5 liters"**
4. Siri sẽ parse → gọi API → show "Logged 150 ml" (hoặc 1500 ml)
5. **Refresh web app** → thấy entry mới!

---

## 🧪 Test cases

| Input | Output (ml) |
|-------|-------------|
| "Log 150ml milk" | 150 |
| "150 milliliters" | 150 |
| "1.5 liters" | 1500 |
| "0.15 L" | 150 |
| "150,5 ml" | 151 |
| "150" | 150 |
| "1 liter" | 1000 |
| "abc" | Ask for Input fallback |

---

## 🐛 Troubleshooting

**Issue: "I didn't catch that" mỗi lần**
- Check Dictate Text language = English
- Check JavaScript code paste đúng (không thiếu dấu {})
- Check variable "Dictated Text" được pass vào JavaScript

**Issue: "Unauthorized" error**
- Check header `x-log-secret` = `<YOUR_LOG_SECRET>` (match với Vercel env var)

**Issue: "Missing babyId" error**
- Check Vercel env vars đã set đủ (DEFAULT_BABY_ID, SERVICE_ACCOUNT_USER_UID)

**Issue: Không hiển thị trên web**
- Check Firebase Console: `users/{uid}/activities/` có document mới không?
- Refresh web app
- Check babyId trong document có match với web không

---

## 📝 Summary

**Shortcut flow:**
1. Dictate Text → "Log 150ml milk"
2. Run JavaScript → parse → 150
3. If not number → Ask for Input (fallback)
4. Get Contents of URL → POST to API
5. Show Result → "Logged 150 ml"

**API Endpoint:**
- URL: `https://baby-tracker-app-1.vercel.app/api/logMilk`
- Method: POST
- Headers: `x-log-secret: <YOUR_LOG_SECRET>`
- Body: `{"amountMl": 150, "note": "via Siri"}`

**Firebase Path:**
- `users/{userId}/activities/{autoId}`
- Structure: `{babyId, type: 'feeding', timestamp, details: {amount, note}, createdAt}`
