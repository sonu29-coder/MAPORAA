import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { theme } from './theme';
import { AuthProvider } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { ProtectedRoute } from './components/ProtectedRoute';

import { Home } from './pages/Home';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Dashboard } from './pages/Dashboard';
import { ProjectWizard } from './pages/ProjectWizard';
import { Processing } from './pages/Processing';
import { MapEditor } from './pages/MapEditor';
import { ModelViewer3D } from './pages/ModelViewer3D';
import { ExportPage } from './pages/ExportPage';

export const App: React.FC = () => {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <BrowserRouter>
          <Navbar />
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* Protected Routes */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/projects/new"
              element={
                <ProtectedRoute>
                  <ProjectWizard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/projects/:projectId/upload"
              element={
                <ProtectedRoute>
                  <ProjectWizard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/projects/:projectId/processing"
              element={
                <ProtectedRoute>
                  <Processing />
                </ProtectedRoute>
              }
            />
            <Route
              path="/projects/:projectId/map"
              element={
                <ProtectedRoute>
                  <MapEditor />
                </ProtectedRoute>
              }
            />
            <Route
              path="/projects/:projectId/3d"
              element={
                <ProtectedRoute>
                  <ModelViewer3D />
                </ProtectedRoute>
              }
            />
            <Route
              path="/projects/:projectId/export"
              element={
                <ProtectedRoute>
                  <ExportPage />
                </ProtectedRoute>
              }
            />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
