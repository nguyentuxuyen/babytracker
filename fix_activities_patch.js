const fs = require('fs');

let code = fs.readFileSync('src/pages/ActivitiesPageNew.tsx', 'utf8');

const regex = /const fetchedActivities = await firestore\.getActivities\(currentUser\.uid, loadedDays\);\s+\/\/ Convert Firebase activities to local format and normalize types/;

const replacement = `const fetchedActivities = await firestore.getActivities(currentUser.uid, loadedDays);`;

if (!code.match(regex)) {
    // If it's not containing the normalizer comment, we must inject it!
    const badRegex = /const userActivities = await firestore\.getActivities\(currentUser\.uid, \d+\);\s+setActivities\(fetchedActivities\);/;
    // Actually, earlier grep showed that "const userActivities = await firestore.getActivities(currentUser.uid, loadedDays);" exists!
    // Let me just regex replace the setActivities inside fetchActivities.
}
