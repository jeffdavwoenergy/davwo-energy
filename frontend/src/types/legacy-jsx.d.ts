/**
 * The shadcn/ui primitives and the toast hook are reused as plain .jsx/.js from the
 * original app. Next/Turbopack bundles them fine; TypeScript treats them as untyped
 * here so it doesn't try to (mis)infer their prop types. Phase 5 can port them to .tsx.
 */
declare module "@/components/ui/*";
declare module "@/hooks/*";
