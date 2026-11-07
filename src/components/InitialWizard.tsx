import React, { useState } from 'react';
import { apiRequest } from '../api/client';
import { parseStudentsInput, type ParseStudentRow } from '../utils/evaluation-logic';
import { Teacher, GradeScale, EducationType } from '../types';
import {
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  GraduationCap,
  Plus,
  Trash2,
  AlertTriangle,
  Upload,
  ClipboardList,
  Save,
  BookOpen,
  Briefcase,
  Layers,
  HelpCircle
} from 'lucide-react';

interface InitialWizardProps {
  initialTeacher?: Teacher | null;
  onComplete: () => void;
}

interface WizardClassConfig {
  name: string;
  gradeLevel: string;
  educationType: EducationType;
  courseName?: string;
  defaultScale: GradeScale;
  // Professional specific
  ucs: {
    code?: string;
    name: string;
    scale: GradeScale;
    passingThreshold: number;
    modules: {
      codeOrNumber: string;
      name: string;
      hours?: string;
    }[];
  }[];
  // Students
  studentsInputMode: 'manual' | 'paste' | 'csv';
  rawStudentsText: string;
  manualStudents: { number: number; name: string }[];
  parsedStudents: ParseStudentRow[];
}

export function InitialWizard({ initialTeacher, onComplete }: InitialWizardProps) {
  const [step, setStep] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1 State
  const [teacherName, setTeacherName] = useState(initialTeacher?.name || '');
  const [school, setSchool] = useState(initialTeacher?.school || '');
  const [academicYearName, setAcademicYearName] = useState('2026/2027');

  // Step 2 State
  const [classCount, setClassCount] = useState<number>(2);

  // Step 3 & 4 State (Classes array)
  const [classes, setClasses] = useState<WizardClassConfig[]>([
    {
      name: '8.º A',
      gradeLevel: '8.º Ano',
      educationType: 'regular',
      courseName: '',
      defaultScale: '1-5',
      ucs: [],
      studentsInputMode: 'paste',
      rawStudentsText: '1; Afonso Fernandes\n2; Beatriz Costa\n3; Carolina Martins\n4; Diogo Ribeiro\n5; Eduarda Santos',
      manualStudents: [],
      parsedStudents: [],
    },
    {
      name: '10.º TGPSI',
      gradeLevel: '10.º Ano',
      educationType: 'professional',
      courseName: 'Técnico de Gestão e Programação de Sistemas Informáticos',
      defaultScale: '0-20',
      ucs: [
        {
          code: 'PSI',
          name: 'Programação e Sistemas de Informação',
          scale: '0-20',
          passingThreshold: 10,
          modules: [
            { codeOrNumber: 'M1', name: 'Estruturas de Dados e Algoritmos', hours: '30' },
            { codeOrNumber: 'M2', name: 'Programação Orientada a Objetos', hours: '35' },
          ],
        },
      ],
      studentsInputMode: 'paste',
      rawStudentsText: '1; André Carvalho\n2; Bruna Ferreira\n3; Daniela Pires\n4; Gonçalo Neves\n5; Inês Guimarães',
      manualStudents: [],
      parsedStudents: [],
    },
  ]);

  // Adjust classes count when step 2 changes
  const handleSetClassCount = (count: number) => {
    const validCount = Math.max(1, Math.min(10, count));
    setClassCount(validCount);
    setClasses((prev) => {
      const next = [...prev];
      while (next.length < validCount) {
        const idx = next.length + 1;
        next.push({
          name: `Turma ${idx}`,
          gradeLevel: 'Geral',
          educationType: 'regular',
          courseName: '',
          defaultScale: '1-5',
          ucs: [],
          studentsInputMode: 'paste',
          rawStudentsText: '',
          manualStudents: [],
          parsedStudents: [],
        });
      }
      return next.slice(0, validCount);
    });
  };

  const updateClassConfig = (index: number, updates: Partial<WizardClassConfig>) => {
    setClasses((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], ...updates };
      return copy;
    });
  };

  // UC and Module management for professional classes in Step 3
  const addUcToClass = (classIdx: number) => {
    setClasses((prev) => {
      const copy = [...prev];
      const ucs = [...copy[classIdx].ucs];
      ucs.push({
        code: `UC${ucs.length + 1}`,
        name: `Nova Unidade Curricular`,
        scale: copy[classIdx].defaultScale,
        passingThreshold: 10,
        modules: [{ codeOrNumber: 'M1', name: 'Módulo 1', hours: '25' }],
      });
      copy[classIdx].ucs = ucs;
      return copy;
    });
  };

  const removeUcFromClass = (classIdx: number, ucIdx: number) => {
    setClasses((prev) => {
      const copy = [...prev];
      copy[classIdx].ucs = copy[classIdx].ucs.filter((_, i) => i !== ucIdx);
      return copy;
    });
  };

  const addModuleToUc = (classIdx: number, ucIdx: number) => {
    setClasses((prev) => {
      const copy = [...prev];
      const ucs = [...copy[classIdx].ucs];
      const mods = [...ucs[ucIdx].modules];
      mods.push({
        codeOrNumber: `M${mods.length + 1}`,
        name: `Módulo ${mods.length + 1}`,
        hours: '25',
      });
      ucs[ucIdx].modules = mods;
      copy[classIdx].ucs = ucs;
      return copy;
    });
  };

  const removeModuleFromUc = (classIdx: number, ucIdx: number, modIdx: number) => {
    setClasses((prev) => {
      const copy = [...prev];
      const ucs = [...copy[classIdx].ucs];
      ucs[ucIdx].modules = ucs[ucIdx].modules.filter((_, i) => i !== modIdx);
      copy[classIdx].ucs = ucs;
      return copy;
    });
  };

  // Parse students preview whenever text changes
  const handleStudentsTextChange = (classIdx: number, text: string) => {
    const parsed = parseStudentsInput(text);
    updateClassConfig(classIdx, {
      rawStudentsText: text,
      parsedStudents: parsed,
    });
  };

  // Add manual student row
  const addManualStudent = (classIdx: number) => {
    setClasses((prev) => {
      const copy = [...prev];
      const nextNum = (copy[classIdx].manualStudents.length || 0) + 1;
      const list = [...copy[classIdx].manualStudents, { number: nextNum, name: '' }];
      copy[classIdx].manualStudents = list;
      return copy;
    });
  };

  const updateManualStudent = (classIdx: number, stIdx: number, field: 'number' | 'name', value: any) => {
    setClasses((prev) => {
      const copy = [...prev];
      const list = [...copy[classIdx].manualStudents];
      list[stIdx] = { ...list[stIdx], [field]: value };
      copy[classIdx].manualStudents = list;
      return copy;
    });
  };

  const removeManualStudent = (classIdx: number, stIdx: number) => {
    setClasses((prev) => {
      const copy = [...prev];
      copy[classIdx].manualStudents = copy[classIdx].manualStudents.filter((_, i) => i !== stIdx);
      return copy;
    });
  };

  // Handle CSV file upload
  const handleFileUpload = (classIdx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      handleStudentsTextChange(classIdx, content);
    };
    reader.readAsText(file);
  };

  // Submit complete wizard
  const handleFinishWizard = async () => {
    setError(null);
    setLoading(true);

    try {
      // Prepare payload
      const preparedClasses = classes.map((c) => {
        let students: { number: number; name: string }[] = [];
        if (c.studentsInputMode === 'manual') {
          students = c.manualStudents.filter((s) => s.number && s.name.trim());
        } else {
          const parsed = parseStudentsInput(c.rawStudentsText);
          students = parsed.filter((p) => p.isValid).map((p) => ({ number: p.number, name: p.name }));
        }

        return {
          name: c.name,
          gradeLevel: c.gradeLevel,
          educationType: c.educationType,
          courseName: c.courseName,
          defaultScale: c.defaultScale,
          ucs: c.educationType === 'professional' ? c.ucs : [],
          students,
        };
      });

      await apiRequest('/wizard/complete', {
        method: 'POST',
        body: JSON.stringify({
          teacherName,
          school,
          academicYearName,
          classes: preparedClasses,
        }),
      });

      onComplete();
    } catch (err: any) {
      setError(err.message || 'Erro ao guardar configuração inicial.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Wizard Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-2.5 rounded-2xl bg-white shadow-md border border-slate-200 mb-3">
            <img
              src="/assets/aistudio/AEGP_c929fad4.png"
              alt="AEGP - Agrupamento de Escolas Gabriel Pereira"
              className="h-10 w-auto object-contain"
            />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
            Assistente de Configuração Inicial
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Agrupamento de Escolas Gabriel Pereira — Évora • Caderno Letivo
          </p>
        </div>

        {/* Steps Breadcrumbs */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3 sm:p-4 mb-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { num: 1, title: 'Professor e Ano' },
              { num: 2, title: 'Número de Turmas' },
              { num: 3, title: 'Configuração das Turmas' },
              { num: 4, title: 'Alunos das Turmas' },
            ].map((s) => (
              <div
                key={s.num}
                className={`flex items-center gap-2 p-2 rounded-lg text-xs font-medium transition-colors ${
                  step === s.num
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : step > s.num
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'text-slate-500 bg-slate-50'
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold ${
                    step === s.num
                      ? 'bg-white text-indigo-600'
                      : step > s.num
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {step > s.num ? '✓' : s.num}
                </span>
                <span className="truncate">{s.title}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Error notification */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Step Content */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
          {/* PASSO 1: PROFESSOR E ANO LETIVO */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Passo 1 — Identificação e Ano Letivo</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Estes dados identificam os cabeçalhos das suas pautas de trabalho e organizam o histórico letivo.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nome do Professor *
                  </label>
                  <input
                    type="text"
                    required
                    value={teacherName}
                    onChange={(e) => setTeacherName(e.target.value)}
                    placeholder="Ex: Prof. Manuel Silva"
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Escola ou Instituição de Ensino (opcional)
                  </label>
                  <input
                    type="text"
                    value={school}
                    onChange={(e) => setSchool(e.target.value)}
                    placeholder="Ex: Agrupamento de Escolas Gabriel Pereira - Évora"
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Quando preenchida, constará no cabeçalho das pautas exportadas em PDF.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Ano Letivo *
                  </label>
                  <input
                    type="text"
                    required
                    value={academicYearName}
                    onChange={(e) => setAcademicYearName(e.target.value)}
                    placeholder="2026/2027"
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                  />
                </div>
              </div>
            </div>
          )}

          {/* PASSO 2: NÚMERO DE TURMAS */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Passo 2 — Quantidade de Turmas</h2>
                <p className="text-sm text-slate-500 mt-1">
                  «Quantas turmas pretende gerir neste ano letivo?»
                </p>
              </div>

              <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-5">
                <label className="block text-sm font-semibold text-indigo-950 mb-3">
                  Número inicial de turmas:
                </label>
                <div className="flex items-center gap-3">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => handleSetClassCount(n)}
                      className={`w-12 h-12 rounded-xl text-base font-bold transition-all cursor-pointer ${
                        classCount === n
                          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                          : 'bg-white text-slate-700 border border-slate-200 hover:border-indigo-300'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                  <div className="flex items-center gap-2 pl-3">
                    <span className="text-xs text-slate-500">ou introduza:</span>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={classCount}
                      onChange={(e) => handleSetClassCount(parseInt(e.target.value, 10) || 1)}
                      className="w-16 px-2.5 py-2 text-center text-sm font-semibold bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2 text-xs text-indigo-800">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-indigo-600" />
                  <span>
                    O número inicial não é um limite. Poderá adicionar, duplicar ou arquivar outras turmas a qualquer momento.
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* PASSO 3: CONFIGURAÇÃO DE CADA TURMA */}
          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Passo 3 — Configuração de Cada Turma</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Configure o tipo de ensino e as especificidades pedagógicas de cada turma selecionada.
                </p>
              </div>

              <div className="space-y-8">
                {classes.map((cls, classIdx) => (
                  <div
                    key={classIdx}
                    className="p-5 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-5"
                  >
                    <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                      <div className="flex items-center gap-2.5">
                        <span className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs">
                          {classIdx + 1}
                        </span>
                        <h3 className="font-bold text-slate-900 text-base">
                          {cls.name || `Turma ${classIdx + 1}`}
                        </h3>
                      </div>
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white border border-slate-200 text-slate-700">
                        {cls.educationType === 'regular' ? 'Ensino Regular (TIC)' : 'Ensino Profissional'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Designação da Turma *
                        </label>
                        <input
                          type="text"
                          required
                          value={cls.name}
                          onChange={(e) => updateClassConfig(classIdx, { name: e.target.value })}
                          placeholder="Ex: 8.º A ou 10.º TGPSI"
                          className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Ano de Escolaridade *
                        </label>
                        <input
                          type="text"
                          required
                          value={cls.gradeLevel}
                          onChange={(e) => updateClassConfig(classIdx, { gradeLevel: e.target.value })}
                          placeholder="Ex: 8.º Ano ou 10.º Ano"
                          className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Tipo de Ensino *
                        </label>
                        <select
                          value={cls.educationType}
                          onChange={(e) =>
                            updateClassConfig(classIdx, {
                              educationType: e.target.value as EducationType,
                              defaultScale: e.target.value === 'regular' ? '1-5' : '0-20',
                            })
                          }
                          className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                        >
                          <option value="regular">Ensino Regular</option>
                          <option value="professional">Ensino Profissional</option>
                        </select>
                      </div>
                    </div>

                    {/* REGULAR SPECIFICS */}
                    {cls.educationType === 'regular' && (
                      <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-4 space-y-3">
                        <div className="flex items-start gap-2">
                          <BookOpen className="w-4 h-4 text-blue-700 mt-0.5 shrink-0" />
                          <div>
                            <h4 className="text-xs font-bold text-blue-900">
                              Estrutura Pedagógica de TIC Automática
                            </h4>
                            <p className="text-xs text-blue-800 mt-0.5">
                              No ensino regular, a disciplina <strong>TIC</strong> é a única gerida e é criada automaticamente com os três períodos independentes (1.º, 2.º e 3.º Períodos).
                            </p>
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-blue-950 mb-1">
                            Escala de Classificação da Turma:
                          </label>
                          <div className="flex gap-4">
                            {[
                              { label: 'Níveis de 1 a 5 (Recomendado no Básico)', val: '1-5' },
                              { label: '0 a 20 Valores', val: '0-20' },
                              { label: '0 a 100%', val: '0-100' },
                            ].map((sc) => (
                              <label key={sc.val} className="flex items-center gap-2 text-xs text-blue-900 cursor-pointer">
                                <input
                                  type="radio"
                                  name={`scale-${classIdx}`}
                                  checked={cls.defaultScale === sc.val}
                                  onChange={() => updateClassConfig(classIdx, { defaultScale: sc.val as GradeScale })}
                                  className="text-indigo-600 focus:ring-indigo-500"
                                />
                                {sc.label}
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* PROFESSIONAL SPECIFICS */}
                    {cls.educationType === 'professional' && (
                      <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 space-y-4">
                        <div className="flex items-start gap-2">
                          <Briefcase className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" />
                          <div>
                            <h4 className="text-xs font-bold text-amber-900">
                              Estrutura Pedagógica do Ensino Profissional
                            </h4>
                            <p className="text-xs text-amber-800 mt-0.5">
                              Ano letivo → Turma → Unidade Curricular (UC) → Módulos. A lista de alunos será comum a todas as UC desta turma.
                            </p>
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-amber-950 mb-1">
                            Nome do Curso (opcional)
                          </label>
                          <input
                            type="text"
                            value={cls.courseName || ''}
                            onChange={(e) => updateClassConfig(classIdx, { courseName: e.target.value })}
                            placeholder="Ex: Técnico de Gestão e Programação de Sistemas Informáticos"
                            className="w-full px-3 py-2 text-sm bg-white border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>

                        {/* UCs List */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-amber-950 uppercase tracking-wider">
                              Unidades Curriculares (UC) da Turma
                            </span>
                            <button
                              type="button"
                              onClick={() => addUcToClass(classIdx)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-amber-100 border border-amber-300 text-amber-900 rounded-md text-xs font-semibold cursor-pointer shadow-sm"
                            >
                              <Plus className="w-3.5 h-3.5" /> Adicionar UC
                            </button>
                          </div>

                          {cls.ucs.length === 0 && (
                            <p className="text-xs text-amber-700 italic bg-amber-100/50 p-2.5 rounded-lg">
                              Nenhuma UC adicionada ainda. Pode adicionar agora ou completar mais tarde nas configurações da turma.
                            </p>
                          )}

                          {cls.ucs.map((uc, ucIdx) => (
                            <div key={ucIdx} className="bg-white rounded-xl border border-amber-200 p-3.5 space-y-3">
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={uc.code || ''}
                                  onChange={(e) => {
                                    const ucs = [...cls.ucs];
                                    ucs[ucIdx].code = e.target.value;
                                    updateClassConfig(classIdx, { ucs });
                                  }}
                                  placeholder="Código (PSI)"
                                  className="w-24 px-2 py-1.5 text-xs font-mono font-semibold bg-slate-50 border border-slate-200 rounded"
                                />
                                <input
                                  type="text"
                                  value={uc.name}
                                  onChange={(e) => {
                                    const ucs = [...cls.ucs];
                                    ucs[ucIdx].name = e.target.value;
                                    updateClassConfig(classIdx, { ucs });
                                  }}
                                  placeholder="Designação da UC *"
                                  className="flex-1 px-2.5 py-1.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded"
                                />
                                <div className="flex items-center gap-1.5 text-xs">
                                  <span className="text-slate-500">Limiar:</span>
                                  <input
                                    type="number"
                                    value={uc.passingThreshold}
                                    onChange={(e) => {
                                      const ucs = [...cls.ucs];
                                      ucs[ucIdx].passingThreshold = parseFloat(e.target.value) || 10;
                                      updateClassConfig(classIdx, { ucs });
                                    }}
                                    className="w-14 px-1.5 py-1 text-xs text-center font-bold bg-slate-50 border border-slate-200 rounded"
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeUcFromClass(classIdx, ucIdx)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                                  title="Remover UC"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>

                              {/* Modules for this UC */}
                              <div className="pl-4 border-l-2 border-indigo-200 space-y-2">
                                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600">
                                  <span>Módulos de {uc.name || 'desta UC'}:</span>
                                  <button
                                    type="button"
                                    onClick={() => addModuleToUc(classIdx, ucIdx)}
                                    className="text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer flex items-center gap-1"
                                  >
                                    <Plus className="w-3 h-3" /> Adicionar Módulo
                                  </button>
                                </div>

                                {uc.modules.map((mod, modIdx) => (
                                  <div key={modIdx} className="flex items-center gap-2">
                                    <input
                                      type="text"
                                      value={mod.codeOrNumber}
                                      onChange={(e) => {
                                        const ucs = [...cls.ucs];
                                        ucs[ucIdx].modules[modIdx].codeOrNumber = e.target.value;
                                        updateClassConfig(classIdx, { ucs });
                                      }}
                                      placeholder="M1"
                                      className="w-16 px-2 py-1 text-xs font-mono bg-slate-50 border border-slate-200 rounded"
                                    />
                                    <input
                                      type="text"
                                      value={mod.name}
                                      onChange={(e) => {
                                        const ucs = [...cls.ucs];
                                        ucs[ucIdx].modules[modIdx].name = e.target.value;
                                        updateClassConfig(classIdx, { ucs });
                                      }}
                                      placeholder="Designação do Módulo"
                                      className="flex-1 px-2.5 py-1 text-xs bg-slate-50 border border-slate-200 rounded"
                                    />
                                    <input
                                      type="number"
                                      value={mod.hours || ''}
                                      onChange={(e) => {
                                        const ucs = [...cls.ucs];
                                        ucs[ucIdx].modules[modIdx].hours = e.target.value;
                                        updateClassConfig(classIdx, { ucs });
                                      }}
                                      placeholder="Horas"
                                      className="w-16 px-1.5 py-1 text-xs text-center bg-slate-50 border border-slate-200 rounded"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => removeModuleFromUc(classIdx, ucIdx, modIdx)}
                                      className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                                      title="Remover Módulo"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PASSO 4: ALUNOS DAS TURMAS */}
          {step === 4 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Passo 4 — Alunos das Turmas</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Introduza os alunos de cada turma. Poderá colar uma lista direta, carregar um ficheiro CSV ou introduzir manualmente.
                </p>
              </div>

              <div className="space-y-8">
                {classes.map((cls, classIdx) => {
                  const parsed: ParseStudentRow[] = cls.studentsInputMode === 'manual'
                    ? cls.manualStudents.map((m) => ({
                        number: m.number,
                        name: m.name,
                        isValid: !!(m.number && m.name.trim()),
                        error: !m.name.trim() ? 'Nome em falta' : undefined,
                        isDuplicateNumber: false,
                        isIdenticalName: false,
                      }))
                    : parseStudentsInput(cls.rawStudentsText);

                  const validCount = parsed.filter((p) => p.isValid).length;
                  const invalidCount = parsed.filter((p) => !p.isValid).length;

                  return (
                    <div
                      key={classIdx}
                      className="p-5 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded bg-indigo-600 text-white flex items-center justify-center font-bold text-xs">
                            {classIdx + 1}
                          </span>
                          <h3 className="font-bold text-slate-900">{cls.name}</h3>
                          <span className="text-xs text-slate-500">({cls.gradeLevel})</span>
                        </div>

                        {/* Input Mode Selector */}
                        <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 text-xs">
                          <button
                            type="button"
                            onClick={() => updateClassConfig(classIdx, { studentsInputMode: 'paste' })}
                            className={`px-3 py-1 rounded-md font-medium cursor-pointer ${
                              cls.studentsInputMode === 'paste' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            Colar Lista
                          </button>
                          <button
                            type="button"
                            onClick={() => updateClassConfig(classIdx, { studentsInputMode: 'csv' })}
                            className={`px-3 py-1 rounded-md font-medium cursor-pointer ${
                              cls.studentsInputMode === 'csv' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            Importar CSV
                          </button>
                          <button
                            type="button"
                            onClick={() => updateClassConfig(classIdx, { studentsInputMode: 'manual' })}
                            className={`px-3 py-1 rounded-md font-medium cursor-pointer ${
                              cls.studentsInputMode === 'manual' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            Inserção Manual
                          </button>
                        </div>
                      </div>

                      {/* PASTE LIST MODE */}
                      {cls.studentsInputMode === 'paste' && (
                        <div className="space-y-2">
                          <label className="block text-xs font-semibold text-slate-700">
                            Cole a lista de alunos (um aluno por linha, ex: "1 - Maria Silva" ou "1; Maria Silva"):
                          </label>
                          <textarea
                            rows={5}
                            value={cls.rawStudentsText}
                            onChange={(e) => handleStudentsTextChange(classIdx, e.target.value)}
                            placeholder="1 - Afonso Fernandes&#10;2 - Beatriz Costa&#10;3 - Carolina Martins"
                            className="w-full p-3 font-mono text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                      )}

                      {/* CSV MODE */}
                      {cls.studentsInputMode === 'csv' && (
                        <div className="p-4 bg-white border border-dashed border-slate-300 rounded-xl text-center space-y-2">
                          <Upload className="w-6 h-6 text-indigo-600 mx-auto" />
                          <div className="text-xs font-semibold text-slate-700">Selecione o ficheiro CSV</div>
                          <p className="text-[11px] text-slate-400">
                            Ficheiro separado por ponto e vírgula ou vírgula com colunas de número e nome.
                          </p>
                          <input
                            type="file"
                            accept=".csv,.txt"
                            onChange={(e) => handleFileUpload(classIdx, e)}
                            className="text-xs file:mr-2 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
                          />
                        </div>
                      )}

                      {/* MANUAL MODE */}
                      {cls.studentsInputMode === 'manual' && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-700">Linhas de alunos manuais:</span>
                            <button
                              type="button"
                              onClick={() => addManualStudent(classIdx)}
                              className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1 cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" /> Adicionar Linha
                            </button>
                          </div>
                          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                            {cls.manualStudents.map((st, sIdx) => (
                              <div key={sIdx} className="flex items-center gap-2">
                                <input
                                  type="number"
                                  value={st.number}
                                  onChange={(e) =>
                                    updateManualStudent(classIdx, sIdx, 'number', parseInt(e.target.value, 10) || 0)
                                  }
                                  className="w-16 px-2 py-1 text-xs text-center font-bold bg-white border border-slate-200 rounded"
                                />
                                <input
                                  type="text"
                                  value={st.name}
                                  onChange={(e) => updateManualStudent(classIdx, sIdx, 'name', e.target.value)}
                                  placeholder="Nome completo do aluno"
                                  className="flex-1 px-2.5 py-1 text-xs bg-white border border-slate-200 rounded"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeManualStudent(classIdx, sIdx)}
                                  className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* PREVIEW TABLE WITH DETECTION */}
                      <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-700">Pré-visualização da Importação</span>
                          <div className="flex gap-2">
                            <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium text-[11px]">
                              {validCount} válidos
                            </span>
                            {invalidCount > 0 && (
                              <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 font-medium text-[11px]">
                                {invalidCount} com erros
                              </span>
                            )}
                          </div>
                        </div>

                        {parsed.length === 0 ? (
                          <p className="text-xs text-slate-400 italic py-2">
                            Nenhum aluno detetado ainda para esta turma.
                          </p>
                        ) : (
                          <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 text-xs">
                            {parsed.map((p, idx) => (
                              <div
                                key={idx}
                                className={`py-1.5 px-2 flex items-center justify-between ${
                                  !p.isValid ? 'bg-rose-50/60 text-rose-800' : p.isIdenticalName ? 'bg-amber-50/50' : ''
                                }`}
                              >
                                <div className="flex items-center gap-3">
                                  <span className="font-mono font-bold w-6 text-slate-600">
                                    {p.number > 0 ? p.number : '?'}
                                  </span>
                                  <span className="font-medium text-slate-800">{p.name}</span>
                                </div>
                                <div className="text-[11px]">
                                  {!p.isValid && (
                                    <span className="text-rose-600 font-semibold">{p.error}</span>
                                  )}
                                  {p.isValid && p.isIdenticalName && (
                                    <span className="text-amber-700 font-medium">Aviso: nome repetido na turma</span>
                                  )}
                                  {p.isValid && !p.isIdenticalName && (
                                    <span className="text-emerald-600 font-medium">✓ Pronto</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="mt-8 pt-6 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              {step > 1 && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => setStep((s) => s - 1)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium text-sm rounded-lg flex items-center gap-1.5 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" /> Anterior
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              {/* Save and resume later */}
              <button
                type="button"
                disabled={loading}
                onClick={handleFinishWizard}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-sm rounded-lg flex items-center gap-1.5 cursor-pointer"
                title="Guarda a configuração atual e continua no painel principal"
              >
                <Save className="w-4 h-4 text-slate-500" /> Guardar e Continuar Mais Tarde
              </button>

              {step < 4 ? (
                <button
                  type="button"
                  onClick={() => {
                    if (step === 1 && (!teacherName.trim() || !academicYearName.trim())) {
                      setError('Por favor preencha o nome do professor e o ano letivo.');
                      return;
                    }
                    setError(null);
                    setStep((s) => s + 1);
                  }}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm rounded-lg shadow flex items-center gap-1.5 cursor-pointer"
                >
                  Seguinte <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleFinishWizard}
                  className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold text-sm rounded-lg shadow-md shadow-emerald-600/20 flex items-center gap-2 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {loading ? 'A gravar caderno...' : 'Concluir e Abrir Caderno'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
