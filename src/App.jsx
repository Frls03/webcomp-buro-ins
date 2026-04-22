import { useEffect, useMemo, useState } from 'react'
import './App.css'

const storageKey = 'inscripciones-demo-v1'

const courses = [
  { id: 'web-intro', title: 'Introduccion al desarrollo web', active: true },
  { id: 'marketing', title: 'Marketing digital para emprendedores', active: true },
  { id: 'excel', title: 'Excel y analitica aplicada', active: true },
]

function makeId() {
  return `REG-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
}

function toDateTime(value) {
  return new Date(value).toLocaleString('es-ES', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function toCsv(rows) {
  const header = ['id', 'fecha', 'nombre', 'correo', 'telefono', 'curso', 'estado']
  const lines = rows.map((item) => [
    item.id,
    item.createdAt,
    item.fullName,
    item.email,
    item.phone,
    item.courseTitle,
    item.status,
  ])
  return [header, ...lines]
    .map((line) => line.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n')
}

function App() {
  const isAdminPath = window.location.pathname.startsWith('/admin')
  const [records, setRecords] = useState([])

  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    interests: '',
    courseId: '',
    privacyAccepted: false,
  })
  const [formErrors, setFormErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState('')

  const [isAdminAuth, setIsAdminAuth] = useState(false)
  const [adminCredentials, setAdminCredentials] = useState({ email: '', password: '' })
  const [authError, setAuthError] = useState('')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [courseFilter, setCourseFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState('')
  const [noteDraft, setNoteDraft] = useState('')

  useEffect(() => {
    const saved = localStorage.getItem(storageKey)
    if (!saved) return
    try {
      setRecords(JSON.parse(saved))
    } catch {
      setRecords([])
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(records))
  }, [records])

  function validatePublicForm() {
    const nextErrors = {}
    if (!form.fullName.trim() || form.fullName.trim().length < 3) nextErrors.fullName = 'Ingresa un nombre valido.'
    if (!/.+@.+\..+/.test(form.email)) nextErrors.email = 'Ingresa un correo valido.'
    if (!/^[\d+\s()-]{8,}$/.test(form.phone)) nextErrors.phone = 'Ingresa un telefono valido.'
    if (!form.interests.trim() || form.interests.trim().length < 6) nextErrors.interests = 'Describe tus intereses.'
    if (!form.courseId) nextErrors.courseId = 'Selecciona un curso.'
    if (!form.privacyAccepted) nextErrors.privacyAccepted = 'Debes aceptar la politica de privacidad.'
    return nextErrors
  }

  function handleSubmit(event) {
    event.preventDefault()
    setSuccess('')

    const errors = validatePublicForm()
    setFormErrors(errors)
    if (Object.keys(errors).length > 0) return

    setSubmitting(true)
    setTimeout(() => {
      const pickedCourse = courses.find((item) => item.id === form.courseId)
      const newRecord = {
        id: makeId(),
        createdAt: new Date().toISOString(),
        fullName: form.fullName.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim(),
        interests: form.interests.trim(),
        courseId: form.courseId,
        courseTitle: pickedCourse?.title || 'Curso sin nombre',
        privacyAccepted: true,
        status: 'pending',
        notes: [],
      }
      setRecords((prev) => [newRecord, ...prev])
      setForm({
        fullName: '',
        email: '',
        phone: '',
        interests: '',
        courseId: '',
        privacyAccepted: false,
      })
      setSubmitting(false)
      setSuccess('Inscripcion enviada. Te contactaremos por correo pronto.')
    }, 750)
  }

  function handleAdminLogin(event) {
    event.preventDefault()
    const ok =
      adminCredentials.email.toLowerCase().trim() === 'admin@demo.com' &&
      adminCredentials.password === 'Admin123!'
    if (!ok) {
      setAuthError('Credenciales invalidas. Usa admin@demo.com / Admin123!')
      return
    }
    setAuthError('')
    setIsAdminAuth(true)
  }

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase()
    return records.filter((item) => {
      const searchMatch =
        !query ||
        item.fullName.toLowerCase().includes(query) ||
        item.email.toLowerCase().includes(query) ||
        item.phone.toLowerCase().includes(query)
      const statusMatch = statusFilter === 'all' || item.status === statusFilter
      const courseMatch = courseFilter === 'all' || item.courseId === courseFilter
      return searchMatch && statusMatch && courseMatch
    })
  }, [records, search, statusFilter, courseFilter])

  const pageSize = 6
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize))
  const safePage = Math.min(page, totalPages)

  useEffect(() => {
    setPage(1)
  }, [search, statusFilter, courseFilter])

  const pagedRecords = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return filteredRecords.slice(start, start + pageSize)
  }, [filteredRecords, safePage])

  const selectedRecord = useMemo(
    () => records.find((item) => item.id === selectedId) || null,
    [records, selectedId],
  )

  function updateStatus(nextStatus) {
    if (!selectedRecord) return
    setRecords((prev) => prev.map((item) => (item.id === selectedRecord.id ? { ...item, status: nextStatus } : item)))
  }

  function addInternalNote() {
    if (!selectedRecord || !noteDraft.trim()) return
    const note = {
      id: `N-${Date.now()}`,
      text: noteDraft.trim(),
      createdAt: new Date().toISOString(),
    }
    setRecords((prev) =>
      prev.map((item) =>
        item.id === selectedRecord.id
          ? {
              ...item,
              notes: [note, ...item.notes],
            }
          : item,
      ),
    )
    setNoteDraft('')
  }

  function exportCurrentCsv() {
    const csv = toCsv(filteredRecords)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const href = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = href
    link.download = `inscripciones-demo-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(href)
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <p className="brand-kicker">Sistema de Inscripcion</p>
          <h1>{isAdminPath ? 'Panel administrativo' : 'Cursos gratuitos'}</h1>
        </div>
      </header>

      {!isAdminPath && (
        <section className="grid one-column public-layout">
          <article className="card public-form-card">
            <p className="chip">Inscripcion abierta</p>
            <h2>Inscribete a un curso gratuito</h2>
            <p className="intro-copy">
              Completa el formulario y nos pondremos en contacto contigo por correo para confirmar tu cupo.
            </p>
            <h3>Formulario de inscripcion</h3>
            <form onSubmit={handleSubmit} noValidate>
              <label htmlFor="fullName">Nombre completo</label>
              <input
                id="fullName"
                value={form.fullName}
                onChange={(event) => setForm((prev) => ({ ...prev, fullName: event.target.value }))}
                placeholder="Ej: Maria Fernanda Ruiz"
              />
              {formErrors.fullName && <p className="error">{formErrors.fullName}</p>}

              <label htmlFor="email">Correo electronico</label>
              <input
                id="email"
                type="email"
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="Ej: maria@correo.com"
              />
              {formErrors.email && <p className="error">{formErrors.email}</p>}

              <label htmlFor="phone">Numero de telefono</label>
              <input
                id="phone"
                value={form.phone}
                onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                placeholder="Ej: +57 300 123 4567"
              />
              {formErrors.phone && <p className="error">{formErrors.phone}</p>}

              <label htmlFor="interests">Preferencias o temas de interes</label>
              <textarea
                id="interests"
                rows={3}
                value={form.interests}
                onChange={(event) => setForm((prev) => ({ ...prev, interests: event.target.value }))}
                placeholder="Ej: Quiero reforzar frontend y analitica"
              />
              {formErrors.interests && <p className="error">{formErrors.interests}</p>}

              <label htmlFor="courseId">Curso gratuito</label>
              <select
                id="courseId"
                value={form.courseId}
                onChange={(event) => setForm((prev) => ({ ...prev, courseId: event.target.value }))}
              >
                <option value="">Selecciona un curso</option>
                {courses
                  .filter((item) => item.active)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
              </select>
              {formErrors.courseId && <p className="error">{formErrors.courseId}</p>}

              <div className="inline-check">
                <input
                  id="privacy"
                  type="checkbox"
                  checked={form.privacyAccepted}
                  onChange={(event) => setForm((prev) => ({ ...prev, privacyAccepted: event.target.checked }))}
                />
                <label htmlFor="privacy">Acepto la politica de privacidad y tratamiento de datos.</label>
              </div>
              {formErrors.privacyAccepted && <p className="error">{formErrors.privacyAccepted}</p>}

              <button type="submit" disabled={submitting}>
                {submitting ? 'Enviando...' : 'Enviar inscripcion'}
              </button>
            </form>
            {success && <p className="success">{success}</p>}
          </article>
        </section>
      )}

      {isAdminPath && !isAdminAuth && (
        <section className="grid one-column auth-area">
          <article className="card auth-card">
            <h2>Acceso administrativo</h2>
            <p>Modo demo local para validar UX antes de conectar API y Supabase.</p>
            <form onSubmit={handleAdminLogin}>
              <label htmlFor="adminMail">Correo</label>
              <input
                id="adminMail"
                type="email"
                value={adminCredentials.email}
                onChange={(event) =>
                  setAdminCredentials((prev) => ({
                    ...prev,
                    email: event.target.value,
                  }))
                }
              />

              <label htmlFor="adminPass">Contrasena</label>
              <input
                id="adminPass"
                type="password"
                value={adminCredentials.password}
                onChange={(event) =>
                  setAdminCredentials((prev) => ({
                    ...prev,
                    password: event.target.value,
                  }))
                }
              />

              <button type="submit">Entrar al panel</button>
              {authError && <p className="error">{authError}</p>}
            </form>
            <p className="tiny">Credenciales demo: admin@demo.com / Admin123!</p>
          </article>
        </section>
      )}

      {isAdminPath && isAdminAuth && (
        <section className="grid admin-layout">
          <article className="card table-card">
            <div className="panel-head">
              <h2>Registros</h2>
              <div className="panel-actions">
                <button type="button" onClick={exportCurrentCsv}>
                  Exportar CSV
                </button>
                <button type="button" className="ghost" onClick={() => setIsAdminAuth(false)}>
                  Cerrar sesion
                </button>
              </div>
            </div>

            <div className="filters">
              <input
                placeholder="Buscar por nombre, correo o telefono"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">Todos los estados</option>
                <option value="pending">pending</option>
                <option value="reviewed">reviewed</option>
                <option value="accepted">accepted</option>
                <option value="rejected">rejected</option>
                <option value="waitlist">waitlist</option>
              </select>
              <select value={courseFilter} onChange={(event) => setCourseFilter(event.target.value)}>
                <option value="all">Todos los cursos</option>
                {courses.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Nombre</th>
                    <th>Correo</th>
                    <th>Curso</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRecords.length === 0 && (
                    <tr>
                      <td colSpan={5}>No hay resultados con los filtros actuales.</td>
                    </tr>
                  )}
                  {pagedRecords.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => setSelectedId(item.id)}
                      className={selectedId === item.id ? 'selected' : ''}
                    >
                      <td>{toDateTime(item.createdAt)}</td>
                      <td>{item.fullName}</td>
                      <td>{item.email}</td>
                      <td>{item.courseTitle}</td>
                      <td>
                        <span className={`status-pill ${item.status}`}>{item.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pager">
              <button type="button" onClick={() => setPage((prev) => Math.max(1, prev - 1))}>
                Anterior
              </button>
              <p>
                Pagina {safePage} de {totalPages}
              </p>
              <button type="button" onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}>
                Siguiente
              </button>
            </div>
          </article>

          <aside className="card detail-card">
            {!selectedRecord && <p>Selecciona un registro para ver detalle y acciones.</p>}
            {selectedRecord && (
              <>
                <h3>{selectedRecord.fullName}</h3>
                <p>
                  <strong>Correo:</strong> {selectedRecord.email}
                </p>
                <p>
                  <strong>Telefono:</strong> {selectedRecord.phone}
                </p>
                <p>
                  <strong>Curso:</strong> {selectedRecord.courseTitle}
                </p>
                <p>
                  <strong>Intereses:</strong> {selectedRecord.interests}
                </p>

                <label htmlFor="status">Estado</label>
                <select id="status" value={selectedRecord.status} onChange={(event) => updateStatus(event.target.value)}>
                  <option value="pending">pending</option>
                  <option value="reviewed">reviewed</option>
                  <option value="accepted">accepted</option>
                  <option value="rejected">rejected</option>
                  <option value="waitlist">waitlist</option>
                </select>

                <label htmlFor="note">Nota interna</label>
                <textarea
                  id="note"
                  rows={3}
                  value={noteDraft}
                  onChange={(event) => setNoteDraft(event.target.value)}
                />
                <button type="button" onClick={addInternalNote}>
                  Guardar nota
                </button>

                <h4>Historial</h4>
                <ul className="notes-list">
                  {(selectedRecord.notes || []).length === 0 && <li>Sin notas todavia.</li>}
                  {(selectedRecord.notes || []).map((note) => (
                    <li key={note.id}>
                      <span>{toDateTime(note.createdAt)}</span>
                      <p>{note.text}</p>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </aside>
        </section>
      )}
    </div>
  )
}

export default App
