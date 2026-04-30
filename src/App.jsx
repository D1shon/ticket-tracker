import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { TicketProvider, useTickets } from './store/TicketContext';
import { ScheduleProvider } from './store/ScheduleContext';
import { Toaster } from 'sonner';

// Components & Pages
import Sidebar from './components/layout/Sidebar';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import TicketsPage from './pages/TicketsPage';
import TicketDetail from './components/tickets/TicketDetail';
import SchedulePage from './pages/SchedulePage';
import ChecklistPage from './pages/ChecklistPage';

const ProtectedLayout = ({ children }) => {
  const { user, loading } = useTickets();

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
        <div style={{ width: 40, height: 40, border: '3px solid rgba(79,142,247,0.2)', borderTop: '3px solid #4f8ef7', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}></div>
      </div>
    );
  }

  // Временно отключено для демонстрации
  // if (!user) {
  //   return <Navigate to="/login" replace />;
  // }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex' }}>
      <Sidebar />
      <div style={{ flex: 1, marginLeft: '220px', display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <main style={{ flex: 1, padding: '24px 28px', overflow: 'auto' }}>
          {children}
        </main>
      </div>
    </div>
  );
};

const AppContent = () => {
  const { user } = useTickets();

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
        <Route path="/login" element={user ? <Navigate to="/tickets" replace /> : <Login />} />
        
        <Route path="/dashboard" element={
          <ProtectedLayout>
            <Dashboard />
          </ProtectedLayout>
        } />
        
        <Route path="/tickets" element={
          <ProtectedLayout>
            <TicketsPage />
          </ProtectedLayout>
        } />

        <Route path="/tickets/:id" element={
          <ProtectedLayout>
            <TicketDetail />
          </ProtectedLayout>
        } />

        <Route path="/checklist" element={
          <ProtectedLayout>
            <ChecklistPage />
          </ProtectedLayout>
        } />
        <Route path="/checklists" element={
          <ProtectedLayout>
            <ChecklistPage />
          </ProtectedLayout>
        } />

        <Route path="/schedule" element={
          <ProtectedLayout>
            <SchedulePage />
          </ProtectedLayout>
        } />

        {/* Placeholder pages */}
        <Route path="/archive" element={<ProtectedLayout><div style={{ color: 'var(--text-muted)', padding: 40 }}>Архив — в разработке</div></ProtectedLayout>} />
        <Route path="/calls" element={<ProtectedLayout><div style={{ color: 'var(--text-muted)', padding: 40 }}>Созвоны — в разработке</div></ProtectedLayout>} />
        <Route path="/chat" element={<ProtectedLayout><div style={{ color: 'var(--text-muted)', padding: 40 }}>Чат — в разработке</div></ProtectedLayout>} />
        <Route path="/settings" element={<ProtectedLayout><div style={{ color: 'var(--text-muted)', padding: 40 }}>Настройки — в разработке</div></ProtectedLayout>} />

        <Route path="/" element={<Navigate to="/tickets" replace />} />
        <Route path="*" element={<Navigate to="/tickets" replace />} />
      </Routes>
    </Router>
  );
};

function App() {
  return (
    <TicketProvider>
      <ScheduleProvider>
        <AppContent />
      </ScheduleProvider>
    </TicketProvider>
  );
}

export default App;
