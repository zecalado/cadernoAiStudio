import React, { useState, useEffect } from 'react';
import { apiRequest } from '../api/client';
import { Teacher, EnrollmentStudent, EducationType } from '../types';
import { generatePautaPdf } from '../utils/pdf-export';
import {
  FileText,
  Download,
  Eye,
  CheckCircle2,
  Calendar,
  School,
  User,
  GraduationCap,
  Layers,
  Sparkles,
  Printer
} from 'lucide-react';

interface PautasExportViewProps {
  teacher: Teacher;
  classId: string;
  className: string;
  gradeLevel: string;
  courseName?: string | null;
  academicYearName: string;
  educationType: EducationType;
  students: EnrollmentStudent[];
}

export function PautasExportView({
  teacher,
  classId,
  className,
  gradeLevel,
  courseName,
  academicYearName,
  educationType,
  students,
}: PautasExportViewProps) {
  // Document type options
  const [docType, setDocType] = useState<string>(
    educationType === 'regular' ? 'regular_period' : 'prof_module'
  );

  // Filters
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('');
  const [selectedUcId, setSelectedUcId] = useState<string>('');
  const [selectedModuleId, setSelectedModuleId] = useState<string>('');

  // Raw fetched data for regular or professional
  const [regularData, setRegularData] = useState<any>(null);
  const [profData, setProfData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        if (educationType === 'regular') {
          const res = await apiRequest(`/classes/${classId}/tic`);
          setRegularData(res);
          if (res.periods && res.periods.length > 0) {
            setSelectedPeriodId(res.periods[0].period.id);
          }
        } else {
          const res = await apiRequest(`/classes/${classId}/professional`);
          setProfData(res.ucs || []);
          if (res.ucs && res.ucs.length > 0) {
            setSelectedUcId(res.ucs[0].uc.id);
            if (res.ucs[0].modules && res.ucs[0].modules.length > 0) {
              setSelectedModuleId(res.ucs[0].modules[0].module.id);
            }
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [classId, educationType]);

  // Handle UC change in filter
  const handleUcFilterChange = (ucId: string) => {
    setSelectedUcId(ucId);
    const uc = profData.find((u) => u.uc.id === ucId);
    if (uc && uc.modules && uc.modules.length > 0) {
      setSelectedModuleId(uc.modules[0].module.id);
    } else {
      setSelectedModuleId('');
    }
  };

  // Build Table Columns & Rows for Preview & PDF
  const buildPautaData = () => {
    let documentTitle = 'Pauta de Trabalho do Professor';
    let subTitle = '';
    let columns: { header: string; dataKey: string; width?: number; halign?: 'left' | 'center' | 'right' }[] = [
      { header: 'N.º', dataKey: 'number', width: 14, halign: 'center' },
      { header: 'Nome do Aluno', dataKey: 'name', halign: 'left' },
    ];
    let rows: Record<string, any>[] = [];

    if (educationType === 'regular') {
      const activePeriod = regularData?.periods?.find((p: any) => p.period.id === selectedPeriodId);
      const periodName = activePeriod?.period?.name || '1.º Período';

      if (docType === 'regular_period') {
        documentTitle = `Pauta de TIC — ${periodName}`;
        subTitle = `Classificação Final do Período Letivo`;
        columns.push({ header: `Classificação (${periodName})`, dataKey: 'finalGrade', width: 45, halign: 'center' });

        rows = students.map((st) => {
          const fg = activePeriod?.finalGrades?.find((f: any) => f.enrollment_id === st.enrollment_id);
          return {
            number: st.student_number,
            name: st.full_name,
            finalGrade: fg?.final_grade_value !== null && fg?.final_grade_value !== undefined ? fg.final_grade_value : '—',
          };
        });
      } else if (docType === 'regular_annual') {
        documentTitle = `Pauta Anual de TIC — Três Períodos`;
        subTitle = `Acompanhamento Trimestral do Ano Letivo`;
        columns.push(
          { header: '1.º Período', dataKey: 'p1', width: 28, halign: 'center' },
          { header: '2.º Período', dataKey: 'p2', width: 28, halign: 'center' },
          { header: '3.º Período', dataKey: 'p3', width: 28, halign: 'center' }
        );

        const p1 = regularData?.periods?.[0];
        const p2 = regularData?.periods?.[1];
        const p3 = regularData?.periods?.[2];

        rows = students.map((st) => {
          const g1 = p1?.finalGrades?.find((f: any) => f.enrollment_id === st.enrollment_id)?.final_grade_value;
          const g2 = p2?.finalGrades?.find((f: any) => f.enrollment_id === st.enrollment_id)?.final_grade_value;
          const g3 = p3?.finalGrades?.find((f: any) => f.enrollment_id === st.enrollment_id)?.final_grade_value;

          return {
            number: st.student_number,
            name: st.full_name,
            p1: g1 !== null && g1 !== undefined ? g1 : '—',
            p2: g2 !== null && g2 !== undefined ? g2 : '—',
            p3: g3 !== null && g3 !== undefined ? g3 : '—',
          };
        });
      } else if (docType === 'regular_detailed') {
        documentTitle = `Grelha Detalhada de TIC — ${periodName}`;
        subTitle = `Resultados por Instrumento de Avaliação`;

        const insts = activePeriod?.instruments || [];
        insts.forEach((inst: any, idx: number) => {
          columns.push({
            header: `${inst.title} (Max: ${inst.max_score})`,
            dataKey: `inst_${inst.id}`,
            halign: 'center',
          });
        });

        columns.push({ header: 'Nota Final', dataKey: 'finalGrade', width: 24, halign: 'center' });

        rows = students.map((st) => {
          const row: Record<string, any> = {
            number: st.student_number,
            name: st.full_name,
          };

          insts.forEach((inst: any) => {
            const res = activePeriod?.results?.find(
              (r: any) => r.instrument_id === inst.id && r.enrollment_id === st.enrollment_id
            );
            row[`inst_${inst.id}`] =
              res?.score_value !== null && res?.score_value !== undefined
                ? res.score_value
                : res?.special_status && res.special_status !== 'none'
                ? res.special_status === 'falta'
                  ? 'F'
                  : res.special_status === 'nao_entregou'
                  ? 'NE'
                  : res.special_status === 'nao_aplicavel'
                  ? 'NA'
                  : '—'
                : '—';
          });

          const fg = activePeriod?.finalGrades?.find((f: any) => f.enrollment_id === st.enrollment_id);
          row.finalGrade = fg?.final_grade_value !== null && fg?.final_grade_value !== undefined ? fg.final_grade_value : '—';

          return row;
        });
      }
    } else {
      // PROFESSIONAL
      const currentUc = profData.find((u) => u.uc.id === selectedUcId);
      const currentMod = currentUc?.modules?.find((m: any) => m.module.id === selectedModuleId);

      if (docType === 'prof_module') {
        documentTitle = `Pauta de Módulo: ${currentMod?.module?.code_or_number || 'Módulo'} — ${currentMod?.module?.name || ''}`;
        subTitle = `Unidade Curricular: ${currentUc?.uc?.name || ''} • Limiar: ${currentUc?.uc?.passing_threshold ?? 10} val.`;

        columns.push(
          { header: 'Classificação Final', dataKey: 'finalGrade', width: 35, halign: 'center' },
          { header: 'Estado', dataKey: 'status', width: 45, halign: 'center' }
        );

        rows = students.map((st) => {
          const fg = currentMod?.finalGrades?.find((f: any) => f.enrollment_id === st.enrollment_id);
          const statusText =
            fg?.status === 'aprovado'
              ? 'C/ Aproveitamento'
              : fg?.status === 'reprovado'
              ? 'S/ Aproveitamento'
              : fg?.status === 'em_curso'
              ? 'Em Curso'
              : 'Por Avaliar';

          return {
            number: st.student_number,
            name: st.full_name,
            finalGrade: fg?.final_grade_value !== null && fg?.final_grade_value !== undefined ? fg.final_grade_value : '—',
            status: statusText,
          };
        });
      } else if (docType === 'prof_uc') {
        documentTitle = `Pauta da Unidade Curricular: ${currentUc?.uc?.name || ''}`;
        subTitle = `Módulos Integrantes da UC • Limiar de Aprovação: ${currentUc?.uc?.passing_threshold ?? 10} val.`;

        const mods = currentUc?.modules || [];
        mods.forEach((m: any) => {
          columns.push({
            header: `${m.module.code_or_number} (${m.module.name})`,
            dataKey: `mod_${m.module.id}`,
            halign: 'center',
          });
        });

        rows = students.map((st) => {
          const row: Record<string, any> = {
            number: st.student_number,
            name: st.full_name,
          };

          mods.forEach((m: any) => {
            const fg = m.finalGrades?.find((f: any) => f.enrollment_id === st.enrollment_id);
            row[`mod_${m.module.id}`] =
              fg?.final_grade_value !== null && fg?.final_grade_value !== undefined
                ? `${fg.final_grade_value} ${fg.status === 'aprovado' ? '(C/A)' : '(S/A)'}`
                : '—';
          });

          return row;
        });
      } else if (docType === 'prof_global') {
        documentTitle = `Pauta Global da Turma: ${className}`;
        subTitle = `Organizada por Unidades Curriculares e Módulos • Curso: ${courseName || 'Geral'}`;

        profData.forEach((u: any) => {
          const ucCode = u.uc.code || u.uc.name.substring(0, 4);
          (u.modules || []).forEach((m: any) => {
            columns.push({
              header: `[${ucCode}] ${m.module.code_or_number}`,
              dataKey: `uc_${u.uc.id}_mod_${m.module.id}`,
              halign: 'center',
            });
          });
        });

        rows = students.map((st) => {
          const row: Record<string, any> = {
            number: st.student_number,
            name: st.full_name,
          };

          profData.forEach((u: any) => {
            (u.modules || []).forEach((m: any) => {
              const fg = m.finalGrades?.find((f: any) => f.enrollment_id === st.enrollment_id);
              row[`uc_${u.uc.id}_mod_${m.module.id}`] =
                fg?.final_grade_value !== null && fg?.final_grade_value !== undefined
                  ? String(fg.final_grade_value)
                  : '—';
            });
          });

          return row;
        });
      }
    }

    return { documentTitle, subTitle, columns, rows };
  };

  const pautaData = buildPautaData();

  const handleDownloadPdf = () => {
    const doc = generatePautaPdf({
      schoolName: teacher.school,
      teacherName: teacher.name,
      academicYear: academicYearName,
      className,
      courseName,
      documentTitle: pautaData.documentTitle,
      subTitle: pautaData.subTitle,
      columns: pautaData.columns,
      rows: pautaData.rows,
    });

    const safeTitle = pautaData.documentTitle.toLowerCase().replace(/[^a-z0-9]/gi, '_');
    doc.save(`${safeTitle}_${className.replace(/\s+/g, '_')}.pdf`);
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-400 text-sm">A preparar dados da pauta...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Configuration & Document Selector */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Emissão e Exportação de Pautas</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Pré-visualize e descarregue pautas em formato PDF (A4) para controlo pedagógico interno.
            </p>
          </div>

          <button
            type="button"
            onClick={handleDownloadPdf}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs sm:text-sm rounded-xl shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2 cursor-pointer transition-all"
          >
            <Download className="w-4 h-4" /> Descarregar Pauta (PDF)
          </button>
        </div>

        {/* Filters Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-100">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Tipo de Documento:</label>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer font-semibold"
            >
              {educationType === 'regular' ? (
                <>
                  <option value="regular_period">Pauta de TIC de um Período</option>
                  <option value="regular_annual">Pauta Anual de TIC (3 Períodos)</option>
                  <option value="regular_detailed">Grelha Detalhada de Instrumentos</option>
                </>
              ) : (
                <>
                  <option value="prof_module">Pauta de um Módulo de uma UC</option>
                  <option value="prof_uc">Pauta de uma UC (Todos os Módulos)</option>
                  <option value="prof_global">Pauta Global da Turma (Todas as UC)</option>
                </>
              )}
            </select>
          </div>

          {/* Conditional Secondary Selectors */}
          {educationType === 'regular' && (docType === 'regular_period' || docType === 'regular_detailed') && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Período Letivo:</label>
              <select
                value={selectedPeriodId}
                onChange={(e) => setSelectedPeriodId(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                {regularData?.periods?.map((p: any) => (
                  <option key={p.period.id} value={p.period.id}>
                    {p.period.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {educationType === 'professional' && docType !== 'prof_global' && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Unidade Curricular (UC):</label>
              <select
                value={selectedUcId}
                onChange={(e) => handleUcFilterChange(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                {profData.map((u: any) => (
                  <option key={u.uc.id} value={u.uc.id}>
                    {u.uc.code ? `[${u.uc.code}] ` : ''} {u.uc.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {educationType === 'professional' && docType === 'prof_module' && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Módulo da UC:</label>
              <select
                value={selectedModuleId}
                onChange={(e) => setSelectedModuleId(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                {profData
                  .find((u: any) => u.uc.id === selectedUcId)
                  ?.modules?.map((m: any) => (
                    <option key={m.module.id} value={m.module.id}>
                      {m.module.code_or_number} — {m.module.name}
                    </option>
                  ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* PREVIEW CONTAINER (Styled exactly like the official A4 output) */}
      <div className="bg-slate-200/70 p-4 sm:p-8 rounded-2xl flex justify-center overflow-x-auto">
        <div className="bg-white rounded-xl shadow-xl border border-slate-300 p-8 w-full max-w-4xl min-w-[700px] text-slate-900 font-sans space-y-6">
          {/* Header Bar */}
          <div className="border-t-4 border-slate-800 pt-3">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-xl font-bold tracking-tight text-slate-900">
                  {pautaData.documentTitle}
                </h3>
                <p className="text-xs text-slate-500 italic mt-0.5">
                  Pauta de trabalho do professor (documento para controlo pedagógico interno)
                </p>
                {pautaData.subTitle && (
                  <p className="text-xs font-semibold text-slate-800 mt-1">{pautaData.subTitle}</p>
                )}
              </div>

              <div className="text-right text-xs text-slate-600 space-y-0.5">
                <div>Ano Letivo: <strong>{academicYearName}</strong></div>
                <div>Turma: <strong>{className}</strong> {courseName ? `(${courseName})` : ''}</div>
              </div>
            </div>

            <div className="mt-3 pt-2 border-t border-slate-100 flex justify-between items-center text-xs text-slate-600">
              <div>
                Professor(a): <strong>{teacher.name}</strong>
              </div>
              {teacher.school && (
                <div>
                  Escola: <strong>{teacher.school}</strong>
                </div>
              )}
            </div>
          </div>

          {/* Table Preview */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-200">
                <tr>
                  {pautaData.columns.map((col, idx) => (
                    <th
                      key={col.dataKey}
                      className={`py-2 px-3 border-r border-slate-200 last:border-r-0 ${
                        col.halign === 'center'
                          ? 'text-center'
                          : col.halign === 'right'
                          ? 'text-right'
                          : 'text-left'
                      }`}
                    >
                      {col.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pautaData.rows.map((row, rIdx) => (
                  <tr
                    key={rIdx}
                    className={rIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}
                  >
                    {pautaData.columns.map((col) => (
                      <td
                        key={col.dataKey}
                        className={`py-2 px-3 border-r border-slate-100 last:border-r-0 ${
                          col.halign === 'center'
                            ? 'text-center font-mono font-bold'
                            : col.halign === 'right'
                            ? 'text-right font-mono'
                            : 'text-left font-medium'
                        }`}
                      >
                        {row[col.dataKey] ?? '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer & Legend Preview */}
          <div className="pt-4 border-t border-slate-200 text-[11px] text-slate-500 flex flex-col sm:flex-row justify-between items-center gap-2">
            <div>
              <strong>Legenda:</strong> [F] Falta &nbsp; [NE] Não entregou &nbsp; [NA] Não aplicável &nbsp; [—] Sem avaliação &nbsp; [C/Aprov.] Concluído com aproveitamento
            </div>
            <div>Página 1 de 1</div>
          </div>
        </div>
      </div>
    </div>
  );
}
