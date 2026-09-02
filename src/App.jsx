import React from 'react';
import { isMobileDevice } from './lib/isMobile';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { TicketProvider, useTickets } from './store/TicketContext';
import { SERVICE_REPORT_EMAILS } from './lib/access';
import { ScheduleProvider } from './store/ScheduleContext';
import { NotificationProvider } from './store/NotificationContext';
import { CallProvider } from './store/CallContext';
import { Toaster } from 'sonner';

// Components & Pages
// Layout stays in the main bundle; pages are lazy-loaded per route so
// slow phones don't download the whole app on first paint.
import Sidebar from './components/layout/Sidebar';
import NotificationBell from './components/layout/NotificationBell';
import Login from './pages/Login';
import CallOverlay from './components/layout/CallOverlay';
import DemoDayBanner from './components/layout/DemoDayBanner';
import NotificationPopup from './components/layout/NotificationPopup';

// After each deploy chunk filenames change; open clients hold the old index
// and fail to fetch old chunks. On such a failure reload once — the fresh
// index arrives with matching chunk names.
const lazyPage = (importer) => React.lazy(() =>
  importer()
    .then(m => { try { sessionStorage.removeItem('hj_chunk_reload'); } catch {} return m; })
    .catch((err) => {
      let alreadyTried = false;
      try {
        alreadyTried = sessionStorage.getItem('hj_chunk_reload') === '1';
        if (!alreadyTried) sessionStorage.setItem('hj_chunk_reload', '1');
      } catch {}
      if (!alreadyTried) {
        window.location.reload();
        return new Promise(() => {}); // reloading — keep spinner up
      }
      throw err;
    })
);

const IMPORTERS = {
  Dashboard:       () => import('./pages/Dashboard'),
  TicketsPage:     () => import('./pages/TicketsPage'),
  TicketDetail:    () => import('./components/tickets/TicketDetail'),
  SchedulePage:    () => import('./pages/SchedulePage'),
  MerchPage:       () => import('./pages/MerchPage'),
  SalesPage:       () => import('./pages/SalesPage'),
  ChecklistPage:   () => import('./pages/ChecklistPage'),
  ChecklistDetail: () => import('./pages/ChecklistDetail'),
  ArchivePage:     () => import('./pages/ArchivePage'),
  SettingsPage:    () => import('./pages/SettingsPage'),
  CallsPage:       () => import('./pages/CallsPage'),
  AttendancePage:  () => import('./pages/AttendancePage'),
  MobileScanner:   () => import('./pages/MobileScanner'),
  GuidebookPage:   () => import('./pages/GuidebookPage'),
  PolicyPage:      () => import('./pages/PolicyPage'),
  HRMonitorsPage:  () => import('./pages/HRMonitorsPage'),
  TowelsPage:      () => import('./pages/TowelsPage'),
  LostItemsPage:   () => import('./pages/LostItemsPage'),
  ReviewsPage:     () => import('./pages/ReviewsPage'),
  QrReviewsPage:   () => import('./pages/QrReviewsPage'),
  ShiftBoardPage:  () => import('./pages/ShiftBoardPage'),
  ClubVisitsPage:  () => import('./pages/ClubVisitsPage'),
  CalendarPage:    () => import('./pages/CalendarPage'),
  CalendarDayPage: () => import('./pages/CalendarDayPage'),
  InStudioPage:    () => import('./pages/InStudioPage'),
  HomePage:        () => import('./pages/HomePage'),
  NewsPage:        () => import('./pages/NewsPage'),
  WaDemoPage:      () => import('./pages/WaDemoPage'),
  LeadsPage:       () => import('./pages/LeadsPage'),
  FeedbackPage:    () => import('./pages/FeedbackPage'),
  AssistantPage:   () => import('./pages/AssistantPage'),
  StaffCreatePage: () => import('./pages/StaffCreatePage'),
};

const Dashboard       = lazyPage(IMPORTERS.Dashboard);
const TicketsPage     = lazyPage(IMPORTERS.TicketsPage);
const TicketDetail    = lazyPage(IMPORTERS.TicketDetail);
const SchedulePage    = lazyPage(IMPORTERS.SchedulePage);
const MerchPage       = lazyPage(IMPORTERS.MerchPage);
const SalesPage       = lazyPage(IMPORTERS.SalesPage);
const ChecklistPage   = lazyPage(IMPORTERS.ChecklistPage);
const ChecklistDetail = lazyPage(IMPORTERS.ChecklistDetail);
const ArchivePage     = lazyPage(IMPORTERS.ArchivePage);
const SettingsPage    = lazyPage(IMPORTERS.SettingsPage);
const CallsPage       = lazyPage(IMPORTERS.CallsPage);
const AttendancePage  = lazyPage(IMPORTERS.AttendancePage);
const MobileScanner   = lazyPage(IMPORTERS.MobileScanner);
const GuidebookPage   = lazyPage(IMPORTERS.GuidebookPage);
const PolicyPage      = lazyPage(IMPORTERS.PolicyPage);
const HRMonitorsPage  = lazyPage(IMPORTERS.HRMonitorsPage);
const TowelsPage      = lazyPage(IMPORTERS.TowelsPage);
const LostItemsPage   = lazyPage(IMPORTERS.LostItemsPage);
const ReviewsPage     = lazyPage(IMPORTERS.ReviewsPage);
const QrReviewsPage   = lazyPage(IMPORTERS.QrReviewsPage);
const ShiftBoardPage  = lazyPage(IMPORTERS.ShiftBoardPage);
const ClubVisitsPage  = lazyPage(IMPORTERS.ClubVisitsPage);
const CalendarPage    = lazyPage(IMPORTERS.CalendarPage);
const CalendarDayPage = lazyPage(IMPORTERS.CalendarDayPage);
const InStudioPage    = lazyPage(IMPORTERS.InStudioPage);
const HomePage        = lazyPage(IMPORTERS.HomePage);
const NewsPage        = lazyPage(IMPORTERS.NewsPage);
const WaDemoPage      = lazyPage(IMPORTERS.WaDemoPage);
const LeadsPage       = lazyPage(IMPORTERS.LeadsPage);
const FeedbackPage    = lazyPage(IMPORTERS.FeedbackPage);
const AssistantPage   = lazyPage(IMPORTERS.AssistantPage);
const StaffCreatePage = lazyPage(IMPORTERS.StaffCreatePage);

// Last-resort screen instead of a black page if a chunk still fails
class PageErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  handleReload = async () => {
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
    } catch {}
    try { sessionStorage.removeItem('hj_chunk_reload'); } catch {}
    window.location.reload();
  };
  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, background: 'var(--bg-primary)', padding: 24 }}>
        <div style={{ fontSize: 40 }}>🔄</div>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', textAlign: 'center' }}>Не удалось открыть страницу</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', maxWidth: 300 }}>Нажмите кнопку — страница перезагрузится. Если повторяется, напишите Дильшату, какой раздел не открывается</div>
        <button onClick={this.handleReload} style={{ padding: '12px 28px', borderRadius: 14, border: 'none', background: 'var(--accent-purple)', color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>
          Обновить
        </button>
      </div>
    );
  }
}

const PageLoader = () => (
  <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <div style={{ width: 36, height: 36, border: '3px solid rgba(85,128,168,0.2)', borderTop: '3px solid #5580A8', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}></div>
  </div>
);

// Notification bell is fixed top-right on every authenticated page
const NotificationCorner = () => (
  <div className="notification-corner">
    <NotificationBell />
  </div>
);

const ProtectedLayout = ({ children, allowedRoles, allowedEmails, allowClubAdmin }) => {
  const { user, loading } = useTickets();
  const [isMobile, setIsMobile] = React.useState(() => isMobileDevice());

  React.useEffect(() => {
    const handler = () => setIsMobile(isMobileDevice());
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
        <div style={{ width: 40, height: 40, border: '3px solid rgba(85,128,168,0.2)', borderTop: '3px solid #5580A8', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Персональный список почт (например, «Пуш клиентам») имеет приоритет над ролью
  const emailOk = !allowedEmails || allowedEmails.map(e => e.toLowerCase()).includes((user.email || '').toLowerCase());
  // Доступ для админов конкретного клуба (напр. чек-листы у админов Europe City)
  const clubAdminOk = allowClubAdmin && user.role === 'admin' && (user.club || '').toUpperCase() === allowClubAdmin.toUpperCase();
  const roleOk = clubAdminOk || !allowedRoles || allowedRoles.includes(user.role);
  if (!roleOk || !emailOk) {
    const fallback = user.role === 'admin' ? '/schedule'
      : user.role === 'marketing' ? '/merch'
      : (user.role === 'komdir' || user.role === 'rop') ? '/news'
      : (user.role === 'viewer' || user.role === 'tech') ? '/checklists'
      : user.role === 'lostviewer' ? '/lost-items'
      : '/tickets';
    return <Navigate to={fallback} replace />;
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
          paddingTop: isMobile ? 'calc(52px + env(safe-area-inset-top))' : 0,
          paddingBottom: isMobile ? 'calc(64px + env(safe-area-inset-bottom))' : 0,
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


// Сплэш на время восстановления сессии Firebase — чтобы форма входа не мигала
const AuthSplash = () => (
  <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
    <div style={{ width: 40, height: 40, border: '3px solid rgba(85,128,168,0.2)', borderTop: '3px solid #5580A8', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}></div>
  </div>
);

const AppContent = () => {
  const { user, loading } = useTickets();

  // Prefetch all pages after start: navigation then never hits the network,
  // so a fresh deploy mid-session can't break it (or drop a call).
  // 15s (не 2.5s): на медленном канале ранний прогрев ~1.3МБ чанков душил
  // первоначальную загрузку данных — приложение казалось «тормозным».
  React.useEffect(() => {
    const t = setTimeout(() => {
      Object.values(IMPORTERS).forEach(imp => { imp().catch(() => {}); });
    }, 15000);
    return () => clearTimeout(t);
  }, []);

  const RootRedirect = () => {
    if (loading) return <AuthSplash />; // сессия ещё восстанавливается — не кидаем на /login
    if (!user) return <Navigate to="/login" replace />;
    const home = user.role === 'admin' ? '/schedule'
      : user.role === 'marketing' ? '/merch'
      : (user.role === 'komdir' || user.role === 'rop') ? '/news'
      : (user.role === 'viewer' || user.role === 'tech') ? '/checklists'
      : user.role === 'lostviewer' ? '/lost-items'
      : '/tickets';
    return <Navigate to={home} replace />;
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
      <PageErrorBoundary>
      <React.Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Публичная страница отзыва для клиентов (QR из шкафчиков) — без входа */}
        <Route path="/feedback" element={<FeedbackPage />} />

        <Route path="/login" element={loading ? <AuthSplash /> : user ? <Navigate to={
          user.role === 'admin' ? '/schedule' : user.role === 'marketing' ? '/merch' : (user.role === 'komdir' || user.role === 'rop') ? '/news' : (user.role === 'viewer' || user.role === 'tech') ? '/checklists' : user.role === 'lostviewer' ? '/lost-items' : '/tickets'
        } replace /> : <Login />} />
        
        <Route path="/scan" element={
          <ProtectedLayout allowedRoles={['chef', 'manager', 'admin']}>
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
          <ProtectedLayout allowedRoles={['chef', 'manager', 'viewer', 'tech']}>
            <ChecklistPage />
          </ProtectedLayout>
        } />
        <Route path="/checklists" element={
          <ProtectedLayout allowedRoles={['chef', 'manager', 'viewer', 'tech']} allowClubAdmin="EUROPE CITY">
            <ChecklistPage />
          </ProtectedLayout>
        } />
        <Route path="/checklists/:shiftId/:cardId" element={
          <ProtectedLayout allowedRoles={['chef', 'manager', 'viewer', 'tech']} allowClubAdmin="EUROPE CITY">
            <ChecklistDetail />
          </ProtectedLayout>
        } />

        <Route path="/schedule" element={
          <ProtectedLayout allowedRoles={['chef', 'manager', 'admin']}>
            <SchedulePage />
          </ProtectedLayout>
        } />

        <Route path="/merch" element={
          <ProtectedLayout allowedRoles={['chef', 'manager', 'marketing', 'viewer', 'komdir', 'rop', 'lostviewer']}>
            <MerchPage />
          </ProtectedLayout>
        } />

        <Route path="/sales" element={
          <ProtectedLayout allowedRoles={['chef', 'manager', 'admin', 'viewer']}>
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
          <ProtectedLayout allowedRoles={['chef', 'manager', 'viewer', 'admin', 'rop', 'komdir']}>
            <AttendancePage />
          </ProtectedLayout>
        } />
        <Route path="/chat" element={
          <ProtectedLayout allowedRoles={['chef', 'manager']}>
            <div style={{ color: 'var(--text-muted)', padding: 40 }}>Чат — в разработке</div>
          </ProtectedLayout>
        } />
        <Route path="/guidebook" element={
          <ProtectedLayout allowedRoles={['chef', 'manager', 'admin', 'user', 'viewer']}>
            <GuidebookPage />
          </ProtectedLayout>
        } />
        <Route path="/injury-protocol" element={
          <ProtectedLayout allowedRoles={['chef', 'manager', 'admin', 'user', 'viewer', 'komdir', 'rop']}>
            <GuidebookPage mode="injury" />
          </ProtectedLayout>
        } />
        <Route path="/policy" element={
          <ProtectedLayout allowedRoles={['chef', 'manager', 'admin', 'user', 'marketing', 'viewer', 'komdir', 'rop']}>
            <PolicyPage />
          </ProtectedLayout>
        } />
        <Route path="/hr-monitors" element={
          <ProtectedLayout allowedRoles={['chef', 'manager', 'admin', 'viewer']}>
            <HRMonitorsPage />
          </ProtectedLayout>
        } />
        <Route path="/towels" element={
          <ProtectedLayout allowedRoles={['chef', 'manager', 'admin', 'viewer']}>
            <TowelsPage />
          </ProtectedLayout>
        } />
        <Route path="/lost-items" element={
          <ProtectedLayout allowedRoles={['chef', 'manager', 'admin', 'komdir', 'rop', 'lostviewer']}>
            <LostItemsPage />
          </ProtectedLayout>
        } />
        <Route path="/reviews" element={
          <ProtectedLayout allowedRoles={['chef', 'manager', 'komdir', 'rop']}>
            <ReviewsPage />
          </ProtectedLayout>
        } />
        <Route path="/qr-reviews" element={
          <ProtectedLayout allowedRoles={['chef', 'komdir', 'rop']}>
            <QrReviewsPage />
          </ProtectedLayout>
        } />
        <Route path="/calendar" element={
          <ProtectedLayout allowedRoles={['chef', 'manager', 'admin', 'viewer', 'komdir', 'rop', 'marketing']}>
            <CalendarPage />
          </ProtectedLayout>
        } />
        <Route path="/calendar/:date" element={
          <ProtectedLayout allowedRoles={['chef', 'manager', 'admin', 'viewer', 'komdir', 'rop', 'marketing']}>
            <CalendarDayPage />
          </ProtectedLayout>
        } />
        <Route path="/home" element={
          <ProtectedLayout>
            <HomePage />
          </ProtectedLayout>
        } />
        <Route path="/instudio" element={
          <ProtectedLayout allowedRoles={['chef', 'manager', 'admin', 'viewer', 'komdir', 'rop', 'marketing', 'tech']}>
            <InStudioPage />
          </ProtectedLayout>
        } />
        <Route path="/club-visits" element={
          <ProtectedLayout allowedRoles={['chef', 'manager', 'viewer', 'admin', 'komdir', 'rop']}>
            <ClubVisitsPage />
          </ProtectedLayout>
        } />
        <Route path="/shift-board" element={
          <ProtectedLayout allowedRoles={['chef', 'manager', 'admin', 'viewer', 'komdir', 'marketing', 'rop']}>
            <ShiftBoardPage />
          </ProtectedLayout>
        } />
        <Route path="/news" element={
          <ProtectedLayout allowedRoles={['chef', 'manager', 'admin', 'viewer', 'komdir', 'rop']}>
            <NewsPage />
          </ProtectedLayout>
        } />
        <Route path="/wa-demo" element={
          <ProtectedLayout allowedRoles={['chef', 'manager']}>
            <WaDemoPage />
          </ProtectedLayout>
        } />
        <Route path="/leads" element={
          <ProtectedLayout allowedRoles={['chef', 'komdir', 'rop', 'manager', 'admin']}>
            <LeadsPage />
          </ProtectedLayout>
        } />
        <Route path="/assistant" element={
          <ProtectedLayout allowedRoles={['chef', 'manager', 'admin', 'komdir', 'rop']}>
            <AssistantPage />
          </ProtectedLayout>
        } />
        <Route path="/staff" element={
          <ProtectedLayout allowedRoles={['chef', 'rop', 'manager']}>
            <StaffCreatePage />
          </ProtectedLayout>
        } />
        <Route path="/settings" element={
          <ProtectedLayout allowedRoles={['chef', 'manager', 'admin', 'viewer', 'komdir', 'rop']}>
            <SettingsPage />
          </ProtectedLayout>
        } />

        <Route path="/" element={<RootRedirect />} />
        <Route path="*" element={<RootRedirect />} />
      </Routes>
      </React.Suspense>
      </PageErrorBoundary>
      <CallOverlay />
      <DemoDayBanner />
      <NotificationPopup />
    </Router>
  );
};

import { ChecklistProvider } from './store/ChecklistContext';

function App() {
  // Публичная страница отзыва (QR из шкафчиков) — полностью изолирована:
  // рендерим ТОЛЬКО форму, без провайдеров, уведомлений, созвонов и баннеров,
  // чтобы клиенту не «протекали» служебные попапы сотрудников. Страница чистая.
  if (typeof window !== 'undefined' && window.location.pathname === '/feedback') {
    return (
      <React.Suspense fallback={<PageLoader />}>
        <FeedbackPage />
      </React.Suspense>
    );
  }
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
