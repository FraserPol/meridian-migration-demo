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
];

export default eslintConfig;
