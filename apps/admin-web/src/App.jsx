import { useEffect, useMemo, useState } from "react";
import { REGISTRATION_STATUSES } from "@buro-ins/shared/src/constants.js";
import { adminUpdateSchema } from "@buro-ins/shared/src/validation.js";
import { createRecord, deleteRecord, exportCsv, getRecordById, getRecords, updateRecord } from "./lib/api.js";
import { supabase } from "./lib/supabase.js";

const WEEK_DAYS = ["Lunes", "Martes", "Miercoles", "Jueves"];

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
  status: "pending"
};

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

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

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
  }

  async function loadRecords() {
    if (!token) return;
    setLoading(true);
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
    } catch (error) {
      setScreenError(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, filters.page, filters.pageSize, filters.search, filters.status, filters.courseId]);

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
      setIsDetailOpen(true);
    } catch (error) {
      setScreenError(error.message);
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetail() {
    setIsDetailOpen(false);
  }

  async function saveDetail() {
    if (!token || !selected) return;

    if (!permissions.update && !permissions.note) {
      setScreenError("No tienes permisos para editar este registro.");
      return;
    }

    if (!permissions.update && permissions.note && !(selected.newNote || "").trim()) {
      setScreenError("Debes ingresar una nota para guardar.");
      return;
    }

    const parsed = adminUpdateSchema.safeParse({
      status: selected.status,
      internalNote: selected.newNote || ""
    });
    if (!parsed.success) {
      setScreenError("Datos invalidos en estado o nota.");
      return;
    }

    setSaving(true);
    try {
      await updateRecord(token, selected.id, parsed.data);
      setScreenError("");
      await loadRecords();
    } catch (error) {
      setScreenError(error.message);
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
    } catch (error) {
      setScreenError(error.message);
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
      setCreateError("Debes seleccionar al menos un curso.");
      return;
    }

    setCreating(true);
    setCreateError("");
    try {
      await createRecord(token, createForm);
      setIsCreateOpen(false);
      setCreateForm(initialCreateForm);
      await loadRecords();
    } catch (error) {
      setCreateError(error.message);
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
                    <span className={`status-pill ${row.status}`}>{row.status}</span>
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
                  </div>

                  <div className="field-block">
                    <label htmlFor="note">Nueva nota interna</label>
                    <textarea
                      id="note"
                      rows={4}
                      value={selected.newNote || ""}
                      onChange={(event) => setSelected((prev) => ({ ...prev, newNote: event.target.value }))}
                    />
                  </div>
                </div>

                <div className="modal-actions">
                  <button type="button" className="ghost" onClick={closeDetail}>Cancelar</button>
                  {permissions.remove && (
                    <button type="button" className="danger" onClick={onDeleteSelected} disabled={saving}>
                      Eliminar
                    </button>
                  )}
                  <button type="button" onClick={saveDetail} disabled={saving || (!permissions.update && !permissions.note)}>
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
                <label htmlFor="create-phone">Teléfono</label>
                <input
                  id="create-phone"
                  value={createForm.phone}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, phone: event.target.value }))}
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
