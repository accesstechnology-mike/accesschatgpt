'use client';

// Basic component to display an AI's message
export default function AIMessage({ message }) {
  return (
    <div className="flex justify-start">
      <div 
        className="bg-light text-dark p-4 rounded-lg max-w-lg shadow-md ml-1"
        role="log" // Role for chat message
        aria-live="polite" // Announce when AI message appears
      >
        {/* TODO: Add support for markdown rendering? */}
        {message}
      </div>
    </div>
  );
} 