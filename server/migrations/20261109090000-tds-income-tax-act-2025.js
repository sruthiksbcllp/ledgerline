'use strict';

/**
 * TDS under the Income-tax Act 2025 (from 1 April 2026): each section gets its new reference
 * (Section 393 table entry) and challan payment code, and the thresholds and rates move to
 * FY 2026-27 values. Old section numbers stay as the key, so vendors and invoices keep working.
 * 194I and 194J are split: plant/machinery rent is 194I(a), technical fees are 194J(a).
 */
const RATES = require('../utils/tdsRates');

module.exports = {
  async up(queryInterface, Sequelize) {
    const cols = await queryInterface.describeTable('tds_sections');
    const add = async (name, spec) => { if (!cols[name]) await queryInterface.addColumn('tds_sections', name, spec); };
    await add('act2025_ref', { type: Sequelize.STRING(40), allowNull: true });
    await add('payment_code', { type: Sequelize.STRING(20), allowNull: true });
    await add('single_threshold', { type: Sequelize.DECIMAL(15, 2), allowNull: true });
    await add('threshold_basis', { type: Sequelize.STRING(10), allowNull: false, defaultValue: 'YEAR' });
    await add('excess_only', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false });

    const q = (sql, replacements) => queryInterface.sequelize.query(sql, { replacements });
    // The old seed had two '194I' rows; the plant/machinery one becomes 194I(a).
    await q("UPDATE tds_sections SET section_code = '194I(a)' WHERE section_code = '194I' AND LOWER(description) LIKE '%plant%'");

    for (const r of RATES) {
      const values = {
        code: r.section, description: r.description, threshold: r.threshold, individual: r.individual, company: r.company,
        ref: r.act2025, pay: r.payment_code, single: r.single_threshold || null, basis: r.threshold_basis || 'YEAR', excess: r.excess_only ? 1 : 0
      };
      const [rows] = await q('SELECT id FROM tds_sections WHERE section_code = :code', values);
      if (rows.length) {
        await q(`UPDATE tds_sections SET description = :description, threshold_amount = :threshold, individual_rate = :individual,
          company_rate = :company, act2025_ref = :ref, payment_code = :pay, single_threshold = :single, threshold_basis = :basis,
          excess_only = :excess, is_active = 1, updated_at = NOW() WHERE section_code = :code`, values);
      } else {
        await q(`INSERT INTO tds_sections (section_code, description, threshold_amount, individual_rate, company_rate, act2025_ref,
          payment_code, single_threshold, threshold_basis, excess_only, is_active, created_at, updated_at)
          VALUES (:code, :description, :threshold, :individual, :company, :ref, :pay, :single, :basis, :excess, 1, NOW(), NOW())`, values);
      }
    }
  },

  async down(queryInterface) {
    const cols = await queryInterface.describeTable('tds_sections');
    for (const name of ['excess_only', 'threshold_basis', 'single_threshold', 'payment_code', 'act2025_ref']) {
      if (cols[name]) await queryInterface.removeColumn('tds_sections', name);
    }
  }
};
