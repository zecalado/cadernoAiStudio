import React, { useState, useEffect } from 'react';
import { apiRequest, clearStoredToken } from '../api/client';
import { Teacher, AcademicYear, ClassItem, EducationType, GradeScale, TeacherInvitation } from '../types';
import { Footer } from './Footer';
import { BackupModal } from './BackupModal';
import {
  GraduationCap,
  Calendar,
  Users,
  Plus,
  Download,
  BookOpen,
  Briefcase,
  LogOut,
  Archive,
  ChevronRight,
  Layers,
  Sparkles,
  School,
  CheckCircle2,
  AlertCircle,
  UserPlus,
  Copy,
  Check,
  Trash2,
  Ticket,
  Clock,
  ExternalLink,
} from 'lucide-react';

interface DashboardProps {
  teacher: Teacher;
  onSelectClass: (classId: string) => void;
  onLogout: () => void;
}

export function Dashboard({ teacher, onSelectClass, onLogout }: DashboardProps) {
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [selectedYearId, setSelectedYearId] = useState<string>('');
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [showArchived, setShowArchived] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // New Class Modal State
  const [isAddClassOpen, setIsAddClassOpen] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newGradeLevel, setNewGradeLevel] = useState('');
  const [newEduType, setNewEduType] = useState<EducationType>('regular');
  const [newCourseName, setNewCourseName] = useState('');
  const [newScale, setNewScale] = useState<GradeScale>('1-5');

  // New Year Modal State
  const [isAddYearOpen, setIsAddYearOpen] = useState(false);
  const [newYearName, setNewYearName] = useState('');

  // Invitations Modal State
  const [isInvitationsModalOpen, setIsInvitationsModalOpen] = useState(false);
  const [invitations, setInvitations] = useState<TeacherInvitation[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(false);
  const [newInviteEmail, setNewInviteEmail] = useState('');
  const [newInviteDays, setNewInviteDays] = useState(7);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [inviteSuccessMsg, setInviteSuccessMsg] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const yearsData = await apiRequest<{ years: AcademicYear[] }>('/academic-years');
      setAcademicYears(yearsData.years || []);

      const activeYear = yearsData.years?.find((y) => y.is_active && !y.is_archived) || yearsData.years?.[0];
      const yearIdToUse = activeYear ? activeYear.id : '';
      setSelectedYearId(yearIdToUse);

      if (yearIdToUse) {
        await loadClassesForYear(yearIdToUse);
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar anos letivos');
    } finally {
      setLoading(false);
    }
  };

  const loadClassesForYear = async (yearId: string) => {
    try {
      const classesData = await apiRequest<{ classes: ClassItem[] }>(`/classes?yearId=${yearId}`);
      setClasses(classesData.classes || []);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar turmas');
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleYearChange = async (yearId: string) => {
    setSelectedYearId(yearId);
    await loadClassesForYear(yearId);
  };

  const handleCreateYear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newYearName.trim()) return;
    try {
      const res = await apiRequest<{ year: AcademicYear }>('/academic-years', {
        method: 'POST',
        body: JSON.stringify({ name: newYearName.trim() }),
      });
      setIsAddYearOpen(false);
      setNewYearName('');
      await loadData();
      setSelectedYearId(res.year.id);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassName.trim() || !newGradeLevel.trim()) return;

    try {
      await apiRequest('/classes', {
        method: 'POST',
        body: JSON.stringify({
          academicYearId: selectedYearId,
          name: newClassName.trim(),
          gradeLevel: newGradeLevel.trim(),
          educationType: newEduType,
          courseName: newEduType === 'professional' ? newCourseName.trim() : null,
          defaultScale: newScale,
        }),
      });

      setIsAddClassOpen(false);
      setNewClassName('');
      setNewGradeLevel('');
      setNewCourseName('');
      await loadClassesForYear(selectedYearId);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleArchiveClass = async (classId: string, currentArchived: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await apiRequest(`/classes/${classId}/archive`, {
        method: 'POST',
        body: JSON.stringify({ archive: !currentArchived }),
      });
      await loadClassesForYear(selectedYearId);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const loadInvitations = async () => {
    try {
      setLoadingInvites(true);
      setInviteError(null);
      const data = await apiRequest<{ invitations: TeacherInvitation[] }>('/invitations');
      setInvitations(data.invitations || []);
    } catch (err: any) {
      setInviteError(err.message || 'Erro ao carregar convites');
    } finally {
      setLoadingInvites(false);
    }
  };

  const openInvitationsModal = () => {
    setIsInvitationsModalOpen(true);
    setInviteSuccessMsg(null);
    setInviteError(null);
    loadInvitations();
  };

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError(null);
    setInviteSuccessMsg(null);
    try {
      const res = await apiRequest<{ invitation: TeacherInvitation }>('/invitations', {
        method: 'POST',
        body: JSON.stringify({
          recipientEmail: newInviteEmail.trim() || undefined,
          validityDays: newInviteDays,
        }),
      });
      setNewInviteEmail('');
      setInviteSuccessMsg(`Convite ${res.invitation.code} criado com sucesso! Partilhe a ligação ou código com o seu colega.`);
      await loadInvitations();
    } catch (err: any) {
      setInviteError(err.message || 'Erro ao gerar convite');
    }
  };

  const handleRevokeInvite = async (id: string) => {
    if (!window.confirm('Tem a certeza que pretende revogar este convite?')) return;
    try {
      await apiRequest(`/invitations/${id}`, { method: 'DELETE' });
      await loadInvitations();
    } catch (err: any) {
      setInviteError(err.message || 'Erro ao revogar convite');
    }
  };

  const handleCopyLink = (code: string) => {
    const url = `${window.location.origin}/?convite=${code}`;
    navigator.clipboard.writeText(url);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  const visibleClasses = classes.filter((c) => (showArchived ? true : !c.is_archived));
  const activeYearObj = academicYears.find((y) => y.id === selectedYearId);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Navigation Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <img
              src="/assets/aistudio/AEGP_c929fad4.png"
              alt="AEGP - Agrupamento de Escolas Gabriel Pereira"
              className="h-10 w-auto max-w-[160px] sm:max-w-none object-contain"
            />
            <div className="h-8 w-px bg-slate-200 hidden sm:block" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-extrabold text-slate-900 leading-tight">Caderno Letivo</h1>
                <span className="hidden md:inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/80">
                  AEGP
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium flex items-center gap-1.5">
                <span>{teacher.school || 'Agrupamento de Escolas Gabriel Pereira - Évora'}</span>
                <span>•</span>
                <span className="font-semibold text-slate-700">{teacher.name}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Academic Year Selector */}
            <div className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200/80 px-2.5 py-1.5 rounded-lg border border-slate-200 transition-colors">
              <Calendar className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <select
                value={selectedYearId}
                onChange={(e) => handleYearChange(e.target.value)}
                className="text-xs font-bold text-slate-800 bg-transparent focus:outline-none cursor-pointer"
              >
                {academicYears.map((year) => (
                  <option key={year.id} value={year.id}>
                    {year.name} {year.is_active ? '(Ativo)' : ''} {year.is_archived ? '(Arquivado)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => setIsAddYearOpen(true)}
              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
              title="Criar Novo Ano Letivo"
            >
              <Plus className="w-4 h-4" />
            </button>

            <button
              onClick={openInvitationsModal}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-indigo-600 px-2.5 py-1.5 rounded-lg hover:bg-indigo-50 border border-slate-200 transition-colors cursor-pointer"
              title="Gerir Convites para Outros Professores"
            >
              <UserPlus className="w-3.5 h-3.5 text-indigo-600" />
              <span className="hidden md:inline">Convidar Colega</span>
            </button>

            <button
              onClick={() => setIsBackupModalOpen(true)}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-indigo-600 px-2.5 py-1.5 rounded-lg hover:bg-indigo-50 border border-slate-200 transition-colors cursor-pointer"
              title="Cópia de Segurança de Todos os Dados"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden lg:inline">Backup</span>
            </button>

            <div className="h-6 w-px bg-slate-200 mx-1" />

            <button
              onClick={() => {
                clearStoredToken();
                onLogout();
              }}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-rose-600 px-2.5 py-1.5 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
              title="Terminar Sessão Privada"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Terminar Sessão</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Context Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                Painel das Minhas Turmas
              </h2>
              {activeYearObj && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800">
                  {activeYearObj.name}
                </span>
              )}
            </div>
            <p className="text-slate-500 text-xs sm:text-sm mt-1">
              Selecione uma turma para gerir alunos, avaliações pedagógicas e pautas.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={openInvitationsModal}
              className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <UserPlus className="w-3.5 h-3.5 text-indigo-600" />
              <span>Convidar Colega</span>
            </button>

            <button
              type="button"
              onClick={() => setShowArchived(!showArchived)}
              className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors flex items-center gap-1.5 cursor-pointer ${
                showArchived
                  ? 'bg-slate-200 border-slate-300 text-slate-800'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Archive className="w-3.5 h-3.5" />
              {showArchived ? 'Ocultar Arquivadas' : 'Ver Arquivadas'}
            </button>

            <button
              type="button"
              onClick={() => setIsAddClassOpen(true)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs sm:text-sm rounded-xl shadow-md shadow-indigo-600/20 transition-all flex items-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Adicionar Turma
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium flex items-center gap-2">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Classes Grid */}
        {loading ? (
          <div className="py-20 text-center text-slate-400 text-sm">
            A carregar as turmas do ano letivo...
          </div>
        ) : visibleClasses.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center max-w-lg mx-auto shadow-xs">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-4">
              <Layers className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-1">Nenhuma turma registada</h3>
            <p className="text-xs text-slate-500 mb-6">
              Ainda não tem turmas configuradas neste ano letivo ({activeYearObj?.name || 'ativo'}).
            </p>
            <button
              onClick={() => setIsAddClassOpen(true)}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-md cursor-pointer inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Criar a Primeira Turma
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {visibleClasses.map((cls) => {
              const isRegular = cls.education_type === 'regular';
              return (
                <div
                  key={cls.id}
                  onClick={() => onSelectClass(cls.id)}
                  className={`group bg-white rounded-2xl border transition-all duration-200 p-6 flex flex-col justify-between hover:shadow-lg hover:border-indigo-300 cursor-pointer ${
                    cls.is_archived
                      ? 'border-slate-200 opacity-70 bg-slate-50'
                      : 'border-slate-200/90 shadow-xs'
                  }`}
                >
                  <div>
                    {/* Top Badges */}
                    <div className="flex items-center justify-between mb-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                          isRegular
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-amber-50 text-amber-800 border border-amber-200'
                        }`}
                      >
                        {isRegular ? <BookOpen className="w-3 h-3" /> : <Briefcase className="w-3 h-3" />}
                        {isRegular ? 'Ensino Regular (TIC)' : 'Ensino Profissional'}
                      </span>

                      {cls.is_archived ? (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-200 text-slate-600">
                          Arquivada
                        </span>
                      ) : (
                        <span className="text-xs font-mono font-medium text-slate-400">
                          Escala: {cls.default_scale}
                        </span>
                      )}
                    </div>

                    {/* Class Title & Info */}
                    <h3 className="text-xl font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                      {cls.name}
                    </h3>
                    <p className="text-xs font-medium text-slate-500 mt-1">
                      {cls.grade_level} {cls.course_name ? `• ${cls.course_name}` : ''}
                    </p>

                    {/* Pedagogical structure quick indicator */}
                    <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-500 space-y-1">
                      {isRegular ? (
                        <div className="flex items-center gap-1.5 text-blue-900">
                          <span className="font-semibold">Disciplina:</span>
                          <span className="bg-blue-50 px-2 py-0.5 rounded text-blue-700 font-bold">TIC</span>
                          <span>(1.º, 2.º e 3.º Períodos)</span>
                        </div>
                      ) : (
                        <div className="text-amber-900 font-medium">
                          <span>Unidades Curriculares & Módulos</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Footer */}
                  <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                      <Users className="w-4 h-4 text-slate-400" />
                      <span>{cls.active_students_count ?? 0} alunos ativos</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => handleArchiveClass(cls.id, cls.is_archived, e)}
                        className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors"
                        title={cls.is_archived ? 'Desarquivar turma' : 'Arquivar turma'}
                      >
                        <Archive className="w-3.5 h-3.5" />
                      </button>
                      <div className="w-7 h-7 rounded-full bg-slate-100 group-hover:bg-indigo-600 group-hover:text-white text-slate-600 flex items-center justify-center transition-colors">
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* MODAL: ADICIONAR TURMA */}
      {isAddClassOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Adicionar Nova Turma</h3>
            <p className="text-xs text-slate-500 mb-5">
              Ano Letivo: <strong>{activeYearObj?.name}</strong>
            </p>

            <form onSubmit={handleCreateClass} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Designação da Turma *
                </label>
                <input
                  type="text"
                  required
                  value={newClassName}
                  onChange={(e) => setNewClassName(e.target.value)}
                  placeholder="Ex: 8.º B ou 11.º TGPSI"
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Ano de Escolaridade *
                </label>
                <input
                  type="text"
                  required
                  value={newGradeLevel}
                  onChange={(e) => setNewGradeLevel(e.target.value)}
                  placeholder="Ex: 8.º Ano ou 11.º Ano"
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tipo de Ensino *
                </label>
                <select
                  value={newEduType}
                  onChange={(e) => {
                    const type = e.target.value as EducationType;
                    setNewEduType(type);
                    setNewScale(type === 'regular' ? '1-5' : '0-20');
                  }}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white cursor-pointer"
                >
                  <option value="regular">Ensino Regular (TIC com 3 Períodos)</option>
                  <option value="professional">Ensino Profissional (Unidades Curriculares e Módulos)</option>
                </select>
              </div>

              {newEduType === 'professional' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nome do Curso (opcional)
                  </label>
                  <input
                    type="text"
                    value={newCourseName}
                    onChange={(e) => setNewCourseName(e.target.value)}
                    placeholder="Ex: Técnico de Multimédia"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Escala de Classificação Padrão:
                </label>
                <div className="flex gap-4 text-xs text-slate-700">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="newClassScale"
                      checked={newScale === '1-5'}
                      onChange={() => setNewScale('1-5')}
                    />
                    1 a 5
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="newClassScale"
                      checked={newScale === '0-20'}
                      onChange={() => setNewScale('0-20')}
                    />
                    0 a 20
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="newClassScale"
                      checked={newScale === '0-100'}
                      onChange={() => setNewScale('0-100')}
                    />
                    0 a 100
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddClassOpen(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg text-xs font-medium cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow cursor-pointer"
                >
                  Criar Turma
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADICIONAR ANO LETIVO */}
      {isAddYearOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 border border-slate-100">
            <h3 className="text-base font-bold text-slate-900 mb-1">Criar Novo Ano Letivo</h3>
            <p className="text-xs text-slate-500 mb-4">
              Introduza a designação oficial (ex: 2027/2028). O novo ano ficará ativo automaticamente.
            </p>

            <form onSubmit={handleCreateYear} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Ano Letivo *
                </label>
                <input
                  type="text"
                  required
                  value={newYearName}
                  onChange={(e) => setNewYearName(e.target.value)}
                  placeholder="2027/2028"
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddYearOpen(false)}
                  className="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg text-xs font-medium cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow cursor-pointer"
                >
                  Criar Ano
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: GERIR CONVITES */}
      {isInvitationsModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 sm:p-7 border border-slate-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0 border border-indigo-100">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900">
                    Convidar Colegas Professores
                  </h3>
                  <p className="text-xs text-slate-500">
                    Disponibilize acesso seguro a outros docentes sem expor o registo público.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsInvitationsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {inviteSuccessMsg && (
              <div className="mb-4 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{inviteSuccessMsg}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setInviteSuccessMsg(null)}
                  className="text-emerald-700 hover:text-emerald-900 font-bold text-xs"
                >
                  Fechar
                </button>
              </div>
            )}

            {inviteError && (
              <div className="mb-4 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{inviteError}</span>
              </div>
            )}

            {/* Gerar Novo Convite */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/80 mb-6">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2 flex items-center gap-1.5">
                <Ticket className="w-3.5 h-3.5 text-indigo-600" />
                Gerar Novo Código de Convite
              </h4>
              <form onSubmit={handleCreateInvite} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                <div className="sm:col-span-6">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Email do Professor (opcional)
                  </label>
                  <input
                    type="email"
                    value={newInviteEmail}
                    onChange={(e) => setNewInviteEmail(e.target.value)}
                    placeholder="colega@escola.pt (deixe vazio para livre uso)"
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Validade
                  </label>
                  <select
                    value={newInviteDays}
                    onChange={(e) => setNewInviteDays(Number(e.target.value))}
                    className="w-full px-2.5 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value={7}>7 dias</option>
                    <option value={15}>15 dias</option>
                    <option value={30}>30 dias</option>
                  </select>
                </div>
                <div className="sm:col-span-3">
                  <button
                    type="submit"
                    className="w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-lg shadow-sm transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Criar Convite
                  </button>
                </div>
              </form>
            </div>

            {/* Lista de Convites Emitidos */}
            <div className="mb-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2.5">
                Convites Emitidos por Si ({invitations.length})
              </h4>

              {loadingInvites ? (
                <div className="py-6 text-center text-xs text-slate-400">A carregar convites...</div>
              ) : invitations.length === 0 ? (
                <div className="py-8 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl text-slate-400 text-xs">
                  Ainda não emitiu nenhum convite. Utilize o formulário acima para gerar o primeiro.
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-100 text-slate-600 text-[11px] font-semibold border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2.5">Código</th>
                        <th className="px-3 py-2.5">Destinatário</th>
                        <th className="px-3 py-2.5">Validade</th>
                        <th className="px-3 py-2.5">Estado</th>
                        <th className="px-3 py-2.5 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {invitations.map((inv) => {
                        const isUsed = !!inv.used_at;
                        const isExpired = !isUsed && new Date(inv.expires_at).getTime() < Date.now();
                        const isAvailable = !isUsed && !isExpired;

                        return (
                          <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-3 py-2.5 font-mono font-bold text-slate-900 tracking-wider">
                              {inv.code}
                            </td>
                            <td className="px-3 py-2.5 text-slate-600">
                              {inv.recipient_email || <span className="text-slate-400 italic">Qualquer docente</span>}
                            </td>
                            <td className="px-3 py-2.5 text-slate-500 text-[11px]">
                              {new Date(inv.expires_at).toLocaleDateString('pt-PT')}
                            </td>
                            <td className="px-3 py-2.5">
                              {isUsed ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                                  <Check className="w-3 h-3" />
                                  Utilizado {inv.used_by_name ? `(${inv.used_by_name})` : ''}
                                </span>
                              ) : isExpired ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-200 text-slate-600">
                                  <Clock className="w-3 h-3" /> Expirado
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-100 text-indigo-800">
                                  Disponível
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {isAvailable && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleCopyLink(inv.code)}
                                      className={`p-1.5 rounded-lg border text-[11px] font-medium transition-colors flex items-center gap-1 cursor-pointer ${
                                        copiedCode === inv.code
                                          ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                                          : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                                      }`}
                                      title="Copiar ligação direta de registo"
                                    >
                                      {copiedCode === inv.code ? (
                                        <>
                                          <Check className="w-3 h-3 text-emerald-600" />
                                          <span className="text-[10px] text-emerald-700">Copiado</span>
                                        </>
                                      ) : (
                                        <>
                                          <Copy className="w-3 h-3 text-slate-500" />
                                          <span className="text-[10px]">Copiar Link</span>
                                        </>
                                      )}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleRevokeInvite(inv.id)}
                                      className="p-1.5 rounded-lg border border-slate-200 hover:bg-rose-50 hover:border-rose-200 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                                      title="Revogar este convite"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Aviso de Privacidade e Isolamento */}
            <div className="p-3 bg-indigo-50/60 rounded-xl border border-indigo-100/80 text-[11px] text-indigo-900 leading-relaxed mb-4">
              <strong>Isolamento Total de Dados:</strong> O professor registado terá o seu próprio caderno letivo autónomo. Em circunstância alguma terá acesso às suas turmas, alunos, avaliações ou notas confidenciais.
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setIsInvitationsModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
              >
                Concluir
              </button>
            </div>
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
