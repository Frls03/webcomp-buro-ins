import { withCors } from "../../lib/cors.js";
import { methodNotAllowed, serverError } from "../../lib/http.js";
import { supabaseAdmin } from "../../lib/supabaseAdmin.js";

export default async function handler(req, res) {
  if (!withCors(req, res, "public")) return;
  if (req.method !== "GET") return methodNotAllowed(res);

  try {
    const { data, error } = await supabaseAdmin
      .from("courses")
      .select("id,title,day_of_week,schedule_label,display_order")
      .eq("is_active", true)
      .not("day_of_week", "is", null)
      .not("schedule_label", "is", null)
      .order("display_order", { ascending: true })
      .order("title", { ascending: true });

    if (error) throw error;
    res.status(200).json({ courses: data || [] });
  } catch (error) {
    serverError(res, error);
  }
}
