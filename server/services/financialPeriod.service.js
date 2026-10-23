const { FinancialPeriod } = require('../models');

const toFiscalYear = (dateInput = new Date()) => {
  const date = new Date(dateInput);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const startYear = month >= 4 ? year : year - 1;
  const endYY = String((startYear + 1) % 100).padStart(2, '0');
  return `${startYear}-${endYY}`;
};

const ensurePeriodExists = async (year) => {
  try {
    const [period] = await FinancialPeriod.findOrCreate({
      where: { year },
      defaults: { year, is_closed: false }
    });
    return period;
  } catch (error) {
    console.warn(`[FinancialLock] FinancialPeriods unavailable, defaulting open period for ${year}:`, error.message);
    return { year, is_closed: false };
  }
};

const isClosed = async (year) => {
  const period = await ensurePeriodExists(year);
  return Boolean(period?.is_closed);
};

module.exports = {
  toFiscalYear,
  ensurePeriodExists,
  isClosed
};
