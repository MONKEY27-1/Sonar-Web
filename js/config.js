// Sonar website config.
//
// Same Supabase project the desktop app ships baked into
// src/Soundboard/Authentication/SupabaseConfig.cs. The anon/public key is safe to expose in
// client-side code by design — Supabase enforces real data access with Row Level Security
// policies server-side, not by hiding this key. See supabase-schema.sql in the app repo for
// the policies/RPCs this site calls.
const SONAR_CONFIG = {
  supabaseUrl: "https://zagelzxqgandqtmndswa.supabase.co",
  supabaseAnonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InphZ2VsenhxZ2FuZHF0bW5kc3dhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3MjA3OTMsImV4cCI6MjEwMTI5Njc5M30.Uhh3koGFJe5UxfMZY99o87l55G_NOWbzuN4_PIrTI-8",
  githubOwner: "MONKEY27-1",
  githubRepo: "sonar",
};
