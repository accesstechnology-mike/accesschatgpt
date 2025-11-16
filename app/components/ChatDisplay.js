'use client';

import UserMessage from './UserMessage';
import AIMessage from './AIMessage';
import { useEffect, useRef } from 'react';

export default function ChatDisplay({ messages, isLoading, currentTranscript, currentPlaybackPosition, totalAudioDuration }) {
  const endOfMessagesRef = useRef(null);

  // Scroll to the bottom when messages change or when loading starts
  useEffect(() => {
    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      if (endOfMessagesRef.current && endOfMessagesRef.current.isConnected) {
        try {
          endOfMessagesRef.current.scrollIntoView({ behavior: "smooth" });
        } catch (error) {
          // Silently handle scroll errors (element might not be visible yet)
          console.debug('Scroll error:', error);
        }
      }
    });
  }, [messages, isLoading]);

  // If no messages, show welcome text
  if (messages.length === 0 && !isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-light/60">
        <div className="text-center max-w-md">
          <h2 className="text-xl mb-2 mt-20">
            Welcome to <span className="text-[1.25rem] font-medium">access</span>: chatgpt
          </h2>
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
          // Don't render empty assistant messages (they're placeholders)
          if (!message.content || message.content.trim() === '') {
            return null;
          }
          // Only highlight the last assistant message if it matches the transcript
          const isLastMessage = index === messages.length - 1;
          const transcript = isLastMessage ? currentTranscript : '';
          return (
            <AIMessage 
              key={index} 
              message={message.content} 
              transcript={transcript}
              currentPlaybackPosition={isLastMessage ? currentPlaybackPosition : 0}
              totalAudioDuration={isLastMessage ? totalAudioDuration : 0}
              model={message.model}
            />
          );
        }
        return null; // Should not happen with current structure
      })}
      
      {/* Thinking dots indicator - shows where the AI reply will appear */}
      {isLoading && (
        <div className="flex justify-start">
          <div 
            className="bg-light text-dark p-4 rounded-lg max-w-lg shadow-md ml-1 flex items-center gap-2"
            role="status"
            aria-label="AI is thinking"
          >
            <span className="sr-only">AI is thinking</span>
            <span className="thinking-dot" style={{ animationDelay: '0ms' }}></span>
            <span className="thinking-dot" style={{ animationDelay: '150ms' }}></span>
            <span className="thinking-dot" style={{ animationDelay: '300ms' }}></span>
          </div>
        </div>
      )}
      
      {/* Empty div to track the end of messages for scrolling */}
      <div ref={endOfMessagesRef} />
    </div>
  );
} 