export interface WorkspaceSection {
  key: 'overview' | 'collection' | 'reports';
  path: string;
  label: string;
  items: { path: string; label: string }[];
}

export const workspaceSections: WorkspaceSection[] = [
  { key: 'overview', path: '/', label: '趋势总览', items: [] },
  { key: 'collection', path: '/collect', label: '采集任务', items: [
    { path: '/collect', label: '新建采集' }, { path: '/runs', label: '采集记录' },
    { path: '/upload', label: '导入数据' },
    { path: '/assets', label: '文件资产' },
  ] },
  { key: 'reports', path: '/performance-reports', label: '性能报告', items: [] },
];

export function sectionForPath(path: string) {
  if (path === '/settings') return undefined;
  if (/^\/(performance-reports|prism-report|report-view|report-preview)/.test(path)) return workspaceSections[2];
  return path === '/' || path === '/trends' ? workspaceSections[0] : workspaceSections[1];
}
