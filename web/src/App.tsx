import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from 'antd';
import AppSider from './components/AppSider';
import Dashboard from './pages/Dashboard';
import Upload from './pages/Upload';
import History from './pages/History';
import ReportDetail from './pages/ReportDetail';
import Compare from './pages/Compare';
import Trends from './pages/Trends';

const { Content } = Layout;

const App: React.FC = () => {
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AppSider />
      <Layout>
        <Content style={{ padding: '16px 20px', overflow: 'auto' }}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="/history" element={<History />} />
            <Route path="/report/:id" element={<ReportDetail />} />
            <Route path="/compare" element={<Compare />} />
            <Route path="/trends" element={<Trends />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
};

export default App;
