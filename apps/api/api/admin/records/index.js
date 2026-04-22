import { z } from "zod";
import { isInternationalPhone, normalizeEmail, normalizePhone, sanitizeText } from "@buro-ins/shared/src/sanitize.js";
import { REGISTRATION_STATUSES } from "@buro-ins/shared/src/constants.js";
import { withCors } from "../../../lib/cors.js";
import { badRequest, forbidden, methodNotAllowed, serverError, unauthorized } from "../../../lib/http.js";
import { canAccess, getPermissions, requireAdmin } from "../../../lib/auth.js";
import { supabaseAdmin } from "../../../lib/supabaseAdmin.js";

const createRegistrationSchema = z.object({
  fullName: z.string().min(3).max(120).transform(sanitizeText),
  email: z.string().email().max(160).transform(normalizeEmail),
  phone: z
    .string()
    .min(8)
    .max(30)
    .transform(normalizePhone)
    .refine(isInternationalPhone),
  companyName: z.string().min(2).max(160).transform(sanitizeText),
  jobPosition: z.string().min(2).max(120).transform(sanitizeText),
  academicDegree: z.string().min(2).max(120).transform(sanitizeText),
  interests: z.string().min(3).max(500).transform(sanitizeText),
  courseIds: z.array(z.string().uuid()).min(1).max(8),
  status: z.enum(REGISTRATION_STATUSES).default("pending")
});

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

function mapItem(row, coursesById) {
  const selectedCourseIds = getSelectedCourseIds(row);
  return {
    id: row.id,
    created_at: row.created_at,
    full_name: row.full_name,
    email: row.email,
    phone: row.phone,
    company_name: row.company_name,
    job_position: row.job_position,
    academic_degree: row.academic_degree,
    status: row.status,
    course_ids: selectedCourseIds,
    course_title: formatCourseTitles(selectedCourseIds, coursesById)
  };
}

export default async function handler(req, res) {
  if (!withCors(req, res, "admin")) return;

  try {
    const authResult = await requireAdmin(req);
    if (!authResult.ok) {
      if (authResult.status === 401) return unauthorized(res);
      return forbidden(res);
    }

    const permissions = getPermissions(authResult.profile);

    if (req.method === "GET") {
      if (!canAccess(authResult.profile, "read")) return forbidden(res);

      const page = Math.max(1, Number(req.query.page || "1"));
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || "10")));
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabaseAdmin
        .from("registrations")
        .select("id,created_at,full_name,email,phone,company_name,job_position,academic_degree,status,course_id,selected_course_ids", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to);

      if (req.query.status) query = query.eq("status", req.query.status);
      if (req.query.courseId) query = query.contains("selected_course_ids", [req.query.courseId]);
      if (req.query.search) {
        const search = String(req.query.search).trim();
        query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%,company_name.ilike.%${search}%,job_position.ilike.%${search}%,academic_degree.ilike.%${search}%`);
      }

      const [{ data, error, count }, coursesResult] = await Promise.all([
        query,
        supabaseAdmin
          .from("courses")
          .select("id,title,day_of_week,schedule_label,display_order")
          .eq("is_active", true)
          .not("day_of_week", "is", null)
          .not("schedule_label", "is", null)
          .order("display_order", { ascending: true })
          .order("title", { ascending: true })
      ]);

      if (error) throw error;
      if (coursesResult.error) throw coursesResult.error;

      const coursesById = new Map((coursesResult.data || []).map((course) => [course.id, course]));

      return res.status(200).json({
        total: count || 0,
        items: (data || []).map((row) => mapItem(row, coursesById)),
        courses: coursesResult.data || [],
        currentRole: authResult.profile.role,
        permissions
      });
    }

    if (req.method === "POST") {
      if (!canAccess(authResult.profile, "create")) return forbidden(res);

      const parsed = createRegistrationSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return badRequest(res, "Datos invalidos para crear registro.");
      }

      const payload = parsed.data;
      const uniqueCourseIds = [...new Set(payload.courseIds)];
      const orderedCourseIds = [...uniqueCourseIds].sort();
      const fingerprint = `${payload.email}:${orderedCourseIds.join(",")}`;

      const { data: courses, error: courseError } = await supabaseAdmin
        .from("courses")
        .select("id")
        .in("id", uniqueCourseIds)
        .eq("is_active", true);

      if (courseError || !courses || courses.length !== uniqueCourseIds.length) {
        return badRequest(res, "Uno o mas cursos seleccionados no existen o no estan activos.");
      }

      const { data: created, error: insertError } = await supabaseAdmin
        .from("registrations")
        .insert({
          full_name: payload.fullName,
          email: payload.email,
          phone: payload.phone,
          company_name: payload.companyName,
          work_area: payload.jobPosition,
          job_position: payload.jobPosition,
          academic_degree: payload.academicDegree,
          interests: payload.interests,
          course_id: uniqueCourseIds[0],
          selected_course_ids: uniqueCourseIds,
          status: payload.status,
          source: "admin-manual",
          fingerprint,
          privacy_accepted_at: new Date().toISOString()
        })
        .select("id")
        .single();

      if (insertError) {
        if (insertError.code === "23505") {
          return badRequest(res, "Ya existe un registro para ese correo y curso.");
        }
        throw insertError;
      }

      await supabaseAdmin.from("audit_logs").insert({
        actor_profile_id: authResult.profile.id,
        action: "registration.create_manual",
        target_table: "registrations",
        target_id: created.id,
        metadata: {
          actor_email: authResult.user.email,
          actor_name: authResult.profile.display_name || null,
          status: payload.status,
          courses_selected: uniqueCourseIds.length
        }
      });

      return res.status(201).json({ ok: true, id: created.id });
    }

    return methodNotAllowed(res);
  } catch (error) {
    serverError(res, error);
  }
}
