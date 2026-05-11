import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu } from 'antd';
import {
  DashboardOutlined,
  UploadOutlined,
  HistoryOutlined,
  SwapOutlined,
  LineChartOutlined,
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
  ];

  return (
    <Sider
      width={200}
      style={{ background: '#141414' }}
      breakpoint="lg"
      collapsedWidth={60}
    >
      <div style={{
        height: 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderBottom: '1px solid #303030',
      }}>
        <h2 style={{ color: '#fff', margin: 0, fontSize: 16 }}>Perf Dashboard</h2>
      </div>
      <Menu
        theme="dark"
        mode="inline"
        selectedKeys={[location.pathname]}
        items={menuItems}
        onClick={({ key }) => navigate(key)}
        style={{ borderRight: 0 }}
      />
    </Sider>
  );
};

export default AppSider;
