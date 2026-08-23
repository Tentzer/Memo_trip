/**
 * Editor/typecheck stubs for Supabase Edge (Deno). Runtime is Deno Deploy; CI uses `deno check`.
 * Not a substitute for @types — keeps non-Deno TS language servers satisfied.
 */
interface DenoEnv {
    get(key: string): string | undefined;
}

declare const Deno: {
    env: DenoEnv;
    serve(handler: (req: Request) => Response | Promise<Response>): void;
    test(name: string, fn: () => void | Promise<void>): void;
};
