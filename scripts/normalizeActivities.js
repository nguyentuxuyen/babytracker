#!/usr/bin/env node
/**
 * Rewrite activity documents into the canonical shape defined in
 * src/domain/activitySchema.mjs (the same code the app and the API use).
 *
 * Dry run by default: prints what would change and writes nothing.
 *
 *   node scripts/normalizeActivities.js                 # all users, dry run
 *   node scripts/normalizeActivities.js --uid <uid>     # one user
 *   node scripts/normalizeActivities.js --apply         # write changes
 *
 * --apply first saves every document it will change to
 * normalize-backup-<timestamp>.json (or --backup <file>), so a run can be undone.
 * Documents with an unknown type or no usable timestamp are reported, never changed.
 *
 * Credentials: FIREBASE_SERVICE_ACCOUNT, FIREBASE_SERVICE_ACCOUNT_BASE64 or
 * GOOGLE_APPLICATION_CREDENTIALS (same as api/_admin.js).
 */

const fs = require('fs');
const admin = require('firebase-admin');
// Filled in run(): the schema is an ES module (src/domain/activitySchema.mjs).
let SCHEMA_VERSION;
let ACTIVITY_TYPES;
let normalizeActivityRecord;
let buildActivityDoc;

const args = process.argv.slice(2);
const argValue = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const APPLY = args.includes('--apply');
const ONLY_UID = argValue('--uid');
const BACKUP_FILE = argValue('--backup') || `normalize-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;

const initAdmin = () => {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
    || (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64
      && Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8'));
  if (raw) {
    const serviceAccount = JSON.parse(raw);
    if (typeof serviceAccount.private_key === 'string') {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: serviceAccount.project_id });
  } else {
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
  }
  return admin.firestore();
};

// JSON-comparable form of a stored or built document (Timestamps → ms).
const comparable = (value) => JSON.stringify(value, (key, val) => {
  if (val && typeof val === 'object' && typeof val.toDate === 'function') return val.toDate().getTime();
  if (val && typeof val === 'object' && typeof val._seconds === 'number') return val._seconds * 1000 + Math.round(val._nanoseconds / 1e6);
  return val;
});

// Fields the app writes; anything else on an activity document is legacy and removed.
const canonicalFields = (data, uid) => {
  const record = normalizeActivityRecord('x', data, uid);
  if (!record || !ACTIVITY_TYPES.includes(record.type)) return null;
  const built = buildActivityDoc({ babyId: uid, type: record.type, timestamp: record.timestamp, details: record.details });
  return built;
};

const run = async () => {
  ({ SCHEMA_VERSION, ACTIVITY_TYPES, normalizeActivityRecord, buildActivityDoc } = await import('../src/domain/activitySchema.mjs'));
  const db = initAdmin();
  const userIds = ONLY_UID
    ? [ONLY_UID]
    : Array.from(new Set((await db.collectionGroup('activities').select().get()).docs
      .map((doc) => doc.ref.parent.parent && doc.ref.parent.parent.id)
      .filter(Boolean)));

  const summary = { scanned: 0, alreadyCanonical: 0, toChange: 0, skipped: 0, written: 0 };
  const changes = [];
  const skipped = [];

  for (const uid of userIds) {
    const snapshot = await db.collection('users').doc(uid).collection('activities').get();
    for (const doc of snapshot.docs) {
      summary.scanned += 1;
      const data = doc.data();
      let built;
      try {
        built = canonicalFields(data, uid);
      } catch (error) {
        built = null;
      }
      if (!built) {
        summary.skipped += 1;
        skipped.push({ path: doc.ref.path, type: data.type, reason: 'unknown type, missing timestamp or out-of-range values' });
        continue;
      }
      const current = { babyId: data.babyId, type: data.type, timestamp: data.timestamp, details: data.details, schemaVersion: data.schemaVersion };
      if (comparable(current) === comparable(built)) {
        summary.alreadyCanonical += 1;
        continue;
      }
      summary.toChange += 1;
      changes.push({ ref: doc.ref, before: data, after: built });
    }
  }

  console.log(`Users: ${userIds.length}`);
  console.log(summary);
  changes.slice(0, 10).forEach(({ ref, before, after }) => {
    console.log(`\n${ref.path}\n  before: ${comparable({ type: before.type, details: before.details, babyId: before.babyId })}\n  after:  ${comparable({ type: after.type, details: after.details, babyId: after.babyId })}`);
  });
  if (skipped.length) {
    console.log('\nSkipped (left untouched):');
    skipped.slice(0, 20).forEach((item) => console.log(`  ${item.path} type=${JSON.stringify(item.type)}`));
  }

  if (!APPLY) {
    console.log(`\nDry run. Re-run with --apply to rewrite ${changes.length} document(s) to schema v${SCHEMA_VERSION}.`);
    return;
  }

  fs.writeFileSync(BACKUP_FILE, comparable(changes.map(({ ref, before }) => ({ path: ref.path, data: before }))));
  console.log(`\nBackup of ${changes.length} document(s) written to ${BACKUP_FILE}`);

  for (let i = 0; i < changes.length; i += 400) {
    const batch = db.batch();
    changes.slice(i, i + 400).forEach(({ ref, before, after }) => {
      // Replace the whole document, keeping createdAt/updatedAt.
      batch.set(ref, {
        ...after,
        ...(before.createdAt ? { createdAt: before.createdAt } : {}),
        ...(before.updatedAt ? { updatedAt: before.updatedAt } : {}),
        normalizedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });
    await batch.commit();
    summary.written += Math.min(400, changes.length - i);
  }
  console.log(`Rewrote ${summary.written} document(s).`);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
