import React, { useState, useEffect } from 'react';
import { apiRequest, getStoredToken } from './api/client';
import { Teacher, ClassItem } from './types';
import { AuthView } from './components/AuthView';
import { InitialWizard } from './components/InitialWizard';
import { Dashboard } from './components/Dashboard';
import { ClassDetail } from './components/ClassDetail';

export default function App() {
  const [isInitialized, setIsInitialized] = useState<boolean>(true);
  const [currentTeacher, setCurrentTeacher] = useState<Teacher | null>(null);
  const [checkingAuth, setCheckingAuth] = useState<boolean>(true);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState<boolean>(false);

  // Check auth and initial status
  const checkStatus = async () => {
    try {
      setCheckingAuth(true);
      const res = await apiRequest<{ initialized: boolean; teacher: Teacher | null }>('/auth/status');
      setIsInitialized(res.initialized);
      setCurrentTeacher(res.teacher);

      if (res.teacher) {
        // Check if teacher has any classes yet
        const classesRes = await apiRequest<{ classes: ClassItem[] }>('/classes').catch(() => ({ classes: [] }));
        if (!classesRes.classes || classesRes.classes.length === 0) {
          setShowWizard(true);
        } else {
          setShowWizard(false);
        }
      }
    } catch (err) {
      console.error('Erro ao verificar estado da aplicação:', err);
    } finally {
      setCheckingAuth(false);
    }
  };

  useEffect(() => {
    checkStatus();
  }, []);

  // When teacher logs in
  const handleLoginSuccess = async (teacher: Teacher) => {
    setCurrentTeacher(teacher);
    setIsInitialized(true);
    // Check if classes exist
    const classesRes = await apiRequest<{ classes: ClassItem[] }>('/classes').catch(() => ({ classes: [] }));
    if (!classesRes.classes || classesRes.classes.length === 0) {
      setShowWizard(true);
    } else {
      setShowWizard(false);
    }
  };

  const handleLogout = () => {
    setCurrentTeacher(null);
    setSelectedClassId(null);
    setShowWizard(false);
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-slate-400 text-sm font-medium flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <span>A carregar Caderno Letivo...</span>
        </div>
      </div>
    );
  }

  // Not logged in or not initialized
  if (!currentTeacher) {
    return (
      <AuthView
        isInitialized={isInitialized}
        onLoginSuccess={handleLoginSuccess}
      />
    );
  }

  // First-time Initial Wizard
  if (showWizard) {
    return (
      <InitialWizard
        initialTeacher={currentTeacher}
        onComplete={() => {
          setShowWizard(false);
          checkStatus();
        }}
      />
    );
  }

  // Selected Class View
  if (selectedClassId) {
    return (
      <ClassDetail
        classId={selectedClassId}
        teacher={currentTeacher}
        onBack={() => setSelectedClassId(null)}
      />
    );
  }

  // Main Dashboard
  return (
    <Dashboard
      teacher={currentTeacher}
      onSelectClass={(classId) => setSelectedClassId(classId)}
      onLogout={handleLogout}
    />
  );
}
