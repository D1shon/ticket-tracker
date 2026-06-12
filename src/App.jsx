import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { TicketProvider, useTickets } from './store/TicketContext';
import { ScheduleProvider } from './store/ScheduleContext';
import { NotificationProvider } from './store/NotificationContext';
import { CallProvider } from './store/CallContext';
import { Toaster } from 'sonner';

// Components & Pages
import Sidebar from './components/layout/Sidebar';
import NotificationBell from './components/layout/NotificationBell';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import TicketsPage from './pages/TicketsPage';
import TicketDetail from './components/tickets/TicketDetail';
import SchedulePage from './pages/SchedulePage';
import MerchPage from './pages/MerchPage';
import SalesPage from './pages/SalesPage';
import ChecklistPage from './pages/ChecklistPage';
import ChecklistDetail from './pages/ChecklistDetail';
import ArchivePage from './pages/ArchivePage';
import SettingsPage from './pages/SettingsPage';
import CallsPage from './pages/CallsPage';
import AttendancePage from './pages/AttendancePage';
import CallOverlay from './components/layout/CallOverlay';
import DemoDayBanner from './components/layout/DemoDayBanner';
import MobileScanner from './pages/MobileScanner';
import GuidebookPage from './pages/GuidebookPage';

// Notification bell is fixed top-right on every authenticated page
const NotificationCorner = () => (
  <div className="notification-corner">
    <NotificationBell />
  </div>
);

const ProtectedLayout = ({ children, allowedRoles }) => {
  const { user, loading } = useTickets();
  const [isMobile, setIsMobile] = React.useState(() => window.innerWidth <= 768);

  React.useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
        <div style={{ width: 40, height: 40, border: '3px solid rgba(79,142,247,0.2)', borderTop: '3px solid #4f8ef7', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={user.role === 'admin' ? '/schedule' : user.role === 'marketing' ? '/merch' : '/tickets'} replace />;
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex' }}>
      <Sidebar />
      {!isMobile && user?.role !== 'admin' && <NotificationCorner />}
      <div
        className="main-content-wrapper"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
          minWidth: 0,
          paddingTop: isMobile ? 52 : 0,
          paddingBottom: isMobile ? 64 : 0,
        }}
      >
        <main style={{
          flex: 1,
          padding: isMobile ? '16px 12px' : '24px 28px',
          overflowY: 'auto',
          overflowX: 'hidden',
          minWidth: 0,
        }}>
          {children}
        </main>
      </div>
    </div>
  );
};


const AppContent = () => {
  const { user } = useTickets();

  const RootRedirect = () => {
    if (!user) return <Navigate to="/login" replace />;
    return <Navigate to={user.role === 'admin' ? '/schedule' : user.role === 'marketing' ? '/merch' : '/tickets'} replace />;
  };

  return (
    <Router>
      <Toaster 
        position="top-right" 
        richColors 
        theme="dark"
        toastOptions={{
          style: { 
            background: '#1a1a20', 
            border: '1px solid #2a2a32',
            borderRadius: '10px',
            color: '#e8e8f0'
          }
        }}
      />
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
      <Routes>
        <Route path="/login" element={user ? <Navigate to={user.role === 'admin' ? '/schedule' : user.role === 'marketing' ? '/merch' : '/tickets'} replace /> : <Login />} />
        
        <Route path="/scan" element={
          <ProtectedLayout allowedRoles={['chef', 'manager']}>
            <MobileScanner />
          </ProtectedLayout>
        } />
        
        <Route path="/dashboard" element={
          <ProtectedLayout allowedRoles={['chef', 'manager']}>
            <Dashboard />
          </ProtectedLayout>
        } />
        
        <Route path="/tickets" element={
          <ProtectedLayout allowedRoles={['chef', 'manager', 'user']}>
            <TicketsPage />
          </ProtectedLayout>
        } />

        <Route path="/tickets/:id" element={
          <ProtectedLayout allowedRoles={['chef', 'manager', 'user']}>
            <TicketDetail />
          </ProtectedLayout>
        } />

        <Route path="/checklist" element={
          <ProtectedLayout allowedRoles={['chef', 'manager']}>
            <ChecklistPage />
          </ProtectedLayout>
        } />
        <Route path="/checklists" element={
          <ProtectedLayout allowedRoles={['chef', 'manager']}>
            <ChecklistPage />
          </ProtectedLayout>
        } />
        <Route path="/checklists/:shiftId/:cardId" element={
          <ProtectedLayout allowedRoles={['chef', 'manager']}>
            <ChecklistDetail />
          </ProtectedLayout>
        } />

        <Route path="/schedule" element={
          <ProtectedLayout allowedRoles={['chef', 'manager', 'admin']}>
            <SchedulePage />
          </ProtectedLayout>
        } />

        <Route path="/merch" element={
          <ProtectedLayout allowedRoles={['chef', 'manager', 'marketing']}>
            <MerchPage />
          </ProtectedLayout>
        } />

        <Route path="/sales" element={
          <ProtectedLayout allowedRoles={['chef', 'manager', 'admin']}>
            <SalesPage />
          </ProtectedLayout>
        } />

        <Route path="/archive" element={
          <ProtectedLayout allowedRoles={['chef', 'manager']}>
            <ArchivePage />
          </ProtectedLayout>
        } />
        <Route path="/calls" element={
          <ProtectedLayout allowedRoles={['chef', 'manager']}>
            <CallsPage />
          </ProtectedLayout>
        } />
        <Route path="/attendance" element={
          <ProtectedLayout allowedRoles={['chef', 'manager']}>
            <AttendancePage />
          </ProtectedLayout>
        } />
        <Route path="/chat" element={
          <ProtectedLayout allowedRoles={['chef', 'manager']}>
            <div style={{ color: 'var(--text-muted)', padding: 40 }}>Чат — в разработке</div>
          </ProtectedLayout>
        } />
        <Route path="/guidebook" element={
          <ProtectedLayout allowedRoles={['chef', 'manager', 'admin', 'user']}>
            <GuidebookPage />
          </ProtectedLayout>
        } />
        <Route path="/settings" element={
          <ProtectedLayout allowedRoles={['chef', 'manager', 'admin']}>
            <SettingsPage />
          </ProtectedLayout>
        } />

        <Route path="/" element={<RootRedirect />} />
        <Route path="*" element={<RootRedirect />} />
      </Routes>
      <CallOverlay />
      <DemoDayBanner />
    </Router>
  );
};

import { ChecklistProvider } from './store/ChecklistContext';

function App() {
  return (
    <TicketProvider>
      <NotificationProvider>
        <ScheduleProvider>
          <ChecklistProvider>
            <CallProvider>
              <AppContent />
            </CallProvider>
          </ChecklistProvider>
        </ScheduleProvider>
      </NotificationProvider>
    </TicketProvider>
  );
}

export default App;
