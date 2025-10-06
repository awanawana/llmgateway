"use client";

import { Elements } from "@stripe/react-stripe-js";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import * as React from "react";
import { useState } from "react";

import {
	NavigationMenu,
	NavigationMenuItem,
	NavigationMenuList,
} from "@/lib/components/navigation-menu";
import { Stepper } from "@/lib/components/stepper";
import { useApi } from "@/lib/fetch-client";
import Logo from "@/lib/icons/Logo";
import { useStripe } from "@/lib/stripe";

import { CreditsStep } from "./credits-step";
import { PlanChoiceStep } from "./plan-choice-step";
import { ProviderKeyStep } from "./provider-key-step";
import { ReferralStep } from "./referral-step";
import { WelcomeStep } from "./welcome-step";

type FlowType = "credits" | "byok" | "free" | null;

const getSteps = (flowType: FlowType) => [
	{
		id: "welcome",
		title: "Welcome",
	},
	{
		id: "referral",
		title: "How did you find us?",
		optional: true,
	},
	{
		id: "plan-choice",
		title: "Choose plan",
	},
	{
		id: flowType === "credits" ? "credits" : "provider-key",
		title: flowType === "credits" ? "Credits" : "Provider Key",
		optional: true,
	},
];

export function OnboardingWizard() {
	const [activeStep, setActiveStep] = useState(0);
	const [flowType, setFlowType] = useState<FlowType>(null);
	const [hasSelectedPlan, setHasSelectedPlan] = useState(false);
	const [selectedPlanName, setSelectedPlanName] = useState<string>("");
	const [isPaymentSuccessful, setIsPaymentSuccessful] = useState(false);
	const [referralSource, setReferralSource] = useState<string>("");
	const [referralDetails, setReferralDetails] = useState<string>("");

	const router = useRouter();
	const posthog = usePostHog();
	const { stripe, isLoading: stripeLoading } = useStripe();
	const queryClient = useQueryClient();
	const api = useApi();
	const completeOnboarding = api.useMutation(
		"post",
		"/user/me/complete-onboarding",
	);

	const STEPS = getSteps(flowType);

	const handleStepChange = async (step: number) => {
		// Handle backward navigation
		if (step < activeStep) {
			setActiveStep(step);
			return;
		}

		// Special handling for plan choice step (now at index 2)
		if (activeStep === 2) {
			if (!hasSelectedPlan) {
				// Skip to dashboard if no plan selected
				posthog.capture("onboarding_skipped", {
					skippedAt: "plan_choice",
					referralSource: referralSource || "not_provided",
					referralDetails: referralDetails || undefined,
				});
				try {
					await completeOnboarding.mutateAsync({});
					const queryKey = api.queryOptions("get", "/user/me").queryKey;
					await queryClient.invalidateQueries({ queryKey });
					router.push("/dashboard");
				} catch (err) {
					// Keep user on the current step and log the failure
					console.error("Failed to complete onboarding:", err);
				}
				return;
			}
		}

		if (step >= STEPS.length) {
			posthog.capture("onboarding_completed", {
				completedSteps: STEPS.map((step) => step.id),
				flowType,
				referralSource: referralSource || "not_provided",
				referralDetails: referralDetails || undefined,
			});

			await completeOnboarding.mutateAsync({});
			const queryKey = api.queryOptions("get", "/user/me").queryKey;
			await queryClient.invalidateQueries({ queryKey });
			router.push("/dashboard");
			return;
		}
		setActiveStep(step);
	};

	const handleSelectCredits = () => {
		setFlowType("credits");
		setHasSelectedPlan(true);
		setSelectedPlanName("Buy Credits");
		setActiveStep(3);
	};

	const handleSelectBYOK = () => {
		setFlowType("byok");
		setHasSelectedPlan(true);
		setSelectedPlanName("Bring Your Own Keys");
		setActiveStep(3);
	};

	const handleSelectFreePlan = async () => {
		setHasSelectedPlan(true);
		setSelectedPlanName("Free Plan");
		setFlowType("free");

		// Complete onboarding directly for free plan
		posthog.capture("onboarding_completed", {
			completedSteps: ["welcome", "referral", "plan-choice"],
			flowType: "free",
			referralSource: referralSource || "not_provided",
			referralDetails: referralDetails || undefined,
		});

		try {
			await completeOnboarding.mutateAsync({});
			const queryKey = api.queryOptions("get", "/user/me").queryKey;
			await queryClient.invalidateQueries({ queryKey });
			router.push("/dashboard");
		} catch (err) {
			// Keep user on the current step and log the failure
			console.error("Failed to complete onboarding:", err);
		}
	};

	const handleReferralComplete = (source: string, details?: string) => {
		setReferralSource(source);
		if (details) {
			setReferralDetails(details);
		}
		setActiveStep(2); // Move to Plan Choice step
	};

	// Special handling for PlanChoiceStep to pass callbacks
	const renderCurrentStep = () => {
		switch (activeStep) {
			case 0:
				return <WelcomeStep />;
			case 1:
				return <ReferralStep onComplete={handleReferralComplete} />;
			case 2:
				return (
					<PlanChoiceStep
						onSelectCredits={handleSelectCredits}
						onSelectBYOK={handleSelectBYOK}
						onSelectFreePlan={handleSelectFreePlan}
					/>
				);
			case 3: {
				if (flowType === "credits") {
					return stripeLoading ? (
						<div className="p-6 text-center">Loading payment form...</div>
					) : (
						<Elements stripe={stripe}>
							<CreditsStep
								onPaymentSuccess={() => setIsPaymentSuccessful(true)}
							/>
						</Elements>
					);
				}
				return <ProviderKeyStep />;
			}
			default:
				return null;
		}
	};

	// Customize stepper steps to show appropriate button text
	const getStepperSteps = () => {
		return STEPS.map((step, index) => ({
			...step,
			// Welcome step shows dynamic text based on user state
			...(index === 0 && {
				customNextText: "Next: How did you find us?",
			}),
			// Referral step shows dynamic text based on user state
			...(index === 1 && {
				customNextText: "Next: Choose plan",
			}),
			// Make plan choice step show dynamic text based on selected plan
			...(index === 2 && {
				customNextText: hasSelectedPlan
					? `Continue with ${selectedPlanName}`
					: "Skip",
			}),
			// Remove optional status from credits step when payment is successful
			...(index === 3 &&
				flowType === "credits" &&
				isPaymentSuccessful && {
					optional: false,
				}),
		}));
	};

	return (
		<div className="container mx-auto px-4 py-10">
			<NavigationMenu className="mx-auto mb-4">
				<NavigationMenuList>
					<NavigationMenuItem asChild>
						<div className="flex items-center space-x-2">
							<Logo className="h-8 w-8 rounded-full text-black dark:text-white" />
							<span className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white">
								LLM Gateway
							</span>
						</div>
					</NavigationMenuItem>
				</NavigationMenuList>
			</NavigationMenu>

			<Stepper
				steps={getStepperSteps()}
				activeStep={activeStep}
				onStepChange={handleStepChange}
				className="mb-6"
				nextButtonDisabled={
					activeStep === 3 && flowType === "credits" && !isPaymentSuccessful
				}
			>
				{renderCurrentStep()}
			</Stepper>
		</div>
	);
}
