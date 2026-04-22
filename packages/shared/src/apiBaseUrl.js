function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function normalizeConfiguredUrl(value) {
  const raw = trimTrailingSlash(value).trim().replace(/^['"]|['"]$/g, "");
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?$/i.test(raw)) {
    return `https://${raw}`;
  }
  return raw;
}

function isLocalUrl(value) {
  return /^https?:\/\/localhost(?::\d+)?$/i.test(trimTrailingSlash(value));
}

function inferProductionApiBaseUrl(hostname) {
  if (!hostname) return "";

  if (hostname === "form.nexlum.site" || hostname === "admin.nexlum.site" || hostname.endsWith(".vercel.app")) {
    return "https://api.nexlum.site";
  }

  return "";
}

export function resolveApiBaseUrl(configuredValue) {
  const trimmedConfiguredValue = normalizeConfiguredUrl(configuredValue);

  if (typeof window === "undefined") {
    return trimmedConfiguredValue;
  }

  const { hostname, protocol } = window.location;
  const inferredValue = inferProductionApiBaseUrl(hostname);
  const isProductionPage = protocol === "https:";

  if (trimmedConfiguredValue && !(isProductionPage && isLocalUrl(trimmedConfiguredValue))) {
    return trimmedConfiguredValue;
  }

  if (inferredValue) {
    return inferredValue;
  }

  return trimmedConfiguredValue || "http://localhost:3000";
}
