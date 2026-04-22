import { resolveApiBaseUrl } from "@buro-ins/shared/src/apiBaseUrl.js";

const PUBLIC_API_BASE_URL = resolveApiBaseUrl(import.meta.env.VITE_PUBLIC_API_BASE_URL);

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestWithRetry(url, options, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, options);
      return response;
    } catch (error) {
      if (attempt === retries) {
        throw new Error("No hay conexión con la API. Verifica que 'npm run dev:stack' esté ejecutándose.");
      }
      await wait(300 * attempt);
    }
  }
  throw new Error("No hay conexión con la API.");
}

export async function fetchCourses() {
  const response = await requestWithRetry(`${PUBLIC_API_BASE_URL}/api/public/courses`, {
    method: "GET"
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data?.error || "No se pudieron cargar los cursos.");
  }

  return response.json();
}

export async function submitRegistration(payload) {
  const response = await requestWithRetry(`${PUBLIC_API_BASE_URL}/api/public/inscriptions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || "No se pudo enviar la inscripción.");
  }

  return data;
}
