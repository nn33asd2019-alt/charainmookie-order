import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // ไม่ throw error ตอน build เพื่อไม่ให้ build บน Vercel ล้มเหลว
  // แต่จะ log เตือนไว้เพื่อให้ debug ง่ายตอน runtime
  console.warn(
    "[supabaseClient] ไม่พบ NEXT_PUBLIC_SUPABASE_URL หรือ NEXT_PUBLIC_SUPABASE_ANON_KEY ใน environment variables"
  );
}

export const supabase = createClient(
  supabaseUrl ?? "",
  supabaseAnonKey ?? ""
);
