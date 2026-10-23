import React from 'react';
import { Typography } from 'antd';

const { Text } = Typography;

const FlowStrip = ({ steps, rowSize = 4 }) => {
  const rows = [];
  for (let index = 0; index < steps.length; index += rowSize) rows.push(steps.slice(index, index + rowSize));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map((row, rowIndex) => (
        <div key={row.join('-')}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            {row.map((step, index) => (
              <React.Fragment key={step}>
                <div style={{
                  minWidth: 148,
                  flex: '1 1 148px',
                  maxWidth: 220,
                  background: '#EEF3FA',
                  border: '1px solid #D6E2F0',
                  borderRadius: 10,
                  padding: '12px 14px',
                  color: '#1E3A5F',
                  fontWeight: 650,
                }}>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>{rowIndex * rowSize + index + 1}</div>
                  {step}
                </div>
                {index < row.length - 1 ? <Text type="secondary">→</Text> : null}
              </React.Fragment>
            ))}
          </div>
          {rowIndex < rows.length - 1 ? (
            <Text type="secondary" style={{ display: 'block', textAlign: 'right', marginTop: 4 }}>continues</Text>
          ) : null}
        </div>
      ))}
    </div>
  );
};

export default FlowStrip;
