import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { registrationSchema } from "@buro-ins/shared/src/validation.js";
import { fetchCourses, submitRegistration } from "./lib/api.js";
import TurnstileWidget from "./components/TurnstileWidget.jsx";

const WEEK_DAYS = ["Lunes", "Martes", "Miércoles", "Jueves"];
const DAY_DATE_LABELS = {
  Lunes: "25 de mayo",
  Martes: "26 de mayo",
  Miércoles: "27 de mayo",
  Jueves: "28 de mayo"
};

function formatDayHeading(day) {
  const dateLabel = DAY_DATE_LABELS[day];
  return dateLabel ? `${day} - ${dateLabel}` : day;
}

function normalizeDay(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

const initialForm = {
  fullName: "",
  email: "",
  phone: "",
  companyName: "",
  jobPosition: "",
  academicDegree: "",
  interests: "",
  courseIds: [],
  privacyAccepted: false,
  turnstileToken: ""
};

function postEmbedHeight() {
  if (typeof window === "undefined") return;
  if (window.parent === window) return;

  const bodyHeight = document.body ? document.body.scrollHeight : 0;
  const docHeight = document.documentElement ? document.documentElement.scrollHeight : 0;
  const height = Math.max(bodyHeight, docHeight);

  window.parent.postMessage(
    {
      source: "buro-ins-public-web",
      type: "iframe:resize",
      height
    },
    "*"
  );
}

export default function App() {
  const shellRef = useRef(null);
  const lastReportedHeightRef = useRef(0);
  const [form, setForm] = useState(initialForm);
  const [courses, setCourses] = useState([]);
  const [errors, setErrors] = useState({});
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [captchaResetSignal, setCaptchaResetSignal] = useState(0);

  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
  const bannerSrc = `${import.meta.env.BASE_URL}business-week-banner.png`;
  const isDevelopment = import.meta.env.DEV;
  const isLocalHost =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
  const shouldUseTurnstile = !isLocalHost;
  const isTurnstileConfigured = Boolean(turnstileSiteKey && turnstileSiteKey !== "replace-me");
  const isTurnstileBypassed = isLocalHost || (isDevelopment && !isTurnstileConfigured);
  const hasCaptchaToken = isTurnstileBypassed || form.turnstileToken.length >= 10;
  const hasCourseSelection = form.courseIds.length > 0;

  useEffect(() => {
    async function loadCourses() {
      try {
        const data = await fetchCourses();
        setCourses(data.courses || []);
      } catch (error) {
        setErrors((prev) => ({ ...prev, global: error.message }));
      } finally {
        setLoadingCourses(false);
      }
    }

    loadCourses();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const schedule = () => {
      window.requestAnimationFrame(() => {
        const bodyHeight = document.body ? document.body.scrollHeight : 0;
        const docHeight = document.documentElement ? document.documentElement.scrollHeight : 0;
        const height = Math.max(bodyHeight, docHeight);

        if (height > 0 && height !== lastReportedHeightRef.current) {
          lastReportedHeightRef.current = height;
          postEmbedHeight();
        }
      });
    };

    schedule();

    let resizeObserver;
    if (typeof ResizeObserver !== "undefined" && shellRef.current) {
      resizeObserver = new ResizeObserver(schedule);
      resizeObserver.observe(shellRef.current);
    }

    window.addEventListener("resize", schedule);

    return () => {
      window.removeEventListener("resize", schedule);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!successMessage) return undefined;
    const timer = setTimeout(() => {
      setSuccessMessage("");
    }, 2600);
    return () => clearTimeout(timer);
  }, [successMessage]);

  useEffect(() => {
    postEmbedHeight();
  }, [loadingCourses, submitting, successMessage, errors, form.courseIds.length]);

  const canSubmit = useMemo(
    () => !submitting && !loadingCourses && courses.length > 0 && hasCaptchaToken && hasCourseSelection,
    [submitting, loadingCourses, courses.length, hasCaptchaToken, hasCourseSelection]
  );

  const coursesByDay = useMemo(() => {
    const grouped = new Map(WEEK_DAYS.map((day) => [normalizeDay(day), []]));
    for (const course of courses) {
      const dayKey = normalizeDay(course.day_of_week);
      if (!grouped.has(dayKey)) continue;
      grouped.get(dayKey).push(course);
    }
    return WEEK_DAYS.map((day) => ({ day, courses: grouped.get(normalizeDay(day)) || [] }));
  }, [courses]);

  const updateField = useCallback((event) => {
    const { name, value, type, checked } = event.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value
    }));
    setErrors((prev) => ({ ...prev, [name]: undefined, global: undefined }));
  }, []);

  const handleTurnstileToken = useCallback((token) => {
    setForm((prev) => ({ ...prev, turnstileToken: token }));
    setErrors((prev) => ({ ...prev, turnstileToken: undefined, global: undefined }));
  }, []);

  const toggleCourse = useCallback((courseId) => {
    setForm((prev) => {
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
    setErrors((prev) => ({ ...prev, courseIds: undefined, global: undefined }));
  }, []);

  async function onSubmit(event) {
    event.preventDefault();
    setSuccessMessage("");

    if (shouldUseTurnstile && !isTurnstileConfigured && !isDevelopment) {
      setErrors({ global: "La verificación anti-spam no está configurada." });
      return;
    }

    if (shouldUseTurnstile && isTurnstileConfigured && !form.turnstileToken) {
      setErrors({ turnstileToken: "Completa la verificación de seguridad." });
      return;
    }

    const payloadForValidation = {
      ...form,
      turnstileToken: isTurnstileBypassed ? "dev-turnstile-bypass-token" : form.turnstileToken
    };

    const parsed = registrationSchema.safeParse(payloadForValidation);
    if (!parsed.success) {
      const nextErrors = {};
      for (const issue of parsed.error.issues) {
        nextErrors[issue.path[0]] = issue.message;
      }
      setErrors(nextErrors);
      return;
    }

    setSubmitting(true);
    try {
      await submitRegistration(parsed.data);
      setSuccessMessage("Tu inscripción fue realizada de manera exitosa.");
      setForm(initialForm);
      setCaptchaResetSignal((value) => value + 1);
    } catch (error) {
      setErrors({ global: error.message || "Error al enviar la inscripción." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="layout">
      <section ref={shellRef} className="shell" aria-live="polite">
        <header className="topbar">
          <img
            className="topbar-banner"
            src={bannerSrc}
            alt="Buro Business Week"
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
        </header>

        <article className="card">
          <h2>Formulario de inscripción</h2>

          <form onSubmit={onSubmit} noValidate>
            <label htmlFor="fullName">Nombre completo</label>
            <input id="fullName" name="fullName" value={form.fullName} onChange={updateField} autoComplete="name" required />
            {errors.fullName && <p className="error">{errors.fullName}</p>}

            <label htmlFor="email">Correo electrónico</label>
            <input id="email" name="email" type="email" value={form.email} onChange={updateField} autoComplete="email" required />
            {errors.email && <p className="error">{errors.email}</p>}

            <label htmlFor="phone">Numero de telefono (con codigo de pais)</label>
            <input id="phone" name="phone" value={form.phone} onChange={updateField} autoComplete="tel" inputMode="tel" placeholder="+50212345678" required />
            {errors.phone && <p className="error">{errors.phone}</p>}

            <label htmlFor="companyName">Empresa donde laboras</label>
            <input
              id="companyName"
              name="companyName"
              value={form.companyName}
              onChange={updateField}
              autoComplete="organization"
              required
            />
            {errors.companyName && <p className="error">{errors.companyName}</p>}

            <label htmlFor="jobPosition">Puesto desempeñado</label>
            <input id="jobPosition" name="jobPosition" value={form.jobPosition} onChange={updateField} required />
            {errors.jobPosition && <p className="error">{errors.jobPosition}</p>}

            <label htmlFor="academicDegree">Último grado académico cursado</label>
            <input id="academicDegree" name="academicDegree" value={form.academicDegree} onChange={updateField} required />
            {errors.academicDegree && <p className="error">{errors.academicDegree}</p>}

            <label htmlFor="interests">Preferencias de estudio o temas de interés</label>
            <textarea id="interests" name="interests" value={form.interests} onChange={updateField} rows={4} required />
            {errors.interests && <p className="error">{errors.interests}</p>}

            <label>Cursos disponibles (puedes elegir varios)</label>
            <section className="courses-grid" aria-label="Cursos disponibles por día">
              {coursesByDay.map((dayBlock) => (
                <article key={dayBlock.day} className="day-card">
                  <h3>{formatDayHeading(dayBlock.day)}</h3>
                  <div className="day-courses">
                    {dayBlock.courses.length === 0 && <p className="hint">Sin cursos configurados.</p>}
                    {dayBlock.courses.map((course) => {
                      const checked = form.courseIds.includes(course.id);
                      return (
                        <label key={course.id} className={`course-option ${checked ? "selected" : ""}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleCourse(course.id)}
                          />
                          <span className="course-title">{course.title}</span>
                          <span className="course-time">{course.schedule_label}</span>
                        </label>
                      );
                    })}
                  </div>
                </article>
              ))}
            </section>
            {errors.courseIds && <p className="error">{errors.courseIds}</p>}

            <div className="checkbox">
              <input
                id="privacyAccepted"
                name="privacyAccepted"
                type="checkbox"
                checked={form.privacyAccepted}
                onChange={updateField}
                required
              />
              <label htmlFor="privacyAccepted">
                Acepto la política de privacidad y el tratamiento de datos personales.
              </label>
            </div>
            {errors.privacyAccepted && <p className="error">{errors.privacyAccepted}</p>}

            {shouldUseTurnstile && isTurnstileConfigured ? (
              <TurnstileWidget
                siteKey={turnstileSiteKey}
                onToken={handleTurnstileToken}
                resetSignal={captchaResetSignal}
              />
            ) : (
              <p className="hint">
                {isTurnstileBypassed
                  ? "Verificacion anti-spam desactivada para entorno local."
                  : "Verificacion anti-spam pendiente de configuracion."}
              </p>
            )}
            {errors.turnstileToken && <p className="error">{errors.turnstileToken}</p>}

            <button type="submit" disabled={!canSubmit}>
              {submitting ? "Enviando..." : "Enviar inscripción"}
            </button>

            {errors.global && <p className="error">{errors.global}</p>}
          </form>
        </article>
      </section>

      {successMessage && (
        <div className="success-popup" role="status" aria-live="polite">
          <div className="success-popup__icon" aria-hidden="true">
            ✓
          </div>
          <div className="success-popup__content">
            <strong>Inscripción exitosa</strong>
            <span>{successMessage}</span>
          </div>
        </div>
      )}
    </main>
  );
}


