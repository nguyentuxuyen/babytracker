const { db } = require('./_admin');

/**
 * Milk feeds logged without a kind (Siri shortcut, assistant) get the kind the parents
 * set in the menu (users/{uid}/settings/feeding.defaultMilkType), so the morning review
 * can tell breast milk from formula.
 */
async function withDefaultMilkType(uid, type, details) {
  if (type !== 'feeding' || !details || details.foodType === 'solid' || details.milkType) return details;
  try {
    const snap = await db.collection('users').doc(uid).collection('settings').doc('feeding').get();
    const milkType = snap.exists ? snap.data().defaultMilkType : null;
    return milkType === 'breast' || milkType === 'formula' ? { ...details, milkType } : details;
  } catch (error) {
    console.error('[feedingSettings] could not read the default milk type:', error);
    return details;
  }
}

module.exports = { withDefaultMilkType };
