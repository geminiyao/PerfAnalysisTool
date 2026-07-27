import React, { useMemo } from 'react';
import { UnorderedListOutlined } from '@ant-design/icons';
import type { ReportOutlineItem } from '@shared/report-bundle';

interface TocGroup {
  section: ReportOutlineItem;
  children: ReportOutlineItem[];
}

interface ReportTocProps {
  outline: ReportOutlineItem[];
  activeId: string;
  onNavigate: (id: string) => void;
  appendixId?: string;
}

function buildGroups(outline: ReportOutlineItem[]): TocGroup[] {
  const groups: TocGroup[] = [];
  let current: TocGroup | null = null;

  for (const item of outline) {
    if (item.level === 1) continue;
    if (item.level === 2) {
      current = { section: item, children: [] };
      groups.push(current);
      continue;
    }
    if (item.level === 3 && current) {
      current.children.push(item);
    }
  }
  return groups;
}

function shortenTitle(title: string): string {
  return title
    .replace(/^热点 #\d+：/, '#')
    .replace(/（[^）]+）/g, '')
    .trim();
}

const ReportToc: React.FC<ReportTocProps> = ({ outline, activeId, onNavigate, appendixId = 'appendix' }) => {
  const groups = useMemo(() => buildGroups(outline), [outline]);

  const handleClick = (id: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    onNavigate(id);
  };

  return (
    <aside className="report-toc-panel">
      <div className="report-toc-header">
        <UnorderedListOutlined />
        <span>本页目录</span>
      </div>

      <nav className="report-toc-nav">
        {groups.map((group, index) => {
          const sectionActive = activeId === group.section.id;
          const childActive = group.children.some(child => child.id === activeId);

          return (
            <div key={group.section.id} className="report-toc-group">
              <a
                href={`#${group.section.id}`}
                className={`report-toc-link level-2${sectionActive ? ' active' : ''}${childActive && !sectionActive ? ' parent-active' : ''}`}
                onClick={handleClick(group.section.id)}
              >
                <span className="report-toc-index">{String(index + 1).padStart(2, '0')}</span>
                <span className="report-toc-text">{group.section.title.replace(/^[^、]+、/, '')}</span>
              </a>

              {group.children.length > 0 && (
                <div className="report-toc-children">
                  {group.children.map(child => (
                    <a
                      key={child.id}
                      href={`#${child.id}`}
                      className={`report-toc-link level-3${activeId === child.id ? ' active' : ''}`}
                      onClick={handleClick(child.id)}
                      title={child.title}
                    >
                      <span className="report-toc-dot" />
                      <span className="report-toc-text">{shortenTitle(child.title)}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <a
        href={`#${appendixId}`}
        className={`report-toc-appendix${activeId === appendixId ? ' active' : ''}`}
        onClick={handleClick(appendixId)}
      >
        交互附录
      </a>
    </aside>
  );
};

export default ReportToc;
