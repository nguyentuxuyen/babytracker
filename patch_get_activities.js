const fs = require('fs');
const path = 'src/pages/ActivitiesPageNew.tsx';
let data = fs.readFileSync(path, 'utf8');

data = data.replace(
  "const userActivities = await firestore.getActivities(currentUser.uid);", 
  "const userActivities = await firestore.getActivities(currentUser.uid, 14); // Optimized: Only fetch last 14 days for Home tab"
);

fs.writeFileSync(path, data, 'utf8');
console.log('Patched activities fetch call');
