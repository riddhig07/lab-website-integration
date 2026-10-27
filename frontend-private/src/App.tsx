import { Route, Routes } from 'react-router';
import { AuthProvider, RequireAuth } from './auth';
import { Dashboard } from './Dashboard';
import { DrivePage } from './DrivePage';
import { Layout } from './Layout';
import { Login } from './Login';
import { ResourcePage } from './ResourcePage';

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
            <Route path=":key" element={<ResourcePage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </div>
  );
}
