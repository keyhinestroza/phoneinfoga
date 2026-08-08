import js from '@eslint/js';

export default [
  { ignores: ['node_modules/**', 'dist/**', 'companion/**'] },
  js.configs.recommended,
  {
    files: ['webview/inject/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        window: 'readonly',
        document: 'readonly',
        globalThis: 'readonly',
        module: 'writable',
        KeyboardEvent: 'readonly',
        MutationObserver: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        WeakSet: 'readonly',
        console: 'readonly',
      },
    },
  },
  {
    files: ['webview/main.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'writable',
        process: 'readonly',
        __dirname: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
      },
    },
  },
  {
    // preload corre en el renderer (mundo aislado): globals de navegador
    files: ['webview/preload.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        document: 'readonly',
        navigator: 'readonly',
        window: 'readonly',
        Promise: 'readonly',
        DOMException: 'readonly',
      },
    },
  },
  {
    files: ['test/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        // Node
        process: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        URL: 'readonly',
        Buffer: 'readonly',
        // Contexto de página: callbacks de page.evaluate corren en Chromium
        window: 'readonly',
        document: 'readonly',
        Element: 'readonly',
        Blob: 'readonly',
        FileReader: 'readonly',
        MediaRecorder: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
      },
    },
  },
];
