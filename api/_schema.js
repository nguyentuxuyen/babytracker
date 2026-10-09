// The activity schema is an ES module shared with the React app
// (src/domain/activitySchema.mjs). CommonJS functions load it with a dynamic import.
let schemaPromise = null;

const loadSchema = () => {
  if (!schemaPromise) schemaPromise = import('../src/domain/activitySchema.mjs');
  return schemaPromise;
};

const isActivityValidationError = (error) => Boolean(error && error.code === 'ACTIVITY_INVALID');

module.exports = { loadSchema, isActivityValidationError };
