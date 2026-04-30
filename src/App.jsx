import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { TicketProvider, useTickets } from './store/TicketContext';
import { ScheduleProvider } from './store/ScheduleContext';
import { Toaster } from 'sonner';

// Components & Pages
import Sidebar from './components/layout/Sidebar';
import Header from './components/layout/Header';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import TicketsPage from './pages/TicketsPage';
import SchedulePage from './pages/SchedulePage';
import ChecklistPage from './pages/ChecklistPage';

const ProtectedLayout = ({ children }) => {
  const { user, loading } = useTickets();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
      </div>
    );
  }

  // Временно отключено для демонстрации
  // if (!user) {
  //   return <Navigate to="/login" replace />;
  // }

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      <Sidebar />
      <div className="flex-1 flex flex-col pl-64">
        <Header />
        <main className="flex-1 p-8 mt-16 overflow-auto">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
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
            background: '#18181b', 
            border: '1px solid #27272a',
            borderRadius: '12px'
          }
        }}
      />
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login />} />
        
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

        <Route path="/checklist" element={
          <ProtectedLayout>
            <ChecklistPage />
          </ProtectedLayout>
        } />
        <Route path="/checklists" element={<Navigate to="/checklist" replace />} />

        <Route path="/schedule" element={
          <ProtectedLayout>
            <SchedulePage />
          </ProtectedLayout>
        } />

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
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
