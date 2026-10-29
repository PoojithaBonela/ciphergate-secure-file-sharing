/**
 * Type declarations for static asset imports that TypeScript
 * cannot resolve natively.
 */

// CSS modules and plain CSS imports
declare module '*.css' {
  const content: Record<string, string>
  export default content
}

// Image assets
declare module '*.svg' {
  const src: string
  export default src
}
declare module '*.png' {
  const src: string
  export default src
}
declare module '*.jpg' {
  const src: string
  export default src
}
declare module '*.jpeg' {
  const src: string
  export default src
}
declare module '*.webp' {
  const src: string
  export default src
}
