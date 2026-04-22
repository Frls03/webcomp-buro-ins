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
  return sanitizeText(value).replace(/[^+\d\s()-]/g, "");
}
