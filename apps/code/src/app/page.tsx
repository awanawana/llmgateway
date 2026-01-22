import { Code, Zap, Shield, Check } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

const plans = [
	{
		name: "Lite",
		price: 29,
		description: "Perfect for side projects and learning",
		features: [
			"$87 in monthly usage (3x value)",
			"All models: Claude, GPT-4o, Gemini",
			"Works with Cursor, Windsurf, Claude Code",
		],
		tier: "lite",
	},
	{
		name: "Pro",
		price: 79,
		description: "For daily development and shipping fast",
		features: [
			"$237 in monthly usage (3x value)",
			"All models: Claude, GPT-4o, Gemini",
			"Works with Cursor, Windsurf, Claude Code",
			"Best value for active developers",
		],
		tier: "pro",
		popular: true,
	},
	{
		name: "Max",
		price: 179,
		description: "For power users and heavy AI usage",
		features: [
			"$537 in monthly usage (3x value)",
			"All models: Claude, GPT-4o, Gemini",
			"Works with Cursor, Windsurf, Claude Code",
			"Ideal for complex codebases",
		],
		tier: "max",
	},
];

export const dynamic = "force-dynamic";

export default function LandingPage() {
	return (
		<div className="min-h-screen bg-background">
			<header className="border-b">
				<div className="container mx-auto px-4 py-4 flex items-center justify-between">
					<div className="flex items-center gap-2">
						<Code className="h-6 w-6" />
						<span className="font-semibold text-lg">LLM Gateway Code</span>
					</div>
					<div className="flex items-center gap-4">
						<Button variant="ghost" asChild>
							<Link href="/login">Sign in</Link>
						</Button>
						<Button asChild>
							<Link href="/signup">Get Started</Link>
						</Button>
					</div>
				</div>
			</header>

			<main>
				<section className="py-20 px-4">
					<div className="container mx-auto text-center max-w-4xl">
						<h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
							One subscription for
							<span className="text-primary"> all your AI coding tools</span>
						</h1>
						<p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
							Power Claude Code, Cursor, Windsurf, and more with a single API
							key. Get 3x your subscription value in usage every month.
						</p>
						<div className="flex gap-4 justify-center">
							<Link href="/signup">
								<Button size="lg">Get Started</Button>
							</Link>
							<Button size="lg" variant="outline" asChild>
								<Link href="#pricing">View Pricing</Link>
							</Button>
						</div>
					</div>
				</section>

				<section className="py-16 px-4 bg-muted/50">
					<div className="container mx-auto">
						<div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
							<div className="text-center">
								<div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-4">
									<Zap className="h-6 w-6 text-primary" />
								</div>
								<h3 className="font-semibold mb-2">3x Value Every Month</h3>
								<p className="text-sm text-muted-foreground">
									Your $29 plan gives you $87 in usage. $79 gives you $237.
									Usage resets automatically each month.
								</p>
							</div>
							<div className="text-center">
								<div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-4">
									<Code className="h-6 w-6 text-primary" />
								</div>
								<h3 className="font-semibold mb-2">Every Model, One API</h3>
								<p className="text-sm text-muted-foreground">
									Access Claude Opus, GPT-4o, Gemini Pro, and 100+ models
									without managing multiple accounts.
								</p>
							</div>
							<div className="text-center">
								<div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-4">
									<Shield className="h-6 w-6 text-primary" />
								</div>
								<h3 className="font-semibold mb-2">Predictable Costs</h3>
								<p className="text-sm text-muted-foreground">
									No surprise bills. Know exactly what you'll pay each month
									with fixed pricing.
								</p>
							</div>
						</div>
					</div>
				</section>

				<section id="pricing" className="py-20 px-4">
					<div className="container mx-auto">
						<div className="text-center mb-12">
							<h2 className="text-3xl font-bold mb-4">
								Pick the plan that fits your workflow
							</h2>
							<p className="text-muted-foreground max-w-2xl mx-auto">
								All plans include every model. No per-seat pricing. Usage resets
								monthly.
							</p>
						</div>
						<div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
							{plans.map((plan) => (
								<div
									key={plan.tier}
									className={`rounded-lg border p-6 ${
										plan.popular
											? "border-primary ring-2 ring-primary/20 relative"
											: ""
									}`}
								>
									{plan.popular && (
										<div className="absolute -top-3 left-1/2 -translate-x-1/2">
											<span className="bg-primary text-primary-foreground text-xs font-medium px-3 py-1 rounded-full">
												Most Popular
											</span>
										</div>
									)}
									<div className="text-center mb-6">
										<h3 className="font-semibold text-lg mb-1">{plan.name}</h3>
										<p className="text-sm text-muted-foreground mb-4">
											{plan.description}
										</p>
										<div className="flex items-baseline justify-center gap-1">
											<span className="text-4xl font-bold">${plan.price}</span>
											<span className="text-muted-foreground">/month</span>
										</div>
									</div>
									<ul className="space-y-3 mb-6">
										{plan.features.map((feature) => (
											<li key={feature} className="flex items-center gap-2">
												<Check className="h-4 w-4 text-primary flex-shrink-0" />
												<span className="text-sm">{feature}</span>
											</li>
										))}
									</ul>
									<Button
										className="w-full"
										variant={plan.popular ? "default" : "outline"}
										asChild
									>
										<Link href={`/signup?plan=${plan.tier}`} className="block">
											Get Started
										</Link>
									</Button>
								</div>
							))}
						</div>
					</div>
				</section>

				<section className="py-16 px-4 bg-muted/50">
					<div className="container mx-auto text-center max-w-2xl">
						<h2 className="text-2xl font-bold mb-4">
							Stop paying for multiple AI subscriptions
						</h2>
						<p className="text-muted-foreground mb-8">
							One plan, every model, all your tools. Start coding smarter today.
						</p>
						<Button size="lg" asChild>
							<Link href="/signup">Get Started</Link>
						</Button>
					</div>
				</section>
			</main>

			<footer className="border-t py-8 px-4">
				<div className="container mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
					<div className="flex items-center gap-2">
						<Code className="h-5 w-5" />
						<span className="font-medium">LLM Gateway Code</span>
					</div>
					<p className="text-sm text-muted-foreground">
						&copy; {new Date().getFullYear()} LLM Gateway. All rights reserved.
					</p>
				</div>
			</footer>
		</div>
	);
}
