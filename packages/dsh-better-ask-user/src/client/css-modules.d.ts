/**
 * CSS Module imports for the client half. `scripts/build-client.mjs` loads
 * every `.module.css` through esbuild's local-css loader, which returns the
 * scoped class map as the module's default export, so the ambient shape here
 * mirrors that bundler contract (a plain `.css` import has no exports).
 */
declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}

declare module '*.css'
