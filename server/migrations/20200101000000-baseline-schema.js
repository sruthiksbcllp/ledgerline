'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const q = queryInterface;

    await q.sequelize.query(`SET FOREIGN_KEY_CHECKS=0`);

    // 1. roles
    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`roles\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`code\` varchar(255) NOT NULL,
        \`name\` varchar(255) NOT NULL,
        \`description\` varchar(255) DEFAULT NULL,
        \`level\` int DEFAULT '0',
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`code\` (\`code\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 2. entities
    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`entities\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`entity_name\` varchar(255) NOT NULL,
        \`entity_code\` varchar(255) DEFAULT NULL,
        \`address\` text,
        \`gst_number\` varchar(255) DEFAULT NULL,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`entity_code\` (\`entity_code\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 3. clients
    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`clients\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`client_name\` varchar(255) NOT NULL,
        \`contact_person\` varchar(255) DEFAULT NULL,
        \`email\` varchar(255) DEFAULT NULL,
        \`phone\` varchar(255) DEFAULT NULL,
        \`company_type\` varchar(50) DEFAULT NULL,
        \`created_at\` datetime DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 4. propertytypes
    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`propertytypes\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`type_name\` varchar(255) NOT NULL,
        \`description\` text,
        \`status\` enum('ACTIVE','INACTIVE') DEFAULT 'ACTIVE',
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 5. regions
    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`regions\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`region_name\` varchar(255) NOT NULL,
        \`region_code\` varchar(255) NOT NULL,
        \`country\` varchar(255) DEFAULT NULL,
        \`description\` text,
        \`status\` enum('ACTIVE','INACTIVE') DEFAULT 'ACTIVE',
        \`client_id\` int DEFAULT NULL,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`region_code\` (\`region_code\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 6. departments
    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`departments\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`dept_name\` varchar(255) NOT NULL,
        \`dept_code\` varchar(255) NOT NULL,
        \`description\` text,
        \`status\` enum('ACTIVE','INACTIVE') DEFAULT 'ACTIVE',
        \`client_id\` int DEFAULT NULL,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`dept_code\` (\`dept_code\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 7. subdepartments
    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`subdepartments\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`sub_dept_name\` varchar(255) NOT NULL,
        \`department_id\` int NOT NULL,
        \`description\` text,
        \`status\` enum('ACTIVE','INACTIVE') DEFAULT 'ACTIVE',
        \`client_id\` int DEFAULT NULL,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 8. serviceproviders
    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`serviceproviders\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`provider_name\` varchar(255) NOT NULL,
        \`contact_person\` varchar(255) NOT NULL,
        \`phone\` varchar(20) NOT NULL,
        \`email\` varchar(255) NOT NULL,
        \`address\` text,
        \`services_offered\` text,
        \`gst_number\` varchar(20) DEFAULT NULL,
        \`pan_number\` varchar(20) DEFAULT NULL,
        \`status\` enum('ACTIVE','INACTIVE') DEFAULT 'ACTIVE',
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 9. properties
    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`properties\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`property_name\` varchar(255) NOT NULL,
        \`property_type_id\` int NOT NULL,
        \`building_block\` varchar(255) DEFAULT NULL,
        \`address\` text,
        \`region_id\` int DEFAULT NULL,
        \`description\` text,
        \`status\` enum('ACTIVE','INACTIVE') DEFAULT 'ACTIVE',
        \`client_id\` int DEFAULT NULL,
        \`code\` varchar(255) DEFAULT NULL,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`code\` (\`code\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 10. locations
    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`locations\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`location_name\` varchar(255) NOT NULL,
        \`location_code\` varchar(255) NOT NULL,
        \`region_id\` int DEFAULT NULL,
        \`property_id\` int DEFAULT NULL,
        \`full_address\` text,
        \`pincode\` varchar(10) DEFAULT NULL,
        \`status\` enum('ACTIVE','INACTIVE') DEFAULT 'ACTIVE',
        \`client_id\` int DEFAULT NULL,
        \`parent_id\` int DEFAULT NULL,
        \`type\` varchar(50) DEFAULT NULL,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`location_code\` (\`location_code\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 11. asset_categories
    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`asset_categories\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`category_name\` varchar(255) NOT NULL,
        \`category_description\` text,
        \`parent_id\` int DEFAULT NULL,
        \`status\` enum('ACTIVE','INACTIVE') DEFAULT 'ACTIVE',
        \`code\` varchar(255) DEFAULT NULL,
        \`client_id\` int DEFAULT NULL,
        \`useful_life\` int DEFAULT NULL,
        \`depreciation_method\` varchar(50) DEFAULT NULL,
        \`depreciation_rate\` decimal(5,2) DEFAULT NULL,
        \`companies_act_life\` int DEFAULT NULL,
        \`companies_act_method\` enum('SLM','WDV') DEFAULT 'SLM',
        \`companies_act_residual_percent\` decimal(5,2) DEFAULT NULL,
        \`it_act_rate\` decimal(5,2) DEFAULT NULL,
        \`it_act_block\` varchar(255) DEFAULT NULL,
        \`wdv_rate\` decimal(5,2) DEFAULT NULL,
        \`pm_interval_days\` int DEFAULT NULL,
        \`schedule_ii_class\` varchar(100) DEFAULT NULL,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`code\` (\`code\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 12. assetsubcategories
    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`asset_sub_categories\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`sub_category_name\` varchar(255) NOT NULL,
        \`category_id\` int NOT NULL,
        \`description\` text,
        \`status\` enum('ACTIVE','INACTIVE') DEFAULT 'ACTIVE',
        \`client_id\` int DEFAULT NULL,
        \`schedule_ii_class\` varchar(100) DEFAULT NULL,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 13. assetstatuses
    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`asset_statuses\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`status_name\` varchar(255) NOT NULL,
        \`status_color\` varchar(7) DEFAULT NULL,
        \`description\` text,
        \`display_order\` int DEFAULT NULL,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 14. maintenancetypes
    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`maintenancetypes\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`type_name\` varchar(255) NOT NULL,
        \`description\` text,
        \`code\` varchar(50) DEFAULT NULL,
        \`status\` enum('ACTIVE','INACTIVE') DEFAULT 'ACTIVE',
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 15. users
    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`users\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`first_name\` varchar(255) NOT NULL,
        \`last_name\` varchar(255) NOT NULL,
        \`email\` varchar(255) NOT NULL,
        \`employee_id\` varchar(255) NOT NULL,
        \`username\` varchar(255) NOT NULL,
        \`password_hash\` varchar(255) NOT NULL,
        \`role_id\` int NOT NULL,
        \`entity_id\` int DEFAULT NULL,
        \`property_id\` int DEFAULT NULL,
        \`client_id\` int DEFAULT NULL,
        \`user_level\` enum('Level 1','Level 2','Level 3','Level 4') DEFAULT 'Level 1',
        \`status\` enum('ACTIVE','INACTIVE') DEFAULT 'ACTIVE',
        \`last_login\` datetime DEFAULT NULL,
        \`refresh_token_hash\` varchar(255) DEFAULT NULL,
        \`mfa_enabled\` tinyint(1) DEFAULT '0',
        \`mfa_secret\` varchar(255) DEFAULT NULL,
        \`mfa_last_verified_at\` datetime DEFAULT NULL,
        \`reset_token\` varchar(255) DEFAULT NULL,
        \`reset_token_expiry\` datetime DEFAULT NULL,
        \`failed_login_attempts\` int DEFAULT '0',
        \`locked_until\` datetime DEFAULT NULL,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`email\` (\`email\`),
        UNIQUE KEY \`employee_id\` (\`employee_id\`),
        UNIQUE KEY \`username\` (\`username\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 16. rolepermissions
    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`rolepermissions\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`role_id\` int NOT NULL,
        \`section\` varchar(255) NOT NULL,
        \`can_add\` tinyint(1) DEFAULT '0',
        \`can_edit\` tinyint(1) DEFAULT '0',
        \`can_delete\` tinyint(1) DEFAULT '0',
        \`can_view\` tinyint(1) DEFAULT '0',
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`unique_role_section\` (\`role_id\`,\`section\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 17. user_roles
    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`user_roles\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`user_id\` int NOT NULL,
        \`role_id\` int NOT NULL,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`user_roles_user_id_role_id_unique\` (\`user_id\`,\`role_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 18. vendors
    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`vendors\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`vendor_name\` varchar(255) NOT NULL,
        \`vendor_code\` varchar(255) DEFAULT NULL,
        \`gst_number\` varchar(15) DEFAULT NULL,
        \`pan_number\` varchar(10) DEFAULT NULL,
        \`contact_person\` varchar(255) DEFAULT NULL,
        \`email\` varchar(255) DEFAULT NULL,
        \`phone\` varchar(255) DEFAULT NULL,
        \`address\` text,
        \`bank_name\` varchar(255) DEFAULT NULL,
        \`bank_account_no\` varchar(255) DEFAULT NULL,
        \`ifsc_code\` varchar(255) DEFAULT NULL,
        \`status\` enum('DRAFT','ACTIVE','BLACKLISTED') DEFAULT 'DRAFT',
        \`client_id\` int DEFAULT NULL,
        \`code\` varchar(255) DEFAULT NULL,
        \`gst_registered_state_code\` varchar(2) DEFAULT NULL,
        \`gst_expiry_date\` datetime DEFAULT NULL,
        \`contract_expiry_date\` datetime DEFAULT NULL,
        \`compliance_docs_expiry_date\` datetime DEFAULT NULL,
        \`compliance_risk_score\` int NOT NULL DEFAULT '0',
        \`compliance_risk_band\` varchar(20) NOT NULL DEFAULT 'LOW',
        \`tds_section_code\` varchar(20) DEFAULT NULL,
        \`tds_rate_percent\` decimal(5,2) NOT NULL DEFAULT '2.00',
        \`gstin_status\` varchar(30) NOT NULL DEFAULT 'UNVERIFIED',
        \`gstin_validated_at\` datetime DEFAULT NULL,
        \`msme_expiry_date\` date DEFAULT NULL,
        \`pan_verified\` tinyint(1) NOT NULL DEFAULT '0',
        \`compliance_score\` int NOT NULL DEFAULT '100',
        \`compliance_last_checked\` datetime DEFAULT NULL,
        \`risk_level\` varchar(20) DEFAULT 'LOW',
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`vendor_code\` (\`vendor_code\`),
        UNIQUE KEY \`code\` (\`code\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 19. assets
    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`assets\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`asset_name\` varchar(255) NOT NULL,
        \`asset_code\` varchar(255) DEFAULT NULL,
        \`asset_description\` text,
        \`property_id\` int DEFAULT NULL,
        \`asset_type\` enum('OWNED','LEASED','RENTED','HIRED') DEFAULT 'OWNED',
        \`category_id\` int DEFAULT NULL,
        \`sub_category_id\` int DEFAULT NULL,
        \`department_id\` int DEFAULT NULL,
        \`sub_department_id\` int DEFAULT NULL,
        \`region_id\` int DEFAULT NULL,
        \`location_id\` int DEFAULT NULL,
        \`total_price\` decimal(15,2) DEFAULT NULL,
        \`purchase_cost\` decimal(15,2) DEFAULT NULL,
        \`purchase_date\` datetime DEFAULT NULL,
        \`put_to_use_date\` datetime DEFAULT NULL,
        \`asset_image\` varchar(500) DEFAULT NULL,
        \`asset_document\` varchar(500) DEFAULT NULL,
        \`vendor_supplier\` varchar(255) DEFAULT NULL,
        \`invoice_number\` varchar(100) DEFAULT NULL,
        \`asset_condition\` enum('GOOD','FAIR','POOR','DAMAGED') DEFAULT 'GOOD',
        \`ownership_type\` varchar(50) DEFAULT NULL,
        \`status_id\` int DEFAULT NULL,
        \`is_active\` tinyint(1) DEFAULT '1',
        \`client_id\` int DEFAULT NULL,
        \`serial_number\` varchar(255) DEFAULT NULL,
        \`model_number\` varchar(255) DEFAULT NULL,
        \`make\` varchar(255) DEFAULT NULL,
        \`useful_life\` int DEFAULT NULL,
        \`residual_value\` decimal(15,2) DEFAULT NULL,
        \`depreciation_method\` varchar(50) DEFAULT NULL,
        \`tag_code\` varchar(255) DEFAULT NULL,
        \`rfid_tag\` varchar(255) DEFAULT NULL,
        \`qr_code\` varchar(255) DEFAULT NULL,
        \`custodian_id\` int DEFAULT NULL,
        \`request_id\` int DEFAULT NULL,
        \`po_id\` int DEFAULT NULL,
        \`grn_id\` int DEFAULT NULL,
        \`invoice_id\` int DEFAULT NULL,
        \`has_amc\` tinyint(1) DEFAULT '0',
        \`amc_expiry_date\` datetime DEFAULT NULL,
        \`is_cwip\` tinyint(1) DEFAULT '0',
        \`schedule_ii_class\` varchar(100) DEFAULT NULL,
        \`budgetary_allocation\` decimal(15,2) DEFAULT NULL,
        \`capex_approval_ref\` varchar(100) DEFAULT NULL,
        \`created_by\` int DEFAULT NULL,
        \`updated_by\` int DEFAULT NULL,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`asset_code\` (\`asset_code\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 20. purchaserequisitions
    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`purchaserequisitions\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`pr_number\` varchar(255) DEFAULT NULL,
        \`requestor_id\` int DEFAULT NULL,
        \`property_id\` int DEFAULT NULL,
        \`department_id\` int DEFAULT NULL,
        \`item_description\` text,
        \`estimated_cost\` decimal(15,2) DEFAULT NULL,
        \`total_cost\` decimal(15,2) DEFAULT NULL,
        \`type\` enum('CAPEX','OPEX') DEFAULT 'CAPEX',
        \`status\` enum('DRAFT','SUBMITTED','PENDING_APPROVAL','IN_APPROVAL','APPROVED','REJECTED','CANCELLED','PO_CREATED') NOT NULL DEFAULT 'DRAFT',
        \`approved_by\` int DEFAULT NULL,
        \`approval_date\` datetime DEFAULT NULL,
        \`client_id\` int DEFAULT NULL,
        \`cost_center\` varchar(255) DEFAULT NULL,
        \`required_date\` datetime DEFAULT NULL,
        \`vendor_suggestion\` varchar(255) DEFAULT NULL,
        \`justification\` text,
        \`current_level\` int DEFAULT NULL,
        \`workflow_id\` int DEFAULT NULL,
        \`attachments\` json DEFAULT NULL,
        \`current_approval_level\` int DEFAULT '0',
        \`total_approval_levels\` int DEFAULT '0',
        \`is_fully_approved\` tinyint(1) DEFAULT '0',
        \`status_lock\` tinyint(1) DEFAULT '0',
        \`source_type\` varchar(50) DEFAULT NULL,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`pr_number\` (\`pr_number\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 21. purchase_requisition_items
    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`purchase_requisition_items\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`requisition_id\` int DEFAULT NULL,
        \`pr_id\` int DEFAULT NULL,
        \`item_id\` int DEFAULT NULL,
        \`item_name\` varchar(255) DEFAULT NULL,
        \`qty_requested\` decimal(12,3) DEFAULT NULL,
        \`quantity\` decimal(12,3) DEFAULT NULL,
        \`unit\` varchar(50) DEFAULT NULL,
        \`unit_price\` decimal(12,2) DEFAULT NULL,
        \`estimated_cost\` decimal(12,2) DEFAULT NULL,
        \`total_price\` decimal(12,2) DEFAULT NULL,
        \`justification\` text,
        \`remarks\` text,
        \`client_id\` int DEFAULT NULL,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 22. purchaseorders
    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`purchaseorders\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`po_number\` varchar(255) DEFAULT NULL,
        \`pr_id\` int DEFAULT NULL,
        \`property_id\` int DEFAULT NULL,
        \`vendor_id\` int DEFAULT NULL,
        \`department_id\` int DEFAULT NULL,
        \`quotation_id\` int DEFAULT NULL,
        \`source_type\` enum('PR','QUOTATION','DIRECT') DEFAULT 'PR',
        \`source_id\` int DEFAULT NULL,
        \`total_amount\` decimal(15,2) DEFAULT NULL,
        \`status\` enum('DRAFT','SUBMITTED','PENDING_APPROVAL','IN_APPROVAL','ISSUED','PARTIAL_RECEIVED','RECEIVED','CLOSED','CANCELLED','APPROVED','REJECTED') NOT NULL DEFAULT 'DRAFT',
        \`version\` int DEFAULT '1',
        \`client_id\` int DEFAULT NULL,
        \`cost_center\` varchar(255) DEFAULT NULL,
        \`order_date\` datetime DEFAULT NULL,
        \`required_date\` datetime DEFAULT NULL,
        \`notes\` text,
        \`approved_by\` int DEFAULT NULL,
        \`approved_at\` datetime DEFAULT NULL,
        \`workflow_id\` int DEFAULT NULL,
        \`current_level\` int DEFAULT '0',
        \`approval_date\` datetime DEFAULT NULL,
        \`current_approval_level\` int DEFAULT '0',
        \`total_approval_levels\` int DEFAULT '0',
        \`is_fully_approved\` tinyint(1) DEFAULT '0',
        \`status_lock\` tinyint(1) DEFAULT '0',
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`po_number\` (\`po_number\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 23. purchase_order_items
    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`purchase_order_items\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`po_id\` int NOT NULL,
        \`item_id\` int DEFAULT NULL,
        \`item_name\` varchar(255) DEFAULT NULL,
        \`quantity\` decimal(10,2) NOT NULL DEFAULT '0.00',
        \`received_quantity\` decimal(10,2) DEFAULT '0.00',
        \`qty\` decimal(12,3) DEFAULT NULL,
        \`unit_price\` decimal(12,2) DEFAULT NULL,
        \`total_price\` decimal(12,2) DEFAULT NULL,
        \`hsn_code\` varchar(20) DEFAULT NULL,
        \`tax_percent\` decimal(5,2) DEFAULT NULL,
        \`client_id\` int DEFAULT NULL,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 24. grns
    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`grns\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`grn_number\` varchar(255) DEFAULT NULL,
        \`client_id\` int DEFAULT NULL,
        \`property_id\` int DEFAULT NULL,
        \`po_id\` int DEFAULT NULL,
        \`gate_entry_id\` int DEFAULT NULL,
        \`vendor_id\` int DEFAULT NULL,
        \`invoice_number\` varchar(255) DEFAULT NULL,
        \`received_date\` datetime DEFAULT NULL,
        \`status\` enum('DRAFT','RECEIVED','PARTIAL','REJECTED') DEFAULT 'DRAFT',
        \`remarks\` text,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`grn_number\` (\`grn_number\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 25. grn_items
    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`grn_items\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`grn_id\` int NOT NULL,
        \`po_item_id\` int DEFAULT NULL,
        \`item_id\` int DEFAULT NULL,
        \`item_name\` varchar(255) DEFAULT NULL,
        \`ordered_quantity\` decimal(10,2) DEFAULT NULL,
        \`received_quantity\` decimal(10,2) DEFAULT NULL,
        \`accepted_quantity\` decimal(10,2) DEFAULT NULL,
        \`rejected_quantity\` decimal(10,2) DEFAULT NULL,
        \`damaged_quantity\` decimal(10,2) DEFAULT NULL,
        \`quality_bucket\` varchar(50) DEFAULT NULL,
        \`qc_status\` varchar(50) DEFAULT NULL,
        \`condition\` varchar(50) DEFAULT NULL,
        \`qc_remarks\` text,
        \`remarks\` text,
        \`client_id\` int DEFAULT NULL,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 26. invoices
    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`invoices\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`invoice_number\` varchar(255) DEFAULT NULL,
        \`client_id\` int DEFAULT NULL,
        \`property_id\` int DEFAULT NULL,
        \`vendor_id\` int DEFAULT NULL,
        \`po_id\` int DEFAULT NULL,
        \`grn_id\` int DEFAULT NULL,
        \`invoice_date\` datetime DEFAULT NULL,
        \`base_amount\` decimal(15,2) DEFAULT NULL,
        \`gst_amount\` decimal(15,2) DEFAULT NULL,
        \`cgst_amount\` decimal(15,2) DEFAULT NULL,
        \`sgst_amount\` decimal(15,2) DEFAULT NULL,
        \`igst_amount\` decimal(15,2) DEFAULT NULL,
        \`total_amount\` decimal(15,2) DEFAULT NULL,
        \`tds_amount\` decimal(15,2) DEFAULT NULL,
        \`tds_rate_percent\` decimal(5,2) DEFAULT NULL,
        \`tds_section_code\` varchar(20) DEFAULT NULL,
        \`hsn_sac_code\` varchar(20) DEFAULT NULL,
        \`itc_eligible\` tinyint(1) DEFAULT '1',
        \`document_url\` varchar(500) DEFAULT NULL,
        \`status\` enum('DRAFT','PENDING','APPROVED','REJECTED','PAID','EXCEPTION') DEFAULT 'DRAFT',
        \`matching_status\` varchar(50) DEFAULT NULL,
        \`matching_exception_details\` text,
        \`payment_blocked\` tinyint(1) DEFAULT '0',
        \`payment_block_reason\` text,
        \`exception_status\` varchar(50) DEFAULT NULL,
        \`exception_resolved_by\` int DEFAULT NULL,
        \`exception_resolved_at\` datetime DEFAULT NULL,
        \`matching_tolerance_percent\` decimal(5,2) DEFAULT NULL,
        \`matching_details_json\` json DEFAULT NULL,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`invoice_number\` (\`invoice_number\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 27. quotation_master
    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`quotation_master\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`pr_id\` int DEFAULT NULL,
        \`vendor_id\` int NOT NULL,
        \`client_id\` int DEFAULT NULL,
        \`quotation_no\` varchar(50) DEFAULT NULL,
        \`quotation_number\` varchar(50) DEFAULT NULL,
        \`quotation_date\` date DEFAULT NULL,
        \`validity_date\` date DEFAULT NULL,
        \`valid_until\` datetime DEFAULT NULL,
        \`total_amount\` decimal(15,2) DEFAULT NULL,
        \`currency\` varchar(10) DEFAULT 'INR',
        \`tax_amount\` decimal(15,2) DEFAULT '0.00',
        \`discount_amount\` decimal(15,2) DEFAULT '0.00',
        \`shipping_charges\` decimal(15,2) DEFAULT '0.00',
        \`net_amount\` decimal(15,2) DEFAULT '0.00',
        \`status\` enum('DRAFT','SUBMITTED','APPROVED','REJECTED','PO_CREATED') NOT NULL DEFAULT 'DRAFT',
        \`remarks\` text,
        \`attachments\` json DEFAULT NULL,
        \`created_by\` int DEFAULT NULL,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 28. quotation_items
    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`quotation_items\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`quotation_id\` int NOT NULL,
        \`item_id\` int DEFAULT NULL,
        \`item_name\` varchar(255) DEFAULT NULL,
        \`quantity\` decimal(15,2) DEFAULT '1.00',
        \`qty\` decimal(12,3) DEFAULT NULL,
        \`unit_price\` decimal(12,2) DEFAULT NULL,
        \`total_price\` decimal(12,2) DEFAULT NULL,
        \`total_amount\` decimal(15,2) DEFAULT '0.00',
        \`tax_percent\` decimal(5,2) DEFAULT '0.00',
        \`tax_amount\` decimal(15,2) DEFAULT '0.00',
        \`discount_percent\` decimal(5,2) DEFAULT '0.00',
        \`uom\` varchar(50) DEFAULT NULL,
        \`description\` text,
        \`remarks\` text,
        \`client_id\` int DEFAULT NULL,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 29. assetaccounting
    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`assetaccounting\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`asset_id\` int NOT NULL,
        \`cost_of_purchase\` decimal(15,2) DEFAULT NULL,
        \`residual_value\` decimal(15,2) DEFAULT NULL,
        \`date_of_put_in_place\` datetime DEFAULT NULL,
        \`date_of_retirement\` datetime DEFAULT NULL,
        \`original_useful_life_years\` int DEFAULT NULL,
        \`method_of_depreciation\` enum('SLM','WDV','DECLINING_BALANCE') DEFAULT 'SLM',
        \`wdv_rate\` decimal(5,2) DEFAULT NULL,
        \`it_act_rate\` decimal(5,2) DEFAULT NULL,
        \`sale_of_asset\` enum('YES','NO','PARTIAL') DEFAULT 'NO',
        \`date_till_accumulated_dep\` datetime DEFAULT NULL,
        \`accumulated_dep_opening_balance\` decimal(15,2) DEFAULT '0',
        \`scrap_value\` decimal(15,2) DEFAULT NULL,
        \`asset_type_code\` varchar(50) DEFAULT NULL,
        \`asset_sub_type\` varchar(50) DEFAULT NULL,
        \`wdv_as_per_it_act\` decimal(15,2) DEFAULT NULL,
        \`starting_wdv\` decimal(15,2) DEFAULT NULL,
        \`closing_wdv\` decimal(15,2) DEFAULT NULL,
        \`date_of_sale\` datetime DEFAULT NULL,
        \`sale_value\` decimal(15,2) DEFAULT NULL,
        \`profit_loss_on_sale\` decimal(15,2) DEFAULT NULL,
        \`created_by\` int DEFAULT NULL,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 30. depreciationledgers
    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`depreciationledgers\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`asset_id\` int NOT NULL,
        \`accounting_id\` int DEFAULT NULL,
        \`book_type\` enum('SLM_COMPANIES_ACT','WDV_IT_ACT','CUSTOM') NOT NULL DEFAULT 'SLM_COMPANIES_ACT',
        \`fiscal_year\` varchar(10) NOT NULL,
        \`period_month\` int NOT NULL,
        \`opening_value\` decimal(15,2) NOT NULL DEFAULT '0.00',
        \`depreciation_amount\` decimal(15,2) NOT NULL DEFAULT '0.00',
        \`closing_value\` decimal(15,2) NOT NULL DEFAULT '0.00',
        \`accumulated_depreciation\` decimal(15,2) NOT NULL DEFAULT '0.00',
        \`is_prorata\` tinyint(1) DEFAULT '0',
        \`prorata_days\` int DEFAULT NULL,
        \`year_closed\` tinyint(1) DEFAULT '0',
        \`calculated_at\` datetime DEFAULT NULL,
        \`calculated_by\` int DEFAULT NULL,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 31. remaining core tables
    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`globalsettings\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`company_name\` varchar(255) DEFAULT NULL,
        \`company_logo\` varchar(500) DEFAULT NULL,
        \`currency_symbol\` varchar(10) DEFAULT '₹',
        \`date_format\` varchar(20) DEFAULT 'DD/MM/YYYY',
        \`fy_start_month\` int DEFAULT '4',
        \`default_depreciation_method\` varchar(20) DEFAULT 'SLM',
        \`email_notifications\` tinyint(1) DEFAULT '1',
        \`amc_reminder_days\` int DEFAULT '30',
        \`warranty_reminder_days\` int DEFAULT '30',
        \`max_upload_size_mb\` int DEFAULT '10',
        \`session_timeout_minutes\` int DEFAULT '60',
        \`allow_excel_export\` tinyint(1) DEFAULT '1',
        \`allow_pdf_export\` tinyint(1) DEFAULT '1',
        \`enabled_features\` json DEFAULT NULL,
        \`updated_by\` int DEFAULT NULL,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`budgets\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`financial_year\` varchar(20) NOT NULL,
        \`allocated_amount\` decimal(15,2) DEFAULT NULL,
        \`utilized_amount\` decimal(15,2) DEFAULT NULL,
        \`department_id\` int DEFAULT NULL,
        \`category_id\` int DEFAULT NULL,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`auditschedules\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`title\` varchar(255) DEFAULT NULL,
        \`start_date\` datetime DEFAULT NULL,
        \`end_date\` datetime DEFAULT NULL,
        \`status\` varchar(50) DEFAULT NULL,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`physicalverifications\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`verified_date\` datetime DEFAULT NULL,
        \`status\` varchar(50) DEFAULT NULL,
        \`remarks\` text,
        \`audit_id\` int DEFAULT NULL,
        \`asset_id\` int DEFAULT NULL,
        \`verified_by\` int DEFAULT NULL,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`idsequences\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`prefix\` varchar(50) NOT NULL,
        \`last_value\` int NOT NULL DEFAULT '0',
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`prefix\` (\`prefix\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`requests\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`request_type\` enum('PURCHASE','TRANSFER','DISPOSAL','ISSUE','MAINTENANCE','NEW','REFILL','SPARE_PART','REPAIR','REPLACEMENT','OTHER') NOT NULL,
        \`asset_id\` int DEFAULT NULL,
        \`request_description\` text NOT NULL,
        \`manager_id\` int NOT NULL,
        \`request_reason\` text,
        \`current_approval_level\` int DEFAULT '1',
        \`status\` enum('DRAFT','SUBMITTED','IN_APPROVAL','APPROVED','REJECTED','PROCESSED','PENDING') DEFAULT 'DRAFT',
        \`created_by\` int DEFAULT NULL,
        \`request_number\` varchar(255) DEFAULT NULL,
        \`department_id\` int DEFAULT NULL,
        \`property_id\` int DEFAULT NULL,
        \`total_items\` int DEFAULT '0',
        \`remarks\` text,
        \`workflow_id\` int DEFAULT NULL,
        \`current_level\` int DEFAULT '0',
        \`total_approval_levels\` int DEFAULT '0',
        \`is_fully_approved\` tinyint(1) DEFAULT '0',
        \`total_estimated_value\` decimal(15,2) DEFAULT '0.00',
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`request_number\` (\`request_number\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`requestapprovaltrails\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`request_id\` int NOT NULL,
        \`approver_id\` int NOT NULL,
        \`approval_level\` int NOT NULL,
        \`action\` enum('APPROVED','REJECTED') NOT NULL,
        \`remarks\` text,
        \`actioned_at\` datetime DEFAULT CURRENT_TIMESTAMP,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`warranties\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`asset_id\` int NOT NULL,
        \`warranty_code\` varchar(50) NOT NULL,
        \`service_provider_id\` int NOT NULL,
        \`start_date\` datetime NOT NULL,
        \`end_date\` datetime NOT NULL,
        \`warranty_type\` varchar(100) DEFAULT NULL,
        \`warranty_terms\` text,
        \`contact_person\` varchar(255) DEFAULT NULL,
        \`contact_phone\` varchar(20) DEFAULT NULL,
        \`remarks\` text,
        \`created_by\` int DEFAULT NULL,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`warranty_code\` (\`warranty_code\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`assetmaintenances\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`asset_id\` int NOT NULL,
        \`maintenance_type_id\` int DEFAULT NULL,
        \`service_provider_id\` int DEFAULT NULL,
        \`scheduled_date\` datetime DEFAULT NULL,
        \`estimated_cost\` decimal(15,2) DEFAULT NULL,
        \`actual_cost\` decimal(15,2) DEFAULT NULL,
        \`completion_date\` datetime DEFAULT NULL,
        \`status\` varchar(50) DEFAULT NULL,
        \`description\` text,
        \`remarks\` text,
        \`client_id\` int DEFAULT NULL,
        \`created_by\` int DEFAULT NULL,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`asset_amcs\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`asset_id\` int NOT NULL,
        \`vendor_id\` int DEFAULT NULL,
        \`amc_type\` varchar(100) DEFAULT NULL,
        \`start_date\` datetime DEFAULT NULL,
        \`end_date\` datetime DEFAULT NULL,
        \`cost\` decimal(15,2) DEFAULT NULL,
        \`status\` varchar(50) DEFAULT NULL,
        \`service_frequency\` varchar(50) DEFAULT NULL,
        \`last_service_date\` datetime DEFAULT NULL,
        \`next_service_date\` datetime DEFAULT NULL,
        \`remarks\` text,
        \`client_id\` int DEFAULT NULL,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`assettracking\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`asset_id\` int NOT NULL,
        \`location_id\` int NOT NULL,
        \`department_id\` int NOT NULL,
        \`sub_department_id\` int DEFAULT NULL,
        \`region_id\` int DEFAULT NULL,
        \`tracking_date\` datetime DEFAULT NULL,
        \`status\` varchar(50) DEFAULT NULL,
        \`remarks\` text,
        \`created_by\` int DEFAULT NULL,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`assetmonitoring\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`asset_id\` int NOT NULL,
        \`monitoring_type\` varchar(100) NOT NULL,
        \`monitored_by\` int NOT NULL,
        \`monitored_date\` datetime NOT NULL,
        \`next_monitoring_date\` datetime DEFAULT NULL,
        \`status\` varchar(50) DEFAULT NULL,
        \`remarks\` text,
        \`created_by\` int DEFAULT NULL,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`assetperformance\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`asset_id\` int NOT NULL,
        \`down_time_hours\` decimal(8,2) DEFAULT NULL,
        \`capacity_utilization_pct\` decimal(5,2) DEFAULT NULL,
        \`performance_score\` decimal(5,2) DEFAULT NULL,
        \`reason_for_downtime\` text,
        \`recorded_date\` datetime NOT NULL,
        \`remarks\` text,
        \`created_by\` int DEFAULT NULL,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`asset_movements\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`asset_id\` int NOT NULL,
        \`movement_type\` varchar(50) DEFAULT NULL,
        \`from_location_id\` int DEFAULT NULL,
        \`to_location_id\` int DEFAULT NULL,
        \`from_department_id\` int DEFAULT NULL,
        \`to_department_id\` int DEFAULT NULL,
        \`assigned_to_user_id\` int DEFAULT NULL,
        \`status\` varchar(50) DEFAULT NULL,
        \`movement_date\` datetime DEFAULT NULL,
        \`approved_by\` int DEFAULT NULL,
        \`approved_at\` datetime DEFAULT NULL,
        \`remarks\` text,
        \`created_by\` int DEFAULT NULL,
        \`updated_by\` int DEFAULT NULL,
        \`client_id\` int DEFAULT NULL,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`activitylogs\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`user_id\` int DEFAULT NULL,
        \`action\` varchar(255) DEFAULT NULL,
        \`module\` varchar(100) DEFAULT NULL,
        \`entity_type\` varchar(100) DEFAULT NULL,
        \`entity_id\` int DEFAULT NULL,
        \`details\` json DEFAULT NULL,
        \`ip_address\` varchar(50) DEFAULT NULL,
        \`client_id\` int DEFAULT NULL,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`audit_sessions\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`client_id\` int DEFAULT NULL,
        \`audit_plan_id\` int DEFAULT NULL,
        \`property_id\` int DEFAULT NULL,
        \`department_id\` int DEFAULT NULL,
        \`session_name\` varchar(255) DEFAULT NULL,
        \`status\` enum('PLANNED','IN_PROGRESS','COMPLETED','CANCELLED') DEFAULT 'PLANNED',
        \`actual_start_date\` datetime DEFAULT NULL,
        \`actual_end_date\` datetime DEFAULT NULL,
        \`planned_start_date\` datetime DEFAULT NULL,
        \`planned_end_date\` datetime DEFAULT NULL,
        \`created_by\` int DEFAULT NULL,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`audit_plannings\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`client_id\` int DEFAULT NULL,
        \`audit_name\` varchar(255) DEFAULT NULL,
        \`audit_type\` varchar(100) DEFAULT NULL,
        \`frequency\` enum('MONTHLY','QUARTERLY','HALF_YEARLY','YEARLY','AD_HOC') DEFAULT 'YEARLY',
        \`scheduled_date\` datetime DEFAULT NULL,
        \`department_id\` int DEFAULT NULL,
        \`location_id\` int DEFAULT NULL,
        \`assigned_to\` int DEFAULT NULL,
        \`status\` enum('PLANNED','IN_PROGRESS','COMPLETED','CANCELLED') DEFAULT 'PLANNED',
        \`remarks\` text,
        \`created_by\` int DEFAULT NULL,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`auditplans\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`client_id\` int DEFAULT NULL,
        \`audit_name\` varchar(255) DEFAULT NULL,
        \`audit_type\` varchar(100) DEFAULT NULL,
        \`frequency\` enum('MONTHLY','QUARTERLY','HALF_YEARLY','YEARLY','AD_HOC') DEFAULT 'YEARLY',
        \`scheduled_date\` datetime DEFAULT NULL,
        \`department_id\` int DEFAULT NULL,
        \`location_id\` int DEFAULT NULL,
        \`assigned_to\` int DEFAULT NULL,
        \`status\` enum('PLANNED','IN_PROGRESS','COMPLETED','CANCELLED') DEFAULT 'PLANNED',
        \`remarks\` text,
        \`created_by\` int DEFAULT NULL,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`items\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`item_name\` varchar(255) NOT NULL,
        \`sku_code\` varchar(255) NOT NULL,
        \`category_id\` int DEFAULT NULL,
        \`sub_category_id\` int DEFAULT NULL,
        \`unit\` varchar(255) DEFAULT 'Nos',
        \`min_stock_level\` decimal(10,2) DEFAULT '0.00',
        \`reorder_level\` decimal(10,2) DEFAULT '0.00',
        \`item_description\` text,
        \`status\` enum('ACTIVE','INACTIVE') DEFAULT 'ACTIVE',
        \`client_id\` int DEFAULT NULL,
        \`item_type\` varchar(50) DEFAULT NULL,
        \`unit_price\` decimal(10,2) DEFAULT NULL,
        \`hsn_sac_code\` varchar(20) DEFAULT NULL,
        \`gst_rate\` decimal(5,2) DEFAULT NULL,
        \`qr_code\` varchar(255) DEFAULT NULL,
        \`barcode\` varchar(255) DEFAULT NULL,
        \`make\` varchar(255) DEFAULT NULL,
        \`model\` varchar(255) DEFAULT NULL,
        \`warranty_months\` int DEFAULT NULL,
        \`unit_id\` int DEFAULT NULL,
        \`tax_rate\` decimal(5,2) DEFAULT NULL,
        \`lead_time_days\` int DEFAULT NULL,
        \`preferred_vendor_id\` int DEFAULT NULL,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`sku_code\` (\`sku_code\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`featuretoggles\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`feature_key\` varchar(100) NOT NULL,
        \`is_enabled\` tinyint(1) DEFAULT '0',
        \`client_id\` int DEFAULT NULL,
        \`description\` text,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`feature_key_client\` (\`feature_key\`,\`client_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`financialperiods\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`period_name\` varchar(100) DEFAULT NULL,
        \`start_date\` datetime DEFAULT NULL,
        \`end_date\` datetime DEFAULT NULL,
        \`fiscal_year\` varchar(20) DEFAULT NULL,
        \`status\` enum('OPEN','CLOSED') DEFAULT 'OPEN',
        \`client_id\` int DEFAULT NULL,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`approval_matrix\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`client_id\` int DEFAULT NULL,
        \`module_name\` varchar(100) DEFAULT NULL,
        \`level\` int DEFAULT NULL,
        \`role\` varchar(100) DEFAULT NULL,
        \`role_code\` varchar(100) DEFAULT NULL,
        \`min_amount\` decimal(15,2) DEFAULT NULL,
        \`max_amount\` decimal(15,2) DEFAULT NULL,
        \`threshold_amount\` decimal(15,2) DEFAULT NULL,
        \`mode\` varchar(50) DEFAULT NULL,
        \`is_mandatory\` tinyint(1) DEFAULT '1',
        \`is_active\` tinyint(1) DEFAULT '1',
        \`workflow_id\` int DEFAULT NULL,
        \`approval_mode\` varchar(20) DEFAULT 'LINE',
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`approval_workflows\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`name\` varchar(255) DEFAULT NULL,
        \`module\` varchar(100) DEFAULT NULL,
        \`client_id\` int DEFAULT NULL,
        \`status\` varchar(50) DEFAULT NULL,
        \`approval_topology\` varchar(50) DEFAULT NULL,
        \`progression_mode\` varchar(50) DEFAULT NULL,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`approval_logs\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`module\` varchar(100) DEFAULT NULL,
        \`reference_id\` int DEFAULT NULL,
        \`user_id\` int DEFAULT NULL,
        \`action\` varchar(50) DEFAULT NULL,
        \`status\` varchar(50) DEFAULT NULL,
        \`level\` int DEFAULT NULL,
        \`line_item_id\` int DEFAULT NULL,
        \`approval_topology\` varchar(50) DEFAULT NULL,
        \`progression_mode\` varchar(50) DEFAULT NULL,
        \`role_code\` varchar(100) DEFAULT NULL,
        \`comments\` text,
        \`timestamp\` datetime DEFAULT CURRENT_TIMESTAMP,
        \`client_id\` int DEFAULT NULL,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`tagtemplates\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`name\` varchar(255) NOT NULL,
        \`fields\` json DEFAULT NULL,
        \`layout\` json DEFAULT NULL,
        \`is_default\` tinyint(1) DEFAULT '0',
        \`client_id\` int DEFAULT NULL,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`assethandovers\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`asset_id\` int NOT NULL,
        \`from_user_id\` int DEFAULT NULL,
        \`from_user_name\` varchar(255) DEFAULT NULL,
        \`to_user_id\` int DEFAULT NULL,
        \`to_user_name\` varchar(255) DEFAULT NULL,
        \`handover_date\` datetime DEFAULT NULL,
        \`condition_at_handover\` varchar(100) DEFAULT NULL,
        \`remarks\` text,
        \`acknowledged\` tinyint(1) DEFAULT '0',
        \`acknowledged_at\` datetime DEFAULT NULL,
        \`client_id\` int DEFAULT NULL,
        \`created_by\` int DEFAULT NULL,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`assetinsurances\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`asset_id\` int NOT NULL,
        \`client_id\` int DEFAULT NULL,
        \`policy_number\` varchar(100) DEFAULT NULL,
        \`insurer\` varchar(255) DEFAULT NULL,
        \`coverage_amount\` decimal(15,2) DEFAULT NULL,
        \`premium_amount\` decimal(15,2) DEFAULT NULL,
        \`start_date\` datetime DEFAULT NULL,
        \`end_date\` datetime DEFAULT NULL,
        \`status\` enum('ACTIVE','EXPIRED','CANCELLED') DEFAULT 'ACTIVE',
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`assetissues\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`asset_id\` int DEFAULT NULL,
        \`client_id\` int DEFAULT NULL,
        \`issue_type\` varchar(100) DEFAULT NULL,
        \`description\` text,
        \`priority\` enum('LOW','MEDIUM','HIGH','CRITICAL') DEFAULT 'MEDIUM',
        \`status\` enum('OPEN','IN_PROGRESS','RESOLVED','CLOSED') DEFAULT 'OPEN',
        \`reported_by\` int DEFAULT NULL,
        \`assigned_to\` int DEFAULT NULL,
        \`resolved_at\` datetime DEFAULT NULL,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`assetissuecomments\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`issue_id\` int NOT NULL,
        \`user_id\` int DEFAULT NULL,
        \`comment\` text,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`assetdisposals\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`asset_id\` int NOT NULL,
        \`client_id\` int DEFAULT NULL,
        \`disposal_type\` varchar(50) DEFAULT NULL,
        \`disposal_date\` datetime DEFAULT NULL,
        \`disposal_value\` decimal(15,2) DEFAULT NULL,
        \`reason\` text,
        \`approved_by\` int DEFAULT NULL,
        \`status\` varchar(50) DEFAULT NULL,
        \`created_by\` int DEFAULT NULL,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`assetaccounting_revisions\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`asset_accounting_id\` int DEFAULT NULL,
        \`changed_by\` int DEFAULT NULL,
        \`reason\` text,
        \`previous_values\` json DEFAULT NULL,
        \`new_values\` json DEFAULT NULL,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`immutable_audit_log\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`client_id\` int DEFAULT NULL,
        \`user_id\` int DEFAULT NULL,
        \`action\` varchar(100) DEFAULT NULL,
        \`module\` varchar(100) DEFAULT NULL,
        \`entity_type\` varchar(100) DEFAULT NULL,
        \`entity_id\` int DEFAULT NULL,
        \`before_hash\` varchar(255) DEFAULT NULL,
        \`after_hash\` varchar(255) DEFAULT NULL,
        \`payload\` json DEFAULT NULL,
        \`ip_address\` varchar(100) DEFAULT NULL,
        \`user_agent\` text,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`three_way_matches\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`po_id\` int NOT NULL,
        \`grn_id\` int DEFAULT NULL,
        \`invoice_id\` int NOT NULL,
        \`client_id\` int NOT NULL,
        \`status\` enum('MATCHED','TOLERANCE_BREACH','BLOCKED','PENDING') NOT NULL DEFAULT 'PENDING',
        \`qty_variance\` decimal(10,2) NOT NULL DEFAULT '0.00',
        \`amount_variance\` decimal(10,2) NOT NULL DEFAULT '0.00',
        \`tolerance_pct\` decimal(5,2) NOT NULL DEFAULT '0.00',
        \`blocked_reason\` text,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`tds_sections\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`section_code\` varchar(20) NOT NULL,
        \`description\` text,
        \`threshold_amount\` decimal(15,2) NOT NULL DEFAULT '0.00',
        \`individual_rate\` decimal(5,2) NOT NULL DEFAULT '0.00',
        \`company_rate\` decimal(5,2) NOT NULL DEFAULT '0.00',
        \`is_active\` tinyint(1) NOT NULL DEFAULT '1',
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`tds_computations\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`invoice_id\` int NOT NULL,
        \`vendor_id\` int NOT NULL,
        \`client_id\` int NOT NULL,
        \`section_code\` varchar(20) NOT NULL,
        \`tds_rate\` decimal(5,2) NOT NULL DEFAULT '0.00',
        \`tds_amount\` decimal(15,2) NOT NULL DEFAULT '0.00',
        \`is_206ab_applicable\` tinyint(1) NOT NULL DEFAULT '0',
        \`status\` enum('COMPUTED','APPLIED','REVERSED') NOT NULL DEFAULT 'COMPUTED',
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`tds_non_filers\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`pan\` varchar(10) NOT NULL,
        \`name\` varchar(255) DEFAULT NULL,
        \`fy\` varchar(10) NOT NULL,
        \`source\` varchar(50) DEFAULT NULL,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`sla_rules\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`client_id\` int DEFAULT '1',
        \`alert_type\` varchar(50) DEFAULT NULL,
        \`priority\` enum('LOW','MEDIUM','HIGH','CRITICAL') DEFAULT NULL,
        \`max_response_time_minutes\` int DEFAULT NULL,
        \`escalate_to\` int DEFAULT NULL,
        \`is_active\` tinyint(1) DEFAULT '1',
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`notificationlogs\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`client_id\` int DEFAULT NULL,
        \`entity_type\` varchar(100) DEFAULT NULL,
        \`entity_id\` int DEFAULT NULL,
        \`notification_type\` varchar(100) DEFAULT NULL,
        \`sent_to\` varchar(255) DEFAULT NULL,
        \`subject\` varchar(255) DEFAULT NULL,
        \`status\` varchar(50) DEFAULT NULL,
        \`error_message\` text,
        \`sent_at\` datetime DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`cwip_projects\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`client_id\` int DEFAULT NULL,
        \`project_name\` varchar(255) NOT NULL,
        \`description\` text,
        \`start_date\` datetime DEFAULT NULL,
        \`status\` varchar(50) DEFAULT NULL,
        \`total_cost\` decimal(15,2) DEFAULT NULL,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`cwipassets\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`cwip_number\` varchar(100) DEFAULT NULL,
        \`invoice_id\` int DEFAULT NULL,
        \`po_id\` int DEFAULT NULL,
        \`property_id\` int DEFAULT NULL,
        \`amount\` decimal(15,2) DEFAULT NULL,
        \`aging_days\` int DEFAULT NULL,
        \`status\` varchar(50) DEFAULT NULL,
        \`put_to_use_date\` datetime DEFAULT NULL,
        \`capitalized_asset_id\` int DEFAULT NULL,
        \`capitalized_at\` datetime DEFAULT NULL,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`integration_configs\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`erp_type\` varchar(50) DEFAULT NULL,
        \`base_url\` varchar(255) DEFAULT NULL,
        \`auth_token\` text,
        \`integration_name\` varchar(255) DEFAULT NULL,
        \`integration_type\` varchar(50) DEFAULT NULL,
        \`auth_type\` varchar(50) DEFAULT NULL,
        \`username\` varchar(255) DEFAULT NULL,
        \`password\` varchar(255) DEFAULT NULL,
        \`is_active\` tinyint(1) DEFAULT '1',
        \`sync_frequency\` varchar(50) DEFAULT NULL,
        \`conflict_resolution\` varchar(50) DEFAULT NULL,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`integration_logs\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`queue_id\` int DEFAULT NULL,
        \`status\` varchar(50) DEFAULT NULL,
        \`request_payload\` json DEFAULT NULL,
        \`response_payload\` json DEFAULT NULL,
        \`message\` text,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`integration_queues\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`erp_type\` varchar(50) DEFAULT NULL,
        \`action\` varchar(100) DEFAULT NULL,
        \`payload\` json DEFAULT NULL,
        \`status\` varchar(50) DEFAULT NULL,
        \`retry_count\` int DEFAULT '0',
        \`next_retry_at\` datetime DEFAULT NULL,
        \`error_message\` text,
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`capexbudgets\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`client_id\` int DEFAULT NULL,
        \`financial_year\` varchar(20) DEFAULT NULL,
        \`department_id\` int DEFAULT NULL,
        \`category_id\` int DEFAULT NULL,
        \`allocated_amount\` decimal(15,2) DEFAULT NULL,
        \`approved_amount\` decimal(15,2) DEFAULT NULL,
        \`actual_spend\` decimal(15,2) DEFAULT NULL,
        \`committed_spend\` decimal(15,2) DEFAULT NULL,
        \`created_by\` int DEFAULT NULL,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`capexrequests\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`client_id\` int DEFAULT NULL,
        \`request_number\` varchar(100) DEFAULT NULL,
        \`title\` varchar(255) DEFAULT NULL,
        \`description\` text,
        \`department_id\` int DEFAULT NULL,
        \`category_id\` int DEFAULT NULL,
        \`amount\` decimal(15,2) DEFAULT NULL,
        \`threshold_level\` varchar(50) DEFAULT NULL,
        \`approval_stage\` varchar(50) DEFAULT NULL,
        \`required_approvals\` int DEFAULT NULL,
        \`review_notes\` text,
        \`last_action_by\` int DEFAULT NULL,
        \`status\` varchar(50) DEFAULT NULL,
        \`linked_po_id\` int DEFAULT NULL,
        \`linked_grn_id\` int DEFAULT NULL,
        \`created_by\` int DEFAULT NULL,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`capexprojections\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`client_id\` int DEFAULT NULL,
        \`capex_request_id\` int DEFAULT NULL,
        \`asset_category_id\` int DEFAULT NULL,
        \`projection_month\` varchar(20) DEFAULT NULL,
        \`projected_amount\` decimal(15,2) DEFAULT NULL,
        \`projected_depreciation\` decimal(15,2) DEFAULT NULL,
        \`notes\` text,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`sbc_leads\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`client_name\` varchar(255) NOT NULL,
        \`client_id\` int DEFAULT NULL,
        \`contact_email\` varchar(255) DEFAULT NULL,
        \`contact_phone\` varchar(50) DEFAULT NULL,
        \`missing_assets\` int DEFAULT '0',
        \`risk_value\` decimal(15,2) DEFAULT '0.00',
        \`location\` varchar(255) DEFAULT NULL,
        \`status\` enum('NEW','CONTACTED','CLOSED') DEFAULT 'NEW',
        \`created_at\` datetime DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`asset_code_config\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`client_id\` int DEFAULT NULL,
        \`code_mode\` varchar(50) DEFAULT 'AUTO',
        \`prefix\` varchar(20) DEFAULT NULL,
        \`sequence_length\` int DEFAULT '4',
        \`allow_manual_override\` tinyint(1) DEFAULT '0',
        \`is_active\` tinyint(1) DEFAULT '1',
        \`createdAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`audit_tasks\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`type\` varchar(100) DEFAULT NULL,
        \`source\` varchar(100) DEFAULT NULL,
        \`reference_value\` varchar(255) DEFAULT NULL,
        \`risk_value\` decimal(15,2) DEFAULT NULL,
        \`location\` varchar(255) DEFAULT NULL,
        \`status\` varchar(50) DEFAULT NULL,
        \`assigned_to\` int DEFAULT NULL,
        \`client_id\` int DEFAULT NULL,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`inventorybalances\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`item_id\` int NOT NULL,
        \`location_id\` int DEFAULT NULL,
        \`client_id\` int DEFAULT NULL,
        \`quantity_on_hand\` decimal(10,2) DEFAULT '0.00',
        \`quantity_reserved\` decimal(10,2) DEFAULT '0.00',
        \`quantity_available\` decimal(10,2) DEFAULT '0.00',
        \`last_updated\` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`self_declaration_campaigns\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`client_id\` int DEFAULT NULL,
        \`campaign_name\` varchar(255) DEFAULT NULL,
        \`scope_type\` enum('ALL_ASSETS','DEPARTMENT','LOCATION','CUSTODIAN') DEFAULT 'ALL_ASSETS',
        \`scope_id\` int DEFAULT NULL,
        \`start_date\` datetime DEFAULT NULL,
        \`due_date\` datetime DEFAULT NULL,
        \`status\` enum('DRAFT','ACTIVE','CLOSED') DEFAULT 'DRAFT',
        \`created_by\` int DEFAULT NULL,
        \`instructions\` text,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`self_declaration_responses\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`client_id\` int DEFAULT NULL,
        \`campaign_id\` int NOT NULL,
        \`asset_id\` int DEFAULT NULL,
        \`custodian_id\` int DEFAULT NULL,
        \`declaration_status\` enum('PENDING','CONFIRMED','MISMATCH','NOT_FOUND','DAMAGED') DEFAULT 'PENDING',
        \`condition_status\` enum('GOOD','FAIR','POOR','DAMAGED','NOT_FOUND') DEFAULT 'GOOD',
        \`current_location\` varchar(500) DEFAULT NULL,
        \`remarks\` text,
        \`evidence_json\` json DEFAULT NULL,
        \`declared_at\` datetime DEFAULT NULL,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`leaseschedules\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`lease_id\` int DEFAULT NULL,
        \`client_id\` int DEFAULT NULL,
        \`period_number\` int DEFAULT NULL,
        \`period_date\` datetime DEFAULT NULL,
        \`opening_liability\` decimal(15,2) DEFAULT NULL,
        \`payment_amount\` decimal(15,2) DEFAULT NULL,
        \`interest_amount\` decimal(15,2) DEFAULT NULL,
        \`principal_amount\` decimal(15,2) DEFAULT NULL,
        \`closing_liability\` decimal(15,2) DEFAULT NULL,
        \`rou_opening_value\` decimal(15,2) DEFAULT NULL,
        \`rou_amortization\` decimal(15,2) DEFAULT NULL,
        \`rou_closing_value\` decimal(15,2) DEFAULT NULL,
        \`due_in_days\` int DEFAULT NULL,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`leasejournalentries\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`lease_id\` int DEFAULT NULL,
        \`client_id\` int DEFAULT NULL,
        \`period_number\` int DEFAULT NULL,
        \`period_date\` datetime DEFAULT NULL,
        \`entry_type\` varchar(50) DEFAULT NULL,
        \`debit_account\` varchar(100) DEFAULT NULL,
        \`credit_account\` varchar(100) DEFAULT NULL,
        \`amount\` decimal(15,2) DEFAULT NULL,
        \`narration\` text,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`vendor_compliance_snapshots\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`client_id\` int NOT NULL DEFAULT '1',
        \`fy\` varchar(20) NOT NULL,
        \`snapshot_date\` datetime NOT NULL,
        \`generated_by\` int DEFAULT NULL,
        \`total_vendors\` int DEFAULT '0',
        \`red_count\` int DEFAULT '0',
        \`orange_count\` int DEFAULT '0',
        \`gold_count\` int DEFAULT '0',
        \`blue_count\` int DEFAULT '0',
        \`total_spend\` decimal(18,2) DEFAULT '0.00',
        \`snapshot_json\` json DEFAULT NULL,
        \`created_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.sequelize.query(`SET FOREIGN_KEY_CHECKS=1`);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`SET FOREIGN_KEY_CHECKS=0`);
    const tables = [
      'vendor_compliance_snapshots','leasejournalentries','leaseschedules',
      'self_declaration_responses','self_declaration_campaigns','inventorybalances',
      'audit_tasks','asset_code_config','sbc_leads','capexprojections','capexrequests',
      'capexbudgets','integration_queues','integration_logs','integration_configs',
      'cwipassets','cwip_projects','notificationlogs','tagtemplates','approval_logs',
      'approval_workflows','approval_matrix','financial_periods','feature_toggles',
      'items','auditplans','audit_plannings','audit_sessions','activitylogs',
      'asset_movements','assetperformance','assetmonitoring','assettracking',
      'asset_amcs','assetmaintenances','warranties','requests','requestapprovaltrails',
      'auditschedules','budgets','globalsettings','asset_issue_comments','asset_issues',
      'asset_insurances','assethandovers','three_way_matches','tds_non_filers',
      'tds_computations','tds_sections','sla_rules','immutable_audit_log',
      'assetaccounting_revisions','asset_disposals','assetaccounting','depreciationledgers',
      'invoices','grn_items','grns','purchase_order_items','purchaseorders',
      'purchase_requisition_items','purchaserequisitions','quotation_items','quotation_master',
      'assets','user_roles','rolepermissions','users','maintenancetypes','assetstatuses',
      'assetsubcategories','asset_categories','locations','properties','serviceproviders',
      'subdepartments','departments','regions','propertytypes','clients','entities','roles'
    ];
    for (const t of tables) {
      await queryInterface.sequelize.query(`DROP TABLE IF EXISTS \`${t}\``);
    }
    await queryInterface.sequelize.query(`SET FOREIGN_KEY_CHECKS=1`);
  }
};
