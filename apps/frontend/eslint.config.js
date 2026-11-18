import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  // Reglas recomendadas base de ESLint
  js.configs.recommended,

  // Reglas recomendadas de TypeScript (sin chequeo de tipos)
  ...tseslint.configs.recommended,

  // Configuración específica para archivos TS/TSX (React + Hooks)
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      // Reglas recomendadas de React
      ...react.configs.recommended.rules,
      // Reglas recomendadas de React Hooks
      ...reactHooks.configs.recommended.rules,

      // Ajustes para un proyecto React + TypeScript moderno (Vite)
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',

      // Suavizamos algunas reglas para no bloquear el CI con deuda técnica preexistente
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },

  // Ignorar artefactos de build y dependencias
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
];
