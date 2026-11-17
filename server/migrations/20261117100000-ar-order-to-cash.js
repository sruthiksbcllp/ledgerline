'use strict';

/**
 * Accounts Receivable, order to cash (the AR mirror of the P2P flow):
 *   customer onboarding  - terms, credit limit, verification and hold on ar_customers
 *   quotation / order    - ar_sales_orders, ar_sales_order_items (credit check result on the order)
 *   delivery             - ar_deliveries, ar_delivery_items
 *   customer invoice     - order / delivery links, GST split and lines on ar_invoices
 *   cash application     - TDS deducted by the customer on ar_receipts / ar_invoices
 *   collections          - reminder stage on ar_reminders, ar_promises (promises to pay)
 * Existing customers stay ACTIVE so nothing that works today is blocked.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = (await queryInterface.showAllTables()).map((t) => (typeof t === 'object' ? t.tableName : t));
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
    const money = { type: Sequelize.DECIMAL(15, 2), allowNull: false, defaultValue: 0 };

    await addColumns('ar_customers', {
      pan: { type: Sequelize.STRING(10), allowNull: true },
      contact_person: { type: Sequelize.STRING(150), allowNull: true },
      shipping_address: { type: Sequelize.TEXT, allowNull: true },
      payment_terms_days: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 30 },
      credit_limit: { type: Sequelize.DECIMAL(15, 2), allowNull: true },
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'ACTIVE' },
      hold_reason: { type: Sequelize.STRING(255), allowNull: true },
      verified_by: { type: Sequelize.INTEGER, allowNull: true },
      verified_at: { type: Sequelize.DATE, allowNull: true }
    });

    if (!tables.includes('ar_sales_orders')) {
      await queryInterface.createTable('ar_sales_orders', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        client_id: { type: Sequelize.INTEGER, allowNull: false },
        customer_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'ar_customers', key: 'id' } },
        quotation_number: { type: Sequelize.STRING(60), allowNull: true },
        order_number: { type: Sequelize.STRING(60), allowNull: true },
        status: { type: Sequelize.STRING(30), allowNull: false, defaultValue: 'QUOTATION' },
        order_date: { type: Sequelize.DATEONLY, allowNull: false },
        valid_until: { type: Sequelize.DATEONLY, allowNull: true },
        customer_po_number: { type: Sequelize.STRING(100), allowNull: true },
        subtotal: money,
        tax_amount: money,
        total_amount: money,
        credit_check: { type: Sequelize.JSON, allowNull: true },
        credit_released_by: { type: Sequelize.INTEGER, allowNull: true },
        credit_released_at: { type: Sequelize.DATE, allowNull: true },
        credit_release_note: { type: Sequelize.STRING(255), allowNull: true },
        confirmed_at: { type: Sequelize.DATE, allowNull: true },
        notes: { type: Sequelize.TEXT, allowNull: true },
        source: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'MANUAL' },
        source_file_name: { type: Sequelize.STRING(255), allowNull: true },
        created_by: { type: Sequelize.INTEGER, allowNull: true },
        ...timestamps
      });
      await queryInterface.addIndex('ar_sales_orders', ['client_id', 'status'], { name: 'ar_sales_orders_client_status' });
      await queryInterface.addIndex('ar_sales_orders', ['client_id', 'customer_id'], { name: 'ar_sales_orders_client_customer' });
    }

    if (!tables.includes('ar_sales_order_items')) {
      await queryInterface.createTable('ar_sales_order_items', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        client_id: { type: Sequelize.INTEGER, allowNull: false },
        order_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'ar_sales_orders', key: 'id' }, onDelete: 'CASCADE' },
        line_no: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        description: { type: Sequelize.STRING(500), allowNull: false },
        hsn_code: { type: Sequelize.STRING(20), allowNull: true },
        unit: { type: Sequelize.STRING(20), allowNull: true },
        quantity: { type: Sequelize.DECIMAL(15, 3), allowNull: false },
        rate: { type: Sequelize.DECIMAL(15, 2), allowNull: false },
        gst_percent: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
        amount: money,
        delivered_qty: { type: Sequelize.DECIMAL(15, 3), allowNull: false, defaultValue: 0 },
        invoiced_qty: { type: Sequelize.DECIMAL(15, 3), allowNull: false, defaultValue: 0 },
        ...timestamps
      });
      await queryInterface.addIndex('ar_sales_order_items', ['order_id'], { name: 'ar_sales_order_items_order' });
    }

    if (!tables.includes('ar_deliveries')) {
      await queryInterface.createTable('ar_deliveries', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        client_id: { type: Sequelize.INTEGER, allowNull: false },
        order_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'ar_sales_orders', key: 'id' } },
        customer_id: { type: Sequelize.INTEGER, allowNull: false },
        delivery_number: { type: Sequelize.STRING(60), allowNull: false },
        status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'DISPATCHED' },
        dispatch_date: { type: Sequelize.DATEONLY, allowNull: false },
        transporter: { type: Sequelize.STRING(150), allowNull: true },
        vehicle_number: { type: Sequelize.STRING(30), allowNull: true },
        tracking_reference: { type: Sequelize.STRING(100), allowNull: true },
        delivered_date: { type: Sequelize.DATEONLY, allowNull: true },
        received_by: { type: Sequelize.STRING(150), allowNull: true },
        delivery_note: { type: Sequelize.STRING(255), allowNull: true },
        invoice_id: { type: Sequelize.INTEGER, allowNull: true },
        created_by: { type: Sequelize.INTEGER, allowNull: true },
        ...timestamps
      });
      await queryInterface.addIndex('ar_deliveries', ['client_id', 'order_id'], { name: 'ar_deliveries_client_order' });
    }

    if (!tables.includes('ar_delivery_items')) {
      await queryInterface.createTable('ar_delivery_items', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        client_id: { type: Sequelize.INTEGER, allowNull: false },
        delivery_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'ar_deliveries', key: 'id' }, onDelete: 'CASCADE' },
        order_item_id: { type: Sequelize.INTEGER, allowNull: false },
        quantity: { type: Sequelize.DECIMAL(15, 3), allowNull: false },
        ...timestamps
      });
      await queryInterface.addIndex('ar_delivery_items', ['delivery_id'], { name: 'ar_delivery_items_delivery' });
    }

    await addColumns('ar_invoices', {
      sales_order_id: { type: Sequelize.INTEGER, allowNull: true },
      delivery_id: { type: Sequelize.INTEGER, allowNull: true },
      cgst_amount: money,
      sgst_amount: money,
      igst_amount: money,
      tds_deducted: money,
      line_items: { type: Sequelize.JSON, allowNull: true }
    });

    await addColumns('ar_receipts', {
      tds_amount: money,
      payment_group: { type: Sequelize.STRING(40), allowNull: true }
    });

    await addColumns('ar_reminders', {
      stage: { type: Sequelize.STRING(20), allowNull: true },
      drafted_by_ai: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false }
    });

    if (!tables.includes('ar_promises')) {
      await queryInterface.createTable('ar_promises', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        client_id: { type: Sequelize.INTEGER, allowNull: false },
        invoice_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'ar_invoices', key: 'id' } },
        promised_date: { type: Sequelize.DATEONLY, allowNull: false },
        amount: { type: Sequelize.DECIMAL(15, 2), allowNull: false },
        note: { type: Sequelize.STRING(255), allowNull: true },
        status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'OPEN' },
        created_by: { type: Sequelize.INTEGER, allowNull: true },
        ...timestamps
      });
      await queryInterface.addIndex('ar_promises', ['client_id', 'invoice_id'], { name: 'ar_promises_client_invoice' });
    }
  },

  async down(queryInterface) {
    for (const table of ['ar_promises', 'ar_delivery_items', 'ar_deliveries', 'ar_sales_order_items', 'ar_sales_orders']) {
      await queryInterface.dropTable(table).catch(() => {});
    }
    const drop = async (table, columns) => {
      const have = await queryInterface.describeTable(table);
      for (const name of columns) if (have[name]) await queryInterface.removeColumn(table, name);
    };
    await drop('ar_reminders', ['stage', 'drafted_by_ai']);
    await drop('ar_receipts', ['tds_amount', 'payment_group']);
    await drop('ar_invoices', ['sales_order_id', 'delivery_id', 'cgst_amount', 'sgst_amount', 'igst_amount', 'tds_deducted', 'line_items']);
    await drop('ar_customers', ['pan', 'contact_person', 'shipping_address', 'payment_terms_days', 'credit_limit', 'status', 'hold_reason', 'verified_by', 'verified_at']);
  }
};
