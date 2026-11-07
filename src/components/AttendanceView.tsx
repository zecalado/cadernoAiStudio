import React, { useState, useEffect } from 'react';
import { apiRequest } from '../api/client';
import {
  AttendanceSession,
  StudentAttendanceSummary,
  AttendanceStatus,
  EnrollmentStudent,
  Teacher,
} from '../types';
import {
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Plus,
  Trash2,
  FileText,
  UserCheck,
  UserX,
  HelpCircle,
  Filter,
  Check,
  Download,
  AlertCircle,
  History,
  BookOpen,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface AttendanceViewProps {
  classId: string;
  className: string;
  gradeLevel: string;
  courseName?: string | null;
  teacher: Teacher;
  students: EnrollmentStudent[];
}

export function AttendanceView({
  classId,
  className,
  gradeLevel,
  courseName,
  teacher,
  students,
}: AttendanceViewProps) {
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [studentSummaries, setStudentSummaries] = useState<StudentAttendanceSummary[]>([]);
  const [totalSessions, setTotalSessions] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Tab mode: 'summary' (grelha acumulada) | 'new_session' (registo de aula) | 'history' (histórico)
  const [viewMode, setViewMode] = useState<'summary' | 'new_session' | 'history'>('summary');

  // Form state for creating a new session
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [sessionDate, setSessionDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [lessonNumber, setLessonNumber] = useState<number>(1);
  const [durationBlocks, setDurationBlocks] = useState<number>(2); // standard 90 min (2 x 45-50 min)
  const [sessionRecords, setSessionRecords] = useState<Record<string, { status: AttendanceStatus; notes: string }>>({});
  const [savingSession, setSavingSession] = useState<boolean>(false);

  const loadAttendanceData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiRequest<{
        sessions: AttendanceSession[];
        studentSummaries: StudentAttendanceSummary[];
        totalSessions: number;
      }>(`/classes/${classId}/attendance`);

      setSessions(data.sessions || []);
      setStudentSummaries(data.studentSummaries || []);
      setTotalSessions(data.totalSessions || 0);

      // Auto-set next lesson number
      if (data.sessions && data.sessions.length > 0) {
        const maxLesson = Math.max(...data.sessions.map((s) => s.lesson_number));
        setLessonNumber(maxLesson + 1);
      } else {
        setLessonNumber(1);
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar assiduidade.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAttendanceData();
  }, [classId]);

  // Initialize new session records
  const initNewSession = () => {
    const initialRecords: Record<string, { status: AttendanceStatus; notes: string }> = {};
    students.forEach((st) => {
      initialRecords[st.enrollment_id] = {
        status: 'present',
        notes: '',
      };
    });
    setSessionRecords(initialRecords);
    setEditingSessionId(null);
    setSessionDate(new Date().toISOString().slice(0, 10));

    const nextLesson = sessions.length > 0 ? Math.max(...sessions.map((s) => s.lesson_number)) + 1 : 1;
    setLessonNumber(nextLesson);
    setViewMode('new_session');
  };

  // Edit an existing session
  const openEditSession = (session: AttendanceSession) => {
    setEditingSessionId(session.id);
    setSessionDate(session.date);
    setLessonNumber(session.lesson_number);
    setDurationBlocks(session.duration_blocks);

    const recordsMap: Record<string, { status: AttendanceStatus; notes: string }> = {};
    students.forEach((st) => {
      const existing = (session.records || []).find((r) => r.enrollment_id === st.enrollment_id);
      recordsMap[st.enrollment_id] = {
        status: existing ? existing.status : 'present',
        notes: existing?.notes || '',
      };
    });
    setSessionRecords(recordsMap);
    setViewMode('new_session');
  };

  const handleMarkAllPresent = () => {
    const updated = { ...sessionRecords };
    Object.keys(updated).forEach((key) => {
      updated[key] = { ...updated[key], status: 'present' };
    });
    setSessionRecords(updated);
  };

  const setStudentStatus = (enrollmentId: string, status: AttendanceStatus) => {
    setSessionRecords((prev) => ({
      ...prev,
      [enrollmentId]: {
        ...(prev[enrollmentId] || { notes: '' }),
        status,
      },
    }));
  };

  const setStudentNote = (enrollmentId: string, notes: string) => {
    setSessionRecords((prev) => ({
      ...prev,
      [enrollmentId]: {
        ...(prev[enrollmentId] || { status: 'present' }),
        notes,
      },
    }));
  };

  const handleSaveSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSession(true);
    setError(null);

    try {
      const recordsPayload = Object.entries(sessionRecords).map(([enrollmentId, data]) => ({
        enrollmentId,
        status: data.status,
        notes: data.notes,
      }));

      await apiRequest(`/classes/${classId}/attendance`, {
        method: 'POST',
        body: JSON.stringify({
          sessionId: editingSessionId,
          date: sessionDate,
          lessonNumber,
          durationBlocks,
          records: recordsPayload,
        }),
      });

      await loadAttendanceData();
      setViewMode('summary');
    } catch (err: any) {
      setError(err.message || 'Erro ao guardar assiduidade.');
    } finally {
      setSavingSession(false);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!window.confirm('Tem a certeza que deseja eliminar o registo desta aula?')) return;
    try {
      await apiRequest(`/attendance-sessions/${sessionId}`, { method: 'DELETE' });
      await loadAttendanceData();
    } catch (err: any) {
      setError(err.message || 'Erro ao eliminar sessão.');
    }
  };

  // PDF Export of Attendance Sheet
  const handleExportPdf = () => {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const dateFormatted = new Date().toLocaleDateString('pt-PT');

    // Header bar
    doc.setFillColor(30, 41, 59);
    doc.rect(14, 10, pageWidth - 28, 1.5, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(30, 41, 59);
    doc.text(`Registo e Mapa Global de Assiduidade — ${className}`, 14, 18);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(`Escola: ${teacher.school || 'Agrupamento de Escolas Gabriel Pereira - Évora'}`, 14, 24);
    doc.text(`Professor(a): ${teacher.name}`, 14, 29);

    doc.text(`Ano Letivo: 2026/2027`, pageWidth - 14, 24, { align: 'right' });
    doc.text(`Total de Aulas Registadas: ${totalSessions}`, pageWidth - 14, 29, { align: 'right' });

    // Table data
    const headers = [
      'N.º',
      'Nome do Aluno',
      'Presenças',
      'Faltas Just. (FJ)',
      'Faltas Injust. (FI)',
      'Atrasos (A)',
      'F. Material (FM)',
      '% Assiduidade',
      'Situação Estatutária',
    ];

    const body = studentSummaries.map((st) => [
      st.student_number,
      st.student_name,
      st.present_count,
      st.justified_count,
      st.unjustified_count,
      st.late_count,
      st.material_missing_count,
      `${st.attendance_percentage}%`,
      st.is_limit_exceeded
        ? 'LIMITE EXCEDIDO (Art. 21.º)'
        : st.is_warning
        ? 'EM ALERTA DE FALTAS'
        : 'Regular / Cumpre',
    ]);

    autoTable(doc, {
      head: [headers],
      body,
      startY: 34,
      styles: {
        fontSize: 8.5,
        cellPadding: 2,
      },
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: 255,
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 14 },
        1: { halign: 'left', cellWidth: 60 },
        2: { halign: 'center' },
        3: { halign: 'center' },
        4: { halign: 'center' },
        5: { halign: 'center' },
        6: { halign: 'center' },
        7: { halign: 'center', fontStyle: 'bold' },
        8: { halign: 'center' },
      },
      margin: { left: 14, right: 14, bottom: 20 },
    });

    // Footer
    const totalPages = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);
      doc.text(
        `Caderno Letivo • AEGP • Desenvolvido por José Calado • Emitido em ${dateFormatted}`,
        14,
        pageHeight - 6
      );
      doc.text(`Página ${i} de ${totalPages}`, pageWidth - 14, pageHeight - 6, { align: 'right' });
    }

    doc.save(`Assiduidade_${className.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  // Global attendance average
  const globalAverage =
    studentSummaries.length > 0
      ? Math.round(
          studentSummaries.reduce((acc, curr) => acc + curr.attendance_percentage, 0) /
            studentSummaries.length
        )
      : 100;

  const warningCount = studentSummaries.filter((s) => s.is_warning || s.is_limit_exceeded).length;

  if (loading) {
    return <div className="p-8 text-center text-slate-400 text-sm">A carregar registos de assiduidade...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Top Controls & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
              Controlo de Assiduidade e Faltas
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
              Estatuto do Aluno
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Registo de presenças, faltas justificadas, injustificadas e monitorização de limites legais.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportPdf}
            className="px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors inline-flex items-center gap-1.5 shadow-2xs cursor-pointer"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>Mapa em PDF</span>
          </button>

          <button
            type="button"
            onClick={initNewSession}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-sm transition-all inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Registar Aula</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="p-3 rounded-xl bg-indigo-50 text-indigo-700">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-400">Total de Aulas Registadas</div>
            <div className="text-2xl font-extrabold text-slate-900 font-mono">{totalSessions}</div>
            <div className="text-[11px] text-slate-500">sessões letivas concluídas</div>
          </div>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="p-3 rounded-xl bg-emerald-50 text-emerald-700">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-400">Média Global de Assiduidade</div>
            <div className="text-2xl font-extrabold text-emerald-600 font-mono">{globalAverage}%</div>
            <div className="text-[11px] text-slate-500">taxa de presença da turma</div>
          </div>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className={`p-3 rounded-xl ${warningCount > 0 ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-400">Alunos em Alerta de Faltas</div>
            <div className={`text-2xl font-extrabold font-mono ${warningCount > 0 ? 'text-amber-600' : 'text-slate-900'}`}>
              {warningCount}
            </div>
            <div className="text-[11px] text-slate-500">
              {warningCount === 0 ? 'Nenhum aluno em risco' : 'requer atenção / intervenção'}
            </div>
          </div>
        </div>
      </div>

      {/* Sub-Tabs: Acumulado vs Histórico */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setViewMode('summary')}
          className={`py-2.5 px-4 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
            viewMode === 'summary'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Grelha Acumulada da Turma
        </button>

        <button
          type="button"
          onClick={() => setViewMode('history')}
          className={`py-2.5 px-4 text-xs font-bold border-b-2 transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
            viewMode === 'history'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>Histórico de Aulas ({sessions.length})</span>
        </button>
      </div>

      {/* VIEW 1: GRELHA ACUMULADA */}
      {viewMode === 'summary' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {studentSummaries.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs">
              Nenhum aluno matriculado nesta turma.
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-3 w-12 text-center">N.º</th>
                  <th className="py-3 px-4">Nome do Aluno</th>
                  <th className="py-3 px-3 text-center text-emerald-700">Presenças</th>
                  <th className="py-3 px-3 text-center text-blue-700">FJ</th>
                  <th className="py-3 px-3 text-center text-rose-700">FI</th>
                  <th className="py-3 px-3 text-center text-amber-700">Atrasos</th>
                  <th className="py-3 px-3 text-center text-purple-700">FM</th>
                  <th className="py-3 px-4 w-36 text-center">% Assiduidade</th>
                  <th className="py-3 px-4 text-center">Situação Estatutária</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {studentSummaries.map((st) => (
                  <tr key={st.enrollment_id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-700">
                      {st.student_number}
                    </td>
                    <td className="py-2.5 px-4 font-semibold text-slate-900">
                      {st.student_name}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-medium text-emerald-700">
                      {st.present_count}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-medium text-blue-700">
                      {st.justified_count}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-rose-700">
                      {st.unjustified_count}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono text-amber-700">
                      {st.late_count}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono text-purple-700">
                      {st.material_missing_count}
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              st.attendance_percentage >= 85
                                ? 'bg-emerald-500'
                                : st.attendance_percentage >= 75
                                ? 'bg-amber-500'
                                : 'bg-rose-500'
                            }`}
                            style={{ width: `${Math.min(st.attendance_percentage, 100)}%` }}
                          />
                        </div>
                        <span className="font-mono font-bold text-[11px] text-slate-700 w-10 text-right">
                          {st.attendance_percentage}%
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      {st.is_limit_exceeded ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-800 border border-rose-200">
                          <AlertTriangle className="w-3 h-3 text-rose-600" />
                          Excedeu Limite
                        </span>
                      ) : st.is_warning ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                          <Clock className="w-3 h-3 text-amber-600" />
                          Alerta de Faltas
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <Check className="w-3 h-3 text-emerald-600" />
                          Regular
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="p-3 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <span className="font-semibold text-slate-700">Legenda:</span>
              <span><strong>FJ:</strong> Falta Justificada</span>
              <span><strong>FI:</strong> Falta Injustificada</span>
              <span><strong>A:</strong> Atraso</span>
              <span><strong>FM:</strong> Falta de Material</span>
            </div>
            <span>Baseado no Estatuto do Aluno (Lei n.º 51/2012) e regime do Ensino Profissional</span>
          </div>
        </div>
      )}

      {/* VIEW 2: HISTÓRICO DE SESSÕES */}
      {viewMode === 'history' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {sessions.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs">
              Nenhuma aula registada até ao momento. Clique em «Registar Aula» para criar a primeira lição.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {sessions.map((s) => {
                const absences = (s.records || []).filter((r) => r.status !== 'present');
                return (
                  <div key={s.id} className="p-4 hover:bg-slate-50/80 transition-colors flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-100 flex flex-col items-center justify-center text-indigo-900 shrink-0">
                        <span className="text-[10px] font-bold uppercase tracking-wider">Lição</span>
                        <span className="text-base font-extrabold font-mono leading-none">{s.lesson_number}</span>
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-900">{s.date}</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600">
                            {s.duration_blocks === 1 ? '1 bloco (45-50 min)' : `${s.duration_blocks} blocos (90 min)`}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {absences.length === 0 ? (
                            <span className="text-emerald-700 font-medium">Todos os alunos estiveram presentes.</span>
                          ) : (
                            <span>
                              {absences.length} ausências ou faltas registadas:{' '}
                              {absences.map((a, i) => {
                                const stName = students.find((st) => st.enrollment_id === a.enrollment_id)?.full_name || 'Aluno';
                                return (
                                  <span key={a.id} className="font-semibold text-slate-700 mr-2">
                                    {stName.split(' ')[0]} ({a.status.toUpperCase()})
                                  </span>
                                );
                              })}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEditSession(s)}
                        className="px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 border border-indigo-200 rounded-lg cursor-pointer"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSession(s.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                        title="Eliminar lição"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* MODAL / VIEW 3: REGISTO RÁPIDO DE AULA */}
      {viewMode === 'new_session' && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {editingSessionId ? 'Editar Registo de Assiduidade' : 'Registar Presenças da Aula'}
                </h3>
                <p className="text-xs text-slate-500">
                  {className} • Marcação rápida e individual de assiduidade
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewMode('summary')}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveSession} className="flex-1 flex flex-col overflow-hidden">
              <div className="p-4 bg-slate-50/80 border-b border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Data da Aula *</label>
                  <input
                    type="date"
                    required
                    value={sessionDate}
                    onChange={(e) => setSessionDate(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">N.º da Lição *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={lessonNumber}
                    onChange={(e) => setLessonNumber(parseInt(e.target.value, 10) || 1)}
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Duração *</label>
                  <select
                    value={durationBlocks}
                    onChange={(e) => setDurationBlocks(parseInt(e.target.value, 10))}
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value={1}>1 Bloco (45-50 min)</option>
                    <option value={2}>2 Blocos / Par (90 min)</option>
                    <option value={3}>3 Blocos (135 min)</option>
                  </select>
                </div>
              </div>

              <div className="px-4 py-2.5 bg-indigo-50/50 border-b border-indigo-100 flex items-center justify-between">
                <span className="text-xs text-indigo-900 font-medium">
                  Clique nos botões de cada aluno para alterar o estado.
                </span>
                <button
                  type="button"
                  onClick={handleMarkAllPresent}
                  className="px-3 py-1 bg-white hover:bg-slate-50 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold cursor-pointer transition-colors"
                >
                  Marcar Todos Presentes
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {students.map((st) => {
                  const current = sessionRecords[st.enrollment_id] || { status: 'present', notes: '' };
                  return (
                    <div
                      key={st.enrollment_id}
                      className="p-2.5 bg-white border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-slate-300 transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="w-6 text-center font-mono font-bold text-xs text-slate-500">
                          {st.student_number}
                        </span>
                        <span className="font-semibold text-xs text-slate-900">
                          {st.full_name}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* Status buttons */}
                        <button
                          type="button"
                          onClick={() => setStudentStatus(st.enrollment_id, 'present')}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            current.status === 'present'
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          P
                        </button>

                        <button
                          type="button"
                          onClick={() => setStudentStatus(st.enrollment_id, 'unjustified')}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            current.status === 'unjustified'
                              ? 'bg-rose-600 text-white shadow-xs'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                          title="Falta Injustificada"
                        >
                          FI
                        </button>

                        <button
                          type="button"
                          onClick={() => setStudentStatus(st.enrollment_id, 'justified')}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            current.status === 'justified'
                              ? 'bg-blue-600 text-white shadow-xs'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                          title="Falta Justificada"
                        >
                          FJ
                        </button>

                        <button
                          type="button"
                          onClick={() => setStudentStatus(st.enrollment_id, 'late')}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            current.status === 'late'
                              ? 'bg-amber-600 text-white shadow-xs'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                          title="Atraso"
                        >
                          A
                        </button>

                        <button
                          type="button"
                          onClick={() => setStudentStatus(st.enrollment_id, 'material_missing')}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            current.status === 'material_missing'
                              ? 'bg-purple-600 text-white shadow-xs'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                          title="Falta de Material"
                        >
                          FM
                        </button>

                        <input
                          type="text"
                          placeholder="Nota..."
                          value={current.notes || ''}
                          onChange={(e) => setStudentNote(st.enrollment_id, e.target.value)}
                          className="w-28 px-2 py-1 text-[11px] bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setViewMode('summary')}
                  className="px-4 py-2 border border-slate-200 hover:bg-white text-slate-700 rounded-xl text-xs font-medium cursor-pointer"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={savingSession}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer transition-colors"
                >
                  {savingSession ? 'A gravar...' : 'Guardar Assiduidade da Lição'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
