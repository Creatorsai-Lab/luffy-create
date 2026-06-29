// Ambient declarations for static asset imports.
// Kept in a dedicated script file (no top-level import/export) so the wildcard
// module declarations are treated as GLOBAL ambient — a top-level `export` in
// the same file would scope them to that module and break resolution.
declare module '*.webp' { const src: string; export default src }
declare module '*.png'  { const src: string; export default src }
declare module '*.jpg'  { const src: string; export default src }
declare module '*.jpeg' { const src: string; export default src }
declare module '*.svg'  { const src: string; export default src }
declare module '*.gif'  { const src: string; export default src }
declare module '*?url'  { const src: string; export default src }
