const ADMIN_API_BASE_URL = import.meta.env.VITE_ADMIN_API_BASE_URL;

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestWithRetry(url, options, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, options);
      return response;
    } catch (_error) {
      if (attempt === retries) {
        throw new Error("No hay conexion con la API. Verifica que 'npm run dev:stack' este ejecutandose.");
      }
      await wait(300 * attempt);
    }
  }
  throw new Error("No hay conexion con la API.");
}

function buildAuthHeaders(token, withJson = false) {
  const headers = {
    Authorization: `Bearer ${token}`
  };
  if (withJson) headers["Content-Type"] = "application/json";
  return headers;
}

export async function getRecords(token, params) {
  const query = new URLSearchParams(params).toString();
  const response = await requestWithRetry(`${ADMIN_API_BASE_URL}/api/admin/records?${query}`, {
    method: "GET",
    headers: buildAuthHeaders(token)
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "No se pudo cargar registros");
  return data;
}

export async function getRecordById(token, id) {
  const response = await requestWithRetry(`${ADMIN_API_BASE_URL}/api/admin/records/${id}`, {
    method: "GET",
    headers: buildAuthHeaders(token)
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "No se pudo cargar el detalle");
  return data;
}

export async function updateRecord(token, id, payload) {
  const response = await requestWithRetry(`${ADMIN_API_BASE_URL}/api/admin/records/${id}`, {
    method: "PATCH",
    headers: buildAuthHeaders(token, true),
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "No se pudo actualizar");
  return data;
}

export async function createRecord(token, payload) {
  const response = await requestWithRetry(`${ADMIN_API_BASE_URL}/api/admin/records`, {
    method: "POST",
    headers: buildAuthHeaders(token, true),
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "No se pudo crear el registro");
  return data;
}

export async function deleteRecord(token, id) {
  const response = await requestWithRetry(`${ADMIN_API_BASE_URL}/api/admin/records/${id}`, {
    method: "DELETE",
    headers: buildAuthHeaders(token)
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "No se pudo eliminar el registro");
  return data;
}

export async function exportCsv(token, params) {
  const query = new URLSearchParams(params).toString();
  const response = await requestWithRetry(`${ADMIN_API_BASE_URL}/api/admin/export?${query}`, {
    method: "GET",
    headers: buildAuthHeaders(token)
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || "No se pudo exportar");
  }

  return response.blob();
}
