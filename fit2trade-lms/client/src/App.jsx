import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import { Spinner } from './components/Ui.jsx';
import Login from './pages/learner/Login.jsx';
import Dashboard from './pages/learner/Dashboard.jsx';
import Catalog from './pages/learner/Catalog.jsx';
import CourseDetail from './pages/learner/CourseDetail.jsx';
import Player from './pages/learner/Player.jsx';
import Certificates from './pages/learner/Certificates.jsx';
import Sessions from './pages/learner/Sessions.jsx';
import Profile from './pages/learner/Profile.jsx';
import LiveRoom from './pages/learner/LiveRoom.jsx';
import PathDetail from './pages/learner/PathDetail.jsx';
import AdminDashboard from './pages/admin/AdminDashboard.jsx';
import Users, { UserRecord } from './pages/admin/Users.jsx';
import Courses from './pages/admin/Courses.jsx';
import CourseBuilder from './pages/admin/CourseBuilder.jsx';
import Enrollments from './pages/admin/Enrollments.jsx';
import LearningPaths from './pages/admin/LearningPaths.jsx';
import AdminSessions from './pages/admin/AdminSessions.jsx';
import Reports from './pages/admin/Reports.jsx';
import Settings from './pages/admin/Settings.jsx';
import Import from './pages/admin/Import.jsx';

function Guard({ children, staff, admin }) {
  const { user, loading, isStaff, isAdmin } = useAuth(); const loc = useLocation();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (staff && !isStaff) return <Navigate to="/" replace />;
  if (admin && !isAdmin) return <Navigate to="/admin" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/live/:id" element={<Guard><LiveRoom /></Guard>} />
      <Route element={<Guard><Layout /></Guard>}>
        <Route index element={<Dashboard />} />
        <Route path="catalog" element={<Catalog />} />
        <Route path="courses/:id" element={<CourseDetail />} />
        <Route path="learn/:enrollmentId" element={<Player />} />
        <Route path="certificates" element={<Certificates />} />
        <Route path="sessions" element={<Sessions />} />
        <Route path="sessions/:id" element={<Sessions />} />
        <Route path="paths/:id" element={<PathDetail />} />
        <Route path="profile" element={<Profile />} />
        <Route path="admin" element={<Guard staff><AdminDashboard /></Guard>} />
        <Route path="admin/courses" element={<Guard staff><Courses /></Guard>} />
        <Route path="admin/courses/:id" element={<Guard staff><CourseBuilder /></Guard>} />
        <Route path="admin/enrollments" element={<Guard staff><Enrollments /></Guard>} />
        <Route path="admin/paths" element={<Guard staff><LearningPaths /></Guard>} />
        <Route path="admin/sessions" element={<Guard staff><AdminSessions /></Guard>} />
        <Route path="admin/reports" element={<Guard staff><Reports /></Guard>} />
        <Route path="admin/users" element={<Guard admin><Users /></Guard>} />
        <Route path="admin/users/:id" element={<Guard admin><UserRecord /></Guard>} />
        <Route path="admin/import" element={<Guard admin><Import /></Guard>} />
        <Route path="admin/settings" element={<Guard admin><Settings /></Guard>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
