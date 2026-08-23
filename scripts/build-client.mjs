import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

await build({
  entryPoints: ['src/client.jsx'],
  outfile: 'lib/client.js',
  absWorkingDir: fileURLToPath(new URL('..', import.meta.url)),
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  external: ['react', 'react-dom', 'react/jsx-runtime'],
  legalComments: 'none',
  banner: {
    js: 'window.__ModuleLoader__.load({id:"dsh-session-tools",factory:(require)=>{var module={exports:{}};var exports=module.exports;',
  },
  footer: {
    js: 'return module.exports;}});',
  },
})
