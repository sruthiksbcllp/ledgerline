'use strict';

/**
 * invoices.exception_raised_at - when the bill's current (or last) three-way-match exception was
 * opened, for the exception report's "how old". Set by a model hook from now on.
 *
 * Existing bills: taken from the activity trail (the last time the bill moved into EXCEPTION),
 * else the first three-way-match run, else when the bill was entered. Exceptions that ended
 * without a resolution date (cleared by a later receipt) get one from the trail too.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const cols = await queryInterface.describeTable('invoices');
    if (!cols.exception_raised_at) {
      await queryInterface.addColumn('invoices', 'exception_raised_at', { type: Sequelize.DATE, allowNull: true });
    }

    const tables = (await queryInterface.showAllTables()).map((t) => (typeof t === 'string' ? t : t.tableName));
    const hasTrail = tables.includes('workflow_events');
    const hasMatches = tables.includes('three_way_matches');
    const openedEvent = hasTrail
      ? `(SELECT MAX(w.occurred_at) FROM workflow_events w WHERE w.module = 'INVOICE' AND w.reference_id = i.id
           AND w.to_status = 'EXCEPTION' AND (w.from_status IS NULL OR w.from_status <> 'EXCEPTION'))`
      : 'NULL';
    const firstMatch = hasMatches ? '(SELECT MIN(t.created_at) FROM three_way_matches t WHERE t.invoice_id = i.id)' : 'NULL';
    const everException = hasTrail
      ? `OR EXISTS (SELECT 1 FROM workflow_events w2 WHERE w2.module = 'INVOICE' AND w2.reference_id = i.id AND w2.to_status = 'EXCEPTION')`
      : '';

    await queryInterface.sequelize.query(`
      UPDATE invoices i
         SET exception_raised_at = COALESCE(${openedEvent}, ${firstMatch}, i.createdAt)
       WHERE i.exception_raised_at IS NULL
         AND (i.status = 'EXCEPTION' OR i.exception_status IN ('OPEN', 'MANUAL_APPROVED', 'REJECTED')
              OR i.exception_resolved_at IS NOT NULL OR i.exception_type IS NOT NULL ${everException})`);

    if (hasTrail) {
      await queryInterface.sequelize.query(`
        UPDATE invoices i
           SET exception_resolved_at = COALESCE(
                 (SELECT MIN(w.occurred_at) FROM workflow_events w WHERE w.module = 'INVOICE' AND w.reference_id = i.id
                    AND w.from_status = 'EXCEPTION' AND w.to_status <> 'EXCEPTION' AND w.occurred_at >= i.exception_raised_at),
                 i.updatedAt)
         WHERE i.exception_raised_at IS NOT NULL AND i.exception_resolved_at IS NULL
           AND i.status <> 'EXCEPTION' AND (i.exception_status IS NULL OR i.exception_status <> 'OPEN' OR i.status = 'REJECTED')`);
    }
  },

  async down(queryInterface) {
    const cols = await queryInterface.describeTable('invoices');
    if (cols.exception_raised_at) await queryInterface.removeColumn('invoices', 'exception_raised_at');
  }
};
