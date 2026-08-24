import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintPluginReact from 'eslint-plugin-react'
import eslintPluginReactHooks from 'eslint-plugin-react-hooks'
import eslintPluginReactRefresh from 'eslint-plugin-react-refresh'

// Sin el plugin de Prettier a propósito: el código no está formateado con Prettier
// (comillas simples, sin punto y coma) y meterlo como regla de lint son ~16 000
// avisos de formato que tapan los errores de verdad. `npm run format` sigue ahí.
export default tseslint.config(
  { ignores: ['**/node_modules', '**/dist', '**/out', '**/resources'] },
  tseslint.configs.recommended,
  eslintPluginReact.configs.flat.recommended,
  eslintPluginReact.configs.flat['jsx-runtime'],
  {
    settings: { react: { version: 'detect' } },
    plugins: {
      'react-hooks': eslintPluginReactHooks,
      'react-refresh': eslintPluginReactRefresh,
    },
    rules: {
      ...eslintPluginReactHooks.configs.recommended.rules,
      'react/prop-types': 'off',
      // Anotar el tipo de retorno de 352 funciones es diff sin valor: TS ya lo infiere.
      '@typescript-eslint/explicit-function-return-type': 'off',
      // `catch {}` a propósito (best-effort) es el patrón del proyecto.
      'no-empty': ['error', { allowEmptyCatch: true }],
      // El proyecto usa `any` puntual en los puentes con PDF.js y el IPC; que avise,
      // no que tumbe el build.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
)
