const { admin, db } = require('./_admin');
const { webpush, configureWebPush } = require('./_push');
const { pushMessages, normalizeLanguage, reviewTitleFor } = require('./_pushMessages');
const { loadSchema } = require('./_schema');
const { consumeAiQuota } = require('./_quota');
const { writeDailyReview } = require('./gemini');

/**
 * Morning review of yesterday: milk, solid food and sleep against the baby's
 * targets (src/domain/dailyTargets.mjs, the same numbers as the Home warning),
 * written up by Gemini, saved at users/{uid}/dailyReviews/{YYYY-MM-DD} and
 * pushed to the family's phones once a day.
 *
 * It is sent when the first wake-up of the morning is logged, or at
 * FALLBACK_HOUR if nobody logged one, and never after UNTIL_HOUR.
 */
const DAY_MS = 24 * 60 * 60 * 1000;
// A sleep that ends from 05:00 counts as the morning wake-up; earlier ones are night wakings.
const WAKE_FROM_HOUR = 5;
const FALLBACK_HOUR = 9;
const UNTIL_HOUR = 12;
// A review being written by another request is left alone for this long.
const PENDING_MS = 2 * 60 * 1000;
const HISTORY_DAYS = 7;

let targetsPromise = null;
const loadTargets = () => {
  if (!targetsPromise) targetsPromise = import('../src/domain/dailyTargets.mjs');
  return targetsPromise;
};

// The family's calendar day around `now`, for a UTC offset in minutes.
function localDay(nowMs, utcOffsetMinutes) {
  const local = new Date(nowMs + utcOffsetMinutes * 60 * 1000);
  const dayIndex = Math.floor(local.getTime() / DAY_MS);
  return {
    hour: local.getUTCHours(),
    dayIndex,
    // UTC instant of 00:00 local today.
    todayStartMs: dayIndex * DAY_MS - utcOffsetMinutes * 60 * 1000
  };
}

const isoDayOf = (dayIndex) => new Date(dayIndex * DAY_MS).toISOString().slice(0, 10);

const reviewRef = (uid, day) => db.collection('users').doc(uid).collection('dailyReviews').doc(day);

const toDate = (value) => {
  if (!value) return null;
  const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const positiveOrNull = (value) => (Number(value) > 0 ? Math.min(Number(value), 5000) : null);

/** Parent-set minimums from the app, saved so the morning cron uses them too. */
function sanitizeTargetSettings(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const sleepMinHours = positiveOrNull(raw.sleepMinHours);
  return { milkMinMl: positiveOrNull(raw.milkMinMl), sleepMinHours: sleepMinHours ? Math.min(sleepMinHours, 24) : null };
}

/**
 * Totals, statuses and targets for yesterday plus the six days before, with
 * yesterday's milk by kind, the formula's name, the foods eaten yesterday and over
 * the week: the only data the AI sees (no notes or the baby's name). Null when there is no baby profile.
 */
function buildReviewFacts({ targetsModule, activities, baby, settings, milkProduct, nowMs, utcOffsetMinutes }) {
  const birthDate = baby && toDate(baby.birthDate);
  if (!birthDate) return null;
  const { dayIndex } = localDay(nowMs, utcOffsetMinutes);
  const yesterdayIndex = dayIndex - 1;
  const offsetMs = utcOffsetMinutes * 60 * 1000;
  const dayOf = (date) => Math.floor((date.getTime() + offsetMs) / DAY_MS);

  const endOfYesterday = new Date(dayIndex * DAY_MS - offsetMs - 1);
  const weightKg = targetsModule.latestWeightKg(activities, endOfYesterday);
  const ageDays = yesterdayIndex - dayOf(birthDate);
  const targets = targetsModule.targetsForAgeDays(ageDays, baby.gender, weightKg, settings || undefined);

  const totalsFor = (index) => targetsModule.summarizeDay(activities.filter((a) => dayOf(a.timestamp) === index));
  const yesterday = totalsFor(yesterdayIndex);
  const yesterdayActivities = activities.filter((a) => dayOf(a.timestamp) === yesterdayIndex);
  const earlierActivities = activities.filter((a) => dayOf(a.timestamp) < yesterdayIndex);
  const previousDays = [];
  for (let index = yesterdayIndex - (HISTORY_DAYS - 1); index < yesterdayIndex; index++) {
    previousDays.push({ date: isoDayOf(index), ...totalsFor(index) });
  }

  return {
    day: isoDayOf(yesterdayIndex),
    ageMonths: Math.round(targets.ageMonths * 10) / 10,
    weightKg: weightKg ? Math.round(weightKg * 10) / 10 : null,
    targets: {
      milkMinMl: targets.milk ? targets.milk.minMl : null,
      sleepMinHours: targets.sleep.minHours,
      sleepMaxHours: targets.sleep.maxHours || null,
      solidMinMeals: targets.solids ? targets.solids.minMeals : null
    },
    yesterday,
    status: targetsModule.assessDay(yesterday, targets),
    milkByType: milkByType(yesterdayActivities),
    milkProduct: milkProduct || null,
    solidFoods: solidFoods(yesterdayActivities, earlierActivities),
    weekFoods: weekFoods(activities.filter((a) => dayOf(a.timestamp) <= yesterdayIndex), dayOf),
    previousDays
  };
}

const MAX_FOOD_NAME = 40;
const MAX_FOODS = 30;
// Worst reaction first, so a food the baby reacted to once is reported that way.
const REACTION_ORDER = ['allergic', 'dislike', 'enthusiastic', 'normal'];

const foodName = (activity) => String(activity.details.foodItem || '').replace(/\s+/g, ' ').trim().slice(0, MAX_FOOD_NAME);
const isMilk = (a) => a.type === 'feeding' && a.details.foodType !== 'solid';
const isSolid = (a) => a.type === 'feeding' && a.details.foodType === 'solid';

/** Milk split by kind (breast milk, formula, not given), only the kinds that were logged. */
function milkByType(dayActivities) {
  const result = {};
  for (const activity of dayActivities.filter(isMilk)) {
    const kind = activity.details.milkType === 'breast' || activity.details.milkType === 'formula' ? activity.details.milkType : 'unspecified';
    result[kind] = result[kind] || { feeds: 0, ml: 0 };
    result[kind].feeds += 1;
    result[kind].ml += Number(activity.details.amount) || 0;
  }
  return result;
}

/** Each food eaten that day with meals, grams and the baby's reaction; plus whether it is new this week. */
function solidFoods(dayActivities, earlierActivities) {
  const seenBefore = new Set(earlierActivities.filter(isSolid).map((a) => foodName(a).toLocaleLowerCase()).filter(Boolean));
  const byName = new Map();
  for (const activity of dayActivities.filter(isSolid)) {
    const name = foodName(activity) || '?';
    const entry = byName.get(name.toLocaleLowerCase()) || { name, meals: 0, grams: 0, reaction: 'normal' };
    entry.meals += 1;
    entry.grams += Number(activity.details.amount) || 0;
    const reaction = activity.details.isAllergic ? 'allergic' : activity.details.foodPreference || 'normal';
    if (REACTION_ORDER.indexOf(reaction) !== -1 && REACTION_ORDER.indexOf(reaction) < REACTION_ORDER.indexOf(entry.reaction)) {
      entry.reaction = reaction;
    }
    byName.set(name.toLocaleLowerCase(), entry);
  }
  return [...byName.values()].slice(0, MAX_FOODS).map((entry) => ({
    ...entry,
    newThisWeek: entry.name !== '?' && !seenBefore.has(entry.name.toLocaleLowerCase())
  }));
}

/** Foods eaten over the last seven days with the number of days each was eaten, most frequent first. */
function weekFoods(weekActivities, dayOf) {
  const byName = new Map();
  for (const activity of weekActivities.filter(isSolid)) {
    const name = foodName(activity);
    if (!name) continue;
    const entry = byName.get(name.toLocaleLowerCase()) || { name, days: new Set() };
    entry.days.add(dayOf(activity.timestamp));
    byName.set(name.toLocaleLowerCase(), entry);
  }
  return [...byName.values()]
    .map(({ name, days }) => ({ name, days: days.size }))
    .sort((a, b) => b.days - a.days)
    .slice(0, MAX_FOODS);
}

const MAX_MILK_PRODUCT = 60;
// The formula named in the menu (users/{uid}/settings/feeding), only while formula is the chosen milk.
const milkProductOf = (snap) => {
  const data = snap.exists ? snap.data() : {};
  if (data.defaultMilkType !== 'formula' || typeof data.milkProduct !== 'string') return null;
  return data.milkProduct.replace(/\s+/g, ' ').trim().slice(0, MAX_MILK_PRODUCT) || null;
};

const hasAnyLog = (totals) => totals.milkFeeds + totals.solidMeals + totals.sleeps + totals.wetDiapers + totals.stools > 0;

/** "Hôm qua: sữa đủ · ăn dặm thiếu · ngủ đủ": used when the AI is unavailable. */
function fallbackHeadline(status, language) {
  const messages = pushMessages(language);
  const parts = ['milk', 'solids', 'sleep']
    .filter((key) => status[key] !== 'notApplicable')
    .map((key) => `${messages.reviewLabels[key]} ${messages.reviewStatus[status[key]]}`);
  return parts.join(' · ');
}

async function loadReviewInputs(uid, nowMs, utcOffsetMinutes) {
  const { normalizeActivityRecord } = await loadSchema();
  const { todayStartMs } = localDay(nowMs, utcOffsetMinutes);
  const userRef = db.collection('users').doc(uid);
  const [activitySnap, measurementSnap, babySnap, settingsSnap, feedingSnap] = await Promise.all([
    userRef.collection('activities').where('timestamp', '>=', new Date(todayStartMs - HISTORY_DAYS * DAY_MS)).get(),
    // Weight may have been measured long before the last week.
    userRef.collection('activities').where('type', '==', 'measurement').get(),
    db.collection('babies').doc(uid).get(),
    userRef.collection('settings').doc('dailyTargets').get(),
    userRef.collection('settings').doc('feeding').get()
  ]);

  const byId = new Map();
  for (const doc of [...activitySnap.docs, ...measurementSnap.docs]) {
    const activity = normalizeActivityRecord(doc.id, doc.data(), uid);
    if (activity && activity.timestamp.getTime() < todayStartMs) byId.set(doc.id, activity);
  }
  return {
    activities: [...byId.values()],
    baby: babySnap.exists ? babySnap.data() : null,
    settings: settingsSnap.exists ? sanitizeTargetSettings(settingsSnap.data()) : null,
    milkProduct: milkProductOf(feedingSnap)
  };
}

// The stored review without Firestore-only fields, as the app receives it.
const publicReview = (data) => (data ? {
  day: data.day,
  status: data.status,
  language: data.language || null,
  headline: data.headline || '',
  facts: data.facts || null,
  ai: data.ai || null
} : null);

/** Sends the review to every phone of the family that has notifications on. */
async function sendReviewPush(uid, review) {
  configureWebPush();
  const snapshot = await db.collection('users').doc(uid).collection('pushSubscriptions').where('enabled', '==', true).get();
  let sent = 0;
  for (const subDoc of snapshot.docs) {
    const data = subDoc.data();
    try {
      await webpush.sendNotification(
        { endpoint: data.endpoint, keys: data.keys },
        JSON.stringify({ title: reviewTitleFor(data.language, review.day), body: review.headline, url: '/activities?review=1' })
      );
      sent += 1;
    } catch (error) {
      if (error && (error.statusCode === 404 || error.statusCode === 410)) {
        await subDoc.ref.delete();
      } else {
        console.error('[dailyReview] push failed:', error?.statusCode, error?.message);
      }
    }
  }
  return sent;
}

/**
 * Writes yesterday's review once (concurrent callers get the existing one) and
 * optionally pushes it. `retryAi` rewrites a review whose AI part failed.
 * @returns {Promise<{ review: object|null, created: boolean, pushed: number }>}
 */
async function generateDailyReview(uid, { nowMs = Date.now(), utcOffsetMinutes, language, trigger, push = true, retryAi = false }) {
  const { dayIndex } = localDay(nowMs, utcOffsetMinutes);
  const day = isoDayOf(dayIndex - 1);
  const ref = reviewRef(uid, day);

  const claimed = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.exists ? snapshot.data() : null;
    const pendingElsewhere = data && data.status === 'pending' && nowMs - Number(data.claimedAtMs || 0) < PENDING_MS;
    const canRetry = retryAi && data && data.status === 'done' && !data.ai;
    if (data && (pendingElsewhere || (data.status !== 'pending' && !canRetry))) return { existing: data };
    transaction.set(ref, { day, status: 'pending', claimedAtMs: nowMs, trigger, retried: Boolean(canRetry) }, { merge: true });
    return { existing: null, previous: data };
  });
  if (claimed.existing) return { review: publicReview(claimed.existing), created: false, pushed: 0 };

  const [targetsModule, inputs] = await Promise.all([loadTargets(), loadReviewInputs(uid, nowMs, utcOffsetMinutes)]);
  const facts = buildReviewFacts({ targetsModule, ...inputs, nowMs, utcOffsetMinutes });
  if (!facts || !hasAnyLog(facts.yesterday)) {
    // Nothing logged (or no baby profile): nothing to review, and no retry every few minutes.
    const empty = { day, status: 'empty', trigger, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    await ref.set(empty);
    return { review: publicReview(empty), created: true, pushed: 0 };
  }

  const lang = normalizeLanguage(language);
  let ai = null;
  try {
    if (await consumeAiQuota(uid)) ai = await writeDailyReview(facts, lang);
  } catch (error) {
    console.error('[dailyReview] AI failed:', error?.code, error?.message);
  }

  const review = {
    day,
    status: 'done',
    language: lang,
    trigger,
    facts,
    ai,
    headline: ai ? ai.headline : fallbackHeadline(facts.status, lang),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };
  await ref.set(review);

  // A retry only fills in the AI text; the family was already notified.
  const alreadyPushed = claimed.previous && claimed.previous.pushedAt;
  let pushed = 0;
  if (push && !alreadyPushed) {
    try {
      pushed = await sendReviewPush(uid, review);
      await ref.update({ pushedAt: admin.firestore.FieldValue.serverTimestamp(), pushedCount: pushed });
    } catch (error) {
      console.error('[dailyReview] push error:', error?.message);
    }
  } else if (alreadyPushed) {
    await ref.update({ pushedAt: claimed.previous.pushedAt });
  }
  return { review: publicReview(review), created: true, pushed };
}

/** The stored review of yesterday, or null when it was not written yet. */
async function getDailyReview(uid, { nowMs = Date.now(), utcOffsetMinutes }) {
  const { dayIndex } = localDay(nowMs, utcOffsetMinutes);
  const snapshot = await reviewRef(uid, isoDayOf(dayIndex - 1)).get();
  const data = snapshot.exists ? snapshot.data() : null;
  return data && data.status !== 'pending' ? publicReview(data) : null;
}

async function saveTargetSettings(uid, raw) {
  const settings = sanitizeTargetSettings(raw);
  if (!settings) return null;
  await db.collection('users').doc(uid).collection('settings').doc('dailyTargets').set({
    ...settings,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  return settings;
}

/**
 * Called by the reminder cron for each family with notifications on.
 * @returns {Promise<'outside'|'done'|'waiting'|'sent'>}
 */
async function maybeSendMorningReview(uid, { nowMs = Date.now(), utcOffsetMinutes, language }) {
  const { hour, dayIndex, todayStartMs } = localDay(nowMs, utcOffsetMinutes);
  if (hour < WAKE_FROM_HOUR || hour >= UNTIL_HOUR) return 'outside';

  const existing = await reviewRef(uid, isoDayOf(dayIndex - 1)).get();
  if (existing.exists) {
    const data = existing.data();
    if (data.status !== 'pending' || nowMs - Number(data.claimedAtMs || 0) < PENDING_MS) return 'done';
  }

  let trigger = 'fallback';
  if (hour < FALLBACK_HOUR) {
    const wakeFrom = new Date(todayStartMs + WAKE_FROM_HOUR * 60 * 60 * 1000);
    const { normalizeActivityRecord } = await loadSchema();
    const snapshot = await db.collection('users').doc(uid).collection('activities').where('timestamp', '>=', wakeFrom).get();
    const wokeUp = snapshot.docs.some((doc) => {
      const activity = normalizeActivityRecord(doc.id, doc.data(), uid);
      return activity && activity.type === 'sleep' && activity.timestamp.getTime() <= nowMs;
    });
    if (!wokeUp) return 'waiting';
    trigger = 'wakeUp';
  }

  await generateDailyReview(uid, { nowMs, utcOffsetMinutes, language, trigger, push: true });
  return 'sent';
}

module.exports = {
  WAKE_FROM_HOUR,
  FALLBACK_HOUR,
  UNTIL_HOUR,
  localDay,
  buildReviewFacts,
  fallbackHeadline,
  sanitizeTargetSettings,
  generateDailyReview,
  getDailyReview,
  saveTargetSettings,
  maybeSendMorningReview,
  loadTargets
};
