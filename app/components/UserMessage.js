'use client';

// Basic component to display a user's message
export default function UserMessage({ message }) {
  return (
    <div className="flex justify-end">
      <div 
        className="bg-primary-start text-light p-4 rounded-lg max-w-lg shadow-md mr-1" 
        role="log"
        aria-live="off"
      >
        {message}
      </div>
    </div>
  );
} 