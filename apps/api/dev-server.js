import "dotenv/config";
import express from "express";
import coursesHandler from "./api/public/courses.js";
import inscriptionsHandler from "./api/public/inscriptions.js";
import recordsHandler from "./api/admin/records/index.js";
import recordByIdHandler from "./api/admin/records/[id].js";
import exportHandler from "./api/admin/export.js";
import smtpTestHandler from "./api/admin/smtp/test.js";
import { withCors } from "./lib/cors.js";

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.json({ limit: "1mb" }));

app.options("/api/public/*", (req, res) => {
  if (!withCors(req, res, "public")) return;
  res.status(204).end();
});

app.options("/api/admin/*", (req, res) => {
  if (!withCors(req, res, "admin")) return;
  res.status(204).end();
});

app.get("/api/public/courses", (req, res) => coursesHandler(req, res));
app.post("/api/public/inscriptions", (req, res) => inscriptionsHandler(req, res));

app.get("/api/admin/records", (req, res) => recordsHandler(req, res));
app.post("/api/admin/records", (req, res) => recordsHandler(req, res));
app.get("/api/admin/records/:id", (req, res) => {
  req.query.id = req.params.id;
  return recordByIdHandler(req, res);
});
app.patch("/api/admin/records/:id", (req, res) => {
  req.query.id = req.params.id;
  return recordByIdHandler(req, res);
});
app.delete("/api/admin/records/:id", (req, res) => {
  req.query.id = req.params.id;
  return recordByIdHandler(req, res);
});
app.get("/api/admin/export", (req, res) => exportHandler(req, res));
app.post("/api/admin/smtp/test", (req, res) => smtpTestHandler(req, res));

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true, service: "api-service" });
});

app.get("/", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "api-service",
    message: "API activa. Usa /api/public/courses o /health para probar."
  });
});

app.use((req, res) => {
  res.status(404).json({ error: `Not found: ${req.method} ${req.path}` });
});

app.listen(port, () => {
  console.log(`API local running on http://localhost:${port}`);
});
