import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { JurorDashboardPage } from './pages/JurorDashboardPage';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { TeamDashboardPage } from './pages/TeamDashboardPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/registrar" element={<RegisterPage />} />
            <Route path="/verificar-email" element={<VerifyEmailPage />} />
            <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
            <Route
              path="/equipe"
              element={
                <ProtectedRoute allowedRoles={['participante']} requireEmailVerified>
                  <TeamDashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/jurado"
              element={
                <ProtectedRoute allowedRoles={['jurado']} requireEmailVerified={false}>
                  <JurorDashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <ProtectedRoute allowedRoles={['organizacao']} requireEmailVerified={false}>
                  <AdminDashboardPage />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  );
}
