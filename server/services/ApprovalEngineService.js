'use strict';
/**
 * DEPRECATED & RETIRED — FT-002 Batch 2B-1 (D7).
 * This legacy approval service was client-blind in getApprovalChain/checkAllApproved and wrote
 * invalid ApprovalLog ENUM values ('REQUESTED'/'PENDING'). It is referenced nowhere in the codebase.
 * The canonical engine is services/approvalEngine.js (tenant-aware, attributed, atomic).
 * Kept as an empty stub only because the deployment filesystem blocked file deletion; safe to delete.
 */
module.exports = {};
