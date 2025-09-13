"use client";

import { useEffect } from "react";

import { useUser } from "@/hooks/useUser";
import { useAppConfig } from "@/lib/config";

export function BrevoWidget() {
	const config = useAppConfig();
	const { user, isLoading } = useUser();

	useEffect(() => {
		if (!config.brevoConversationsId && isLoading) {
			return;
		}

		// Set up Brevo Conversations script
		(window as any).BrevoConversationsID = config.brevoConversationsId;
		(window as any).BrevoConversations =
			(window as any).BrevoConversations ||
			function () {
				((window as any).BrevoConversations.q =
					(window as any).BrevoConversations.q || []).push(arguments);
			};

		// Load the Brevo script
		const script = document.createElement("script");
		script.async = true;
		script.src =
			"https://conversations-widget.brevo.com/brevo-conversations.js";

		script.onload = function () {
			if (user?.email && (window as any).BrevoConversations) {
				(window as any).BrevoConversations("updateIntegrationData", {
					email: user.email,
				});
			}
		};

		if (document.head) {
			document.head.appendChild(script);
		}

		return () => {
			// Clean up if the component unmounts
			const existingScript = document.querySelector(
				'script[src="https://conversations-widget.brevo.com/brevo-conversations.js"]',
			);
			if (existingScript) {
				existingScript.remove();
			}
		};
	}, [config.brevoConversationsId, user?.email, isLoading]);

	// Update user email when it changes
	useEffect(() => {
		if (
			user?.email &&
			(window as any).BrevoConversations &&
			config.brevoConversationsId
		) {
			(window as any).BrevoConversations("updateIntegrationData", {
				email: user.email,
			});
		}
	}, [user?.email, config.brevoConversationsId]);

	return null;
}
