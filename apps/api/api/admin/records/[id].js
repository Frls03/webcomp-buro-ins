import { parseOrThrow, adminUpdateSchema } from "@buro-ins/shared/src/validation.js";
import { withCors } from "../../../lib/cors.js";
import { badRequest, forbidden, methodNotAllowed, serverError, unauthorized } from "../../../lib/http.js";
import { canAccess, requireAdmin } from "../../../lib/auth.js";
import { supabaseAdmin } from "../../../lib/supabaseAdmin.js";

function getSelectedCourseIds(row) {
  if (Array.isArray(row.selected_course_ids) && row.selected_course_ids.length > 0) {
    return row.selected_course_ids;
  }
  return row.course_id ? [row.course_id] : [];
}

function normalizeDetail(row, notes, selectedCourses) {
  return {
    id: row.id,
    full_name: row.full_name,
    email: row.email,
    phone: row.phone,
    company_name: row.company_name,
    job_position: row.job_position,
    academic_degree: row.academic_degree,
    interests: row.interests,
    status: row.status,
    course_ids: getSelectedCourseIds(row),
    course_title: (selectedCourses || [])
      .map((course) => {
        const prefix = [course.day_of_week, course.schedule_label].filter(Boolean).join(" ");
        return prefix ? `${prefix} - ${course.title}` : course.title;
      })
      .join(" | "),
    selected_courses: selectedCourses || [],
    notes: (notes || []).map((note) => ({
      id: note.id,
      note: note.note,
      created_at: note.created_at,
      created_by_email: note.created_by_email,
      created_by_name: note.admin_profiles?.display_name || null
    }))
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

    const registrationId = req.query.id;
    if (!registrationId) return methodNotAllowed(res);

    if (req.method === "GET") {
      if (!canAccess(authResult.profile, "read")) return forbidden(res);

      const [registrationResult, notesResult] = await Promise.all([
        supabaseAdmin
          .from("registrations")
          .select("id,full_name,email,phone,company_name,job_position,academic_degree,interests,status,course_id,selected_course_ids")
          .eq("id", registrationId)
          .single(),
        supabaseAdmin
          .from("registration_notes")
          .select("id,note,created_at,created_by_email,admin_profiles(display_name)")
          .eq("registration_id", registrationId)
          .order("created_at", { ascending: false })
      ]);

      if (registrationResult.error) throw registrationResult.error;
      if (notesResult.error) throw notesResult.error;

      const selectedCourseIds = getSelectedCourseIds(registrationResult.data);
      let selectedCourses = [];

      if (selectedCourseIds.length > 0) {
        const { data: courseRows, error: coursesError } = await supabaseAdmin
          .from("courses")
          .select("id,title,day_of_week,schedule_label,display_order")
          .in("id", selectedCourseIds)
          .order("display_order", { ascending: true })
          .order("title", { ascending: true });

        if (coursesError) throw coursesError;
        selectedCourses = courseRows || [];
      }

      return res.status(200).json({
        item: normalizeDetail(registrationResult.data, notesResult.data, selectedCourses)
      });
    }

    if (req.method === "PATCH") {
      const canUpdate = canAccess(authResult.profile, "update");
      if (!canUpdate) return forbidden(res);

      const { data: currentRegistration, error: currentError } = await supabaseAdmin
        .from("registrations")
        .select("id,status")
        .eq("id", registrationId)
        .single();

      if (currentError || !currentRegistration) {
        return badRequest(res, "Registro no encontrado.");
      }

      const payload = parseOrThrow(adminUpdateSchema, req.body || {});

      const { error: updateError } = await supabaseAdmin
        .from("registrations")
        .update({ status: payload.status, updated_at: new Date().toISOString() })
        .eq("id", registrationId);
      if (updateError) throw updateError;

      if (payload.internalNote) {
        const { error: noteError } = await supabaseAdmin.from("registration_notes").insert({
          registration_id: registrationId,
          admin_profile_id: authResult.profile.id,
          note: payload.internalNote,
          created_by_email: authResult.user.email
        });
        if (noteError) throw noteError;
      }

      const { error: auditError } = await supabaseAdmin.from("audit_logs").insert({
        actor_profile_id: authResult.profile.id,
        action: "registration.update",
        target_table: "registrations",
        target_id: registrationId,
        metadata: {
          actor_email: authResult.user.email,
          actor_name: authResult.profile.display_name || null,
          status: payload.status,
          has_note: Boolean(payload.internalNote)
        }
      });
      if (auditError) throw auditError;

      return res.status(200).json({ ok: true });
    }

    if (req.method === "DELETE") {
      if (!canAccess(authResult.profile, "remove")) return forbidden(res);

      const { error: deleteError } = await supabaseAdmin
        .from("registrations")
        .delete()
        .eq("id", registrationId);

      if (deleteError) throw deleteError;

      await supabaseAdmin.from("audit_logs").insert({
        actor_profile_id: authResult.profile.id,
        action: "registration.delete",
        target_table: "registrations",
        target_id: registrationId,
        metadata: {
          actor_email: authResult.user.email,
          actor_name: authResult.profile.display_name || null
        }
      });

      return res.status(200).json({ ok: true });
    }

    return methodNotAllowed(res);
  } catch (error) {
    if (String(error.message || "").startsWith("Validation error")) {
      return res.status(400).json({ error: error.message });
    }
    return serverError(res, error);
  }
}
