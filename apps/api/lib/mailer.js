import { env } from "./env.js";

function normalizeBoolean(value) {
  return String(value || "").toLowerCase() === "true";
}

function formatCourseLine(course) {
  const prefix = [course.day_of_week, course.schedule_label].filter(Boolean).join(" ");
  return prefix ? `${prefix} - ${course.title}` : course.title;
}

function buildWelcomeHtml({ fullName, courses }) {
  const courseList = courses
    .map((course) => `<li>${formatCourseLine(course)}</li>`)
    .join("");

  return `
    <div style="font-family: Arial, sans-serif; color: #223; line-height: 1.5;">
      <h2 style="margin: 0 0 12px; color: #bf5900;">Bienvenido(a) a Buró Business Week</h2>
      <p style="margin: 0 0 10px;">Hola ${fullName},</p>
      <p style="margin: 0 0 12px;">Tu inscripcion fue registrada exitosamente. Estos son los cursos seleccionados:</p>
      <ul style="margin: 0 0 14px 18px; padding: 0;">${courseList}</ul>
      <p style="margin: 0 0 10px;">Pronto te compartiremos mas detalles por este mismo correo.</p>
      <p style="margin: 0;">Equipo Buró Business School</p>
    </div>
  `;
}

function buildWelcomeText({ fullName, courses }) {
  const lines = courses.map((course) => `- ${formatCourseLine(course)}`).join("\n");
  return [
    "Bienvenido(a) a Buro Business Week",
    "",
    `Hola ${fullName},`,
    "Tu inscripcion fue registrada exitosamente.",
    "Cursos seleccionados:",
    lines,
    "",
    "Pronto te compartiremos mas detalles por este mismo correo.",
    "Equipo Buro Business School"
  ].join("\n");
}

export function isWelcomeEmailEnabled() {
  return normalizeBoolean(env.welcomeEmailEnabled) && Boolean(env.resendApiKey && env.welcomeEmailFrom);
}

export async function sendWelcomeEmail({ to, fullName, courses }) {
  if (!isWelcomeEmailEnabled()) return;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.resendApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: env.welcomeEmailFrom,
      to: [to],
      reply_to: env.welcomeEmailReplyTo || undefined,
      subject: "Inscripcion exitosa - Buro Business Week",
      html: buildWelcomeHtml({ fullName, courses }),
      text: buildWelcomeText({ fullName, courses })
    })
  });

  if (!response.ok) {
    const errorPayload = await response.text();
    throw new Error(`No se pudo enviar correo de bienvenida: ${response.status} ${errorPayload}`);
  }
}
