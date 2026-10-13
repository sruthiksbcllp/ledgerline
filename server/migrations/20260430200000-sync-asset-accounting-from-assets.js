'use strict';
module.exports = {
  up: async (queryInterface) => {
    const assets = await queryInterface.describeTable('assets');
    const has = (c) => Boolean(assets[c]);
    const purchaseExpr = has('purchase_cost')
      ? (has('total_cost') ? 'COALESCE(a.purchase_cost, a.total_cost, 0)' : 'COALESCE(a.purchase_cost, 0)')
      : (has('total_cost') ? 'COALESCE(a.total_cost, 0)' : '0');
    const usefulLifeExpr = has('useful_life') ? 'COALESCE(a.useful_life, 5)' : '5';
    const residualExpr = has('residual_value') ? 'COALESCE(a.residual_value, 0)' : '0';
    const methodExpr = has('depreciation_method') ? "COALESCE(a.depreciation_method, 'SLM')" : "'SLM'";
    const putToUseExpr = has('put_to_use_date')
      ? (has('purchase_date') ? 'COALESCE(a.put_to_use_date, a.purchase_date, NOW())' : 'COALESCE(a.put_to_use_date, NOW())')
      : (has('purchase_date') ? 'COALESCE(a.purchase_date, NOW())' : 'NOW()');
    const createdByExpr = has('created_by') ? 'a.created_by' : 'NULL';
    const openingExpr = has('accumulated_depreciation_opening') ? 'COALESCE(a.accumulated_depreciation_opening, 0)' : '0';

    await queryInterface.sequelize.query(`
      INSERT INTO assetaccounting (
        asset_id,
        cost_of_purchase,
        original_useful_life_years,
        residual_value,
        scrap_value,
        method_of_depreciation,
        date_of_put_in_place,
        date_of_retirement,
        accumulated_dep_opening_balance,
        wdv_rate,
        it_act_rate,
        sale_of_asset,
        created_by,
        createdAt,
        updatedAt
      )
      SELECT
        a.id,
        ${purchaseExpr},
        ${usefulLifeExpr},
        ${residualExpr},
        ${residualExpr},
        ${methodExpr},
        ${putToUseExpr},
        COALESCE(
          DATE_ADD(${putToUseExpr},
          INTERVAL ${usefulLifeExpr} YEAR),
          DATE_ADD(NOW(), INTERVAL 5 YEAR)
        ),
        ${openingExpr},
        0,
        0,
        'NO',
        ${createdByExpr},
        NOW(),
        NOW()
      FROM assets a
      LEFT JOIN assetaccounting aa ON aa.asset_id = a.id
      WHERE aa.asset_id IS NULL;
    `);
  },
  down: async () => { return Promise.resolve(); }
};
