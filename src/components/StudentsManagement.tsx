import React, { useState, useEffect } from 'react';
import { apiRequest } from '../api/client';
import { EnrollmentStudent, StudentStatus, TeacherComment, EducationType } from '../types';
import { parseStudentsInput } from '../utils/evaluation-logic';
import {
  Users,
  Search,
  Plus,
  ArrowUpDown,
  UserCheck,
  UserX,
  FileText,
  MessageSquare,
  Edit2,
  Trash2,
  Check,
  AlertCircle,
  Clock,
  ShieldAlert,
  GraduationCap,
  Calendar,
  X,
  Send
} from 'lucide-react';

interface StudentsManagementProps {
  classId: string;
  className: string;
  educationType: EducationType;
  students: EnrollmentStudent[];
  onRefresh: () => void;
}

export function StudentsManagement({
  classId,
  className,
  educationType,
  students,
  onRefresh,
}: StudentsManagementProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<'number' | 'name'>('number');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [error, setError] = useState<string | null>(null);

  // Add / Edit Student Modal
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingEnrollment, setEditingEnrollment] = useState<EnrollmentStudent | null>(null);
  const [stNumber, setStNumber] = useState<number>(1);
  const [stName, setStName] = useState('');
  const [stStatus, setStStatus] = useState<StudentStatus>('active');

  // Bulk Import Modal
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');

  // Ficha Individual Modal
  const [selectedStudentRecord, setSelectedStudentRecord] = useState<{
    student: any;
    enrollment: any;
    comments: TeacherComment[];
    evaluationHistory: any;
  } | null>(null);
  const [isLoadingRecord, setIsLoadingRecord] = useState(false);

  // New Comment state
  const [newCommentText, setNewCommentText] = useState('');
  const [newCommentContext, setNewCommentContext] = useState<'general' | 'regular_period' | 'professional_module'>('general');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState('');

  // Open Add modal
  const openAddModal = () => {
    const nextNum = students.length > 0 ? Math.max(...students.map((s) => s.student_number)) + 1 : 1;
    setEditingEnrollment(null);
    setStNumber(nextNum);
    setStName('');
    setStStatus('active');
    setError(null);
    setIsEditModalOpen(true);
  };

  // Open Edit modal
  const openEditModal = (student: EnrollmentStudent) => {
    setEditingEnrollment(student);
    setStNumber(student.student_number);
    setStName(student.full_name);
    setStStatus(student.status);
    setError(null);
    setIsEditModalOpen(true);
  };

  // Save Student (Add or Edit)
  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Check duplicate number
    const duplicate = students.find(
      (s) => s.student_number === stNumber && s.enrollment_id !== editingEnrollment?.enrollment_id
    );
    if (duplicate) {
      setError(`O número ${stNumber} já está atribuído a ${duplicate.full_name}. Não são permitidos números repetidos.`);
      return;
    }

    // Alert identical names
    const duplicateName = students.find(
      (s) =>
        s.full_name.trim().toLowerCase() === stName.trim().toLowerCase() &&
        s.enrollment_id !== editingEnrollment?.enrollment_id
    );
    if (duplicateName) {
      // Allowed, but we notify in the form
    }

    try {
      if (editingEnrollment) {
        await apiRequest(`/enrollments/${editingEnrollment.enrollment_id}`, {
          method: 'PUT',
          body: JSON.stringify({
            studentNumber: stNumber,
            fullName: stName.trim(),
            status: stStatus,
          }),
        });
      } else {
        await apiRequest(`/classes/${classId}/students`, {
          method: 'POST',
          body: JSON.stringify({
            studentNumber: stNumber,
            fullName: stName.trim(),
          }),
        });
      }

      setIsEditModalOpen(false);
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Erro ao guardar aluno');
    }
  };

  // Bulk import
  const handleBulkImport = async () => {
    if (!bulkText.trim()) return;
    setError(null);

    const parsed = parseStudentsInput(bulkText);
    const valid = parsed.filter((p) => p.isValid);
    if (valid.length === 0) {
      setError('Nenhum aluno válido detetado.');
      return;
    }

    try {
      await apiRequest(`/classes/${classId}/students/bulk`, {
        method: 'POST',
        body: JSON.stringify({
          parsedList: valid,
        }),
      });

      setIsBulkOpen(false);
      setBulkText('');
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Erro ao importar lista de alunos.');
    }
  };

  // Open Ficha Individual
  const openStudentRecord = async (student: EnrollmentStudent) => {
    setIsLoadingRecord(true);
    setSelectedStudentRecord(null);
    try {
      const data = await apiRequest(`/students/${student.student_id}/record?classId=${classId}`);
      setSelectedStudentRecord(data);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar ficha do aluno');
    } finally {
      setIsLoadingRecord(false);
    }
  };

  // Add Comment
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentRecord || !newCommentText.trim()) return;

    try {
      const res = await apiRequest<{ comment: TeacherComment }>('/comments', {
        method: 'POST',
        body: JSON.stringify({
          enrollmentId: selectedStudentRecord.enrollment.id,
          contextType: newCommentContext,
          text: newCommentText.trim(),
        }),
      });

      setSelectedStudentRecord((prev) =>
        prev ? { ...prev, comments: [res.comment, ...prev.comments] } : prev
      );
      setNewCommentText('');
    } catch (err: any) {
      setError(err.message || 'Erro ao adicionar comentário');
    }
  };

  // Update Comment
  const handleUpdateComment = async (commentId: string) => {
    if (!editingCommentText.trim()) return;

    try {
      const res = await apiRequest<{ comment: TeacherComment }>(`/comments/${commentId}`, {
        method: 'PUT',
        body: JSON.stringify({ text: editingCommentText.trim() }),
      });

      setSelectedStudentRecord((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          comments: prev.comments.map((c) => (c.id === commentId ? res.comment : c)),
        };
      });
      setEditingCommentId(null);
      setEditingCommentText('');
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Delete Comment
  const handleDeleteComment = async (commentId: string) => {
    try {
      await apiRequest(`/comments/${commentId}`, { method: 'DELETE' });
      setSelectedStudentRecord((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          comments: prev.comments.filter((c) => c.id !== commentId),
        };
      });
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Filter & Sort
  const filtered = students.filter((s) => {
    const q = searchTerm.toLowerCase();
    return s.full_name.toLowerCase().includes(q) || String(s.student_number).includes(q);
  });

  filtered.sort((a, b) => {
    let comparison = 0;
    if (sortField === 'number') {
      comparison = a.student_number - b.student_number;
    } else {
      comparison = a.full_name.localeCompare(b.full_name, 'pt-PT');
    }
    return sortDirection === 'asc' ? comparison : -comparison;
  });

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Gestão dos Alunos da Turma</h2>
          <p className="text-xs text-slate-500 mt-1">
            Total: {students.length} alunos ({students.filter((s) => s.status === 'active').length} ativos).
            A lista é partilhada por todas as unidades curriculares e módulos.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setIsBulkOpen(true)}
            className="px-3.5 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
          >
            Importar em Lote
          </button>
          <button
            type="button"
            onClick={openAddModal}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Adicionar Aluno
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Pesquisar por número ou nome..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
          />
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-600">
          <span className="font-semibold text-slate-500">Ordenar por:</span>
          <button
            type="button"
            onClick={() => {
              if (sortField === 'number') {
                setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
              } else {
                setSortField('number');
                setSortDirection('asc');
              }
            }}
            className={`px-2.5 py-1 rounded font-medium cursor-pointer flex items-center gap-1 ${
              sortField === 'number' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'hover:bg-slate-100'
            }`}
          >
            N.º {sortField === 'number' && (sortDirection === 'asc' ? '↑' : '↓')}
          </button>

          <button
            type="button"
            onClick={() => {
              if (sortField === 'name') {
                setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
              } else {
                setSortField('name');
                setSortDirection('asc');
              }
            }}
            className={`px-2.5 py-1 rounded font-medium cursor-pointer flex items-center gap-1 ${
              sortField === 'name' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'hover:bg-slate-100'
            }`}
          >
            Nome {sortField === 'name' && (sortDirection === 'asc' ? '↑' : '↓')}
          </button>
        </div>
      </div>

      {/* Students Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            Nenhum aluno encontrado para os critérios de pesquisa.
          </div>
        ) : (
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4 w-16 text-center">N.º</th>
                <th className="py-3 px-4">Nome do Aluno</th>
                <th className="py-3 px-4 w-32 text-center">Estado</th>
                <th className="py-3 px-4 w-48 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((st) => (
                <tr key={st.enrollment_id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 px-4 text-center font-mono font-bold text-slate-700">
                    {st.student_number}
                  </td>
                  <td className="py-3 px-4 font-semibold text-slate-900">
                    {st.full_name}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        st.status === 'active'
                          ? 'bg-emerald-50 text-emerald-800'
                          : st.status === 'transferred'
                          ? 'bg-amber-50 text-amber-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {st.status === 'active'
                        ? 'Ativo'
                        : st.status === 'transferred'
                        ? 'Transferido'
                        : 'Inativo'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openStudentRecord(st)}
                        className="px-2.5 py-1 text-indigo-700 hover:bg-indigo-50 border border-indigo-200 rounded-lg font-semibold inline-flex items-center gap-1 cursor-pointer"
                        title="Ver Ficha Individual e Comentários Privados"
                      >
                        <FileText className="w-3.5 h-3.5" /> Ficha Individual
                      </button>

                      <button
                        type="button"
                        onClick={() => openEditModal(st)}
                        className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
                        title="Editar aluno"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* MODAL: ADICIONAR / EDITAR ALUNO */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 border border-slate-100">
            <h3 className="text-base font-bold text-slate-900 mb-1">
              {editingEnrollment ? 'Editar Aluno' : 'Adicionar Novo Aluno'}
            </h3>
            <p className="text-xs text-slate-500 mb-4">Turma: {className}</p>

            <form onSubmit={handleSaveStudent} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Número de Aluno na Turma *
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  value={stNumber}
                  onChange={(e) => setStNumber(parseInt(e.target.value, 10) || 1)}
                  className="w-full px-3 py-2 text-sm font-mono font-bold bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  required
                  value={stName}
                  onChange={(e) => setStName(e.target.value)}
                  placeholder="Nome do aluno"
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                />
              </div>

              {editingEnrollment && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Estado do Aluno na Turma
                  </label>
                  <select
                    value={stStatus}
                    onChange={(e) => setStStatus(e.target.value as StudentStatus)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white cursor-pointer"
                  >
                    <option value="active">Ativo</option>
                    <option value="transferred">Transferido</option>
                    <option value="inactive">Inativo</option>
                  </select>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Nota: Ao alterar o estado para inativo ou transferido, as avaliações nunca são apagadas.
                  </p>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg text-xs font-medium cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow cursor-pointer"
                >
                  Gravar Aluno
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: IMPORTAR EM LOTE */}
      {isBulkOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 border border-slate-100 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Importar Lista de Alunos</h3>
            <p className="text-xs text-slate-500">
              Cole a lista com um aluno por linha (ex: «1; Afonso Fernandes» ou «1 - Afonso Fernandes»).
            </p>

            <textarea
              rows={6}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder="1; Afonso Fernandes&#10;2; Beatriz Costa&#10;3; Carolina Martins"
              className="w-full p-3 font-mono text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
            />

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsBulkOpen(false)}
                className="px-3.5 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg text-xs font-medium cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleBulkImport}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow cursor-pointer"
              >
                Importar Lista
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL / DRAWER: FICHA INDIVIDUAL DO ALUNO */}
      {selectedStudentRecord && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 sm:p-7 border border-slate-100 my-8 space-y-6 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-200 pb-4">
              <div>
                <span className="text-xs font-mono font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-md">
                  N.º {selectedStudentRecord.enrollment.student_number}
                </span>
                <h3 className="text-xl font-extrabold text-slate-900 mt-2">
                  {selectedStudentRecord.student.full_name}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Turma: {selectedStudentRecord.enrollment.class_name} • Ano Letivo: {selectedStudentRecord.enrollment.academic_year_name}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedStudentRecord(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Academic History Record */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Registo de Avaliações
              </h4>

              {/* REGULAR TIC 3 PERIODS */}
              {educationType === 'regular' && selectedStudentRecord.evaluationHistory.periods && (
                <div className="space-y-3">
                  {selectedStudentRecord.evaluationHistory.periods.map((pData: any) => (
                    <div key={pData.period.id} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-xs text-slate-900">{pData.period.name}</span>
                        <div className="text-xs">
                          <span className="text-slate-500">Nota Final: </span>
                          <span className="font-mono font-extrabold text-indigo-700">
                            {pData.finalGrade?.final_grade_value !== null && pData.finalGrade?.final_grade_value !== undefined
                              ? pData.finalGrade.final_grade_value
                              : 'N/D'}
                          </span>
                        </div>
                      </div>

                      {pData.results && pData.results.length > 0 ? (
                        <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 pt-2 border-t border-slate-200/60">
                          {pData.results.map((r: any) => (
                            <div key={r.id} className="flex justify-between bg-white p-1.5 rounded border border-slate-100">
                              <span className="truncate pr-1">{r.instrument_title}:</span>
                              <span className="font-mono font-bold text-slate-800">
                                {r.score_value !== null ? r.score_value : r.special_status || '—'}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-400 italic">Sem instrumentos avaliados neste período.</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* PROFESSIONAL UCS & MODULES */}
              {educationType === 'professional' && selectedStudentRecord.evaluationHistory.ucs && (
                <div className="space-y-4">
                  {selectedStudentRecord.evaluationHistory.ucs.map((ucItem: any) => (
                    <div key={ucItem.uc.id} className="border border-slate-200 rounded-xl p-3.5 bg-slate-50 space-y-2">
                      <div className="font-bold text-xs text-slate-900">
                        {ucItem.uc.code ? `[${ucItem.uc.code}] ` : ''} {ucItem.uc.name}
                      </div>

                      <div className="space-y-2">
                        {ucItem.modules.map((mItem: any) => (
                          <div key={mItem.module.id} className="bg-white p-2.5 rounded-lg border border-slate-200 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-slate-800">
                                {mItem.module.code_or_number} — {mItem.module.name}
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-slate-900">
                                  {mItem.finalGrade?.final_grade_value ?? '—'}
                                </span>
                                <span
                                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                                    mItem.finalGrade?.status === 'aprovado'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : mItem.finalGrade?.status === 'reprovado'
                                      ? 'bg-rose-100 text-rose-800'
                                      : 'bg-slate-100 text-slate-600'
                                  }`}
                                >
                                  {mItem.finalGrade?.status === 'aprovado'
                                    ? 'Aprovado'
                                    : mItem.finalGrade?.status === 'reprovado'
                                    ? 'Reprovado'
                                    : 'Em curso'}
                                </span>
                              </div>
                            </div>

                            {/* Show recoveries if any */}
                            {mItem.recoveries && mItem.recoveries.length > 0 && (
                              <div className="mt-2 pt-2 border-t border-slate-100 text-[11px] text-indigo-900 bg-indigo-50/50 p-1.5 rounded">
                                <span className="font-bold">Recuperações: </span>
                                {mItem.recoveries.map((rec: any) => (
                                  <span key={rec.id} className="mr-3">
                                    Tentativa {rec.attempt_number}: {rec.score_value} val. ({rec.date})
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* PRIVATE TEACHER COMMENTS SECTION */}
            <div className="space-y-3 pt-4 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700">
                  <MessageSquare className="w-4 h-4 text-indigo-600" />
                  <span>Comentários Pedagógicos Privados</span>
                </div>
                <span className="text-[10px] text-slate-400 font-semibold bg-slate-100 px-2 py-0.5 rounded">
                  Excluídos das Pautas
                </span>
              </div>

              {/* Add comment form */}
              <form onSubmit={handleAddComment} className="space-y-2">
                <textarea
                  rows={2}
                  required
                  value={newCommentText}
                  onChange={(e) => setNewCommentText(e.target.value)}
                  placeholder="Registar nota privada sobre o aluno (comportamento, evolução, plano de apoio)..."
                  className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                />
                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <Send className="w-3 h-3" /> Registar Comentário
                  </button>
                </div>
              </form>

              {/* Comments list */}
              <div className="space-y-2 max-h-44 overflow-y-auto pt-1">
                {selectedStudentRecord.comments.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-2">Nenhum comentário privado registado para este aluno.</p>
                ) : (
                  selectedStudentRecord.comments.map((c) => (
                    <div key={c.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span className="font-semibold text-slate-600">
                          {c.created_at ? new Date(c.created_at).toLocaleDateString('pt-PT') : ''}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCommentId(c.id);
                              setEditingCommentText(c.text);
                            }}
                            className="text-slate-400 hover:text-indigo-600 cursor-pointer"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteComment(c.id)}
                            className="text-slate-400 hover:text-rose-600 cursor-pointer"
                          >
                            Eliminar
                          </button>
                        </div>
                      </div>

                      {editingCommentId === c.id ? (
                        <div className="space-y-1.5 pt-1">
                          <input
                            type="text"
                            value={editingCommentText}
                            onChange={(e) => setEditingCommentText(e.target.value)}
                            className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-xs"
                          />
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => setEditingCommentId(null)}
                              className="px-2 py-0.5 text-[11px] border border-slate-200 rounded"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUpdateComment(c.id)}
                              className="px-2 py-0.5 text-[11px] bg-indigo-600 text-white rounded"
                            >
                              Guardar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-slate-800 leading-relaxed">{c.text}</p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
