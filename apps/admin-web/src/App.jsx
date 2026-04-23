import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { REGISTRATION_STATUSES } from "@buro-ins/shared/src/constants.js";
import { adminUpdateSchema } from "@buro-ins/shared/src/validation.js";
import { createRecord, deleteRecord, exportCsv, getRecordById, getRecords, updateRecord } from "./lib/api.js";
import { supabase } from "./lib/supabase.js";

const WEEK_DAYS = ["Lunes", "Martes", "Miercoles", "Jueves"];
const AUTO_REFRESH_MS = 15000;

const defaultFilters = {
  search: "",
  status: "",
  courseId: "",
  page: "1",
  pageSize: "10"
};

const defaultPermissions = {
  read: false,
  note: false,
  update: false,
  create: false,
  remove: false,
  export: false
};

const initialCreateForm = {
  fullName: "",
  email: "",
  phone: "",
  companyName: "",
  jobPosition: "",
  academicDegree: "",
  interests: "",
  courseIds: [],
  status: "Pendiente"
};


function toStatusClassName(status) {
  const normalized = String(status || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized ? `status-${normalized}` : "status-unknown";
}

function formatCourseLabel(course) {
  const prefix = [course.day_of_week, course.schedule_label].filter(Boolean).join(" ");
  return prefix ? `${prefix} - ${course.title}` : course.title;
}

function getCourseLines(selected) {
  if (Array.isArray(selected.selected_courses) && selected.selected_courses.length > 0) {
    return selected.selected_courses.map(formatCourseLabel);
  }
  if (selected.course_title) {
    return selected.course_title.split(" | ").filter(Boolean);
  }
  return [];
}

function friendlySaveErrorMessage(rawMessage) {
  const message = String(rawMessage || "").trim();
  const normalized = message.toLowerCase();

  if (!message) {
    return "No se pudo guardar el cambio. Intenta de nuevo.";
  }

  if (normalized.includes("validation error") && normalized.includes("enum")) {
    return "Revisa el campo Estado. El valor seleccionado no es válido.";
  }
  if (normalized.includes("validation error") && normalized.includes("status")) {
    return "Revisa el campo Estado antes de guardar.";
  }
  if (
    normalized.includes("validation error") &&
    (normalized.includes("internalnote") || normalized.includes("max") || normalized.includes("at most"))
  ) {
    return "Revisa la Nueva nota interna. Parece demasiado larga.";
  }
  if (normalized.includes("no autenticado") || normalized.includes("token")) {
    return "Tu sesión ya no es válida. Cierra sesión y vuelve a ingresar.";
  }
  if (normalized.includes("no autorizado") || normalized.includes("forbidden")) {
    return "No tienes permiso para cambiar este registro.";
  }
  if (normalized.includes("registro no encontrado")) {
    return "No encontramos ese registro. Recarga la lista e intenta otra vez.";
  }
  if (normalized.includes("failed to fetch") || normalized.includes("no hay conexion")) {
    return "No se pudo conectar con el servidor. Verifica tu conexión e intenta de nuevo.";
  }
  if (normalized.includes("error interno")) {
    return "Ocurrió un problema en el servidor al guardar. Intenta nuevamente en unos minutos.";
  }

  return message;
}

function friendlyCreateErrorMessage(rawMessage) {
  const message = String(rawMessage || "").trim();
  const normalized = message.toLowerCase();

  if (!message) return "No se pudo crear el registro. Intenta de nuevo.";
  if (normalized.includes("ya existe un registro")) return "Ya existe un registro con ese correo y cursos.";
  if (normalized.includes("datos invalid")) return "Revisa los datos ingresados antes de crear el registro.";
  if (normalized.includes("no autorizado") || normalized.includes("forbidden")) return "No tienes permiso para crear registros.";
  if (normalized.includes("failed to fetch") || normalized.includes("no hay conexion")) return "No se pudo conectar con el servidor. Intenta de nuevo.";
  if (normalized.includes("error interno")) return "El servidor tuvo un problema al crear el registro. Intenta nuevamente.";
  return message;
}

function friendlyDeleteErrorMessage(rawMessage) {
  const message = String(rawMessage || "").trim();
  const normalized = message.toLowerCase();

  if (!message) return "No se pudo eliminar el registro. Intenta de nuevo.";
  if (normalized.includes("no autorizado") || normalized.includes("forbidden")) return "No tienes permiso para eliminar registros.";
  if (normalized.includes("failed to fetch") || normalized.includes("no hay conexion")) return "No se pudo conectar con el servidor. Intenta de nuevo.";
  if (normalized.includes("registro no encontrado")) return "No encontramos ese registro para eliminar.";
  if (normalized.includes("error interno")) return "El servidor tuvo un problema al eliminar el registro. Intenta nuevamente.";
  return message;
}


export default function App() {
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");

  const [records, setRecords] = useState([]);
  const [courses, setCourses] = useState([]);
  const [currentRole, setCurrentRole] = useState("viewer");
  const [permissions, setPermissions] = useState(defaultPermissions);
  const [filters, setFilters] = useState(defaultFilters);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(initialCreateForm);
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [screenError, setScreenError] = useState("");
  const [saving, setSaving] = useState(false);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [realtimeMessage, setRealtimeMessage] = useState("");
  const [unreadRealtimeCount, setUnreadRealtimeCount] = useState(0);
  const [isRealtimeToastVisible, setIsRealtimeToastVisible] = useState(false);
  const [actionToast, setActionToast] = useState({ visible: false, type: "success", message: "" });
  const [detailFormErrors, setDetailFormErrors] = useState({ status: "", internalNote: "" });
  const [notificationPermission, setNotificationPermission] = useState(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported"
  );

  const audioContextRef = useRef(null);
  const hasAlertBaselineRef = useRef(false);
  const previousTotalRef = useRef(0);
  const previousIdsRef = useRef(new Set());

  const playNotificationSound = useCallback((force = false) => {
    if (!force && !soundEnabled) return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;

      if (!audioContextRef.current || audioContextRef.current.state === "closed") {
        audioContextRef.current = new AudioContextClass();
      }

      const ctx = audioContextRef.current;
      if (ctx.state === "suspended") {
        ctx.resume();
      }

      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(880, ctx.currentTime);
      gainNode.gain.setValueAtTime(0.0001, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.21);
    } catch {
      // Ignore sound errors caused by browser autoplay policies.
    }
  }, [soundEnabled]);

  const triggerRealtimeAlert = useCallback((count = 1) => {
    const message = count === 1 ? "Nueva inscripcion recibida." : `${count} nuevas inscripciones recibidas.`;
    setRealtimeMessage(message);
    setIsRealtimeToastVisible(true);
    setUnreadRealtimeCount((prev) => prev + count);
    playNotificationSound();

    if (notificationPermission === "granted") {
      try {
        new Notification("Panel de inscripciones", { body: message });
      } catch {
        // Ignore browser notification errors.
      }
    }
  }, [notificationPermission, playNotificationSound]);

  async function requestNotificationPermission() {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
  }

  function syncAlertBaseline(items = [], total = 0) {
    previousIdsRef.current = new Set((items || []).map((item) => item.id));
    previousTotalRef.current = Number(total || 0);
    hasAlertBaselineRef.current = true;
  }

  function detectNewRowsAndAlert(items = [], total = 0) {
    const safeItems = items || [];
    const safeTotal = Number(total || 0);

    if (!hasAlertBaselineRef.current) {
      syncAlertBaseline(safeItems, safeTotal);
      return;
    }

    const currentIds = new Set(safeItems.map((item) => item.id));
    const newVisibleRows = safeItems.filter((item) => !previousIdsRef.current.has(item.id)).length;
    const totalDelta = Math.max(0, safeTotal - previousTotalRef.current);
    const shouldAlert = Math.max(newVisibleRows, totalDelta);

    previousIdsRef.current = currentIds;
    previousTotalRef.current = safeTotal;

    if (shouldAlert > 0) {
      triggerRealtimeAlert(shouldAlert);
    }
  }

  function toggleSound(nextValue) {
    setSoundEnabled(nextValue);
    if (nextValue) {
      playNotificationSound(true);
    }
  }

  function showActionToast(type, message) {
    setActionToast({
      visible: true,
      type: type === "error" ? "error" : "success",
      message: String(message || "")
    });
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!isRealtimeToastVisible) return undefined;
    const timeoutId = window.setTimeout(() => {
      setIsRealtimeToastVisible(false);
    }, 7000);
    return () => window.clearTimeout(timeoutId);
  }, [isRealtimeToastVisible, realtimeMessage]);

  useEffect(() => {
    if (!actionToast.visible) return undefined;
    const timeoutId = window.setTimeout(() => {
      setActionToast((prev) => ({ ...prev, visible: false }));
    }, 4500);
    return () => window.clearTimeout(timeoutId);
  }, [actionToast.visible, actionToast.message]);

  const token = session?.access_token;

  async function signIn(event) {
    event.preventDefault();
    setAuthError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setAuthError("Credenciales invalidas o usuario sin acceso.");
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSelected(null);
    setIsDetailOpen(false);
    setRealtimeMessage("");
    setIsRealtimeToastVisible(false);
    setUnreadRealtimeCount(0);
    hasAlertBaselineRef.current = false;
    previousTotalRef.current = 0;
    previousIdsRef.current = new Set();
  }

  const loadRecords = useCallback(async ({ silent = false, mode = "standard" } = {}) => {
    if (!token) return;
    if (!silent) setLoading(true);
    setScreenError("");
    try {
      const data = await getRecords(token, filters);
      setRecords(data.items || []);
      setTotal(data.total || 0);
      setCourses(data.courses || []);
      setCurrentRole(data.currentRole || "viewer");
      setPermissions(data.permissions || defaultPermissions);

      if (selected?.id) {
        const detail = await getRecordById(token, selected.id);
        setSelected(detail.item);
      }

      if (mode === "poll") {
        detectNewRowsAndAlert(data.items || [], data.total || 0);
      } else {
        syncAlertBaseline(data.items || [], data.total || 0);
      }

      return data;
    } catch (error) {
      setScreenError(error.message);
    } finally {
      if (!silent) setLoading(false);
    }
    return null;
  }, [filters, selected?.id, token, triggerRealtimeAlert]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  useEffect(() => {
    if (!token || !autoRefreshEnabled) return undefined;
    const intervalId = window.setInterval(() => {
      loadRecords({ silent: true, mode: "poll" });
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(intervalId);
  }, [autoRefreshEnabled, loadRecords, token]);

  useEffect(() => {
    if (!token || !autoRefreshEnabled) return undefined;

    const channel = supabase
      .channel("admin-registrations-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "registrations" },
        () => {
          triggerRealtimeAlert(1);
          loadRecords({ silent: true, mode: "standard" });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [autoRefreshEnabled, loadRecords, token, triggerRealtimeAlert]);

  const coursesByDay = useMemo(() => {
    const grouped = new Map(WEEK_DAYS.map((day) => [day, []]));
    for (const course of courses) {
      if (!grouped.has(course.day_of_week)) continue;
      grouped.get(course.day_of_week).push(course);
    }
    return WEEK_DAYS.map((day) => ({ day, courses: grouped.get(day) || [] }));
  }, [courses]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / Number(filters.pageSize))), [total, filters.pageSize]);

  useEffect(() => {
    if (!isDetailOpen) return;
    const onEsc = (event) => {
      if (event.key === "Escape") setIsDetailOpen(false);
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [isDetailOpen]);

  async function openDetail(id) {
    if (!token) return;
    setDetailLoading(true);
    try {
      const data = await getRecordById(token, id);
      setSelected(data.item);
      setDetailFormErrors({ status: "", internalNote: "" });
      setIsDetailOpen(true);
    } catch (error) {
      setScreenError(error.message);
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetail() {
    setIsDetailOpen(false);
    setDetailFormErrors({ status: "", internalNote: "" });
  }

  async function saveDetail() {
    if (!token || !selected) return;

    if (!permissions.update) {
      const message = "Solo el rol manager puede modificar este registro.";
      setScreenError(message);
      showActionToast("error", message);
      return;
    }

    setDetailFormErrors({ status: "", internalNote: "" });
    setScreenError("");

    const parsed = adminUpdateSchema.safeParse({
      status: selected.status,
      internalNote: selected.newNote || ""
    });
    if (!parsed.success) {
      let statusError = "";
      let internalNoteError = "";
      for (const issue of parsed.error.issues || []) {
        const path = issue.path?.[0];
        if (path === "status") {
          statusError = "Revisa el campo Estado. El valor seleccionado no es válido.";
        }
        if (path === "internalNote") {
          internalNoteError = "Revisa la Nueva nota interna. Parece demasiado larga.";
        }
      }
      const message = statusError || internalNoteError || "Revisa los campos antes de guardar.";
      setDetailFormErrors({ status: statusError, internalNote: internalNoteError });
      setScreenError(message);
      showActionToast("error", message);
      return;
    }

    setSaving(true);
    try {
      await updateRecord(token, selected.id, parsed.data);
      setScreenError("");
      setDetailFormErrors({ status: "", internalNote: "" });
      showActionToast("success", "Cambio guardado con éxito.");
      await loadRecords();
    } catch (error) {
      const message = friendlySaveErrorMessage(error?.message || "");
      setScreenError(message);
      showActionToast("error", message);
    } finally {
      setSaving(false);
    }
  }

  async function onDeleteSelected() {
    if (!token || !selected || !permissions.remove) return;

    const confirmed = window.confirm("Esta accion eliminara el registro seleccionado. Deseas continuar?");
    if (!confirmed) return;

    setSaving(true);
    try {
      await deleteRecord(token, selected.id);
      setIsDetailOpen(false);
      setSelected(null);
      await loadRecords();
      setScreenError("");
      showActionToast("success", "Registro eliminado con exito.");
    } catch (error) {
      const message = friendlyDeleteErrorMessage(error?.message || "");
      setScreenError(message);
      showActionToast("error", message);
    } finally {
      setSaving(false);
    }
  }

  function openCreateModal() {
    setCreateError("");
    setCreateForm(initialCreateForm);
    setIsCreateOpen(true);
  }

  function closeCreateModal() {
    setIsCreateOpen(false);
  }

  async function onCreateRecord(event) {
    event.preventDefault();
    if (!token || !permissions.create) return;

    if (!createForm.courseIds.length) {
      const message = "Debes seleccionar al menos un curso.";
      setCreateError(message);
      showActionToast("error", message);
      return;
    }

    setCreating(true);
    setCreateError("");
    try {
      await createRecord(token, createForm);
      setIsCreateOpen(false);
      setCreateForm(initialCreateForm);
      await loadRecords();
      setScreenError("");
      showActionToast("success", "Registro creado con exito.");
    } catch (error) {
      const message = friendlyCreateErrorMessage(error?.message || "");
      setCreateError(message);
      showActionToast("error", message);
    } finally {
      setCreating(false);
    }
  }

  function toggleCreateCourse(courseId) {
    setCreateForm((prev) => {
      const selected = new Set(prev.courseIds);
      if (selected.has(courseId)) {
        selected.delete(courseId);
      } else {
        selected.add(courseId);
      }
      return {
        ...prev,
        courseIds: [...selected]
      };
    });
    setCreateError("");
  }

  async function downloadCsv() {
    if (!token) return;
    if (!permissions.export) {
      setScreenError("No tienes permisos para exportar registros.");
      return;
    }
    try {
      const blob = await exportCsv(token, filters);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `registros-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setScreenError(error.message);
    }
  }

  if (!session) {
    return (
      <main className="auth-wrap">
        <form className="auth-card" onSubmit={signIn}>
          <p className="brand-kicker">Acceso restringido</p>
          <h1>Panel de inscripciones</h1>
          <p>Acceso exclusivo para administradores autorizados.</p>
          <label htmlFor="email">Correo</label>
          <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          <label htmlFor="password">Contraseña</label>
          <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          <button type="submit">Ingresar</button>
          {authError && <p className="error">{authError}</p>}
        </form>
      </main>
    );
  }

  return (
    <main className="panel shell">
      <header className="toolbar card">
        <div>
          <p className="brand-kicker">Backoffice</p>
          <h1>Registros de inscripción</h1>
          <p className="role-caption">Rol activo: {currentRole}</p>
        </div>
        <div className="toolbar-actions">
          {permissions.create && <button type="button" onClick={openCreateModal}>Agregar registro</button>}
          {permissions.export && <button type="button" onClick={downloadCsv}>Exportar CSV</button>}
          <button type="button" className="ghost" onClick={signOut}>Cerrar sesión</button>
        </div>
        <div className="live-controls">
          <label>
            <input
              type="checkbox"
              checked={autoRefreshEnabled}
              onChange={(event) => setAutoRefreshEnabled(event.target.checked)}
            />
            Auto refresh
          </label>
          <label>
            <input
              type="checkbox"
              checked={soundEnabled}
              onChange={(event) => toggleSound(event.target.checked)}
            />
            Sonido
          </label>
          {notificationPermission !== "unsupported" && notificationPermission !== "granted" && (
            <button type="button" className="ghost" onClick={requestNotificationPermission}>Habilitar notificaciones</button>
          )}
          {unreadRealtimeCount > 0 && (
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setUnreadRealtimeCount(0);
                setRealtimeMessage("");
              }}
            >
              {unreadRealtimeCount} nuevas
            </button>
          )}
        </div>
      </header>

      <section className="filters card">
        <input
          placeholder="Buscar por nombre, correo, teléfono, empresa, puesto o grado"
          value={filters.search}
          onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value, page: "1" }))}
        />
        <select value={filters.status} onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value, page: "1" }))}>
          <option value="">Todos los estados</option>
          {REGISTRATION_STATUSES.map((status) => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>
        <select value={filters.courseId} onChange={(event) => setFilters((prev) => ({ ...prev, courseId: event.target.value, page: "1" }))}>
          <option value="">Todos los cursos</option>
          {courses.map((course) => (
            <option key={course.id} value={course.id}>{course.title}</option>
          ))}
        </select>
      </section>

      {realtimeMessage && isRealtimeToastVisible && (
        <aside className="floating-toast" role="status" aria-live="polite">
          <p>{realtimeMessage}</p>
          <button
            type="button"
            className="ghost"
            onClick={() => setIsRealtimeToastVisible(false)}
          >
            Cerrar
          </button>
        </aside>
      )}
      {actionToast.visible && (
        <aside className={`floating-toast action-toast toast-${actionToast.type}`} role="status" aria-live="polite">
          <p>{actionToast.message}</p>
          <button
            type="button"
            className="ghost"
            onClick={() => setActionToast((prev) => ({ ...prev, visible: false }))}
          >
            Cerrar
          </button>
        </aside>
      )}
      {screenError && <p className="error">{screenError}</p>}

      <section className="content-grid">
        <article className="card table-card">
          <div className="table-wrap">
            <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Nombre</th>
                <th>Correo</th>
                <th>Teléfono</th>
                <th>Empresa</th>
                <th>Puesto</th>
                <th>Ultimo grado</th>
                <th>Cursos</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 && (
                <tr>
                  <td colSpan={10}>No hay registros para mostrar.</td>
                </tr>
              )}
              {records.map((row) => (
                <tr key={row.id} className={selected?.id === row.id ? "selected" : ""}>
                  <td>{new Date(row.created_at).toLocaleDateString()}</td>
                  <td>{row.full_name}</td>
                  <td>{row.email}</td>
                  <td>{row.phone}</td>
                  <td>{row.company_name}</td>
                  <td>{row.job_position}</td>
                  <td>{row.academic_degree}</td>
                  <td className="courses-summary-cell" title={row.course_title || ""}>
                    {(row.course_ids || []).length > 1
                      ? `${row.course_ids.length} cursos seleccionados`
                      : (row.course_title || "Sin cursos")}
                  </td>
                  <td>
                    <span className={`status-pill ${toStatusClassName(row.status)}`}>{row.status}</span>
                  </td>
                  <td>
                    <button type="button" className="table-action" onClick={() => openDetail(row.id)}>
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
          {loading && <p>Cargando...</p>}
          <div className="pagination">
            <button
              type="button"
              disabled={Number(filters.page) <= 1}
              onClick={() => setFilters((prev) => ({ ...prev, page: String(Number(prev.page) - 1) }))}
            >
              Anterior
            </button>
            <span>Pagina {filters.page} de {totalPages}</span>
            <button
              type="button"
              disabled={Number(filters.page) >= totalPages}
              onClick={() => setFilters((prev) => ({ ...prev, page: String(Number(prev.page) + 1) }))}
            >
              Siguiente
            </button>
          </div>
        </article>
      </section>

      {isDetailOpen && (
        <div className="modal-backdrop" onClick={closeDetail}>
          <section className="modal-card card" role="dialog" aria-modal="true" aria-labelledby="record-title" onClick={(event) => event.stopPropagation()}>
            {detailLoading && <p>Cargando detalle...</p>}
            {!detailLoading && selected && (
              <>
                <header className="modal-header">
                  <h2 id="record-title">{selected.full_name}</h2>
                  <button type="button" className="ghost" onClick={closeDetail}>Cerrar</button>
                </header>

                <div className="record-grid">
                  <p><span>Correo</span>{selected.email}</p>
                  <p><span>Teléfono</span>{selected.phone}</p>
                  <p><span>Empresa</span>{selected.company_name}</p>
                  <p><span>Puesto desempeñado</span>{selected.job_position}</p>
                  <p><span>Último grado académico</span>{selected.academic_degree}</p>
                  <div className="record-courses">
                    <span>Cursos seleccionados</span>
                    <ul>
                      {getCourseLines(selected).map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                  <p><span>Intereses</span>{selected.interests}</p>
                </div>

                <div className="edit-grid">
                  <div className="field-block">
                    <label htmlFor="status">Estado</label>
                    <select
                      id="status"
                      value={selected.status}
                      disabled={!permissions.update}
                      onChange={(event) => setSelected((prev) => ({ ...prev, status: event.target.value }))}
                    >
                      {REGISTRATION_STATUSES.map((status) => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                    {detailFormErrors.status && <p className="field-error">{detailFormErrors.status}</p>}
                  </div>

                  <div className="field-block">
                    <label htmlFor="note">Nueva nota interna</label>
                    <textarea
                      id="note"
                      rows={4}
                      value={selected.newNote || ""}
                      disabled={!permissions.update}
                      onChange={(event) => setSelected((prev) => ({ ...prev, newNote: event.target.value }))}
                    />
                    {detailFormErrors.internalNote && <p className="field-error">{detailFormErrors.internalNote}</p>}
                  </div>
                </div>

                <div className="modal-actions">
                  <button type="button" className="ghost" onClick={closeDetail}>Cancelar</button>
                  {permissions.remove && (
                    <button type="button" className="danger" onClick={onDeleteSelected} disabled={saving}>
                      Eliminar
                    </button>
                  )}
                  <button type="button" onClick={saveDetail} disabled={saving || !permissions.update}>
                    {saving ? "Guardando..." : "Guardar cambios"}
                  </button>
                </div>

                <h3>Historial de notas</h3>
                <ul className="notes-list">
                  {(selected.notes || []).length === 0 && <li>Sin notas todavia.</li>}
                  {(selected.notes || []).map((note) => (
                    <li key={note.id}>
                      <span className="note-meta">{note.created_by_name || note.created_by_email || "Administrador"} - {new Date(note.created_at).toLocaleString()}</span>
                      <p>{note.note}</p>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>
      )}

      {isCreateOpen && (
        <div className="modal-backdrop" onClick={closeCreateModal}>
          <section className="modal-card card" role="dialog" aria-modal="true" aria-labelledby="create-title" onClick={(event) => event.stopPropagation()}>
            <header className="modal-header">
              <h2 id="create-title">Agregar registro manual</h2>
              <button type="button" className="ghost" onClick={closeCreateModal}>Cerrar</button>
            </header>

            <form className="edit-grid" onSubmit={onCreateRecord}>
              <div className="field-block">
                <label htmlFor="create-fullName">Nombre completo</label>
                <input
                  id="create-fullName"
                  value={createForm.fullName}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, fullName: event.target.value }))}
                  required
                />
              </div>

              <div className="field-block">
                <label htmlFor="create-email">Correo</label>
                <input
                  id="create-email"
                  type="email"
                  value={createForm.email}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, email: event.target.value }))}
                  required
                />
              </div>

              <div className="field-block">
                <label htmlFor="create-phone">Telefono (con codigo de pais)</label>
                <input
                  id="create-phone"
                  value={createForm.phone}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, phone: event.target.value }))}
                  inputMode="tel"
                  placeholder="+50212345678"
                  required
                />
              </div>

              <div className="field-block">
                <label htmlFor="create-company">Empresa donde labora</label>
                <input
                  id="create-company"
                  value={createForm.companyName}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, companyName: event.target.value }))}
                  required
                />
              </div>

              <div className="field-block">
                <label htmlFor="create-jobPosition">Puesto desempeñado</label>
                <input
                  id="create-jobPosition"
                  value={createForm.jobPosition}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, jobPosition: event.target.value }))}
                  required
                />
              </div>

              <div className="field-block">
                <label htmlFor="create-academicDegree">Último grado académico cursado</label>
                <input
                  id="create-academicDegree"
                  value={createForm.academicDegree}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, academicDegree: event.target.value }))}
                  required
                />
              </div>

              <div className="field-block">
                <label>Cursos (seleccion multiple)</label>
                <section className="courses-grid compact" aria-label="Cursos del registro manual">
                  {coursesByDay.map((dayBlock) => (
                    <article key={dayBlock.day} className="day-card">
                      <h3>{dayBlock.day}</h3>
                      <div className="day-courses">
                        {dayBlock.courses.map((course) => {
                          const checked = createForm.courseIds.includes(course.id);
                          return (
                            <label key={course.id} className={`course-option ${checked ? "selected" : ""}`}>
                              <input type="checkbox" checked={checked} onChange={() => toggleCreateCourse(course.id)} />
                              <span className="course-title">{course.title}</span>
                              <span className="course-time">{course.schedule_label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </article>
                  ))}
                </section>
              </div>

              <div className="field-block">
                <label htmlFor="create-status">Estado inicial</label>
                <select
                  id="create-status"
                  value={createForm.status}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, status: event.target.value }))}
                >
                  {REGISTRATION_STATUSES.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>

              <div className="field-block">
                <label htmlFor="create-interests">Intereses</label>
                <textarea
                  id="create-interests"
                  rows={4}
                  value={createForm.interests}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, interests: event.target.value }))}
                  required
                />
              </div>

              {createError && <p className="error">{createError}</p>}

              <div className="modal-actions">
                <button type="button" className="ghost" onClick={closeCreateModal}>Cancelar</button>
                <button type="submit" disabled={creating}>{creating ? "Creando..." : "Crear registro"}</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}

