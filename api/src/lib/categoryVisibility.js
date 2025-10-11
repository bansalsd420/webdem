// categoryVisibility.js
// Feature removed: this module is intentionally kept as a harmless stub
// to avoid hard crashes in environments that may still import it.
// All visibility enforcement has been removed from the application code.

// Export a minimal harmless API to avoid runtime errors where imports may linger.
const noop = () => null;

export const hiddenCategorySet = noop;
export const isHiddenByCategoryIds = () => false;
export const filterItemsByVisibility = (items) => items || [];
export const invalidateVisibilityCache = noop;
export const expandDescendants = async () => new Set();

export default {
  hiddenCategorySet,
  isHiddenByCategoryIds,
  filterItemsByVisibility,
  invalidateVisibilityCache,
  expandDescendants,
};
