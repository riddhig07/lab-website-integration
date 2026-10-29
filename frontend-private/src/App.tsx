import { Route, Routes } from 'react-router';
import { AuthProvider, RequireAuth } from './auth';
import { Dashboard } from './Dashboard';
import { DrivePage } from './DrivePage';
import { Layout } from './Layout';
import { Login } from './Login';
import { IssuePage } from './repos/IssuePage';
import { RepoPage } from './repos/RepoPage';
import { ReposPage } from './repos/ReposPage';
import { ResourcePage } from './ResourcePage';
import { TrackerPage } from './tracker/TrackerPage';

// Members-only app, served at /portal (the router's basename), so paths below
// are relative to /portal.
export function App() {
  return (
    <div className="portal">
      <AuthProvider>
        <Routes>
          <Route path="login" element={<Login />} />
          <Route
            element={
              <RequireAuth>
                <Layout />
              </RequireAuth>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="drive" element={<DrivePage />} />
            <Route path="drive/:folderId" element={<DrivePage />} />
            <Route path="tracker" element={<TrackerPage />} />
            <Route path="repos" element={<ReposPage />} />
            <Route path="repos/:owner/:name" element={<RepoPage />} />
            <Route path="repos/:owner/:name/issues/:number" element={<IssuePage />} />
            <Route path=":key" element={<ResourcePage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </div>
  );
}
