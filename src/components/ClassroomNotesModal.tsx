import React, { useState, useEffect } from 'react';
import { apiRequest } from '../api/client';
import { EnrollmentStudent, ClassroomNote, ClassroomNoteCategory } from '../types';
import {
  BookOpen,
  Plus,
  Trash2,
  Calendar,
  X,
  Search,
  Filter,
  CheckCircle,
  AlertTriangle,
  FileText,
  User,
  MessageSquare
} from 'lucide-react';

interface ClassroomNotesModalProps {
  isOpen: boolean;
  onClose: () => void;
  classId: string;
  className: string;
  students: EnrollmentStudent[];
  initialStudentId?: string;
  onRefresh?: () => void;
}

const CATEGORY_META: Record<
  ClassroomNoteCategory,
  { label: string; bg: string; text: string; border: string }
> = {
  tpc: { label: 'TPC / Tarefa em Falta', bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
  participacao: { label: 'Participação Relevante', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  material: { label: 'Falta de Material / TIC', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  comportamento: { label: 'Atitude / Comportamento', bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  evolucao: { label: 'Evolução / Destaque', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  outro: { label: 'Outro Registo', bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' },
};

export function ClassroomNotesModal({
  isOpen,
  onClose,
  classId,
  className,
  students,
  initialStudentId,
  onRefresh,
}: ClassroomNotesModalProps) {
  const [notes, setNotes] = useState<ClassroomNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<string>(
    initialStudentId || (students[0]?.enrollment_id || '')
  );
  const [category, setCategory] = useState<ClassroomNoteCategory>('tpc');
  const [noteText, setNoteText] = useState('');
  const [noteDate, setNoteDate] = useState(new Date().toISOString().slice(0, 10));

  // Filters
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const loadNotes = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiRequest<{ notes: ClassroomNote[] }>(`/classes/${classId}/classroom-notes`);
      setNotes(res.notes || []);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar diário de bordo');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadNotes();
      if (initialStudentId) {
        setSelectedEnrollmentId(initialStudentId);
      } else if (students.length > 0 && !selectedEnrollmentId) {
        setSelectedEnrollmentId(students[0].enrollment_id);
      }
    }
  }, [isOpen, classId, initialStudentId]);

  if (!isOpen) return null;

  // Add Note
  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEnrollmentId || !noteText.trim()) return;

    try {
      await apiRequest(`/classes/${classId}/classroom-notes`, {
        method: 'POST',
        body: JSON.stringify({
          enrollmentId: selectedEnrollmentId,
          category,
          note: noteText.trim(),
          date: noteDate,
        }),
      });

      setNoteText('');
      await loadNotes();
      if (onRefresh) onRefresh();
    } catch (err: any) {
      setError(err.message || 'Erro ao guardar nota de aula');
    }
  };

  // Delete Note
  const handleDeleteNote = async (id: string) => {
    try {
      await apiRequest(`/classroom-notes/${id}`, { method: 'DELETE' });
      await loadNotes();
      if (onRefresh) onRefresh();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const filteredNotes = notes.filter((n) => {
    const matchesCat = filterCategory === 'all' || n.category === filterCategory;
    const matchesSearch =
      !searchTerm ||
      (n.student_name && n.student_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      n.note.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCat && matchesSearch;
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full border border-slate-200 my-6 max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base tracking-tight text-white">
                Diário de Bordo da Turma & Ocorrências de Aula
              </h3>
              <p className="text-xs text-slate-300">
                {className} • Registo ágil de TPC, participação, atitudes e desempenho diário
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form to Add New Note */}
        <div className="bg-slate-50 border-b border-slate-200 p-4 sm:p-6 shrink-0">
          <form onSubmit={handleAddNote} className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Registar Nova Ocorrência / Nota de Aula
              </h4>
              <span className="text-[11px] text-slate-400">Privado do professor</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Aluno *</label>
                <select
                  value={selectedEnrollmentId}
                  onChange={(e) => setSelectedEnrollmentId(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {students.map((st) => (
                    <option key={st.enrollment_id} value={st.enrollment_id}>
                      N.º {st.student_number} — {st.full_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Categoria *</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ClassroomNoteCategory)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {Object.entries(CATEGORY_META).map(([key, meta]) => (
                    <option key={key} value={key}>
                      {meta.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Data *</label>
                <input
                  type="date"
                  value={noteDate}
                  onChange={(e) => setNoteDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                required
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Descrição breve (ex: Não realizou o trabalho de casa de TIC; Excelente empenho no exercício prático)..."
                className="flex-1 px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-normal"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> Registar
              </button>
            </div>
          </form>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="p-4 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-600">Filtrar por:</span>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="px-2.5 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg cursor-pointer"
            >
              <option value="all">Todas as Categorias ({notes.length})</option>
              {Object.entries(CATEGORY_META).map(([key, meta]) => {
                const count = notes.filter((n) => n.category === key).length;
                return (
                  <option key={key} value={key}>
                    {meta.label} ({count})
                  </option>
                );
              })}
            </select>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
            <input
              type="text"
              placeholder="Pesquisar aluno ou nota..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-48 sm:w-60"
            />
          </div>
        </div>

        {/* Notes List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-2.5">
          {filteredNotes.length === 0 ? (
            <div className="text-center py-12 text-slate-400 space-y-2">
              <MessageSquare className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-xs font-medium">Nenhum registo encontrado no diário de bordo.</p>
            </div>
          ) : (
            filteredNotes.map((note) => {
              const meta = CATEGORY_META[note.category] || CATEGORY_META.outro;
              return (
                <div
                  key={note.id}
                  className="p-3 bg-white border border-slate-200 rounded-xl flex items-start justify-between gap-3 shadow-2xs hover:border-slate-300 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-slate-900">
                        N.º {note.student_number} — {note.student_name}
                      </span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${meta.bg} ${meta.text} ${meta.border}`}
                      >
                        {meta.label}
                      </span>
                      <span className="text-[11px] text-slate-400 font-medium">
                        {note.date ? new Date(note.date).toLocaleDateString('pt-PT') : ''}
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 leading-relaxed font-normal">{note.note}</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDeleteNote(note.id)}
                    className="p-1.5 text-slate-300 hover:text-rose-600 rounded-lg hover:bg-slate-50 cursor-pointer shrink-0"
                    title="Eliminar este registo"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
