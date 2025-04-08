"use client";

import SearchForm from "./components/SearchForm";
import Image from "next/image";
import ChatDisplay from "./components/ChatDisplay";
import { useState, useEffect, useRef } from 'react';

const LOCAL_STORAGE_KEY = 'chatHistory';
const SPEECH_ENABLED_KEY = 'speechEnabled';

export default function HomePage() {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [isSpeechEnabled, setIsSpeechEnabled] = useState(false);
  const synth = useRef(null);
  const voices = useRef([]);

  // Initialize speech synthesis
  useEffect(() => {
    if (typeof window !== 'undefined') {
      synth.current = window.speechSynthesis;
      
      // Load speech preference from localStorage
      const savedSpeechPreference = localStorage.getItem(SPEECH_ENABLED_KEY);
      if (savedSpeechPreference !== null) {
        setIsSpeechEnabled(savedSpeechPreference === 'true');
      }

      // Function to populate voices
      const populateVoices = () => {
        voices.current = synth.current.getVoices();
      };

      // Get voices on load
      populateVoices();
      
      // Chrome loads voices asynchronously, so listen for the event
      if (synth.current.onvoiceschanged !== undefined) {
        synth.current.onvoiceschanged = populateVoices;
      }
    }
  }, []);

  // Save speech preference when it changes
  useEffect(() => {
    if (isMounted) {
      localStorage.setItem(SPEECH_ENABLED_KEY, isSpeechEnabled.toString());
    }
  }, [isSpeechEnabled, isMounted]);

  useEffect(() => {
    setIsMounted(true);
    try {
      const savedMessages = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (savedMessages) {
        const parsedMessages = JSON.parse(savedMessages);
        if (Array.isArray(parsedMessages)) {
          setMessages(parsedMessages);
        }
      }
    } catch (error) {
      console.error("Failed to load messages from localStorage:", error);
    }
  }, []);

  useEffect(() => {
    if (isMounted && messages.length > 0) {
      try {
        const messagesString = JSON.stringify(messages);
        localStorage.setItem(LOCAL_STORAGE_KEY, messagesString);
      } catch (error) {
        console.error("Failed to save messages to localStorage:", error);
      }
    } else if (isMounted && messages.length === 0) {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
  }, [messages, isMounted]);

  // Function to clear all messages
  const handleClearChat = () => {
    setMessages([]);
    // Stop any ongoing speech when clearing chat
    if (synth.current) {
      synth.current.cancel();
    }
  };

  // Function to toggle speech
  const toggleSpeech = () => {
    // Cancel any ongoing speech when toggling off
    if (isSpeechEnabled && synth.current) {
      synth.current.cancel();
    }
    setIsSpeechEnabled(!isSpeechEnabled);
  };

  // Function to speak text with a British accent
  const speakText = (text) => {
    if (!isSpeechEnabled || !synth.current) return;
    
    // Cancel any ongoing speech
    synth.current.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Try to find a British English voice
    let britishVoice = null;
    
    // Look for British English voices (en-GB)
    for (let voice of voices.current) {
      if (voice.lang === 'en-GB') {
        britishVoice = voice;
        // Prefer a female voice if possible
        if (!voice.name.includes('Male')) {
          break;
        }
      }
    }
    
    // If no British voice found, try to find any English voice
    if (!britishVoice) {
      for (let voice of voices.current) {
        if (voice.lang.startsWith('en')) {
          britishVoice = voice;
          break;
        }
      }
    }
    
    // Set the voice if one was found
    if (britishVoice) {
      utterance.voice = britishVoice;
    }
    
    // Set other properties
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    
    // Speak the text
    synth.current.speak(utterance);
  };

  const handleSendMessage = async (prompt) => {
    if (!prompt.trim()) return;

    const newUserMessage = { role: 'user', content: prompt };
    const updatedMessages = [...messages, newUserMessage];
    setMessages(updatedMessages);
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          prompt: prompt, 
          history: updatedMessages.slice(-5, -1) 
        }), 
      });

      if (!response.ok) {
        throw new Error('API request failed');
      }

      const data = await response.json();
      const aiMessage = { role: 'assistant', content: data.response };
      setMessages([...updatedMessages, aiMessage]);
      
      // Speak the AI response if speech is enabled
      if (isSpeechEnabled) {
        speakText(data.response);
      }

    } catch (error) {
      console.error("Failed to send message:", error);
      const errorMessage = { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' };
      setMessages([...updatedMessages, errorMessage]);
      
      // Speak the error message if speech is enabled
      if (isSpeechEnabled) {
        speakText(errorMessage.content);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-[var(--visual-viewport-height, 100vh)] bg-dark relative">
      <div className="container mx-auto max-w-4xl h-full relative">
        
        <div className="fixed top-0 left-0 right-0 z-10 bg-dark/90 backdrop-blur-md">
          <div className="container mx-auto max-w-4xl border-b border-light/10">
            <div className="flex items-center justify-between py-3 px-4">
              <div className="flex-1"> {/* Left side - Clear Chat button */}
                {messages.length > 0 && (
                  <button
                    onClick={handleClearChat}
                    className="text-light/60 hover:text-light text-sm px-3 py-1 rounded border border-light/20 hover:border-light/40 transition-colors"
                    aria-label="Clear chat history"
                  >
                    Clear Chat
                  </button>
                )}
              </div>
              
              <div className="flex-1 text-center"> {/* Center - logo */}
                <Image
                  src="/img/logo.png"
                  alt="access:chatgpt logo"
                  width={130}
                  height={45}
                  priority
                  className="opacity-90 mx-auto"
                />
              </div>
              
              <div className="flex-1 flex justify-end"> {/* Right side - Speech toggle */}
                <button
                  onClick={toggleSpeech}
                  className={`flex items-center gap-2 text-sm px-3 py-1 rounded border transition-colors ${
                    isSpeechEnabled 
                      ? 'bg-primary-start/20 border-primary-start text-light' 
                      : 'border-light/20 text-light/60 hover:text-light hover:border-light/40'
                  }`}
                  aria-label={isSpeechEnabled ? "Turn speech off" : "Turn speech on"}
                  aria-pressed={isSpeechEnabled}
                >
                  <span className="sr-only">{isSpeechEnabled ? "Disable" : "Enable"} speech</span>
                  {isSpeechEnabled ? "Speech: On" : "Speech: Off"}
                </button>
              </div>
            </div>
          </div>
        </div>
        
        <div className="pt-16 pb-24 h-full overflow-y-auto px-4">
          <ChatDisplay messages={messages} />
        </div>
        
        <div className="fixed bottom-0 left-0 right-0 z-10 bg-dark/90 backdrop-blur-md">
          <div className="container mx-auto max-w-4xl border-t border-light/10">
            <div className="p-4">
              <SearchForm 
                onSendMessage={handleSendMessage} 
                isLoading={isLoading} 
              />
            </div>
          </div>
        </div>
        
      </div>
    </div>
  );
}
