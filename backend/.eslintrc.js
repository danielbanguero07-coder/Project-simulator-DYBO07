{
  "extends": ["airbnb-base", "airbnb-typescript/base", "prettier"],
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "project": "tsconfig.json",
    "tsconfigRootDir": ".",
    "sourceType": "module"
  },
  "plugins": ["@typescript-eslint", "prettier"],
  "env": {
    "node": true,
    "jest": true
  },
  "rules": {
    "prettier/prettier": "error",
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/explicit-function-return-type": "off",
    "@typescript-eslint/explicit-module-boundary-types": "off",
    "@typescript-eslint/no-floating-promises": "warn",
    "@typescript-eslint/require-await": "warn",
    "import/no-extraneous-dependencies": ["error", { "devDependencies": ["**/*.spec.ts", "**/*.test.ts", "test/**/*", "scripts/**/*", "prisma/**/*"] }],
    "import/prefer-default-export": "off",
    "class-methods-use-this": "off",
    "no-console": ["warn", { "allow": ["warn", "error"] }]
  },
  "ignorePatterns": ["dist/", "node_modules/", "build/", "coverage/", "*.js", "*.d.ts"]
}