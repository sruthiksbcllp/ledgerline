import React from 'react';
import { Col, Row, Typography } from 'antd';
import { PO_GROUPS, countPoGroups } from '../../constants/poStatus';

const { Text } = Typography;

/**
 * Count cards for purchase orders by stage: Total, Awaiting approval, Open, Completed,
 * Rejected / Cancelled. Clicking a card calls onSelect(groupKey) ('all' for Total);
 * the selected card is outlined.
 */
const PoStatusSummary = ({ pos = [], active = 'all', onSelect, compact = false }) => {
  const counts = countPoGroups(pos);
  const cards = [
    { key: 'all', label: 'Total POs', color: 'var(--color-navy, #1e293b)', value: counts.total },
    ...PO_GROUPS.map((g) => ({ key: g.key, label: g.label, hint: g.hint, color: g.color, value: counts[g.key] })),
  ];
  return (
    <Row gutter={[12, 12]}>
      {cards.map((c) => {
        const selected = active === c.key;
        return (
          <Col key={c.key} flex={compact ? '1 1 130px' : '1 1 160px'}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => onSelect?.(c.key)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect?.(c.key); }}
              title={c.hint || c.label}
              style={{
                cursor: onSelect ? 'pointer' : 'default',
                background: 'var(--color-bg-card, #fff)',
                border: `1px solid ${selected ? c.color : 'var(--color-border)'}`,
                boxShadow: selected ? `0 0 0 2px ${c.color}22` : 'var(--shadow-sm)',
                borderLeft: `4px solid ${c.color}`,
                borderRadius: 'var(--radius-lg, 12px)',
                padding: compact ? '10px 14px' : '14px 18px',
                height: '100%',
              }}
            >
              <Text type="secondary" style={{ fontSize: 12 }}>{c.label}</Text>
              <div style={{ fontSize: compact ? 22 : 28, fontWeight: 700, color: c.color, lineHeight: 1.3 }}>{c.value}</div>
            </div>
          </Col>
        );
      })}
    </Row>
  );
};

export default PoStatusSummary;
