import React, { useState, useEffect } from 'react';
import { apiRequest } from '../api/client';
import { LessonSummary, Teacher } from '../types';
import {
  BookOpen,
  Plus,
  Calendar,
  Edit2,
  Trash2,
  Download,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  FileText,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface LessonSummariesViewProps {
  classId: string;
  className: string;
  gradeLevel: string;
  courseName?: string | null;
  teacher: Teacher;
}

export function LessonSummariesView({
  classId,
  className,
  gradeLevel,
  courseName,
  teacher,
}: LessonSummariesViewProps) {
  const [summaries, setSummaries] = useState<LessonSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingSummaryId, setEditingSummaryId] = useState<string | null>(null);
  const [lessonNumber, setLessonNumber] = useState<number>(1);
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [title, setTitle] = useState<string>('');
  const [summaryText, setSummaryText] = useState<string>('');
  const [moduleOrDomain, setModuleOrDomain] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);

  const loadSummaries = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiRequest<{ summaries: LessonSummary[] }>(`/classes/${classId}/summaries`);
      setSummaries(data.summaries || []);

      if (data.summaries && data.summaries.length > 0) {
        const maxLesson = Math.max(...data.summaries.map((s) => s.lesson_number));
        setLessonNumber(maxLesson + 1);
      } else {
        setLessonNumber(1);
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar sumários.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSummaries();
  }, [classId]);

  const openCreateModal = () => {
    setEditingSummaryId(null);
    setDate(new Date().toISOString().slice(0, 10));
    const nextLesson = summaries.length > 0 ? Math.max(...summaries.map((s) => s.lesson_number)) + 1 : 1;
    setLessonNumber(nextLesson);
    setTitle('');
    setSummaryText('');
    setModuleOrDomain('');
    setIsModalOpen(true);
  };

  const openEditModal = (summary: LessonSummary) => {
    setEditingSummaryId(summary.id);
    setDate(summary.date);
    setLessonNumber(summary.lesson_number);
    setTitle(summary.title);
    setSummaryText(summary.summary_text);
    setModuleOrDomain(summary.module_or_domain || '');
    setIsModalOpen(true);
  };

  const handleSaveSummary = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      if (editingSummaryId) {
        await apiRequest(`/summaries/${editingSummaryId}`, {
          method: 'PUT',
          body: JSON.stringify({
            lessonNumber,
            date,
            title,
            summaryText,
            moduleOrDomain,
          }),
        });
      } else {
        await apiRequest(`/classes/${classId}/summaries`, {
          method: 'POST',
          body: JSON.stringify({
            lessonNumber,
            date,
            title,
            summaryText,
            moduleOrDomain,
          }),
        });
      }

      setIsModalOpen(false);
      await loadSummaries();
    } catch (err: any) {
      setError(err.message || 'Erro ao guardar sumário.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSummary = async (summaryId: string) => {
    if (!window.confirm('Tem a certeza que deseja eliminar este sumário?')) return;
    try {
      await apiRequest(`/summaries/${summaryId}`, { method: 'DELETE' });
      await loadSummaries();
    } catch (err: any) {
      setError(err.message || 'Erro ao eliminar sumário.');
    }
  };

  // Export Livro de Sumários em PDF
  const handleExportPdf = () => {
    const doc = new jsPDF({
      orientation: 'portrait',
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
    doc.text(`Livro de Registo de Sumários — ${className}`, 14, 18);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(`Escola: ${teacher.school || 'Agrupamento de Escolas Gabriel Pereira - Évora'}`, 14, 24);
    doc.text(`Professor(a): ${teacher.name}`, 14, 29);

    doc.text(`Ano Letivo: 2026/2027`, pageWidth - 14, 24, { align: 'right' });
    const classDetail = courseName ? `Turma: ${className} (${courseName})` : `Turma: ${className}`;
    doc.text(classDetail, pageWidth - 14, 29, { align: 'right' });

    // Table rows
    const headers = ['Lição N.º', 'Data', 'Módulo / Domínio', 'Tema & Conteúdos Sumariados'];
    const body = summaries.map((s) => [
      `N.º ${s.lesson_number}`,
      s.date,
      s.module_or_domain || '—',
      `${s.title}\n${s.summary_text}`,
    ]);

    autoTable(doc, {
      head: [headers],
      body,
      startY: 34,
      styles: {
        fontSize: 8.5,
        cellPadding: 3,
      },
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: 255,
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 20, fontStyle: 'bold' },
        1: { halign: 'center', cellWidth: 24 },
        2: { halign: 'left', cellWidth: 38 },
        3: { halign: 'left' },
      },
      margin: { left: 14, right: 14, bottom: 20 },
    });

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

    doc.save(`Sumarios_${className.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const filteredSummaries = summaries.filter((s) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.title.toLowerCase().includes(q) ||
      s.summary_text.toLowerCase().includes(q) ||
      (s.module_or_domain && s.module_or_domain.toLowerCase().includes(q)) ||
      String(s.lesson_number).includes(q)
    );
  });

  if (loading) {
    return <div className="p-8 text-center text-slate-400 text-sm">A carregar livro de sumários...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
              Registo de Sumários & Planificação de Aulas
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono">
              {summaries.length} Lições
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Diário cronológico de conteúdos lecionados, atividades e tarefas realizadas.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportPdf}
            className="px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors inline-flex items-center gap-1.5 shadow-2xs cursor-pointer"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>Livro de Sumários (PDF)</span>
          </button>

          <button
            type="button"
            onClick={openCreateModal}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-sm transition-all inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Escrever Sumário</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Search Bar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Pesquisar por conteúdo, tema ou lição..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Summaries List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {filteredSummaries.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            Nenhum sumário encontrado. Clique em «Escrever Sumário» para registar a primeira lição.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredSummaries.map((s) => (
              <div key={s.id} className="p-5 hover:bg-slate-50/70 transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 flex flex-col items-center justify-center text-indigo-900 shrink-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider">Lição</span>
                      <span className="text-lg font-extrabold font-mono leading-none">{s.lesson_number}</span>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          {s.date}
                        </span>
                        {s.module_or_domain && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100/70 text-indigo-800 border border-indigo-200">
                            {s.module_or_domain}
                          </span>
                        )}
                      </div>

                      <h3 className="text-sm font-bold text-slate-900 leading-snug">
                        {s.title}
                      </h3>

                      <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line pt-1">
                        {s.summary_text}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-start">
                    <button
                      type="button"
                      onClick={() => openEditModal(s)}
                      className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg cursor-pointer"
                      title="Editar sumário"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteSummary(s.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                      title="Eliminar sumário"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal: Escrever / Editar Sumário */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-xl w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900">
                  {editingSummaryId ? 'Editar Sumário da Lição' : 'Registar Novo Sumário de Aula'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveSummary} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">N.º da Lição *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={lessonNumber}
                    onChange={(e) => setLessonNumber(parseInt(e.target.value, 10) || 1)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Data *</label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Módulo ou Domínio Curricular (opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Domínio: Segurança e Redes / M02: Folha de Cálculo"
                  value={moduleOrDomain}
                  onChange={(e) => setModuleOrDomain(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Título do Sumário *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Introdução às fórmulas e funções na folha de cálculo"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Conteúdos e Atividades Desenvolvidas (Texto do Sumário) *
                </label>
                <textarea
                  rows={4}
                  required
                  placeholder="Ex: Apresentação teórica dos conceitos de célula, intervalo e operador. Resolução guiada dos exercícios práticos 1 a 4. Esclarecimento de dúvidas individuais."
                  value={summaryText}
                  onChange={(e) => setSummaryText(e.target.value)}
                  className="w-full p-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-medium cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow cursor-pointer transition-colors"
                >
                  {saving ? 'A gravar...' : 'Gravar Sumário'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
