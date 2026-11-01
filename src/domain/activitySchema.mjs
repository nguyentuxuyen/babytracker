/**
 * The one definition of what an activity document looks like in Firestore
 * (users/{uid}/activities/{id}).
 *
 * Every writer (the web form, the sleep timer, the AI assistant, /api/mcp,
 * /api/logMilk, scripts/normalizeActivities.js) builds its document with
 * buildActivityDoc, and every reader turns a stored document back into an
 * activity with normalizeActivityRecord, which also repairs the older shapes
 * that are still in the database.
 *
 * Plain JavaScript ES module so the React app (Vite) and the Vercel functions
 * in api/ (Node, via api/_schema.js) load this same file. Types live in
 * activitySchema.d.mts.
 */

const SCHEMA_VERSION = 1;

const ACTIVITY_TYPES = ['feeding', 'sleep', 'diaper', 'bath', 'measurement', 'memo', 'dailyRating'];

// Legacy type names written by older versions of the app.
const TYPE_ALIASES = {
    feeding: 'feeding',
    'sữa': 'feeding',
    'bú sữa': 'feeding',
    sleep: 'sleep',
    'ngủ': 'sleep',
    diaper: 'diaper',
    diaperchange: 'diaper',
    'thay tã': 'diaper',
    'tã': 'diaper',
    'đi tè': 'diaper',
    'đi ị': 'diaper',
    bath: 'bath',
    'tắm': 'bath',
    measurement: 'measurement',
    'đo lường': 'measurement',
    'số đo': 'measurement',
    memo: 'memo',
    'ghi chú': 'memo',
    dailyrating: 'dailyRating'
};

const FOOD_PREFERENCES = ['enthusiastic', 'normal', 'dislike', 'allergic'];
// Milk feeds may say which milk; older records and Siri logs have none.
const MILK_TYPES = ['breast', 'formula'];
const STOOL_CONSISTENCIES = ['lỏng', 'bình thường', 'khô'];
const STOOL_SHAPE_TO_CONSISTENCY = { watery: 'lỏng', soft: 'bình thường', normal: 'bình thường', formed: 'khô' };
const STOOL_COLOR_ALIASES = { yellow: 'vàng', brown: 'nâu', gray: 'xám', grey: 'xám' };

const MAX_NOTES_LENGTH = 2000;
const MAX_FOOD_NAME_LENGTH = 100;
// One solid-food meal can hold several dishes ("cháo + bí đỏ + chuối").
const MAX_FOODS_PER_MEAL = 10;

// Upper bounds that catch typos and garbage from the AI parser, not medical limits.
const LIMITS = {
    amount: 2000, // ml (milk) or g (solid)
    duration: 24 * 60, // minutes
    weight: 50000, // g
    height: 200, // cm
    temperatureMin: 30, // °C
    temperatureMax: 45
};

class ActivityValidationError extends Error {
    constructor(message, issues) {
        super(message);
        this.name = 'ActivityValidationError';
        this.code = 'ACTIVITY_INVALID';
        this.issues = issues || [message];
    }
}

const normalizeActivityType = (value) => {
    if (typeof value !== 'string') return null;
    const key = value.trim().toLowerCase();
    return TYPE_ALIASES[key] || null;
};

// Accepts Date, Firestore Timestamp (client or admin), {seconds, nanoseconds}, ISO string or epoch ms.
const toDate = (value) => {
    if (value === null || value === undefined || value === '') return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value === 'object') {
        if (typeof value.toDate === 'function') return toDate(value.toDate());
        if (typeof value.seconds === 'number') {
            return new Date(value.seconds * 1000 + Math.round((value.nanoseconds || 0) / 1e6));
        }
        if (typeof value._seconds === 'number') {
            return new Date(value._seconds * 1000 + Math.round((value._nanoseconds || 0) / 1e6));
        }
        return null;
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

// Number from number or numeric string ("120", "120,5"); otherwise undefined.
const toNumber = (value) => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value.trim().replace(',', '.'));
        return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
};

const round1 = (value) => Math.round(value * 10) / 10;

const toText = (value, maxLength) => {
    if (value === null || value === undefined) return '';
    return String(value).trim().slice(0, maxLength);
};

const notesOf = (details) => {
    const notes = details.notes !== undefined && details.notes !== null && details.notes !== ''
        ? details.notes
        : details.note; // /api/logMilk used to write `note`
    return toText(notes, MAX_NOTES_LENGTH);
};

/**
 * The dishes of one solid-food meal with their own grams: `foodItems` (and the
 * parallel `foodGrams`) when present, else the single older `foodItem`.
 * Names trimmed, without duplicates (case-insensitive, their grams added up),
 * never empty. `grams` is null when that dish's grams were not given.
 */
const foodPortionsOf = (details) => {
    const source = details && typeof details === 'object' ? details : {};
    const hasList = Array.isArray(source.foodItems) && source.foodItems.length > 0;
    const list = hasList ? source.foodItems : [source.foodItem];
    const gramsList = hasList && Array.isArray(source.foodGrams) ? source.foodGrams : [];
    const byKey = new Map();
    const portions = [];
    list.forEach((item, index) => {
        const name = toText(item, MAX_FOOD_NAME_LENGTH).replace(/\s+/g, ' ');
        if (!name) return;
        const parsed = toNumber(gramsList[index]);
        const grams = parsed !== undefined && parsed > 0 ? round1(parsed) : null;
        const key = name.toLocaleLowerCase();
        const existing = byKey.get(key);
        if (existing) {
            if (grams !== null) existing.grams = round1((existing.grams || 0) + grams);
            return;
        }
        if (portions.length >= MAX_FOODS_PER_MEAL) return;
        const portion = { name, grams };
        byKey.set(key, portion);
        portions.push(portion);
    });
    return portions;
};

/**
 * Grams eaten of each dish: its own grams when weighed, otherwise an even share
 * of what the meal's amount leaves over (`estimated: true`).
 */
const foodGramsOf = (details) => {
    const portions = foodPortionsOf(details);
    const amount = toNumber(details && details.amount) || 0;
    const known = portions.reduce((sum, portion) => sum + (portion.grams || 0), 0);
    const unknown = portions.filter((portion) => portion.grams === null).length;
    const share = unknown > 0 ? Math.max(0, amount - known) / unknown : 0;
    return portions.map((portion) => (portion.grams !== null
        ? { name: portion.name, grams: portion.grams, estimated: false }
        : { name: portion.name, grams: round1(share), estimated: portions.length > 1 }));
};

/** The dish names of one solid-food meal (see foodPortionsOf). */
const foodNamesOf = (details) => foodPortionsOf(details).map((portion) => portion.name);

const toBoolean = (value) => value === true || value === 'true' || value === 1;

const resolveFoodType = (details) => {
    if (details.foodType === 'solid' || details.foodType === 'milk') return details.foodType;
    if (details.foodItem || (Array.isArray(details.foodItems) && details.foodItems.length > 0) || details.isAllergic === true) return 'solid';
    if (details.foodPreference && details.foodPreference !== 'normal') return 'solid';
    return 'milk';
};

const toStoolColors = (value) => {
    const list = Array.isArray(value) ? value : (value ? [value] : []);
    const colors = list
        .map((color) => String(color).trim())
        .filter(Boolean)
        .map((color) => STOOL_COLOR_ALIASES[color.toLowerCase()] || color);
    return Array.from(new Set(colors));
};

const inferDiaperFlags = (details, notes) => {
    const hasFlags = [details.isUrine, details.isStool].some((flag) => flag !== undefined && flag !== null);
    if (hasFlags) {
        return { isUrine: toBoolean(details.isUrine), isStool: toBoolean(details.isStool) };
    }
    // Older AI records only kept the sentence; read the flags from it.
    const text = notes.toLowerCase();
    const isStool = /(^|[\s,.])ị($|[\s,.])|phân|poop|stool|うんち|うんこ|便/.test(text);
    const isUrine = /(tè|tiểu|pee|urine|おしっこ|尿)/.test(text) || !isStool;
    return { isUrine, isStool };
};

/**
 * Canonical `details` for a type. Unknown fields are dropped, numbers coerced,
 * legacy field names mapped. Never returns undefined values (Firestore rejects them).
 */
const normalizeDetails = (type, rawDetails) => {
    const details = rawDetails && typeof rawDetails === 'object' ? rawDetails : {};
    const notes = notesOf(details);

    switch (type) {
        case 'feeding': {
            const foodType = resolveFoodType(details);
            let amount = toNumber(details.amount);
            // Very old records stored the amount in `time`.
            if (amount === undefined && typeof details.time === 'number') amount = details.time;
            const result = { foodType, amount: amount !== undefined && amount > 0 ? round1(amount) : 0, notes };
            if (foodType === 'solid') {
                const foodPreference = FOOD_PREFERENCES.includes(details.foodPreference) ? details.foodPreference : 'normal';
                const portions = foodPortionsOf(details);
                const foodItems = portions.map((portion) => portion.name);
                // `foodItem` stays as the readable "Cháo, Bí đỏ" for older readers.
                result.foodItem = foodItems.join(', ');
                result.foodItems = foodItems;
                // Grams per dish (0 = not given), kept only when a meal has several dishes
                // and some were weighed; the meal's amount is then their total.
                if (portions.length > 1 && portions.some((portion) => portion.grams !== null)) {
                    result.foodGrams = portions.map((portion) => portion.grams || 0);
                    result.amount = round1(result.foodGrams.reduce((sum, grams) => sum + grams, 0));
                }
                result.foodPreference = foodPreference;
                result.isAllergic = toBoolean(details.isAllergic) || foodPreference === 'allergic';
            } else if (MILK_TYPES.includes(details.milkType)) {
                result.milkType = details.milkType;
            }
            return result;
        }
        case 'sleep': {
            const duration = toNumber(details.duration !== undefined ? details.duration : details.durationMinutes);
            return { duration: duration !== undefined && duration > 0 ? Math.round(duration) : 0, notes };
        }
        case 'diaper': {
            const { isUrine, isStool } = inferDiaperFlags(details, notes);
            const result = { isUrine, isStool, stoolColor: [], notes };
            if (isStool) {
                result.stoolColor = toStoolColors(details.stoolColor);
                const legacyShape = typeof details.stoolShape === 'string' ? STOOL_SHAPE_TO_CONSISTENCY[details.stoolShape] : undefined;
                result.stoolConsistency = STOOL_CONSISTENCIES.includes(details.stoolConsistency)
                    ? details.stoolConsistency
                    : (legacyShape || 'bình thường');
            }
            return result;
        }
        case 'measurement': {
            const result = { notes };
            ['weight', 'height', 'temperature'].forEach((field) => {
                const value = toNumber(details[field]);
                if (value !== undefined && value > 0) result[field] = round1(value);
            });
            return result;
        }
        case 'dailyRating': {
            const rating = toNumber(details.rating);
            return { rating: rating !== undefined ? Math.min(5, Math.max(1, Math.round(rating))) : 3, notes };
        }
        case 'bath':
        case 'memo':
        default:
            return { notes };
    }
};

const validateActivity = (type, timestamp, details) => {
    const issues = [];
    if (!ACTIVITY_TYPES.includes(type)) issues.push(`unknown activity type "${type}"`);
    if (!timestamp) issues.push('timestamp is missing or invalid');
    if (type === 'feeding' && details.amount > LIMITS.amount) issues.push(`amount ${details.amount} is out of range`);
    if (type === 'sleep' && details.duration > LIMITS.duration) issues.push(`duration ${details.duration} is out of range`);
    if (type === 'measurement') {
        if (details.weight > LIMITS.weight) issues.push(`weight ${details.weight} is out of range`);
        if (details.height > LIMITS.height) issues.push(`height ${details.height} is out of range`);
        if (details.temperature !== undefined
            && (details.temperature < LIMITS.temperatureMin || details.temperature > LIMITS.temperatureMax)) {
            issues.push(`temperature ${details.temperature} is out of range`);
        }
    }
    return issues;
};

/**
 * Build the document to store. Throws ActivityValidationError for an unknown
 * type, a missing timestamp or out-of-range numbers.
 *
 * Convention: for sleep, `timestamp` is when the baby woke up and
 * `details.duration` is the length in minutes.
 */
const buildActivityDoc = (input) => {
    const source = input || {};
    const type = normalizeActivityType(source.type);
    const timestamp = toDate(source.timestamp);
    const details = type ? normalizeDetails(type, source.details) : {};
    const issues = validateActivity(type || String(source.type), timestamp, details);
    if (issues.length > 0) {
        throw new ActivityValidationError(`Invalid activity: ${issues.join('; ')}`, issues);
    }
    const babyId = typeof source.babyId === 'string' ? source.babyId.trim() : '';
    if (!babyId) throw new ActivityValidationError('Invalid activity: babyId is missing', ['babyId is missing']);
    return { babyId, type, timestamp, details, schemaVersion: SCHEMA_VERSION };
};

/**
 * Turn a stored document into an activity the UI can use, repairing legacy
 * shapes. Returns null when the record has no usable timestamp.
 */
const normalizeActivityRecord = (id, data, fallbackBabyId) => {
    if (!data || typeof data !== 'object') return null;
    const timestamp = toDate(data.timestamp)
        || toDate(data.details && data.details.time)
        || toDate(data.createdAt);
    if (!timestamp) return null;
    const type = normalizeActivityType(data.type) || String(data.type || 'memo');
    return {
        id,
        babyId: typeof data.babyId === 'string' && data.babyId ? data.babyId : (fallbackBabyId || ''),
        type,
        timestamp,
        details: ACTIVITY_TYPES.includes(type) ? normalizeDetails(type, data.details) : (data.details || {})
    };
};

export {
    SCHEMA_VERSION,
    ACTIVITY_TYPES,
    MILK_TYPES,
    LIMITS,
    MAX_FOODS_PER_MEAL,
    foodNamesOf,
    foodPortionsOf,
    foodGramsOf,
    ActivityValidationError,
    normalizeActivityType,
    toDate,
    normalizeDetails,
    buildActivityDoc,
    normalizeActivityRecord
};
