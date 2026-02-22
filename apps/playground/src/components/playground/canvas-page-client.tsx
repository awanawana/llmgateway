"use client";

import { useUIStream } from "@json-render/react";
import { Loader2, SendHorizonal, Trash2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { ThemeToggle } from "@/components/landing/theme-toggle";
import { ModelSelector } from "@/components/model-selector";
import { AuthDialog } from "@/components/playground/auth-dialog";
import { ChatSidebar } from "@/components/playground/chat-sidebar";
import { Button } from "@/components/ui/button";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Textarea } from "@/components/ui/textarea";
import { useUser } from "@/hooks/useUser";
import { CanvasRenderer } from "@/lib/canvas/renderer";

import type { ApiModel, ApiProvider } from "@/lib/fetch-models";
import type { Organization, Project } from "@/lib/types";

interface CanvasPageClientProps {
	models: ApiModel[];
	providers: ApiProvider[];
	organizations: Organization[];
	selectedOrganization: Organization | null;
	projects: Project[];
	selectedProject: Project | null;
}

export default function CanvasPageClient({
	models,
	providers,
	organizations,
	selectedOrganization,
	projects,
	selectedProject,
}: CanvasPageClientProps) {
	const { user, isLoading: isUserLoading } = useUser();
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();

	const [selectedModel, setSelectedModel] = useState("auto");
	const [prompt, setPrompt] = useState("");
	const [history, setHistory] = useState<string[]>([]);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const isAuthenticated = !isUserLoading && !!user;
	const showAuthDialog = !isAuthenticated && !isUserLoading && !user;

	const returnUrl = useMemo(() => {
		const search = searchParams.toString();
		return search ? `${pathname}?${search}` : pathname;
	}, [pathname, searchParams]);

	const ensuredProjectRef = useRef<string | null>(null);

	useEffect(() => {
		if (!isAuthenticated || !selectedProject) {
			ensuredProjectRef.current = null;
			return;
		}
		const ensureKey = async () => {
			if (!selectedOrganization) {
				return;
			}
			if (ensuredProjectRef.current === selectedProject.id) {
				return;
			}
			try {
				await fetch("/api/ensure-playground-key", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ projectId: selectedProject.id }),
				});
				ensuredProjectRef.current = selectedProject.id;
			} catch {
				// ignore
			}
		};
		ensureKey();
	}, [isAuthenticated, selectedOrganization, selectedProject]);

	const { spec, isStreaming, error, rawLines, send, clear } = useUIStream({
		api: "/api/canvas",
		onError: (err) => console.error("Canvas generation error:", err),
	});

	const hasSpec =
		spec !== null && spec.root !== "" && Object.keys(spec.elements).length > 0;

	const handleSubmit = async () => {
		const trimmed = prompt.trim();
		if (!trimmed || isStreaming) {
			return;
		}

		setHistory((prev) => [...prev, trimmed]);
		setPrompt("");
		await send(trimmed, { model: selectedModel });
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSubmit();
		}
	};

	const handleClear = () => {
		clear();
		setHistory([]);
	};

	const handleSelectOrganization = (org: Organization | null) => {
		const params = new URLSearchParams(Array.from(searchParams.entries()));
		if (org?.id) {
			params.set("orgId", org.id);
		} else {
			params.delete("orgId");
		}
		params.delete("projectId");
		router.push(params.toString() ? `/canvas?${params.toString()}` : "/canvas");
	};

	const handleOrganizationCreated = (org: Organization) => {
		const params = new URLSearchParams(Array.from(searchParams.entries()));
		params.set("orgId", org.id);
		params.delete("projectId");
		router.push(params.toString() ? `/canvas?${params.toString()}` : "/canvas");
	};

	const handleSelectProject = (project: Project | null) => {
		if (!project) {
			return;
		}
		const params = new URLSearchParams(Array.from(searchParams.entries()));
		params.set("orgId", project.organizationId);
		params.set("projectId", project.id);
		router.push(params.toString() ? `/canvas?${params.toString()}` : "/canvas");
	};

	const handleProjectCreated = (project: Project) => {
		const params = new URLSearchParams(Array.from(searchParams.entries()));
		params.set("orgId", project.organizationId);
		params.set("projectId", project.id);
		router.push(params.toString() ? `/canvas?${params.toString()}` : "/canvas");
	};

	return (
		<SidebarProvider>
			<div className="flex h-svh bg-background w-full overflow-hidden">
				<ChatSidebar
					onNewChat={handleClear}
					onChatSelect={() => {}}
					clearMessages={handleClear}
					isLoading={isStreaming}
					organizations={organizations}
					selectedOrganization={selectedOrganization}
					onSelectOrganization={handleSelectOrganization}
					onOrganizationCreated={handleOrganizationCreated}
					projects={projects}
					selectedProject={selectedProject}
					onSelectProject={handleSelectProject}
					onProjectCreated={handleProjectCreated}
				/>
				<div className="flex flex-1 flex-col w-full min-h-0 overflow-hidden">
					<header className="shrink-0 flex items-center p-4 border-b bg-background">
						<div className="flex items-center gap-3 min-w-0 flex-1">
							<SidebarTrigger />
							<h1 className="text-lg font-semibold whitespace-nowrap">
								Canvas
							</h1>
							<div className="min-w-[200px] max-w-[300px]">
								<ModelSelector
									models={models}
									providers={providers}
									value={selectedModel}
									onValueChange={setSelectedModel}
									placeholder="Select model..."
								/>
							</div>
						</div>
						<div className="flex items-center gap-3 ml-3">
							{(hasSpec || history.length > 0) && (
								<Button
									variant="outline"
									size="sm"
									onClick={handleClear}
									disabled={isStreaming}
								>
									<Trash2 className="size-4 mr-1" />
									Clear
								</Button>
							)}
							<ThemeToggle />
							<a
								href={
									process.env.NODE_ENV === "development"
										? "http://localhost:3002/dashboard"
										: "https://llmgateway.io/dashboard"
								}
								target="_blank"
								rel="noopener noreferrer"
								className="hidden sm:inline"
							>
								<span className="text-nowrap">Dashboard</span>
							</a>
						</div>
					</header>

					<div className="flex-1 flex flex-col min-h-0 w-full overflow-hidden">
						<div className="flex-1 overflow-y-auto p-6">
							{!hasSpec && !isStreaming && history.length === 0 ? (
								<div className="max-w-2xl mx-auto py-10">
									<div className="mb-6 text-center">
										<h2 className="text-3xl font-semibold tracking-tight mb-2">
											Canvas Mode
										</h2>
										<p className="text-muted-foreground">
											Describe a UI and watch it render live. Try &quot;Create a
											dashboard with 3 metrics showing revenue, users, and
											conversion rate&quot;
										</p>
									</div>
									<div className="mt-8 p-4 rounded-lg border bg-muted/50">
										<h3 className="font-medium mb-2">How it works</h3>
										<ul className="text-sm text-muted-foreground space-y-1">
											<li>• Describe the UI you want using natural language</li>
											<li>
												• The AI generates structured UI components in real-time
											</li>
											<li>
												• Components render progressively as they stream in
											</li>
											<li>
												• Available components: Cards, Metrics, Tables, Buttons,
												Forms, and more
											</li>
										</ul>
									</div>
								</div>
							) : (
								<div className="max-w-4xl mx-auto">
									{history.length > 0 && (
										<div className="mb-4 space-y-2">
											{history.map((h, i) => (
												<div
													key={i}
													className="text-sm text-muted-foreground bg-muted/50 rounded-lg px-3 py-2"
												>
													{h}
												</div>
											))}
										</div>
									)}
									{error && (
										<div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
											{error.message}
										</div>
									)}
									{isStreaming && (
										<div className="mb-4 flex items-center gap-2 text-muted-foreground">
											<Loader2 className="size-4 animate-spin" />
											<span className="text-sm">
												{hasSpec
													? `Streaming... (${rawLines.length} patches applied)`
													: "Generating UI..."}
											</span>
										</div>
									)}
									{hasSpec && (
										<CanvasRenderer spec={spec} loading={isStreaming} />
									)}
									{!isStreaming && !hasSpec && !error && history.length > 0 && (
										<div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-4">
											The model did not generate any UI components. Try a
											different model or rephrase your prompt.
										</div>
									)}
								</div>
							)}
						</div>

						<div className="shrink-0 border-t bg-background p-4">
							<div className="max-w-4xl mx-auto flex gap-2">
								<Textarea
									ref={textareaRef}
									value={prompt}
									onChange={(e) => setPrompt(e.target.value)}
									onKeyDown={handleKeyDown}
									placeholder="Describe the UI you want to generate..."
									className="min-h-[44px] max-h-[120px] resize-none"
									rows={1}
									disabled={isStreaming}
								/>
								<Button
									onClick={handleSubmit}
									disabled={!prompt.trim() || isStreaming}
									size="icon"
									className="shrink-0 h-[44px] w-[44px]"
								>
									{isStreaming ? (
										<Loader2 className="size-4 animate-spin" />
									) : (
										<SendHorizonal className="size-4" />
									)}
								</Button>
							</div>
						</div>
					</div>
				</div>
			</div>
			<AuthDialog open={showAuthDialog} returnUrl={returnUrl} />
		</SidebarProvider>
	);
}
