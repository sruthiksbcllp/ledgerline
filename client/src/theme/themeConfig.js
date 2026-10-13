export const themeConfig = {
  token: {
    colorPrimary: '#FF7A1A', // Modern Admin UI Primary Orange
    colorInfo: '#3B82F6',    // Modern Admin UI Info Blue
    colorSuccess: '#10B981', // Modern Admin UI Success Emerald
    colorWarning: '#F59E0B', // Modern Admin UI Warning Amber
    colorError: '#EF4444',   // Modern Admin UI Danger Red
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    borderRadius: 12,        // Standardized rounded edges
    colorBgLayout: '#F8FAFC', // Premium light background
    colorText: '#1E293B',
    colorTextHeading: '#0F172A',
    wireframe: false,
  },
  components: {
    Layout: {
      siderBg: '#0F172A',    // Dark premium sidebar
      headerBg: '#ffffff',
      headerHeight: 72,
    },
    Menu: {
      darkItemBg: '#0F172A',
      darkItemSelectedBg: '#FF7A1A',
      darkItemSelectedColor: '#ffffff',
      itemBorderRadius: 10,
      itemActiveBg: 'rgba(255, 122, 26, 0.1)',
      itemHeight: 46,
    },
    Card: {
      borderRadiusLG: 16,
      boxShadowTertiary: '0 4px 12px rgba(0, 0, 0, 0.05)',
      paddingLG: 24,
      headerFontSize: 16,
    },
    Button: {
      borderRadius: 12,
      controlHeight: 42,
      fontWeight: 700,
      boxShadow: '0 2px 4px rgba(255, 122, 26, 0.1)',
    },
    Table: {
      headerBg: '#F8FAFC',
      headerColor: '#64748B',
      headerBorderRadius: 0,
      borderColor: '#F1F5F9',
      padding: 16,
      fontSize: 13,
      fontWeightStrong: 700,
    },
    Input: {
      borderRadius: 10,
      controlHeight: 40,
      borderColor: '#E2E8F0',
    },
    Select: {
      borderRadius: 10,
      controlHeight: 40,
    }
  },
};
