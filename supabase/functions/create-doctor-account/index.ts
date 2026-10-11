import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Kun POST er tilladt.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const publicKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
  const secretKey = Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !publicKey || !secretKey) {
    console.error('Function environment is missing required configuration.');
    return jsonResponse({ error: 'Kontofunktionen er ikke konfigureret.' }, 500);
  }

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return jsonResponse({ error: 'Log ind igen.' }, 401);

  const token = authorization.slice('Bearer '.length);
  const userClient = createClient(supabaseUrl, publicKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userData.user) {
    return jsonResponse({ error: 'Kun en administrator kan oprette lægekonti.' }, 403);
  }

  const adminClient = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: admin, error: adminError } = await adminClient
    .from('clinic_admins')
    .select('user_id')
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (adminError || !admin) return jsonResponse({ error: 'Kun en administrator kan oprette lægekonti.' }, 403);

  let input: { name?: string; location?: string; email?: string; password?: string };
  try {
    input = await request.json();
  } catch {
    return jsonResponse({ error: 'Ugyldige data.' }, 400);
  }

  const name = input.name?.trim();
  const location = input.location?.trim();
  const email = input.email?.trim().toLowerCase();
  const password = input.password ?? '';
  if (!name || !location || !email || !email.includes('@') || password.length < 12) {
    return jsonResponse({ error: 'Udfyld navn, lokation, e-mail og en adgangskode på mindst 12 tegn.' }, 400);
  }

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: name },
  });
  if (createError || !created.user) {
    return jsonResponse({ error: createError?.message ?? 'Brugeren kunne ikke oprettes.' }, 400);
  }

  const { error: doctorError } = await adminClient.from('doctors').insert({
    name,
    location,
    email,
    user_id: created.user.id,
  });
  if (doctorError) {
    await adminClient.auth.admin.deleteUser(created.user.id);
    return jsonResponse({ error: doctorError.message }, 400);
  }

  return jsonResponse({ success: true, doctor: { name, location, email } }, 201);
});
