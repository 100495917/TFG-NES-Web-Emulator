import globals from "globals";
import js from "@eslint/js";
import { defineConfig } from "eslint/config";

export default defineConfig([
    {
        files: ["**/*.{js,mjs,cjs}"],
        plugins: { js },
        extends: ["js/recommended"],
        languageOptions: {
            globals: globals.browser
        },
        rules: {
            // --- Line length ---
            "max-len": ["warn", { code: 120, ignoreUrls: true, ignoreStrings: false, ignoreTemplateLiterals: false }],

            // --- Variable naming (snake_case) ---
            //"id-match": ["warn", "^(?:[a-z]+(_[a-z]+)*|[A-Z0-9_]+)$", { properties: true, onlyDeclarations: true }],

            // --- Semicolons ---
            "semi": ["warn", "always"],

            // --- Indentation ---
            "indent": ["warn", 4],

            // --- Require strict equality ---
            "eqeqeq": ["error", "always"],

            // --- No trailing spaces ---
            "no-trailing-spaces": "warn",

            // --- Newline at end of file ---
            "eol-last": ["warn", "always"],

            // --- No unused variables ---
            "no-unused-vars": ["warn", { vars: "all", args: "after-used", ignoreRestSiblings: true }],

            // --- No multiple empty lines ---
            "no-multiple-empty-lines": ["warn", { max: 1, maxEOF: 1 }],

            // --- Keywords spacing ---
            "keyword-spacing": ["warn", { before: true, after: true }],

            // --- Space before function parentheses ---
            "space-before-function-paren": ["warn", { anonymous: "always", named: "never", asyncArrow: "always" }],

            // --- Space before blocks ---
            "space-before-blocks": ["warn", "always"],

            // --- Space around operators ---
            "space-infix-ops": "warn",

            // --- No var declarations ---
            "no-var": "error",

            // --- No mixed spaces and tabs ---
            "no-mixed-spaces-and-tabs": "error"

        }
    }
]);
