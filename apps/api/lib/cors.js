import { env } from "./env.js";

function isLocalhostOrigin(origin) {
  return /^https?:\/\/localhost:\d+$/.test(origin);
}

const defaultOriginsByZone = {
  public: ["https://form.nexlum.site"],
  admin: ["https://admin.nexlum.site"]
};

function parseAllowedOrigins(rawValue) {
  return String(rawValue || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isAllowed(origin, zone) {
  if (!origin) return false;

  const configuredOrigins =
    zone === "public"
      ? parseAllowedOrigins(env.publicAllowedOrigin)
      : parseAllowedOrigins(env.adminAllowedOrigin);
  const allowedOrigins = [...new Set([...(defaultOriginsByZone[zone] || []), ...configuredOrigins])];

  if (allowedOrigins.includes(origin)) return true;

  // In local development we allow localhost with any port to avoid CORS blocks
  // when Vite auto-switches ports because one is already in use.
  if (process.env.NODE_ENV !== "production" && isLocalhostOrigin(origin)) {
    return true;
  }

  return false;
}

export function withCors(req, res, zone) {
  const origin = req.headers.origin || "";

  // Requests without Origin are not browser CORS requests (e.g. direct URL, curl, server-side).
  // Allow them and skip CORS headers.
  if (!origin) {
    return true;
  }

  if (!isAllowed(origin, zone)) {
    res.status(403).json({ error: "Origin no permitido" });
    return false;
  }

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization,Content-Type");
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return false;
  }

  return true;
}
