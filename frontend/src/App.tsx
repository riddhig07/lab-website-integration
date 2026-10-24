import { Route, Routes } from 'react-router';
import { Layout } from './public/Layout';
import { Contact } from './public/pages/Contact';
import { Home } from './public/pages/Home';
import { News } from './public/pages/News';
import { NotFound } from './public/pages/NotFound';
import { People } from './public/pages/People';
import { Publications } from './public/pages/Publications';
import { Research } from './public/pages/Research';

// The members portal is a separate app (frontend-private) served at /portal.
export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="research" element={<Research />} />
        <Route path="people" element={<People />} />
        <Route path="publications" element={<Publications />} />
        <Route path="news" element={<News />} />
        <Route path="contact" element={<Contact />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
