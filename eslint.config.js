import js from '@eslint/js';
import eslintPluginAstro from 'eslint-plugin-astro';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', '.astro/**', 'node_modules/**', 'public/**'] },
  js.configs.recommended,
  // tseslint 在前：其 parser 用于 .ts；astro 的 flat 配置在后：.astro 文件由其专用解析器处理
  ...tseslint.configs.recommended,
  ...eslintPluginAstro.configs['flat/recommended'],
  {
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // 项目大量使用 any（沿用既有宽松风格），不强制禁用
      '@typescript-eslint/no-explicit-any': 'off',
      // .ts/.astro 的未定义变量由 astro check（TypeScript）兜底；
      // astro 脚本中的 TS 断言（as EventListener 等）与 define:vars 注入变量会被 no-undef 误报
      'no-undef': 'off',
    },
  },
  {
    // .astro：frontmatter 与脚本按 TypeScript 解析（astro-eslint-parser 委托给 ts parser）
    files: ['**/*.astro'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.astro'],
        sourceType: 'module',
      },
    },
  },
  {
    // 构建 remark/rehype 插件运行在 Node 环境的纯 JS（无 TS 检查，保留 no-undef）
    files: ['src/plugins/**/*.mjs', 'script/**/*.mjs'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
    },
  },
);
