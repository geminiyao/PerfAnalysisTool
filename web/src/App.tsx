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
import AIWorkbench from './pages/AIWorkbench';
import Assets from './pages/Assets';
import Runs from './pages/Runs';
import Reports from './pages/Reports';
import SimpleperfReport from './pages/SimpleperfReport';
import MapleReport from './pages/MapleReport';
import MapleComparePage from './pages/MapleComparePage';
import Settings from './pages/Settings';

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
            <Route path="/runs" element={<Runs />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/assets" element={<Assets />} />
            <Route path="/report/:id" element={<ReportDetail />} />
            <Route path="/simpleperf/report/:id" element={<SimpleperfReport />} />
            <Route path="/maple" element={<MapleReport />} />
            <Route path="/maple-compare" element={<MapleComparePage />} />
            <Route path="/maple-compare/:id" element={<MapleComparePage />} />
            <Route path="/compare" element={<Compare />} />
            <Route path="/trends" element={<Trends />} />
            <Route path="/ai" element={<AIWorkbench />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
};

export default App;
