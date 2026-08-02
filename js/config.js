// Supabase project config. The publishable key is public by design — row-level
// security is the actual boundary (each user can only read/write their own
// row). Leave both empty to disable sync entirely.
// The shared project has legacy JWT-style API keys disabled; only
// sb_publishable_* keys work here.
const TaskmanaConfig = {
  SUPABASE_URL: 'https://aennreackkegaqwwbowg.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_yfLFleRnu4wC8i9gNJsf6g_x8Da54UT',
};
