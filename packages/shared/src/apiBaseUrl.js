function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
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
  const trimmedConfiguredValue = trimTrailingSlash(configuredValue);

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
