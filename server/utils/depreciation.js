/**
 * Enterprise Depreciation Engine
 * - Methods: SLM + WDV
 * - Supports monthly pro-rata postings
 */

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;

const getYearDays = (year) => {
  const start = new Date(year, 0, 1);
  const end = new Date(year + 1, 0, 1);
  return Math.round((end - start) / (1000 * 60 * 60 * 24));
};

const daysBetweenInclusive = (fromDate, toDate) => {
  const from = new Date(fromDate);
  const to = new Date(toDate);
  if (to < from) return 0;
  return Math.floor((to - from) / (1000 * 60 * 60 * 24)) + 1;
};

const calculateAnnualDepreciation = ({
  openingValue,
  residualValue = 0,
  usefulLifeYears,
  method = 'SLM',
  wdvRate = null
}) => {
  const opening = Number(openingValue || 0);
  const residual = Number(residualValue || 0);
  const life = Number(usefulLifeYears || 0);

  if (opening <= 0) return 0;

  if (method === 'SLM') {
    if (opening <= residual || life <= 0) return 0;
    return (opening - residual) / life;
  }

  if (method === 'WDV') {
    // Depreciation = Opening WDV × Rate / 100
    // If rate is not provided, we fallback to a derived rate but strictly avoid residual in WDV as requested
    const rate = wdvRate !== null ? Number(wdvRate) : (100 / (life || 1)); 
    return (opening * rate) / 100;
  }

  return 0;
};

exports.calculateAnnualDepreciation = calculateAnnualDepreciation;

exports.calculateMonthlyDepreciation = ({
  openingValue,
  residualValue = 0,
  usefulLifeYears,
  method = 'SLM',
  monthStartDate,
  monthEndDate,
  inServiceStartDate,
  inServiceEndDate,
  wdvRate = null
}) => {
  const monthStart = new Date(monthStartDate);
  const monthEnd = new Date(monthEndDate);
  const serviceStart = new Date(inServiceStartDate);
  const serviceEnd = inServiceEndDate ? new Date(inServiceEndDate) : monthEnd;

  const activeStart = serviceStart > monthStart ? serviceStart : monthStart;
  const activeEnd = serviceEnd < monthEnd ? serviceEnd : monthEnd;

  const totalMonthDays = daysBetweenInclusive(monthStart, monthEnd);
  const usedDays = daysBetweenInclusive(activeStart, activeEnd);
  if (totalMonthDays <= 0 || usedDays <= 0) {
    return { depreciationAmount: 0, isProrata: false, prorataDays: 0 };
  }

  const yearDays = getYearDays(monthStart.getFullYear());
  const annualDep = calculateAnnualDepreciation({
    openingValue,
    residualValue,
    usefulLifeYears,
    method,
    wdvRate
  });


  const monthlyDep = annualDep * (usedDays / yearDays);
  return {
    depreciationAmount: round2(monthlyDep),
    isProrata: usedDays !== totalMonthDays,
    prorataDays: usedDays
  };
};

exports.generateSchedule = ({
  originalCost,
  residualValue = 0,
  usefulLifeYears,
  method = 'SLM',
  wdvRate = null
}) => {
  const schedule = [];
  let opening = Number(originalCost || 0);
  const residual = Number(residualValue || 0);
  const life = Number(usefulLifeYears || 0);

  for (let year = 1; year <= life; year += 1) {
    const annualDep = calculateAnnualDepreciation({
      openingValue: opening,
      residualValue: residual,
      usefulLifeYears: life,
      method,
      wdvRate
    });

    // For SLM, we still honor residual. For WDV, we use opening * rate / 100.
    const dep = method === 'WDV' ? annualDep : Math.min(opening - residual, annualDep);
    const closing = round2(opening - dep);
    
    schedule.push({
      year,
      opening_wdv: round2(opening),
      depreciation: round2(dep),
      closing_wdv: closing
    });
    
    opening = closing;
    if (opening <= 0) break;
  }

  return schedule;
};
