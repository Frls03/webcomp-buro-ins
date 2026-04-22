export function methodNotAllowed(res) {
  res.status(405).json({ error: "Metodo no permitido" });
}

export function badRequest(res, message) {
  res.status(400).json({ error: message || "Solicitud invalida" });
}

export function unauthorized(res) {
  res.status(401).json({ error: "No autenticado" });
}

export function forbidden(res) {
  res.status(403).json({ error: "No autorizado" });
}

export function serverError(res, error) {
  res.status(500).json({ error: "Error interno", detail: error.message });
}
