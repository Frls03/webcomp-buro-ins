import { withCors } from "../../lib/cors.js";
import { forbidden, methodNotAllowed, unauthorized } from "../../lib/http.js";
import { canAccess, requireAdmin } from "../../lib/auth.js";
import { supabaseAdmin } from "../../lib/supabaseAdmin.js";

function getSelectedCourseIds(row) {
  if (Array.isArray(row.selected_course_ids) && row.selected_course_ids.length > 0) {
    return row.selected_course_ids;
  }
  return row.course_id ? [row.course_id] : [];
}

function formatCourseTitles(courseIds, coursesById) {
  return courseIds
    .map((id) => {
      const course = coursesById.get(id);
      if (!course) return null;
      const prefix = [course.day_of_week, course.schedule_label].filter(Boolean).join(" ");
      return prefix ? `${prefix} - ${course.title}` : course.title;
    })
    .filter(Boolean)
    .join(" | ");
}

function toCsv(rows, coursesById) {
  const headers = [
    "fecha",
    "nombre",
    "correo",
    "telefono",
    "empresa",
    "puesto_desempenado",
    "ultimo_grado_academico",
    "cursos",
    "estado"
  ];
  const lines = rows.map((row) => [
    row.created_at,
    row.full_name,
    row.email,
    row.phone,
    row.company_name,
    row.job_position,
    row.academic_degree,
    formatCourseTitles(getSelectedCourseIds(row), coursesById),
    row.status
  ]);

  return [headers, ...lines]
    .map((line) => line.map((value) => `"${String(value || "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

export default async function handler(req, res) {
  if (!withCors(req, res, "admin")) return;
  if (req.method !== "GET") return methodNotAllowed(res);

  const authResult = await requireAdmin(req);
  if (!authResult.ok) {
    if (authResult.status === 401) return unauthorized(res);
    return forbidden(res);
  }
  if (!canAccess(authResult.profile, "export")) return forbidden(res);

  let query = supabaseAdmin
    .from("registrations")
    .select("created_at,full_name,email,phone,company_name,job_position,academic_degree,status,course_id,selected_course_ids")
    .order("created_at", { ascending: false })
    .limit(5000);

  if (req.query.status) query = query.eq("status", req.query.status);
  if (req.query.courseId) query = query.contains("selected_course_ids", [req.query.courseId]);
  if (req.query.search) {
    const search = String(req.query.search).trim();
    query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%,company_name.ilike.%${search}%,job_position.ilike.%${search}%,academic_degree.ilike.%${search}%`);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: "No se pudo exportar" });

  const { data: courses, error: coursesError } = await supabaseAdmin
    .from("courses")
    .select("id,title,day_of_week,schedule_label");

  if (coursesError) return res.status(500).json({ error: "No se pudo exportar" });

  const coursesById = new Map((courses || []).map((course) => [course.id, course]));

  const csv = toCsv(data || [], coursesById);
  await supabaseAdmin.from("audit_logs").insert({
    actor_profile_id: authResult.profile.id,
    action: "registration.export_csv",
    target_table: "registrations",
    metadata: {
      actor_email: authResult.user.email,
      actor_name: authResult.profile.display_name || null,
      rows: (data || []).length
    }
  });

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=registros.csv");
  return res.status(200).send(csv);
}
