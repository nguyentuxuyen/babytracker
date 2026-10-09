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
const STOOL_CONSISTENCIES = ['lỏng', 'bình thường', 'khô'];
const STOOL_SHAPE_TO_CONSISTENCY = { watery: 'lỏng', soft: 'bình thường', normal: 'bình thường', formed: 'khô' };
const STOOL_COLOR_ALIASES = { yellow: 'vàng', brown: 'nâu', gray: 'xám', grey: 'xám' };

const MAX_NOTES_LENGTH = 2000;
const MAX_FOOD_NAME_LENGTH = 100;

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

const toBoolean = (value) => value === true || value === 'true' || value === 1;

const resolveFoodType = (details) => {
    if (details.foodType === 'solid' || details.foodType === 'milk') return details.foodType;
    if (details.foodItem || details.isAllergic === true) return 'solid';
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
                result.foodItem = toText(details.foodItem, MAX_FOOD_NAME_LENGTH);
                result.foodPreference = foodPreference;
                result.isAllergic = toBoolean(details.isAllergic) || foodPreference === 'allergic';
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
    LIMITS,
    ActivityValidationError,
    normalizeActivityType,
    toDate,
    normalizeDetails,
    buildActivityDoc,
    normalizeActivityRecord
};
