import { supabaseAdmin, supabaseAuth } from "./supabaseAdmin.js";

const rolePriority = {
  viewer: 1,
  noter: 1,
  editor: 2,
  manager: 3
};

const rolePermissions = {
  viewer: {
    read: true,
    note: false,
    update: false,
    create: false,
    remove: false,
    export: false
  },
  noter: {
    read: true,
    note: false,
    update: false,
    create: false,
    remove: false,
    export: false
  },
  editor: {
    read: true,
    note: false,
    update: false,
    create: false,
    remove: false,
    export: false
  },
  manager: {
    read: true,
    note: true,
    update: true,
    create: true,
    remove: true,
    export: true
  }
};

export async function requireAdmin(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return { ok: false, status: 401, error: "Token requerido" };

  const { data: userData, error: userError } = await supabaseAuth.auth.getUser(token);
  if (userError || !userData?.user) return { ok: false, status: 401, error: "Token invalido" };

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("admin_profiles")
    .select("id,user_id,role,is_active,display_name")
    .eq("user_id", userData.user.id)
    .single();

  if (profileError || !profile || !profile.is_active) {
    return { ok: false, status: 403, error: "Usuario no autorizado" };
  }

  return {
    ok: true,
    user: userData.user,
    profile
  };
}

export function ensureRole(profile, minRole = "viewer") {
  return (rolePriority[profile.role] || 0) >= (rolePriority[minRole] || 0);
}

export function getPermissions(profile) {
  return rolePermissions[profile.role] || rolePermissions.viewer;
}

export function canAccess(profile, permission) {
  const permissions = getPermissions(profile);
  return Boolean(permissions[permission]);
}
