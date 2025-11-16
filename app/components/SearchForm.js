"use client";

import { useState, useEffect, useRef } from "react";

const MAX_PROMPT_LENGTH = 10000;

export default function SearchForm({ onSendMessage, isLoading, isModalOpen = false }) {
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef(null);
  // Track previous loading state to detect changes
  const wasLoading = useRef(isLoading);
  // Track last submit time to prevent rapid submissions
  const lastSubmitTimeRef = useRef(0);

  // Focus on initial mount (only if modal is not open)
  useEffect(() => {
    if (isModalOpen) return; // Don't focus if modal is open
    const timer = setTimeout(() => {
      if (inputRef.current && inputRef.current.isConnected) {
        try {
          inputRef.current.focus();
        } catch (error) {
          // Silently handle focus errors
          console.debug('Focus error:', error);
        }
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [isModalOpen]);

  // Focus when isLoading changes from true to false (message sent)
  useEffect(() => {
    if (isModalOpen) return; // Don't focus if modal is open
    if (wasLoading.current && !isLoading) {
      // Focus after a slight delay to ensure state updates are complete
      setTimeout(() => {
        if (inputRef.current && inputRef.current.isConnected) {
          try {
            inputRef.current.focus();
          } catch (error) {
            // Silently handle focus errors
            console.debug('Focus error:', error);
          }
        }
      }, 50);
    }
    wasLoading.current = isLoading;
  }, [isLoading, isModalOpen]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) {
      return;
    }
    
    // Prevent rapid submissions (debounce: 100ms minimum between submissions)
    const now = Date.now();
    if (now - lastSubmitTimeRef.current < 100) {
      return;
    }
    lastSubmitTimeRef.current = now;
    
    // Client-side validation
    if (inputValue.length > MAX_PROMPT_LENGTH) {
      return; // Error will be shown via character count
    }
    
    const messageToSend = inputValue.trim();
    setInputValue(""); // Clear input immediately to prevent duplicate sends
    
    onSendMessage(messageToSend);
    
    // Refocus the input after clearing (only if modal is not open)
    if (!isModalOpen) {
      setTimeout(() => {
        if (inputRef.current && inputRef.current.isConnected) {
          try {
            inputRef.current.focus();
          } catch (error) {
            // Silently handle focus errors
            console.debug('Focus error:', error);
          }
        }
      }, 50);
    }
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
        onChange={(e) => {
          const newValue = e.target.value;
          // Enforce max length
          if (newValue.length <= MAX_PROMPT_LENGTH) {
            setInputValue(newValue);
          }
        }}
        placeholder="Type your message here..."
        className="input-primary text-xl h-14 pr-28"
        aria-label="Chat message input"
        disabled={isLoading}
        autoComplete="off"
        role="textbox"
        autoFocus={!isModalOpen}
        maxLength={MAX_PROMPT_LENGTH}
        // Handle focus loss
        onBlur={() => {
          // Refocus if we're not loading, modal is not open, and component is still mounted
          if (!isLoading && !isModalOpen) {
            setTimeout(() => {
              if (inputRef.current && inputRef.current.isConnected) {
                try {
                  inputRef.current.focus();
                } catch (error) {
                  // Silently handle focus errors
                  console.debug('Focus error:', error);
                }
              }
            }, 100);
          }
        }}
      />

      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
        {inputValue.length > 0 && (
          <span className={`text-xs ${inputValue.length > MAX_PROMPT_LENGTH * 0.9 ? 'text-red-400' : 'text-light/40'}`}>
            {inputValue.length}/{MAX_PROMPT_LENGTH}
          </span>
        )}
        <button
          type="submit"
          className="btn-primary h-11 w-24"
          aria-label={isLoading ? "Please wait, sending..." : "Send message"}
          disabled={isLoading || inputValue.length > MAX_PROMPT_LENGTH}
          role="button"
        >
          {isLoading ? "Sending..." : "Send"}
        </button>
      </div>
    </form>
  );
}
