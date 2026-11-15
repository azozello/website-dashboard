import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { Layout } from './components/Layout';
import { BY_SLUG } from './mock/data';
import { Overview } from './views/Overview';
import { PageDetail } from './views/PageDetail';
import { Changes, ClickPaths, ContactOptions, Devices, Requests, SearchTerms, Sources } from './views/SiteViews';

function PageRoute() {
  const { slug = '' } = useParams();
  const page = BY_SLUG[slug];
  return page ? <PageDetail key={page.id} page={page} /> : <Navigate to="/" replace />;
}

export function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/pages/:slug" element={<PageRoute />} />
        <Route path="/search-terms" element={<SearchTerms />} />
        <Route path="/sources" element={<Sources />} />
        <Route path="/devices" element={<Devices />} />
        <Route path="/contact-options" element={<ContactOptions />} />
        <Route path="/click-paths" element={<ClickPaths />} />
        <Route path="/changes" element={<Changes />} />
        <Route path="/requests" element={<Requests />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
