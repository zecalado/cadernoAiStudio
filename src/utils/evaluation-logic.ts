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

