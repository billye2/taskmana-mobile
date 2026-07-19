// Supabase project config. The anon key is publishable by design — row-level
// security is the actual boundary (each user can only read/write their own
// row). Leave both empty to disable sync entirely.
const TaskmanaConfig = {
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',
};
