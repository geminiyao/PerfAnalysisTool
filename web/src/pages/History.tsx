import React, { useEffect, useState } from 'react';
import { Table, Card, Space, Input, Select, Tag, Button, Popconfirm, message } from 'antd';
import { SearchOutlined, DeleteOutlined, EyeOutlined, SwapOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { getHistory, getProjects, deleteAnalysis } from '../services/api';
import type { Session, HistoryQuery } from '../../shared/types';
import dayjs from 'dayjs';

const History: React.FC = () => {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<string[]>([]);
  const [query, setQuery] = useState<HistoryQuery>({ page: 1, limit: 20 });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    loadData();
  }, [query]);

  async function loadProjects() {
    try {
      const list = await getProjects();
      setProjects(list);
    } catch {}
  }

  async function loadData() {
    setLoading(true);
    try {
      const res = await getHistory(query);
      setSessions(res.items);
      setTotal(res.total);
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteAnalysis(id);
      message.success('已删除');
      loadData();
    } catch (err: any) {
      message.error(err.message);
    }
  }

  const columns = [
    {
      title: '文件名',
      dataIndex: 'fileName',
      key: 'fileName',
      ellipsis: true,
      width: 200,
    },
    {
      title: '项目',
      dataIndex: 'projectName',
      key: 'projectName',
      width: 100,
    },
    {
      title: '版本',
      dataIndex: 'version',
      key: 'version',
      width: 100,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (status: string) => {
        const colorMap: Record<string, string> = {
          completed: 'success',
          running: 'processing',
          queued: 'warning',
          pending: 'default',
          failed: 'error',
        };
        return <Tag color={colorMap[status] || 'default'}>{status}</Tag>;
      },
    },
    {
      title: '提交人',
      dataIndex: 'createdBy',
      key: 'createdBy',
      width: 80,
    },
    {
      title: '时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 140,
      render: (t: number) => dayjs(t).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '耗时',
      dataIndex: 'duration',
      key: 'duration',
      width: 80,
      render: (d: number | null) => d ? `${Math.round(d / 1000)}s` : '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_: any, record: Session) => (
        <Space size={4}>
          {record.status === 'completed' && (
            <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => navigate(`/report/${record.id}`)}>
              查看
            </Button>
          )}
          <Popconfirm title="确认删除?" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ color: '#fff', margin: 0 }}>历史记录</h1>
        {selectedIds.length >= 2 && (
          <Button
            type="primary"
            icon={<SwapOutlined />}
            onClick={() => navigate(`/compare?ids=${selectedIds.join(',')}`)}
          >
            对比选中 ({selectedIds.length})
          </Button>
        )}
      </div>

      {/* 筛选栏 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input
            placeholder="搜索文件名..."
            prefix={<SearchOutlined />}
            allowClear
            onChange={(e) => setQuery({ ...query, search: e.target.value, page: 1 })}
            style={{ width: 200 }}
          />
          <Select
            placeholder="项目"
            allowClear
            style={{ width: 140 }}
            onChange={(v) => setQuery({ ...query, projectName: v, page: 1 })}
            options={projects.map(p => ({ label: p, value: p }))}
          />
          <Select
            placeholder="状态"
            allowClear
            style={{ width: 120 }}
            onChange={(v) => setQuery({ ...query, status: v, page: 1 })}
            options={[
              { label: '已完成', value: 'completed' },
              { label: '运行中', value: 'running' },
              { label: '失败', value: 'failed' },
              { label: '等待中', value: 'queued' },
            ]}
          />
        </Space>
      </Card>

      {/* 数据表格 */}
      <Card>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={sessions}
          loading={loading}
          pagination={{
            current: query.page,
            pageSize: query.limit,
            total,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (page, pageSize) => setQuery({ ...query, page, limit: pageSize }),
          }}
          rowSelection={{
            selectedRowKeys: selectedIds,
            onChange: (keys) => setSelectedIds(keys as string[]),
            getCheckboxProps: (record) => ({
              disabled: record.status !== 'completed',
            }),
          }}
          size="small"
        />
      </Card>
    </div>
  );
};

export default History;
