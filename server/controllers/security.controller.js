const { AssetAlert, Location, sequelize } = require('../models');
const { getClientId } = require('../utils/tenantFilter');

exports.getSecurityMetrics = async (req, res) => {
  try {
    const client_id = getClientId(req);
    const where = client_id ? { client_id } : {};
    const whereResolved = {
      status: 'RESOLVED',
      resolved_at: { [sequelize.Sequelize.Op.ne]: null },
      ...(client_id ? { client_id } : {})
    };

    // 1. Core Metrics
    const total_open = await AssetAlert.count({ where: { status: 'OPEN', ...where } });
    const critical = await AssetAlert.count({
      where: {
        priority: 'CRITICAL',
        status: { [sequelize.Sequelize.Op.ne]: 'RESOLVED' },
        ...where
      }
    });
    
    // 2. Average Resolution Time (Last 30 days)
    const avgResolvedRows = await AssetAlert.findAll({
      attributes: [[sequelize.fn('AVG', sequelize.fn('TIMESTAMPDIFF', sequelize.literal('MINUTE'), sequelize.col('created_at'), sequelize.col('resolved_at'))), 'avg_min']],
      where: whereResolved,
      raw: true
    });

    // 3. Alerts by Location
    const alertsByLocation = await AssetAlert.findAll({
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('AssetAlert.id')), 'count'],
        [sequelize.col('Location.location_name'), 'location_name']
      ],
      include: [{ model: Location, attributes: [] }],
      where,
      group: ['Location.location_name'],
      raw: true
    });

    // 4. Alerts by Type
    const alertsByType = await AssetAlert.findAll({
      attributes: ['alert_type', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
      where,
      group: ['alert_type'],
      raw: true
    });

    res.json({
      success: true,
      data: {
        total_open_alerts: total_open,
        critical_alerts: critical,
        avg_resolution_time: Math.round(Number(avgResolvedRows?.[0]?.avg_min || 0)),
        alerts_by_location: alertsByLocation,
        alerts_by_type: alertsByType
      }
    });

  } catch (error) {
    res.json({ success: true, data: {} });
  }
};
