/*
  parse_milk_shortcut.js

  Usage in iOS Shortcuts:
  1. Add "Dictate Text" or "Ask for Input (Text)" action
  2. Add "Run JavaScript for Automation" action
  3. Pass the dictated text as input parameter
  4. Script returns the parsed milliliters (integer) or null

  Examples:
  - "Log 150ml milk" → 150
  - "150 milliliters" → 150
  - "1.5 liters" → 1500
  - "0.15 L" → 150
  - "150,5 ml" → 151 (rounds to nearest integer)
*/

function run(input) {
  try {
    // Handle different input formats from Shortcuts
    let text = '';
    if (typeof input === 'string') {
      text = input;
    } else if (input && typeof input === 'object') {
      // Shortcuts may pass { text: "..." } or just the text
      text = input.text || input.input || String(input);
    }
    
    text = text.trim().toLowerCase();
    
    if (!text) {
      return null;
    }

    // Regex to capture number and optional unit
    // Matches: 150, 150ml, 150 ml, 1.5L, 1.5 liters, 150,5 ml, etc.
    const pattern = /(\d+(?:[.,]\d+)?)\s*(ml|milliliter|milliliters|millilitre|millilitres|l|litre|litres|liter|liters)?/i;
    const match = text.match(pattern);
    
    if (!match) {
      return null;
    }

    // Parse the number (replace comma with dot for decimals)
    let numStr = match[1].replace(',', '.');
    let value = parseFloat(numStr);
    
    if (isNaN(value)) {
      return null;
    }

    // Get the unit (if present)
    const unit = (match[2] || '').toLowerCase();
    
    // Convert liters to milliliters
    if (unit && (unit.startsWith('l') || unit === 'liter' || unit === 'litre')) {
      value = value * 1000.0;
    }
    
    // Round to nearest integer
    const ml = Math.round(value);
    
    return ml;
    
  } catch (err) {
    // Return null on any error
    return null;
  }
}
