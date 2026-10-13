import React from 'react';

/**
 * QR icon matching the SBC FIX-TAG logo:
 * - 4 corner L-bracket scan frames
 * - Top-left + top-right + bottom-left QR finder boxes (outer border + filled inner)
 * - Dotted separators between quadrants
 * - Dense pixel data grid bottom-right
 * viewBox is tight (0 0 100 100) so the icon fills the requested size properly
 */
const QRIcon = ({ size = 40, color = '#FF7A1A' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 100 100"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* ── Corner scan brackets ── */}
    <path d="M6 22 L6 6 L22 6"   stroke={color} strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M78 6 L94 6 L94 22" stroke={color} strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M6 78 L6 94 L22 94" stroke={color} strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M78 94 L94 94 L94 78" stroke={color} strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round"/>

    {/* ── Top-left finder box ── */}
    <rect x="14" y="14" width="32" height="32" rx="3.5" stroke={color} strokeWidth="3.5" fill="none"/>
    <rect x="22" y="22" width="16" height="16" rx="2" fill={color}/>

    {/* ── Top-right finder box ── */}
    <rect x="54" y="14" width="32" height="32" rx="3.5" stroke={color} strokeWidth="3.5" fill="none"/>
    <rect x="62" y="22" width="16" height="16" rx="2" fill={color}/>

    {/* ── Dotted vertical separator (between top two boxes) ── */}
    <circle cx="50" cy="24" r="1.8" fill={color}/>
    <circle cx="50" cy="32" r="1.8" fill={color}/>
    <circle cx="50" cy="40" r="1.8" fill={color}/>

    {/* ── Dotted horizontal separator (between rows) ── */}
    <circle cx="22" cy="50" r="1.8" fill={color}/>
    <circle cx="30" cy="50" r="1.8" fill={color}/>
    <circle cx="38" cy="50" r="1.8" fill={color}/>
    <circle cx="50" cy="50" r="1.8" fill={color}/>
    <circle cx="62" cy="50" r="1.8" fill={color}/>
    <circle cx="70" cy="50" r="1.8" fill={color}/>
    <circle cx="78" cy="50" r="1.8" fill={color}/>

    {/* ── Bottom-left finder box ── */}
    <rect x="14" y="54" width="32" height="32" rx="3.5" stroke={color} strokeWidth="3.5" fill="none"/>
    <rect x="22" y="62" width="16" height="16" rx="2" fill={color}/>

    {/* ── Bottom-right dense pixel data ── */}
    {/* Row 1 */}
    <rect x="54" y="54" width="7" height="7" rx="1.5" fill={color}/>
    <rect x="64" y="54" width="7" height="7" rx="1.5" fill={color}/>
    <rect x="74" y="54" width="7" height="7" rx="1.5" fill={color}/>
    {/* Row 2 */}
    <rect x="54" y="64" width="7" height="7" rx="1.5" fill={color}/>
    <rect x="74" y="64" width="7" height="7" rx="1.5" fill={color}/>
    <rect x="84" y="64" width="7" height="7" rx="1.5" fill={color}/>
    {/* Row 3 */}
    <rect x="64" y="74" width="7" height="7" rx="1.5" fill={color}/>
    <rect x="74" y="74" width="7" height="7" rx="1.5" fill={color}/>
    {/* Row 4 */}
    <rect x="54" y="84" width="7" height="7" rx="1.5" fill={color}/>
    <rect x="74" y="84" width="7" height="7" rx="1.5" fill={color}/>
    <rect x="84" y="84" width="7" height="7" rx="1.5" fill={color}/>
    {/* Small accent fills */}
    <rect x="84" y="54" width="7" height="7" rx="1.5" fill={color}/>
    <rect x="64" y="84" width="4" height="4" rx="1"   fill={color}/>
    <rect x="59" y="79" width="4" height="4" rx="1"   fill={color}/>
    <rect x="79" y="69" width="4" height="4" rx="1"   fill={color}/>
  </svg>
);

const Logo = ({
  vertical    = false,
  dark        = false,
  size        = '40px',
  fontSize    = '22px',
  subFontSize = '10px',
  iconOnly    = false,
}) => {
  const iconPx    = parseInt(size, 10) || 40;
  // Real logo: ALL text is dark charcoal — no orange on any word
  const textColor = dark ? '#2D2D2D' : '#ffffff';
  const subColor  = dark ? '#6B7280' : 'rgba(255,255,255,0.68)';

  if (iconOnly) return <QRIcon size={iconPx} color="#FF7A1A" />;

  return (
    <div style={{
      display:       'flex',
      flexDirection: vertical ? 'column' : 'row',
      alignItems:    'center',
      gap:           vertical ? 10 : 10,
      cursor:        'pointer',
      userSelect:    'none',
      flexShrink:    0,
    }}>
      <QRIcon size={iconPx} color="#F97316" />
      <div style={{
        display:       'flex',
        flexDirection: 'column',
        lineHeight:    1.2,
        textAlign:     vertical ? 'center' : 'left',
        whiteSpace:    'nowrap',
      }}>
        <span style={{
          fontSize,
          fontWeight:    800,
          letterSpacing: '0.05em',
          color:         textColor,
          fontFamily:    "'Segoe UI', 'Inter', sans-serif",
          textTransform: 'uppercase',
          lineHeight:    1.1,
        }}>
          SBC FIX-TAG
        </span>
        <span style={{
          fontSize:      subFontSize,
          fontWeight:    400,
          color:         subColor,
          fontStyle:     'italic',
          letterSpacing: '0.02em',
          marginTop:     3,
          lineHeight:    1.3,
        }}>
          360° Fixed Asset Management
        </span>
      </div>
    </div>
  );
};

export default Logo;
