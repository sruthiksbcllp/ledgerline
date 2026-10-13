'use strict';
const express = require('express');
const router = express.Router();
const ec = require('../controllers/enterprise.controller');
const { verifyToken, requireSeniorAdmin } = require('../middleware/auth.middleware');
const { tenantMiddleware } = require('../middleware/tenantMiddleware');

router.use(verifyToken);
router.use(tenantMiddleware);

// Gap 3: Component Replacement
router.post('/components/:id/replace', ec.replaceComponent);
router.get('/components/:parentId/replacement-history', ec.getReplacementHistory);

// Gap 4: Revaluation
router.post('/revaluation', ec.revalueAsset);
router.get('/revaluation/:assetId/history', ec.getRevaluationHistory);

// Gap 5: Inter-company Transfer
router.get('/transfers', ec.getTransfers);
router.post('/transfers', ec.createTransfer);
router.put('/transfers/:id/action', ec.approveTransfer);

// Gap 5 actions
router.post('/transfers/:id/approve', ec.approveTransfer);
router.post('/transfers/:id/reject', ec.approveTransfer);

// Gap 6: Asset Merge
router.post('/merge', ec.mergeAssets);

// Gap 7: Advanced Depreciation
router.post('/depreciation/calculate', ec.calculateDepreciation);

// Gap 9: Forecasting
router.get('/forecast/replacement', ec.getReplacementForecast);
router.post('/forecast/what-if', ec.getWhatIfScenario);

// Gap 10: Cost Centers
router.get('/cost-centers', ec.getCostCenters);
router.post('/cost-centers', ec.createCostCenter);
router.put('/cost-centers/:id', ec.updateCostCenter);
router.post('/cost-centers/import', ec.importCostCenters);
router.post('/cost-centers/allocate', ec.allocateAssetToCostCenters);
router.get('/cost-centers/asset/:assetId', ec.getAssetAllocations);

// Gap 11: GL Account Mapping
router.get('/gl-mappings', ec.getGLMappings);
router.post('/gl-mappings', ec.upsertGLMapping);
router.post('/gl-mappings/import', ec.importGLMappings);
router.delete('/gl-mappings/:id', ec.deleteGLMapping);

// Gap 12: FAR Period Lock — locking a statutory period is Super-Admin-only (plain Admin excluded).
router.post('/far/lock-period', requireSeniorAdmin, ec.lockPeriod);
router.get('/far/period-locks', ec.getPeriodLocks);

// Gap 13: Audit Findings
router.get('/audit-findings', ec.getFindings);
router.post('/audit-findings', ec.createFinding);
router.put('/audit-findings/:id', ec.updateFinding);

// Gap 14: Compliance Calendar
router.get('/compliance-calendar', ec.getComplianceCalendar);
router.post('/compliance-calendar', ec.upsertComplianceItem);

// Gap 16: SOD
router.get('/sod/rules', ec.getSODRules);
router.post('/sod/rules', ec.createSODRule);
router.post('/sod/seed', ec.seedSODRules);
router.get('/sod/violations', ec.getSODViolations);

// Gap 21: Disposal Bids
router.get('/disposal/:disposalId/bids', ec.getDisposalBids);
router.post('/disposal/:disposalId/bids', ec.addDisposalBid);
router.post('/disposal/:disposalId/bids/:bidId/select', ec.selectBid);

// Gap 8: Budgetary -> FAR conversion
router.post('/budgetary/:asset_id/convert-to-far', ec.convertBudgetaryToFAR);

// Gap 15: Approval quorum check
router.get('/approvals/:module/:entity_id/quorum', ec.checkApprovalQuorum);

// Gap 20: Request escalation
router.post('/requests/:request_id/escalate', ec.escalateRequest);

module.exports = router;
