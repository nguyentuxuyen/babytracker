# Quick Reference: Siri Milk Logging

## 🎤 Usage
Say: **"Hey Siri, Log Milk"**  
Then say: **"150 milliliters"** or **"1.5 liters"** or **"Log 150ml milk"**

---

## 🔧 Quick Setup (5 actions)

1. **Dictate Text** (Language: English, Stop: After Pause)
2. **Run JavaScript for Automation** (paste code from `parse_milk_shortcut.js`, input: Dictated Text)
3. **If** JavaScript Result is not Number → Ask for Input (Number) → Otherwise Set Variable
4. **Get Contents of URL**
   - URL: `https://baby-tracker-app-1.vercel.app/api/logMilk`
   - Method: POST
   - Header: `x-log-secret: mySecret123`
   - Body JSON: `{"amountMl": [Provided Input], "note": "via Siri"}`
5. **Show Result** (Optional): "Logged [Provided Input] ml"

Name: **"Log Milk"**

---

## 📋 JavaScript Code (copy to action 2)

```javascript
function run(input) {
  try {
    let text = '';
    if (typeof input === 'string') {
      text = input;
    } else if (input && typeof input === 'object') {
      text = input.text || input.input || String(input);
    }
    text = text.trim().toLowerCase();
    if (!text) return null;

    const pattern = /(\d+(?:[.,]\d+)?)\s*(ml|milliliter|milliliters|millilitre|millilitres|l|litre|litres|liter|liters)?/i;
    const match = text.match(pattern);
    if (!match) return null;

    let value = parseFloat(match[1].replace(',', '.'));
    if (isNaN(value)) return null;

    const unit = (match[2] || '').toLowerCase();
    if (unit && (unit.startsWith('l') || unit === 'liter' || unit === 'litre')) {
      value = value * 1000.0;
    }
    return Math.round(value);
  } catch (err) {
    return null;
  }
}
```

---

## ✅ Examples

| Say | Result |
|-----|--------|
| "150 milliliters" | 150 ml |
| "1.5 liters" | 1500 ml |
| "Log 150ml milk" | 150 ml |
| "0.15 L" | 150 ml |

---

## 🔗 Files
- Full guide: `SIRI_SHORTCUT_NATURAL_LANGUAGE.md`
- JavaScript: `parse_milk_shortcut.js`
- API: `api/logMilk.js`
