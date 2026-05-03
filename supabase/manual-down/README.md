# Manual down migrations

SQL in this folder is **not** applied by `supabase db push`. Use it only when rolling back a corresponding `supabase/migrations/<timestamp>_*.sql` change, via `supabase db query --file ...` or the SQL editor.

Pair each forward migration in the same PR with its down script here.
