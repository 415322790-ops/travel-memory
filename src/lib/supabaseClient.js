import { createClient } from '@supabase/supabase-js';

const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabasePublishableKey = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  })
  : null;

let userPromise = null;

function reportSupabaseError(operation, error) {
  if (!import.meta.env.DEV) return;
  console.error('[SupabasePersistence] error', JSON.stringify({
    operation,
    message: error instanceof Error ? error.message : String(error),
  }));
}

export async function getSupabaseUser() {
  if (!supabase) throw new Error('Supabase 未配置，请先设置 VITE_SUPABASE_URL 和 VITE_SUPABASE_PUBLISHABLE_KEY');
  if (userPromise) return userPromise;

  userPromise = (async () => {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (sessionData.session?.user) return sessionData.session.user;

    // The app currently has no sign-in screen. Anonymous auth keeps local
    // development usable while the SQL policies remain owner-scoped.
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) {
      throw new Error(`Supabase 没有可用会话，请启用 Anonymous Auth 或接入登录：${error.message}`);
    }
    if (!data.user) throw new Error('Supabase 未返回用户会话');
    return data.user;
  })().catch((error) => {
    reportSupabaseError('auth', error);
    userPromise = null;
    throw error;
  });

  return userPromise;
}
