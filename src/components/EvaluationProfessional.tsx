import React, { useState, useEffect } from 'react';
import { apiRequest } from '../api/client';
import {
  ProfessionalUC,
  ProfessionalModule,
  AssessmentInstrument,
  EnrollmentStudent,
  SpecialStatus,
  GradeScale,
  ModuleStatus,
  RecoveryAttempt,
} from '../types';
import {
  isValidInstrumentScore,
  isValidScoreForScale,
  resolveModuleStatus,
  resolveActiveGradeWithRecoveries,
} from '../utils/evaluation-logic';
import {
  Plus,
  Trash2,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Clock,
  Briefcase,
  History,
  Grid,
  List,
  Check,
  ChevronRight,
  Sparkles,
  Scale
} from 'lucide-react';
import { RubricsModal } from './RubricsModal';

interface EvaluationProfessionalProps {
  classId: string;
  className: string;
  courseName?: string | null;
  students: EnrollmentStudent[];
}

export function EvaluationProfessional({ classId, className, courseName, students }: EvaluationProfessionalProps) {
  const [ucs, setUcs] = useState<any[]>([]);
  const [selectedUcId, setSelectedUcId] = useState<string>('');
  const [selectedModuleId, setSelectedModuleId] = useState<string>('');
  const [viewMode, setViewMode] = useState<'module_detail' | 'uc_matrix'>('module_detail');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Auto-save status indicator
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // New Instrument Modal
  const [isAddInstModalOpen, setIsAddInstModalOpen] = useState(false);
  const [instTitle, setInstTitle] = useState('');
  const [instDate, setInstDate] = useState(new Date().toISOString().split('T')[0]);
  const [instMaxScore, setInstMaxScore] = useState<number>(20);
  const [instWeight, setInstWeight] = useState<number>(0);

  // Recovery Drawer/Modal
  const [isRecoveryModalOpen, setIsRecoveryModalOpen] = useState(false);
  const [recoveryData, setRecoveryData] = useState<{
    enrollmentId: string;
    studentName: string;
    finalGradeId: string;
    existingRecoveries: RecoveryAttempt[];
    currentGrade: number | null;
  } | null>(null);
  const [newRecDate, setNewRecDate] = useState(new Date().toISOString().split('T')[0]);
  const [newRecScore, setNewRecScore] = useState<string>('');
  const [newRecObs, setNewRecObs] = useState<string>('');

  // Rubrics Modal
  const [isRubricsModalOpen, setIsRubricsModalOpen] = useState(false);
  const [rubricStudentToEvaluate, setRubricStudentToEvaluate] = useState<any>(null);

  // Lookup maps
  const [resultsMap, setResultsMap] = useState<Record<string, { scoreValue: number | null; specialStatus: SpecialStatus }>>({});
  const [finalGradesMap, setFinalGradesMap] = useState<Record<string, { id: string; finalGradeValue: number | null; isConfirmed: boolean; status: ModuleStatus; recoveries: RecoveryAttempt[] }>>({});

  const loadProfessionalData = async (keepSelection = true) => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiRequest<{ ucs: any[] }>(`/classes/${classId}/professional`);
      setUcs(res.ucs || []);

      // Build maps
      const rMap: Record<string, { scoreValue: number | null; specialStatus: SpecialStatus }> = {};
      const fMap: Record<string, { id: string; finalGradeValue: number | null; isConfirmed: boolean; status: ModuleStatus; recoveries: RecoveryAttempt[] }> = {};

      res.ucs?.forEach((uc) => {
        uc.modules?.forEach((mod: any) => {
          mod.instruments?.forEach((i: any) => {
            // will match from results
          });
          mod.results?.forEach((r: any) => {
            rMap[`${r.instrument_id}_${r.enrollment_id}`] = {
              scoreValue: r.score_value,
              specialStatus: r.special_status || 'none',
            };
          });
          mod.finalGrades?.forEach((fg: any) => {
            const modRecoveries = (mod.recoveries || []).filter((rec: any) => rec.final_grade_id === fg.id);
            fMap[`${mod.module.id}_${fg.enrollment_id}`] = {
              id: fg.id,
              finalGradeValue: fg.final_grade_value,
              isConfirmed: !!fg.is_confirmed,
              status: fg.status,
              recoveries: modRecoveries,
            };
          });
        });
      });

      setResultsMap(rMap);
      setFinalGradesMap(fMap);

      // Handle selection
      if (!keepSelection || !selectedUcId) {
        if (res.ucs && res.ucs.length > 0) {
          const firstUc = res.ucs[0];
          setSelectedUcId(firstUc.uc.id);
          if (firstUc.modules && firstUc.modules.length > 0) {
            setSelectedModuleId(firstUc.modules[0].module.id);
          } else {
            setSelectedModuleId('');
          }
        }
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar dados do ensino profissional');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfessionalData(false);
  }, [classId]);

  // When changing UC: update available modules and prevent stale module selection!
  const handleUcChange = (newUcId: string) => {
    setSelectedUcId(newUcId);
    const chosenUc = ucs.find((u) => u.uc.id === newUcId);
    if (chosenUc && chosenUc.modules && chosenUc.modules.length > 0) {
      setSelectedModuleId(chosenUc.modules[0].module.id);
    } else {
      setSelectedModuleId('');
    }
  };

  const currentUcObj = ucs.find((u) => u.uc.id === selectedUcId);
  const currentModules: any[] = currentUcObj?.modules || [];
  const currentModuleObj = currentModules.find((m) => m.module.id === selectedModuleId);
  const currentInstruments: AssessmentInstrument[] = currentModuleObj?.instruments || [];
  const passingThreshold = currentUcObj?.uc.passing_threshold ?? 10;
  const ucScale = currentUcObj?.uc.scale || '0-20';

  // Handle cell result edit
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
      setError('Erro ao guardar resultado.');
    }
  };

  // Commit Final Module Grade
  const handleFinalGradeInput = async (enrollmentId: string, valStr: string) => {
    if (!selectedModuleId) return;

    let score: number | null = null;
    const clean = valStr.trim();
    if (clean !== '') {
      const parsed = parseFloat(clean.replace(',', '.'));
      if (isNaN(parsed) || !isValidScoreForScale(parsed, ucScale)) {
        setError(`A classificação final deve respeitar a escala ${ucScale}.`);
        return;
      }
      score = parsed;
    }

    const key = `${selectedModuleId}_${enrollmentId}`;
    const status = resolveModuleStatus(score, passingThreshold, true, true);

    setFinalGradesMap((prev) => ({
      ...prev,
      [key]: {
        id: prev[key]?.id || '',
        finalGradeValue: score,
        isConfirmed: true,
        status,
        recoveries: prev[key]?.recoveries || [],
      },
    }));

    setSaveStatus('saving');
    try {
      const res = await apiRequest<{ finalGrade: any }>('/final-grades/confirm', {
        method: 'POST',
        body: JSON.stringify({
          contextType: 'professional_module',
          contextId: selectedModuleId,
          enrollmentId,
          finalGradeValue: score,
          isConfirmed: true,
          completionDate: new Date().toISOString().split('T')[0],
        }),
      });

      setFinalGradesMap((prev) => ({
        ...prev,
        [key]: {
          ...prev[key],
          id: res.finalGrade.id,
          status: res.finalGrade.status,
        },
      }));

      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err: any) {
      setSaveStatus('error');
      setError('Erro ao confirmar nota do módulo.');
    }
  };

  // Open Recovery Modal
  const openRecoveryModal = (student: EnrollmentStudent) => {
    const key = `${selectedModuleId}_${student.enrollment_id}`;
    const current = finalGradesMap[key];

    if (!current?.id) {
      setError('Para registar uma recuperação, confirme primeiro a classificação final inicial do módulo.');
      return;
    }

    setRecoveryData({
      enrollmentId: student.enrollment_id,
      studentName: student.full_name,
      finalGradeId: current.id,
      existingRecoveries: current.recoveries || [],
      currentGrade: current.finalGradeValue,
    });
    setNewRecScore('');
    setNewRecObs('');
    setIsRecoveryModalOpen(true);
  };

  // Submit Recovery Attempt
  const handleSaveRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoveryData || !newRecScore) return;

    const parsed = parseFloat(newRecScore.replace(',', '.'));
    if (isNaN(parsed) || !isValidScoreForScale(parsed, ucScale)) {
      setError(`Classificação de recuperação inválida na escala ${ucScale}.`);
      return;
    }

    try {
      const res = await apiRequest<{ recoveries: RecoveryAttempt[]; finalGrade: any }>(
        `/final-grades/${recoveryData.finalGradeId}/recovery`,
        {
          method: 'POST',
          body: JSON.stringify({
            date: newRecDate,
            scoreValue: parsed,
            observations: newRecObs,
          }),
        }
      );

      const key = `${selectedModuleId}_${recoveryData.enrollmentId}`;
      setFinalGradesMap((prev) => ({
        ...prev,
        [key]: {
          ...prev[key],
          finalGradeValue: res.finalGrade.final_grade_value,
          status: res.finalGrade.status,
          recoveries: res.recoveries,
        },
      }));

      setIsRecoveryModalOpen(false);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err: any) {
      setError(err.message || 'Erro ao registar recuperação.');
    }
  };

  // Add new Instrument
  const handleAddInstrument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instTitle.trim() || !selectedModuleId) return;

    try {
      await apiRequest('/instruments', {
        method: 'POST',
        body: JSON.stringify({
          contextType: 'professional_module',
          contextId: selectedModuleId,
          title: instTitle.trim(),
          date: instDate,
          maxScore: instMaxScore,
          weight: instWeight || 0,
        }),
      });

      setIsAddInstModalOpen(false);
      setInstTitle('');
      await loadProfessionalData(true);
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-400 text-sm">A carregar módulos e avaliações...</div>;
  }

  if (ucs.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center max-w-lg mx-auto shadow-xs">
        <Briefcase className="w-10 h-10 text-amber-600 mx-auto mb-3" />
        <h3 className="text-base font-bold text-slate-900 mb-1">Nenhuma UC configurada</h3>
        <p className="text-xs text-slate-500 mb-6">
          Esta turma profissional ainda não possui Unidades Curriculares criadas. Aceda ao separador «UC e Módulos» para adicionar a sua primeira UC.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* PERSISTENT UC AND MODULE SELECTOR */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <span className="p-2 rounded-xl bg-amber-50 text-amber-700">
              <Briefcase className="w-5 h-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">
                  Avaliação no Ensino Profissional
                </h2>
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800">
                  Limiar de Aprovação: {passingThreshold} val.
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Selecione a UC e o Módulo para registo direto de classificações e recuperação.
              </p>
            </div>
          </div>

          {/* View Mode Toggle: Module Detail vs UC Global Matrix */}
          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
            <button
              type="button"
              onClick={() => setViewMode('module_detail')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer ${
                viewMode === 'module_detail'
                  ? 'bg-white text-indigo-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <List className="w-3.5 h-3.5" /> Grelha do Módulo
            </button>
            <button
              type="button"
              onClick={() => setViewMode('uc_matrix')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer ${
                viewMode === 'uc_matrix'
                  ? 'bg-white text-indigo-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Grid className="w-3.5 h-3.5" /> Matriz Global da UC
            </button>
          </div>
        </div>

        {/* Persistent UC and Module Selector Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* UC Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider">
              1. Selecionar Unidade Curricular (UC):
            </label>
            <select
              value={selectedUcId}
              onChange={(e) => handleUcChange(e.target.value)}
              className="w-full px-3 py-2 text-xs sm:text-sm font-semibold bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white cursor-pointer"
            >
              {ucs.map((u) => (
                <option key={u.uc.id} value={u.uc.id}>
                  {u.uc.code ? `[${u.uc.code}] ` : ''}
                  {u.uc.name} ({u.modules?.length || 0} módulos)
                </option>
              ))}
            </select>
          </div>

          {/* Module Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider">
              2. Selecionar Módulo da UC:
            </label>
            <select
              value={selectedModuleId}
              onChange={(e) => setSelectedModuleId(e.target.value)}
              disabled={currentModules.length === 0}
              className="w-full px-3 py-2 text-xs sm:text-sm font-semibold bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white cursor-pointer disabled:opacity-50"
            >
              {currentModules.length === 0 ? (
                <option value="">Nenhum módulo nesta UC</option>
              ) : (
                currentModules.map((m) => (
                  <option key={m.module.id} value={m.module.id}>
                    {m.module.code_or_number} — {m.module.name} {m.module.hours ? `(${m.module.hours}h)` : ''}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* VIEW MODE 1: MODULE SPREADSHEET DETAIL */}
      {viewMode === 'module_detail' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-800 text-sm">
                Módulo em Avaliação: {currentModuleObj?.module.code_or_number} — {currentModuleObj?.module.name}
              </span>
            </div>

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
                disabled={!selectedModuleId}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Plus className="w-4 h-4" /> Novo Instrumento do Módulo
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto relative max-h-[600px]">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-700 font-bold sticky top-0 z-20 border-b border-slate-200 shadow-xs">
                  <tr>
                    <th className="py-3 px-3 w-12 text-center sticky left-0 bg-slate-50 z-30 border-r border-slate-200">
                      N.º
                    </th>
                    <th className="py-3 px-4 min-w-[200px] sticky left-12 bg-slate-50 z-30 border-r border-slate-200">
                      Nome do Aluno
                    </th>

                    {currentInstruments.map((inst) => (
                      <th key={inst.id} className="py-2.5 px-3 min-w-[130px] border-r border-slate-200 group">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-bold text-slate-900 truncate" title={inst.title}>
                            {inst.title}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 font-normal flex items-center justify-between mt-0.5">
                          <span>Cotação: {inst.max_score}</span>
                          {inst.weight > 0 && <span className="font-semibold text-indigo-600">{inst.weight}%</span>}
                        </div>
                      </th>
                    ))}

                    <th className="py-3 px-3 w-32 text-center bg-slate-100 text-slate-900 font-extrabold border-r border-slate-200">
                      Classificação Final
                    </th>

                    <th className="py-3 px-3 w-36 text-center bg-slate-50 text-slate-700 font-bold border-r border-slate-200">
                      Estado de Aproveitamento
                    </th>

                    <th className="py-3 px-3 w-28 text-center text-slate-700 font-semibold">
                      Recuperação
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {students.map((student, rowIdx) => {
                    const enrollId = student.enrollment_id;
                    const finalKey = `${selectedModuleId}_${enrollId}`;
                    const currentFinal = finalGradesMap[finalKey];

                    return (
                      <tr
                        key={enrollId}
                        className={`hover:bg-slate-50/80 transition-colors ${
                          rowIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'
                        }`}
                      >
                        <td className="py-2 px-3 text-center font-mono font-bold text-slate-600 sticky left-0 bg-inherit z-10 border-r border-slate-200">
                          {student.student_number}
                        </td>
                        <td className="py-2 px-4 font-semibold text-slate-800 sticky left-12 bg-inherit z-10 border-r border-slate-200 whitespace-nowrap">
                          {student.full_name}
                        </td>

                        {currentInstruments.map((inst) => {
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
                                    : 'bg-transparent text-slate-900'
                                }`}
                              />
                            </td>
                          );
                        })}

                        {/* Final Grade Cell */}
                        <td className="p-1 text-center bg-slate-50/50 border-r border-slate-200">
                          <input
                            type="text"
                            defaultValue={
                              currentFinal?.finalGradeValue !== null && currentFinal?.finalGradeValue !== undefined
                                ? String(currentFinal.finalGradeValue)
                                : ''
                            }
                            key={currentFinal?.finalGradeValue ?? 'empty'}
                            placeholder="N/D"
                            onBlur={(e) => handleFinalGradeInput(enrollId, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') (e.target as HTMLElement).blur();
                            }}
                            className={`w-16 py-1.5 px-2 text-center text-xs font-mono font-extrabold rounded border transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                              currentFinal?.status === 'aprovado'
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                                : currentFinal?.status === 'reprovado'
                                ? 'bg-rose-50 border-rose-300 text-rose-800'
                                : 'bg-white border-slate-300 text-slate-800'
                            }`}
                          />
                        </td>

                        {/* Status Badge */}
                        <td className="py-2 px-3 text-center border-r border-slate-200">
                          {currentFinal?.status === 'aprovado' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              <CheckCircle2 className="w-3 h-3" /> Concluído c/ Aprov.
                            </span>
                          ) : currentFinal?.status === 'reprovado' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                              Sem Aproveitamento
                            </span>
                          ) : currentFinal?.status === 'em_curso' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                              Em Curso
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">Por Avaliar</span>
                          )}
                        </td>

                        {/* Recovery Action */}
                        <td className="py-2 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => openRecoveryModal(student)}
                            className="px-2 py-1 text-[11px] font-semibold text-slate-700 hover:text-indigo-700 hover:bg-slate-100 rounded border border-slate-200 transition-colors inline-flex items-center gap-1 cursor-pointer"
                          >
                            <History className="w-3 h-3" />
                            <span>Recuperar</span>
                            {currentFinal?.recoveries && currentFinal.recoveries.length > 0 && (
                              <span className="w-4 h-4 rounded-full bg-indigo-600 text-white text-[9px] flex items-center justify-center font-bold">
                                {currentFinal.recoveries.length}
                              </span>
                            )}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW MODE 2: GLOBAL UC MATRIX (Alunos nas Linhas, Módulos nas Colunas) */}
      {viewMode === 'uc_matrix' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 text-sm">
              Visão Global da UC: {currentUcObj?.uc.name} (Alunos × Módulos)
            </h3>
            <span className="text-xs text-slate-500">
              Apresenta o estado e a classificação final de cada módulo da UC.
            </span>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-3 w-12 text-center border-r border-slate-200">N.º</th>
                    <th className="py-3 px-4 min-w-[200px] border-r border-slate-200">Nome do Aluno</th>
                    {currentModules.map((m) => (
                      <th key={m.module.id} className="py-3 px-3 text-center min-w-[110px] border-r border-slate-200">
                        <div className="font-bold text-slate-900">{m.module.code_or_number}</div>
                        <div className="text-[10px] text-slate-500 font-normal truncate max-w-[120px] mx-auto">
                          {m.module.name}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {students.map((student) => (
                    <tr key={student.enrollment_id} className="hover:bg-slate-50/50">
                      <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-600 border-r border-slate-200">
                        {student.student_number}
                      </td>
                      <td className="py-2.5 px-4 font-semibold text-slate-800 border-r border-slate-200">
                        {student.full_name}
                      </td>

                      {currentModules.map((m) => {
                        const key = `${m.module.id}_${student.enrollment_id}`;
                        const gradeData = finalGradesMap[key];
                        const hasVal = gradeData?.finalGradeValue !== null && gradeData?.finalGradeValue !== undefined;

                        return (
                          <td key={m.module.id} className="py-2 px-3 text-center border-r border-slate-100">
                            {hasVal ? (
                              <div className="inline-flex flex-col items-center">
                                <span
                                  className={`font-mono font-bold text-xs ${
                                    gradeData.status === 'aprovado'
                                      ? 'text-emerald-700'
                                      : gradeData.status === 'reprovado'
                                      ? 'text-rose-700'
                                      : 'text-slate-800'
                                  }`}
                                >
                                  {gradeData.finalGradeValue}
                                </span>
                                <span
                                  className={`text-[9px] font-semibold px-1 rounded ${
                                    gradeData.status === 'aprovado'
                                      ? 'bg-emerald-50 text-emerald-800'
                                      : gradeData.status === 'reprovado'
                                      ? 'bg-rose-50 text-rose-800'
                                      : 'bg-slate-100 text-slate-600'
                                  }`}
                                >
                                  {gradeData.status === 'aprovado'
                                    ? 'Aprovado'
                                    : gradeData.status === 'reprovado'
                                    ? 'Reprovado'
                                    : 'Em curso'}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-300 font-mono">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: REGISTAR RECUPERAÇÃO */}
      {isRecoveryModalOpen && recoveryData && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 border border-slate-100 space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-700">
                <History className="w-5 h-5" />
              </span>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Registo de Recuperação — {recoveryData.studentName}
                </h3>
                <p className="text-xs text-slate-500">
                  Módulo: {currentModuleObj?.module.code_or_number} • Limiar de aprovação: {passingThreshold} val.
                </p>
              </div>
            </div>

            {/* Previous Attempts Timeline */}
            <div className="bg-slate-50 rounded-xl p-3.5 space-y-2 border border-slate-200">
              <span className="text-xs font-bold text-slate-700 block">Histórico de Avaliação e Tentativas:</span>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                  <span className="text-slate-500">Classificação Inicial:</span>
                  <span className="font-mono font-bold text-slate-800">{recoveryData.currentGrade ?? 'N/D'}</span>
                </div>

                {recoveryData.existingRecoveries.map((rec) => (
                  <div
                    key={rec.id}
                    className={`flex items-center justify-between py-1 px-2 rounded ${
                      rec.is_active_final ? 'bg-indigo-50 border border-indigo-200' : ''
                    }`}
                  >
                    <div>
                      <span className="font-bold text-slate-700">Tentativa {rec.attempt_number}</span>
                      <span className="text-[11px] text-slate-400 ml-2">({rec.date})</span>
                      {rec.observations && (
                        <p className="text-[10px] text-slate-500 italic">{rec.observations}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-900">{rec.score_value}</span>
                      {rec.is_active_final ? (
                        <span className="text-[10px] font-bold text-indigo-700 bg-white px-1.5 py-0.5 rounded border border-indigo-200">
                          Ativa
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* New Attempt Form */}
            <form onSubmit={handleSaveRecovery} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Data da Prova de Recuperação *
                  </label>
                  <input
                    type="date"
                    required
                    value={newRecDate}
                    onChange={(e) => setNewRecDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Classificação Obtida *
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="20"
                    required
                    value={newRecScore}
                    onChange={(e) => setNewRecScore(e.target.value)}
                    placeholder="Ex: 11.5"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Observações da Tentativa
                </label>
                <textarea
                  rows={2}
                  value={newRecObs}
                  onChange={(e) => setNewRecObs(e.target.value)}
                  placeholder="Ex: Prova escrita suplementar de recuperação do módulo."
                  className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsRecoveryModalOpen(false)}
                  className="px-3.5 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg text-xs font-medium cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" /> Registar Tentativa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: NOVO INSTRUMENTO DO MÓDULO */}
      {isAddInstModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-slate-100">
            <h3 className="text-base font-bold text-slate-900 mb-1">
              Novo Instrumento de Avaliação do Módulo
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Módulo: <strong>{currentModuleObj?.module.code_or_number} — {currentModuleObj?.module.name}</strong>
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
                  placeholder="Ex: Teste Prático em Laboratório, Projeto Final"
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
                  Ponderação no Módulo (%) — opcional
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={instWeight}
                  onChange={(e) => setInstWeight(parseFloat(e.target.value) || 0)}
                  placeholder="Ex: 50"
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                />
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

      {/* RUBRICS MODAL */}
      <RubricsModal
        isOpen={isRubricsModalOpen}
        onClose={() => setIsRubricsModalOpen(false)}
        classId={classId}
        targetScale="0-20"
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
