export const themeConfig = {
  token: {
    colorPrimary: '#4F46E5',
    colorInfo: '#0EA5E9',
    colorSuccess: '#059669',
    colorWarning: '#D97706',
    colorError: '#E11D48',
    fontFamily: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif",
    borderRadius: 14,
    colorBgLayout: '#F4F6FB',
    colorText: '#1E293B',
    colorTextHeading: '#0B1020',
    colorBorder: '#E6EAF2',
    wireframe: false,
  },
  components: {
    Layout: {
      siderBg: '#0B1020',
      headerBg: 'rgba(255,255,255,0.86)',
      headerHeight: 68,
    },
    Menu: {
      darkItemBg: 'transparent',
      darkItemSelectedBg: 'rgba(99, 102, 241, 0.28)',
      darkItemSelectedColor: '#ffffff',
      itemBorderRadius: 12,
      itemActiveBg: 'rgba(79, 70, 229, 0.1)',
      itemHeight: 44,
    },
    Card: {
      borderRadiusLG: 18,
      boxShadowTertiary: '0 10px 30px rgba(15, 23, 42, 0.05)',
      paddingLG: 24,
      headerFontSize: 16,
    },
    Button: {
      borderRadius: 12,
      controlHeight: 42,
      fontWeight: 600,
      boxShadow: '0 8px 20px rgba(79, 70, 229, 0.16)',
    },
    Table: {
      headerBg: '#F7F8FC',
      headerColor: '#64748B',
      headerBorderRadius: 12,
      borderColor: '#EEF1F6',
      padding: 16,
      fontSize: 13,
      fontWeightStrong: 700,
    },
    Input: {
      borderRadius: 12,
      controlHeight: 42,
      borderColor: '#E6EAF2',
    },
    Select: {
      borderRadius: 12,
      controlHeight: 42,
    },
    Modal: {
      borderRadiusLG: 20,
    },
  },
};
