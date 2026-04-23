import { env } from "./env.js";
import nodemailer from "nodemailer";

function normalizeBoolean(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
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

function getMissingConfigKeys() {
  const missing = [];
  if (!env.smtpUser) missing.push("SMTP_USER");
  if (!env.smtpPass) missing.push("SMTP_PASS");
  return missing;
}

function resolveFromAddress() {
  return env.welcomeEmailFrom || env.smtpUser;
}

export function isWelcomeEmailEnabled() {
  return normalizeBoolean(env.welcomeEmailEnabled) && getMissingConfigKeys().length === 0;
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
  if (!isWelcomeEmailEnabled()) {
    const enabledFlag = normalizeBoolean(env.welcomeEmailEnabled);
    const missing = getMissingConfigKeys();
    console.warn("Welcome email skipped: disabled or incomplete config", {
      enabledFlag,
      missing
    });
    return;
  }

  const mail = {
    from: resolveFromAddress(),
    to: [to],
    cc: parseOptionalList(env.welcomeEmailCc),
    replyTo: env.welcomeEmailReplyTo || undefined,
    subject: "Inscripcion exitosa - Buro Business Week",
    html: buildWelcomeHtml({ fullName, courses }),
    text: buildWelcomeText({ fullName, courses })
  };

  const info = await getTransporter().sendMail(mail);
  console.log("Welcome email sent", {
    to,
    messageId: info?.messageId || null,
    accepted: info?.accepted || [],
    rejected: info?.rejected || []
  });
}
