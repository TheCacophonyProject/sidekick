import { createEffect, createSignal, onMount, onCleanup } from "solid-js";

declare global {
	interface Window {
		FlyweightChat: {
			config?: {
				display?: string;
				content?: {
					popup?: string;
				};
				appearance?: {
					popup?: {
						openAfter?: number;
					};
					button?: {
						display?: boolean;
					};
				};
			};
		};
	}
}

let flyweightChatScriptLoaded = false;

export const [isChatVisible, setIsChatVisible] = createSignal(false);
export const [isChatOnManualPage, setIsChatOnManualPage] = createSignal(false);

export default function FlyweightChatManager() {
	let iframeObserver: MutationObserver | null = null;

	onMount(() => {
		// Initialize Flyweight chat only once
		if (!flyweightChatScriptLoaded) {
			window.FlyweightChat = window.FlyweightChat || {};
			window.FlyweightChat.config = window.FlyweightChat.config || {};
			window.FlyweightChat.config.display = "POPUP";
			window.FlyweightChat.config.content =
				window.FlyweightChat.config.content || {};
			window.FlyweightChat.config.content.popup = "";
			window.FlyweightChat.config.appearance =
				window.FlyweightChat.config.appearance || {};
			window.FlyweightChat.config.appearance.popup =
				window.FlyweightChat.config.appearance.popup || {};
			window.FlyweightChat.config.appearance.popup.openAfter = 999999999;

			const script = document.createElement("script");
			script.type = "text/javascript";
			script.src =
				"https://assistant.flyweight.io/chat/index.js?apiKey=b289ef7c-3520-46bb-8312-4c5aaf67b1e0";
			script.setAttribute("data-url-match", "*");
			script.setAttribute("data-display", "BUTTON");
			document.body.appendChild(script);
			flyweightChatScriptLoaded = true;
		}

		// Add global styles
		const injectGlobalStyles = () => {
			if (!document.querySelector('#flyweight-override-styles')) {
				const style = document.createElement('style');
				style.id = 'flyweight-override-styles';
				style.textContent = `
					/* IMPORTANT: These CSS selectors depend on Flyweight's current implementation:
					 * - iframe element with data-testid="chat-overlay"
					 * - iframe element with data-testid="popup-overlay"
					 * - div element with id="chat-popup" for the popup button
					 * - Adds class .flyweight-chat-button-state when chat is minimized (button state)
					 * - Adds class .flyweight-chat-open-state when chat is maximized (open state)
					 * - The popup overlay (iframe[data-testid="popup-overlay"]) is hidden via its style (e.g., [style*="width: 150px"])
					 * If Flyweight changes their HTML structure or attribute names,
					 * these selectors will need to be updated.
					 */
					
					/* Hide the chat popup button */
					#chat-popup {
						display: none !important;
					}
					
					/* Hide the iframe when it's in button state (50x50) */
					iframe[data-testid="chat-overlay"].flyweight-chat-button-state {
						display: none !important;
					}
					
					/* Hide the popup overlay iframe (150x50) */
					iframe[data-testid="popup-overlay"][style*="width: 150px"] {
						display: none !important;
					}
					
					/* When on manual page and chat is open, constrain the iframe */
					body.flyweight-manual-page iframe[data-testid="chat-overlay"].flyweight-chat-open-state {
						top: calc(4.5rem + env(safe-area-inset-top, 0px) - 75px) !important;
						height: calc(100% - (4.5rem + env(safe-area-inset-top, 0px)) - (5rem + env(safe-area-inset-bottom, 0px)) + 75px) !important;
					}
					
					/* Hide chat completely when not on manual page */
					body:not(.flyweight-manual-page) iframe[data-testid="chat-overlay"] {
						display: none !important;
					}
					
					/* Hide popup overlay completely when not on manual page */
					body:not(.flyweight-manual-page) iframe[data-testid="popup-overlay"] {
						display: none !important;
					}
				`;
				document.head.appendChild(style);
			}
		};

		// Setup iframe observer
		const setupIframeObserver = (iframe: HTMLIFrameElement) => {
			console.log("Setting up iframe observer");

			// IMPORTANT: This implementation relies on Flyweight's current iframe behavior:
			// - Button state: Inferred if iframe width is small (e.g., < 100px). Class '.flyweight-chat-button-state' is added.
			// - Chat state: Inferred if iframe width is '100%' or large pixel value. Class '.flyweight-chat-open-state' is added.
			// If Flyweight's method of indicating state via inline styles changes significantly,
			// this logic will need updating. The component now relies on these dynamically added classes.
			// Monitor console logs for warnings about ambiguous states.

			const getStyleProperty = (styleString: string, propertyName: string): string | null => {
				if (!styleString) return null;
				const regex = new RegExp(`${propertyName}\s*:\s*([^;!]+)`);
				const match = styleString.match(regex);
				return match ? match[1].trim() : null;
			};

			const updateChatStateBasedOnStyle = (currentIframe: HTMLIFrameElement) => {
				const style = currentIframe.getAttribute('style') || '';
				const widthStr = getStyleProperty(style, 'width');

				let isButtonState = false;
				let isChatState = false;

				if (widthStr) {
					if (widthStr.endsWith('px')) {
						const pxWidth = Number.parseInt(widthStr, 10);
						if (!Number.isNaN(pxWidth)) {
							if (pxWidth < 100) { // Threshold for button state
								isButtonState = true;
							} else { // Assumed large pixel width is also chat/open state
								isChatState = true;
							}
						}
					} else if (widthStr === '100%') {
						isChatState = true;
					}
				}

				if (!isChatState && !isButtonState) {
					console.warn(`Flyweight chat iframe style width ("${widthStr}") is ambiguous. Defaulting to button state visuals.`);
					isButtonState = true; // Default to button state if unclear
				}

				if (isButtonState) {
					// console.log("Iframe determined to be in button state.");
					if (!currentIframe.classList.contains('flyweight-chat-button-state')) {
						currentIframe.classList.add('flyweight-chat-button-state');
						currentIframe.classList.remove('flyweight-chat-open-state');
					}
					setIsChatVisible(false);
				} else if (isChatState) {
					// console.log("Iframe determined to be in chat state.");
					if (!currentIframe.classList.contains('flyweight-chat-open-state')) {
						currentIframe.classList.add('flyweight-chat-open-state');
						currentIframe.classList.remove('flyweight-chat-button-state');
					}
					setIsChatVisible(true);
				}
			};

			iframeObserver = new MutationObserver((mutations) => {
				for (const mutation of mutations) {
					if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
						updateChatStateBasedOnStyle(iframe);
					}
				};
			});

			iframeObserver.observe(iframe, { attributes: true, attributeFilter: ['style'] });

			// Check initial state
			updateChatStateBasedOnStyle(iframe);
		};

		// Watch for iframes to appear
		const findAndObserveIframes = () => {
			const chatIframe = document.querySelector('iframe[data-testid="chat-overlay"]') as HTMLIFrameElement;
			const popupIframe = document.querySelector('iframe[data-testid="popup-overlay"]') as HTMLIFrameElement;

			let foundAny = false;

			if (chatIframe && !chatIframe.hasAttribute('data-observer-attached')) {
				console.log("Found chat iframe");
				setupIframeObserver(chatIframe);
				chatIframe.setAttribute('data-observer-attached', 'true');
				foundAny = true;
			}

			if (popupIframe && !popupIframe.hasAttribute('data-observer-attached')) {
				console.log("Found popup overlay iframe");
				// For popup overlay, we don't need to observe style changes as it should always be hidden
				popupIframe.setAttribute('data-observer-attached', 'true');
				foundAny = true;
			}

			return foundAny;
		};

		// Initialize styles
		injectGlobalStyles();

		// Update body class based on page state
		createEffect(() => {
			if (isChatOnManualPage()) {
				document.body.classList.add('flyweight-manual-page');
			} else {
				document.body.classList.remove('flyweight-manual-page');
			}
		});

		// Look for iframes
		if (!findAndObserveIframes()) {
			// If not found, observe body for when they're added
			const bodyObserver = new MutationObserver(() => {
				findAndObserveIframes();
			});

			bodyObserver.observe(document.body, {
				childList: true,
				subtree: true
			});

			onCleanup(() => {
				bodyObserver.disconnect();
			});
		}

		// Listen for chat toggle events
		const handleChatToggle = (event: Event) => {
			const customEvent = event as CustomEvent;
			if (typeof customEvent.detail === "boolean") {
				// The iframe observer will handle the actual visibility state
				// This just triggers the Flyweight chat to open/close
			}
		};
		window.addEventListener("flyweightchatopen", handleChatToggle);

		onCleanup(() => {
			window.removeEventListener("flyweightchatopen", handleChatToggle);
			if (iframeObserver) {
				iframeObserver.disconnect();
			}
		});
	});

	return null;
}

// Helper function to open/close chat
export function toggleFlyweightChat(show: boolean) {
	const chatEvent = new CustomEvent("flyweightchatopen", { detail: show });
	window.dispatchEvent(chatEvent);
}