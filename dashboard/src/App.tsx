import { useEffect } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { Onboarding } from './auth/Onboarding';
import { CheckEmail, ForgotPassword, Invite, Login, ResetPassword, Signup, TwoFactor } from './auth/pages';
import { Home, RequireAuth, rememberSite, useMe } from './auth/session';
import { Members, Security } from './auth/Settings';
import { Layout } from './components/Layout';
import { BY_SLUG } from './mock/data';
import { sitePath, useSiteId } from './site';
import { Overview } from './views/Overview';
import { PageDetail } from './views/PageDetail';
import { SetupChecklist } from './views/SetupChecklist';
import { SiteSettings } from './views/SiteSettings';
import { Changes, ClickPaths, ContactOptions, Devices, Requests, SearchTerms, Sources } from './views/SiteViews';

function PageRoute() {
  const { slug = '' } = useParams();
  const siteId = useSiteId();
  const page = BY_SLUG[slug];
  return page ? <PageDetail key={page.id} page={page} /> : <Navigate to={sitePath(siteId, '/')} replace />;
}

/**
 * /s/:siteId/* — only sites listed by /api/me (the user's organisations).
 * Anything else goes home. Data calls are checked again on the server.
 */
function SiteRoutes() {
  const siteId = useSiteId();
  const { me } = useMe();
  const allowed = me.sites.some((s) => s.id === siteId);
  useEffect(() => {
    if (allowed) rememberSite(siteId);
  }, [allowed, siteId]);
  if (!allowed) return <Navigate to="/" replace />;
  return (
    <Layout>
      <Routes>
        <Route index element={<Overview />} />
        <Route path="pages/:slug" element={<PageRoute />} />
        <Route path="search-terms" element={<SearchTerms />} />
        <Route path="sources" element={<Sources />} />
        <Route path="devices" element={<Devices />} />
        <Route path="contact-options" element={<ContactOptions />} />
        <Route path="click-paths" element={<ClickPaths />} />
        <Route path="changes" element={<Changes />} />
        <Route path="requests" element={<Requests />} />
        <Route path="setup" element={<SetupChecklist />} />
        <Route path="settings/*" element={<SiteSettings />} />
        <Route path="*" element={<Navigate to={sitePath(siteId, '/')} replace />} />
      </Routes>
    </Layout>
  );
}

export function App() {
  return (
    <Routes>
      {/* Signed out */}
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/check-email" element={<CheckEmail />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/two-factor" element={<TwoFactor />} />
      <Route path="/invite/:id" element={<Invite />} />

      {/* Signed in */}
      <Route element={<RequireAuth />}>
        <Route path="/" element={<Home />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/settings/security" element={<Security />} />
        <Route path="/orgs/:orgId/members" element={<Members />} />
        <Route path="/s/:siteId/*" element={<SiteRoutes />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
