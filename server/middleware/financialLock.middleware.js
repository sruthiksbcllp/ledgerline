const AppError = require('../utils/appError');
const { isClosed, toFiscalYear } = require('../services/financialPeriod.service');

const pickDate = (req) => {
  const body = req.body || {};
  return (
    body.fiscal_date ||
    body.invoice_date ||
    body.purchase_date ||
    body.disposal_date ||
    body.put_to_use_date ||
    body.posting_date ||
    new Date()
  );
};

exports.blockWhenFinancialYearClosed = async (req, res, next) => {
  try {
    const explicitYear = req.body?.fiscal_year || req.query?.fiscal_year;
    const year = explicitYear || toFiscalYear(pickDate(req));
    const closed = await isClosed(year);
    if (closed) {
      throw new AppError(`Financial year ${year} is closed. Write operations are blocked.`, 423);
    }
    next();
  } catch (error) {
    next(error);
  }
};
