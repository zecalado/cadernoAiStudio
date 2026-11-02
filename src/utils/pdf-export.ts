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
    doc.text(`Emitido em ${dateFormatted}`, 14, pageHeight - 6);
    doc.text(`Página ${i} de ${totalPages}`, pageWidth - 14, pageHeight - 6, { align: 'right' });
  }

  return doc;
}
