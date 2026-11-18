import React from 'react';

/** Steps as one plain numbered line of text: no boxes, no arrows. Scrolls sideways on a narrow screen. */
const FlowStrip = ({ steps }) => (
  <div style={{ display: 'flex', flexWrap: 'nowrap', gap: 24, overflowX: 'auto', whiteSpace: 'nowrap', fontSize: 13.5 }}>
    {steps.map((step, index) => (
      <span key={step} style={{ flex: '0 0 auto' }}>{index + 1}. {step}</span>
    ))}
  </div>
);

export default FlowStrip;
