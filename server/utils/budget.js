const { Budget, PurchaseRequisition } = require('../models');
const AppError = require('./appError');

/**
 * Checks if a PR amount fits within the remaining budget for a department/category
 */
exports.checkBudget = async (department_id, category_id, amount) => {
  const budget = await Budget.findOne({
    where: { 
      department_id, 
      category_id,
      financial_year: '2024-25' // Defaulting to current FY
    }
  });

  if (!budget) {
    // If no budget is set, we might want to warn or block based on strictness
    // For now, we'll return a warning state
    return { allowed: true, warning: 'No budget allocated for this category' };
  }

  const remaining = budget.allocated_amount - budget.utilized_amount;
  
  if (amount > remaining) {
    return { 
      allowed: false, 
      error: `Budget Exceeded. Remaining: ${remaining}, Requested: ${amount}` 
    };
  }

  return { allowed: true, remaining };
};
