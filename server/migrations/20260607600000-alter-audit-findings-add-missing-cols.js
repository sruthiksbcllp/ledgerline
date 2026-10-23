'use strict';
module.exports = {
  async up(queryInterface) {
    const addCol = async (table, col, type) => {
      try { await queryInterface.addColumn(table, col, type); }
      catch (e) { if (e.message && e.message.includes('Duplicate column')) return; throw e; }
    };
    const { DataTypes } = queryInterface.sequelize.constructor;
    await addCol('audit_findings', 'client_id', { type: DataTypes.INTEGER, allowNull: true });
    await addCol('audit_findings', 'audit_plan_id', { type: DataTypes.INTEGER, allowNull: true });
    await addCol('audit_findings', 'title', { type: DataTypes.STRING(500), allowNull: true });
    await addCol('audit_findings', 'recommendation', { type: DataTypes.TEXT, allowNull: true });
    await addCol('audit_findings', 'management_response', { type: DataTypes.TEXT, allowNull: true });
    await addCol('audit_findings', 'due_date', { type: DataTypes.DATEONLY, allowNull: true });
    await addCol('audit_findings', 'resolved_date', { type: DataTypes.DATEONLY, allowNull: true });
    await addCol('audit_findings', 'assigned_to', { type: DataTypes.INTEGER, allowNull: true });
    await addCol('audit_findings', 'created_by', { type: DataTypes.INTEGER, allowNull: true });
    try {
      await queryInterface.sequelize.query("ALTER TABLE audit_findings MODIFY COLUMN finding_type ENUM('OBSERVATION','EXCEPTION','NON_COMPLIANCE','RECOMMENDATION') DEFAULT 'OBSERVATION'");
    } catch (e) {}
    try {
      await queryInterface.sequelize.query("ALTER TABLE audit_findings MODIFY COLUMN status ENUM('OPEN','IN_PROGRESS','RESOLVED','CLOSED','DEFERRED','IGNORED') DEFAULT 'OPEN'");
    } catch (e) {}
  },
  async down(queryInterface) {
    for (const col of ['client_id','audit_plan_id','title','recommendation','management_response','due_date','resolved_date','assigned_to','created_by']) {
      try { await queryInterface.removeColumn('audit_findings', col); } catch (e) {}
    }
  }
};
