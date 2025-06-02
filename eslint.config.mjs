import eslintJs from "@eslint/js";
import comments from "@eslint-community/eslint-plugin-eslint-comments/configs";
import eslintConfigPrettier from "eslint-config-prettier";
import { importX } from "eslint-plugin-import-x";
import eslintPluginJsonc from "eslint-plugin-jsonc";
import nodePlugin from "eslint-plugin-n";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import pluginPromise from "eslint-plugin-promise";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import eslintPluginUnicorn from "eslint-plugin-unicorn";
import {
  config as eslintConfig,
  configs as eslintTsConfigs,
} from "typescript-eslint";

export default eslintConfig(
  eslintJs.configs.recommended,
  eslintTsConfigs.recommended,
  comments.recommended,
  nodePlugin.configs["flat/recommended-script"],
  pluginPromise.configs["flat/recommended"],
  eslintPluginJsonc.configs["flat/recommended-with-json"],
  eslintPluginJsonc.configs["flat/recommended-with-json5"],
  importX.flatConfigs.recommended,
  importX.flatConfigs.typescript,
  eslintPluginUnicorn.configs.all,
  {
    plugins: {
      "simple-import-sort": simpleImportSort,
    },
    rules: {
      "simple-import-sort/imports": "error",
      "simple-import-sort/exports": "error",
    },
  },
  eslintConfigPrettier,
  eslintPluginPrettierRecommended,
  {
    ignores: ["./dist", "./change", "./node_modules"],
  },
);
