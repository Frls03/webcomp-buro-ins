# Sistema de Inscripcion Web - Arquitectura Profesional

## 1. Resumen ejecutivo corto
Esta solucion implementa una arquitectura separada por zonas de riesgo:
- Zona publica para captacion de datos del formulario (visible en ejemplo.com/inscripcion).
- Zona administrativa totalmente separada en dominio del operador (por ejemplo, admin.innovacion.com).
- Capa API segura entre frontend y base de datos para evitar escrituras directas desde frontend publico.
- Base de datos Supabase con RLS, auditoria, roles y controles de abuso (rate limit + Turnstile).

## 2. Arquitectura recomendada
### Decision de arquitectura (como tech lead)
Recomendacion principal: Reverse proxy de subruta para la zona publica + dominio separado para admin.

Por que:
- Mantiene UX y confianza: el usuario final ve ejemplo.com/inscripcion todo el tiempo.
- No expone dominio alterno en la superficie publica.
- Evita mezclar rutas sensibles en dominio cliente.
- Es mas robusto y mantenible que iframe/embed para flujos de formularios con validaciones, accesibilidad y analitica.

### Estrategia para ejemplo.com/inscripcion
1. Desplegar app publica en Vercel (proyecto public-web).
2. Cliente configura reverse proxy de subruta:
	 - Entrada: https://ejemplo.com/inscripcion
	 - Backend target: deployment URL de public-web
3. Configurar base de assets de Vite en /inscripcion/ (ya aplicado en apps/public-web/vite.config.js).

### Separacion publica vs administrativa
- Publico: apps/public-web
	- Solo captura formulario y consume endpoint publico.
	- No contiene vista ni funciones administrativas.
- Administrativo: apps/admin-web
	- Vive en admin.innovacion.com.
	- Requiere autenticacion y rol.

### Proteccion de base de datos
- Frontend publico no escribe directo a tablas.
- Inserciones pasan por API backend (apps/api).
- RLS + privilegios minimos en Supabase.
- Service role solamente en backend server-to-server.

### Comparativa de opciones de integracion publica
- Reverse proxy subpath: mejor opcion para este caso.
- iframe: aceptable solo como fallback, peor SEO, peor accesibilidad y telemetria fragmentada.
- script embed: util para widgets simples, menos control integral de pagina.
- combinacion recomendada: reverse proxy primario + iframe fallback temporal durante integracion.

## 3. Estructura del proyecto
Monorepo npm workspaces:

```
.
├─ apps/
│  ├─ public-web/              # React + Vite (formulario publico)
│  ├─ admin-web/               # React + Vite (panel admin)
│  └─ api/                     # Vercel Functions seguras
├─ packages/
│  └─ shared/                  # validaciones, sanitizacion, constantes
├─ supabase/
│  └─ migrations/              # SQL y RLS
├─ docs/
├─ .env.example
└─ README.md
```

## 4. Modelo de datos
Tablas principales:
- courses
	- id uuid PK
	- title text
	- description text
	- is_active bool
	- starts_at timestamptz
- registrations
	- id uuid PK
	- full_name, email, phone, interests
	- course_id FK -> courses
	- status enum: pending, reviewed, accepted, rejected, waitlist
	- privacy_accepted_at timestamptz
	- fingerprint unique (politica anti-duplicados: email + curso)
- admin_profiles
	- user_id (auth.users)
	- role enum: viewer, editor, manager
	- is_active
- registration_notes
	- registration_id FK
	- admin_profile_id FK
	- note
- audit_logs
	- actor_profile_id
	- action
	- target_table
	- target_id
	- metadata jsonb
- request_rate_limits
	- ip_hash + endpoint unique
	- request_count y ventana de tiempo

Indices:
- busqueda: email, phone, created_at, status, course_id.
- notas y auditoria por fecha/registro.

## 5. SQL o migraciones
Migracion inicial disponible en:
- supabase/migrations/001_initial.sql

Scripts SQL adicionales de operacion:
- supabase/seeds/002_admin_setup.sql
- supabase/seeds/003_smoke_queries.sql

Incluye:
- tipos enum.
- tablas, FK, unique, indices.
- funcion check_rate_limit.
- helper is_admin(min_role).
- seed de cursos activos.

## 6. Politicas RLS
Implementadas en la migracion:
- courses: lectura publica solo is_active=true.
- registrations: lectura/update solo usuarios admin autenticados con rol adecuado.
- notes: gestion solo admin editor o superior.
- audit_logs: lectura manager, insercion editor+.
- request_rate_limits: solo service_role.

Nota: aunque service role bypass RLS, se mantiene RLS como defensa adicional y control para uso con tokens autenticados.

## 7. Backend/API segura
Decision: Vercel Functions.

Justificacion:
- Integracion natural con despliegue Vercel del stack.
- Separacion clara de frontends y API en proyectos.
- Menor friccion operativa para equipo fullstack.

Endpoints publicos:
- GET /api/public/courses
- POST /api/public/inscriptions

Endpoints admin:
- GET /api/admin/records
- GET /api/admin/records/:id
- PATCH /api/admin/records/:id
- GET /api/admin/export

Controles de seguridad backend:
- CORS estricto por zona (public/admin) en apps/api/lib/cors.js.
- Validacion y sanitizacion con Zod + helpers compartidos.
- Turnstile obligatorio en inscripcion publica.
- Rate limiting via RPC check_rate_limit.
- Auth admin por bearer token Supabase.
- Autorizacion por rol (viewer/editor/manager).
- Auditoria en cambios y exportaciones.

Regla critica cumplida:
- El frontend publico no inserta directamente en DB. Siempre escribe via API controlada.

## 8. Frontend publico
Implementado en apps/public-web:
- Formulario con campos requeridos.
- Validacion cliente con esquema compartido.
- Estados de loading/error/success.
- Prevencion doble submit (boton disable mientras envia).
- Captcha Turnstile.
- Checkbox obligatorio de privacidad.
- Diseno responsive y accesible (labels, aria-live).
- Integracion API segura via VITE_PUBLIC_API_BASE_URL.

## 9. Panel administrativo
Implementado en apps/admin-web:
- Login seguro con Supabase Auth (email/password).
- Tabla de registros con:
	- busqueda por nombre/correo/telefono
	- filtro por estado/curso
	- paginacion
- Detalle individual con historial de notas.
- Cambio de estado + nota interna.
- Exportacion CSV autenticada.
- Separado por dominio (admin.innovacion.com).

## 10. Seguridad y proteccion de datos
### Controles desde dia 1
- Capa API obligatoria para escritura.
- Validacion frontend y backend.
- Sanitizacion de entradas.
- Captcha + rate limit.
- CORS estricto.
- Variables de entorno segregadas.
- RLS y minimo privilegio.

### Antes de staging
- Pruebas de permisos por rol.
- Revisar politicas RLS con test SQL.
- Activar encabezados HTTP de seguridad en Vercel (CSP, HSTS, X-Frame-Options segun necesidad).
- Telemetria y alertas de errores.

### Antes de produccion
- Rotacion de secretos y llaves.
- Hardening de dominios y TLS.
- Backups y runbook de incidentes.
- DPA y textos legales finales de privacidad/consentimiento.
- Pentest basico de API y auth.

## 11. Despliegue e integracion
### Local
1. npm install
2. Copiar .env.example en .env y completar valores
3. Ejecutar:
	 - npm run dev:public
	 - npm run dev:admin
	 - npm run dev:api

### Supabase
1. Crear proyecto Supabase.
2. Aplicar migraciones:
	 - supabase db push o ejecutar SQL de 001_initial.sql.
3. Crear usuarios admin en auth.users y registrar role en admin_profiles.

### Vercel
Desplegar 3 proyectos separados:
- public-web
- admin-web
- api-service

### Entornos
- development: llaves y dominios dev.
- staging: base y proyectos independientes.
- production: secretos aislados, dominios finales.

### Integracion de formulario bajo ejemplo.com/inscripcion
Solicitar al equipo tecnico cliente:
- Reverse proxy de subruta /inscripcion hacia deployment de public-web.
- Preservar host y forwarding headers.
- No crear rutas admin o APIs sensibles bajo ejemplo.com.

### Mantener admin fuera del dominio cliente
- Publicar admin solo en admin.innovacion.com.
- CORS admin solo permite ese origen.

## 12. Testing y QA
Matriz minima:
- Unitarias:
	- sanitizacion y validaciones compartidas.
	- parseo de payloads.
- Integracion API:
	- inscripcion valida/duplicada/captcha invalido/rate limit.
	- auth admin y roles.
- UI formulario:
	- campos requeridos, estados de error, doble envio.
- UI admin:
	- filtros, busqueda, paginacion, detalle, update, CSV.
- Seguridad:
	- CORS denegado por origen.
	- endpoints admin sin token.
	- export solo manager.
- Responsive:
	- mobile/tablet/desktop.

## 13. Implementacion inicial con codigo base
Entregado en este repositorio:
- Estructura monorepo y workspaces.
- SQL inicial + RLS.
- API base segura (public/admin).
- Validaciones y sanitizacion compartidas.
- Formulario publico funcional.
- Panel admin funcional.
- Manejo de variables de entorno con ejemplos.

Archivos clave:
- apps/public-web/src/App.jsx
- apps/admin-web/src/App.jsx
- apps/api/api/public/inscriptions.js
- apps/api/api/admin/records/[id].js
- supabase/migrations/001_initial.sql
- packages/shared/src/validation.js

## 14. Auditoria critica de la solucion (auto-review)
Hallazgos:
1. Medio: Busqueda usa ilike con concatenacion; riesgo menor de consultas costosas en alto volumen.
	 - Mejora recomendada: trigram indexes y endpoint de busqueda dedicado con limites por longitud de query.
2. Medio: Rate limit en DB funciona, pero en trafico alto conviene moverlo a Redis distribuido.
	 - Mejora recomendada: Upstash Redis o Vercel KV con sliding window.
3. Medio: Export CSV limitado a 5000 filas para proteger recursos, pero falta export async por lotes.
	 - Mejora recomendada: job asyncrono + almacenamiento temporal firmado.
4. Bajo: No se incluyo suite automatizada en este commit inicial.
	 - Mejora recomendada: Vitest + Playwright + tests API en CI.

Mejoras aplicadas ya en esta base:
- Auditoria de acciones administrativas.
- Restriccion de exportacion a rol manager.
- Anti-duplicados por fingerprint.
- Validacion y sanitizacion en ambos lados.

---

## Notas de operacion
- Nunca exponer SUPABASE_SERVICE_ROLE_KEY en frontends.
- Nunca habilitar escritura directa anon sobre registrations.
- Mantener admin y API sensible fuera del dominio del cliente.
