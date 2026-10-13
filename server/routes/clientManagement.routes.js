const express = require('express');
const router = express.Router();
const clientCtrl = require('../controllers/clientManagement.controller');
const { protect, requireProviderAdmin } = require('../middleware/auth.middleware');
const { requireMfaForPrivileged } = require('../middleware/mfa.middleware');

router.use(protect);
router.use(requireMfaForPrivileged);
router.use(requireProviderAdmin);

// Clients
router.get('/clients', clientCtrl.getClients);
router.post('/clients', clientCtrl.createClient);
router.get('/clients/:id/purge-preview', clientCtrl.previewClientTenantPurge);
router.get('/clients/:id/dry-run-delete', clientCtrl.previewClientTenantPurge);
router.delete('/clients/:id', clientCtrl.deleteClientTenantData);

// Licenses
router.get('/licenses', clientCtrl.getLicenses);
router.post('/licenses', clientCtrl.createLicense);
router.put('/licenses/:id', clientCtrl.updateLicense);
router.get('/licenses/check-limits', clientCtrl.checkLicenseLimits);

// Support
router.get('/support', clientCtrl.getSupportTickets);
router.post('/support', clientCtrl.createSupportTicket);

module.exports = router;
