declare module 'https://deno.land/std@0.224.0/assert/mod.ts' {
    export function assertEquals<T>(actual: T, expected: T, msg?: string): void;
}

declare module 'https://esm.sh/@supabase/supabase-js@2.49.1' {
    export function createClient(
        supabaseUrl: string,
        supabaseKey: string,
        options?: { global?: { headers?: Record<string, string> } } | undefined,
    ): import('@supabase/supabase-js').SupabaseClient;
}
