import nodemailer from "nodemailer";
import { z } from "zod";
import { withCors } from "../../../lib/cors.js";
import { badRequest, forbidden, methodNotAllowed, serverError, unauthorized } from "../../../lib/http.js";
import { canAccess, requireAdmin } from "../../../lib/auth.js";

const smtpTestSchema = z.object({
  authMode: z.enum(["password", "gmail_oauth2"]).default("password"),
  testTo: z.string().email("Ingresa un correo valido para la prueba."),
  smtpHost: z.string().optional().default(""),
  smtpPort: z.coerce.number().int().min(1).max(65535).optional().default(587),
  smtpSecure: z.boolean().optional().default(false),
  smtpUser: z.string().min(1, "Ingresa el usuario SMTP."),
  smtpPass: z.string().optional().default(""),
  googleClientId: z.string().optional().default(""),
  googleClientSecret: z.string().optional().default(""),
  googleRefreshToken: z.string().optional().default(""),
  welcomeEmailFrom: z.string().min(3, "Ingresa el remitente."),
  welcomeEmailReplyTo: z.string().optional().default(""),
  welcomeEmailCc: z.string().optional().default("")
});

function parseOptionalList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function createTransporter(payload) {
  if (payload.authMode === "gmail_oauth2") {
    return nodemailer.createTransport({
      service: "gmail",
      auth: {
        type: "OAuth2",
        user: payload.smtpUser,
        clientId: payload.googleClientId,
        clientSecret: payload.googleClientSecret,
        refreshToken: payload.googleRefreshToken
      }
    });
  }

  return nodemailer.createTransport({
    host: payload.smtpHost,
    port: payload.smtpPort,
    secure: payload.smtpSecure,
    auth: {
      user: payload.smtpUser,
      pass: payload.smtpPass
    }
  });
}

export default async function handler(req, res) {
  if (!withCors(req, res, "admin")) return;
  if (req.method !== "POST") return methodNotAllowed(res);

  try {
    const authResult = await requireAdmin(req);
    if (!authResult.ok) {
      if (authResult.status === 401) return unauthorized(res);
      return forbidden(res);
    }

    if (!canAccess(authResult.profile, "update")) return forbidden(res);

    const parsed = smtpTestSchema.safeParse(req.body || {});
    if (!parsed.success) {
      const message = parsed.error.issues?.[0]?.message || "Datos invalidos para SMTP.";
      return badRequest(res, message);
    }

    const payload = parsed.data;
    if (payload.authMode === "gmail_oauth2") {
      if (!payload.googleClientId) return badRequest(res, "Ingresa GOOGLE_CLIENT_ID.");
      if (!payload.googleClientSecret) return badRequest(res, "Ingresa GOOGLE_CLIENT_SECRET.");
      if (!payload.googleRefreshToken) return badRequest(res, "Ingresa GOOGLE_REFRESH_TOKEN.");
    } else {
      if (!payload.smtpHost) return badRequest(res, "Ingresa el host SMTP.");
      if (!payload.smtpPass) return badRequest(res, "Ingresa la contrasena SMTP.");
    }

    const transporter = createTransporter(payload);
    await transporter.sendMail({
      from: payload.welcomeEmailFrom,
      to: [payload.testTo],
      cc: parseOptionalList(payload.welcomeEmailCc),
      replyTo: payload.welcomeEmailReplyTo || undefined,
      subject: "Prueba SMTP - Buro Business School",
      text: [
        "Este es un correo de prueba de configuracion SMTP.",
        "",
        `Enviado por: ${authResult.user.email || "admin"}`
      ].join("\n"),
      html: `
        <div style="font-family: Arial, sans-serif; color: #223; line-height: 1.5;">
          <h3 style="margin: 0 0 10px; color: #bf5900;">Prueba SMTP completada</h3>
          <p style="margin: 0;">La configuracion SMTP envio este correo correctamente.</p>
        </div>
      `
    });

    return res.status(200).json({ ok: true, message: "Correo de prueba enviado." });
  } catch (error) {
    return serverError(res, error);
  }
}
