/** Base path when the app is served from a sub-folder (static build on shared hosting), e.g. "/electrify". */
export const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
export const asset = (path: string) => `${BASE}${path}`;
export const COMPILE_URL = process.env.NEXT_PUBLIC_COMPILE_URL ?? '/api/compile';
