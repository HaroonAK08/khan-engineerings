/**
 * @deprecated Prefer requiring ../domain/mfg.constants directly.
 * Re-exports for existing expense module imports.
 */
const {
  PRODUCTION_STAGES,
  EXPENSE_CATEGORIES,
  STAGE_IDS,
  CATEGORY_IDS,
  EXPENSE_CATEGORY_GROUPS,
} = require("../domain/mfg.constants");

module.exports = {
  PRODUCTION_STAGES,
  EXPENSE_CATEGORIES,
  STAGE_IDS,
  CATEGORY_IDS,
  EXPENSE_CATEGORY_GROUPS,
};
