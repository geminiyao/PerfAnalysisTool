import React from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { Layout } from 'antd';
import AppSider from './components/AppSider';
import LegacyRedirect from './components/LegacyRedirect';
import Dashboard from './pages/Dashboard';
import Upload from './pages/Upload';
import Collect from './pages/Collect';
import Trends from './pages/Trends';
import Assets from './pages/Assets';
import Runs from './pages/Runs';
import RunDetail from './pages/RunDetail';
import RunComparePage from './pages/RunComparePage';
import PerfettoTriad from './pages/PerfettoTriad';
import SimpleperfDiff from './pages/SimpleperfDiff';
import UnityProfilerCompare from './pages/UnityProfilerCompare';
import ReportPreview from './pages/ReportPreview';
import ReportViewer from './pages/ReportViewer';
import PrismReportView from './pages/PrismReportView';
import Settings from './pages/Settings';

const { Content } = Layout;

function ReportViewerRoute() {
  const { sampleKey = 'unity-single' } = useParams();
  return <ReportViewer sampleKey={sampleKey} />;
}

const App: React.FC = () => {
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AppSider />
      <Layout>
        <Content style={{ padding: '16px 20px', overflow: 'auto' }}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="/collect" element={<Collect />} />
            <Route path="/runs" element={<Runs />} />
            <Route path="/runs/:id" element={<RunDetail />} />
            <Route path="/compare" element={<RunComparePage />} />
            <Route path="/perfetto-triad" element={<PerfettoTriad />} />
            <Route path="/simpleperf-diff" element={<SimpleperfDiff />} />
            <Route path="/unity-compare" element={<UnityProfilerCompare />} />
            <Route path="/report-preview" element={<ReportPreview />} />
            <Route path="/report-view" element={<ReportViewer sampleKey="unity-single" />} />
            <Route path="/report-view/:sampleKey" element={<ReportViewerRoute />} />
            <Route path="/prism-report/:sessionId" element={<PrismReportView />} />
            <Route path="/trends" element={<Trends />} />
            <Route path="/assets" element={<Assets />} />
            <Route path="/settings" element={<Settings />} />

            {/* 旧路由 → 新 IA */}
            <Route path="/history" element={<LegacyRedirect to="/runs" />} />
            <Route path="/reports" element={<LegacyRedirect to="/runs" />} />
            <Route path="/run-compare" element={<LegacyRedirect to="/compare" />} />
            <Route path="/ai" element={<LegacyRedirect to="/runs" />} />
            <Route path="/maple" element={<LegacyRedirect to="/compare" />} />
            <Route path="/maple-compare" element={<LegacyRedirect to="/compare" />} />
            <Route path="/maple-compare/:id" element={<LegacyRedirect to="/compare" />} />
            <Route path="/report/:id" element={<LegacyRedirect to="/runs" />} />
            <Route path="/simpleperf/report/:id" element={<LegacyRedirect to="/runs" />} />
            <Route path="/compare-legacy/session" element={<LegacyRedirect to="/compare" />} />
            <Route path="/compare-legacy/maple" element={<LegacyRedirect to="/compare" />} />
            <Route path="/compare-legacy/maple/:id" element={<LegacyRedirect to="/compare" />} />
            <Route path="/history-legacy" element={<LegacyRedirect to="/runs" />} />
            <Route path="/reports-legacy" element={<LegacyRedirect to="/runs" />} />
            <Route path="/maple-legacy" element={<LegacyRedirect to="/compare" />} />
            <Route path="/ai-legacy" element={<LegacyRedirect to="/runs" />} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
};

export default App;
