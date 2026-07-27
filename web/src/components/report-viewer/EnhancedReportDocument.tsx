import React, { useMemo, useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Segmented } from 'antd';
import type { ReportBundle } from '@shared/report-bundle';
import FlameTree from './FlameTree';

function slugify(title: string): string {
  return title
    .replace(/§\d+/g, '')
    .replace(/[、，。：]/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function headingId(text: string, level: number, bundle: ReportBundle): string {
  return bundle.outline.find(item => item.title === text && item.level === level)?.id ?? slugify(text);
}

function isCallTreeCode(code: string): boolean {
  const trimmed = code.trim();
  if (trimmed.length < 40) return false;
  return (
    (trimmed.includes('PlayerLoop') || trimmed.includes('→') || trimmed.includes('Core.Update'))
    && (trimmed.includes('ms') || trimmed.includes('%'))
  );
}

function extractHighlightName(code: string): string | undefined {
  const bottleneck = code.match(/\*\*BOTTLENECK\*\*[^\n]*/);
  if (bottleneck) {
    const marker = bottleneck[0].match(/CS:[^\s\[]+|MapSignificanceMgr|BattleHeadMgr|MeshUIManager|GC\.Collect/);
    if (marker) return marker[0];
  }
  const csMarker = code.match(/CS:[A-Za-z0-9_.]+/);
  return csMarker?.[0];
}

const CallTreeBlock: React.FC<{
  code: string;
  bundle: ReportBundle;
}> = ({ code, bundle }) => {
  const [mode, setMode] = useState<'text' | 'tree'>('text');
  const highlightName = extractHighlightName(code);
  const tree = useMemo(
    () => bundle.trees.find(item => item.label.includes('median')) ?? bundle.trees[0],
    [bundle.trees],
  );

  return (
    <div className="report-calltree-block">
      <div className="report-calltree-toolbar">
        <Segmented
          size="small"
          value={mode}
          onChange={value => setMode(value as 'text' | 'tree')}
          options={[
            { label: '原文', value: 'text' },
            { label: '交互树', value: 'tree' },
          ]}
        />
        {tree && mode === 'tree' && (
          <span className="report-calltree-meta">{tree.label} · {tree.thread}</span>
        )}
      </div>
      {mode === 'text' ? (
        <pre><code>{code}</code></pre>
      ) : tree ? (
        <FlameTree
          root={tree.root}
          defaultExpandDepth={5}
          highlightName={highlightName}
          compact
        />
      ) : (
        <pre><code>{code}</code></pre>
      )}
    </div>
  );
};

interface EnhancedReportDocumentProps {
  bundle: ReportBundle;
}

const EnhancedReportDocument: React.FC<EnhancedReportDocumentProps> = ({ bundle }) => {
  const components = useMemo<Components>(() => ({
    h1: ({ children, ...props }) => {
      const text = String(children);
      return <h1 id={headingId(text, 1, bundle)} {...props}>{children}</h1>;
    },
    h2: ({ children, ...props }) => {
      const text = String(children);
      return <h2 id={headingId(text, 2, bundle)} {...props}>{children}</h2>;
    },
    h3: ({ children, ...props }) => {
      const text = String(children);
      return <h3 id={headingId(text, 3, bundle)} {...props}>{children}</h3>;
    },
    blockquote: ({ children, ...props }) => (
      <blockquote className="report-conclusion" {...props}>{children}</blockquote>
    ),
    table: ({ children, ...props }) => (
      <div className="report-table-wrap">
        <table {...props}>{children}</table>
      </div>
    ),
    code: ({ className, children, ...props }) => {
      const text = String(children).replace(/\n$/, '');
      const isBlock = Boolean(className) || text.includes('\n');
      if (!isBlock) {
        return <code className="report-inline-code" {...props}>{children}</code>;
      }
      if (isCallTreeCode(text)) {
        return <CallTreeBlock code={text} bundle={bundle} />;
      }
      return <pre><code {...props}>{children}</code></pre>;
    },
    pre: ({ children }) => <>{children}</>,
  }), [bundle]);

  return (
    <article className="report-document markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {bundle.markdown}
      </ReactMarkdown>
    </article>
  );
};

export default EnhancedReportDocument;
