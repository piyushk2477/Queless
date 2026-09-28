import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AppShell, Protected } from './components/Layout';
import { Spinner } from './components/ui';
import { Login, Register } from './pages/Auth';
import Landing from './pages/Landing';
import NotFound from './pages/NotFound';

// Code-split everything that is not on the first screen.
const Discover = lazy(() => import('./pages/Discover'));
const BusinessPage = lazy(() => import('./pages/BusinessPage'));
const JoinQueue = lazy(() => import('./pages/JoinQueue'));
const Tracker = lazy(() => import('./pages/Tracker'));
const MyTokens = lazy(() => import('./pages/MyTokens'));
const Notifications = lazy(() => import('./pages/Notifications'));
const BizHome = lazy(() => import('./pages/biz/BizHome'));
const Onboard = lazy(() => import('./pages/biz/Onboard'));
const BizLayout = lazy(() => import('./pages/biz/BizLayout'));
const Overview = lazy(() => import('./pages/biz/Overview'));
const Queues = lazy(() => import('./pages/biz/Queues'));
const Console = lazy(() => import('./pages/biz/Console'));
const Analytics = lazy(() => import('./pages/biz/Analytics'));
const setup = (name) => lazy(() => import('./pages/biz/Setup').then((m) => ({ default: m[name] })));
const Services = setup('Services');
const Counters = setup('Counters');
const Staff = setup('Staff');
const Kiosks = setup('Kiosks');
const Kiosk = lazy(() => import('./pages/Kiosk'));
const Display = lazy(() => import('./pages/Display'));
const admin = (name) => lazy(() => import('./pages/admin/Admin').then((m) => ({ default: m[name] })));
const AdminLayout = admin('AdminLayout');
const AdminBusinesses = admin('AdminBusinesses');
const AdminCategories = admin('AdminCategories');
const AdminUsers = admin('AdminUsers');
const AdminStats = admin('AdminStats');

export default function App() {
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        {/* full-screen device modes */}
        <Route path="/kiosk" element={<Kiosk />} />
        <Route path="/display/:slug" element={<Display />} />

        <Route element={<AppShell />}>
          <Route index element={<Landing />} />
          <Route path="discover" element={<Discover />} />
          <Route path="b/:slug" element={<BusinessPage />} />
          <Route path="q/:queueId/join" element={<JoinQueue />} />
          <Route path="join/:queueId" element={<JoinQueue guest />} />
          <Route path="t/:entryId" element={<Tracker />} />
          <Route path="login" element={<Login />} />
          <Route path="register" element={<Register />} />

          <Route element={<Protected />}>
            <Route path="me/tokens" element={<MyTokens />} />
            <Route path="me/notifications" element={<Notifications />} />
            <Route path="biz" element={<BizHome />} />
            <Route path="biz/onboard" element={<Onboard />} />
            <Route path="biz/:id" element={<BizLayout />}>
              <Route index element={<Overview />} />
              <Route path="console" element={<Console />} />
              <Route path="queues" element={<Queues />} />
              <Route path="services" element={<Services />} />
              <Route path="counters" element={<Counters />} />
              <Route path="staff" element={<Staff />} />
              <Route path="kiosks" element={<Kiosks />} />
              <Route path="analytics" element={<Analytics />} />
            </Route>
          </Route>

          <Route element={<Protected roles={['admin']} />}>
            <Route path="admin" element={<AdminLayout />}>
              <Route index element={<AdminBusinesses />} />
              <Route path="categories" element={<AdminCategories />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="stats" element={<AdminStats />} />
            </Route>
          </Route>

          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
