import React, { useState, useEffect } from 'react';
import { apiRequest } from '../api/client';
import {
  Teacher,
  ClassItem,
  EnrollmentStudent,
  EducationType,
  ProfessionalUC,
  ProfessionalModule,
  GradeScale,
} from '../types';
import { EvaluationRegular } from './EvaluationRegular';
import { EvaluationProfessional } from './EvaluationProfessional';
import { StudentsManagement } from './StudentsManagement';
import { PautasExportView } from './PautasExportView';
import { AttendanceView } from './AttendanceView';
import { LessonSummariesView } from './LessonSummariesView';
import { BackupModal } from './BackupModal';
import { Footer } from './Footer';
import {
  ArrowLeft,
  BookOpen,
  Briefcase,
  Users,
  Award,
  FileText,
  Download,
  Settings,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertCircle,
  Archive,
  Layers,
  GraduationCap
} from 'lucide-react';

interface ClassDetailProps {
  classId: string;
  teacher: Teacher;
  onBack: () => void;
}

export function ClassDetail({ classId, teacher, onBack }: ClassDetailProps) {
  const [classData, setClassData] = useState<any>(null);
  const [students, setStudents] = useState<EnrollmentStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active Tab
  const [activeTab, setActiveTab] = useState<string>('overview');

  // UC & Module management for professional class
  const [isAddUcOpen, setIsAddUcOpen] = useState(false);
  const [newUcCode, setNewUcCode] = useState('');
  const [newUcName, setNewUcName] = useState('');
  const [newUcScale, setNewUcScale] = useState<GradeScale>('0-20');
  const [newUcThreshold, setNewUcThreshold] = useState<number>(10);

  const [isAddModuleOpen, setIsAddModuleOpen] = useState(false);
  const [targetUcIdForModule, setTargetUcIdForModule] = useState<string>('');
  const [newModCode, setNewModCode] = useState('');
  const [newModName, setNewModName] = useState('');
  const [newModHours, setNewModHours] = useState('');

  // Settings tab form
  const [settingsName, setSettingsName] = useState('');
  const [settingsGrade, setSettingsGrade] = useState('');
  const [settingsCourse, setSettingsCourse] = useState('');
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);

  const loadClass = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiRequest(`/classes/${classId}`);
      setClassData(res);
      setStudents(res.students || []);

      setSettingsName(res.class?.name || '');
      setSettingsGrade(res.class?.grade_level || '');
      setSettingsCourse(res.class?.course_name || '');
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar turma');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClass();
  }, [classId]);

  const isRegular = classData?.class?.education_type === 'regular';

  // Add UC
  const handleCreateUc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUcName.trim()) return;

    try {
      await apiRequest(`/classes/${classId}/ucs`, {
        method: 'POST',
        body: JSON.stringify({
          code: newUcCode.trim(),
          name: newUcName.trim(),
          scale: newUcScale,
          passingThreshold: newUcThreshold,
        }),
      });

      setIsAddUcOpen(false);
      setNewUcCode('');
      setNewUcName('');
      await loadClass();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Add Module
  const handleCreateModule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUcIdForModule || !newModName.trim()) return;

    try {
      await apiRequest(`/ucs/${targetUcIdForModule}/modules`, {
        method: 'POST',
        body: JSON.stringify({
          codeOrNumber: newModCode.trim(),
          name: newModName.trim(),
          hours: newModHours ? parseInt(newModHours, 10) : null,
        }),
      });

      setIsAddModuleOpen(false);
      setNewModCode('');
      setNewModName('');
      setNewModHours('');
      await loadClass();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Delete Module
  const handleDeleteModule = async (moduleId: string) => {
    if (!confirm('Eliminar este módulo e todas as suas avaliações associadas?')) return;
    try {
      await apiRequest(`/modules/${moduleId}`, { method: 'DELETE' });
      await loadClass();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Delete UC
  const handleDeleteUc = async (ucId: string) => {
    if (!confirm('Eliminar esta UC e todos os seus módulos e avaliações?')) return;
    try {
      await apiRequest(`/ucs/${ucId}`, { method: 'DELETE' });
      await loadClass();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Save Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest(`/classes/${classId}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: settingsName.trim(),
          gradeLevel: settingsGrade.trim(),
          courseName: settingsCourse.trim(),
        }),
      });
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2000);
      await loadClass();
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-400 text-sm">A carregar detalhes da turma...</div>
      </div>
    );
  }

  if (!classData?.class) {
    return (
      <div className="min-h-screen bg-slate-50 p-8 text-center">
        <p className="text-rose-600 mb-4">Turma não encontrada.</p>
        <button
          onClick={onBack}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold"
        >
          Voltar ao Painel
        </button>
      </div>
    );
  }

  const cls: ClassItem = classData.class;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              title="Voltar ao Painel das Turmas"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
                  {cls.name}
                </h1>
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                    isRegular
                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : 'bg-amber-50 text-amber-800 border border-amber-200'
                  }`}
                >
                  {isRegular ? <BookOpen className="w-3 h-3" /> : <Briefcase className="w-3 h-3" />}
                  {isRegular ? 'Ensino Regular (TIC)' : 'Ensino Profissional'}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                {cls.grade_level} {cls.course_name ? `• ${cls.course_name}` : ''} • Ano Letivo: {cls.academic_year_name}
              </p>
            </div>
          </div>

          {/* Quick info & School Logo */}
          <div className="flex items-center gap-3 text-xs font-semibold text-slate-600">
            <div className="flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 rounded-lg">
              <Users className="w-4 h-4 text-slate-400" />
              <span>{students.length} alunos</span>
            </div>
            <div className="h-6 w-px bg-slate-200 hidden sm:block" />
            <img
              src="/assets/aistudio/AEGP_c929fad4.png"
              alt="AEGP - Agrupamento de Escolas Gabriel Pereira"
              className="h-8 w-auto object-contain hidden sm:block"
            />
          </div>
        </div>

        {/* Navigation Tabs (Distinct for Regular vs Professional) */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-1 sm:space-x-4 overflow-x-auto border-t border-slate-100 text-xs sm:text-sm font-bold">
            {isRegular ? (
              // REGULAR TABS
              <>
                <button
                  type="button"
                  onClick={() => setActiveTab('overview')}
                  className={`py-3 px-3 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                    activeTab === 'overview'
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Visão Geral
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('students')}
                  className={`py-3 px-3 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                    activeTab === 'students'
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Alunos ({students.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('evaluation')}
                  className={`py-3 px-3 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                    activeTab === 'evaluation'
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Avaliação de TIC
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('attendance')}
                  className={`py-3 px-3 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                    activeTab === 'attendance'
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Assiduidade
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('summaries')}
                  className={`py-3 px-3 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                    activeTab === 'summaries'
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Sumários
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('pautas')}
                  className={`py-3 px-3 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                    activeTab === 'pautas'
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Pautas (PDF)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('settings')}
                  className={`py-3 px-3 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                    activeTab === 'settings'
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Configurações
                </button>
              </>
            ) : (
              // PROFESSIONAL TABS
              <>
                <button
                  type="button"
                  onClick={() => setActiveTab('overview')}
                  className={`py-3 px-3 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                    activeTab === 'overview'
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Visão Geral
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('students')}
                  className={`py-3 px-3 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                    activeTab === 'students'
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Alunos ({students.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('ucs')}
                  className={`py-3 px-3 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                    activeTab === 'ucs'
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-slate-500 hover:text-slate-900'
                  }`}
                >
                  UC e Módulos ({classData.ucs?.length || 0})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('evaluation')}
                  className={`py-3 px-3 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                    activeTab === 'evaluation'
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Avaliações
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('attendance')}
                  className={`py-3 px-3 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                    activeTab === 'attendance'
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Assiduidade
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('summaries')}
                  className={`py-3 px-3 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                    activeTab === 'summaries'
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Sumários
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('pautas')}
                  className={`py-3 px-3 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                    activeTab === 'pautas'
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Pautas (PDF)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('settings')}
                  className={`py-3 px-3 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                    activeTab === 'settings'
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Configurações
                </button>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium flex items-center gap-2">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* TAB 1: VISÃO GERAL */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Alunos Inscritos
                </span>
                <div className="text-3xl font-extrabold text-slate-900 mt-2 font-mono">
                  {students.length}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {students.filter((s) => s.status === 'active').length} alunos com matrícula ativa
                </p>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Estrutura Curricular
                </span>
                <div className="text-xl font-extrabold text-slate-900 mt-2">
                  {isRegular ? 'TIC — 3 Períodos' : `${classData.ucs?.length || 0} Unidades Curriculares`}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {isRegular
                    ? '1.º, 2.º e 3.º Períodos independentes'
                    : `${classData.ucs?.reduce((acc: number, u: any) => acc + (u.modules?.length || 0), 0) || 0} módulos no total`}
                </p>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Escala em Vigor
                </span>
                <div className="text-xl font-extrabold text-slate-900 mt-2 font-mono">
                  {cls.default_scale}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {isRegular ? 'Escala padrão da disciplina' : 'Aplicável às UC e respetivos módulos'}
                </p>
              </div>
            </div>

            {/* Quick Action Tiles */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <button
                type="button"
                onClick={() => setActiveTab('evaluation')}
                className="p-5 bg-white hover:bg-slate-50 rounded-2xl border border-slate-200 text-left transition-all hover:border-indigo-300 shadow-xs cursor-pointer group"
              >
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                  <Award className="w-5 h-5" />
                </div>
                <h4 className="font-bold text-slate-900 text-sm">Registar Avaliações</h4>
                <p className="text-xs text-slate-500 mt-1">
                  Introduza notas diretamente na grelha com navegação por teclado e gravação contínua.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('students')}
                className="p-5 bg-white hover:bg-slate-50 rounded-2xl border border-slate-200 text-left transition-all hover:border-indigo-300 shadow-xs cursor-pointer group"
              >
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                  <Users className="w-5 h-5" />
                </div>
                <h4 className="font-bold text-slate-900 text-sm">Gerir Alunos</h4>
                <p className="text-xs text-slate-500 mt-1">
                  Consulte fichas individuais, importe turmas completas e anote comentários privados.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('pautas')}
                className="p-5 bg-white hover:bg-slate-50 rounded-2xl border border-slate-200 text-left transition-all hover:border-indigo-300 shadow-xs cursor-pointer group"
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                  <FileText className="w-5 h-5" />
                </div>
                <h4 className="font-bold text-slate-900 text-sm">Exportar Pautas</h4>
                <p className="text-xs text-slate-500 mt-1">
                  Gere documentos em PDF com paginação oficial e pré-visualização no ecrã.
                </p>
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: ALUNOS */}
        {activeTab === 'students' && (
          <StudentsManagement
            classId={classId}
            className={cls.name}
            educationType={cls.education_type}
            students={students}
            onRefresh={loadClass}
          />
        )}

        {/* TAB 3 (PROFESSIONAL ONLY): UC E MÓDULOS */}
        {!isRegular && activeTab === 'ucs' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Unidades Curriculares e Módulos</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Cada UC possui os seus próprios módulos. A classificação de um módulo pertence exclusivamente a esse módulo e à respetiva UC.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsAddUcOpen(true)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Nova Unidade Curricular
              </button>
            </div>

            {/* List of UCs */}
            <div className="space-y-5">
              {classData.ucs?.map((uc: any) => (
                <div key={uc.id} className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                  <div className="p-4 sm:p-5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {uc.code && (
                        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800">
                          {uc.code}
                        </span>
                      )}
                      <h3 className="font-bold text-slate-900 text-base">{uc.name}</h3>
                      <span className="text-xs text-slate-500">
                        • Escala: {uc.scale} • Limiar: {uc.passing_threshold} val.
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setTargetUcIdForModule(uc.id);
                          setNewModCode(`M${(uc.modules?.length || 0) + 1}`);
                          setNewModName('');
                          setNewModHours('25');
                          setIsAddModuleOpen(true);
                        }}
                        className="px-3 py-1.5 bg-white hover:bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" /> Adicionar Módulo
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteUc(uc.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg cursor-pointer"
                        title="Eliminar Unidade Curricular"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Modules table for this UC */}
                  <div className="p-4">
                    {uc.modules?.length === 0 ? (
                      <p className="text-xs text-slate-400 italic py-2">
                        Nenhum módulo registado nesta UC. Clique em «Adicionar Módulo» acima.
                      </p>
                    ) : (
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-100 text-slate-400">
                            <th className="py-2 px-3 w-20">Código</th>
                            <th className="py-2 px-3">Designação do Módulo</th>
                            <th className="py-2 px-3 w-28 text-center">Carga Horária</th>
                            <th className="py-2 px-3 w-20 text-right">Ação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {uc.modules?.map((mod: any) => (
                            <tr key={mod.id} className="hover:bg-slate-50/50">
                              <td className="py-2 px-3 font-mono font-bold text-slate-700">
                                {mod.code_or_number}
                              </td>
                              <td className="py-2 px-3 font-medium text-slate-800">{mod.name}</td>
                              <td className="py-2 px-3 text-center text-slate-500">
                                {mod.hours ? `${mod.hours} horas` : '—'}
                              </td>
                              <td className="py-2 px-3 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteModule(mod.id)}
                                  className="text-slate-400 hover:text-rose-600 p-1 rounded cursor-pointer"
                                  title="Eliminar módulo"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB: AVALIAÇÕES (REGULAR OU PROFISSIONAL) */}
        {activeTab === 'evaluation' && (
          <div>
            {isRegular ? (
              <EvaluationRegular
                classId={classId}
                className={cls.name}
                defaultScale={cls.default_scale}
                students={students}
              />
            ) : (
              <EvaluationProfessional
                classId={classId}
                className={cls.name}
                courseName={cls.course_name}
                students={students}
              />
            )}
          </div>
        )}

        {/* TAB: ASSIDUIDADE */}
        {activeTab === 'attendance' && (
          <AttendanceView
            classId={classId}
            className={cls.name}
            gradeLevel={cls.grade_level}
            courseName={cls.course_name}
            teacher={teacher}
            students={students}
          />
        )}

        {/* TAB: SUMÁRIOS */}
        {activeTab === 'summaries' && (
          <LessonSummariesView
            classId={classId}
            className={cls.name}
            gradeLevel={cls.grade_level}
            courseName={cls.course_name}
            teacher={teacher}
          />
        )}

        {/* TAB: PAUTAS */}
        {activeTab === 'pautas' && (
          <PautasExportView
            teacher={teacher}
            classId={classId}
            className={cls.name}
            gradeLevel={cls.grade_level}
            courseName={cls.course_name}
            academicYearName={cls.academic_year_name || ''}
            educationType={cls.education_type}
            students={students}
          />
        )}

        {/* TAB: CONFIGURAÇÕES DA TURMA */}
        {activeTab === 'settings' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs max-w-xl space-y-5">
            <div>
              <h3 className="text-base font-bold text-slate-900">Configurações da Turma</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Atualize as designações desta turma sem perder as avaliações já introduzidas.
              </p>
            </div>

            {settingsSaved && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-xl font-medium flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>Configurações atualizadas com sucesso.</span>
              </div>
            )}

            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Designação da Turma
                </label>
                <input
                  type="text"
                  required
                  value={settingsName}
                  onChange={(e) => setSettingsName(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Ano de Escolaridade
                </label>
                <input
                  type="text"
                  required
                  value={settingsGrade}
                  onChange={(e) => setSettingsGrade(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                />
              </div>

              {!isRegular && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nome do Curso
                  </label>
                  <input
                    type="text"
                    value={settingsCourse}
                    onChange={(e) => setSettingsCourse(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                  />
                </div>
              )}

              <div className="pt-2">
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow cursor-pointer"
                >
                  Guardar Alterações
                </button>
              </div>
            </form>

            {/* Cópia de Segurança */}
            <div className="pt-5 border-t border-slate-100 flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-900">Cópia de Segurança dos Dados</h4>
                <p className="text-[11px] text-slate-500">Exporte todas as turmas, avaliações, sumários e assiduidade em JSON.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsBackupModalOpen(true)}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer inline-flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5 text-indigo-600" />
                <span>Exportar Backup</span>
              </button>
            </div>
          </div>
        )}
      </main>

      {/* MODAL: NOVA UC (PROFISSIONAL) */}
      {isAddUcOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-slate-100">
            <h3 className="text-base font-bold text-slate-900 mb-1">Adicionar Unidade Curricular</h3>
            <p className="text-xs text-slate-500 mb-4">Turma: {cls.name}</p>

            <form onSubmit={handleCreateUc} className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Código</label>
                  <input
                    type="text"
                    value={newUcCode}
                    onChange={(e) => setNewUcCode(e.target.value)}
                    placeholder="PSI"
                    className="w-full px-3 py-2 text-xs font-mono font-bold bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Designação da UC *</label>
                  <input
                    type="text"
                    required
                    value={newUcName}
                    onChange={(e) => setNewUcName(e.target.value)}
                    placeholder="Ex: Programação e Sistemas de Informação"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Escala</label>
                  <select
                    value={newUcScale}
                    onChange={(e) => setNewUcScale(e.target.value as GradeScale)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white cursor-pointer"
                  >
                    <option value="0-20">0 a 20 Valores</option>
                    <option value="1-5">1 a 5 Níveis</option>
                    <option value="0-100">0 a 100%</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Limiar de Aprovação</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={newUcThreshold}
                    onChange={(e) => setNewUcThreshold(parseFloat(e.target.value) || 10)}
                    className="w-full px-3 py-2 text-xs font-bold bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddUcOpen(false)}
                  className="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg text-xs font-medium cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow cursor-pointer"
                >
                  Criar UC
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: NOVO MÓDULO */}
      {isAddModuleOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-slate-100">
            <h3 className="text-base font-bold text-slate-900 mb-1">Adicionar Módulo à UC</h3>
            <p className="text-xs text-slate-500 mb-4">
              Introduza a identificação do módulo e a carga horária estimada.
            </p>

            <form onSubmit={handleCreateModule} className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Código / N.º *</label>
                  <input
                    type="text"
                    required
                    value={newModCode}
                    onChange={(e) => setNewModCode(e.target.value)}
                    placeholder="M1"
                    className="w-full px-3 py-2 text-xs font-mono font-bold bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Carga Horária (h)</label>
                  <input
                    type="number"
                    value={newModHours}
                    onChange={(e) => setNewModHours(e.target.value)}
                    placeholder="Ex: 25"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Designação do Módulo *</label>
                <input
                  type="text"
                  required
                  value={newModName}
                  onChange={(e) => setNewModName(e.target.value)}
                  placeholder="Ex: Estruturas de Dados e Algoritmos"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModuleOpen(false)}
                  className="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg text-xs font-medium cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow cursor-pointer"
                >
                  Criar Módulo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Backup */}
      <BackupModal
        isOpen={isBackupModalOpen}
        onClose={() => setIsBackupModalOpen(false)}
      />

      {/* Plataforma Footer */}
      <Footer />
    </div>
  );
}
