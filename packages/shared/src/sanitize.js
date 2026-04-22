export function sanitizeText(value) {
  if (typeof value !== "string") return "";
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim();
}

export function normalizeEmail(value) {
  return sanitizeText(value).toLowerCase();
}

export function normalizePhone(value) {
  const cleaned = sanitizeText(value);
  const hasPlus = cleaned.trim().startsWith("+");
  const digits = cleaned.replace(/\D/g, "");
  return hasPlus ? `+${digits}` : digits;
}

export function isInternationalPhone(value) {
  return /^\+[1-9]\d{7,14}$/.test(String(value || ""));
}
