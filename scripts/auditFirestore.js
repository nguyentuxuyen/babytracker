#!/usr/bin/env node
/**
 * Read-only audit of Firestore data consistency.
 *
 * Scans users/{uid}/activities and babies/{id} and counts records whose
 * shape differs from what the web app expects. It NEVER writes anything.
 *
 * Credentials (same as api/_admin.js, pick one):
 *   FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}'
 *   FIREBASE_SERVICE_ACCOUNT_BASE64=<base64 of the JSON>
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json
 *
 * Usage:
 *   node scripts/auditFirestore.js                 # all users
 *   node scripts/auditFirestore.js --uid <uid>     # one user
 *   node scripts/auditFirestore.js --samples 10    # sample doc ids per issue (default 5)
 *   node scripts/auditFirestore.js --json out.json # also write the full report as JSON
 */

const admin = require('firebase-admin');
const fs = require('fs');

const KNOWN_TYPES = ['feeding', 'diaper', 'sleep', 'bath', 'measurement', 'memo', 'dailyRating'];
const NINE_HOURS_MS = 9 * 60 * 60 * 1000;
const TEN_MINUTES_MS = 10 * 60 * 1000;

const ISSUES = {
    unknownType: 'type không thuộc danh sách chuẩn (dữ liệu cũ, vd "sữa", "thay tã")',
    timestampMissing: 'thiếu timestamp hoặc timestamp không phải Timestamp',
    timezoneShift9h: 'timestamp lệch ~9 tiếng so với createdAt (nghi lỗi múi giờ)',
    babyIdMissing: 'thiếu babyId',
    babyIdNotUid: 'babyId khác uid của user (Thống kê có thể ẩn record này)',
    detailsMissing: 'thiếu details',
    detailsTimeString: 'details.time là chuỗi thay vì Timestamp (offline queue)',
    feedingNoteSingular: 'feeding dùng "note" thay vì "notes" (Siri /api/logMilk)',
    feedingFoodTypeMissing: 'feeding thiếu foodType',
    feedingAmountInvalid: 'feeding có amount thiếu / 0 / không phải số',
    feedingTimeAsAmount: 'feeding có details.time là số (format cũ, time = lượng sữa)',
    sleepDurationMinutes: 'sleep dùng durationMinutes thay vì duration (trợ lý local)',
    sleepDurationInvalid: 'sleep có duration thiếu / 0 / không phải số',
    diaperFlagsMissing: 'diaper thiếu isUrine/isStool (trợ lý)',
    diaperNeitherFlag: 'diaper có isUrine=false và isStool=false',
    diaperStoolColorString: 'diaper có stoolColor dạng chuỗi (form lưu mảng)',
    measurementNonNumber: 'measurement có weight/height/temperature không phải số',
    measurementWeightLooksKg: 'measurement có weight < 100 (nghi nhập kg thay vì g)',
    duplicate: 'trùng lặp (cùng type, cùng phút, cùng details)',
    babyDocLegacy: 'babies/{id} không phải uid của user nào (doc cũ theo email)',
    babyDocNoBirthDate: 'babies/{id} thiếu birthDate hoặc không phải Timestamp'
};

const parseArgs = (argv) => {
    const args = { uid: null, samples: 5, json: null };
    for (let i = 0; i < argv.length; i += 1) {
        if (argv[i] === '--uid') args.uid = argv[++i];
        else if (argv[i] === '--samples') args.samples = Number(argv[++i]) || 5;
        else if (argv[i] === '--json') args.json = argv[++i];
    }
    return args;
};

const initAdmin = () => {
    const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    const rawBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
    const payload = rawJson || (rawBase64 ? Buffer.from(rawBase64, 'base64').toString('utf8') : null);

    if (payload) {
        const serviceAccount = JSON.parse(payload);
        if (typeof serviceAccount.private_key === 'string') {
            serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
        }
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: serviceAccount.project_id
        });
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        admin.initializeApp({ credential: admin.credential.applicationDefault() });
    } else {
        throw new Error('Thiếu credentials: đặt FIREBASE_SERVICE_ACCOUNT, FIREBASE_SERVICE_ACCOUNT_BASE64 hoặc GOOGLE_APPLICATION_CREDENTIALS');
    }
    return admin.firestore();
};

const isTimestamp = (value) => !!value && typeof value.toMillis === 'function';
const isValidNumber = (value) => typeof value === 'number' && Number.isFinite(value);

/** Returns the list of issue keys for one activity document. Pure, no I/O. */
const checkActivity = (uid, data) => {
    const issues = [];
    const details = data.details;

    if (!KNOWN_TYPES.includes(data.type)) issues.push('unknownType');

    if (!isTimestamp(data.timestamp)) {
        issues.push('timestampMissing');
    } else if (isTimestamp(data.createdAt)) {
        const diff = Math.abs(data.timestamp.toMillis() - data.createdAt.toMillis());
        if (Math.abs(diff - NINE_HOURS_MS) < TEN_MINUTES_MS) issues.push('timezoneShift9h');
    }

    if (!data.babyId) issues.push('babyIdMissing');
    else if (data.babyId !== uid) issues.push('babyIdNotUid');

    if (!details || typeof details !== 'object') {
        issues.push('detailsMissing');
        return issues;
    }

    if (typeof details.time === 'string') issues.push('detailsTimeString');

    switch (data.type) {
        case 'feeding':
            if ('note' in details) issues.push('feedingNoteSingular');
            if (!details.foodType) issues.push('feedingFoodTypeMissing');
            if (typeof details.time === 'number') issues.push('feedingTimeAsAmount');
            if (!isValidNumber(details.amount) || details.amount <= 0) issues.push('feedingAmountInvalid');
            break;
        case 'sleep':
            if ('durationMinutes' in details) issues.push('sleepDurationMinutes');
            if (!isValidNumber(details.duration) || details.duration <= 0) issues.push('sleepDurationInvalid');
            break;
        case 'diaper':
            if (!('isUrine' in details) || !('isStool' in details)) issues.push('diaperFlagsMissing');
            else if (!details.isUrine && !details.isStool) issues.push('diaperNeitherFlag');
            if (typeof details.stoolColor === 'string') issues.push('diaperStoolColorString');
            break;
        case 'measurement': {
            const fields = ['weight', 'height', 'temperature'];
            if (fields.some((f) => details[f] != null && !isValidNumber(details[f]))) {
                issues.push('measurementNonNumber');
            }
            if (isValidNumber(details.weight) && details.weight > 0 && details.weight < 100) {
                issues.push('measurementWeightLooksKg');
            }
            break;
        }
        default:
            break;
    }

    return issues;
};

/** Key used to spot duplicates: same type, same minute, same details. */
const duplicateKey = (data) => {
    if (!isTimestamp(data.timestamp)) return null;
    const minute = Math.floor(data.timestamp.toMillis() / 60000);
    const { time, ...rest } = data.details || {};
    const stable = JSON.stringify(rest, Object.keys(rest).sort());
    return `${data.type}|${minute}|${stable}`;
};

const createReport = (samplesLimit) => {
    const report = { totals: { users: 0, activities: 0, babies: 0, cleanActivities: 0 }, issues: {}, typeCounts: {} };
    Object.keys(ISSUES).forEach((key) => {
        report.issues[key] = { description: ISSUES[key], count: 0, samples: [] };
    });
    report.add = (key, path) => {
        const entry = report.issues[key];
        entry.count += 1;
        if (entry.samples.length < samplesLimit) entry.samples.push(path);
    };
    return report;
};

const auditUser = async (db, uid, report) => {
    const snapshot = await db.collection('users').doc(uid).collection('activities').get();
    const seen = new Map();

    snapshot.forEach((doc) => {
        const data = doc.data();
        const path = `users/${uid}/activities/${doc.id}`;
        report.totals.activities += 1;
        report.typeCounts[String(data.type)] = (report.typeCounts[String(data.type)] || 0) + 1;

        const issues = checkActivity(uid, data);
        const key = duplicateKey(data);
        if (key) {
            if (seen.has(key)) issues.push('duplicate');
            else seen.set(key, doc.id);
        }

        if (issues.length === 0) report.totals.cleanActivities += 1;
        issues.forEach((issue) => report.add(issue, path));
    });
};

const auditBabies = async (db, uids, report) => {
    const snapshot = await db.collection('babies').get();
    snapshot.forEach((doc) => {
        const data = doc.data();
        const path = `babies/${doc.id}`;
        report.totals.babies += 1;
        if (!uids.has(doc.id)) report.add('babyDocLegacy', path);
        if (!isTimestamp(data.birthDate)) report.add('babyDocNoBirthDate', path);
    });
};

const printReport = (report) => {
    const { totals } = report;
    console.log('\n=== Firestore audit (read-only) ===');
    console.log(`Users: ${totals.users} | Activities: ${totals.activities} | Babies docs: ${totals.babies}`);
    console.log(`Activities không có lỗi nào: ${totals.cleanActivities}/${totals.activities}`);
    console.log('\nSố record theo type:');
    Object.entries(report.typeCounts)
        .sort((a, b) => b[1] - a[1])
        .forEach(([type, count]) => console.log(`  ${type.padEnd(14)} ${count}`));

    console.log('\nLỗi (sắp theo số lượng):');
    Object.entries(report.issues)
        .filter(([, entry]) => entry.count > 0)
        .sort((a, b) => b[1].count - a[1].count)
        .forEach(([key, entry]) => {
            console.log(`  ${String(entry.count).padStart(6)}  ${key} — ${entry.description}`);
            entry.samples.forEach((sample) => console.log(`            ${sample}`));
        });
    const anyIssue = Object.values(report.issues).some((entry) => entry.count > 0);
    if (!anyIssue) console.log('  Không tìm thấy lỗi nào.');
};

const main = async () => {
    const args = parseArgs(process.argv.slice(2));
    const db = initAdmin();
    const report = createReport(args.samples);

    // listDocuments() also returns users that only have subcollections (no fields).
    const userRefs = args.uid
        ? [db.collection('users').doc(args.uid)]
        : await db.collection('users').listDocuments();
    const uids = new Set(userRefs.map((ref) => ref.id));
    report.totals.users = uids.size;

    for (const ref of userRefs) {
        process.stderr.write(`Đang quét users/${ref.id} ...\n`);
        await auditUser(db, ref.id, report);
    }
    if (!args.uid) await auditBabies(db, uids, report);

    printReport(report);

    if (args.json) {
        const { add, ...serializable } = report;
        fs.writeFileSync(args.json, JSON.stringify(serializable, null, 2));
        console.log(`\nĐã ghi báo cáo JSON: ${args.json}`);
    }
};

if (require.main === module) {
    main().catch((error) => {
        console.error('Audit thất bại:', error.message);
        process.exit(1);
    });
}

module.exports = { checkActivity, duplicateKey };
