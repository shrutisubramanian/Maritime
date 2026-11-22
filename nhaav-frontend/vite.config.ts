import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

/**
 * Inject a Content-Security-Policy into the BUILT index.html only.
 *
 * Build-only on purpose: Vite's dev server relies on inline scripts and eval for
 * HMR, so a policy this strict would break `npm run dev`. The production bundle
 * has no inline script (the theme boot moved to /theme-init.js) and no eval.
 *
 * `connect-src` must include the API origin, which comes from VITE_API_URL at
 * build time — the same variable the app uses at runtime.
 */
function contentSecurityPolicy(apiOrigin: string, configuredApiUrl: string): Plugin {
  return {
    name: 'nhaav-csp',
    apply: 'build',
    transformIndexHtml(html) {
      if (!configuredApiUrl) {
        // Loud, not fatal: keep local builds easy, but never let a production
        // bundle silently ship with localhost in its CSP/connect-src.
        console.warn(
          '[nhaav] VITE_API_URL is not set — the bundle will call http://localhost:8000. Set it to the deployed API origin before a production build.',
        )
      }
      const directives = [
        "default-src 'self'",
        "script-src 'self'",
        // React sets style attributes, which need 'unsafe-inline' for styles;
        // Google Fonts serves the stylesheet and the font files.
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com data:",
        // Listing images may reference external https hosts (e.g. CDNs).
        "img-src 'self' data: blob: https:",
        "media-src 'self' data: blob: https:",
        `connect-src 'self' ${apiOrigin}`,
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "object-src 'none'",
      ]
      const meta = `    <meta http-equiv="Content-Security-Policy" content="${directives.join('; ')}" />\n`
      return html.replace('  </head>', `${meta}  </head>`)
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Shell/CI variables win; otherwise `.env.[mode]` (including
  // `.env.production`) is the source of truth for build-time configuration.
  const fileEnv = loadEnv(mode, process.cwd(), '')
  const configuredApiUrl = (process.env.VITE_API_URL || fileEnv.VITE_API_URL || '').trim()
  const apiOrigin = (configuredApiUrl || 'http://localhost:8000').replace(/\/+$/, '')

  return {
    plugins: [react(), contentSecurityPolicy(apiOrigin, configuredApiUrl)],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 3000,
      open: true,
    },
  }
})
