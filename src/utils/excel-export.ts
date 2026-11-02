import * as XLSX from 'xlsx';
import { ClassItem, EnrollmentStudent, Teacher, EducationType } from '../types';

interface ExcelExportOptions {
  classItem: ClassItem;
  teacher: Teacher;
  students: EnrollmentStudent[];
  evaluationsData: any;
  stats?: any;
}

/**
 * Generates and triggers browser download of a structured .xlsx spreadsheet.
 */
export function exportClassToExcel({
  classItem,
  teacher,
  students,
  evaluationsData,
  stats,
}: ExcelExportOptions) {
  const wb = XLSX.utils.book_new();
  const isRegular = classItem.education_type === 'regular';

  // -------------------------------------------------------------
  // SHEET 1: PAUTA DA TURMA
  // -------------------------------------------------------------
  const pautaRows: any[] = [];

  // Metadata headers
  pautaRows.push(['CADERNO LETIVO - PAUTA DE AVALIAÇÃO']);
  pautaRows.push([`Escola: ${teacher.school || 'Não especificada'}`]);
  pautaRows.push([`Professor: ${teacher.name}`]);
  pautaRows.push([`Ano Letivo: ${classItem.academic_year_name || ''}`]);
  pautaRows.push([`Turma: ${classItem.name} (${classItem.grade_level})`]);
  if (!isRegular && classItem.course_name) {
    pautaRows.push([`Curso: ${classItem.course_name}`]);
  }
  pautaRows.push([`Data de Emissão: ${new Date().toLocaleDateString('pt-PT')}`]);
  pautaRows.push([]); // blank line

  if (isRegular) {
    // Regular Education Table
    const headers = [
      'N.º',
      'Nome do Aluno',
      'Estado',
      '1.º Período',
      '2.º Período',
      '3.º Período',
      'Classificação Anual / Final',
      'Situação',
    ];
    pautaRows.push(headers);

    const activeList = [...students].sort((a, b) => a.student_number - b.student_number);
    activeList.forEach((st) => {
      const p1 = evaluationsData?.p1?.[st.enrollment_id]?.final_grade_value ?? '-';
      const p2 = evaluationsData?.p2?.[st.enrollment_id]?.final_grade_value ?? '-';
      const p3 = evaluationsData?.p3?.[st.enrollment_id]?.final_grade_value ?? '-';
      const finalAnnual = evaluationsData?.annual?.[st.enrollment_id] ?? p3;
      
      let situacao = 'Em Curso';
      if (finalAnnual !== '-' && typeof finalAnnual === 'number') {
        const threshold = classItem.default_scale === '1-5' ? 3 : classItem.default_scale === '0-100' ? 50 : 10;
        situacao = finalAnnual >= threshold ? 'Aprovado' : 'Não Aprovado';
      }

      pautaRows.push([
        st.student_number,
        st.full_name,
        st.status === 'active' ? 'Ativo' : st.status === 'transferred' ? 'Transferido' : 'Inativo',
        p1,
        p2,
        p3,
        finalAnnual,
        situacao,
      ]);
    });
  } else {
    // Professional Education Table
    const ucs = evaluationsData?.ucs || [];
    const headers = ['N.º', 'Nome do Aluno', 'Estado'];

    // Collect module columns
    const moduleCols: { ucCode: string; modId: string; modName: string }[] = [];
    ucs.forEach((uc: any) => {
      (uc.modules || []).forEach((mod: any) => {
        moduleCols.push({
          ucCode: uc.code || uc.name,
          modId: mod.id,
          modName: `${uc.code ? uc.code + ' - ' : ''}M${mod.code_or_number}: ${mod.name}`,
        });
        headers.push(`${uc.code ? uc.code + ' - ' : ''}M${mod.code_or_number}`);
      });
    });
    headers.push('Módulos Concluídos');
    headers.push('Situação Global');
    pautaRows.push(headers);

    const activeList = [...students].sort((a, b) => a.student_number - b.student_number);
    activeList.forEach((st) => {
      const row: any[] = [
        st.student_number,
        st.full_name,
        st.status === 'active' ? 'Ativo' : st.status === 'transferred' ? 'Transferido' : 'Inativo',
      ];

      let completedMods = 0;
      let totalMods = moduleCols.length;

      moduleCols.forEach((col) => {
        const gradeObj = evaluationsData?.grades?.[`${col.modId}_${st.enrollment_id}`];
        const gradeVal = gradeObj?.final_grade_value;
        const status = gradeObj?.status;
        if (status === 'aprovado') completedMods++;

        row.push(gradeVal !== undefined && gradeVal !== null ? `${gradeVal} (${status === 'aprovado' ? 'Apr.' : 'Repr.'})` : '-');
      });

      row.push(`${completedMods}/${totalMods}`);
      row.push(completedMods === totalMods && totalMods > 0 ? 'Concluído' : 'Em Curso');
      pautaRows.push(row);
    });
  }

  const wsPauta = XLSX.utils.aoa_to_sheet(pautaRows);

  // Set column widths
  wsPauta['!cols'] = [
    { wch: 6 },  // N.º
    { wch: 32 }, // Nome
    { wch: 12 }, // Estado
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 22 },
    { wch: 16 },
  ];

  XLSX.utils.book_append_sheet(wb, wsPauta, 'Pauta de Avaliação');

  // -------------------------------------------------------------
  // SHEET 2: SÍNTESE ESTATÍSTICA (CONSELHO DE TURMA)
  // -------------------------------------------------------------
  if (stats) {
    const statsRows: any[] = [];
    statsRows.push(['SÍNTESE ESTATÍSTICA - CONSELHO DE TURMA']);
    statsRows.push([`Turma: ${classItem.name} | Ano Letivo: ${classItem.academic_year_name || ''}`]);
    statsRows.push([]);

    statsRows.push(['Indicador Pedagógico', 'Valor']);
    statsRows.push(['Total de Alunos Matriculados', stats.totalStudents]);
    statsRows.push(['Alunos Ativos', stats.activeStudents]);
    statsRows.push(['Média da Turma', stats.averageGrade ?? 'N/D']);
    statsRows.push(['Mediana', stats.medianGrade ?? 'N/D']);
    statsRows.push(['Classificação Mais Alta', stats.highestGrade ?? 'N/D']);
    statsRows.push(['Classificação Mais Baixa', stats.lowestGrade ?? 'N/D']);
    statsRows.push(['N.º de Avaliados com Sucesso', stats.passingCount]);
    statsRows.push(['N.º com Classificação Negativa / Insucesso', stats.failingCount]);
    statsRows.push(['Taxa de Sucesso (%)', `${stats.successRate}%`]);
    statsRows.push(['Taxa de Insucesso (%)', `${stats.failureRate}%`]);
    statsRows.push([]);

    // Grade Distribution
    if (stats.gradeDistribution && stats.gradeDistribution.length > 0) {
      statsRows.push(['Distribuição de Níveis / Classificações']);
      statsRows.push(['Escalão', 'N.º de Alunos', 'Percentagem']);
      stats.gradeDistribution.forEach((d: any) => {
        statsRows.push([d.label, d.count, `${d.percentage}%`]);
      });
      statsRows.push([]);
    }

    // At Risk Students
    if (stats.atRiskStudents && stats.atRiskStudents.length > 0) {
      statsRows.push(['Alunos em Risco Pedagógico / Módulos em Atraso']);
      statsRows.push(['N.º', 'Nome do Aluno', 'Classificação Atual', 'Motivo(s)']);
      stats.atRiskStudents.forEach((st: any) => {
        statsRows.push([
          st.student_number,
          st.student_name,
          st.current_grade ?? 'N/D',
          st.reasons.join('; '),
        ]);
      });
    }

    const wsStats = XLSX.utils.aoa_to_sheet(statsRows);
    wsStats['!cols'] = [{ wch: 38 }, { wch: 18 }, { wch: 20 }, { wch: 50 }];
    XLSX.utils.book_append_sheet(wb, wsStats, 'Síntese Conselho');
  }

  // Trigger download
  const cleanName = classItem.name.replace(/[^a-zA-Z0-9_\-]/g, '_');
  const filename = `Pauta_${cleanName}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, filename);
}
