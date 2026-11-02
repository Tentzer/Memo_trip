export type PaidAction = 'plan' | 'import';

const SIGN_IN: Record<PaidAction, string> = {
    plan: 'Please sign in again to use trip planning.',
    import: 'Please sign in again to import a video.',
};

const LIMIT: Record<PaidAction, string> = {
    plan: "You've reached today's trip planning limit. Try again tomorrow.",
    import: "You've reached today's video import limit. Try again tomorrow.",
};

const GENERIC = 'Something went wrong. Please try again.';

export function serverErrorFromBody(body: unknown): string | null {
    if (!body || typeof body !== 'object') return null;
    const error = (body as { error?: unknown }).error;
    if (typeof error !== 'string') return null;
    const trimmed = error.trim();
    return trimmed === '' ? null : trimmed;
}

export function userMessageForStatus(
    status: number,
    serverError: string | null,
    action: PaidAction,
): string {
    if (status === 401) return SIGN_IN[action];
    if (status === 429) {
        if (serverError && serverError.length <= 200 && !serverError.includes('\n')) {
            return serverError;
        }
        return LIMIT[action];
    }
    if (serverError && serverError.length <= 200 && !serverError.includes('\n')) {
        return serverError;
    }
    return GENERIC;
}

export async function userMessageFromInvokeError(error: unknown, action: PaidAction): Promise<string> {
    const context = error && typeof error === 'object' && 'context' in error
        ? (error as { context?: unknown }).context
        : undefined;
    if (context instanceof Response) {
        let serverError: string | null = null;
        try {
            const body: unknown = await context.clone().json();
            serverError = serverErrorFromBody(body);
        } catch {
            serverError = null;
        }
        return userMessageForStatus(context.status, serverError, action);
    }
    return userMessageForStatus(0, null, action);
}
