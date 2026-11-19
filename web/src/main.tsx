import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import App from './App';
import './styles/global.less';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#326487', colorText: '#203443', colorTextSecondary: '#556b79',
          colorBgLayout: '#eef2f4', colorBorderSecondary: '#e0e6ea',
          colorSuccess: '#477858', colorWarning: '#a7692b', borderRadius: 9, fontSize: 14,
          fontFamily: "'Segoe UI', 'Microsoft YaHei', sans-serif",
        },
        components: {
          Card: { borderRadiusLG: 14 },
          Menu: { itemSelectedBg: '#deE9f1', itemSelectedColor: '#204863' },
          Table: { headerBg: '#f3f6f8', rowHoverBg: '#edf4f8' },
        },
      }}
    >
      <BrowserRouter basename="/cpu">
        <App />
      </BrowserRouter>
    </ConfigProvider>
  </React.StrictMode>
);
