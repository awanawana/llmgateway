import { defineRegistry } from "@json-render/react";

import { canvasCatalog } from "./catalog";

export const { registry } = defineRegistry(canvasCatalog, {
	components: {
		// Layout
		Card: ({ props, children }) => (
			<div className="rounded-lg border bg-card p-4 shadow-sm">
				{props.title && (
					<div className="mb-2">
						<h3 className="text-lg font-semibold">{props.title}</h3>
						{props.description && (
							<p className="text-sm text-muted-foreground">
								{props.description}
							</p>
						)}
					</div>
				)}
				{children}
			</div>
		),
		Row: ({ props, children }) => (
			<div
				className="flex items-center"
				style={{
					gap: props.gap ? `${props.gap * 0.25}rem` : "0.5rem",
					alignItems:
						props.align === "start"
							? "flex-start"
							: props.align === "end"
								? "flex-end"
								: props.align === "stretch"
									? "stretch"
									: "center",
				}}
			>
				{children}
			</div>
		),
		Column: ({ props, children }) => (
			<div
				className="flex flex-col"
				style={{ gap: props.gap ? `${props.gap * 0.25}rem` : "0.5rem" }}
			>
				{children}
			</div>
		),
		Grid: ({ props, children }) => (
			<div
				className="grid"
				style={{
					gridTemplateColumns: `repeat(${props.columns ?? 3}, minmax(0, 1fr))`,
					gap: props.gap ? `${props.gap * 0.25}rem` : "1rem",
				}}
			>
				{children}
			</div>
		),
		Divider: () => <hr className="my-4 border-border" />,

		// Content
		Text: ({ props }) => {
			const variantClasses: Record<string, string> = {
				default: "text-foreground",
				muted: "text-muted-foreground",
				success: "text-green-600 dark:text-green-400",
				warning: "text-yellow-600 dark:text-yellow-400",
				error: "text-red-600 dark:text-red-400",
			};
			return (
				<p className={variantClasses[props.variant ?? "default"]}>
					{props.content}
				</p>
			);
		},
		Heading: ({ props }) => {
			const level = props.level ?? 2;
			const Tag = `h${level}` as keyof Pick<
				React.JSX.IntrinsicElements,
				"h1" | "h2" | "h3" | "h4"
			>;
			const sizeClasses: Record<number, string> = {
				1: "text-3xl font-bold",
				2: "text-2xl font-semibold",
				3: "text-xl font-semibold",
				4: "text-lg font-medium",
			};
			return <Tag className={sizeClasses[level]}>{props.content}</Tag>;
		},
		Badge: ({ props }) => {
			const variantClasses: Record<string, string> = {
				default:
					"bg-primary text-primary-foreground hover:bg-primary/80 border-transparent",
				secondary:
					"bg-secondary text-secondary-foreground hover:bg-secondary/80 border-transparent",
				outline: "text-foreground border-border",
				destructive:
					"bg-destructive text-white hover:bg-destructive/80 border-transparent",
			};
			return (
				<span
					className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${variantClasses[props.variant ?? "default"]}`}
				>
					{props.label}
				</span>
			);
		},
		Image: ({ props }) => (
			<img
				src={props.src}
				alt={props.alt ?? ""}
				width={props.width ?? undefined}
				height={props.height ?? undefined}
				className="max-w-full rounded-md"
			/>
		),
		Code: ({ props }) => (
			<pre className="overflow-x-auto rounded-md bg-muted p-4 text-sm">
				<code>{props.content}</code>
			</pre>
		),

		// Data
		Metric: ({ props }) => {
			const trendColors: Record<string, string> = {
				up: "text-green-600 dark:text-green-400",
				down: "text-red-600 dark:text-red-400",
				flat: "text-muted-foreground",
			};
			const trendArrows: Record<string, string> = {
				up: "\u2191",
				down: "\u2193",
				flat: "\u2192",
			};
			return (
				<div className="rounded-lg border bg-card p-4">
					<p className="text-sm text-muted-foreground">{props.label}</p>
					<p className="text-2xl font-bold">{props.value}</p>
					{props.change && (
						<p className={`text-sm ${trendColors[props.trend ?? "flat"]}`}>
							{trendArrows[props.trend ?? "flat"]} {props.change}
						</p>
					)}
				</div>
			);
		},
		Table: ({ props }) => (
			<div className="overflow-x-auto rounded-md border">
				<table className="w-full text-sm">
					<thead>
						<tr className="border-b bg-muted/50">
							{props.headers.map((header: string, i: number) => (
								<th key={i} className="px-4 py-2 text-left font-medium">
									{header}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{props.rows.map((row: string[], ri: number) => (
							<tr key={ri} className="border-b last:border-0">
								{row.map((cell: string, ci: number) => (
									<td key={ci} className="px-4 py-2">
										{cell}
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		),
		ProgressBar: ({ props }) => (
			<div>
				{props.label && (
					<div className="mb-1 flex items-center justify-between text-sm">
						<span>{props.label}</span>
						<span className="text-muted-foreground">{props.value}%</span>
					</div>
				)}
				<div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
					<div
						className="h-full rounded-full bg-primary transition-all"
						style={{ width: `${props.value}%` }}
					/>
				</div>
			</div>
		),

		// Interactive
		Button: ({ props, emit }) => {
			const variantClasses: Record<string, string> = {
				default: "bg-primary text-primary-foreground hover:bg-primary/90",
				secondary:
					"bg-secondary text-secondary-foreground hover:bg-secondary/80",
				outline:
					"border border-input bg-background hover:bg-accent hover:text-accent-foreground",
				destructive: "bg-destructive text-white hover:bg-destructive/90",
				ghost: "hover:bg-accent hover:text-accent-foreground",
			};
			return (
				<button
					type="button"
					className={`inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 ${variantClasses[props.variant ?? "default"]}`}
					disabled={props.disabled ?? false}
					onClick={() => emit("press")}
				>
					{props.label}
				</button>
			);
		},
		TextInput: ({ props }) => (
			<div>
				{props.label && (
					<label className="mb-1 block text-sm font-medium">
						{props.label}
					</label>
				)}
				<input
					type="text"
					placeholder={props.placeholder ?? ""}
					className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				/>
			</div>
		),
		Switch: ({ props }) => (
			<label className="flex items-center gap-2">
				<button
					type="button"
					role="switch"
					aria-checked={props.defaultChecked ?? false}
					className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
						props.defaultChecked ? "bg-primary" : "bg-input"
					}`}
				>
					<span
						className={`pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform ${
							props.defaultChecked ? "translate-x-5" : "translate-x-0"
						}`}
					/>
				</button>
				{props.label && <span className="text-sm">{props.label}</span>}
			</label>
		),
		Select: ({ props }) => (
			<div>
				{props.label && (
					<label className="mb-1 block text-sm font-medium">
						{props.label}
					</label>
				)}
				<select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
					{props.placeholder && (
						<option value="" disabled>
							{props.placeholder}
						</option>
					)}
					{props.options.map(
						(opt: { label: string; value: string }, i: number) => (
							<option key={i} value={opt.value}>
								{opt.label}
							</option>
						),
					)}
				</select>
			</div>
		),
	},
	actions: {},
});
