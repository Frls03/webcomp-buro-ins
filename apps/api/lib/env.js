function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export const env = {
  supabaseUrl: required("SUPABASE_URL"),
  supabaseAnonKey: required("SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  turnstileSecret: required("TURNSTILE_SECRET_KEY"),
  turnstileSecretSomosBuro: process.env.TURNSTILE_SECRET_KEY_SOMOSBURO || "",
  publicAllowedOrigin: required("PUBLIC_ALLOWED_ORIGIN"),
  adminAllowedOrigin: required("ADMIN_ALLOWED_ORIGIN"),
  welcomeEmailEnabled: process.env.WELCOME_EMAIL_ENABLED || "false",
  smtpHost: process.env.SMTP_HOST || "smtp.gmail.com",
  smtpPort: process.env.SMTP_PORT || "465",
  smtpSecure: process.env.SMTP_SECURE || "true",
  smtpUser: process.env.SMTP_USER || "",
  smtpPass: process.env.SMTP_PASS || "",
  welcomeEmailFrom: process.env.WELCOME_EMAIL_FROM || "",
  welcomeEmailReplyTo: process.env.WELCOME_EMAIL_REPLY_TO || "",
  welcomeEmailCc: process.env.WELCOME_EMAIL_CC || ""
};

if (process.env.NODE_ENV === "production" && env.turnstileSecret === "replace-me") {
  throw new Error("Invalid TURNSTILE_SECRET_KEY in production. Configure a real secret key.");
}
