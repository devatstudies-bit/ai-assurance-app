import { HashRouter, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { ToastProvider, TooltipProvider } from './components/ui';
import { StoreProvider } from './store/store';
import Dashboard from './pages/Dashboard';
import Applications from './pages/Applications';
import AppOverview from './pages/AppOverview';
import RunHistory from './pages/RunHistory';
import Scans from './pages/Scans';
import ScanDetail from './pages/ScanDetail';
import Findings from './pages/Findings';
import TestLibrary from './pages/TestLibrary';
import ManualTesting from './pages/ManualTesting';
import SessionWorkspace from './pages/SessionWorkspace';
import EvidencePacks from './pages/EvidencePacks';
import Administration from './pages/Administration';
import Evaluations, { EvaluationDetail } from './pages/Evaluations';
import Models from './pages/Models';

export default function App() {
  return (
    <ToastProvider>
      <StoreProvider>
        <TooltipProvider>
          <HashRouter>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<Dashboard />} />
                <Route path="applications" element={<Applications />} />
                <Route path="applications/:id" element={<AppOverview />} />
                <Route path="runs" element={<RunHistory />} />
                <Route path="evaluations" element={<Evaluations />} />
                <Route path="evaluations/:id" element={<EvaluationDetail />} />
                <Route path="models" element={<Models />} />
                <Route path="scans" element={<Scans />} />
                <Route path="scans/:id" element={<ScanDetail />} />
                <Route path="findings" element={<Findings />} />
                <Route path="library" element={<TestLibrary />} />
                <Route path="manual" element={<ManualTesting />} />
                <Route path="manual/:id" element={<SessionWorkspace />} />
                <Route path="evidence" element={<EvidencePacks />} />
                <Route path="evidence/:id" element={<EvidencePacks />} />
                <Route path="admin" element={<Administration />} />
                <Route path="*" element={<Dashboard />} />
              </Route>
            </Routes>
          </HashRouter>
        </TooltipProvider>
      </StoreProvider>
    </ToastProvider>
  );
}
