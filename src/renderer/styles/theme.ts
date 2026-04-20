import { theme } from 'antd'

const { darkAlgorithm } = theme

export const themeConfig = {
  algorithm: darkAlgorithm,
  token: {
    colorPrimary: '#7c3aed',
    colorBgBase: '#0d0d1a',
    colorBgContainer: '#13132b',
    colorBgElevated: '#1a1a35',
    colorBgLayout: '#0d0d1a',
    colorBorder: 'rgba(255, 255, 255, 0.08)',
    colorBorderSecondary: 'rgba(255, 255, 255, 0.05)',
    colorText: '#e2e8f0',
    colorTextSecondary: '#94a3b8',
    colorTextTertiary: '#64748b',
    fontFamily: "'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontSize: 13,
    borderRadius: 8,
    controlHeight: 32,
    colorSuccess: '#22c55e',
    colorError: '#ef4444',
    colorWarning: '#f59e0b',
    colorInfo: '#3b82f6'
  },
  components: {
    Select: {
      colorBgContainer: '#1a1a35',
      colorBgElevated: '#252547',
      optionSelectedBg: 'rgba(124, 58, 237, 0.2)'
    },
    Table: {
      colorBgContainer: '#13132b',
      headerBg: '#1a1a35',
      rowHoverBg: 'rgba(124, 58, 237, 0.08)',
      borderColor: 'rgba(255, 255, 255, 0.06)'
    },
    Tabs: {
      inkBarColor: '#7c3aed',
      itemSelectedColor: '#e2e8f0',
      itemColor: '#94a3b8',
      itemHoverColor: '#e2e8f0'
    },
    Collapse: {
      headerBg: '#1a1a35',
      contentBg: '#13132b'
    },
    Input: {
      colorBgContainer: '#1a1a35',
      activeBorderColor: '#7c3aed',
      hoverBorderColor: 'rgba(124, 58, 237, 0.5)'
    },
    InputNumber: {
      colorBgContainer: '#1a1a35',
      activeBorderColor: '#7c3aed'
    },
    Button: {
      primaryShadow: '0 2px 8px rgba(124, 58, 237, 0.3)'
    }
  }
}
