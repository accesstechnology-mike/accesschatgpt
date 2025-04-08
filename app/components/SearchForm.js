"use client";

import { useState, useEffect, useRef } from "react";

export default function SearchForm({ onSendMessage, isLoading }) {
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef(null);
  // Track previous loading state to detect changes
  const wasLoading = useRef(isLoading);

  // Focus on initial mount
  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 200);
    return () => clearTimeout(timer);
  }, []);

  // Focus when isLoading changes from true to false (message sent)
  useEffect(() => {
    if (wasLoading.current && !isLoading) {
      // Focus after a slight delay to ensure state updates are complete
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
    wasLoading.current = isLoading;
  }, [isLoading]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) {
      return;
    }
    
    onSendMessage(inputValue.trim());
    setInputValue("");
    
    // Refocus the input after clearing
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  };

  return (
    <form
      onSubmit={handleSubmit}
      role="form"
      aria-label="Chat input form"
      className="relative w-full"
    >
      <input
        ref={inputRef}
        type="text"
        name="prompt"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        placeholder="Type your message here..."
        className="input-primary text-xl h-14 pr-28"
        aria-label="Chat message input"
        disabled={isLoading}
        autoComplete="off"
        role="textbox"
        autoFocus={true}
        // Handle focus loss
        onBlur={() => {
          // Refocus if we're not loading and the component is still mounted
          if (!isLoading) {
            setTimeout(() => inputRef.current?.focus(), 100);
          }
        }}
      />

      <button
        type="submit"
        className="absolute right-2 top-1/2 -translate-y-1/2 btn-primary h-11 w-24"
        aria-label={isLoading ? "Please wait, sending..." : "Send message"}
        disabled={isLoading}
        role="button"
      >
        {isLoading ? "Sending..." : "Send"}
      </button>
    </form>
  );
}
