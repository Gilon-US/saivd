import {NextRequest, NextResponse} from "next/server";
import {createServiceRoleClient} from "@/utils/supabase/service";
import {requireSuperuser} from "@/utils/auth-roles";
import {SETTING_DEFS, validateSettingValue} from "@/lib/app-settings";

// GET /api/admin/settings — superuser: returns all settings with metadata
export async function GET() {
  const {error} = await requireSuperuser();
  if (error) return NextResponse.json({success: false, error: {code: "unauthorized", message: "Superuser required"}}, {status: 403});

  try {
    const client = createServiceRoleClient();
    const {data, error: dbErr} = await client.from("app_settings").select("key, value, description, updated_at");
    if (dbErr) throw dbErr;

    // Merge DB rows with SETTING_DEFS so the UI always sees all known keys
    const byKey = Object.fromEntries((data ?? []).map((r) => [r.key, r]));
    const settings = SETTING_DEFS.map((def) => ({
      key: def.key,
      label: def.label,
      description: def.description,
      type: def.type,
      value: byKey[def.key]?.value ?? null,
      updated_at: byKey[def.key]?.updated_at ?? null,
    }));

    return NextResponse.json({success: true, data: settings});
  } catch (err) {
    console.error("GET /api/admin/settings error:", err);
    return NextResponse.json({success: false, error: {code: "server_error", message: "Failed to load settings"}}, {status: 500});
  }
}

// PUT /api/admin/settings — superuser: upsert one or more { key, value } pairs
export async function PUT(request: NextRequest) {
  const {error, user} = await requireSuperuser();
  if (error || !user) return NextResponse.json({success: false, error: {code: "unauthorized", message: "Superuser required"}}, {status: 403});

  try {
    const body = await request.json();
    const updates: {key: string; value: string}[] = Array.isArray(body) ? body : [body];

    const validKeys = new Set(SETTING_DEFS.map((d) => d.key));
    for (const {key, value} of updates) {
      if (!validKeys.has(key)) {
        return NextResponse.json({success: false, error: {code: "validation_error", message: `Unknown setting key: ${key}`}}, {status: 400});
      }
      if (typeof value !== "string") {
        return NextResponse.json({success: false, error: {code: "validation_error", message: `Value for ${key} must be a string`}}, {status: 400});
      }
      const validationError = validateSettingValue(key, value);
      if (validationError) {
        return NextResponse.json({success: false, error: {code: "validation_error", message: validationError}}, {status: 400});
      }
    }

    const client = createServiceRoleClient();
    const rows = updates.map(({key, value}) => ({
      key,
      value: value.trim(),
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    }));

    const {error: upsertErr} = await client.from("app_settings").upsert(rows, {onConflict: "key"});
    if (upsertErr) throw upsertErr;

    return NextResponse.json({success: true});
  } catch (err) {
    console.error("PUT /api/admin/settings error:", err);
    return NextResponse.json({success: false, error: {code: "server_error", message: "Failed to save settings"}}, {status: 500});
  }
}
