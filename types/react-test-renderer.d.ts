declare module 'react-test-renderer' {
    import type { ReactElement } from 'react';

    export function act(callback: () => void | Promise<void>): Promise<void>;
    export function create(element: ReactElement): { unmount(): void };
}
