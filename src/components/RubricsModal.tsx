import React, { useState, useEffect } from 'react';
import { apiRequest } from '../api/client';
import {
  ObservationRubric,
  RubricCriterion,
  GradeScale,
} from '../types';
import {
  calculateRubricGrade,
  DEFAULT_RUBRIC_TEMPLATES,
} from '../utils/evaluation-logic';
import {
  Sparkles,
  Plus,
  Trash2,
  Check,
  X,
  Award,
  Layers,
  BookOpen,
  ChevronRight,
  Info,
  Scale
} from 'lucide-react';

interface RubricsModalProps {
  isOpen: boolean;
  onClose: () => void;
  classId: string;
  targetScale: GradeScale;
  studentToEvaluate?: {
    enrollmentId: string;
    studentName: string;
    studentNumber: number;
    contextType: 'instrument' | 'regular_period' | 'professional_module';
    contextId: string;
    contextTitle: string;
  } | null;
  onApplyGrade?: (grade: number, totalScore: number) => void;
}

export function RubricsModal({
  isOpen,
  onClose,
  classId,
  targetScale,
  studentToEvaluate,
  onApplyGrade,
}: RubricsModalProps) {
  const [rubrics, setRubrics] = useState<ObservationRubric[]>([]);
  const [selectedRubricId, setSelectedRubricId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New Rubric Form
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCriteria, setNewCriteria] = useState<
    { name: string; weight: number; max_points: number; levels?: any[] }[]
  >([]);

  // Scoring state when evaluating a student: criterionId -> score (1-5)
  const [scores, setScores] = useState<Record<string, number>>({});
  const [evalNotes, setEvalNotes] = useState('');

  const loadRubrics = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiRequest<{ rubrics: ObservationRubric[] }>(`/classes/${classId}/rubrics`);
      setRubrics(res.rubrics || []);
      if (res.rubrics && res.rubrics.length > 0 && !selectedRubricId) {
        setSelectedRubricId(res.rubrics[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar rubricas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadRubrics();
      setScores({});
      setEvalNotes('');
      setIsCreating(false);
    }
  }, [isOpen, classId]);

  if (!isOpen) return null;

  const currentRubric = rubrics.find((r) => r.id === selectedRubricId);

  // Calculate live grade
  const liveCalculation = currentRubric
    ? calculateRubricGrade(
        currentRubric.criteria.map((c) => ({ id: c.id, weight: c.weight, maxPoints: c.max_points })),
        scores,
        targetScale
      )
    : null;

  // Handle Level Selection
  const handleSelectScore = (criterionId: string, levelValue: number) => {
    setScores((prev) => ({
      ...prev,
      [criterionId]: levelValue,
    }));
  };

  // Save Evaluation & Apply
  const handleSaveEvaluation = async () => {
    if (!studentToEvaluate || !currentRubric || !liveCalculation) return;

    try {
      await apiRequest(`/rubrics/${currentRubric.id}/evaluations`, {
        method: 'POST',
        body: JSON.stringify({
          enrollmentId: studentToEvaluate.enrollmentId,
          contextType: studentToEvaluate.contextType,
          contextId: studentToEvaluate.contextId,
          scores,
          totalScore: liveCalculation.totalScore,
          convertedGrade: liveCalculation.convertedGrade,
          notes: evalNotes,
        }),
      });

      if (onApplyGrade) {
        onApplyGrade(liveCalculation.convertedGrade, liveCalculation.totalScore);
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao guardar avaliação');
    }
  };

  // Load Template
  const handleLoadTemplate = (template: typeof DEFAULT_RUBRIC_TEMPLATES[0]) => {
    setNewTitle(template.title);
    setNewDescription(template.description);
    setNewCriteria(template.criteria.map((c) => ({ ...c })));
  };

  // Create Rubric Submit
  const handleCreateRubric = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    try {
      const res = await apiRequest<{ success: boolean; rubricId: string }>(`/classes/${classId}/rubrics`, {
        method: 'POST',
        body: JSON.stringify({
          title: newTitle.trim(),
          description: newDescription.trim(),
          criteria: newCriteria,
        }),
      });

      setIsCreating(false);
      setNewTitle('');
      setNewDescription('');
      setNewCriteria([]);
      await loadRubrics();
      setSelectedRubricId(res.rubricId);
    } catch (err: any) {
      setError(err.message || 'Erro ao criar rubrica');
    }
  };

  // Delete Rubric
  const handleDeleteRubric = async (id: string) => {
    if (!confirm('Tem a certeza que pretende eliminar esta grelha de rubrica?')) return;
    try {
      await apiRequest(`/rubrics/${id}`, { method: 'DELETE' });
      await loadRubrics();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full border border-slate-200 my-6 max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base tracking-tight text-white">
                {studentToEvaluate ? 'Avaliação por Grelha de Rubrica' : 'Grelhas de Observação & Rubricas'}
              </h3>
              <p className="text-xs text-slate-300">
                {studentToEvaluate
                  ? `Avaliar: N.º ${studentToEvaluate.studentNumber} — ${studentToEvaluate.studentName} (${studentToEvaluate.contextTitle})`
                  : 'Critérios qualitativos e ponderações para avaliação formativa e sumativa'}
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

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center justify-between">
              <span>{error}</span>
              <button type="button" onClick={() => setError(null)} className="text-rose-500 hover:text-rose-800">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Mode: Create Form */}
          {isCreating ? (
            <form onSubmit={handleCreateRubric} className="space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <h4 className="font-bold text-sm text-slate-800">Configurar Nova Grelha de Rubrica</h4>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleLoadTemplate(DEFAULT_RUBRIC_TEMPLATES[0])}
                    className="px-2.5 py-1 text-xs bg-indigo-50 text-indigo-700 font-semibold rounded-lg hover:bg-indigo-100 flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Carregar Modelo TIC
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsCreating(false)}
                    className="px-2.5 py-1 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Título da Rubrica *</label>
                  <input
                    type="text"
                    required
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Ex: Trabalho Prático / Projeto TIC"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Descrição / Finalidade</label>
                  <input
                    type="text"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="Ex: Avaliação de autonomia, qualidade técnica e rigor"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Criteria List */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Critérios de Avaliação ({newCriteria.length})
                  </h5>
                  <button
                    type="button"
                    onClick={() =>
                      setNewCriteria([
                        ...newCriteria,
                        {
                          name: `Critério ${newCriteria.length + 1}`,
                          weight: 25,
                          max_points: 5,
                        },
                      ])
                    }
                    className="text-xs text-indigo-600 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Adicionar Critério
                  </button>
                </div>

                {newCriteria.map((crit, idx) => (
                  <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={crit.name}
                        onChange={(e) => {
                          const updated = [...newCriteria];
                          updated[idx].name = e.target.value;
                          setNewCriteria(updated);
                        }}
                        placeholder="Nome do critério"
                        className="flex-1 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg font-medium"
                      />
                      <div className="flex items-center gap-1 text-xs text-slate-600 font-medium whitespace-nowrap">
                        <span>Peso (%):</span>
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={crit.weight}
                          onChange={(e) => {
                            const updated = [...newCriteria];
                            updated[idx].weight = Number(e.target.value) || 0;
                            setNewCriteria(updated);
                          }}
                          className="w-14 px-2 py-1 text-xs bg-white border border-slate-200 rounded-lg text-center font-mono"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setNewCriteria(newCriteria.filter((_, i) => i !== idx))}
                        className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-4 py-2 text-xs border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={newCriteria.length === 0}
                  className="px-5 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow cursor-pointer disabled:opacity-50"
                >
                  Guardar Rubrica
                </button>
              </div>
            </form>
          ) : (
            // Mode: View & Evaluate
            <div className="space-y-6">
              {/* Select or Create Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-700">Grelha Ativa:</span>
                  <select
                    value={selectedRubricId}
                    onChange={(e) => {
                      setSelectedRubricId(e.target.value);
                      setScores({});
                    }}
                    className="px-3 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-lg cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {rubrics.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.title} ({r.criteria.length} critérios)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreating(true);
                      handleLoadTemplate(DEFAULT_RUBRIC_TEMPLATES[0]);
                    }}
                    className="px-3 py-1.5 text-xs font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-lg shadow-2xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-indigo-600" />
                    Nova Rubrica
                  </button>

                  {currentRubric && (
                    <button
                      type="button"
                      onClick={() => handleDeleteRubric(currentRubric.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-white cursor-pointer"
                      title="Eliminar esta rubrica"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Rubric View */}
              {currentRubric ? (
                <div className="space-y-5">
                  {currentRubric.description && (
                    <p className="text-xs text-slate-500 italic bg-white px-1">
                      {currentRubric.description}
                    </p>
                  )}

                  {/* Criteria Grid */}
                  <div className="space-y-4">
                    {currentRubric.criteria.map((crit) => {
                      const selectedScore = scores[crit.id];
                      return (
                        <div
                          key={crit.id}
                          className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 shadow-2xs"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-xs text-slate-900">
                              {crit.name}
                            </span>
                            <span className="text-[11px] font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                              Peso: {crit.weight}%
                            </span>
                          </div>

                          {/* 5 Levels clickable buttons */}
                          <div className="grid grid-cols-5 gap-1.5">
                            {[1, 2, 3, 4, 5].map((lvl) => {
                              const isSelected = selectedScore === lvl;
                              const descObj = crit.levels?.find((l) => l.level === lvl);
                              const levelLabels = ['Muito Fraco', 'Insuficiente', 'Suficiente', 'Bom', 'Excelente'];
                              const title = descObj?.title || levelLabels[lvl - 1];

                              return (
                                <button
                                  key={lvl}
                                  type="button"
                                  onClick={() => handleSelectScore(crit.id, lvl)}
                                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between min-h-[72px] ${
                                    isSelected
                                      ? 'border-indigo-600 bg-indigo-50/80 ring-2 ring-indigo-500/30'
                                      : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100 hover:border-slate-300'
                                  }`}
                                >
                                  <div className="flex items-center justify-between w-full">
                                    <span
                                      className={`text-xs font-mono font-extrabold ${
                                        isSelected ? 'text-indigo-700' : 'text-slate-700'
                                      }`}
                                    >
                                      {lvl} / 5
                                    </span>
                                    {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                                  </div>
                                  <div className="mt-1">
                                    <div
                                      className={`text-[11px] font-bold truncate ${
                                        isSelected ? 'text-indigo-900' : 'text-slate-800'
                                      }`}
                                    >
                                      {title}
                                    </div>
                                    {descObj?.description && (
                                      <p className="text-[9.5px] text-slate-500 line-clamp-2 mt-0.5 leading-tight">
                                        {descObj.description}
                                      </p>
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Live Calculation Banner */}
                  {liveCalculation && (
                    <div className="bg-gradient-to-r from-indigo-900 to-slate-900 text-white rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 shadow-lg">
                      <div>
                        <span className="text-[11px] uppercase tracking-wider font-bold text-indigo-300">
                          Classificação Ponderada Calculada
                        </span>
                        <div className="flex items-baseline gap-2 mt-0.5">
                          <span className="text-3xl font-extrabold tracking-tight font-mono text-white">
                            {liveCalculation.convertedGrade}
                          </span>
                          <span className="text-xs text-indigo-200">
                            (na escala {targetScale}) • Pontuação: {liveCalculation.totalScore} / {liveCalculation.maxTotalPoints}
                          </span>
                        </div>
                      </div>

                      {studentToEvaluate && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleSaveEvaluation}
                            className="px-5 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer flex items-center gap-2"
                          >
                            <Check className="w-4 h-4" />
                            Aplicar à Avaliação do Aluno
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12 text-slate-400 space-y-3">
                  <BookOpen className="w-10 h-10 mx-auto text-slate-300" />
                  <p className="text-sm font-medium">Nenhuma grelha de rubrica criada nesta turma.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreating(true);
                      handleLoadTemplate(DEFAULT_RUBRIC_TEMPLATES[0]);
                    }}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold shadow cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Criar com Modelo TIC Pré-Configurado
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
