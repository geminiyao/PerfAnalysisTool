import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import App from './App';
import './styles/global.less';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#1677ff',
          colorBgContainer: '#141619',
          colorBgElevated: '#1a1d21',
          colorBgLayout: '#0f1214',
          colorBorder: '#1f2328',
          colorBorderSecondary: '#2a2e33',
          colorText: '#e6eaf0',
          colorTextSecondary: '#8b949e',
          colorTextTertiary: '#5a6068',
          borderRadius: 6,
          fontSize: 13,
          colorSuccess: '#2ea043',
          colorError: '#da3633',
          colorWarning: '#d29922',
        },
        components: {
          Card: { paddingLG: 16 },
          Table: { headerBg: '#1a1d21', rowHoverBg: 'rgba(255,255,255,0.04)' },
        },
      }}
    >
      <BrowserRouter basename="/cpu">
        <App />
      </BrowserRouter>
    </ConfigProvider>
  </React.StrictMode>
);
