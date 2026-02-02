import lint from "../../eslint.config.mjs";
import { react } from "@abinnovision/eslint-config-react";

/** @type {import("eslint").Linter.Config[]} */
export default [
	...lint,
	...react,
	{
		rules: {
			"no-console": "off",
		},
	},
	{
		ignores: ["**/v1.d.ts"],
	},
];
