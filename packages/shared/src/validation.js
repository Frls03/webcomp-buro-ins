import { z } from "zod";
import { MAX_INTEREST_LENGTH, MAX_NOTES_LENGTH, REGISTRATION_STATUSES } from "./constants.js";
import { isInternationalPhone, normalizeEmail, normalizePhone, sanitizeText } from "./sanitize.js";

export const registrationSchema = z.object({
  fullName: z
    .string({ required_error: "Ingresa tu nombre completo." })
    .min(3, "Ingresa un nombre valido.")
    .max(120, "El nombre es demasiado largo.")
    .transform(sanitizeText),
  email: z
    .string({ required_error: "Ingresa tu correo electronico." })
    .email("Ingresa un correo valido.")
    .max(160, "El correo es demasiado largo.")
    .transform(normalizeEmail),
  phone: z
    .string({ required_error: "Ingresa tu numero de telefono." })
    .min(8, "Ingresa un telefono valido.")
    .max(30, "El telefono es demasiado largo.")
    .transform(normalizePhone)
    .refine(
      isInternationalPhone,
      "Ingresa tu numero con el prefijo del area/pais donde vives, por ejemplo +50212345678."
    ),
  companyName: z
    .string({ required_error: "Ingresa la empresa donde laboras." })
    .min(2, "Ingresa la empresa donde laboras.")
    .max(160, "El nombre de la empresa es demasiado largo.")
    .transform(sanitizeText),
  jobPosition: z
    .string({ required_error: "Ingresa el puesto que desempenas." })
    .min(2, "Ingresa el puesto que desempenas.")
    .max(120, "El puesto es demasiado largo.")
    .transform(sanitizeText),
  academicDegree: z
    .string({ required_error: "Ingresa tu ultimo grado academico cursado." })
    .min(2, "Ingresa tu ultimo grado academico cursado.")
    .max(120, "El grado academico es demasiado largo.")
    .transform(sanitizeText),
  interests: z
    .string({ required_error: "Describe tus intereses de estudio." })
    .min(3, "Describe tus intereses de estudio.")
    .max(MAX_INTEREST_LENGTH, "El texto de intereses es demasiado largo.")
    .transform(sanitizeText),
  courseIds: z
    .array(z.string().uuid("Uno de los cursos seleccionados no es valido."), {
      required_error: "Selecciona al menos un curso."
    })
    .min(1, "Selecciona al menos un curso.")
    .max(8, "Puedes seleccionar hasta 8 cursos."),
  privacyAccepted: z
    .boolean()
    .refine((value) => value === true, { message: "Debes aceptar la politica de privacidad." }),
  turnstileToken: z.string().min(10, "Completa la verificacion de seguridad.")
});

export const adminUpdateSchema = z.object({
  status: z.enum(REGISTRATION_STATUSES),
  internalNote: z.string().max(MAX_NOTES_LENGTH).transform(sanitizeText).optional()
});

export function parseOrThrow(schema, payload) {
  const result = schema.safeParse(payload);
  if (!result.success) {
    const message = result.error.issues.map((issue) => issue.message).join("; ");
    throw new Error(`Validation error: ${message}`);
  }
  return result.data;
}
