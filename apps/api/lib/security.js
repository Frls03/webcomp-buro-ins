import crypto from "node:crypto";
import { env } from "./env.js";
import { supabaseAdmin } from "./supabaseAdmin.js";

function isTurnstileBypassedInDev() {
  return process.env.NODE_ENV !== "production" && env.turnstileSecret === "replace-me";
}

function resolveTurnstileSecretForOrigin(origin) {
  const normalizedOrigin = String(origin || "").toLowerCase();
  const isSomosBuroOrigin =
    normalizedOrigin.startsWith("https://somosburo.com") ||
    normalizedOrigin.startsWith("https://www.somosburo.com");

  if (isSomosBuroOrigin && env.turnstileSecretSomosBuro) {
    return env.turnstileSecretSomosBuro;
  }

  return env.turnstileSecret;
}

export function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "0.0.0.0";
}

export function hashIp(ip) {
  return crypto.createHash("sha256").update(ip).digest("hex");
}

export async function verifyTurnstileToken(token, ip, origin = "") {
  if (isTurnstileBypassedInDev()) {
    return true;
  }

  if (!token || token.length < 10) {
    return false;
  }

  const body = new URLSearchParams({
    secret: resolveTurnstileSecretForOrigin(origin),
    response: token,
    remoteip: ip
  });

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  const data = await response.json();
  return Boolean(data.success);
}

export async function enforceRateLimit(ipHash, endpoint, maxRequests, periodSeconds) {
  const { data, error } = await supabaseAdmin.rpc("check_rate_limit", {
    p_ip_hash: ipHash,
    p_endpoint: endpoint,
    p_max_requests: maxRequests,
    p_period_seconds: periodSeconds
  });

  if (error) {
    throw new Error("No se pudo verificar rate limit");
  }

  return Boolean(data);
}
