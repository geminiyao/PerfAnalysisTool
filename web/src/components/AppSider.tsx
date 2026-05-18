import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu } from 'antd';
import {
  DashboardOutlined,
  UploadOutlined,
  HistoryOutlined,
  SwapOutlined,
  LineChartOutlined,
  SettingOutlined,
} from '@ant-design/icons';

const { Sider } = Layout;

const AppSider: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    { key: '/', icon: <DashboardOutlined />, label: '仪表盘' },
    { key: '/upload', icon: <UploadOutlined />, label: '上传分析' },
    { key: '/history', icon: <HistoryOutlined />, label: '历史记录' },
    { key: '/compare', icon: <SwapOutlined />, label: '对比分析' },
    { key: '/trends', icon: <LineChartOutlined />, label: '趋势图表' },
    { key: '/settings', icon: <SettingOutlined />, label: '系统设置' },
  ];

  return (
    <Sider
      width={180}
      style={{
        background: 'var(--bg-sider)',
        borderRight: '1px solid var(--border-primary)',
      }}
      breakpoint="lg"
      collapsedWidth={56}
    >
      <div style={{
        height: 48,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderBottom: '1px solid var(--border-primary)',
      }}>
        <span style={{
          color: 'var(--color-primary)',
          margin: 0,
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: '0.5px',
          fontFamily: 'var(--font-mono)',
        }}>
          PERF
        </span>
        <span style={{
          color: 'var(--text-secondary)',
          fontSize: 13,
          fontWeight: 400,
          marginLeft: 4,
        }}>
          Monitor
        </span>
      </div>
      <Menu
        theme="dark"
        mode="inline"
        selectedKeys={[location.pathname]}
        items={menuItems}
        onClick={({ key }) => navigate(key)}
        style={{
          borderRight: 0,
          background: 'transparent',
          fontSize: 13,
          marginTop: 4,
        }}
      />
    </Sider>
  );
};

export default AppSider;
