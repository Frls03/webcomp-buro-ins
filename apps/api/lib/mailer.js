import { env } from "./env.js";
import nodemailer from "nodemailer";

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
  return normalizeBoolean(env.welcomeEmailEnabled) && Boolean(env.smtpUser && env.smtpPass && env.welcomeEmailFrom);
}

function parseOptionalList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

let transporter;

function getTransporter() {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: env.smtpHost,
    port: Number(env.smtpPort || 465),
    secure: normalizeBoolean(env.smtpSecure),
    auth: {
      user: env.smtpUser,
      pass: env.smtpPass
    }
  });

  return transporter;
}

export async function sendWelcomeEmail({ to, fullName, courses }) {
  if (!isWelcomeEmailEnabled()) return;

  const mail = {
    from: env.welcomeEmailFrom,
    to: [to],
    cc: parseOptionalList(env.welcomeEmailCc),
    replyTo: env.welcomeEmailReplyTo || undefined,
    subject: "Inscripcion exitosa - Buro Business Week",
    html: buildWelcomeHtml({ fullName, courses }),
    text: buildWelcomeText({ fullName, courses })
  };

  await getTransporter().sendMail(mail);
}
