import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu } from 'antd';
import {
  DashboardOutlined,
  ThunderboltOutlined,
  DatabaseOutlined,
  SwapOutlined,
  SettingOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import { sectionForPath, workspaceSections } from './workspace-navigation';

const { Sider } = Layout;

const icons = {
  overview: <DashboardOutlined />,
  collection: <ThunderboltOutlined />,
  data: <DatabaseOutlined />,
  analysis: <SwapOutlined />,
  reports: <FileTextOutlined />,
};

const AppSider: React.FC = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const section = sectionForPath(pathname);

  return (
    <Sider
      width={206}
      breakpoint="lg"
      collapsedWidth={56}
      style={{
        background: 'var(--bg-sider)',
        borderRight: '1px solid var(--border-primary)',
        height: '100vh',
        position: 'sticky',
        top: 0,
      }}
    >
      <div className="workspace-sider-inner">
        <div className="workspace-brand">
          <span className="workspace-brand-accent">P</span><span>Perf Monitor</span>
        </div>
        <div className="workspace-sider-caption">工作台</div>
        <Menu
          theme="light"
          mode="inline"
          selectedKeys={section ? [section.path] : []}
          items={workspaceSections.map(item => ({
            key: item.path,
            icon: icons[item.key],
            label: item.label,
            title: item.label,
          }))}
          onClick={({ key }) => navigate(key)}
          className="workspace-primary-menu"
        />
        <div className="workspace-sider-spacer" />
        <Menu
          theme="light"
          mode="inline"
          selectedKeys={pathname === '/settings' ? ['/settings'] : []}
          items={[{ key: '/settings', icon: <SettingOutlined />, label: '设置' }]}
          onClick={() => navigate('/settings')}
          className="workspace-settings-menu"
        />
      </div>
    </Sider>
  );
};

export default AppSider;
