/**
 * How much milk, sleep and solid food a baby needs in a day, and whether a
 * logged day met it. Age-appropriate reference ranges, or the parents' own
 * minimums.
 *
 * Plain ES module so the React app (Home warning card) and the Vercel
 * functions in api/ (morning AI review) use the same numbers. Types live in
 * dailyTargets.d.mts.
 */
import { WHO_WEIGHT_BOYS, WHO_WEIGHT_GIRLS } from './whoWeight.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_DAYS = 30.44;

// Milk intake ramps up during the first two weeks, so no milk check before that.
const MILK_CHECK_FROM_DAYS = 14;
// Bottle-fed babies under 6 months take about 150 ml/kg/day (AAP: ~2.5 oz per lb),
// and should not need more than ~960 ml (32 oz). Warn below 80% of that.
const MILK_ML_PER_KG = 150;
const MILK_MAX_ML = 960;
const MILK_LOW_RATIO = 0.8;

// Once solids start, milk is still the main drink: NHS suggests ~600 ml at 7–9 months,
// ~400 ml at 10–12 months, and 350–400 ml of milk a day for toddlers.
const MILK_MIN_BY_MONTH = [
    { fromMonth: 12, minMl: 300 },
    { fromMonth: 9, minMl: 400 },
    { fromMonth: 6, minMl: 500 }
];

// Total sleep per 24 h, including naps (National Sleep Foundation 2015 for 0–3 months,
// American Academy of Sleep Medicine 2016 from 4 months).
const SLEEP_HOURS_BY_MONTH = [
    { fromMonth: 36, minHours: 10, maxHours: 13 },
    { fromMonth: 12, minHours: 11, maxHours: 14 },
    { fromMonth: 4, minHours: 12, maxHours: 16 },
    { fromMonth: 0, minHours: 14, maxHours: 17 }
];

// Solid meals a day (WHO complementary feeding guideline 2023): 2–3 meals at
// 6–8 months, 3–4 meals from 9 months. None before 6 months.
const SOLID_MEALS_BY_MONTH = [
    { fromMonth: 9, minMeals: 3 },
    { fromMonth: 6, minMeals: 2 }
];

const DEFAULT_TARGET_SETTINGS = { milkMinMl: null, sleepMinHours: null };

function startOfDay(date) {
    const copy = new Date(date);
    copy.setHours(0, 0, 0, 0);
    return copy;
}

const ageInDays = (birthDate, on) =>
    Math.floor((startOfDay(on).getTime() - startOfDay(new Date(birthDate)).getTime()) / DAY_MS);

// Linear interpolation of the WHO median weight for the age, in kg.
function medianWeightKg(table, ageMonths) {
    if (ageMonths <= table[0].month) return table[0].median;
    for (let i = 1; i < table.length; i++) {
        const prev = table[i - 1];
        const next = table[i];
        if (ageMonths <= next.month) {
            const ratio = (ageMonths - prev.month) / (next.month - prev.month);
            return prev.median + (next.median - prev.median) * ratio;
        }
    }
    return table[table.length - 1].median;
}

/** Latest weight (kg) measured on or before `on`, or null if there is none. */
function latestWeightKg(activities, on) {
    const latest = activities
        .filter((a) => a.type === 'measurement' && Number(a.details?.weight) > 0 && new Date(a.timestamp).getTime() <= on.getTime())
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
    return latest ? Number(latest.details.weight) / 1000 : null;
}

/**
 * Targets for a baby who is `days` old. Callers that do not run in the
 * family's time zone (the server) count the days themselves.
 */
function targetsForAgeDays(ageDays, gender, weightKg, settings = DEFAULT_TARGET_SETTINGS) {
    const days = Math.max(0, ageDays);
    const ageMonths = days / MONTH_DAYS;

    let milk = null;
    if (settings.milkMinMl && settings.milkMinMl > 0) {
        milk = { minMl: Math.round(settings.milkMinMl), source: 'custom' };
    } else if (days >= MILK_CHECK_FROM_DAYS) {
        const byAge = MILK_MIN_BY_MONTH.find((row) => ageMonths >= row.fromMonth);
        if (byAge) {
            milk = { minMl: byAge.minMl, source: 'age' };
        } else {
            const measured = weightKg && weightKg > 0;
            const kg = measured
                ? weightKg
                : medianWeightKg(gender === 'female' ? WHO_WEIGHT_GIRLS : WHO_WEIGHT_BOYS, ageMonths);
            const typical = Math.min(MILK_MAX_ML, kg * MILK_ML_PER_KG);
            // Round down to 10 ml so the shown target looks like a real bottle amount.
            const minMl = Math.floor((typical * MILK_LOW_RATIO) / 10) * 10;
            milk = measured
                ? { minMl, source: 'weight', weightKg: Math.round(kg * 10) / 10 }
                : { minMl, source: 'age' };
        }
    }

    const range = SLEEP_HOURS_BY_MONTH.find((row) => ageMonths >= row.fromMonth) || SLEEP_HOURS_BY_MONTH[SLEEP_HOURS_BY_MONTH.length - 1];
    const sleep = settings.sleepMinHours && settings.sleepMinHours > 0
        ? { minHours: settings.sleepMinHours, source: 'custom' }
        : { minHours: range.minHours, maxHours: range.maxHours, source: 'age' };

    const solidRow = SOLID_MEALS_BY_MONTH.find((row) => ageMonths >= row.fromMonth);
    const solids = solidRow ? { minMeals: solidRow.minMeals } : null;

    return { ageMonths, milk, sleep, solids };
}

/** Targets for the baby on day `on`, counted in the device's time zone. */
function getDailyTargets(baby, on, weightKg, settings = DEFAULT_TARGET_SETTINGS) {
    return targetsForAgeDays(ageInDays(baby.birthDate, on), baby.gender, weightKg, settings);
}

/**
 * Totals for one day's activities (already picked for that day). Sleep counts
 * on the day the baby woke up, like the rest of the app.
 */
function summarizeDay(activities) {
    const totals = { milkMl: 0, milkFeeds: 0, solidGrams: 0, solidMeals: 0, sleepMinutes: 0, sleeps: 0, wetDiapers: 0, stools: 0 };
    for (const activity of activities) {
        const details = activity.details || {};
        if (activity.type === 'feeding') {
            if (details.foodType === 'solid') {
                totals.solidMeals += 1;
                totals.solidGrams += Number(details.amount) || 0;
            } else {
                totals.milkFeeds += 1;
                totals.milkMl += Number(details.amount) || 0;
            }
        } else if (activity.type === 'sleep') {
            totals.sleeps += 1;
            totals.sleepMinutes += Number(details.duration) || 0;
        } else if (activity.type === 'diaper') {
            if (details.isUrine) totals.wetDiapers += 1;
            if (details.isStool) totals.stools += 1;
        }
    }
    totals.sleepMinutes = Math.round(totals.sleepMinutes);
    return totals;
}

/**
 * Whether a day met its targets. A type with nothing logged is "notLogged"
 * rather than "low": an empty log more likely means it was not recorded.
 */
function assessDay(totals, targets) {
    let milk = 'notApplicable';
    if (targets.milk) {
        milk = totals.milkFeeds === 0 ? 'notLogged' : totals.milkMl < targets.milk.minMl ? 'low' : 'ok';
    }

    let solids = 'notApplicable';
    if (targets.solids) {
        solids = totals.solidMeals === 0 ? 'notLogged' : totals.solidMeals < targets.solids.minMeals ? 'low' : 'ok';
    }

    let sleep = 'notLogged';
    if (totals.sleeps > 0) {
        if (totals.sleepMinutes < targets.sleep.minHours * 60) sleep = 'low';
        else if (targets.sleep.maxHours && totals.sleepMinutes > targets.sleep.maxHours * 60) sleep = 'high';
        else sleep = 'ok';
    }

    return { milk, solids, sleep };
}

export {
    DEFAULT_TARGET_SETTINGS,
    latestWeightKg,
    targetsForAgeDays,
    getDailyTargets,
    summarizeDay,
    assessDay
};
