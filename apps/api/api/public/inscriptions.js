import { parseOrThrow, registrationSchema } from "@buro-ins/shared/src/validation.js";
import { withCors } from "../../lib/cors.js";
import { badRequest, methodNotAllowed, serverError } from "../../lib/http.js";
import { enforceRateLimit, getClientIp, hashIp, verifyTurnstileToken } from "../../lib/security.js";
import { sendWelcomeEmail } from "../../lib/mailer.js";
import { supabaseAdmin } from "../../lib/supabaseAdmin.js";

function isLocalhostOrigin(origin) {
  return /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/i.test(String(origin || ""));
}

export default async function handler(req, res) {
  if (!withCors(req, res, "public")) return;
  if (req.method !== "POST") return methodNotAllowed(res);

  try {
    const payload = parseOrThrow(registrationSchema, req.body || {});
    const clientIp = getClientIp(req);
    const ipHash = hashIp(clientIp);
    const isProductionRuntime =
      process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
    const shouldBypassTurnstile = !isProductionRuntime && isLocalhostOrigin(req.headers.origin);

    const allowed = await enforceRateLimit(ipHash, "public-inscriptions", 5, 300);
    if (!allowed) return badRequest(res, "Demasiados intentos. Intenta mas tarde.");

    const captchaOk =
      shouldBypassTurnstile ||
      await verifyTurnstileToken(payload.turnstileToken, clientIp, req.headers.origin || "");
    if (!captchaOk) return badRequest(res, "Captcha invalido.");

    const uniqueCourseIds = [...new Set(payload.courseIds)];

    const { data: activeCourses, error: courseError } = await supabaseAdmin
      .from("courses")
      .select("id,title,day_of_week,schedule_label")
      .in("id", uniqueCourseIds)
      .eq("is_active", true);
    if (courseError || !activeCourses || activeCourses.length !== uniqueCourseIds.length) {
      return badRequest(res, "Uno o mas cursos seleccionados no estan disponibles.");
    }

    const orderedCourseIds = [...uniqueCourseIds].sort();
    const primaryCourseId = uniqueCourseIds[0];

    const duplicateFingerprint = `${payload.email}:${orderedCourseIds.join(",")}`;
    const { error: insertError } = await supabaseAdmin.from("registrations").insert({
      full_name: payload.fullName,
      email: payload.email,
      phone: payload.phone,
      company_name: payload.companyName,
      work_area: payload.jobPosition,
      job_position: payload.jobPosition,
      academic_degree: payload.academicDegree,
      interests: payload.interests,
      course_id: primaryCourseId,
      selected_course_ids: uniqueCourseIds,
      privacy_accepted_at: new Date().toISOString(),
      source: "public-form",
      fingerprint: duplicateFingerprint
    });

    if (insertError) {
      if (insertError.code === "23505") {
        return badRequest(res, "Ya existe una inscripcion con ese correo para la misma seleccion de cursos.");
      }
      throw insertError;
    }

    try {
      await sendWelcomeEmail({
        to: payload.email,
        fullName: payload.fullName,
        courses: activeCourses || []
      });
    } catch (mailError) {
      console.error("Welcome email error", mailError);
    }

    res.status(201).json({ ok: true });
  } catch (error) {
    if (String(error.message || "").startsWith("Validation error")) {
      return badRequest(res, error.message);
    }
    serverError(res, error);
  }
}
