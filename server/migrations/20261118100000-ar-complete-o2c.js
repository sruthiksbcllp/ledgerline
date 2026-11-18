'use strict';

/**
 * Accounts Receivable, the rest of order to cash (blueprint steps 5 and 7-10, FDS customer master,
 * "Close AR", reconciliations and the ledger-based R2R pages). Add-only: new columns and tables, and
 * WRITTEN_OFF added to the customer invoice status. Nothing used by Accounts Payable changes.
 *
 *   customer master    code, trade name, country, currency, registration no., credit review date,
 *                      early-payment discount terms                                   (ar_customers)
 *   order lines        discount % per line; above 10 % needs approval                (ar_sales_order_items)
 *   delivery           who confirmed the proof of delivery (shipping kept apart from invoicing)
 *   customer invoice   reason for an invoice with no delivery, e-invoice IRN / e-way bill fields,
 *                      credit notes, early-payment discount and write-offs settled   (ar_invoices)
 *   receipts           discount allowed, payment applied from unapplied cash, read from an advice
 *   new tables         ar_credit_notes, ar_unapplied_cash, ar_write_offs, ar_ecl_settings, ar_ecl_runs,
 *                      ar_period_closes, ar_statements, r2r_manual_journals, r2r_close_tasks,
 *                      r2r_reconciliations
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = (await queryInterface.showAllTables()).map((t) => (typeof t === 'object' ? t.tableName : t).toLowerCase());
    const has = (name) => tables.includes(name.toLowerCase());
    const timestamps = {
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
    };
    const addColumns = async (table, columns) => {
      const have = await queryInterface.describeTable(table);
      for (const [name, def] of Object.entries(columns)) {
        if (!have[name]) await queryInterface.addColumn(table, name, def);
      }
    };
    const money = () => ({ type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0 });
    const id = { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false };
    const int = (allowNull = true) => ({ type: Sequelize.INTEGER, allowNull });
    const str = (n, allowNull = true) => ({ type: Sequelize.STRING(n), allowNull });
    const createTable = async (name, columns, indexes = []) => {
      if (has(name)) return;
      await queryInterface.createTable(name, { id, ...columns, ...timestamps });
      for (const ix of indexes) await queryInterface.addIndex(name, ix.fields, { name: ix.name, unique: !!ix.unique });
    };

    await addColumns('ar_customers', {
      customer_code: str(30),
      trade_name: str(255),
      country: { type: Sequelize.STRING(60), allowNull: false, defaultValue: 'India' },
      currency: { type: Sequelize.STRING(3), allowNull: false, defaultValue: 'INR' },
      registration_number: str(50),
      credit_review_date: { type: Sequelize.DATEONLY, allowNull: true },
      discount_percent: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      discount_days: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 }
    });
    await addColumns('ar_sales_order_items', {
      discount_percent: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 }
    });
    await addColumns('ar_deliveries', { confirmed_by: int() });
    await addColumns('ar_invoices', {
      direct_reason: str(255),
      irn: str(64),
      irn_ack_number: str(30),
      irn_ack_date: { type: Sequelize.DATEONLY, allowNull: true },
      eway_bill_number: str(20),
      credited_amount: money(),
      discount_allowed: money(),
      written_off_amount: money()
    });
    await queryInterface.changeColumn('ar_invoices', 'status', {
      type: Sequelize.ENUM('UNPAID', 'PARTIALLY_PAID', 'PAID', 'CANCELLED', 'WRITTEN_OFF'), allowNull: false, defaultValue: 'UNPAID'
    });
    await addColumns('ar_receipts', {
      discount_amount: money(),
      unapplied_id: int(),
      applied_by_ai: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false }
    });

    // Disputes and credit notes (blueprint step 5). The request is the dispute; approval posts the note.
    await createTable('ar_credit_notes', {
      client_id: int(false), customer_id: int(false), invoice_id: int(false), delivery_id: int(),
      credit_note_number: str(60), reason_code: str(30, false), description: { type: Sequelize.TEXT, allowNull: true },
      lines: { type: Sequelize.JSON, allowNull: true },
      subtotal: money(), tax_amount: money(), cgst_amount: money(), sgst_amount: money(), igst_amount: money(), total_amount: money(),
      credit_date: { type: Sequelize.DATEONLY, allowNull: true },
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'PENDING_APPROVAL' },
      evidence_url: str(500), evidence_name: str(255),
      requested_by: int(), approved_by: int(), approved_at: { type: Sequelize.DATE, allowNull: true }, decision_note: str(500)
    }, [
      { name: 'ar_credit_notes_client_status', fields: ['client_id', 'status'] },
      { name: 'ar_credit_notes_invoice', fields: ['invoice_id'] }
    ]);

    // Payments not yet matched to an invoice, and overpayments (blueprint step 7, account 2060).
    await createTable('ar_unapplied_cash', {
      client_id: int(false), customer_id: int(), received_date: { type: Sequelize.DATEONLY, allowNull: false },
      amount: money(), applied_amount: money(), payment_mode: str(30), reference: str(100), payer_name: str(255),
      notes: { type: Sequelize.TEXT, allowNull: true },
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'OPEN' }, created_by: int()
    }, [{ name: 'ar_unapplied_client_status', fields: ['client_id', 'status'] }]);

    // Bad-debt write-offs (blueprint step 9).
    await createTable('ar_write_offs', {
      client_id: int(false), customer_id: int(false), invoice_id: int(false), write_off_number: str(60),
      amount: money(), reason: str(500, false), evidence_url: str(500), evidence_name: str(255),
      collection_summary: { type: Sequelize.TEXT, allowNull: true },
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'PENDING_APPROVAL' },
      requested_by: int(), approved_by: int(), approved_at: { type: Sequelize.DATE, allowNull: true }, decision_note: str(500),
      allowance_used: money(), expense_amount: money(), recovered_amount: money()
    }, [{ name: 'ar_write_offs_client_status', fields: ['client_id', 'status'] }]);

    // Expected credit loss: loss rates by ageing bucket and specific reserves (blueprint step 8).
    // One row per company: ECL rates and specific reserves, and whether GST e-invoicing applies.
    await createTable('ar_ecl_settings', {
      client_id: int(false), rates: { type: Sequelize.JSON, allowNull: true }, specific: { type: Sequelize.JSON, allowNull: true },
      einvoice_applies: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      updated_by: int(), reviewed_at: { type: Sequelize.DATE, allowNull: true }
    }, [{ name: 'ar_ecl_settings_client', fields: ['client_id'], unique: true }]);
    await createTable('ar_ecl_runs', {
      client_id: int(false), period: str(7, false), as_of: { type: Sequelize.DATEONLY, allowNull: false },
      buckets: { type: Sequelize.JSON, allowNull: true }, required: money(), existing: money(),
      adjustment: { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'PENDING_APPROVAL' },
      prepared_by: int(), approved_by: int(), approved_at: { type: Sequelize.DATE, allowNull: true }, decision_note: str(500),
      journal_entry_id: int()
    }, [{ name: 'ar_ecl_runs_client_period', fields: ['client_id', 'period'] }]);

    // Month-end AR close with two-level sign-off; a closed month locks AR postings dated in it.
    await createTable('ar_period_closes', {
      client_id: int(false), period: str(7, false),
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'OPEN' },
      checklist: { type: Sequelize.JSON, allowNull: true },
      closed_by: int(), closed_at: { type: Sequelize.DATE, allowNull: true },
      signed_off_by: int(), signed_off_at: { type: Sequelize.DATE, allowNull: true },
      reopened_by: int(), reopened_at: { type: Sequelize.DATE, allowNull: true }, reopen_reason: str(500)
    }, [{ name: 'ar_period_closes_client_period', fields: ['client_id', 'period'], unique: true }]);

    // Customer statements of account and the customer's balance confirmation.
    await createTable('ar_statements', {
      client_id: int(false), customer_id: int(false), period_from: { type: Sequelize.DATEONLY, allowNull: false },
      period_to: { type: Sequelize.DATEONLY, allowNull: false }, opening_balance: money(), closing_balance: money(),
      sent_to: str(255), delivery: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'NOT_SENT' }, delivery_note: str(255),
      response: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'PENDING' },
      customer_balance: { type: Sequelize.DECIMAL(15, 2), allowNull: true }, difference: { type: Sequelize.DECIMAL(15, 2), allowNull: true },
      response_note: str(500), responded_at: { type: Sequelize.DATE, allowNull: true }, recorded_by: int(), created_by: int()
    }, [{ name: 'ar_statements_client_customer', fields: ['client_id', 'customer_id'] }]);

    // Record to report on the real ledger: manual journals (maker-checker), close tasks, reconciliations.
    await createTable('r2r_manual_journals', {
      client_id: int(false), mj_number: str(60), entry_date: { type: Sequelize.DATEONLY, allowNull: false },
      narration: str(500, false), lines: { type: Sequelize.JSON, allowNull: false }, total: money(),
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'PENDING_APPROVAL' },
      prepared_by: int(), approved_by: int(), approved_at: { type: Sequelize.DATE, allowNull: true }, decision_note: str(500),
      journal_entry_id: int()
    }, [{ name: 'r2r_manual_journals_client_status', fields: ['client_id', 'status'] }]);
    await createTable('r2r_close_tasks', {
      client_id: int(false), period: str(7, false), task_key: str(40, false),
      done: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false }, done_by: int(),
      done_at: { type: Sequelize.DATE, allowNull: true }, note: str(500)
    }, [{ name: 'r2r_close_tasks_unique', fields: ['client_id', 'period', 'task_key'], unique: true }]);
    await createTable('r2r_reconciliations', {
      client_id: int(false), period: str(7, false), rec_type: str(20, false),
      book_amount: { type: Sequelize.DECIMAL(15, 2), allowNull: true }, statement_amount: { type: Sequelize.DECIMAL(15, 2), allowNull: true },
      difference: { type: Sequelize.DECIMAL(15, 2), allowNull: true }, note: str(500),
      prepared_by: int(), prepared_at: { type: Sequelize.DATE, allowNull: true },
      reviewed_by: int(), reviewed_at: { type: Sequelize.DATE, allowNull: true }
    }, [{ name: 'r2r_reconciliations_unique', fields: ['client_id', 'period', 'rec_type'], unique: true }]);
  },

  async down(queryInterface, Sequelize) {
    for (const t of ['r2r_reconciliations', 'r2r_close_tasks', 'r2r_manual_journals', 'ar_statements', 'ar_period_closes', 'ar_ecl_runs',
      'ar_ecl_settings', 'ar_write_offs', 'ar_unapplied_cash', 'ar_credit_notes']) {
      await queryInterface.dropTable(t).catch(() => {});
    }
    const drop = async (table, cols) => { for (const c of cols) await queryInterface.removeColumn(table, c).catch(() => {}); };
    await drop('ar_receipts', ['discount_amount', 'unapplied_id', 'applied_by_ai']);
    await drop('ar_invoices', ['direct_reason', 'irn', 'irn_ack_number', 'irn_ack_date', 'eway_bill_number', 'credited_amount', 'discount_allowed', 'written_off_amount']);
    await drop('ar_deliveries', ['confirmed_by']);
    await drop('ar_sales_order_items', ['discount_percent']);
    await drop('ar_customers', ['customer_code', 'trade_name', 'country', 'currency', 'registration_number', 'credit_review_date', 'discount_percent', 'discount_days']);
    await queryInterface.changeColumn('ar_invoices', 'status', {
      type: Sequelize.ENUM('UNPAID', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'), allowNull: false, defaultValue: 'UNPAID'
    });
  }
};
