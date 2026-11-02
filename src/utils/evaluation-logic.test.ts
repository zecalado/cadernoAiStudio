import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidScoreForScale,
  isValidInstrumentScore,
  calculateWeightedProposal,
  resolveModuleStatus,
  resolveActiveGradeWithRecoveries,
  parseStudentsInput,
  checkInvitationStatus,
  type InstrumentWeightItem,
  type RecoveryAttemptRecord,
} from './evaluation-logic';

test('scale validation respects boundaries', () => {
  assert.equal(isValidScoreForScale(3, '1-5'), true);
  assert.equal(isValidScoreForScale(5, '1-5'), true);
  assert.equal(isValidScoreForScale(6, '1-5'), false);
  assert.equal(isValidScoreForScale(0, '1-5'), false);

  assert.equal(isValidScoreForScale(14.5, '0-20'), true);
  assert.equal(isValidScoreForScale(20, '0-20'), true);
  assert.equal(isValidScoreForScale(21, '0-20'), false);
  assert.equal(isValidScoreForScale(-1, '0-20'), false);

  assert.equal(isValidScoreForScale(85, '0-100'), true);
  assert.equal(isValidScoreForScale(101, '0-100'), false);
});

test('instrument score validation against maxScore', () => {
  assert.equal(isValidInstrumentScore(18, 20), true);
  assert.equal(isValidInstrumentScore(20, 20), true);
  assert.equal(isValidInstrumentScore(20.5, 20), false);
  assert.equal(isValidInstrumentScore(-2, 20), false);
});

test('weighted proposal normalizes and detects missing entries', () => {
  const instruments: InstrumentWeightItem[] = [
    { id: '1', title: 'Teste 1', maxScore: 100, weight: 60, scoreValue: 80 },
    { id: '2', title: 'Trabalho 1', maxScore: 20, weight: 40, scoreValue: 16 },
  ];

  // 80/100 = 0.8 -> on 0-20 scale = 16. 16 * 60% = 9.6
  // 16/20 = 0.8 -> on 0-20 scale = 16. 16 * 40% = 6.4
  // Total = 16.0
  const result = calculateWeightedProposal(instruments, '0-20');
  assert.equal(result.isValidWeights, true);
  assert.equal(result.totalWeight, 100);
  assert.equal(result.proposedGrade, 16);
  assert.equal(result.missingInstruments.length, 0);

  // Missing result test
  const withMissing: InstrumentWeightItem[] = [
    { id: '1', title: 'Teste 1', maxScore: 100, weight: 50, scoreValue: 70 },
    { id: '2', title: 'Trabalho 1', maxScore: 20, weight: 50, scoreValue: null },
  ];
  const missingResult = calculateWeightedProposal(withMissing, '0-20');
  assert.equal(missingResult.isValidWeights, true);
  assert.deepEqual(missingResult.missingInstruments, ['Trabalho 1']);
});

test('resolveModuleStatus correctly flags approved, failed, in course and to grade', () => {
  // Not confirmed yet
  assert.equal(resolveModuleStatus(null, 10, false, false), 'por_avaliar');
  assert.equal(resolveModuleStatus(null, 10, false, true), 'em_curso');
  assert.equal(resolveModuleStatus(14, 10, false, true), 'em_curso');

  // Confirmed
  assert.equal(resolveModuleStatus(14, 10, true, true), 'aprovado');
  assert.equal(resolveModuleStatus(9.4, 10, true, true), 'reprovado');
  assert.equal(resolveModuleStatus(10, 10, true, true), 'aprovado');
});

test('recovery attempts preserve history and designation of active grade', () => {
  const recoveries: RecoveryAttemptRecord[] = [
    {
      id: 'rec-1',
      attemptNumber: 1,
      date: '2026-10-15',
      scoreValue: 8,
      observations: 'Primeira tentativa',
      isActiveFinal: false,
    },
    {
      id: 'rec-2',
      attemptNumber: 2,
      date: '2026-11-01',
      scoreValue: 12,
      observations: 'Recuperação com aproveitamento',
      isActiveFinal: true,
    },
  ];

  const result = resolveActiveGradeWithRecoveries(6, recoveries);
  assert.equal(result.activeGrade, 12);
  assert.equal(result.source, 'recovery');
  assert.equal(result.activeAttempt?.attemptNumber, 2);
});

test('parseStudentsInput handles csv, pasted lists, and flags duplicates and alerts identical names', () => {
  const rawData = `
    1; Ana Costa
    2, Bernardo Silva
    3 - Carlos Mendes
    3; Daniel Oliveira
    5; Ana Costa
    Linha sem numero
  `;

  const rows = parseStudentsInput(rawData);
  assert.equal(rows.length, 6);

  // Row 1 (Ana Costa) - valid but alert for identical name with row 5
  assert.equal(rows[0].number, 1);
  assert.equal(rows[0].name, 'Ana Costa');
  assert.equal(rows[0].isValid, true);
  assert.equal(rows[0].isIdenticalName, true);

  // Row 2 (Bernardo)
  assert.equal(rows[1].number, 2);
  assert.equal(rows[1].isValid, true);

  // Rows 3 & 4 have duplicate number 3
  assert.equal(rows[2].number, 3);
  assert.equal(rows[2].isDuplicateNumber, true);
  assert.equal(rows[2].isValid, false);
  assert.equal(rows[3].number, 3);
  assert.equal(rows[3].isDuplicateNumber, true);
  assert.equal(rows[3].isValid, false);

  // Row 6 is invalid
  assert.equal(rows[5].isValid, false);
});

test('checkInvitationStatus identifies valid, used and expired states correctly', () => {
  const now = new Date('2026-11-02T10:00:00Z');

  // Valid
  const validInv = { expires_at: '2026-11-09T10:00:00Z', used_at: null };
  assert.equal(checkInvitationStatus(validInv, now).status, 'valid');

  // Used
  const usedInv = { expires_at: '2026-11-09T10:00:00Z', used_at: '2026-11-02T09:00:00Z' };
  assert.equal(checkInvitationStatus(usedInv, now).status, 'used');

  // Expired
  const expiredInv = { expires_at: '2026-11-01T10:00:00Z', used_at: null };
  assert.equal(checkInvitationStatus(expiredInv, now).status, 'expired');
});

