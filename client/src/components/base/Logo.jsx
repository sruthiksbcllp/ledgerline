import React from 'react';

const Mark = ({ size = 40 }) => {
  const rawId = React.useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id={rawId} x1="6" y1="4" x2="44" y2="46" gradientUnits="userSpaceOnUse">
          <stop stopColor="#818CF8" />
          <stop offset="1" stopColor="#4F46E5" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="14" fill={`url(#${rawId})`} />
      <path d="M14 16.5h20" stroke="white" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M14 24h15" stroke="white" strokeWidth="2.6" strokeLinecap="round" opacity="0.92" />
      <path d="M14 31.5h10" stroke="#A5F3FC" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
};

const Logo = ({
  vertical    = false,
  dark        = false,
  size        = '40px',
  fontSize    = '22px',
  subFontSize = '10px',
  iconOnly    = false,
}) => {
  const iconPx    = parseInt(size, 10) || 40;
  const textColor = dark ? '#0B1020' : '#ffffff';
  const accent    = dark ? '#4F46E5' : '#C7D2FE';
  const subColor  = dark ? '#64748B' : 'rgba(255,255,255,0.62)';

  if (iconOnly) return <Mark size={iconPx} />;

  return (
    <div style={{
      display:       'flex',
      flexDirection: vertical ? 'column' : 'row',
      alignItems:    'center',
      gap:           vertical ? 12 : 12,
      cursor:        'pointer',
      userSelect:    'none',
      flexShrink:    0,
    }}>
      <Mark size={iconPx} />
      <div style={{
        display:       'flex',
        flexDirection: 'column',
        lineHeight:    1.15,
        textAlign:     vertical ? 'center' : 'left',
        whiteSpace:    'nowrap',
      }}>
        <span style={{
          fontSize,
          fontWeight:    800,
          letterSpacing: '-0.04em',
          color:         textColor,
          fontFamily:    "'Plus Jakarta Sans', 'Inter', sans-serif",
          lineHeight:    1.05,
        }}>
          Ledger<span style={{ color: accent }}>Line</span>
        </span>
        <span style={{
          fontSize:      subFontSize,
          fontWeight:    500,
          color:         subColor,
          letterSpacing: '0.04em',
          marginTop:     3,
          lineHeight:    1.3,
        }}>
          AR and AP
        </span>
      </div>
    </div>
  );
};

export default Logo;
