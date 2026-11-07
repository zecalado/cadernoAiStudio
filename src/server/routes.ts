import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { db, generateId } from './db';
import {
  parseStudentsInput,
  resolveModuleStatus,
  isValidScoreForScale,
  checkInvitationStatus,
  type GradeScale,
} from '../utils/evaluation-logic';

const JWT_SECRET = process.env.JWT_SECRET || 'caderno_letivo_secret_key_2026';

export const router = Router();

// Middleware to extract teacher from authorization header
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Não autenticado' });
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { teacherId: string; email: string };
    const teacher = db.prepare('SELECT id, email, name, school FROM teachers WHERE id = ?').get(decoded.teacherId);
    if (!teacher) {
      return res.status(401).json({ error: 'Utilizador não encontrado' });
    }
    (req as any).teacher = teacher;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Sessão inválida ou expirada' });
  }
}

// -------------------------------------------------------------
// AUTH ENDPOINTS
// -------------------------------------------------------------

router.get('/auth/status', (req: Request, res: Response) => {
  const teacherCount = (db.prepare('SELECT count(*) as count FROM teachers').get() as { count: number }).count;
  const isInitialized = teacherCount > 0;

  let currentTeacher = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(authHeader.substring(7), JWT_SECRET) as { teacherId: string };
      currentTeacher = db.prepare('SELECT id, email, name, school FROM teachers WHERE id = ?').get(decoded.teacherId);
    } catch {
      // Ignore invalid token
    }
  }

  res.json({
    initialized: isInitialized,
    teacher: currentTeacher || null,
  });
});

router.post('/auth/setup', (req: Request, res: Response) => {
  const { email, password, name, school } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Preencha o email, palavra-passe e nome.' });
  }

  const existingCount = (db.prepare('SELECT count(*) as count FROM teachers').get() as { count: number }).count;
  if (existingCount > 0) {
    return res.status(403).json({ error: 'A conta do professor já se encontra configurada.' });
  }

  const id = generateId();
  const passwordHash = bcrypt.hashSync(password, 10);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO teachers (id, email, password_hash, name, school, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, email.toLowerCase().trim(), passwordHash, name.trim(), school ? school.trim() : null, now);

  const token = jwt.sign({ teacherId: id, email: email.toLowerCase().trim() }, JWT_SECRET, { expiresIn: '7d' });
  res.json({
    token,
    teacher: { id, email: email.toLowerCase().trim(), name: name.trim(), school: school ? school.trim() : null },
  });
});

router.post('/auth/register', (req: Request, res: Response) => {
  const { email, password, name, school } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Preencha o nome, email e palavra-passe.' });
  }

  const cleanEmail = email.toLowerCase().trim();
  const cleanName = name.trim();

  if (cleanName.length < 2) {
    return res.status(400).json({ error: 'O nome do professor deve ter pelo menos 2 caracteres.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'A palavra-passe deve ter pelo menos 6 caracteres.' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return res.status(400).json({ error: 'Introduza um endereço de email válido.' });
  }

  const existingTeacher = db.prepare('SELECT id FROM teachers WHERE email = ?').get(cleanEmail);
  if (existingTeacher) {
    return res.status(400).json({ error: 'Já existe uma conta associada a este endereço de email. Inicie sessão ou redefina a palavra-passe.' });
  }

  const id = generateId();
  const passwordHash = bcrypt.hashSync(password, 10);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO teachers (id, email, password_hash, name, school, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, cleanEmail, passwordHash, cleanName, school ? school.trim() : null, now);

  const token = jwt.sign({ teacherId: id, email: cleanEmail }, JWT_SECRET, { expiresIn: '7d' });
  res.json({
    token,
    teacher: { id, email: cleanEmail, name: cleanName, school: school ? school.trim() : null },
  });
});

router.post('/auth/login', (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email e palavra-passe obrigatórios.' });
  }

  const teacher = db.prepare('SELECT * FROM teachers WHERE email = ?').get(email.toLowerCase().trim()) as any;
  if (!teacher || !bcrypt.compareSync(password, teacher.password_hash)) {
    return res.status(401).json({ error: 'Credenciais inválidas. Verifique o email e a palavra-passe.' });
  }

  const token = jwt.sign({ teacherId: teacher.id, email: teacher.email }, JWT_SECRET, { expiresIn: '7d' });
  res.json({
    token,
    teacher: { id: teacher.id, email: teacher.email, name: teacher.name, school: teacher.school },
  });
});

router.post('/auth/recover-password', (req: Request, res: Response) => {
  const { email, newPassword } = req.body;
  if (!email || !newPassword) {
    return res.status(400).json({ error: 'Preencha o email e a nova palavra-passe.' });
  }

  const teacher = db.prepare('SELECT id FROM teachers WHERE email = ?').get(email.toLowerCase().trim()) as any;
  if (!teacher) {
    return res.status(404).json({ error: 'Não foi encontrada nenhuma conta com este email.' });
  }

  const passwordHash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE teachers SET password_hash = ? WHERE id = ?').run(passwordHash, teacher.id);

  res.json({ success: true, message: 'Palavra-passe atualizada com sucesso. Pode agora iniciar sessão.' });
});

router.post('/auth/register-invite', (req: Request, res: Response) => {
  const { code, email, password, name, school } = req.body;
  if (!code || !email || !password || !name) {
    return res.status(400).json({ error: 'Preencha o código de convite, nome, email e palavra-passe.' });
  }

  const cleanCode = code.trim().toUpperCase();
  const cleanEmail = email.toLowerCase().trim();

  const invitation = db.prepare('SELECT * FROM invitations WHERE code = ?').get(cleanCode) as any;
  if (!invitation) {
    return res.status(404).json({ error: 'Código de convite inválido ou não encontrado.' });
  }

  const statusCheck = checkInvitationStatus(invitation);
  if (statusCheck.status !== 'valid') {
    return res.status(400).json({ error: statusCheck.message || 'Convite indisponível.' });
  }

  if (invitation.recipient_email && invitation.recipient_email.toLowerCase().trim() !== cleanEmail) {
    return res.status(400).json({
      error: `Este convite foi reservado exclusivamente para o email ${invitation.recipient_email}.`,
    });
  }

  const existingTeacher = db.prepare('SELECT id FROM teachers WHERE email = ?').get(cleanEmail);
  if (existingTeacher) {
    return res.status(400).json({ error: 'Já existe uma conta associada a este endereço de email.' });
  }

  const newTeacherId = generateId();
  const passwordHash = bcrypt.hashSync(password, 10);
  const now = new Date().toISOString();

  db.transaction(() => {
    db.prepare(`
      INSERT INTO teachers (id, email, password_hash, name, school, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(newTeacherId, cleanEmail, passwordHash, name.trim(), school ? school.trim() : null, now);

    db.prepare(`
      UPDATE invitations
      SET used_at = ?, used_by_teacher_id = ?
      WHERE id = ?
    `).run(now, newTeacherId, invitation.id);
  })();

  const token = jwt.sign({ teacherId: newTeacherId, email: cleanEmail }, JWT_SECRET, { expiresIn: '7d' });
  res.json({
    token,
    teacher: {
      id: newTeacherId,
      email: cleanEmail,
      name: name.trim(),
      school: school ? school.trim() : null,
    },
  });
});

router.get('/invitations/validate', (req: Request, res: Response) => {
  const code = req.query.code as string;
  if (!code) {
    return res.status(400).json({ valid: false, error: 'Código de convite não fornecido.' });
  }

  const cleanCode = code.trim().toUpperCase();
  const invitation = db.prepare('SELECT * FROM invitations WHERE code = ?').get(cleanCode) as any;
  if (!invitation) {
    return res.status(404).json({ valid: false, error: 'Código de convite inválido ou não encontrado.' });
  }

  const statusCheck = checkInvitationStatus(invitation);
  if (statusCheck.status !== 'valid') {
    return res.status(400).json({ valid: false, error: statusCheck.message || 'Convite indisponível.' });
  }

  const inviter = db.prepare('SELECT name, school FROM teachers WHERE id = ?').get(invitation.created_by_teacher_id) as any;

  res.json({
    valid: true,
    code: invitation.code,
    recipientEmail: invitation.recipient_email || null,
    expiresAt: invitation.expires_at,
    inviterName: inviter?.name || 'Colega Professor',
    inviterSchool: inviter?.school || null,
  });
});

router.get('/invitations', authMiddleware, (req: Request, res: Response) => {
  const teacherId = (req as any).teacher.id;
  const invitations = db.prepare(`
    SELECT 
      i.id,
      i.code,
      i.created_by_teacher_id,
      i.recipient_email,
      i.expires_at,
      i.used_at,
      i.used_by_teacher_id,
      i.created_at,
      t.name as used_by_name
    FROM invitations i
    LEFT JOIN teachers t ON i.used_by_teacher_id = t.id
    WHERE i.created_by_teacher_id = ?
    ORDER BY i.created_at DESC
  `).all(teacherId);

  res.json({ invitations });
});

router.post('/invitations', authMiddleware, (req: Request, res: Response) => {
  const teacherId = (req as any).teacher.id;
  const { recipientEmail, validityDays = 7 } = req.body;

  const id = generateId();
  const randomHex = crypto.randomBytes(4).toString('hex').toUpperCase();
  const code = `CL-${randomHex}`;
  const now = new Date();
  const days = Math.max(1, Math.min(30, Number(validityDays) || 7));
  const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
  const createdAt = now.toISOString();

  db.prepare(`
    INSERT INTO invitations (id, code, created_by_teacher_id, recipient_email, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, code, teacherId, recipientEmail ? recipientEmail.toLowerCase().trim() : null, expiresAt, createdAt);

  const created = db.prepare('SELECT * FROM invitations WHERE id = ?').get(id);
  res.json({ invitation: created });
});

router.delete('/invitations/:id', authMiddleware, (req: Request, res: Response) => {
  const teacherId = (req as any).teacher.id;
  const { id } = req.params;

  const existing = db.prepare('SELECT * FROM invitations WHERE id = ? AND created_by_teacher_id = ?').get(id, teacherId) as any;
  if (!existing) {
    return res.status(404).json({ error: 'Convite não encontrado ou sem permissão.' });
  }
  if (existing.used_at) {
    return res.status(400).json({ error: 'Não é possível revogar um convite que já foi utilizado.' });
  }

  db.prepare('DELETE FROM invitations WHERE id = ? AND created_by_teacher_id = ?').run(id, teacherId);
  res.json({ success: true, message: 'Convite revogado com sucesso.' });
});

router.get('/auth/me', authMiddleware, (req: Request, res: Response) => {
  res.json({ teacher: (req as any).teacher });
});

router.put('/auth/profile', authMiddleware, (req: Request, res: Response) => {
  const teacherId = (req as any).teacher.id;
  const { name, school, email } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: 'Nome e email são obrigatórios.' });
  }

  db.prepare('UPDATE teachers SET name = ?, school = ?, email = ? WHERE id = ?').run(
    name.trim(),
    school ? school.trim() : null,
    email.toLowerCase().trim(),
    teacherId
  );

  res.json({
    teacher: {
      id: teacherId,
      name: name.trim(),
      school: school ? school.trim() : null,
      email: email.toLowerCase().trim(),
    },
  });
});

// -------------------------------------------------------------
// ACADEMIC YEARS
// -------------------------------------------------------------

router.get('/academic-years', authMiddleware, (req: Request, res: Response) => {
  const teacherId = (req as any).teacher.id;
  const years = db.prepare(`
    SELECT * FROM academic_years 
    WHERE teacher_id = ? 
    ORDER BY is_active DESC, created_at DESC
  `).all(teacherId);
  res.json({ years });
});

router.post('/academic-years', authMiddleware, (req: Request, res: Response) => {
  const teacherId = (req as any).teacher.id;
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'O nome do ano letivo é obrigatório (ex: 2026/2027).' });
  }

  const id = generateId();
  const now = new Date().toISOString();

  // Set any previous active year to inactive if requested
  db.prepare('UPDATE academic_years SET is_active = 0 WHERE teacher_id = ?').run(teacherId);

  db.prepare(`
    INSERT INTO academic_years (id, teacher_id, name, is_active, is_archived, created_at)
    VALUES (?, ?, ?, 1, 0, ?)
  `).run(id, teacherId, name.trim(), now);

  const year = db.prepare('SELECT * FROM academic_years WHERE id = ?').get(id);
  res.json({ year });
});

router.post('/academic-years/:id/activate', authMiddleware, (req: Request, res: Response) => {
  const teacherId = (req as any).teacher.id;
  const yearId = req.params.id;

  db.transaction(() => {
    db.prepare('UPDATE academic_years SET is_active = 0 WHERE teacher_id = ?').run(teacherId);
    db.prepare('UPDATE academic_years SET is_active = 1 WHERE id = ? AND teacher_id = ?').run(yearId, teacherId);
  })();

  res.json({ success: true });
});

router.post('/academic-years/:id/archive', authMiddleware, (req: Request, res: Response) => {
  const teacherId = (req as any).teacher.id;
  const yearId = req.params.id;
  const { archive } = req.body; // boolean

  db.prepare('UPDATE academic_years SET is_archived = ? WHERE id = ? AND teacher_id = ?').run(
    archive ? 1 : 0,
    yearId,
    teacherId
  );

  res.json({ success: true });
});

// -------------------------------------------------------------
// CLASSES
// -------------------------------------------------------------

router.get('/classes', authMiddleware, (req: Request, res: Response) => {
  const teacherId = (req as any).teacher.id;
  const yearId = req.query.yearId as string;

  let query = `
    SELECT c.*, 
      (SELECT count(*) FROM enrollments e WHERE e.class_id = c.id AND e.status = 'active') as active_students_count,
      (SELECT count(*) FROM enrollments e WHERE e.class_id = c.id) as total_students_count
    FROM classes c
    WHERE c.teacher_id = ?
  `;
  const params: any[] = [teacherId];

  if (yearId) {
    query += ' AND c.academic_year_id = ?';
    params.push(yearId);
  }

  query += ' ORDER BY c.name ASC';

  const classes = db.prepare(query).all(...params);
  res.json({ classes });
});

router.post('/classes', authMiddleware, (req: Request, res: Response) => {
  const teacherId = (req as any).teacher.id;
  const {
    academicYearId,
    name,
    gradeLevel,
    educationType, // 'regular' | 'professional'
    courseName,
    defaultScale = '0-20',
    ucs = [], // for professional
  } = req.body;

  if (!academicYearId || !name || !gradeLevel || !educationType) {
    return res.status(400).json({ error: 'Dados obrigatórios em falta para criar a turma.' });
  }

  const classId = generateId();
  const now = new Date().toISOString();

  db.transaction(() => {
    db.prepare(`
      INSERT INTO classes (id, teacher_id, academic_year_id, name, grade_level, education_type, course_name, default_scale, is_archived, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    `).run(
      classId,
      teacherId,
      academicYearId,
      name.trim(),
      gradeLevel.trim(),
      educationType,
      courseName ? courseName.trim() : null,
      defaultScale,
      now
    );

    // If regular: automatically create TIC discipline and the 3 periods
    if (educationType === 'regular') {
      const regularSubjectId = generateId();
      db.prepare(`
        INSERT INTO regular_subjects (id, class_id, name, scale)
        VALUES (?, ?, 'TIC', ?)
      `).run(regularSubjectId, classId, defaultScale);

      const periodNames = ['1.º Período', '2.º Período', '3.º Período'];
      for (let p = 1; p <= 3; p++) {
        db.prepare(`
          INSERT INTO regular_periods (id, regular_subject_id, period_number, name)
          VALUES (?, ?, ?, ?)
        `).run(generateId(), regularSubjectId, p, periodNames[p - 1]);
      }
    }

    // If professional: add initial UCs and modules if provided
    if (educationType === 'professional' && Array.isArray(ucs)) {
      for (const uc of ucs) {
        if (!uc.name) continue;
        const ucId = generateId();
        db.prepare(`
          INSERT INTO professional_ucs (id, class_id, code, name, scale, passing_threshold, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          ucId,
          classId,
          uc.code ? uc.code.trim() : null,
          uc.name.trim(),
          uc.scale || defaultScale,
          uc.passingThreshold ?? 10,
          now
        );

        if (Array.isArray(uc.modules)) {
          let idx = 0;
          for (const mod of uc.modules) {
            if (!mod.name && !mod.codeOrNumber) continue;
            db.prepare(`
              INSERT INTO professional_modules (id, uc_id, code_or_number, name, hours, order_index, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
              generateId(),
              ucId,
              mod.codeOrNumber ? mod.codeOrNumber.trim() : `M${idx + 1}`,
              mod.name.trim(),
              mod.hours ? parseInt(mod.hours, 10) : null,
              idx++,
              now
            );
          }
        }
      }
    }
  })();

  const createdClass = db.prepare('SELECT * FROM classes WHERE id = ?').get(classId);
  res.json({ class: createdClass });
});

router.get('/classes/:id', authMiddleware, (req: Request, res: Response) => {
  const teacherId = (req as any).teacher.id;
  const classId = req.params.id;

  const classData = db.prepare(`
    SELECT c.*, y.name as academic_year_name 
    FROM classes c
    JOIN academic_years y ON y.id = c.academic_year_id
    WHERE c.id = ? AND c.teacher_id = ?
  `).get(classId, teacherId) as any;

  if (!classData) {
    return res.status(404).json({ error: 'Turma não encontrada' });
  }

  // Get enrolled students
  const studentsRaw = db.prepare(`
    SELECT e.id as enrollment_id, e.student_number, e.status, s.id as student_id, s.full_name,
           sa.has_dl54, sa.measures as sa_measures, sa.details as sa_details
    FROM enrollments e
    JOIN students s ON s.id = e.student_id
    LEFT JOIN student_accommodations sa ON sa.enrollment_id = e.id
    WHERE e.class_id = ?
    ORDER BY e.student_number ASC
  `).all(classId) as any[];

  const students = studentsRaw.map(st => ({
    enrollment_id: st.enrollment_id,
    student_number: st.student_number,
    status: st.status,
    student_id: st.student_id,
    full_name: st.full_name,
    has_dl54: Boolean(st.has_dl54),
    accommodations: st.has_dl54 ? {
      has_dl54: st.has_dl54,
      measures: st.sa_measures ? JSON.parse(st.sa_measures) : [],
      details: st.sa_details,
    } : undefined,
  }));

  // If regular: get TIC subject and 3 periods
  let regularData = null;
  if (classData.education_type === 'regular') {
    const subject = db.prepare('SELECT * FROM regular_subjects WHERE class_id = ?').get(classId) as any;
    if (subject) {
      const periods = db.prepare('SELECT * FROM regular_periods WHERE regular_subject_id = ? ORDER BY period_number ASC').all(subject.id);
      regularData = { ...subject, periods };
    }
  }

  // If professional: get UCs and modules
  let ucs = [];
  if (classData.education_type === 'professional') {
    const rawUcs = db.prepare('SELECT * FROM professional_ucs WHERE class_id = ? ORDER BY created_at ASC').all(classId) as any[];
    ucs = rawUcs.map(uc => {
      const modules = db.prepare('SELECT * FROM professional_modules WHERE uc_id = ? ORDER BY order_index ASC, created_at ASC').all(uc.id);
      return { ...uc, modules };
    });
  }

  res.json({
    class: classData,
    students,
    regularData,
    ucs,
  });
});

router.put('/classes/:id', authMiddleware, (req: Request, res: Response) => {
  const teacherId = (req as any).teacher.id;
  const classId = req.params.id;
  const { name, gradeLevel, courseName, defaultScale, isArchived } = req.body;

  db.prepare(`
    UPDATE classes 
    SET name = COALESCE(?, name),
        grade_level = COALESCE(?, grade_level),
        course_name = ?,
        default_scale = COALESCE(?, default_scale),
        is_archived = COALESCE(?, is_archived)
    WHERE id = ? AND teacher_id = ?
  `).run(
    name ? name.trim() : null,
    gradeLevel ? gradeLevel.trim() : null,
    courseName ? courseName.trim() : null,
    defaultScale,
    isArchived !== undefined ? (isArchived ? 1 : 0) : null,
    classId,
    teacherId
  );

  const updated = db.prepare('SELECT * FROM classes WHERE id = ?').get(classId);
  res.json({ class: updated });
});

router.post('/classes/:id/archive', authMiddleware, (req: Request, res: Response) => {
  const teacherId = (req as any).teacher.id;
  const classId = req.params.id;
  const { archive } = req.body;

  db.prepare('UPDATE classes SET is_archived = ? WHERE id = ? AND teacher_id = ?').run(
    archive ? 1 : 0,
    classId,
    teacherId
  );

  res.json({ success: true });
});

// -------------------------------------------------------------
// STUDENTS & ENROLLMENTS
// -------------------------------------------------------------

router.post('/classes/:classId/students/bulk', authMiddleware, (req: Request, res: Response) => {
  const teacherId = (req as any).teacher.id;
  const classId = req.params.classId;
  const { studentsText, parsedList } = req.body;

  let itemsToInsert: { number: number; name: string }[] = [];

  if (Array.isArray(parsedList) && parsedList.length > 0) {
    itemsToInsert = parsedList.filter((p: any) => p.isValid && p.number && p.name);
  } else if (studentsText) {
    const parsed = parseStudentsInput(studentsText);
    const valid = parsed.filter(p => p.isValid);
    if (valid.length === 0) {
      return res.status(400).json({ error: 'Nenhum aluno válido detetado na lista.' });
    }
    itemsToInsert = valid.map(v => ({ number: v.number, name: v.name }));
  } else {
    return res.status(400).json({ error: 'Forneça a lista de alunos a importar.' });
  }

  // Check if any numbers conflict with existing enrollments in this class
  const existingNumbers = new Set(
    (db.prepare('SELECT student_number FROM enrollments WHERE class_id = ?').all(classId) as any[]).map(e => e.student_number)
  );

  const conflicts = itemsToInsert.filter(item => existingNumbers.has(item.number));
  if (conflicts.length > 0) {
    return res.status(400).json({
      error: `Os seguintes números já se encontram registados nesta turma: ${conflicts.map(c => c.number).join(', ')}.`,
    });
  }

  const now = new Date().toISOString();
  let insertedCount = 0;

  db.transaction(() => {
    for (const item of itemsToInsert) {
      // Find or create student (separate student from enrollment)
      let student = db.prepare('SELECT id FROM students WHERE teacher_id = ? AND full_name = ? COLLATE NOCASE').get(teacherId, item.name.trim()) as any;
      let studentId = student?.id;
      if (!studentId) {
        studentId = generateId();
        db.prepare('INSERT INTO students (id, teacher_id, full_name, created_at) VALUES (?, ?, ?, ?)').run(
          studentId,
          teacherId,
          item.name.trim(),
          now
        );
      }

      // Create enrollment in this class
      const enrollmentId = generateId();
      db.prepare(`
        INSERT INTO enrollments (id, class_id, student_id, student_number, status, created_at)
        VALUES (?, ?, ?, ?, 'active', ?)
      `).run(enrollmentId, classId, studentId, item.number, now);

      insertedCount++;
    }
  })();

  const updatedStudents = db.prepare(`
    SELECT e.id as enrollment_id, e.student_number, e.status, s.id as student_id, s.full_name
    FROM enrollments e
    JOIN students s ON s.id = e.student_id
    WHERE e.class_id = ?
    ORDER BY e.student_number ASC
  `).all(classId);

  res.json({ success: true, count: insertedCount, students: updatedStudents });
});

router.post('/classes/:classId/students', authMiddleware, (req: Request, res: Response) => {
  const teacherId = (req as any).teacher.id;
  const classId = req.params.classId;
  const { studentNumber, fullName } = req.body;

  if (!studentNumber || !fullName || !fullName.trim()) {
    return res.status(400).json({ error: 'Número e nome do aluno são obrigatórios.' });
  }

  const num = parseInt(studentNumber, 10);
  if (isNaN(num) || num <= 0) {
    return res.status(400).json({ error: 'Número de aluno inválido.' });
  }

  // Check unique number in class
  const existing = db.prepare('SELECT id FROM enrollments WHERE class_id = ? AND student_number = ?').get(classId, num);
  if (existing) {
    return res.status(400).json({ error: `O número ${num} já pertence a outro aluno nesta turma.` });
  }

  const now = new Date().toISOString();
  let enrollmentId = generateId();

  db.transaction(() => {
    let student = db.prepare('SELECT id FROM students WHERE teacher_id = ? AND full_name = ? COLLATE NOCASE').get(teacherId, fullName.trim()) as any;
    let studentId = student?.id;
    if (!studentId) {
      studentId = generateId();
      db.prepare('INSERT INTO students (id, teacher_id, full_name, created_at) VALUES (?, ?, ?, ?)').run(
        studentId,
        teacherId,
        fullName.trim(),
        now
      );
    }

    db.prepare(`
      INSERT INTO enrollments (id, class_id, student_id, student_number, status, created_at)
      VALUES (?, ?, ?, ?, 'active', ?)
    `).run(enrollmentId, classId, studentId, num, now);
  })();

  const newEnrollment = db.prepare(`
    SELECT e.id as enrollment_id, e.student_number, e.status, s.id as student_id, s.full_name
    FROM enrollments e
    JOIN students s ON s.id = e.student_id
    WHERE e.id = ?
  `).get(enrollmentId);

  res.json({ enrollment: newEnrollment });
});

router.put('/enrollments/:enrollmentId', authMiddleware, (req: Request, res: Response) => {
  const enrollmentId = req.params.enrollmentId;
  const { studentNumber, fullName, status } = req.body;

  const current = db.prepare('SELECT * FROM enrollments WHERE id = ?').get(enrollmentId) as any;
  if (!current) {
    return res.status(404).json({ error: 'Inscrição não encontrada.' });
  }

  if (studentNumber !== undefined) {
    const num = parseInt(studentNumber, 10);
    if (num !== current.student_number) {
      const conflict = db.prepare('SELECT id FROM enrollments WHERE class_id = ? AND student_number = ? AND id != ?').get(
        current.class_id,
        num,
        enrollmentId
      );
      if (conflict) {
        return res.status(400).json({ error: `O número ${num} já está atribuído nesta turma.` });
      }
    }
  }

  db.transaction(() => {
    if (studentNumber !== undefined || status !== undefined) {
      db.prepare(`
        UPDATE enrollments 
        SET student_number = COALESCE(?, student_number),
            status = COALESCE(?, status)
        WHERE id = ?
      `).run(studentNumber ? parseInt(studentNumber, 10) : null, status, enrollmentId);
    }

    if (fullName && fullName.trim()) {
      db.prepare('UPDATE students SET full_name = ? WHERE id = ?').run(fullName.trim(), current.student_id);
    }
  })();

  const updated = db.prepare(`
    SELECT e.id as enrollment_id, e.student_number, e.status, s.id as student_id, s.full_name
    FROM enrollments e
    JOIN students s ON s.id = e.student_id
    WHERE e.id = ?
  `).get(enrollmentId);

  res.json({ enrollment: updated });
});

// Individual Student Profile: Ficha Individual
router.get('/students/:studentId/record', authMiddleware, (req: Request, res: Response) => {
  try {
    const studentId = req.params.studentId;
    const classId = req.query.classId as string;

    const student = db.prepare('SELECT * FROM students WHERE id = ?').get(studentId) as any;
    if (!student) {
      return res.status(404).json({ error: 'Aluno não encontrado' });
    }

  const enrollment = db.prepare(`
    SELECT e.*, c.name as class_name, c.education_type, c.grade_level, c.course_name, y.name as academic_year_name
    FROM enrollments e
    JOIN classes c ON c.id = e.class_id
    JOIN academic_years y ON y.id = c.academic_year_id
    WHERE e.student_id = ? AND e.class_id = ?
  `).get(studentId, classId) as any;

  if (!enrollment) {
    return res.status(404).json({ error: 'Inscrição do aluno não encontrada nesta turma.' });
  }

  // Get comments
  const comments = db.prepare(`
    SELECT * FROM comments 
    WHERE enrollment_id = ?
    ORDER BY created_at DESC
  `).all(enrollment.id);

  let evaluationHistory: any = {};

  if (enrollment.education_type === 'regular') {
    // TIC periods, instruments, results, final grades
    const subject = db.prepare('SELECT * FROM regular_subjects WHERE class_id = ?').get(classId) as any;
    if (subject) {
      const periods = db.prepare('SELECT * FROM regular_periods WHERE regular_subject_id = ? ORDER BY period_number ASC').all(subject.id) as any[];
      const periodData = periods.map(p => {
        const instruments = db.prepare("SELECT * FROM instruments WHERE context_type = 'regular_period' AND context_id = ? ORDER BY date ASC").all(p.id) as any[];
        const results = db.prepare(`
          SELECT r.*, i.title as instrument_title, i.max_score, i.weight
          FROM student_results r
          JOIN instruments i ON i.id = r.instrument_id
          WHERE r.enrollment_id = ? AND i.context_id = ?
        `).all(enrollment.id, p.id);

        const finalGrade = db.prepare(`
          SELECT * FROM final_grades 
          WHERE context_type = 'regular_period' AND context_id = ? AND enrollment_id = ?
        `).get(p.id, enrollment.id);

        return {
          period: p,
          instruments,
          results,
          finalGrade,
        };
      });

      evaluationHistory = { subject, periods: periodData };
    }
  } else {
    // Professional UCs and modules
    const ucs = db.prepare('SELECT * FROM professional_ucs WHERE class_id = ? ORDER BY created_at ASC').all(classId) as any[];
    const ucsData = ucs.map(uc => {
      const modules = db.prepare('SELECT * FROM professional_modules WHERE uc_id = ? ORDER BY order_index ASC').all(uc.id) as any[];
      const modulesData = modules.map(mod => {
        const instruments = db.prepare("SELECT * FROM instruments WHERE context_type = 'professional_module' AND context_id = ? ORDER BY date ASC").all(mod.id) as any[];
        const results = db.prepare(`
          SELECT r.*, i.title as instrument_title, i.max_score, i.weight
          FROM student_results r
          JOIN instruments i ON i.id = r.instrument_id
          WHERE r.enrollment_id = ? AND i.context_id = ?
        `).all(enrollment.id, mod.id);

        const finalGrade = db.prepare(`
          SELECT * FROM final_grades 
          WHERE context_type = 'professional_module' AND context_id = ? AND enrollment_id = ?
        `).get(mod.id, enrollment.id) as any;

        let recoveries: any[] = [];
        if (finalGrade) {
          recoveries = db.prepare(`
            SELECT * FROM recovery_attempts 
            WHERE final_grade_id = ? 
            ORDER BY attempt_number ASC
          `).all(finalGrade.id);
        }

        return {
          module: mod,
          instruments,
          results,
          finalGrade,
          recoveries,
        };
      });

      return {
        uc,
        modules: modulesData,
      };
    });

    evaluationHistory = { ucs: ucsData };
  }

  // Get accommodations (DL 54)
  const accommodationRow = db.prepare(`
    SELECT * FROM student_accommodations WHERE enrollment_id = ?
  `).get(enrollment.id) as any;

  const accommodations = accommodationRow ? {
    id: accommodationRow.id,
    enrollment_id: accommodationRow.enrollment_id,
    has_dl54: accommodationRow.has_dl54,
    measures: accommodationRow.measures ? JSON.parse(accommodationRow.measures) : [],
    details: accommodationRow.details,
    updated_at: accommodationRow.updated_at,
  } : null;

  // Get classroom daily notes
  const classroomNotes = db.prepare(`
    SELECT * FROM classroom_notes 
    WHERE enrollment_id = ?
    ORDER BY date DESC, created_at DESC
  `).all(enrollment.id);

  res.json({
    student,
    enrollment,
    comments,
    evaluationHistory,
    accommodations,
    classroomNotes,
  });
} catch (err: any) {
  console.error('Error in student record:', err);
  res.status(500).json({ error: err.message || 'Erro ao carregar registo do aluno' });
}
});

// -------------------------------------------------------------
// COMMENTS
// -------------------------------------------------------------

router.post('/comments', authMiddleware, (req: Request, res: Response) => {
  const teacherId = (req as any).teacher.id;
  const { enrollmentId, contextType, contextId, text } = req.body;

  if (!enrollmentId || !text || !text.trim()) {
    return res.status(400).json({ error: 'Conteúdo do comentário é obrigatório.' });
  }

  const id = generateId();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO comments (id, teacher_id, enrollment_id, context_type, context_id, text, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, teacherId, enrollmentId, contextType || 'general', contextId || null, text.trim(), now, now);

  const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(id);
  res.json({ comment });
});

router.put('/comments/:id', authMiddleware, (req: Request, res: Response) => {
  const commentId = req.params.id;
  const { text } = req.body;

  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Texto não pode estar vazio.' });
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE comments SET text = ?, updated_at = ? WHERE id = ?').run(text.trim(), now, commentId);

  const updated = db.prepare('SELECT * FROM comments WHERE id = ?').get(commentId);
  res.json({ comment: updated });
});

router.delete('/comments/:id', authMiddleware, (req: Request, res: Response) => {
  const commentId = req.params.id;
  db.prepare('DELETE FROM comments WHERE id = ?').run(commentId);
  res.json({ success: true });
});

// -------------------------------------------------------------
// REGULAR EVALUATION (TIC)
// -------------------------------------------------------------

router.get('/classes/:classId/tic', authMiddleware, (req: Request, res: Response) => {
  const classId = req.params.classId;
  const subject = db.prepare('SELECT * FROM regular_subjects WHERE class_id = ?').get(classId) as any;
  if (!subject) {
    return res.status(404).json({ error: 'Disciplina TIC não configurada para esta turma.' });
  }

  const periods = db.prepare('SELECT * FROM regular_periods WHERE regular_subject_id = ? ORDER BY period_number ASC').all(subject.id) as any[];

  // For each period, fetch instruments, results, and final grades
  const periodDetails = periods.map(period => {
    const instruments = db.prepare(`
      SELECT * FROM instruments 
      WHERE context_type = 'regular_period' AND context_id = ? 
      ORDER BY date ASC, created_at ASC
    `).all(period.id);

    const results = db.prepare(`
      SELECT r.* 
      FROM student_results r
      JOIN instruments i ON i.id = r.instrument_id
      WHERE i.context_type = 'regular_period' AND i.context_id = ?
    `).all(period.id);

    const finalGrades = db.prepare(`
      SELECT * FROM final_grades
      WHERE context_type = 'regular_period' AND context_id = ?
    `).all(period.id);

    return {
      period,
      instruments,
      results,
      finalGrades,
    };
  });

  res.json({
    subject,
    periods: periodDetails,
  });
});

router.put('/classes/:classId/tic/scale', authMiddleware, (req: Request, res: Response) => {
  const classId = req.params.classId;
  const { scale } = req.body;

  if (!['1-5', '0-20', '0-100'].includes(scale)) {
    return res.status(400).json({ error: 'Escala inválida.' });
  }

  db.prepare('UPDATE regular_subjects SET scale = ? WHERE class_id = ?').run(scale, classId);
  db.prepare('UPDATE classes SET default_scale = ? WHERE id = ?').run(scale, classId);

  res.json({ success: true, scale });
});

// -------------------------------------------------------------
// PROFESSIONAL EVALUATION (UCs & Modules)
// -------------------------------------------------------------

router.get('/classes/:classId/professional', authMiddleware, (req: Request, res: Response) => {
  const classId = req.params.classId;
  const ucs = db.prepare('SELECT * FROM professional_ucs WHERE class_id = ? ORDER BY created_at ASC').all(classId) as any[];

  const detailedUcs = ucs.map(uc => {
    const modules = db.prepare('SELECT * FROM professional_modules WHERE uc_id = ? ORDER BY order_index ASC, created_at ASC').all(uc.id) as any[];

    const detailedModules = modules.map(mod => {
      const instruments = db.prepare(`
        SELECT * FROM instruments 
        WHERE context_type = 'professional_module' AND context_id = ? 
        ORDER BY date ASC, created_at ASC
      `).all(mod.id);

      const results = db.prepare(`
        SELECT r.* 
        FROM student_results r
        JOIN instruments i ON i.id = r.instrument_id
        WHERE i.context_type = 'professional_module' AND i.context_id = ?
      `).all(mod.id);

      const finalGrades = db.prepare(`
        SELECT * FROM final_grades
        WHERE context_type = 'professional_module' AND context_id = ?
      `).all(mod.id) as any[];

      // Fetch recoveries for each final grade
      const finalGradeIds = finalGrades.map(f => f.id);
      let recoveries: any[] = [];
      if (finalGradeIds.length > 0) {
        recoveries = db.prepare(`
          SELECT * FROM recovery_attempts 
          WHERE final_grade_id IN (${finalGradeIds.map(() => '?').join(',')})
          ORDER BY attempt_number ASC
        `).all(...finalGradeIds);
      }

      return {
        module: mod,
        instruments,
        results,
        finalGrades,
        recoveries,
      };
    });

    return {
      uc,
      modules: detailedModules,
    };
  });

  res.json({ ucs: detailedUcs });
});

router.post('/classes/:classId/ucs', authMiddleware, (req: Request, res: Response) => {
  const classId = req.params.classId;
  const { code, name, scale = '0-20', passingThreshold = 10 } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Designação da UC é obrigatória.' });
  }

  const ucId = generateId();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO professional_ucs (id, class_id, code, name, scale, passing_threshold, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(ucId, classId, code ? code.trim() : null, name.trim(), scale, passingThreshold, now);

  const uc = db.prepare('SELECT * FROM professional_ucs WHERE id = ?').get(ucId);
  res.json({ uc, modules: [] });
});

router.put('/ucs/:ucId', authMiddleware, (req: Request, res: Response) => {
  const ucId = req.params.ucId;
  const { code, name, scale, passingThreshold } = req.body;

  db.prepare(`
    UPDATE professional_ucs 
    SET code = ?,
        name = COALESCE(?, name),
        scale = COALESCE(?, scale),
        passing_threshold = COALESCE(?, passing_threshold)
    WHERE id = ?
  `).run(code ? code.trim() : null, name ? name.trim() : null, scale, passingThreshold, ucId);

  const uc = db.prepare('SELECT * FROM professional_ucs WHERE id = ?').get(ucId);
  res.json({ uc });
});

router.delete('/ucs/:ucId', authMiddleware, (req: Request, res: Response) => {
  const ucId = req.params.ucId;
  db.prepare('DELETE FROM professional_ucs WHERE id = ?').run(ucId);
  res.json({ success: true });
});

router.post('/ucs/:ucId/modules', authMiddleware, (req: Request, res: Response) => {
  const ucId = req.params.ucId;
  const { codeOrNumber, name, hours } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Designação do módulo é obrigatória.' });
  }

  const moduleId = generateId();
  const now = new Date().toISOString();

  const currentCount = (db.prepare('SELECT count(*) as count FROM professional_modules WHERE uc_id = ?').get(ucId) as { count: number }).count;

  db.prepare(`
    INSERT INTO professional_modules (id, uc_id, code_or_number, name, hours, order_index, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    moduleId,
    ucId,
    codeOrNumber ? codeOrNumber.trim() : `M${currentCount + 1}`,
    name.trim(),
    hours ? parseInt(hours, 10) : null,
    currentCount,
    now
  );

  const mod = db.prepare('SELECT * FROM professional_modules WHERE id = ?').get(moduleId);
  res.json({ module: mod });
});

router.put('/modules/:moduleId', authMiddleware, (req: Request, res: Response) => {
  const moduleId = req.params.moduleId;
  const { codeOrNumber, name, hours } = req.body;

  db.prepare(`
    UPDATE professional_modules 
    SET code_or_number = COALESCE(?, code_or_number),
        name = COALESCE(?, name),
        hours = ?
    WHERE id = ?
  `).run(
    codeOrNumber ? codeOrNumber.trim() : null,
    name ? name.trim() : null,
    hours ? parseInt(hours, 10) : null,
    moduleId
  );

  const mod = db.prepare('SELECT * FROM professional_modules WHERE id = ?').get(moduleId);
  res.json({ module: mod });
});

router.delete('/modules/:moduleId', authMiddleware, (req: Request, res: Response) => {
  const moduleId = req.params.moduleId;
  db.prepare('DELETE FROM professional_modules WHERE id = ?').run(moduleId);
  res.json({ success: true });
});

// -------------------------------------------------------------
// INSTRUMENTS & RESULTS
// -------------------------------------------------------------

router.post('/instruments', authMiddleware, (req: Request, res: Response) => {
  const { contextType, contextId, title, date, maxScore = 20, weight = 0 } = req.body;

  if (!contextType || !contextId || !title || !title.trim()) {
    return res.status(400).json({ error: 'Título e contexto do instrumento obrigatórios.' });
  }

  const id = generateId();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO instruments (id, context_type, context_id, title, date, max_score, weight, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, contextType, contextId, title.trim(), date || now.split('T')[0], maxScore, weight || 0, now);

  const instrument = db.prepare('SELECT * FROM instruments WHERE id = ?').get(id);
  res.json({ instrument });
});

router.put('/instruments/:id', authMiddleware, (req: Request, res: Response) => {
  const id = req.params.id;
  const { title, date, maxScore, weight } = req.body;

  db.prepare(`
    UPDATE instruments 
    SET title = COALESCE(?, title),
        date = COALESCE(?, date),
        max_score = COALESCE(?, max_score),
        weight = COALESCE(?, weight)
    WHERE id = ?
  `).run(title ? title.trim() : null, date, maxScore, weight, id);

  const updated = db.prepare('SELECT * FROM instruments WHERE id = ?').get(id);
  res.json({ instrument: updated });
});

router.delete('/instruments/:id', authMiddleware, (req: Request, res: Response) => {
  const id = req.params.id;
  db.prepare('DELETE FROM instruments WHERE id = ?').run(id);
  res.json({ success: true });
});

// Batch Save Results for Spreadsheet Grid (fast, optimistic-friendly)
router.post('/results/batch', authMiddleware, (req: Request, res: Response) => {
  const { updates } = req.body; // array of { instrumentId, enrollmentId, scoreValue, specialStatus, notes }

  if (!Array.isArray(updates) || updates.length === 0) {
    return res.status(400).json({ error: 'Nenhuma alteração a gravar.' });
  }

  const now = new Date().toISOString();
  const saved: any[] = [];

  db.transaction(() => {
    for (const item of updates) {
      const { instrumentId, enrollmentId, scoreValue, specialStatus = 'none', notes = null } = item;
      const score = scoreValue !== null && scoreValue !== undefined && scoreValue !== '' ? Number(scoreValue) : null;

      const existing = db.prepare('SELECT id FROM student_results WHERE instrument_id = ? AND enrollment_id = ?').get(instrumentId, enrollmentId) as any;

      if (existing) {
        db.prepare(`
          UPDATE student_results 
          SET score_value = ?, special_status = ?, notes = ?, updated_at = ?
          WHERE id = ?
        `).run(score, specialStatus, notes, now, existing.id);
        saved.push({ id: existing.id, instrumentId, enrollmentId, scoreValue: score, specialStatus, notes });
      } else {
        const id = generateId();
        db.prepare(`
          INSERT INTO student_results (id, instrument_id, enrollment_id, score_value, special_status, notes, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(id, instrumentId, enrollmentId, score, specialStatus, notes, now);
        saved.push({ id, instrumentId, enrollmentId, scoreValue: score, specialStatus, notes });
      }
    }
  })();

  res.json({ success: true, saved });
});

// Confirm or update final grade
router.post('/final-grades/confirm', authMiddleware, (req: Request, res: Response) => {
  const { contextType, contextId, enrollmentId, finalGradeValue, isConfirmed, completionDate } = req.body;

  if (!contextType || !contextId || !enrollmentId) {
    return res.status(400).json({ error: 'Contexto e aluno obrigatórios.' });
  }

  const numValue = finalGradeValue !== null && finalGradeValue !== undefined && finalGradeValue !== '' ? Number(finalGradeValue) : null;
  const now = new Date().toISOString();

  // Determine status if professional module
  let status = 'por_avaliar';
  if (contextType === 'professional_module') {
    const uc = db.prepare(`
      SELECT u.passing_threshold 
      FROM professional_modules m
      JOIN professional_ucs u ON u.id = m.uc_id
      WHERE m.id = ?
    `).get(contextId) as any;
    const threshold = uc ? uc.passing_threshold : 10;
    status = resolveModuleStatus(numValue, threshold, !!isConfirmed, true);
  }

  let finalGrade: any;

  db.transaction(() => {
    const existing = db.prepare(`
      SELECT * FROM final_grades 
      WHERE context_type = ? AND context_id = ? AND enrollment_id = ?
    `).get(contextType, contextId, enrollmentId) as any;

    if (existing) {
      db.prepare(`
        UPDATE final_grades 
        SET final_grade_value = ?,
            is_confirmed = ?,
            completion_date = COALESCE(?, completion_date),
            status = ?,
            confirmed_at = ?
        WHERE id = ?
      `).run(
        numValue,
        isConfirmed ? 1 : 0,
        completionDate,
        status,
        isConfirmed ? now : existing.confirmed_at,
        existing.id
      );
      finalGrade = db.prepare('SELECT * FROM final_grades WHERE id = ?').get(existing.id);
    } else {
      const id = generateId();
      db.prepare(`
        INSERT INTO final_grades (id, context_type, context_id, enrollment_id, final_grade_value, is_confirmed, completion_date, status, confirmed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        contextType,
        contextId,
        enrollmentId,
        numValue,
        isConfirmed ? 1 : 0,
        completionDate || now.split('T')[0],
        status,
        isConfirmed ? now : null
      );
      finalGrade = db.prepare('SELECT * FROM final_grades WHERE id = ?').get(id);
    }
  })();

  res.json({ finalGrade });
});

// Add recovery attempt (preserves previous attempts history)
router.post('/final-grades/:id/recovery', authMiddleware, (req: Request, res: Response) => {
  const finalGradeId = req.params.id;
  const { date, scoreValue, observations, attemptNumber } = req.body;

  if (scoreValue === null || scoreValue === undefined || isNaN(Number(scoreValue))) {
    return res.status(400).json({ error: 'Classificação da recuperação obrigatória.' });
  }

  const finalGrade = db.prepare('SELECT * FROM final_grades WHERE id = ?').get(finalGradeId) as any;
  if (!finalGrade) {
    return res.status(404).json({ error: 'Classificação final não encontrada.' });
  }

  const numScore = Number(scoreValue);
  const now = new Date().toISOString();
  const recId = generateId();

  // Find next attempt number if not specified
  const prevAttempts = db.prepare('SELECT count(*) as count FROM recovery_attempts WHERE final_grade_id = ?').get(finalGradeId) as { count: number };
  const attNum = attemptNumber || (prevAttempts.count + 1);

  db.transaction(() => {
    // Set prior recoveries to inactive
    db.prepare('UPDATE recovery_attempts SET is_active_final = 0 WHERE final_grade_id = ?').run(finalGradeId);

    // Insert new recovery attempt as active
    db.prepare(`
      INSERT INTO recovery_attempts (id, final_grade_id, enrollment_id, attempt_number, date, score_value, observations, is_active_final, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).run(
      recId,
      finalGradeId,
      finalGrade.enrollment_id,
      attNum,
      date || now.split('T')[0],
      numScore,
      observations ? observations.trim() : null,
      now
    );

    // Update final grade status based on recovery score and UC threshold
    if (finalGrade.context_type === 'professional_module') {
      const uc = db.prepare(`
        SELECT u.passing_threshold 
        FROM professional_modules m
        JOIN professional_ucs u ON u.id = m.uc_id
        WHERE m.id = ?
      `).get(finalGrade.context_id) as any;
      const threshold = uc ? uc.passing_threshold : 10;
      const newStatus = resolveModuleStatus(numScore, threshold, true, true);

      db.prepare(`
        UPDATE final_grades 
        SET final_grade_value = ?,
            status = ?,
            is_confirmed = 1
        WHERE id = ?
      `).run(numScore, newStatus, finalGradeId);
    }
  })();

  const recoveries = db.prepare('SELECT * FROM recovery_attempts WHERE final_grade_id = ? ORDER BY attempt_number ASC').all(finalGradeId);
  const updatedFinalGrade = db.prepare('SELECT * FROM final_grades WHERE id = ?').get(finalGradeId);

  res.json({
    recoveryId: recId,
    recoveries,
    finalGrade: updatedFinalGrade,
  });
});

// Set active recovery attempt
router.post('/final-grades/:id/recoveries/:recoveryId/set-active', authMiddleware, (req: Request, res: Response) => {
  const finalGradeId = req.params.id;
  const recoveryId = req.params.recoveryId;

  const recovery = db.prepare('SELECT * FROM recovery_attempts WHERE id = ? AND final_grade_id = ?').get(recoveryId, finalGradeId) as any;
  if (!recovery) {
    return res.status(404).json({ error: 'Recuperação não encontrada.' });
  }

  const finalGrade = db.prepare('SELECT * FROM final_grades WHERE id = ?').get(finalGradeId) as any;

  db.transaction(() => {
    db.prepare('UPDATE recovery_attempts SET is_active_final = 0 WHERE final_grade_id = ?').run(finalGradeId);
    db.prepare('UPDATE recovery_attempts SET is_active_final = 1 WHERE id = ?').run(recoveryId);

    // Update final grade with this recovery's score
    if (finalGrade.context_type === 'professional_module') {
      const uc = db.prepare(`
        SELECT u.passing_threshold 
        FROM professional_modules m
        JOIN professional_ucs u ON u.id = m.uc_id
        WHERE m.id = ?
      `).get(finalGrade.context_id) as any;
      const threshold = uc ? uc.passing_threshold : 10;
      const newStatus = resolveModuleStatus(recovery.score_value, threshold, true, true);

      db.prepare(`
        UPDATE final_grades 
        SET final_grade_value = ?,
            status = ?,
            is_confirmed = 1
        WHERE id = ?
      `).run(recovery.score_value, newStatus, finalGradeId);
    }
  })();

  const recoveries = db.prepare('SELECT * FROM recovery_attempts WHERE final_grade_id = ? ORDER BY attempt_number ASC').all(finalGradeId);
  const updatedFinalGrade = db.prepare('SELECT * FROM final_grades WHERE id = ?').get(finalGradeId);

  res.json({ recoveries, finalGrade: updatedFinalGrade });
});

// -------------------------------------------------------------
// INITIAL WIZARD ENDPOINT (Complete in 1 Transaction)
// -------------------------------------------------------------

router.post('/wizard/complete', (req: Request, res: Response) => {
  const {
    // Step 1: Teacher & Academic Year
    teacherEmail,
    teacherPassword,
    teacherName,
    school,
    academicYearName,
    // Step 2 & 3: Classes
    classes = [],
  } = req.body;

  if (!teacherName || !academicYearName) {
    return res.status(400).json({ error: 'Nome do professor e ano letivo são obrigatórios.' });
  }

  const now = new Date().toISOString();
  let teacherId: string = '';
  let token: string = '';

  db.transaction(() => {
    // 1. Get or create teacher
    const existing = db.prepare('SELECT * FROM teachers LIMIT 1').get() as any;
    if (existing) {
      teacherId = existing.id;
      db.prepare('UPDATE teachers SET name = ?, school = ? WHERE id = ?').run(
        teacherName.trim(),
        school ? school.trim() : null,
        teacherId
      );
    } else {
      teacherId = generateId();
      const email = (teacherEmail || 'professor@escola.pt').toLowerCase().trim();
      const pwd = teacherPassword || 'professor123';
      const hash = bcrypt.hashSync(pwd, 10);
      db.prepare(`
        INSERT INTO teachers (id, email, password_hash, name, school, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(teacherId, email, hash, teacherName.trim(), school ? school.trim() : null, now);
    }

    token = jwt.sign({ teacherId, email: teacherEmail || 'professor@escola.pt' }, JWT_SECRET, { expiresIn: '7d' });

    // 2. Create Academic Year
    db.prepare('UPDATE academic_years SET is_active = 0 WHERE teacher_id = ?').run(teacherId);
    const yearId = generateId();
    db.prepare(`
      INSERT INTO academic_years (id, teacher_id, name, is_active, is_archived, created_at)
      VALUES (?, ?, ?, 1, 0, ?)
    `).run(yearId, teacherId, academicYearName.trim(), now);

    // 3. Create Classes & configurations
    for (const cls of classes) {
      if (!cls.name) continue;
      const classId = generateId();
      db.prepare(`
        INSERT INTO classes (id, teacher_id, academic_year_id, name, grade_level, education_type, course_name, default_scale, is_archived, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
      `).run(
        classId,
        teacherId,
        yearId,
        cls.name.trim(),
        cls.gradeLevel ? cls.gradeLevel.trim() : 'Geral',
        cls.educationType || 'regular',
        cls.courseName ? cls.courseName.trim() : null,
        cls.defaultScale || (cls.educationType === 'regular' ? '1-5' : '0-20'),
        now
      );

      // If regular: TIC + 3 periods
      if (cls.educationType === 'regular') {
        const regularSubjectId = generateId();
        db.prepare(`
          INSERT INTO regular_subjects (id, class_id, name, scale)
          VALUES (?, ?, 'TIC', ?)
        `).run(regularSubjectId, classId, cls.defaultScale || '1-5');

        const periodNames = ['1.º Período', '2.º Período', '3.º Período'];
        for (let p = 1; p <= 3; p++) {
          db.prepare(`
            INSERT INTO regular_periods (id, regular_subject_id, period_number, name)
            VALUES (?, ?, ?, ?)
          `).run(generateId(), regularSubjectId, p, periodNames[p - 1]);
        }
      }

      // If professional: UCs & modules
      if (cls.educationType === 'professional' && Array.isArray(cls.ucs)) {
        for (const uc of cls.ucs) {
          if (!uc.name) continue;
          const ucId = generateId();
          db.prepare(`
            INSERT INTO professional_ucs (id, class_id, code, name, scale, passing_threshold, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(
            ucId,
            classId,
            uc.code ? uc.code.trim() : null,
            uc.name.trim(),
            uc.scale || '0-20',
            uc.passingThreshold ?? 10,
            now
          );

          if (Array.isArray(uc.modules)) {
            let mIdx = 0;
            for (const mod of uc.modules) {
              if (!mod.name && !mod.codeOrNumber) continue;
              db.prepare(`
                INSERT INTO professional_modules (id, uc_id, code_or_number, name, hours, order_index, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
              `).run(
                generateId(),
                ucId,
                mod.codeOrNumber ? mod.codeOrNumber.trim() : `M${mIdx + 1}`,
                mod.name.trim(),
                mod.hours ? parseInt(mod.hours, 10) : null,
                mIdx++,
                now
              );
            }
          }
        }
      }

      // Step 4: Add students for this class
      if (Array.isArray(cls.students)) {
        for (const st of cls.students) {
          if (!st.name || !st.number) continue;
          // Find or create student
          let student = db.prepare('SELECT id FROM students WHERE teacher_id = ? AND full_name = ? COLLATE NOCASE').get(teacherId, st.name.trim()) as any;
          let studentId = student?.id;
          if (!studentId) {
            studentId = generateId();
            db.prepare('INSERT INTO students (id, teacher_id, full_name, created_at) VALUES (?, ?, ?, ?)').run(
              studentId,
              teacherId,
              st.name.trim(),
              now
            );
          }

          // Enrollment
          db.prepare(`
            INSERT INTO enrollments (id, class_id, student_id, student_number, status, created_at)
            VALUES (?, ?, ?, ?, 'active', ?)
          `).run(generateId(), classId, studentId, st.number, now);
        }
      }
    }
  })();

  const teacher = db.prepare('SELECT id, email, name, school FROM teachers WHERE id = ?').get(teacherId);
  res.json({ success: true, token, teacher });
});

// Seed Demo Data (so user or tests can experience pre-filled scenarios without typing 50 rows)
router.post('/demo/seed', (req: Request, res: Response) => {
  const now = new Date().toISOString();
  let teacherId: string = '';

  db.transaction(() => {
    // Teacher
    let teacher = db.prepare('SELECT id FROM teachers LIMIT 1').get() as any;
    if (!teacher) {
      teacherId = generateId();
      const hash = bcrypt.hashSync('professor123', 10);
      db.prepare(`
        INSERT INTO teachers (id, email, password_hash, name, school, created_at)
        VALUES (?, 'professor@escola.pt', ?, 'Prof. Manuel Silva', 'Agrupamento de Escolas Gabriel Pereira - Évora', ?)
      `).run(teacherId, hash, now);
    } else {
      teacherId = teacher.id;
    }

    // Academic Year
    const yearId = generateId();
    db.prepare('UPDATE academic_years SET is_active = 0 WHERE teacher_id = ?').run(teacherId);
    db.prepare(`
      INSERT INTO academic_years (id, teacher_id, name, is_active, is_archived, created_at)
      VALUES (?, ?, '2026/2027', 1, 0, ?)
    `).run(yearId, teacherId, now);

    // Class 1: Regular 8.º A (TIC)
    const class1Id = generateId();
    db.prepare(`
      INSERT INTO classes (id, teacher_id, academic_year_id, name, grade_level, education_type, course_name, default_scale, is_archived, created_at)
      VALUES (?, ?, ?, '8.º A', '8.º Ano', 'regular', NULL, '1-5', 0, ?)
    `).run(class1Id, teacherId, yearId, now);

    const ticSubjectId = generateId();
    db.prepare(`INSERT INTO regular_subjects (id, class_id, name, scale) VALUES (?, ?, 'TIC', '1-5')`).run(ticSubjectId, class1Id);

    const period1Id = generateId();
    const period2Id = generateId();
    const period3Id = generateId();
    db.prepare(`INSERT INTO regular_periods VALUES (?, ?, 1, '1.º Período')`).run(period1Id, ticSubjectId);
    db.prepare(`INSERT INTO regular_periods VALUES (?, ?, 2, '2.º Período')`).run(period2Id, ticSubjectId);
    db.prepare(`INSERT INTO regular_periods VALUES (?, ?, 3, '3.º Período')`).run(period3Id, ticSubjectId);

    // Instruments for Period 1
    const inst1 = generateId();
    const inst2 = generateId();
    db.prepare(`INSERT INTO instruments VALUES (?, 'regular_period', ?, 'Ficha Diagnóstica e Folha de Cálculo', '2026-10-14', 5, 40, ?)`).run(inst1, period1Id, now);
    db.prepare(`INSERT INTO instruments VALUES (?, 'regular_period', ?, 'Projeto de Segurança Digital', '2026-11-20', 5, 60, ?)`).run(inst2, period1Id, now);

    // Students for 8.º A
    const regularStudents = [
      { num: 1, name: 'Afonso Fernandes' },
      { num: 2, name: 'Beatriz Costa' },
      { num: 3, name: 'Carolina Martins' },
      { num: 4, name: 'Diogo Ribeiro' },
      { num: 5, name: 'Eduarda Santos' },
      { num: 6, name: 'Francisco Lopes' },
    ];

    for (const s of regularStudents) {
      const studentId = generateId();
      db.prepare(`INSERT INTO students VALUES (?, ?, ?, ?)`).run(studentId, teacherId, s.name, now);
      const enrollId = generateId();
      db.prepare(`INSERT INTO enrollments VALUES (?, ?, ?, ?, 'active', ?)`).run(enrollId, class1Id, studentId, s.num, now);

      // Results
      db.prepare(`INSERT INTO student_results VALUES (?, ?, ?, ?, 'none', NULL, ?)`).run(generateId(), inst1, enrollId, 4, now);
      db.prepare(`INSERT INTO student_results VALUES (?, ?, ?, ?, 'none', NULL, ?)`).run(generateId(), inst2, enrollId, s.num % 2 === 0 ? 5 : 4, now);

      // Final grade
      db.prepare(`INSERT INTO final_grades VALUES (?, 'regular_period', ?, ?, ?, 1, '2026-12-16', 'aprovado', ?)`).run(
        generateId(),
        period1Id,
        enrollId,
        s.num % 2 === 0 ? 5 : 4,
        now
      );
    }

    // Class 2: Professional 11.º TGPSI
    const class2Id = generateId();
    db.prepare(`
      INSERT INTO classes (id, teacher_id, academic_year_id, name, grade_level, education_type, course_name, default_scale, is_archived, created_at)
      VALUES (?, ?, ?, '11.º TGPSI', '11.º Ano', 'professional', 'Técnico de Gestão e Programação de Sistemas Informáticos', '0-20', 0, ?)
    `).run(class2Id, teacherId, yearId, now);

    // UC 1: Programação e Sistemas de Informação (PSI)
    const uc1Id = generateId();
    db.prepare(`
      INSERT INTO professional_ucs VALUES (?, ?, 'PSI', 'Programação e Sistemas de Informação', '0-20', 10, ?)
    `).run(uc1Id, class2Id, now);

    const mod1Id = generateId();
    const mod2Id = generateId();
    db.prepare(`INSERT INTO professional_modules VALUES (?, ?, 'M1', 'Estruturas de Dados e Algoritmos', 30, 0, ?)`).run(mod1Id, uc1Id, now);
    db.prepare(`INSERT INTO professional_modules VALUES (?, ?, 'M2', 'Programação Orientada a Objetos', 35, 1, ?)`).run(mod2Id, uc1Id, now);

    // UC 2: Redes de Comunicação (RC)
    const uc2Id = generateId();
    db.prepare(`
      INSERT INTO professional_ucs VALUES (?, ?, 'RC', 'Redes de Comunicação', '0-20', 10, ?)
    `).run(uc2Id, class2Id, now);

    const mod3Id = generateId();
    db.prepare(`INSERT INTO professional_modules VALUES (?, ?, 'M1', 'Arquitetura de Redes TCP/IP', 25, 0, ?)`).run(mod3Id, uc2Id, now);

    // Instruments for M1
    const pInst1 = generateId();
    const pInst2 = generateId();
    db.prepare(`INSERT INTO instruments VALUES (?, 'professional_module', ?, 'Teste Prático em C++', '2026-10-18', 20, 50, ?)`).run(pInst1, mod1Id, now);
    db.prepare(`INSERT INTO instruments VALUES (?, 'professional_module', ?, 'Projeto de Gestão de Ficheiros', '2026-11-15', 20, 50, ?)`).run(pInst2, mod1Id, now);

    // Students for 11.º TGPSI
    const profStudents = [
      { num: 1, name: 'André Carvalho' },
      { num: 2, name: 'Bruna Ferreira' },
      { num: 3, name: 'Daniela Pires' },
      { num: 4, name: 'Gonçalo Neves' },
      { num: 5, name: 'Inês Guimarães' },
    ];

    for (const ps of profStudents) {
      const studentId = generateId();
      db.prepare(`INSERT INTO students VALUES (?, ?, ?, ?)`).run(studentId, teacherId, ps.name, now);
      const enrollId = generateId();
      db.prepare(`INSERT INTO enrollments VALUES (?, ?, ?, ?, 'active', ?)`).run(enrollId, class2Id, studentId, ps.num, now);

      // Results for M1
      const score1 = ps.num === 4 ? 8 : 12 + ps.num;
      const score2 = ps.num === 4 ? 9 : 13 + ps.num;
      db.prepare(`INSERT INTO student_results VALUES (?, ?, ?, ?, 'none', NULL, ?)`).run(generateId(), pInst1, enrollId, score1, now);
      db.prepare(`INSERT INTO student_results VALUES (?, ?, ?, ?, 'none', NULL, ?)`).run(generateId(), pInst2, enrollId, score2, now);

      // Final Grade for M1
      const initialFinal = ps.num === 4 ? 8.5 : Math.round(((score1 + score2) / 2) * 10) / 10;
      const fgId = generateId();
      const status = initialFinal >= 10 ? 'aprovado' : 'reprovado';
      db.prepare(`INSERT INTO final_grades VALUES (?, 'professional_module', ?, ?, ?, 1, '2026-11-20', ?, ?)`).run(
        fgId,
        mod1Id,
        enrollId,
        initialFinal,
        status,
        now
      );

      // Student 4 has a recovery attempt!
      if (ps.num === 4) {
        db.prepare(`
          INSERT INTO recovery_attempts VALUES (?, ?, ?, 1, '2026-12-05', 11, 'Prova de recuperação realizada com sucesso.', 1, ?)
        `).run(generateId(), fgId, enrollId, now);

        // Update final grade active status to approved with 11
        db.prepare(`UPDATE final_grades SET final_grade_value = 11, status = 'aprovado' WHERE id = ?`).run(fgId);
      }
    }
  })();

  const teacher = db.prepare('SELECT id, email, name, school FROM teachers WHERE id = ?').get(teacherId) as any;
  const token = jwt.sign({ teacherId: teacher?.id, email: teacher?.email }, JWT_SECRET, { expiresIn: '7d' });

  res.json({ success: true, token, teacher });
});

// -------------------------------------------------------------
// DL 54/2018 ACCOMMODATIONS
// -------------------------------------------------------------
router.put('/enrollments/:id/accommodations', authMiddleware, (req: Request, res: Response) => {
  const teacherId = (req as any).teacher.id;
  const enrollmentId = req.params.id;
  const { hasDl54, measures, details } = req.body;

  // Verify ownership
  const enrollment = db.prepare(`
    SELECT e.id, c.teacher_id 
    FROM enrollments e
    JOIN classes c ON c.id = e.class_id
    WHERE e.id = ? AND c.teacher_id = ?
  `).get(enrollmentId, teacherId);

  if (!enrollment) {
    return res.status(404).json({ error: 'Inscrição não encontrada ou sem permissão.' });
  }

  const now = new Date().toISOString();
  const measuresJson = Array.isArray(measures) ? JSON.stringify(measures) : JSON.stringify([]);

  const existing = db.prepare('SELECT id FROM student_accommodations WHERE enrollment_id = ?').get(enrollmentId);

  if (existing) {
    db.prepare(`
      UPDATE student_accommodations 
      SET has_dl54 = ?, measures = ?, details = ?, updated_at = ?
      WHERE enrollment_id = ?
    `).run(hasDl54 ? 1 : 0, measuresJson, details ? details.trim() : null, now, enrollmentId);
  } else {
    db.prepare(`
      INSERT INTO student_accommodations (id, enrollment_id, has_dl54, measures, details, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(generateId(), enrollmentId, hasDl54 ? 1 : 0, measuresJson, details ? details.trim() : null, now);
  }

  res.json({ success: true });
});

// -------------------------------------------------------------
// CLASSROOM NOTES / DIÁRIO DE BORDO
// -------------------------------------------------------------
router.get('/classes/:id/classroom-notes', authMiddleware, (req: Request, res: Response) => {
  const teacherId = (req as any).teacher.id;
  const classId = req.params.id;

  const notes = db.prepare(`
    SELECT cn.*, s.full_name as student_name, e.student_number
    FROM classroom_notes cn
    JOIN enrollments e ON e.id = cn.enrollment_id
    JOIN students s ON s.id = e.student_id
    WHERE cn.class_id = ? AND cn.teacher_id = ?
    ORDER BY cn.date DESC, cn.created_at DESC
  `).all(classId, teacherId);

  res.json({ notes });
});

router.post('/classes/:id/classroom-notes', authMiddleware, (req: Request, res: Response) => {
  const teacherId = (req as any).teacher.id;
  const classId = req.params.id;
  const { enrollmentId, category, note, date } = req.body;

  if (!enrollmentId || !note || !note.trim()) {
    return res.status(400).json({ error: 'Preencha o aluno e a nota de aula.' });
  }

  const id = generateId();
  const noteDate = date || new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO classroom_notes (id, teacher_id, enrollment_id, class_id, category, note, date, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, teacherId, enrollmentId, classId, category || 'outro', note.trim(), noteDate, now);

  const created = db.prepare(`
    SELECT cn.*, s.full_name as student_name, e.student_number
    FROM classroom_notes cn
    JOIN enrollments e ON e.id = cn.enrollment_id
    JOIN students s ON s.id = e.student_id
    WHERE cn.id = ?
  `).get(id);

  res.json({ note: created });
});

router.delete('/classroom-notes/:id', authMiddleware, (req: Request, res: Response) => {
  const teacherId = (req as any).teacher.id;
  const noteId = req.params.id;

  db.prepare('DELETE FROM classroom_notes WHERE id = ? AND teacher_id = ?').run(noteId, teacherId);
  res.json({ success: true });
});

// -------------------------------------------------------------
// OBSERVATION RUBRICS
// -------------------------------------------------------------
router.get('/classes/:id/rubrics', authMiddleware, (req: Request, res: Response) => {
  const teacherId = (req as any).teacher.id;
  const classId = req.params.id;

  const rubrics = db.prepare(`
    SELECT * FROM observation_rubrics 
    WHERE class_id = ? AND teacher_id = ?
    ORDER BY created_at DESC
  `).all(classId, teacherId) as any[];

  const detailedRubrics = rubrics.map(rubric => {
    const rawCriteria = db.prepare(`
      SELECT * FROM rubric_criteria 
      WHERE rubric_id = ?
      ORDER BY order_index ASC
    `).all(rubric.id) as any[];

    const criteria = rawCriteria.map(c => ({
      ...c,
      levels: c.levels_json ? JSON.parse(c.levels_json) : [],
    }));

    return {
      ...rubric,
      criteria,
    };
  });

  res.json({ rubrics: detailedRubrics });
});

router.post('/classes/:id/rubrics', authMiddleware, (req: Request, res: Response) => {
  const teacherId = (req as any).teacher.id;
  const classId = req.params.id;
  const { title, description, criteria } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'O título da rubrica é obrigatório.' });
  }

  const rubricId = generateId();
  const now = new Date().toISOString();

  db.transaction(() => {
    db.prepare(`
      INSERT INTO observation_rubrics (id, teacher_id, class_id, title, description, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(rubricId, teacherId, classId, title.trim(), description ? description.trim() : null, now);

    if (Array.isArray(criteria) && criteria.length > 0) {
      criteria.forEach((crit: any, idx: number) => {
        const critId = generateId();
        const levelsJson = crit.levels ? JSON.stringify(crit.levels) : null;
        db.prepare(`
          INSERT INTO rubric_criteria (id, rubric_id, name, weight, max_points, levels_json, order_index)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(critId, rubricId, crit.name.trim(), crit.weight || 1, crit.max_points || 5, levelsJson, idx);
      });
    }
  })();

  res.json({ success: true, rubricId });
});

router.delete('/rubrics/:id', authMiddleware, (req: Request, res: Response) => {
  const teacherId = (req as any).teacher.id;
  const rubricId = req.params.id;

  db.prepare('DELETE FROM observation_rubrics WHERE id = ? AND teacher_id = ?').run(rubricId, teacherId);
  res.json({ success: true });
});

router.get('/rubrics/:id/evaluations', authMiddleware, (req: Request, res: Response) => {
  const rubricId = req.params.id;
  const contextId = req.query.contextId as string;

  let query = 'SELECT * FROM student_rubric_evaluations WHERE rubric_id = ?';
  const params: any[] = [rubricId];

  if (contextId) {
    query += ' AND context_id = ?';
    params.push(contextId);
  }

  const rawEvals = db.prepare(query).all(...params) as any[];
  const evaluations = rawEvals.map(e => ({
    ...e,
    scores: JSON.parse(e.scores_json),
  }));

  res.json({ evaluations });
});

router.post('/rubrics/:id/evaluations', authMiddleware, (req: Request, res: Response) => {
  const rubricId = req.params.id;
  const { enrollmentId, contextType, contextId, scores, totalScore, convertedGrade, notes } = req.body;

  if (!enrollmentId || !contextId || !scores) {
    return res.status(400).json({ error: 'Dados da avaliação por rubrica incompletos.' });
  }

  const now = new Date().toISOString();
  const scoresJson = JSON.stringify(scores);

  const existing = db.prepare(`
    SELECT id FROM student_rubric_evaluations 
    WHERE rubric_id = ? AND enrollment_id = ? AND context_id = ?
  `).get(rubricId, enrollmentId, contextId) as any;

  if (existing) {
    db.prepare(`
      UPDATE student_rubric_evaluations 
      SET scores_json = ?, total_score = ?, converted_grade = ?, notes = ?, updated_at = ?
      WHERE id = ?
    `).run(scoresJson, totalScore, convertedGrade, notes ? notes.trim() : null, now, existing.id);
  } else {
    db.prepare(`
      INSERT INTO student_rubric_evaluations (id, rubric_id, enrollment_id, context_type, context_id, scores_json, total_score, converted_grade, notes, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(generateId(), rubricId, enrollmentId, contextType || 'instrument', contextId, scoresJson, totalScore, convertedGrade, notes ? notes.trim() : null, now);
  }

  res.json({ success: true });
});

// -----------------------------------------------------------------------------
// ATTENDANCE & FALTAS
// -----------------------------------------------------------------------------

router.get('/classes/:id/attendance', authMiddleware, (req: Request, res: Response) => {
  const teacherId = (req as any).teacherId;
  const classId = req.params.id;

  const cls = db.prepare('SELECT * FROM classes WHERE id = ? AND teacher_id = ?').get(classId, teacherId) as any;
  if (!cls) return res.status(404).json({ error: 'Turma não encontrada.' });

  const sessions = db.prepare(`
    SELECT s.*, ls.title as summary_title 
    FROM attendance_sessions s
    LEFT JOIN lesson_summaries ls ON s.summary_id = ls.id
    WHERE s.class_id = ? AND s.teacher_id = ?
    ORDER BY s.date DESC, s.lesson_number DESC
  `).all(classId, teacherId) as any[];

  const sessionIds = sessions.map(s => s.id);
  let allRecords: any[] = [];
  if (sessionIds.length > 0) {
    const placeholders = sessionIds.map(() => '?').join(',');
    allRecords = db.prepare(`
      SELECT * FROM attendance_records WHERE session_id IN (${placeholders})
    `).all(...sessionIds) as any[];
  }

  // Group records by session
  const sessionsWithRecords = sessions.map(s => ({
    ...s,
    records: allRecords.filter(r => r.session_id === s.id),
  }));

  // Fetch enrolled students
  const enrollments = db.prepare(`
    SELECT e.id as enrollment_id, e.status, s.student_number, s.full_name
    FROM enrollments e
    JOIN students s ON e.student_id = s.id
    WHERE e.class_id = ?
    ORDER BY s.student_number ASC
  `).all(classId) as any[];

  const totalSessionsCount = sessions.length;

  // Compute student attendance summary
  const studentSummaries = enrollments.map(en => {
    const studentRecords = allRecords.filter(r => r.enrollment_id === en.enrollment_id);
    const presentCount = studentRecords.filter(r => r.status === 'present').length;
    const justifiedCount = studentRecords.filter(r => r.status === 'justified').length;
    const unjustifiedCount = studentRecords.filter(r => r.status === 'unjustified').length;
    const lateCount = studentRecords.filter(r => r.status === 'late').length;
    const materialMissingCount = studentRecords.filter(r => r.status === 'material_missing').length;

    // Attendance percentage: (present + late) / total sessions recorded
    const attended = presentCount + lateCount;
    const attendancePercentage = totalSessionsCount > 0 
      ? Math.round((attended / totalSessionsCount) * 100) 
      : 100;

    // Portuguese statutory limits: Warning if unjustified >= 3, Exceeded if unjustified >= 5 or attendance < 75%
    const isWarning = unjustifiedCount >= 3 || (totalSessionsCount >= 5 && attendancePercentage < 85);
    const isLimitExceeded = unjustifiedCount >= 5 || (totalSessionsCount >= 5 && attendancePercentage < 75);

    return {
      enrollment_id: en.enrollment_id,
      student_number: en.student_number,
      student_name: en.full_name,
      status: en.status,
      total_sessions: totalSessionsCount,
      present_count: presentCount,
      justified_count: justifiedCount,
      unjustified_count: unjustifiedCount,
      late_count: lateCount,
      material_missing_count: materialMissingCount,
      attendance_percentage: attendancePercentage,
      is_limit_exceeded: isLimitExceeded,
      is_warning: isWarning,
    };
  });

  res.json({
    sessions: sessionsWithRecords,
    studentSummaries,
    totalSessions: totalSessionsCount,
  });
});

router.post('/classes/:id/attendance', authMiddleware, (req: Request, res: Response) => {
  const teacherId = (req as any).teacherId;
  const classId = req.params.id;
  const { sessionId, date, lessonNumber, durationBlocks, summaryId, records } = req.body;

  if (!date || lessonNumber === undefined || !Array.isArray(records)) {
    return res.status(400).json({ error: 'Dados da sessão de assiduidade incompletos.' });
  }

  const cls = db.prepare('SELECT id FROM classes WHERE id = ? AND teacher_id = ?').get(classId, teacherId);
  if (!cls) return res.status(404).json({ error: 'Turma não encontrada.' });

  const now = new Date().toISOString();
  let targetSessionId = sessionId;

  db.transaction(() => {
    if (!targetSessionId) {
      targetSessionId = generateId();
      db.prepare(`
        INSERT INTO attendance_sessions (id, teacher_id, class_id, date, lesson_number, duration_blocks, summary_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(targetSessionId, teacherId, classId, date, lessonNumber, durationBlocks || 1, summaryId || null, now);
    } else {
      db.prepare(`
        UPDATE attendance_sessions 
        SET date = ?, lesson_number = ?, duration_blocks = ?, summary_id = ?
        WHERE id = ? AND teacher_id = ?
      `).run(date, lessonNumber, durationBlocks || 1, summaryId || null, targetSessionId, teacherId);
    }

    // Upsert individual records
    for (const rec of records) {
      if (!rec.enrollmentId || !rec.status) continue;
      const existing = db.prepare(`
        SELECT id FROM attendance_records WHERE session_id = ? AND enrollment_id = ?
      `).get(targetSessionId, rec.enrollmentId) as any;

      if (existing) {
        db.prepare(`
          UPDATE attendance_records SET status = ?, notes = ? WHERE id = ?
        `).run(rec.status, rec.notes || null, existing.id);
      } else {
        db.prepare(`
          INSERT INTO attendance_records (id, session_id, enrollment_id, status, notes)
          VALUES (?, ?, ?, ?, ?)
        `).run(generateId(), targetSessionId, rec.enrollmentId, rec.status, rec.notes || null);
      }
    }
  })();

  res.json({ success: true, sessionId: targetSessionId });
});

router.delete('/attendance-sessions/:id', authMiddleware, (req: Request, res: Response) => {
  const teacherId = (req as any).teacherId;
  const sessionId = req.params.id;

  const result = db.prepare('DELETE FROM attendance_sessions WHERE id = ? AND teacher_id = ?').run(sessionId, teacherId);
  if (result.changes === 0) return res.status(404).json({ error: 'Sessão de assiduidade não encontrada.' });

  res.json({ success: true });
});

// -----------------------------------------------------------------------------
// LESSON SUMMARIES (SUMÁRIOS)
// -----------------------------------------------------------------------------

router.get('/classes/:id/summaries', authMiddleware, (req: Request, res: Response) => {
  const teacherId = (req as any).teacherId;
  const classId = req.params.id;

  const summaries = db.prepare(`
    SELECT * FROM lesson_summaries 
    WHERE class_id = ? AND teacher_id = ?
    ORDER BY lesson_number ASC, date ASC
  `).all(classId, teacherId);

  res.json({ summaries });
});

router.post('/classes/:id/summaries', authMiddleware, (req: Request, res: Response) => {
  const teacherId = (req as any).teacherId;
  const classId = req.params.id;
  const { lessonNumber, date, title, summaryText, moduleOrDomain } = req.body;

  if (!lessonNumber || !date || !title || !summaryText) {
    return res.status(400).json({ error: 'Por favor preencha todos os campos obrigatórios do sumário.' });
  }

  const id = generateId();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO lesson_summaries (id, teacher_id, class_id, lesson_number, date, title, summary_text, module_or_domain, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, teacherId, classId, lessonNumber, date, title.trim(), summaryText.trim(), moduleOrDomain ? moduleOrDomain.trim() : null, now);

  const created = db.prepare('SELECT * FROM lesson_summaries WHERE id = ?').get(id);
  res.json({ success: true, summary: created });
});

router.put('/summaries/:id', authMiddleware, (req: Request, res: Response) => {
  const teacherId = (req as any).teacherId;
  const summaryId = req.params.id;
  const { lessonNumber, date, title, summaryText, moduleOrDomain } = req.body;

  const result = db.prepare(`
    UPDATE lesson_summaries 
    SET lesson_number = ?, date = ?, title = ?, summary_text = ?, module_or_domain = ?
    WHERE id = ? AND teacher_id = ?
  `).run(lessonNumber, date, title?.trim(), summaryText?.trim(), moduleOrDomain ? moduleOrDomain.trim() : null, summaryId, teacherId);

  if (result.changes === 0) return res.status(404).json({ error: 'Sumário não encontrado.' });

  const updated = db.prepare('SELECT * FROM lesson_summaries WHERE id = ?').get(summaryId);
  res.json({ success: true, summary: updated });
});

router.delete('/summaries/:id', authMiddleware, (req: Request, res: Response) => {
  const teacherId = (req as any).teacherId;
  const summaryId = req.params.id;

  const result = db.prepare('DELETE FROM lesson_summaries WHERE id = ? AND teacher_id = ?').run(summaryId, teacherId);
  if (result.changes === 0) return res.status(404).json({ error: 'Sumário não encontrado.' });

  res.json({ success: true });
});

// -----------------------------------------------------------------------------
// BACKUP & RESTAURAÇÃO
// -----------------------------------------------------------------------------

router.get('/backup/export', authMiddleware, (req: Request, res: Response) => {
  const teacherId = (req as any).teacherId;
  const teacher = db.prepare('SELECT id, name, email, school, created_at FROM teachers WHERE id = ?').get(teacherId) as any;
  if (!teacher) return res.status(404).json({ error: 'Professor não encontrado.' });

  const academicYears = db.prepare('SELECT * FROM academic_years WHERE teacher_id = ?').all(teacherId);
  const classes = db.prepare('SELECT * FROM classes WHERE teacher_id = ?').all(teacherId) as any[];
  const classIds = classes.map(c => c.id);

  let regularSubjects: any[] = [];
  let professionalUcs: any[] = [];
  let professionalModules: any[] = [];
  let enrollments: any[] = [];
  let students: any[] = [];
  let instruments: any[] = [];
  let instrumentResults: any[] = [];
  let finalGrades: any[] = [];
  let recoveries: any[] = [];
  let pedagogicalComments: any[] = [];
  let studentAccommodations: any[] = [];
  let classroomNotes: any[] = [];
  let observationRubrics: any[] = [];
  let rubricCriteria: any[] = [];
  let studentRubricEvaluations: any[] = [];
  let lessonSummaries: any[] = [];
  let attendanceSessions: any[] = [];
  let attendanceRecords: any[] = [];

  if (classIds.length > 0) {
    const placeholders = classIds.map(() => '?').join(',');
    regularSubjects = db.prepare(`SELECT * FROM regular_subjects WHERE class_id IN (${placeholders})`).all(...classIds);
    professionalUcs = db.prepare(`SELECT * FROM professional_ucs WHERE class_id IN (${placeholders})`).all(...classIds);
    enrollments = db.prepare(`SELECT * FROM enrollments WHERE class_id IN (${placeholders})`).all(...classIds);
    studentAccommodations = db.prepare(`SELECT * FROM student_accommodations WHERE enrollment_id IN (SELECT id FROM enrollments WHERE class_id IN (${placeholders}))`).all(...classIds);
    classroomNotes = db.prepare(`SELECT * FROM classroom_notes WHERE class_id IN (${placeholders})`).all(...classIds);
    observationRubrics = db.prepare(`SELECT * FROM observation_rubrics WHERE class_id IN (${placeholders})`).all(...classIds);
    lessonSummaries = db.prepare(`SELECT * FROM lesson_summaries WHERE class_id IN (${placeholders})`).all(...classIds);
    attendanceSessions = db.prepare(`SELECT * FROM attendance_sessions WHERE class_id IN (${placeholders})`).all(...classIds);

    const ucIds = professionalUcs.map(u => u.id);
    if (ucIds.length > 0) {
      const ucPlaceholders = ucIds.map(() => '?').join(',');
      professionalModules = db.prepare(`SELECT * FROM professional_modules WHERE uc_id IN (${ucPlaceholders})`).all(...ucIds);
    }

    const studentIds = enrollments.map(e => e.student_id);
    if (studentIds.length > 0) {
      const stPlaceholders = studentIds.map(() => '?').join(',');
      students = db.prepare(`SELECT * FROM students WHERE id IN (${stPlaceholders})`).all(...studentIds);
    }

    const enrollmentIds = enrollments.map(e => e.id);
    if (enrollmentIds.length > 0) {
      const enPlaceholders = enrollmentIds.map(() => '?').join(',');
      finalGrades = db.prepare(`SELECT * FROM final_grades WHERE enrollment_id IN (${enPlaceholders})`).all(...enrollmentIds);
      recoveries = db.prepare(`SELECT * FROM recoveries WHERE enrollment_id IN (${enPlaceholders})`).all(...enrollmentIds);
      pedagogicalComments = db.prepare(`SELECT * FROM pedagogical_comments WHERE enrollment_id IN (${enPlaceholders})`).all(...enrollmentIds);
    }

    const rubricIds = observationRubrics.map(r => r.id);
    if (rubricIds.length > 0) {
      const rPlaceholders = rubricIds.map(() => '?').join(',');
      rubricCriteria = db.prepare(`SELECT * FROM rubric_criteria WHERE rubric_id IN (${rPlaceholders})`).all(...rubricIds);
      studentRubricEvaluations = db.prepare(`SELECT * FROM student_rubric_evaluations WHERE rubric_id IN (${rPlaceholders})`).all(...rubricIds);
    }

    const sessionIds = attendanceSessions.map(s => s.id);
    if (sessionIds.length > 0) {
      const sPlaceholders = sessionIds.map(() => '?').join(',');
      attendanceRecords = db.prepare(`SELECT * FROM attendance_records WHERE session_id IN (${sPlaceholders})`).all(...sessionIds);
    }

    instruments = db.prepare(`SELECT * FROM evaluation_instruments WHERE regular_subject_id IN (SELECT id FROM regular_subjects WHERE class_id IN (${placeholders})) OR module_id IN (SELECT id FROM professional_modules WHERE uc_id IN (SELECT id FROM professional_ucs WHERE class_id IN (${placeholders})))`).all(...classIds, ...classIds);
    if (instruments.length > 0) {
      const instIds = instruments.map(i => i.id);
      const instPlaceholders = instIds.map(() => '?').join(',');
      instrumentResults = db.prepare(`SELECT * FROM instrument_results WHERE instrument_id IN (${instPlaceholders})`).all(...instIds);
    }
  }

  res.json({
    format: 'caderno_letivo_backup',
    version: '2.0',
    exportedAt: new Date().toISOString(),
    teacher: {
      name: teacher.name,
      email: teacher.email,
      school: teacher.school,
    },
    data: {
      academicYears,
      classes,
      regularSubjects,
      professionalUcs,
      professionalModules,
      students,
      enrollments,
      instruments,
      instrumentResults,
      finalGrades,
      recoveries,
      pedagogicalComments,
      studentAccommodations,
      classroomNotes,
      observationRubrics,
      rubricCriteria,
      studentRubricEvaluations,
      lessonSummaries,
      attendanceSessions,
      attendanceRecords,
    },
  });
});
