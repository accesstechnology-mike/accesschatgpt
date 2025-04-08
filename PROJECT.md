# Project: Accessible ChatGPT Interface

This project aims to adapt an existing accessible YouTube interface into an accessible interface for interacting with ChatGPT models.

## Plan

1.  **Analyze Existing YouTube Interface:**
    *   Identify the core accessibility features and UI components (e.g., large buttons, screen reader compatibility, keyboard navigation, voice control hooks if any).
    *   Understand the current application flow and state management.
    *   Pinpoint the parts specifically tied to YouTube (API calls, video display, search logic) that will need replacement.

2.  **Design ChatGPT Interaction:**
    *   Define the core user flow for interacting with ChatGPT: inputting prompts, displaying responses, handling potential errors, managing conversation history.
    *   Adapt `SearchForm.js` into a chat input component.
    *   Create a new `ChatDisplay.js` component to manage and render the conversation log.
    *   Create `UserMessage.js` and `AIMessage.js` components for displaying individual messages within `ChatDisplay.js`.
    *   Design how ChatGPT responses will be presented accessibly (e.g., text rendering, potential text-to-speech - TBD). Clear visual/ARIA distinction between user/AI messages.
    *   Determine how conversation history will be stored and navigated. Decision: Use `localStorage` for client-side persistence.

3.  **API Integration:**
    *   Choose how you'll connect to ChatGPT (e.g., OpenAI API, a local model). Decision: Assume OpenAI API for now.
    *   Implement the logic for sending prompts and receiving/parsing responses from the chosen API/model. This will be in a new backend API route: `/api/chat`.
    *   The `/api/chat` route should accept the current user prompt and potentially the recent conversation history to provide context to the LLM.
    *   Handle authentication (API keys, likely via environment variables) and potential API rate limits or costs.

4.  **Refactor & Rebuild:**
    *   Remove YouTube-specific components (`VideoResult.js`) and API calls (`/api/search`, `scrape-youtube` usage in `app/api/search/route.js`). Optionally remove `/api/check-bad-words`.
    *   Remove the dynamic route `app/[...term]/` and its contents (`ClientSearchResults.js`, `page.js`, `layout.js`).
    *   Modify `app/page.js` to use the adapted `SearchForm` (as input) and the new `ChatDisplay` component instead of `ClientSearchResults`.
    *   Implement the new components (`ChatDisplay.js`, `UserMessage.js`, `AIMessage.js`).
    *   Implement the new API route (`app/api/chat/route.js`) to handle communication with the ChatGPT API.
    *   Update state management to handle the conversation history array (messages) using `useState` and `localStorage`.
    *   Ensure accessibility features (ARIA attributes, keyboard navigation for messages) are implemented in the new components. Consider adapting the existing keyboard shortcut pattern for message navigation.

5.  **Testing & Refinement:**
    *   Conduct thorough testing, focusing heavily on the accessibility aspects with various input methods and assistive technologies.
    *   Test the reliability and usability of the ChatGPT interaction.
    *   Gather feedback (ideally from the target user base) and iterate.

## Next Steps

*   Explore the existing codebase structure.
*   Identify key files related to UI, accessibility, and YouTube API interaction. 