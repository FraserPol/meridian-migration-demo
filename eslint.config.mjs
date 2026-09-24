// Next.js 16 removed the `next lint` command in favor of running ESLint
// directly (see SETUP_INSTRUCTIONS.md / package.json's "lint" script),
// and eslint-config-next now ships flat-config arrays natively — no
// FlatCompat shim needed.
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [".next/**", "node_modules/**", "drizzle/**"],
  },
  {
    rules: {
      // Formalises the `_name` convention already used across the server
      // actions. useActionState fixes the (prevState, formData) signature,
      // so an action that needs neither still has to declare both — the
      // underscore is how that's marked deliberate. Without this the
      // convention only worked by accident of the "after-used" default,
      // which stops applying once every argument is unused.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
];

export default eslintConfig;
