'use client';

import UserMessage from './UserMessage';
import AIMessage from './AIMessage';
import { useEffect, useRef } from 'react';

export default function ChatDisplay({ messages }) {
  const endOfMessagesRef = useRef(null);

  // Scroll to the bottom when messages change
  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // If no messages, show welcome text
  if (messages.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-light/60">
        <div className="text-center max-w-md">
          <h2 className="text-xl mb-2">Welcome to AccessGPT</h2>
          <p>Type a message below to start chatting with the AI assistant.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 py-4"> {/* Increased vertical spacing between messages and added padding */}
      {messages.map((message, index) => {
        if (message.role === 'user') {
          return <UserMessage key={index} message={message.content} />;
        } else if (message.role === 'assistant') {
          return <AIMessage key={index} message={message.content} />;
        }
        return null; // Should not happen with current structure
      })}
      {/* Empty div to track the end of messages for scrolling */}
      <div ref={endOfMessagesRef} />
    </div>
  );
} 