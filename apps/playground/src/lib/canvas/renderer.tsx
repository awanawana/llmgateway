"use client";

import {
	Renderer,
	StateProvider,
	VisibilityProvider,
	ActionProvider,
} from "@json-render/react";

import { registry } from "./registry";

import type { Spec } from "@json-render/react";
import type { ReactNode } from "react";

interface CanvasRendererProps {
	spec: Spec | null;
	loading?: boolean;
}

export function CanvasRenderer({
	spec,
	loading,
}: CanvasRendererProps): ReactNode {
	if (!spec) {
		return null;
	}

	return (
		<StateProvider>
			<VisibilityProvider>
				<ActionProvider handlers={{}}>
					<Renderer spec={spec} registry={registry} loading={loading} />
				</ActionProvider>
			</VisibilityProvider>
		</StateProvider>
	);
}
