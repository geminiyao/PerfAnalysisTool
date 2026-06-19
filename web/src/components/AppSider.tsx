import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu } from 'antd';
import {
  DashboardOutlined,
  UploadOutlined,
  SwapOutlined,
  LineChartOutlined,
  SettingOutlined,
  DatabaseOutlined,
  PartitionOutlined,
} from '@ant-design/icons';

const { Sider } = Layout;

/** v2 §4 信息架构: 7 项导航 — 单次分析进 Runs 详情, 对比独立一项。 */
const menuItems = [
  { key: '/', icon: <DashboardOutlined />, label: '仪表盘' },
  { key: '/upload', icon: <UploadOutlined />, label: '采集上传' },
  { key: '/runs', icon: <PartitionOutlined />, label: 'Runs' },
  { key: '/compare', icon: <SwapOutlined />, label: '对比分析' },
  { key: '/trends', icon: <LineChartOutlined />, label: '趋势' },
  { key: '/assets', icon: <DatabaseOutlined />, label: 'Assets' },
  { key: '/settings', icon: <SettingOutlined />, label: '设置' },
];

function selectedMenuKey(pathname: string): string {
  if (pathname.startsWith('/runs')) return '/runs';
  if (pathname.startsWith('/compare')) return '/compare';
  return pathname;
}

const AppSider: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

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
        selectedKeys={[selectedMenuKey(location.pathname)]}
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
