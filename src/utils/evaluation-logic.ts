/**
 * Pure pedagogical evaluation logic for Caderno Letivo.
 * Handles scale verification, weighted proposals, professional status resolution,
 * recovery precedence, and student input parsing.
 */

export type GradeScale = '1-5' | '0-20' | '0-100';

export type SpecialStatus = 'none' | 'sem_avaliacao' | 'falta' | 'nao_entregou' | 'nao_aplicavel';

export interface ParseStudentRow {
  number: number;
  name: string;
  isValid: boolean;
  error?: string;
  isDuplicateNumber?: boolean;
  isIdenticalName?: boolean;
}

export interface InstrumentWeightItem {
  id: string;
  title: string;
  maxScore: number;
  weight: number; // e.g. 40 means 40%
  scoreValue?: number | null;
  specialStatus?: SpecialStatus;
}

export interface WeightedProposalResult {
  isValidWeights: boolean;
  totalWeight: number;
  proposedGrade: number | null;
  formulaDescription: string;
  missingInstruments: string[];
}

export type ModuleCompletionStatus = 'por_avaliar' | 'em_curso' | 'aprovado' | 'reprovado';

/**
 * Validates if a numeric score is within the allowed scale.
 */
export function isValidScoreForScale(score: number, scale: GradeScale): boolean {
  if (isNaN(score)) return false;
  switch (scale) {
    case '1-5':
      return score >= 1 && score <= 5;
    case '0-20':
      return score >= 0 && score <= 20;
    case '0-100':
      return score >= 0 && score <= 100;
    default:
      return false;
  }
}

/**
 * Validates that an instrument score does not exceed its defined maxScore.
 */
export function isValidInstrumentScore(score: number, maxScore: number): boolean {
  if (isNaN(score) || maxScore <= 0) return false;
  return score >= 0 && score <= maxScore;
}

/**
 * Computes an optional weighted proposal for a student in a period.
 * Requirements:
 * - Total weights must equal 100%.
 * - Normalizes results according to each instrument's max score, scaled to target scale.
 * - Flags missing results.
 * - Does not auto-save; returns proposal and formula for professor review.
 */
export function calculateWeightedProposal(
  instruments: InstrumentWeightItem[],
  targetScale: GradeScale = '0-20'
): WeightedProposalResult {
  const totalWeight = Math.round(instruments.reduce((sum, item) => sum + (item.weight || 0), 0) * 100) / 100;
  const isValidWeights = Math.abs(totalWeight - 100) < 0.01;

  const targetMax = targetScale === '1-5' ? 5 : targetScale === '0-100' ? 100 : 20;
  const targetMin = targetScale === '1-5' ? 1 : 0;

  const missingInstruments: string[] = [];
  let weightedSum = 0;
  const formulaParts: string[] = [];

  for (const inst of instruments) {
    const hasNumericScore = inst.scoreValue !== null && inst.scoreValue !== undefined && !isNaN(inst.scoreValue);
    if (!hasNumericScore) {
      missingInstruments.push(inst.title);
      continue;
    }

    // Normalized ratio [0, 1]
    const ratio = inst.maxScore > 0 ? inst.scoreValue! / inst.maxScore : 0;
    // Scaled score to target
    let scaledScore = targetScale === '1-5' ? 1 + ratio * 4 : ratio * targetMax;
    // Bound to scale limits
    scaledScore = Math.max(targetMin, Math.min(targetMax, scaledScore));

    const itemContribution = scaledScore * ((inst.weight || 0) / 100);
    weightedSum += itemContribution;
    formulaParts.push(`(${inst.scoreValue}/${inst.maxScore} × ${inst.weight}%)`);
  }

  const proposedGrade = formulaParts.length > 0 ? Math.round(weightedSum * 10) / 10 : null;
  const formulaDescription = formulaParts.join(' + ') + ` = ${proposedGrade ?? 'N/D'}`;

  return {
    isValidWeights,
    totalWeight,
    proposedGrade,
    formulaDescription,
    missingInstruments,
  };
}

/**
 * Resolves the professional module completion status based on confirmed final grade and threshold.
 */
export function resolveModuleStatus(
  confirmedGrade: number | null,
  passingThreshold: number,
  isConfirmed: boolean,
  hasAnyResults: boolean = false
): ModuleCompletionStatus {
  if (!isConfirmed || confirmedGrade === null) {
    return hasAnyResults ? 'em_curso' : 'por_avaliar';
  }
  return confirmedGrade >= passingThreshold ? 'aprovado' : 'reprovado';
}

export interface RecoveryAttemptRecord {
  id: string;
  attemptNumber: number;
  date: string;
  scoreValue: number;
  observations?: string;
  isActiveFinal: boolean;
}

/**
 * Determines active final grade given initial grade and recovery attempts.
 * Preserves all attempts history and clearly identifies the in-force active grade.
 */
export function resolveActiveGradeWithRecoveries(
  initialGrade: number | null,
  recoveries: RecoveryAttemptRecord[]
): { activeGrade: number | null; source: 'initial' | 'recovery'; activeAttempt?: RecoveryAttemptRecord } {
  const activeRecovery = recoveries.find(r => r.isActiveFinal);
  if (activeRecovery) {
    return {
      activeGrade: activeRecovery.scoreValue,
      source: 'recovery',
      activeAttempt: activeRecovery,
    };
  }

  // If no explicit active flag set, fallback to highest or latest recovery if specified,
  // but by default in Caderno Letivo, if any recovery exists, the latest active is used.
  if (recoveries.length > 0) {
    const latest = recoveries[recoveries.length - 1];
    return {
      activeGrade: latest.scoreValue,
      source: 'recovery',
      activeAttempt: latest,
    };
  }

  return {
    activeGrade: initialGrade,
    source: 'initial',
  };
}

/**
 * Parses raw input text (pasted list or CSV format) into validated student items.
 * Identifies duplicate numbers and warns about duplicate names.
 */
export function parseStudentsInput(rawText: string): ParseStudentRow[] {
  if (!rawText || !rawText.trim()) return [];

  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const rows: ParseStudentRow[] = [];
  const seenNumbers = new Map<number, number>(); // number -> count
  const seenNames = new Map<string, number>(); // normalized name -> count

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip common header row if found on line 0
    if (i === 0 && (line.toLowerCase().startsWith('numero') || line.toLowerCase().startsWith('nº') || line.toLowerCase().startsWith('número'))) {
      continue;
    }

    let num: number | null = null;
    let name = '';

    // Check CSV format with comma or semicolon or tab
    if (line.includes(';') || line.includes(',') || line.includes('\t')) {
      const delimiter = line.includes(';') ? ';' : line.includes('\t') ? '\t' : ',';
      const parts = line.split(delimiter).map(p => p.trim().replace(/^["']|["']$/g, ''));
      if (parts.length >= 2) {
        const parsedNum = parseInt(parts[0], 10);
        if (!isNaN(parsedNum)) {
          num = parsedNum;
          name = parts.slice(1).join(' ').trim();
        } else {
          // Maybe name is first, number is second
          const altNum = parseInt(parts[1], 10);
          if (!isNaN(altNum)) {
            num = altNum;
            name = parts[0];
          }
        }
      }
    }

    // If not matched or standard pasted text like "1 - Ana Silva" or "1. Ana Silva" or "1 Ana Silva"
    if (num === null) {
      const match = line.match(/^(\d+)[\s\.\-\–\)]+(.+)$/);
      if (match) {
        num = parseInt(match[1], 10);
        name = match[2].trim();
      } else {
        // Fallback: entire line as name, assign index placeholder
        name = line;
      }
    }

    if (num === null || isNaN(num) || num <= 0 || !name) {
      rows.push({
        number: num ?? 0,
        name: name || line,
        isValid: false,
        error: 'Linha inválida: especifique número e nome (ex: 1; Maria Silva ou 1 - Maria Silva)',
      });
      continue;
    }

    const normName = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    seenNumbers.set(num, (seenNumbers.get(num) || 0) + 1);
    seenNames.set(normName, (seenNames.get(normName) || 0) + 1);

    rows.push({
      number: num,
      name,
      isValid: true,
    });
  }

  // Second pass: mark duplicate numbers and identical names
  return rows.map(row => {
    if (!row.isValid) return row;
    const isDupNum = (seenNumbers.get(row.number) || 0) > 1;
    const normName = row.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const isDupName = (seenNames.get(normName) || 0) > 1;

    let error = row.error;
    if (isDupNum) {
      error = `Número ${row.number} repetido na lista`;
    }

    return {
      ...row,
      isValid: !isDupNum && row.isValid,
      isDuplicateNumber: isDupNum,
      isIdenticalName: isDupName,
      error,
    };
  });
}

export type InvitationState = 'valid' | 'used' | 'expired';

export function checkInvitationStatus(
  invitation: { expires_at: string; used_at?: string | null },
  nowDate: Date = new Date()
): { status: InvitationState; message?: string } {
  if (invitation.used_at) {
    return { status: 'used', message: 'Este convite já foi utilizado.' };
  }
  const expiry = new Date(invitation.expires_at);
  if (expiry.getTime() < nowDate.getTime()) {
    return { status: 'expired', message: 'Este convite expirou.' };
  }
  return { status: 'valid' };
}

/**
 * Standard DL 54/2018 (Inclusive Education) Universal & Support Measures catalogue
 */
export const DL54_MEASURES_CATALOG = [
  { id: 'tempo_extra', label: 'Tempo suplementar em instrumentos escritos (+25%)' },
  { id: 'enunciados_adaptados', label: 'Enunciados adaptados (fonte ampliada, contraste/layout claro)' },
  { id: 'fracionamento', label: 'Fracionamento de tarefas complexas em etapas orientadas' },
  { id: 'apoio_tutorial', label: 'Apoio tutorial / acompanhamento pedagógico personalizado' },
  { id: 'avaliacao_pratica', label: 'Privilegiar demonstração prática e oral no computador' },
  { id: 'pausas', label: 'Pausas programadas durante atividades de longa duração' },
  { id: 'leitura_facilitada', label: 'Esclarecimento prévio de termos e leitura orientada' },
] as const;

export interface StudentStatRecord {
  enrollmentId: string;
  studentNumber: number;
  studentName: string;
  status: 'active' | 'transferred' | 'inactive';
  currentGrade: number | null;
  uncompletedModulesCount?: number;
  missingInstrumentsCount?: number;
}

export interface DistributionBucket {
  label: string;
  count: number;
  percentage: number;
  color: string;
}

/**
 * Computes pedagogical class statistics and identifies at-risk students for Class Council meetings.
 */
export function calculateClassStatistics(
  students: StudentStatRecord[],
  scale: GradeScale = '0-20',
  passingThreshold: number = scale === '1-5' ? 3 : scale === '0-100' ? 50 : 10
) {
  const activeStudents = students.filter(s => s.status === 'active');
  const grades = activeStudents
    .map(s => s.currentGrade)
    .filter((g): g is number => g !== null && g !== undefined && !isNaN(g));

  const totalActive = activeStudents.length;
  const gradedCount = grades.length;

  let averageGrade: number | null = null;
  let medianGrade: number | null = null;
  let highestGrade: number | null = null;
  let lowestGrade: number | null = null;
  let passingCount = 0;
  let failingCount = 0;

  if (gradedCount > 0) {
    const sum = grades.reduce((acc, curr) => acc + curr, 0);
    averageGrade = Math.round((sum / gradedCount) * 10) / 10;

    const sorted = [...grades].sort((a, b) => a - b);
    highestGrade = sorted[sorted.length - 1];
    lowestGrade = sorted[0];

    const mid = Math.floor(sorted.length / 2);
    medianGrade = sorted.length % 2 !== 0 ? sorted[mid] : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;

    passingCount = grades.filter(g => g >= passingThreshold).length;
    failingCount = grades.filter(g => g < passingThreshold).length;
  }

  const successRate = gradedCount > 0 ? Math.round((passingCount / gradedCount) * 100) : 0;
  const failureRate = gradedCount > 0 ? Math.round((failingCount / gradedCount) * 100) : 0;

  // Grade distribution buckets
  let gradeDistribution: DistributionBucket[] = [];
  if (scale === '1-5') {
    const buckets = [
      { label: 'Nível 1', count: 0, color: 'bg-red-500' },
      { label: 'Nível 2', count: 0, color: 'bg-amber-500' },
      { label: 'Nível 3', count: 0, color: 'bg-blue-500' },
      { label: 'Nível 4', count: 0, color: 'bg-emerald-500' },
      { label: 'Nível 5', count: 0, color: 'bg-teal-600' },
    ];
    grades.forEach(g => {
      const rounded = Math.round(g);
      if (rounded >= 1 && rounded <= 5) {
        buckets[rounded - 1].count++;
      }
    });
    gradeDistribution = buckets.map(b => ({
      ...b,
      percentage: gradedCount > 0 ? Math.round((b.count / gradedCount) * 100) : 0,
    }));
  } else if (scale === '0-100') {
    const buckets = [
      { label: '0 - 49%', count: 0, color: 'bg-red-500' },
      { label: '50 - 69%', count: 0, color: 'bg-amber-500' },
      { label: '70 - 89%', count: 0, color: 'bg-emerald-500' },
      { label: '90 - 100%', count: 0, color: 'bg-teal-600' },
    ];
    grades.forEach(g => {
      if (g < 50) buckets[0].count++;
      else if (g < 70) buckets[1].count++;
      else if (g < 90) buckets[2].count++;
      else buckets[3].count++;
    });
    gradeDistribution = buckets.map(b => ({
      ...b,
      percentage: gradedCount > 0 ? Math.round((b.count / gradedCount) * 100) : 0,
    }));
  } else {
    // 0-20 scale
    const buckets = [
      { label: '0 - 9 val (Não Satisfaz)', count: 0, color: 'bg-red-500' },
      { label: '10 - 13 val (Suficiente)', count: 0, color: 'bg-amber-500' },
      { label: '14 - 17 val (Bom)', count: 0, color: 'bg-emerald-500' },
      { label: '18 - 20 val (Excelente)', count: 0, color: 'bg-teal-600' },
    ];
    grades.forEach(g => {
      if (g < 10) buckets[0].count++;
      else if (g < 14) buckets[1].count++;
      else if (g < 18) buckets[2].count++;
      else buckets[3].count++;
    });
    gradeDistribution = buckets.map(b => ({
      ...b,
      percentage: gradedCount > 0 ? Math.round((b.count / gradedCount) * 100) : 0,
    }));
  }

  // Identify at-risk students
  const atRiskStudents: {
    enrollment_id: string;
    student_number: number;
    student_name: string;
    current_grade?: number | null;
    reasons: string[];
  }[] = [];

  for (const s of activeStudents) {
    const reasons: string[] = [];

    if (s.currentGrade !== null && s.currentGrade !== undefined && s.currentGrade < passingThreshold) {
      reasons.push(`Classificação atual (${s.currentGrade}) inferior ao limiar (${passingThreshold})`);
    }

    if (s.uncompletedModulesCount && s.uncompletedModulesCount > 0) {
      reasons.push(`${s.uncompletedModulesCount} módulo(s) em atraso / não concluído(s)`);
    }

    if (s.missingInstrumentsCount && s.missingInstrumentsCount >= 2) {
      reasons.push(`${s.missingInstrumentsCount} avaliações/trabalhos em falta`);
    }

    if (reasons.length > 0) {
      atRiskStudents.push({
        enrollment_id: s.enrollmentId,
        student_number: s.studentNumber,
        student_name: s.studentName,
        current_grade: s.currentGrade,
        reasons,
      });
    }
  }

  return {
    totalStudents: students.length,
    activeStudents: totalActive,
    averageGrade,
    medianGrade,
    highestGrade,
    lowestGrade,
    passingCount,
    failingCount,
    successRate,
    failureRate,
    gradeDistribution,
    atRiskStudents,
  };
}

/**
 * Calculates a rubric's final grade from selected criterion levels (1-5 points per criterion).
 */
export function calculateRubricGrade(
  criteria: { id: string; weight: number; maxPoints?: number }[],
  scores: Record<string, number>, // criterionId -> level (1-5)
  targetScale: GradeScale = '0-20'
): { totalScore: number; convertedGrade: number; maxTotalPoints: number } {
  if (criteria.length === 0) {
    return { totalScore: 0, convertedGrade: 0, maxTotalPoints: 0 };
  }

  const totalWeight = criteria.reduce((sum, c) => sum + (c.weight || 1), 0);
  let weightedPoints = 0;
  let maxWeightedPoints = 0;

  for (const criterion of criteria) {
    const maxPoints = criterion.maxPoints || 5;
    const weight = criterion.weight || 1;
    const score = scores[criterion.id] ?? 0;

    weightedPoints += (score / maxPoints) * weight;
    maxWeightedPoints += weight;
  }

  const ratio = maxWeightedPoints > 0 ? weightedPoints / maxWeightedPoints : 0;

  let convertedGrade = 0;
  if (targetScale === '1-5') {
    convertedGrade = Math.round((1 + ratio * 4) * 10) / 10;
  } else if (targetScale === '0-100') {
    convertedGrade = Math.round(ratio * 100);
  } else {
    // 0-20
    convertedGrade = Math.round(ratio * 20 * 10) / 10;
  }

  return {
    totalScore: Math.round(weightedPoints * 10) / 10,
    convertedGrade,
    maxTotalPoints: Math.round(maxWeightedPoints * 10) / 10,
  };
}

export const DEFAULT_RUBRIC_TEMPLATES = [
  {
    title: 'Grelha de Observação: Trabalho Prático / Projeto TIC',
    description: 'Avaliação multidimensional de projetos informáticos, trabalhos práticos e tarefas digitais.',
    criteria: [
      {
        name: 'Domínio Técnico e Rigor Funcional',
        weight: 35,
        max_points: 5,
        levels: [
          { level: 1, title: 'Muito Fraco', description: 'Não cumpre os requisitos técnicos; erros sistemáticos impeditivos.' },
          { level: 2, title: 'Insuficiente', description: 'Execução incompleta ou com erros que comprometem o objetivo.' },
          { level: 3, title: 'Suficiente', description: 'Cumpre os requisitos essenciais com pequenas incorreções.' },
          { level: 4, title: 'Bom', description: 'Boa resolução técnica, código/trabalho limpo e bem estruturado.' },
          { level: 5, title: 'Excelente', description: 'Domínio exemplar, soluções avançadas e criativas.' },
        ],
      },
      {
        name: 'Qualidade e Apresentação do Produto Final',
        weight: 25,
        max_points: 5,
        levels: [
          { level: 1, title: 'Muito Fraco', description: 'Apresentação negligenciada, sem estrutura percetível.' },
          { level: 2, title: 'Insuficiente', description: 'Apresentação confusa e formatação deficiente.' },
          { level: 3, title: 'Suficiente', description: 'Apresentação aceitável, legível e organizada.' },
          { level: 4, title: 'Bom', description: 'Design cuidado, consistente e de leitura fluida.' },
          { level: 5, title: 'Excelente', description: 'Acabamento profissional, esteticamente apurado e inovador.' },
        ],
      },
      {
        name: 'Autonomia e Resolução de Problemas',
        weight: 20,
        max_points: 5,
        levels: [
          { level: 1, title: 'Muito Fraco', description: 'Totalmente dependente do professor em cada etapa simples.' },
          { level: 2, title: 'Insuficiente', description: 'Dificuldade em avançar sozinho sem apoio continuado.' },
          { level: 3, title: 'Suficiente', description: 'Supera dificuldades habituais com apoio pontual.' },
          { level: 4, title: 'Bom', description: 'Grande autonomia, pesquisa ativamente soluções para desafios.' },
          { level: 5, title: 'Excelente', description: 'Autonomia plena, apoia colegas e antecipa obstáculos.' },
        ],
      },
      {
        name: 'Cooperação, Prazos e Cidadania Digital',
        weight: 20,
        max_points: 5,
        levels: [
          { level: 1, title: 'Muito Fraco', description: 'Incumprimento grave de prazos; descompromisso com o grupo.' },
          { level: 2, title: 'Insuficiente', description: 'Entregas fora de prazo ou atitude passiva na equipa.' },
          { level: 3, title: 'Suficiente', description: 'Cumpre os prazos e participa razoavelmente no trabalho.' },
          { level: 4, title: 'Bom', description: 'Pontual, colaborativo e com boa comunicação com a equipa.' },
          { level: 5, title: 'Excelente', description: 'Exemplar na liderança partilhada, pontualidade e ética digital.' },
        ],
      },
    ],
  },
];

