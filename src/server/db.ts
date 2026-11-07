import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const DB_PATH = path.resolve(process.cwd(), 'caderno_letivo.sqlite');
export const db = new Database(DB_PATH);

// Enable WAL mode for high performance concurrent reading/writing and enforce foreign keys
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS teachers (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      school TEXT,
      reset_token TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS academic_years (
      id TEXT PRIMARY KEY,
      teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      is_archived INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS classes (
      id TEXT PRIMARY KEY,
      teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
      academic_year_id TEXT NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
      name TEXT NOT NULL,
      grade_level TEXT NOT NULL,
      education_type TEXT NOT NULL,
      course_name TEXT,
      default_scale TEXT NOT NULL DEFAULT '0-20',
      is_archived INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
      full_name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS enrollments (
      id TEXT PRIMARY KEY,
      class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
      student_number INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      UNIQUE (class_id, student_number)
    );

    CREATE TABLE IF NOT EXISTS regular_subjects (
      id TEXT PRIMARY KEY,
      class_id TEXT NOT NULL UNIQUE REFERENCES classes(id) ON DELETE CASCADE,
      name TEXT NOT NULL DEFAULT 'TIC',
      scale TEXT NOT NULL DEFAULT '0-20'
    );

    CREATE TABLE IF NOT EXISTS regular_periods (
      id TEXT PRIMARY KEY,
      regular_subject_id TEXT NOT NULL REFERENCES regular_subjects(id) ON DELETE CASCADE,
      period_number INTEGER NOT NULL,
      name TEXT NOT NULL,
      UNIQUE (regular_subject_id, period_number)
    );

    CREATE TABLE IF NOT EXISTS professional_ucs (
      id TEXT PRIMARY KEY,
      class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      code TEXT,
      name TEXT NOT NULL,
      scale TEXT NOT NULL DEFAULT '0-20',
      passing_threshold REAL NOT NULL DEFAULT 10,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS professional_modules (
      id TEXT PRIMARY KEY,
      uc_id TEXT NOT NULL REFERENCES professional_ucs(id) ON DELETE CASCADE,
      code_or_number TEXT NOT NULL,
      name TEXT NOT NULL,
      hours INTEGER,
      order_index INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS instruments (
      id TEXT PRIMARY KEY,
      context_type TEXT NOT NULL,
      context_id TEXT NOT NULL,
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      max_score REAL NOT NULL DEFAULT 20,
      weight REAL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS student_results (
      id TEXT PRIMARY KEY,
      instrument_id TEXT NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
      enrollment_id TEXT NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
      score_value REAL,
      special_status TEXT NOT NULL DEFAULT 'none',
      notes TEXT,
      updated_at TEXT NOT NULL,
      UNIQUE (instrument_id, enrollment_id)
    );

    CREATE TABLE IF NOT EXISTS final_grades (
      id TEXT PRIMARY KEY,
      context_type TEXT NOT NULL,
      context_id TEXT NOT NULL,
      enrollment_id TEXT NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
      final_grade_value REAL,
      is_confirmed INTEGER DEFAULT 0,
      completion_date TEXT,
      status TEXT NOT NULL DEFAULT 'por_avaliar',
      confirmed_at TEXT,
      UNIQUE (context_type, context_id, enrollment_id)
    );

    CREATE TABLE IF NOT EXISTS recovery_attempts (
      id TEXT PRIMARY KEY,
      final_grade_id TEXT NOT NULL REFERENCES final_grades(id) ON DELETE CASCADE,
      enrollment_id TEXT NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
      attempt_number INTEGER NOT NULL,
      date TEXT NOT NULL,
      score_value REAL NOT NULL,
      observations TEXT,
      is_active_final INTEGER DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
      enrollment_id TEXT NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
      context_type TEXT NOT NULL,
      context_id TEXT,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS invitations (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      created_by_teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
      recipient_email TEXT,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      used_by_teacher_id TEXT REFERENCES teachers(id),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS student_accommodations (
      id TEXT PRIMARY KEY,
      enrollment_id TEXT NOT NULL UNIQUE REFERENCES enrollments(id) ON DELETE CASCADE,
      has_dl54 INTEGER DEFAULT 0,
      measures TEXT,
      details TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS classroom_notes (
      id TEXT PRIMARY KEY,
      teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
      enrollment_id TEXT NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
      class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      note TEXT NOT NULL,
      date TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS observation_rubrics (
      id TEXT PRIMARY KEY,
      teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
      class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rubric_criteria (
      id TEXT PRIMARY KEY,
      rubric_id TEXT NOT NULL REFERENCES observation_rubrics(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      weight REAL DEFAULT 1,
      max_points REAL DEFAULT 5,
      levels_json TEXT,
      order_index INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS student_rubric_evaluations (
      id TEXT PRIMARY KEY,
      rubric_id TEXT NOT NULL REFERENCES observation_rubrics(id) ON DELETE CASCADE,
      enrollment_id TEXT NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
      context_type TEXT NOT NULL,
      context_id TEXT NOT NULL,
      scores_json TEXT NOT NULL,
      total_score REAL NOT NULL,
      converted_grade REAL,
      notes TEXT,
      updated_at TEXT NOT NULL,
      UNIQUE (rubric_id, enrollment_id, context_id)
    );

    CREATE TABLE IF NOT EXISTS lesson_summaries (
      id TEXT PRIMARY KEY,
      teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
      class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      lesson_number INTEGER NOT NULL,
      date TEXT NOT NULL,
      title TEXT NOT NULL,
      summary_text TEXT NOT NULL,
      module_or_domain TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS attendance_sessions (
      id TEXT PRIMARY KEY,
      teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
      class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      lesson_number INTEGER NOT NULL,
      duration_blocks INTEGER DEFAULT 1,
      summary_id TEXT REFERENCES lesson_summaries(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS attendance_records (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
      enrollment_id TEXT NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      notes TEXT,
      UNIQUE(session_id, enrollment_id)
    );
  `);
}

export function generateId(): string {
  return crypto.randomUUID();
}
