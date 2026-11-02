export type EducationType = 'regular' | 'professional';
export type GradeScale = '1-5' | '0-20' | '0-100';
export type StudentStatus = 'active' | 'transferred' | 'inactive';
export type SpecialStatus = 'none' | 'sem_avaliacao' | 'falta' | 'nao_entregou' | 'nao_aplicavel';
export type ModuleStatus = 'por_avaliar' | 'em_curso' | 'aprovado' | 'reprovado';

export interface Teacher {
  id: string;
  email: string;
  name: string;
  school?: string | null;
}

export interface AcademicYear {
  id: string;
  teacher_id: string;
  name: string;
  is_active: number;
  is_archived: number;
  created_at: string;
}

export interface ClassItem {
  id: string;
  teacher_id: string;
  academic_year_id: string;
  name: string;
  grade_level: string;
  education_type: EducationType;
  course_name?: string | null;
  default_scale: GradeScale;
  is_archived: number;
  created_at: string;
  active_students_count?: number;
  total_students_count?: number;
  academic_year_name?: string;
}

export interface EnrollmentStudent {
  enrollment_id: string;
  student_number: number;
  status: StudentStatus;
  student_id: string;
  full_name: string;
}

export interface RegularSubject {
  id: string;
  class_id: string;
  name: string;
  scale: GradeScale;
  periods?: RegularPeriod[];
}

export interface RegularPeriod {
  id: string;
  regular_subject_id: string;
  period_number: number;
  name: string;
}

export interface ProfessionalUC {
  id: string;
  class_id: string;
  code?: string | null;
  name: string;
  scale: GradeScale;
  passing_threshold: number;
  created_at: string;
  modules?: ProfessionalModule[];
}

export interface ProfessionalModule {
  id: string;
  uc_id: string;
  code_or_number: string;
  name: string;
  hours?: number | null;
  order_index: number;
  created_at: string;
}

export interface AssessmentInstrument {
  id: string;
  context_type: 'regular_period' | 'professional_module';
  context_id: string;
  title: string;
  date: string;
  max_score: number;
  weight: number;
  created_at: string;
}

export interface StudentResultItem {
  id?: string;
  instrument_id: string;
  enrollment_id: string;
  score_value: number | null;
  special_status: SpecialStatus;
  notes?: string | null;
  updated_at?: string;
}

export interface FinalGradeItem {
  id: string;
  context_type: 'regular_period' | 'professional_module';
  context_id: string;
  enrollment_id: string;
  final_grade_value: number | null;
  is_confirmed: number;
  completion_date?: string | null;
  status: ModuleStatus;
  confirmed_at?: string | null;
}

export interface RecoveryAttempt {
  id: string;
  final_grade_id: string;
  enrollment_id: string;
  attempt_number: number;
  date: string;
  score_value: number;
  observations?: string | null;
  is_active_final: number;
  created_at: string;
}

export interface TeacherComment {
  id: string;
  teacher_id: string;
  enrollment_id: string;
  context_type: 'general' | 'regular_period' | 'professional_module';
  context_id?: string | null;
  text: string;
  created_at: string;
  updated_at: string;
}

export interface TeacherInvitation {
  id: string;
  code: string;
  created_by_teacher_id: string;
  recipient_email?: string | null;
  expires_at: string;
  used_at?: string | null;
  used_by_teacher_id?: string | null;
  created_at: string;
  used_by_name?: string | null;
}

