import React, { useState, useMemo } from 'react';
import { Tag, Slider, Switch, Space, Input } from 'antd';
import { FilterOutlined, SearchOutlined } from '@ant-design/icons';

export interface MarkerItem {
  name: string;
  msSelfMean: number;
  msSelfMax: number;
  percentOfFrame: number;
  callsPerFrame: number;
  presentOnFrameCount: number;
  thread: string;
  callChain: string;
  spikeRatio: number;
  mustReport: boolean;
  mustReportReason?: string;
}

export interface JankItem {
  frameIndex: number;
  msFrame: number;
  prevThreeAvg?: number;
  ratio: number;
  jankLevel: string;
  category: string;
  dominantMarker: string;
  hotPath: string;
  callTreeSummary: string;
  mustReport?: boolean;
}

export interface SpikeItem {
  name: string;
  msSelfMean: number;
  msSelfMedian: number;
  msSelfMax: number;
  spikeRatio: number;
  spikeFrameCount: number;
  totalFrameCount: number;
}

export type IssueType = 'hotspot' | 'jank' | 'spike';
export type Issue =
  | { type: 'hotspot'; data: MarkerItem }
  | { type: 'jank'; data: JankItem }
  | { type: 'spike'; data: SpikeItem };

interface IssueListProps {
  markers: MarkerItem[];
  jankFrames: JankItem[];
  markerSpikes: SpikeItem[];
  selectedIssue: Issue | null;
  onSelect: (issue: Issue) => void;
}

const IssueList: React.FC<IssueListProps> = ({
  markers,
  jankFrames,
  markerSpikes,
  selectedIssue,
  onSelect,
}) => {
  const [showMore, setShowMore] = useState(false);
  const [selfMeanThreshold, setSelfMeanThreshold] = useState(2);
  const [spikeThreshold, setSpikeThreshold] = useState(5);
  const [search, setSearch] = useState('');

  // 默认列表：mustReport markers + 全部 jankFrames
  const mustReportMarkers = useMemo(
    () => markers.filter(m => m.mustReport).sort((a, b) => b.msSelfMean - a.msSelfMean),
    [markers],
  );

  // 展开筛选：额外的 markers
  const extraMarkers = useMemo(
    () =>
      showMore
        ? markers
            .filter(m => !m.mustReport && m.msSelfMean >= selfMeanThreshold)
            .sort((a, b) => b.msSelfMean - a.msSelfMean)
        : [],
    [markers, showMore, selfMeanThreshold],
  );

  // 展开筛选：波动 markers
  const filteredSpikes = useMemo(
    () =>
      showMore
        ? markerSpikes
            .filter(s => s.spikeRatio >= spikeThreshold && s.msSelfMean >= 0.5)
            .sort((a, b) => b.spikeRatio - a.spikeRatio)
            .slice(0, 20)
        : [],
    [markerSpikes, showMore, spikeThreshold],
  );

  const sortedJanks = useMemo(
    () => [...jankFrames].sort((a, b) => b.msFrame - a.msFrame),
    [jankFrames],
  );

  // 搜索过滤
  const searchLower = search.toLowerCase();
  const filterName = (name: string) => !search || name.toLowerCase().includes(searchLower);

  const isSelected = (issue: Issue) => {
    if (!selectedIssue) return false;
    if (issue.type !== selectedIssue.type) return false;
    if (issue.type === 'hotspot' && selectedIssue.type === 'hotspot')
      return issue.data.name === selectedIssue.data.name;
    if (issue.type === 'jank' && selectedIssue.type === 'jank')
      return issue.data.frameIndex === selectedIssue.data.frameIndex;
    if (issue.type === 'spike' && selectedIssue.type === 'spike')
      return issue.data.name === selectedIssue.data.name;
    return false;
  };

  const ItemRow: React.FC<{ issue: Issue; children: React.ReactNode }> = ({ issue, children }) => (
    <div
      onClick={() => onSelect(issue)}
      style={{
        padding: '8px 12px',
        cursor: 'pointer',
        borderLeft: isSelected(issue) ? '3px solid #1890ff' : '3px solid transparent',
        background: isSelected(issue) ? 'rgba(24,144,255,0.08)' : 'transparent',
        borderBottom: '1px solid #1a1a2e',
        transition: 'all 0.15s',
      }}
      onMouseEnter={e => {
        if (!isSelected(issue)) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.03)';
      }}
      onMouseLeave={e => {
        if (!isSelected(issue)) (e.currentTarget as HTMLDivElement).style.background = 'transparent';
      }}
    >
      {children}
    </div>
  );

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 搜索 */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #1a1a2e' }}>
        <Input
          size="small"
          placeholder="搜索 marker 名称..."
          prefix={<SearchOutlined style={{ color: '#555' }} />}
          value={search}
          onChange={e => setSearch(e.target.value)}
          allowClear
          style={{ background: '#0d1117', borderColor: '#333' }}
        />
      </div>

      {/* 列表内容 */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* 热点 Marker 分组 */}
        <div style={{ padding: '8px 12px 4px', color: '#888', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>
          🔴 热点 Marker ({mustReportMarkers.filter(m => filterName(m.name)).length})
        </div>
        {mustReportMarkers.filter(m => filterName(m.name)).map(m => (
          <ItemRow key={`hotspot-${m.name}`} issue={{ type: 'hotspot', data: m }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: '#d4d4d4', fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {m.name}
              </span>
              <Tag color="red" style={{ fontSize: 10, margin: 0, lineHeight: '18px' }}>
                {m.percentOfFrame.toFixed(0)}%
              </Tag>
            </div>
            <div style={{ color: '#888', fontSize: 11, marginTop: 2 }}>
              self: {m.msSelfMean.toFixed(1)}ms · max: {m.msSelfMax.toFixed(1)}ms · {m.thread}
            </div>
          </ItemRow>
        ))}

        {/* Jank 帧分组 */}
        <div style={{ padding: '12px 12px 4px', color: '#888', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>
          🟡 卡顿帧 ({sortedJanks.length})
        </div>
        {sortedJanks.filter(j => filterName(j.dominantMarker || `帧#${j.frameIndex}`)).map(j => (
          <ItemRow key={`jank-${j.frameIndex}`} issue={{ type: 'jank', data: j }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: '#d4d4d4', fontSize: 13 }}>
                帧 #{j.frameIndex}
              </span>
              <Tag
                color={j.jankLevel === 'BigJank' ? 'red' : 'orange'}
                style={{ fontSize: 10, margin: 0, lineHeight: '18px' }}
              >
                {j.jankLevel}
              </Tag>
              <span style={{ color: '#888', fontSize: 11, marginLeft: 'auto' }}>
                {j.msFrame.toFixed(0)}ms ({j.ratio.toFixed(1)}x)
              </span>
            </div>
            <div style={{ color: '#888', fontSize: 11, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {j.category} · {j.dominantMarker}
            </div>
          </ItemRow>
        ))}

        {/* 展开后：额外 markers */}
        {showMore && extraMarkers.filter(m => filterName(m.name)).length > 0 && (
          <>
            <div style={{ padding: '12px 12px 4px', color: '#888', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>
              ⚪ 其他 Marker ({extraMarkers.filter(m => filterName(m.name)).length})
            </div>
            {extraMarkers.filter(m => filterName(m.name)).map(m => (
              <ItemRow key={`extra-${m.name}`} issue={{ type: 'hotspot', data: m }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: '#b5b5b5', fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.name}
                  </span>
                  <span style={{ color: '#888', fontSize: 11 }}>
                    {m.msSelfMean.toFixed(1)}ms
                  </span>
                </div>
              </ItemRow>
            ))}
          </>
        )}

        {/* 展开后：波动 Markers */}
        {showMore && filteredSpikes.filter(s => filterName(s.name)).length > 0 && (
          <>
            <div style={{ padding: '12px 12px 4px', color: '#888', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>
              🟠 波动 Marker ({filteredSpikes.filter(s => filterName(s.name)).length})
            </div>
            {filteredSpikes.filter(s => filterName(s.name)).map(s => (
              <ItemRow key={`spike-${s.name}`} issue={{ type: 'spike', data: s }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: '#b5b5b5', fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.name}
                  </span>
                  <Tag color="volcano" style={{ fontSize: 10, margin: 0, lineHeight: '18px' }}>
                    {s.spikeRatio.toFixed(0)}x
                  </Tag>
                </div>
                <div style={{ color: '#888', fontSize: 11, marginTop: 2 }}>
                  mean: {s.msSelfMean.toFixed(1)}ms · max: {s.msSelfMax.toFixed(1)}ms · {s.spikeFrameCount}帧触发
                </div>
              </ItemRow>
            ))}
          </>
        )}
      </div>

      {/* 底部筛选控件 */}
      <div style={{ padding: '8px 12px', borderTop: '1px solid #1a1a2e' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: showMore ? 8 : 0 }}>
          <FilterOutlined style={{ color: '#888', fontSize: 12 }} />
          <span style={{ color: '#888', fontSize: 12 }}>显示更多</span>
          <Switch size="small" checked={showMore} onChange={setShowMore} />
        </div>
        {showMore && (
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: '#888', fontSize: 11, whiteSpace: 'nowrap' }}>selfMean ≥</span>
              <Slider
                min={0.1}
                max={10}
                step={0.1}
                value={selfMeanThreshold}
                onChange={setSelfMeanThreshold}
                tooltip={{ formatter: v => `${v}ms` }}
                style={{ flex: 1 }}
              />
              <span style={{ color: '#aaa', fontSize: 11, minWidth: 40 }}>{selfMeanThreshold}ms</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: '#888', fontSize: 11, whiteSpace: 'nowrap' }}>spike ≥</span>
              <Slider
                min={2}
                max={50}
                step={1}
                value={spikeThreshold}
                onChange={setSpikeThreshold}
                tooltip={{ formatter: v => `${v}x` }}
                style={{ flex: 1 }}
              />
              <span style={{ color: '#aaa', fontSize: 11, minWidth: 40 }}>{spikeThreshold}x</span>
            </div>
          </Space>
        )}
      </div>
    </div>
  );
};

export default IssueList;
