import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface PautaPdfOptions {
  schoolName?: string | null;
  teacherName: string;
  academicYear: string;
  className: string;
  courseName?: string | null;
  documentTitle: string; // e.g. "Pauta de TIC — 1.º Período", "Pauta Anual de TIC", "Pauta da UC: PSI"
  subTitle?: string;
  columns: { header: string; dataKey: string; width?: number; halign?: 'left' | 'center' | 'right' }[];
  rows: Record<string, any>[];
  legendItems?: { code: string; label: string }[];
  orientation?: 'portrait' | 'landscape';
}

/**
 * Generates an official teacher working grade sheet PDF in A4 format.
 * Includes header, pagination ("Página X de Y"), date, table styling, and legend.
 * Strictly excludes any private teacher comments.
 */
export function generatePautaPdf(options: PautaPdfOptions): jsPDF {
  const orientation = options.orientation || (options.columns.length > 6 ? 'landscape' : 'portrait');
  const doc = new jsPDF({
    orientation,
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const now = new Date();
  const dateFormatted = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} às ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  // Header drawing function
  const drawHeader = () => {
    // Top bar badge
    doc.setFillColor(30, 41, 59); // Slate-800
    doc.rect(14, 10, pageWidth - 28, 1.5, 'F');

    // Title & Teacher Note
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(30, 41, 59);
    doc.text(options.documentTitle, 14, 18);

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Pauta de trabalho do professor (documento para controlo pedagógico interno)', 14, 23);

    // Metadata grid (Left and Right)
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);

    // Left Column
    const schoolText = options.schoolName ? `Escola / Instituição: ${options.schoolName}` : null;
    let leftY = 29;
    if (schoolText) {
      doc.text(schoolText, 14, leftY);
      leftY += 5;
    }
    doc.text(`Professor(a): ${options.teacherName}`, 14, leftY);

    // Right Column
    let rightY = 29;
    doc.text(`Ano Letivo: ${options.academicYear}`, pageWidth - 14, rightY, { align: 'right' });
    rightY += 5;
    const classDetail = options.courseName ? `Turma: ${options.className} (${options.courseName})` : `Turma: ${options.className}`;
    doc.text(classDetail, pageWidth - 14, rightY, { align: 'right' });

    // Subtitle if present
    if (options.subTitle) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.text(options.subTitle, 14, Math.max(leftY, rightY) + 6);
    }
  };

  const startY = options.schoolName ? 42 : 38;

  // Prepare autoTable headers and body
  const tableHeaders = options.columns.map(col => col.header);
  const tableBody = options.rows.map(row => {
    return options.columns.map(col => {
      const val = row[col.dataKey];
      return val !== undefined && val !== null ? String(val) : '—';
    });
  });

  const columnStyles: Record<number, any> = {};
  options.columns.forEach((col, index) => {
    columnStyles[index] = {
      halign: col.halign || (index === 1 ? 'left' : 'center'),
    };
    if (col.width) {
      columnStyles[index].cellWidth = col.width;
    }
  });

  autoTable(doc, {
    startY,
    head: [tableHeaders],
    body: tableBody,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8.5,
      cellPadding: 2.2,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: 8.5,
      halign: 'center',
    },
    columnStyles,
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    didDrawPage: (_data) => {
      drawHeader();
    },
    margin: { top: startY, left: 14, right: 14, bottom: 22 },
  });

  // Footer & Legend on all pages
  const totalPages = (doc as any).internal.getNumberOfPages();
  const defaultLegend = [
    { code: 'F', label: 'Falta à avaliação' },
    { code: 'NE', label: 'Não entregou' },
    { code: 'NA', label: 'Não aplicável' },
    { code: '—', label: 'Sem avaliação' },
    { code: 'C/Aprov.', label: 'Concluído com aproveitamento' },
    { code: 'S/Aprov.', label: 'Sem aproveitamento' },
  ];
  const legendList = options.legendItems || defaultLegend;

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    // Legend line at the bottom
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);

    const legendStr = 'Legenda: ' + legendList.map(item => `[${item.code}] ${item.label}`).join('   ');
    doc.text(legendStr, 14, pageHeight - 11);

    // Footer bottom line
    doc.setDrawColor(226, 232, 240);
    doc.line(14, pageHeight - 15, pageWidth - 14, pageHeight - 15);

    doc.setFontSize(8);
    doc.text(`Caderno Letivo • AEGP • Desenvolvido por José Calado • Emitido em ${dateFormatted}`, 14, pageHeight - 6);
    doc.text(`Página ${i} de ${totalPages}`, pageWidth - 14, pageHeight - 6, { align: 'right' });
  }

  return doc;
}

export interface StudentProgressReportOptions {
  schoolName?: string | null;
  teacherName: string;
  academicYear: string;
  className: string;
  courseName?: string | null;
  student: {
    studentNumber: number;
    fullName: string;
    status: string;
  };
  educationType: 'regular' | 'professional';
  scale: string;
  regularRecords?: {
    periodName: string;
    instruments: { title: string; score: string; maxScore: number }[];
    finalGrade: string | number;
    statusText: string;
  }[];
  professionalRecords?: {
    ucName: string;
    modules: {
      codeOrNumber: string;
      name: string;
      hours?: number | null;
      grade: string | number;
      status: string;
      completionDate?: string | null;
    }[];
  }[];
  pedagogicalObservations?: string[];
}

/**
 * Generates an official, elegant A4 Student Progress Report (Boletim Pedagógico Individual).
 * Designed for handing over to the Class Director (Diretor de Turma) or Parents in meetings.
 */
export function generateStudentProgressReportPdf(options: StudentProgressReportOptions): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const now = new Date();
  const dateFormatted = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

  // Top Accent Bar
  doc.setFillColor(37, 99, 235); // Blue-600
  doc.rect(14, 12, pageWidth - 28, 2.5, 'F');

  // School & Document Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(15, 23, 42);
  doc.text('BOLETIM PEDAGÓGICO INDIVIDUAL', 14, 23);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text('Registo de aproveitamento e acompanhamento das aprendizagens', 14, 28);

  // Institution Box
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, 32, pageWidth - 28, 22, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  doc.text('Escola / Agrupamento:', 18, 38);
  doc.setFont('helvetica', 'normal');
  doc.text(options.schoolName || 'Não especificada', 58, 38);

  doc.setFont('helvetica', 'bold');
  doc.text('Professor(a):', 18, 44);
  doc.setFont('helvetica', 'normal');
  doc.text(options.teacherName, 58, 44);

  doc.setFont('helvetica', 'bold');
  doc.text('Ano Letivo:', 18, 50);
  doc.setFont('helvetica', 'normal');
  doc.text(options.academicYear, 58, 50);

  doc.setFont('helvetica', 'bold');
  doc.text('Turma:', pageWidth / 2 + 10, 38);
  doc.setFont('helvetica', 'normal');
  doc.text(options.className, pageWidth / 2 + 30, 38);

  if (options.courseName) {
    doc.setFont('helvetica', 'bold');
    doc.text('Curso:', pageWidth / 2 + 10, 44);
    doc.setFont('helvetica', 'normal');
    doc.text(options.courseName, pageWidth / 2 + 30, 44);
  }

  // Student Identity Box
  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(239, 246, 255); // Light blue tint
  doc.roundedRect(14, 58, pageWidth - 28, 16, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(29, 78, 216);
  doc.text(`N.º ${options.student.studentNumber} — ${options.student.fullName}`, 18, 66);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  const statusStr = options.student.status === 'active' ? 'Matrícula Ativa' : options.student.status === 'transferred' ? 'Transferido' : 'Inativo';
  doc.text(`Situação: ${statusStr} • Escala de Referência: ${options.scale}`, 18, 71);

  let currentY = 80;

  if (options.educationType === 'regular' && options.regularRecords) {
    // Regular Education: TIC by periods
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text('Disciplina: Tecnologias da Informação e Comunicação (TIC)', 14, currentY);
    currentY += 4;

    const tableRows: any[] = [];
    options.regularRecords.forEach(rec => {
      const instrumentsText = rec.instruments && rec.instruments.length > 0
        ? rec.instruments.map(i => `${i.title}: ${i.score}`).join(' | ')
        : 'Nenhum instrumento formal registado';

      tableRows.push([
        rec.periodName,
        instrumentsText,
        rec.finalGrade !== '-' && rec.finalGrade !== undefined ? String(rec.finalGrade) : '—',
        rec.statusText,
      ]);
    });

    autoTable(doc, {
      startY: currentY,
      head: [['Período Escolar', 'Instrumentos e Trabalhos Realizados', 'Classificação', 'Situação']],
      body: tableRows,
      theme: 'grid',
      styles: { fontSize: 8.5, cellPadding: 3 },
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 32, fontStyle: 'bold' },
        1: { cellWidth: 90 },
        2: { cellWidth: 28, halign: 'center', fontStyle: 'bold' },
        3: { cellWidth: 32, halign: 'center' },
      },
      margin: { left: 14, right: 14 },
    });

    currentY = (doc as any).lastAutoTable.finalY + 8;
  } else if (options.educationType === 'professional' && options.professionalRecords) {
    // Professional: UCs and Modules
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text('Unidades Curriculares e Módulos Formativos', 14, currentY);
    currentY += 4;

    const tableRows: any[] = [];
    options.professionalRecords.forEach(uc => {
      tableRows.push([
        { content: `UC: ${uc.ucName}`, colSpan: 5, styles: { fillColor: [241, 245, 249], fontStyle: 'bold', textColor: [30, 41, 59] } },
      ]);
      uc.modules.forEach(m => {
        tableRows.push([
          `Mód. ${m.codeOrNumber}`,
          m.name,
          m.hours ? `${m.hours}h` : '—',
          m.grade !== '-' && m.grade !== undefined ? String(m.grade) : '—',
          m.status === 'aprovado' ? 'Concluído com aproveitamento' : m.status === 'reprovado' ? 'Sem aproveitamento' : m.status === 'em_curso' ? 'Em curso' : 'Por avaliar',
        ]);
      });
    });

    autoTable(doc, {
      startY: currentY,
      head: [['Módulo', 'Designação do Módulo', 'Carga', 'Classificação', 'Estado de Aproveitamento']],
      body: tableRows,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2.2 },
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 22, fontStyle: 'bold' },
        1: { cellWidth: 80 },
        2: { cellWidth: 16, halign: 'center' },
        3: { cellWidth: 26, halign: 'center', fontStyle: 'bold' },
        4: { cellWidth: 38, halign: 'center' },
      },
      margin: { left: 14, right: 14 },
    });

    currentY = (doc as any).lastAutoTable.finalY + 8;
  }

  // Pedagogical Observations section
  if (options.pedagogicalObservations && options.pedagogicalObservations.length > 0) {
    if (currentY > pageHeight - 65) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(30, 41, 59);
    doc.text('Observações Pedagógicas / Registo de Evolução:', 14, currentY);
    currentY += 4;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);

    options.pedagogicalObservations.forEach(obs => {
      const splitLines = doc.splitTextToSize(`• ${obs}`, pageWidth - 28);
      doc.text(splitLines, 14, currentY);
      currentY += splitLines.length * 4 + 2;
    });

    currentY += 4;
  }

  // Formal Signatures Footer Box
  if (currentY > pageHeight - 48) {
    doc.addPage();
    currentY = 25;
  } else {
    currentY = Math.max(currentY + 6, pageHeight - 45);
  }

  doc.setDrawColor(203, 213, 225);
  doc.line(14, currentY, pageWidth - 14, currentY);
  currentY += 8;

  const colWidth = (pageWidth - 28) / 3;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);

  // Column 1: Professor
  doc.text('O(A) Professor(a):', 14, currentY);
  doc.line(14, currentY + 14, 14 + colWidth - 8, currentY + 14);

  // Column 2: Diretor de Turma
  doc.text('O(A) Diretor(a) de Turma:', 14 + colWidth, currentY);
  doc.line(14 + colWidth, currentY + 14, 14 + colWidth * 2 - 8, currentY + 14);

  // Column 3: Encarregado de Educação
  doc.text('O(A) Encarregado(a) de Educação:', 14 + colWidth * 2, currentY);
  doc.line(14 + colWidth * 2, currentY + 14, pageWidth - 14, currentY + 14);

  // Bottom timestamp & page
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text(`Caderno Letivo • AEGP • Desenvolvido por José Calado • Emitido em ${dateFormatted}`, 14, pageHeight - 8);
  doc.text('Documento informativo de acompanhamento pedagógico', pageWidth - 14, pageHeight - 8, { align: 'right' });

  return doc;
}

