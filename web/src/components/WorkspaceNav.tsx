import { NavLink, useLocation } from 'react-router-dom';
import { DatabaseOutlined, RightOutlined } from '@ant-design/icons';
import { sectionForPath } from './workspace-navigation';

export default function WorkspaceNav() {
  const { pathname } = useLocation();
  const section = sectionForPath(pathname);
  return <header className="workbar">
    <div className="crumb"><DatabaseOutlined /> 性能工作台 <RightOutlined /> <strong>{section?.label ?? '设置'}</strong></div>
    {section?.items.length ? <nav aria-label="采集任务导航">{section.items.map(item =>
      <NavLink key={item.path} to={item.path}>{item.label}</NavLink>)}</nav> : null}
  </header>;
}
