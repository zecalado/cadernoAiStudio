import React, { useState, useEffect, useRef } from 'react';
import { apiRequest } from '../api/client';
import {
  RegularSubject,
  RegularPeriod,
  AssessmentInstrument,
  EnrollmentStudent,
  SpecialStatus,
  GradeScale,
} from '../types';
import {
  calculateWeightedProposal,
  isValidInstrumentScore,
  isValidScoreForScale,
  type InstrumentWeightItem,
} from '../utils/evaluation-logic';
import {
  Plus,
  Trash2,
  Calendar,
  Calculator,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  HelpCircle,
  FileSpreadsheet,
  Check,
  RotateCcw,
  Scale
} from 'lucide-react';
import { RubricsModal } from './RubricsModal';

interface EvaluationRegularProps {
  classId: string;
  className: string;
  defaultScale: GradeScale;
  students: EnrollmentStudent[];
}

export function EvaluationRegular({ classId, className, defaultScale, students }: EvaluationRegularProps) {
  const [subject, setSubject] = useState<RegularSubject | null>(null);
  const [periods, setPeriods] = useState<any[]>([]);
  const [activePeriodIndex, setActivePeriodIndex] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Auto-save status: 'idle' | 'saving' | 'saved' | 'error'
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // New Instrument Modal
  const [isAddInstModalOpen, setIsAddInstModalOpen] = useState(false);
  const [instTitle, setInstTitle] = useState('');
  const [instDate, setInstDate] = useState(new Date().toISOString().split('T')[0]);
  const [instMaxScore, setInstMaxScore] = useState<number>(defaultScale === '1-5' ? 5 : 20);
  const [instWeight, setInstWeight] = useState<number>(0);

  // Rubrics Modal
  const [isRubricsModalOpen, setIsRubricsModalOpen] = useState(false);
  const [rubricStudentToEvaluate, setRubricStudentToEvaluate] = useState<any>(null);

  // Proposal modal
  const [isProposalModalOpen, setIsProposalModalOpen] = useState(false);
  const [proposalData, setProposalData] = useState<{
    enrollmentId: string;
    studentName: string;
    result: ReturnType<typeof calculateWeightedProposal>;
  } | null>(null);

  // Confirm override modal
  const [confirmOverrideModal, setConfirmOverrideModal] = useState<{
    enrollmentId: string;
    studentName: string;
    previousGrade: number | null;
    newGrade: number | null;
  } | null>(null);

  // Local grid edits buffer for batch saving
  const [resultsMap, setResultsMap] = useState<Record<string, { scoreValue: number | null; specialStatus: SpecialStatus }>>({});
  const [finalGradesMap, setFinalGradesMap] = useState<Record<string, { finalGradeValue: number | null; isConfirmed: boolean }>>({});

  const loadTicData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiRequest<{ subject: RegularSubject; periods: any[] }>(`/classes/${classId}/tic`);
      setSubject(res.subject);
      setPeriods(res.periods || []);

      // Build quick lookup maps
      const rMap: Record<string, { scoreValue: number | null; specialStatus: SpecialStatus }> = {};
      const fMap: Record<string, { finalGradeValue: number | null; isConfirmed: boolean }> = {};

      res.periods?.forEach((p) => {
        p.results?.forEach((r: any) => {
          rMap[`${r.instrument_id}_${r.enrollment_id}`] = {
            scoreValue: r.score_value,
            specialStatus: r.special_status || 'none',
          };
        });
        p.finalGrades?.forEach((fg: any) => {
          fMap[`${p.period.id}_${fg.enrollment_id}`] = {
            finalGradeValue: fg.final_grade_value,
            isConfirmed: !!fg.is_confirmed,
          };
        });
      });

      setResultsMap(rMap);
      setFinalGradesMap(fMap);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar dados de TIC');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTicData();
  }, [classId]);

  const activePeriodObj = periods[activePeriodIndex];
  const activeInstruments: AssessmentInstrument[] = activePeriodObj?.instruments || [];
  const currentPeriodId = activePeriodObj?.period?.id;
  const scale = subject?.scale || defaultScale;

  // Save a single score change with immediate feedback
  const handleScoreChange = async (
    instrumentId: string,
    enrollmentId: string,
    valStr: string,
    maxScore: number
  ) => {
    let score: number | null = null;
    let special: SpecialStatus = 'none';

    const clean = valStr.trim().toUpperCase();

    if (clean === '' || clean === '-') {
      special = 'sem_avaliacao';
      score = null;
    } else if (clean === 'F') {
      special = 'falta';
      score = null;
    } else if (clean === 'NE') {
      special = 'nao_entregou';
      score = null;
    } else if (clean === 'NA') {
      special = 'nao_aplicavel';
      score = null;
    } else {
      const parsed = parseFloat(clean.replace(',', '.'));
      if (isNaN(parsed) || !isValidInstrumentScore(parsed, maxScore)) {
        setSaveStatus('error');
        setError(`Valor inválido. A cotação deve estar entre 0 e ${maxScore}.`);
        return;
      }
      score = parsed;
      special = 'none';
    }

    // Optimistic update
    const key = `${instrumentId}_${enrollmentId}`;
    setResultsMap((prev) => ({
      ...prev,
      [key]: { scoreValue: score, specialStatus: special },
    }));

    setSaveStatus('saving');
    setError(null);

    try {
      await apiRequest('/results/batch', {
        method: 'POST',
        body: JSON.stringify({
          updates: [
            {
              instrumentId,
              enrollmentId,
              scoreValue: score,
              specialStatus: special,
            },
          ],
        }),
      });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err: any) {
      setSaveStatus('error');
      setError('Erro ao guardar alteração na grelha.');
    }
  };

  // Change Final Period Grade
  const handleFinalGradeInput = (enrollmentId: string, studentName: string, valStr: string) => {
    const key = `${currentPeriodId}_${enrollmentId}`;
    const current = finalGradesMap[key];

    let score: number | null = null;
    const clean = valStr.trim();
    if (clean !== '') {
      const parsed = parseFloat(clean.replace(',', '.'));
      if (isNaN(parsed) || !isValidScoreForScale(parsed, scale)) {
        setError(`A classificação final deve respeitar a escala ${scale}.`);
        return;
      }
      score = parsed;
    }

    // If already confirmed, ask confirmation to alter!
    if (current && current.isConfirmed && current.finalGradeValue !== score) {
      setConfirmOverrideModal({
        enrollmentId,
        studentName,
        previousGrade: current.finalGradeValue,
        newGrade: score,
      });
      return;
    }

    commitFinalGrade(enrollmentId, score, true);
  };

  const commitFinalGrade = async (enrollmentId: string, gradeValue: number | null, isConfirmed: boolean) => {
    const key = `${currentPeriodId}_${enrollmentId}`;
    setFinalGradesMap((prev) => ({
      ...prev,
      [key]: { finalGradeValue: gradeValue, isConfirmed },
    }));

    setSaveStatus('saving');
    try {
      await apiRequest('/final-grades/confirm', {
        method: 'POST',
        body: JSON.stringify({
          contextType: 'regular_period',
          contextId: currentPeriodId,
          enrollmentId,
          finalGradeValue: gradeValue,
          isConfirmed,
          completionDate: new Date().toISOString().split('T')[0],
        }),
      });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err: any) {
      setSaveStatus('error');
      setError('Erro ao confirmar classificação final.');
    }
  };

  // Add new Instrument
  const handleAddInstrument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instTitle.trim()) return;

    try {
      await apiRequest('/instruments', {
        method: 'POST',
        body: JSON.stringify({
          contextType: 'regular_period',
          contextId: currentPeriodId,
          title: instTitle.trim(),
          date: instDate,
          maxScore: instMaxScore,
          weight: instWeight || 0,
        }),
      });

      setIsAddInstModalOpen(false);
      setInstTitle('');
      setInstWeight(0);
      await loadTicData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Delete Instrument
  const handleDeleteInstrument = async (instId: string) => {
    if (!confirm('Deseja eliminar este instrumento e todas as respetivas classificações associadas?')) return;
    try {
      await apiRequest(`/instruments/${instId}`, { method: 'DELETE' });
      await loadTicData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Calculate Weighted Proposal for student
  const openWeightedProposalModal = (student: EnrollmentStudent) => {
    const items: InstrumentWeightItem[] = activeInstruments.map((inst) => {
      const res = resultsMap[`${inst.id}_${student.enrollment_id}`];
      return {
        id: inst.id,
        title: inst.title,
        maxScore: inst.max_score,
        weight: inst.weight,
        scoreValue: res?.scoreValue,
        specialStatus: res?.specialStatus,
      };
    });

    const proposal = calculateWeightedProposal(items, scale);
    setProposalData({
      enrollmentId: student.enrollment_id,
      studentName: student.full_name,
      result: proposal,
    });
    setIsProposalModalOpen(true);
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-400 text-sm">A carregar grelha de avaliação de TIC...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Notice bar: TIC is the sole subject */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900">Avaliação de TIC</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
              Disciplina Única
            </span>
            <span className="text-xs font-mono font-semibold text-slate-500">
              Escala da Turma: {scale}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Gestão independente dos três períodos letivos. Separamos os instrumentos da classificação final.
          </p>
        </div>

        {/* Save Status & Auto-save Indicator */}
        <div className="flex items-center gap-3">
          <div className="text-xs font-medium flex items-center gap-1.5">
            {saveStatus === 'saving' && (
              <span className="text-amber-600 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 animate-spin" /> A guardar...
              </span>
            )}
            {saveStatus === 'saved' && (
              <span className="text-emerald-600 flex items-center gap-1 font-semibold">
                <Check className="w-3.5 h-3.5" /> Guardado
              </span>
            )}
            {saveStatus === 'error' && (
              <span className="text-rose-600 flex items-center gap-1 font-semibold">
                <AlertCircle className="w-3.5 h-3.5" /> Erro ao guardar
              </span>
            )}
            {saveStatus === 'idle' && (
              <span className="text-slate-400 text-[11px]">Gravação automática ativa</span>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setRubricStudentToEvaluate(null);
              setIsRubricsModalOpen(true);
            }}
            className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold shadow-2xs flex items-center gap-1.5 cursor-pointer"
          >
            <Scale className="w-4 h-4" /> Rubricas de Observação
          </button>

          <button
            type="button"
            onClick={() => setIsAddInstModalOpen(true)}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Novo Instrumento
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 3 Periods Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        {periods.map((p, idx) => (
          <button
            key={p.period.id}
            type="button"
            onClick={() => setActivePeriodIndex(idx)}
            className={`px-5 py-3 text-xs sm:text-sm font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
              activePeriodIndex === idx
                ? 'border-indigo-600 text-indigo-600 bg-white rounded-t-xl shadow-xs'
                : 'border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            <span>{p.period.name}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-mono">
              {p.instruments?.length || 0} inst.
            </span>
          </button>
        ))}
      </div>

      {/* SPREADSHEET EVALUATION GRID */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {students.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            Ainda não foram inseridos alunos nesta turma. Aceda ao separador «Alunos» para os importar.
          </div>
        ) : (
          <div className="overflow-x-auto relative max-h-[600px]">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 text-slate-700 font-bold sticky top-0 z-20 border-b border-slate-200 shadow-xs">
                <tr>
                  {/* Sticky Column: Nº */}
                  <th className="py-3 px-3 w-12 text-center sticky left-0 bg-slate-50 z-30 border-r border-slate-200">
                    N.º
                  </th>
                  {/* Sticky Column: Nome do Aluno */}
                  <th className="py-3 px-4 min-w-[200px] sticky left-12 bg-slate-50 z-30 border-r border-slate-200">
                    Nome do Aluno
                  </th>

                  {/* Instruments Columns */}
                  {activeInstruments.map((inst) => (
                    <th key={inst.id} className="py-2.5 px-3 min-w-[130px] border-r border-slate-200 group">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-bold text-slate-900 truncate" title={inst.title}>
                          {inst.title}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteInstrument(inst.id)}
                          className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-600 p-0.5 rounded transition-opacity cursor-pointer"
                          title="Eliminar instrumento"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="text-[10px] text-slate-500 font-normal flex items-center justify-between mt-0.5">
                        <span>Cotação: {inst.max_score}</span>
                        {inst.weight > 0 && (
                          <span className="font-semibold text-indigo-600">{inst.weight}%</span>
                        )}
                      </div>
                    </th>
                  ))}

                  {/* Proposals column if instruments have weights */}
                  <th className="py-3 px-3 w-28 text-center bg-indigo-50/50 text-indigo-950 border-r border-slate-200">
                    Cálculo / Ponderação
                  </th>

                  {/* Final Period Grade Column */}
                  <th className="py-3 px-4 min-w-[130px] text-center bg-slate-100 text-slate-900 font-extrabold">
                    Classificação Final ({activePeriodObj?.period?.name})
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 font-sans">
                {students.map((student, rowIdx) => {
                  const enrollId = student.enrollment_id;
                  const finalKey = `${currentPeriodId}_${enrollId}`;
                  const currentFinal = finalGradesMap[finalKey];

                  return (
                    <tr
                      key={enrollId}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'
                      }`}
                    >
                      {/* Sticky Nº */}
                      <td className="py-2 px-3 text-center font-mono font-bold text-slate-600 sticky left-0 bg-inherit z-10 border-r border-slate-200">
                        {student.student_number}
                      </td>

                      {/* Sticky Nome */}
                      <td className="py-2 px-4 font-semibold text-slate-800 sticky left-12 bg-inherit z-10 border-r border-slate-200 whitespace-nowrap">
                        {student.full_name}
                      </td>

                      {/* Instruments Result Cells */}
                      {activeInstruments.map((inst) => {
                        const cellKey = `${inst.id}_${enrollId}`;
                        const cellData = resultsMap[cellKey];
                        const val =
                          cellData?.specialStatus && cellData.specialStatus !== 'none'
                            ? cellData.specialStatus === 'falta'
                              ? 'F'
                              : cellData.specialStatus === 'nao_entregou'
                              ? 'NE'
                              : cellData.specialStatus === 'nao_aplicavel'
                              ? 'NA'
                              : '-'
                            : cellData?.scoreValue !== null && cellData?.scoreValue !== undefined
                            ? String(cellData.scoreValue)
                            : '';

                        return (
                          <td key={inst.id} className="p-1 border-r border-slate-100 text-center">
                            <input
                              type="text"
                              value={val}
                              placeholder="—"
                              onChange={(e) =>
                                handleScoreChange(inst.id, enrollId, e.target.value, inst.max_score)
                              }
                              className={`w-full py-1.5 px-2 text-center text-xs font-mono font-semibold rounded focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all ${
                                cellData?.specialStatus === 'falta'
                                  ? 'bg-rose-50 text-rose-700 font-bold'
                                  : cellData?.specialStatus === 'nao_entregou'
                                  ? 'bg-amber-50 text-amber-800 font-bold'
                                  : cellData?.specialStatus === 'nao_aplicavel'
                                  ? 'bg-slate-100 text-slate-400'
                                  : 'bg-transparent text-slate-900'
                              }`}
                            />
                          </td>
                        );
                      })}

                      {/* Proposal Action */}
                      <td className="py-2 px-3 text-center border-r border-slate-200">
                        <button
                          type="button"
                          onClick={() => openWeightedProposalModal(student)}
                          className="px-2 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100/70 rounded border border-indigo-200 transition-colors inline-flex items-center gap-1 cursor-pointer"
                          title="Calcular proposta ponderada"
                        >
                          <Calculator className="w-3 h-3" /> Proposta
                        </button>
                      </td>

                      {/* Final Period Grade */}
                      <td className="p-1 text-center bg-slate-50/50">
                        <div className="flex items-center justify-center gap-1.5">
                          <input
                            type="text"
                            defaultValue={
                              currentFinal?.finalGradeValue !== null && currentFinal?.finalGradeValue !== undefined
                                ? String(currentFinal.finalGradeValue)
                                : ''
                            }
                            key={currentFinal?.finalGradeValue ?? 'empty'}
                            placeholder="N/D"
                            onBlur={(e) =>
                              handleFinalGradeInput(enrollId, student.full_name, e.target.value)
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                (e.target as HTMLElement).blur();
                              }
                            }}
                            className={`w-16 py-1.5 px-2 text-center text-xs font-mono font-extrabold rounded border transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                              currentFinal?.isConfirmed
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                                : 'bg-white border-slate-300 text-slate-800'
                            }`}
                          />
                          {currentFinal?.isConfirmed && (
                            <span title="Classificação confirmada pelo professor" className="text-emerald-600">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            </span>
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

        {/* Legend bar */}
        <div className="bg-slate-50 px-4 py-2.5 border-t border-slate-200 flex flex-wrap items-center justify-between text-[11px] text-slate-500 gap-3">
          <div className="flex items-center gap-4">
            <span className="font-semibold text-slate-700">Legenda de células:</span>
            <span><strong>F</strong> = Falta</span>
            <span><strong>NE</strong> = Não entregou</span>
            <span><strong>NA</strong> = Não aplicável</span>
            <span><strong>—</strong> = Sem avaliação</span>
          </div>
          <span className="italic">
            Prima <strong>Enter</strong> ou clique fora da célula para confirmar valores.
          </span>
        </div>
      </div>

      {/* MODAL: NOVO INSTRUMENTO DE AVALIAÇÃO */}
      {isAddInstModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-slate-100">
            <h3 className="text-base font-bold text-slate-900 mb-1">
              Novo Instrumento de Avaliação de TIC
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Período de aplicação: <strong>{activePeriodObj?.period?.name}</strong>
            </p>

            <form onSubmit={handleAddInstrument} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Designação do Instrumento *
                </label>
                <input
                  type="text"
                  required
                  value={instTitle}
                  onChange={(e) => setInstTitle(e.target.value)}
                  placeholder="Ex: Teste Prático, Projeto de Algoritmia, Apresentação"
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Data de Aplicação
                  </label>
                  <input
                    type="date"
                    value={instDate}
                    onChange={(e) => setInstDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Cotação Máxima *
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    required
                    value={instMaxScore}
                    onChange={(e) => setInstMaxScore(parseFloat(e.target.value) || 20)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Ponderação no Período (%) — opcional
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={instWeight}
                    onChange={(e) => setInstWeight(parseFloat(e.target.value) || 0)}
                    placeholder="Ex: 40"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-bold">%</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Utilizado exclusivamente para apoiar a proposta de classificação ponderada.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddInstModalOpen(false)}
                  className="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg text-xs font-medium cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow cursor-pointer"
                >
                  Criar Instrumento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: PROPOSTA PONDERADA */}
      {isProposalModalOpen && proposalData && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 border border-slate-100 space-y-4">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded bg-indigo-100 text-indigo-700">
                <Calculator className="w-5 h-5" />
              </span>
              <h3 className="text-base font-bold text-slate-900">
                Proposta Ponderada — {proposalData.studentName}
              </h3>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Período:</span>
                <span className="font-semibold text-slate-800">{activePeriodObj?.period?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Soma das Ponderações:</span>
                <span
                  className={`font-bold ${
                    proposalData.result.isValidWeights ? 'text-emerald-600' : 'text-amber-600'
                  }`}
                >
                  {proposalData.result.totalWeight}% {proposalData.result.isValidWeights ? '✓ (Válido: 100%)' : '⚠ (Atenção: diferente de 100%)'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Escala de Saída:</span>
                <span className="font-mono font-bold text-slate-800">{scale}</span>
              </div>
            </div>

            {/* Missing items warning */}
            {proposalData.result.missingInstruments.length > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 space-y-1">
                <div className="font-bold flex items-center gap-1">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  Instrumentos sem classificação registada:
                </div>
                <ul className="list-disc list-inside pl-1 text-[11px]">
                  {proposalData.result.missingInstruments.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Formula description */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">Fórmula de cálculo proposta:</label>
              <div className="p-2.5 bg-slate-100 rounded-lg font-mono text-[11px] text-slate-700 break-all">
                {proposalData.result.formulaDescription}
              </div>
            </div>

            {/* Result display */}
            <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-xl text-center">
              <span className="text-xs text-indigo-900 font-medium">Classificação Proposta:</span>
              <div className="text-3xl font-extrabold text-indigo-700 font-mono mt-1">
                {proposalData.result.proposedGrade !== null ? proposalData.result.proposedGrade : 'N/D'}
              </div>
              <p className="text-[11px] text-indigo-600 mt-1">
                Esta proposta não é gravada automaticamente. O professor deve confirmar a decisão final.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsProposalModalOpen(false)}
                className="px-3.5 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg text-xs font-medium cursor-pointer"
              >
                Cancelar
              </button>
              {proposalData.result.proposedGrade !== null && (
                <button
                  type="button"
                  onClick={() => {
                    commitFinalGrade(proposalData.enrollmentId, proposalData.result.proposedGrade, true);
                    setIsProposalModalOpen(false);
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow cursor-pointer flex items-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" /> Aplicar e Confirmar Nota Final
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRMAR ALTERAÇÃO DE NOTA JÁ CONFIRMADA */}
      {confirmOverrideModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 border border-slate-100 space-y-4">
            <div className="flex items-center gap-2 text-amber-600">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <h3 className="text-base font-bold text-slate-900">Alterar Nota Já Confirmada</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              O aluno <strong>{confirmOverrideModal.studentName}</strong> já possui a classificação final de{' '}
              <strong className="text-slate-900 font-mono">{confirmOverrideModal.previousGrade ?? 'N/D'}</strong>{' '}
              confirmada no {activePeriodObj?.period?.name}.
            </p>
            <p className="text-xs text-slate-600">
              Confirma a alteração para a nova classificação de{' '}
              <strong className="text-indigo-600 font-mono text-sm">{confirmOverrideModal.newGrade ?? 'N/D'}</strong>?
            </p>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setConfirmOverrideModal(null)}
                className="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg text-xs font-medium cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  commitFinalGrade(
                    confirmOverrideModal.enrollmentId,
                    confirmOverrideModal.newGrade,
                    true
                  );
                  setConfirmOverrideModal(null);
                }}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow cursor-pointer"
              >
                Confirmar Alteração
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RUBRICS MODAL */}
      <RubricsModal
        isOpen={isRubricsModalOpen}
        onClose={() => setIsRubricsModalOpen(false)}
        classId={classId}
        targetScale={scale}
        studentToEvaluate={rubricStudentToEvaluate}
        onApplyGrade={(grade) => {
          if (rubricStudentToEvaluate) {
            handleScoreChange(
              rubricStudentToEvaluate.contextId,
              rubricStudentToEvaluate.enrollmentId,
              String(grade),
              20
            );
          }
        }}
      />
    </div>
  );
}
