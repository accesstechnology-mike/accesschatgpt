"use client";

import SearchForm from "./components/SearchForm";
import Image from "next/image";
import ChatDisplay from "./components/ChatDisplay";
import SubscriptionModal from "./components/SubscriptionModal";
import UserManagementModal from "./components/UserManagementModal";
import { useState, useEffect, useRef } from 'react';
import { OpenAIRealtimeWebSocket } from 'openai/realtime/websocket';
import { getTextOnlyPrompt, getVoicePrompt } from '@/lib/prompts';

const LOCAL_STORAGE_KEY = 'chatHistory';
const SPEECH_ENABLED_KEY = 'speechEnabled';

// Configuration constants (matching server-side limits)
const MAX_HISTORY_MESSAGES = 20;
const MAX_HISTORY_TOKENS = 10000;
const MAX_PROMPT_LENGTH = 10000;
const API_TIMEOUT_MS = 30000;
const TOKEN_TIMEOUT_MS = 10000;

// Rough estimate: ~4 characters per token
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

// Truncate history to keep last N messages OR last M tokens (whichever is smaller)
function truncateHistory(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return [];
  }

  // First, limit by message count
  let truncated = messages.slice(-MAX_HISTORY_MESSAGES);
  
  // Then, limit by token count (count tokens from oldest to newest)
  let totalTokens = 0;
  const result = [];
  
  for (let i = truncated.length - 1; i >= 0; i--) {
    const msg = truncated[i];
    const msgTokens = estimateTokens(msg.content || '');
    
    if (totalTokens + msgTokens > MAX_HISTORY_TOKENS) {
      break;
    }
    
    result.unshift(msg);
    totalTokens += msgTokens;
  }
  
  return result;
}

export default function HomePage() {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [isSpeechEnabled, setIsSpeechEnabled] = useState(false);
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [currentPlaybackPosition, setCurrentPlaybackPosition] = useState(0);
  const [totalAudioDuration, setTotalAudioDuration] = useState(0);
  const realtimeRef = useRef(null);
  const audioContextRef = useRef(null);
  const nextAudioStartTimeRef = useRef(0);
  const tokenExpiryRef = useRef(null);
  const sessionReadyRef = useRef(false);
  const audioStartTimeRef = useRef(null);
  const totalAudioPlayedRef = useRef(0);
  const totalAudioDurationRef = useRef(0);
  const lastPlaybackPositionRef = useRef(0);
  const currentResponseTextRef = useRef('');
  const currentResponseIdRef = useRef(null);
  const currentAssistantMessageIndexRef = useRef(null);
  const currentAssistantItemIdRef = useRef(null);
  // Map response IDs to message indices to prevent race conditions
  const responseIdToMessageIndexRef = useRef(new Map());
  const realtimeSyncedMessageCountRef = useRef(0); // Track how many messages have been synced to Realtime
  const localStorageDebounceTimerRef = useRef(null); // For debouncing localStorage writes
  const reconnectAttemptsRef = useRef(0); // Track reconnection attempts
  const reconnectTimerRef = useRef(null); // Timer for reconnection
  const maxReconnectAttempts = 5; // Maximum reconnection attempts
  const [connectionStatus, setConnectionStatus] = useState('disconnected'); // 'connected', 'disconnected', 'reconnecting'
  const tokenRequestInProgressRef = useRef(null); // Track ongoing token request to prevent duplicates
  const waitingForTranscriptRef = useRef(false); // Flag to prevent early handlers from updating message content
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [showUserManagementModal, setShowUserManagementModal] = useState(false);
  const [user, setUser] = useState(null);

  // Load speech preference from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedSpeechPreference = localStorage.getItem(SPEECH_ENABLED_KEY);
      if (savedSpeechPreference !== null) {
        setIsSpeechEnabled(savedSpeechPreference === 'true');
      }
    }
  }, []);

  // Check user authentication status using Better Auth
  useEffect(() => {
    const checkUser = async () => {
      try {
        const { authClient } = await import('@/lib/auth-client');
        const session = await authClient.getSession();
        if (session?.data?.user) {
          setUser(session.data.user);
          
          // If user just returned from OAuth and was trying to subscribe, show subscription modal
          if (typeof window !== 'undefined') {
            const pendingSubscription = sessionStorage.getItem('pendingSubscription');
            if (pendingSubscription === 'true') {
              sessionStorage.removeItem('pendingSubscription');
              // Check if user is on free tier (not subscribed)
              const userTier = session.data.user.subscriptionTier || 'free';
              const userStatus = session.data.user.subscriptionStatus || 'free';
              if (userTier === 'free' || userStatus !== 'active') {
                setShowSubscriptionModal(true);
              }
            }
          }
        }
      } catch (error) {
        // Not authenticated, that's fine
      }
    };
    checkUser();
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
      // If quota exceeded, try to clear and reload
      if (error.name === 'QuotaExceededError' || error.code === 22) {
        try {
          localStorage.removeItem(LOCAL_STORAGE_KEY);
        } catch (clearError) {
          console.error("Failed to clear localStorage:", clearError);
        }
      }
    }
  }, []);

  useEffect(() => {
    // Clear any pending debounce timer
    if (localStorageDebounceTimerRef.current) {
      clearTimeout(localStorageDebounceTimerRef.current);
    }

    if (isMounted && messages.length > 0) {
      // Debounce localStorage writes (500ms delay)
      localStorageDebounceTimerRef.current = setTimeout(() => {
        try {
          const messagesString = JSON.stringify(messages);
          localStorage.setItem(LOCAL_STORAGE_KEY, messagesString);
        } catch (error) {
          console.error("Failed to save messages to localStorage:", error);
          
          // Handle quota exceeded error
          if (error.name === 'QuotaExceededError' || error.code === 22) {
            // Try to automatically clean up by removing oldest messages
            try {
              // Keep only the last 10 messages to free up space
              const reducedMessages = messages.slice(-10);
              const reducedString = JSON.stringify(reducedMessages);
              localStorage.setItem(LOCAL_STORAGE_KEY, reducedString);
              setMessages(reducedMessages);
              
              // Show user-friendly message
              const errorMessage = { 
                role: 'assistant', 
                content: 'Chat history is too long. I\'ve cleared older messages to free up space. Your recent messages are still here.',
                model: 'system'
              };
              setMessages(prev => [...prev, errorMessage]);
            } catch (cleanupError) {
              // If cleanup also fails, clear everything and show message
              console.error("Failed to cleanup localStorage:", cleanupError);
              try {
                localStorage.removeItem(LOCAL_STORAGE_KEY);
                setMessages([]);
                const errorMessage = { 
                  role: 'assistant', 
                  content: 'Chat history is too long and couldn\'t be saved. Please clear your chat history manually.',
                  model: 'system'
                };
                setMessages([errorMessage]);
              } catch (finalError) {
                console.error("Failed to clear localStorage:", finalError);
              }
            }
          }
        }
      }, 500); // 500ms debounce
    } else if (isMounted && messages.length === 0) {
      // Clear immediately when messages are empty (no debounce needed)
      try {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
      } catch (error) {
        console.error("Failed to remove from localStorage:", error);
      }
    }

    // Cleanup function
    return () => {
      if (localStorageDebounceTimerRef.current) {
        clearTimeout(localStorageDebounceTimerRef.current);
      }
    };
  }, [messages, isMounted]);

  useEffect(() => {
    totalAudioDurationRef.current = totalAudioDuration;
  }, [totalAudioDuration]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    let rafId;

    const updatePlayback = () => {
      if (
        audioContextRef.current &&
        audioStartTimeRef.current !== null &&
        totalAudioDurationRef.current > 0
      ) {
        const contextTime = audioContextRef.current.currentTime;
        const elapsed = Math.max(0, contextTime - audioStartTimeRef.current);
        const clamped = Math.min(elapsed, totalAudioDurationRef.current);

        if (clamped !== lastPlaybackPositionRef.current) {
          lastPlaybackPositionRef.current = clamped;
          setCurrentPlaybackPosition(clamped);
        }
      } else if (lastPlaybackPositionRef.current !== 0) {
        lastPlaybackPositionRef.current = 0;
        setCurrentPlaybackPosition(0);
      }

      rafId = requestAnimationFrame(updatePlayback);
    };

    rafId = requestAnimationFrame(updatePlayback);

    return () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
    };
  }, []);

  // Initialize Realtime API connection
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // AudioContext will be created lazily when speech is enabled
    // This prevents unnecessary local network permission prompts

    return () => {
      // Cleanup on unmount
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (realtimeRef.current) {
        realtimeRef.current.close();
        realtimeRef.current = null;
        realtimeSyncedMessageCountRef.current = 0; // Reset sync count when connection closes
      }
      reconnectAttemptsRef.current = 0;
      setConnectionStatus('disconnected');
    };
  }, []);

  // Function to initialize Realtime connection
  const initializeRealtime = async (speechEnabledOverride = null) => {
    // Reuse existing connection if token is still valid (within 2 minutes of expiry)
    if (realtimeRef.current && tokenExpiryRef.current && 
        tokenExpiryRef.current > new Date(Date.now() + 120000)) {
      return realtimeRef.current;
    }
    
    // If initialization is already in progress, wait for it instead of making duplicate requests
    if (tokenRequestInProgressRef.current) {
      try {
        const existingConnection = await tokenRequestInProgressRef.current;
        if (existingConnection) {
          return existingConnection;
        }
      } catch (error) {
        // If the in-progress request failed, continue to make a new one
        console.warn('Previous initialization failed, retrying:', error);
        tokenRequestInProgressRef.current = null;
      }
    }
    
    // Reset sync count when creating a new connection
    realtimeSyncedMessageCountRef.current = 0;

    // Create a promise for the entire initialization to prevent duplicates
    const initializationPromise = (async () => {
      try {
        // Get ephemeral session token from server (keeps API key secure)
        const tokenController = new AbortController();
        const tokenTimeoutId = setTimeout(() => tokenController.abort(), TOKEN_TIMEOUT_MS);
        
        const tokenResponse = await fetch('/api/realtime-token', {
          method: 'POST',
          signal: tokenController.signal,
        });
        
        clearTimeout(tokenTimeoutId);

        if (!tokenResponse.ok) {
          if (tokenResponse.status === 408) {
            throw new Error('Token request timed out. Please try again.');
          } else if (tokenResponse.status === 429) {
            // Check if it's a daily limit
            const errorData = await tokenResponse.json().catch(() => ({}));
            if (errorData.limitReached) {
              setShowSubscriptionModal(true);
              throw new Error('Daily limit reached. Please subscribe for unlimited access.');
            }
            // Rate limited - extract retry-after and throw error
            const retryAfter = tokenResponse.headers.get('Retry-After') || '60';
            throw new Error(`Rate limit exceeded. Please wait ${retryAfter} seconds before trying again.`);
          }
          throw new Error('Failed to get session token');
        }

        const { token, expires_at } = await tokenResponse.json();

        // Store token expiry time
        tokenExpiryRef.current = expires_at ? new Date(expires_at) : null;

        // Log token info (without exposing full token)
        console.log('Token received:', {
          prefix: token?.substring(0, 10) + '...',
          length: token?.length,
          expires_at: expires_at,
        });

        // Create Realtime connection with ephemeral token
        // Ephemeral tokens start with 'ek_' which automatically enables browser usage
        const rt = new OpenAIRealtimeWebSocket(
        {
          model: 'gpt-realtime',
          dangerouslyAllowBrowser: true, // Required for browser usage
        },
        {
          apiKey: token, // Ephemeral token (starts with 'ek_')
          baseURL: 'https://api.openai.com/v1', // Use v1 base path so websocket resolves /v1/realtime
        }
      );

      // Log WebSocket URL (without exposing token)
      console.log('WebSocket URL:', rt.url.toString().replace(/ek_[^&]+/, 'ek_[REDACTED]'));

      // Configure session for text-to-speech with British English
      const sessionReadyPromise = new Promise((resolve) => {
        rt.socket.addEventListener('open', () => {
          setConnectionStatus('connected');
          reconnectAttemptsRef.current = 0; // Reset on successful connection
          if (audioContextRef.current) {
            nextAudioStartTimeRef.current = audioContextRef.current.currentTime;
          }
          
          // Configure modalities based on speech preference (use override if provided, otherwise current state)
          const speechEnabled = speechEnabledOverride !== null ? speechEnabledOverride : isSpeechEnabled;
          const modalities = speechEnabled ? ['text', 'audio'] : ['text'];
          
          // Build instructions based on voice capabilities
          const instructions = speechEnabled ? getVoicePrompt() : getTextOnlyPrompt();
          
          const sessionConfig = {
            type: 'realtime',
            instructions: instructions,
            modalities: modalities,
            turn_detection: {
              type: 'server_vad',
            },
          };
          
          // Only add audio config if speech is enabled
          if (speechEnabled) {
            sessionConfig.audio = {
              output: {
                voice: 'alloy', // Try 'sage' or 'shimmer' for potentially more British-sounding voices
                format: {
                  type: 'audio/pcm',
                  rate: 24000,
                },
              },
            };
            sessionConfig.voice = 'alloy'; // Also set at session level
          }
          
          rt.send({
            type: 'session.update',
            session: sessionConfig,
          });
          
          // Wait a bit for session.update to be processed, then resolve
          setTimeout(() => {
            sessionReadyRef.current = true;
            resolve();
          }, 200);
        });

        // Also listen for session.created event (if it fires)
        rt.on('session.created', () => {
          if (audioContextRef.current) {
            nextAudioStartTimeRef.current = audioContextRef.current.currentTime;
          }
          if (!sessionReadyRef.current) {
            sessionReadyRef.current = true;
            resolve();
          }
        });
      });
      
      // Store promise for use in speakText
      rt._sessionReadyPromise = sessionReadyPromise;

      // Handle audio chunks - play immediately as they arrive (fastest playback)
      rt.on('response.output_audio.delta', async (event) => {
        try {
          // Lazy initialize AudioContext only when actually needed for audio playback
          // This prevents local network permission prompts
          if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
            audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
            nextAudioStartTimeRef.current = audioContextRef.current.currentTime;
            
            // Listen for state changes - clear audio if suspended
            audioContextRef.current.addEventListener('statechange', () => {
              if (audioContextRef.current?.state === 'suspended') {
                setCurrentTranscript('');
                setCurrentPlaybackPosition(0);
                lastPlaybackPositionRef.current = 0;
                setTotalAudioDuration(0);
                totalAudioDurationRef.current = 0;
                audioStartTimeRef.current = null;
                totalAudioPlayedRef.current = 0;
              }
            });
          }
          
          if (audioContextRef.current.state === 'closed') {
            console.warn('AudioContext closed, skipping audio chunk');
            return;
          }

          // Decode base64 PCM16 audio chunk
          const base64Audio = event.delta;
          if (!base64Audio) {
            console.warn('Empty audio delta received');
            return;
          }

          const binaryString = atob(base64Audio);
          const audioData = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            audioData[i] = binaryString.charCodeAt(i);
          }
          
          // Realtime API uses 24kHz sample rate
          const sampleRate = 24000;
          const numSamples = audioData.length / 2; // 16-bit = 2 bytes per sample
          
          if (numSamples <= 0) {
            console.warn('Invalid audio data length');
            return;
          }
          
          const context = audioContextRef.current;
          
          // Create AudioBuffer with correct sample rate
          const buffer = context.createBuffer(1, numSamples, sampleRate);
          const channelData = buffer.getChannelData(0);
          const dataView = new DataView(audioData.buffer);
          
          // Convert PCM16 (signed 16-bit little-endian) to float32 (-1.0 to 1.0)
          for (let i = 0; i < numSamples; i++) {
            const int16 = dataView.getInt16(i * 2, true); // little-endian
            channelData[i] = int16 / 32768.0;
          }

          if (buffer.duration === 0) {
            console.warn('Buffer duration was zero, skipping chunk');
            return;
          }

          // Track audio chunk timing for correlation with transcript
          const chunkStart = audioChunkStartTime;
          const chunkEnd = audioChunkStartTime + buffer.duration;
          audioChunkTimingsRef.current.push({
            buffer,
            duration: buffer.duration,
            startTime: chunkStart,
            endTime: chunkEnd
          });
          audioChunkStartTime = chunkEnd;
          
          // Queue audio chunks until transcript is ready
          if (!transcriptReadyRef.current) {
            audioQueueRef.current.push({ buffer, duration: buffer.duration });
            // Update total duration for tracking
            setTotalAudioDuration(prev => prev + buffer.duration);
            return; // Don't play yet
          }
          
          // Transcript is ready - play audio with delay
          const source = context.createBufferSource();
          source.buffer = buffer;
          source.connect(context.destination);
          
          // Track this source so we can stop it if needed
          activeAudioSources.push(source);

          const scheduledStart = audioStartTimeRef.current + totalAudioPlayedRef.current;
          source.start(scheduledStart);
          nextAudioStartTimeRef.current = scheduledStart + buffer.duration;

          // Update total audio duration
          setTotalAudioDuration(prev => prev + buffer.duration);

          source.onended = () => {
            // Remove from active sources when done
            const index = activeAudioSources.indexOf(source);
            if (index > -1) {
              activeAudioSources.splice(index, 1);
            }
            // Track actual playback completion
            if (audioStartTimeRef.current !== null) {
              const elapsed = context.currentTime - audioStartTimeRef.current;
              const clampedElapsed = Math.min(Math.max(elapsed, 0), totalAudioDurationRef.current);
              totalAudioPlayedRef.current = elapsed;
              lastPlaybackPositionRef.current = clampedElapsed;
              setCurrentPlaybackPosition(clampedElapsed);
            }
            if (context && nextAudioStartTimeRef.current < context.currentTime) {
              nextAudioStartTimeRef.current = context.currentTime;
            }
          };
        } catch (error) {
          console.error('Error playing audio chunk:', error);
        }
      });

      // Flag to track if transcript is ready (so we can delay audio)
      const transcriptReadyRef = { current: false };
      // Queue audio chunks until transcript is ready
      const audioQueueRef = { current: [] };
      // Track audio chunks with their timing to correlate with transcript
      const audioChunkTimingsRef = { current: [] };
      // Track active audio sources so we can stop them when needed
      const activeAudioSources = [];
      // Use component-level waitingForTranscriptRef (defined at component level)
      let audioChunkStartTime = 0;
      
      // Store refs on the realtime connection so we can access them from handleStopSpeech
      rt._audioQueueRef = audioQueueRef;
      rt._audioChunkTimingsRef = audioChunkTimingsRef;
      rt._transcriptReadyRef = transcriptReadyRef;
      rt._activeAudioSources = activeAudioSources;
      
      rt.on('response.created', (event) => {
        console.log('response.created event:', event);
        rt._hasActiveResponse = true;
        setIsLoading(true); // Start loading indicator
        setCurrentTranscript(''); // Reset transcript for new response
        totalAudioPlayedRef.current = 0;
        setTotalAudioDuration(0);
        audioStartTimeRef.current = null;
        setCurrentPlaybackPosition(0);
        lastPlaybackPositionRef.current = 0;
        // Reset response text accumulator - CRITICAL: clear old text from previous response
        currentResponseTextRef.current = '';
        const responseId = event?.response?.id || event?.id || null;
        currentResponseIdRef.current = responseId;
        currentAssistantItemIdRef.current = null;
        
        // Reset transcript ready flag and audio queue
        transcriptReadyRef.current = false;
        waitingForTranscriptRef.current = true; // Set flag to prevent early handlers from updating
        audioQueueRef.current = [];
        audioChunkTimingsRef.current = [];
        audioChunkStartTime = 0;
        // Stop and clear any active audio sources from previous response
        if (activeAudioSources.length > 0) {
          activeAudioSources.forEach(source => {
            try {
              source.stop();
              source.disconnect();
            } catch (e) {
              // Source may have already finished - ignore errors
            }
          });
          activeAudioSources.length = 0;
        }
        
        // IMPORTANT: Capture the message index at this moment and store it with the response ID
        // This prevents race conditions where the ref gets overwritten by a new message
        let messageIndex = currentAssistantMessageIndexRef.current;
        
        // If no index was set (shouldn't happen), find or create the message
        if (messageIndex == null) {
          setMessages(prev => {
            const newMessages = [...prev];
            const lastMessage = newMessages[newMessages.length - 1];
            
            // If last message is already an empty assistant message, reuse it
            if (lastMessage && lastMessage.role === 'assistant' && 
                (!lastMessage.content || lastMessage.content.trim() === '')) {
              messageIndex = newMessages.length - 1;
              currentAssistantMessageIndexRef.current = messageIndex;
              return newMessages;
            }
            
            // Otherwise, create a new one
            newMessages.push({ role: 'assistant', content: '', model: 'realtime' });
            messageIndex = newMessages.length - 1;
            currentAssistantMessageIndexRef.current = messageIndex;
            return newMessages;
          });
        } else {
          // Clear the content of the existing placeholder message to ensure fresh start
          // Also verify the message is actually a Realtime message (not GPT-5.1)
          setMessages(prev => {
            const index = messageIndex;
            if (index != null && index >= 0 && index < prev.length) {
              const newMessages = [...prev];
              const existingMessage = newMessages[index];
              
              // Only update if it's a Realtime message (or empty/assistant)
              if (existingMessage && existingMessage.role === 'assistant') {
                // If it's a GPT-5.1 message, we shouldn't be updating it - this is an error
                // But we'll clear it anyway to prevent showing old content
                newMessages[index] = {
                  role: 'assistant',
                  content: '', // Clear any old content
                  model: 'realtime' // Ensure it's marked as Realtime
                };
                return newMessages;
              }
            }
            return prev;
          });
        }
        
        // Store the mapping of response ID to message index to prevent race conditions
        if (responseId && messageIndex != null) {
          responseIdToMessageIndexRef.current.set(responseId, messageIndex);
          console.log(`Stored response ${responseId} -> message index ${messageIndex}`);
        }
        
        if (audioContextRef.current) {
          const context = audioContextRef.current;
          nextAudioStartTimeRef.current = Math.max(nextAudioStartTimeRef.current, context.currentTime);
        }
      });
      
      // Listen to the raw socket messages to see what's actually coming through
      rt.socket.addEventListener('message', (event) => {
        try {
          const data = JSON.parse(event.data);
          // Log conversation item events in detail
          if (data.type === 'conversation.item.added' && data.item?.role === 'assistant') {
            console.log('Assistant conversation.item.added DETAIL:', JSON.stringify(data, null, 2));
          }
          if (data.type === 'conversation.item.updated' && data.item?.role === 'assistant') {
            console.log('Assistant conversation.item.updated DETAIL:', JSON.stringify(data, null, 2));
          }
        } catch (e) {
          console.log('Raw WebSocket message (non-JSON):', event.data);
        }
      });
      
      // Handle conversation item updates - text comes through here!
      rt.on('conversation.item.added', (event) => {
        if (event.item?.type === 'message' && event.item.role === 'assistant') {
          console.log('conversation.item.added assistant:', JSON.stringify(event.item, null, 2));
          // Don't update message content if we're waiting for transcript (prevents showing old messages)
          if (waitingForTranscriptRef.current) {
            console.log('Skipping conversation.item.added update - waiting for transcript');
            // Still accumulate text for transcript, just don't update UI
            const contentArray = event.item.content || [];
            let fullText = '';
            for (const content of contentArray) {
              if (content.type === 'text' && content.text) {
                fullText += content.text;
              } else if (content.type === 'output_text' && content.text) {
                fullText += content.text;
              }
            }
            if (fullText && (!currentResponseTextRef.current || currentResponseTextRef.current.trim() === '')) {
              currentResponseTextRef.current = fullText;
            }
            return;
          }
          // Don't filter by response_id - just update the current message
          if (event.item?.id) {
            currentAssistantItemIdRef.current = event.item.id;
          }
          // Extract text from content array
          const contentArray = event.item.content || [];
          let fullText = '';
          for (const content of contentArray) {
            if (content.type === 'text' && content.text) {
              fullText += content.text;
            } else if (content.type === 'output_text' && content.text) {
              fullText += content.text;
            }
          }
          if (fullText) {
            // Only update if we don't already have text (to prevent overwriting accumulated transcript)
            if (!currentResponseTextRef.current || currentResponseTextRef.current.trim() === '') {
              currentResponseTextRef.current = fullText;
              console.log('Found text in conversation.item.added:', fullText);
              setMessages(prev => {
                let index = currentAssistantMessageIndexRef.current;
                // Fallback: if index not set, use last assistant message
                if (index == null || index < 0 || index >= prev.length) {
                  const lastIndex = prev.length - 1;
                  if (lastIndex >= 0 && prev[lastIndex]?.role === 'assistant') {
                    index = lastIndex;
                  } else {
                    return prev;
                  }
                }
                const currentMessage = prev[index];
                if (!currentMessage || currentMessage.role !== 'assistant') {
                  return prev;
                }
                // Only update if message is empty
                if (!currentMessage.content || currentMessage.content.trim() === '') {
                  const newMessages = [...prev];
                  newMessages[index] = {
                    ...currentMessage,
                    content: fullText,
                    model: 'realtime'
                  };
                  return newMessages;
                }
                return prev;
              });
            }
          }
        }
      });
      
      rt.on('conversation.item.updated', (event) => {
        if (event.item?.type === 'message' && event.item.role === 'assistant') {
          console.log('conversation.item.updated assistant:', JSON.stringify(event.item, null, 2));
          // Don't update message content if we're waiting for transcript (prevents showing old messages)
          if (waitingForTranscriptRef.current) {
            console.log('Skipping conversation.item.updated update - waiting for transcript');
            // Still accumulate text for transcript, just don't update UI
            const contentArray = event.item.content || [];
            let fullText = '';
            for (const content of contentArray) {
              if (content.type === 'text' && content.text) {
                fullText += content.text;
              } else if (content.type === 'output_text' && content.text) {
                fullText += content.text;
              }
            }
            if (fullText && (!currentResponseTextRef.current || currentResponseTextRef.current.trim() === '')) {
              currentResponseTextRef.current = fullText;
            }
            return;
          }
          // Don't filter by response_id - just update the current message
          if (event.item?.id) {
            currentAssistantItemIdRef.current = event.item.id;
          }
          // Extract text from content array
          const contentArray = event.item.content || [];
          let fullText = '';
          for (const content of contentArray) {
            if (content.type === 'text' && content.text) {
              fullText += content.text;
            } else if (content.type === 'output_text' && content.text) {
              fullText += content.text;
            }
          }
          if (fullText) {
            // Only update if we don't already have accumulated text (to prevent overwriting transcript)
            // The transcript events should be the source of truth for the final text
            if (!currentResponseTextRef.current || currentResponseTextRef.current.trim() === '') {
              currentResponseTextRef.current = fullText;
              console.log('Found text in conversation.item.updated:', fullText);
              setMessages(prev => {
                const index = currentAssistantMessageIndexRef.current;
                if (index == null || index < 0 || index >= prev.length) {
                  return prev;
                }
                const currentMessage = prev[index];
                if (!currentMessage || currentMessage.role !== 'assistant') {
                  return prev;
                }
                // Only update if message is empty
                if (!currentMessage.content || currentMessage.content.trim() === '') {
                  const newMessages = [...prev];
                  newMessages[index] = {
                    ...currentMessage,
                    content: fullText,
                    model: 'realtime'
                  };
                  return newMessages;
                }
                return prev;
              });
            }
          }
        }
      });
      
      // Handle content_part.added - text comes through here!
      rt.on('response.content_part.added', (event) => {
        console.log('response.content_part.added:', JSON.stringify(event, null, 2));
        if (event.part?.type === 'text' && event.part.text) {
          // Don't update message content if we're waiting for transcript (prevents showing old messages)
          if (waitingForTranscriptRef.current) {
            console.log('Skipping response.content_part.added update - waiting for transcript');
            // Still accumulate text for transcript, just don't update UI
            if (!currentResponseTextRef.current || currentResponseTextRef.current.trim() === '') {
              currentResponseTextRef.current = event.part.text;
            }
            return;
          }
          // Don't filter by response_id - just update the current message
          // Only set if empty (transcript events should be the source of truth)
          if (!currentResponseTextRef.current || currentResponseTextRef.current.trim() === '') {
            currentResponseTextRef.current = event.part.text;
            console.log('Found text in content_part:', event.part.text);
            setMessages(prev => {
              let index = currentAssistantMessageIndexRef.current;
              // Fallback: if index not set, use last assistant message
              if (index == null || index < 0 || index >= prev.length) {
                const lastIndex = prev.length - 1;
                if (lastIndex >= 0 && prev[lastIndex]?.role === 'assistant') {
                  index = lastIndex;
                } else {
                  return prev;
                }
              }
              const currentMessage = prev[index];
              if (!currentMessage || currentMessage.role !== 'assistant') {
                return prev;
              }
              // Only update if message is empty
              if (!currentMessage.content || currentMessage.content.trim() === '') {
                const newMessages = [...prev];
                newMessages[index] = {
                  ...currentMessage,
                  content: currentResponseTextRef.current,
                  model: 'realtime'
                };
                return newMessages;
              }
              return prev;
            });
          }
        }
      });
      
      // Also handle content_part.delta for streaming text
      rt.on('response.content_part.delta', (event) => {
        console.log('response.content_part.delta:', JSON.stringify(event, null, 2));
        if (event.part?.type === 'text' && event.part.delta) {
          // Accumulate text but don't update UI (will update on response.done or transcript.done)
          currentResponseTextRef.current += event.part.delta;
        }
      });

      // Track text output for display - accumulate but don't update UI until complete
      // According to openai-realtime-agents repo, it's response.text.delta
      rt.on('response.text.delta', (event) => {
        console.log('response.text.delta event:', event);
        if (event.delta) {
          // Accumulate text but don't update UI (will update on response.done or transcript.done)
          currentResponseTextRef.current += event.delta;
          console.log('Accumulated text:', currentResponseTextRef.current);
        }
      });
      
      // Also listen for response.output_text.delta as fallback
      rt.on('response.output_text.delta', (event) => {
        console.log('response.output_text.delta event:', event);
        if (event.delta) {
          // Accumulate text but don't update UI (will update on response.done or transcript.done)
          currentResponseTextRef.current += event.delta;
          console.log('Accumulated text (output_text):', currentResponseTextRef.current);
        }
      });
      

      // Debug: log ALL events to see what's actually happening
      rt.on('*', (event) => {
        console.log('ALL Realtime events:', event.type, event);
      });
      
      // Track transcript for highlighting (synchronized with audio)
      // Accumulate transcript but don't update UI until done (show all at once)
      rt.on('response.output_audio_transcript.delta', (event) => {
        if (event.delta) {
          // Accumulate text but don't update UI (will update on transcript.done)
          currentResponseTextRef.current += event.delta;
        }
      });

      rt.on('response.output_audio_transcript.done', (event) => {
        // Log the full event structure to see if word-level timing is available
        console.log('response.output_audio_transcript.done full event:', JSON.stringify(event, null, 2));
        
        // Clear the waiting flag - transcript has arrived, safe to update now
        waitingForTranscriptRef.current = false;
        
        // Show full transcript immediately when done
        const fullTranscript = currentResponseTextRef.current;
        if (!fullTranscript || fullTranscript.trim() === '') {
          return; // No transcript to display
        }
        
        setCurrentTranscript(fullTranscript);
        
        // Get the response ID to look up the correct message index
        const responseId = currentResponseIdRef.current;
        let messageIndex = null;
        
        // First try to get the index from the stored mapping (most reliable)
        if (responseId) {
          messageIndex = responseIdToMessageIndexRef.current.get(responseId);
          console.log(`Looking up response ${responseId} -> message index ${messageIndex}`);
        }
        
        // Fallback to the ref if mapping doesn't exist (for backwards compatibility)
        if (messageIndex == null) {
          messageIndex = currentAssistantMessageIndexRef.current;
          console.log(`Fallback to ref: message index ${messageIndex}`);
        }
        
        // Update message with full transcript (only update the existing message, don't create new one)
        setMessages(prev => {
          if (messageIndex == null || messageIndex < 0 || messageIndex >= prev.length) {
            console.warn(`Invalid message index ${messageIndex} for response ${responseId}`);
            return prev;
          }
          const currentMessage = prev[messageIndex];
          if (!currentMessage || currentMessage.role !== 'assistant') {
            console.warn(`Message at index ${messageIndex} is not an assistant message`);
            return prev;
          }
          // Only update if content is different (prevent duplicate updates)
          if (currentMessage.content === fullTranscript) {
            return prev;
          }
          const newMessages = [...prev];
          newMessages[messageIndex] = {
            ...currentMessage,
            content: fullTranscript,
            model: 'realtime'
          };
          console.log(`Updated message at index ${messageIndex} with transcript`);
          return newMessages;
        });
        
        // Stop loading indicator
        setIsLoading(false);
        
        // Mark transcript as ready and start playing queued audio
        transcriptReadyRef.current = true;
        
        // Delay audio playback to ensure text is visible first
        if (audioContextRef.current) {
          const delay = 0.3; // 300ms delay after transcript is ready
          const adjustedStartTime = audioContextRef.current.currentTime + delay;
          audioStartTimeRef.current = adjustedStartTime;
          lastPlaybackPositionRef.current = 0;
          setCurrentPlaybackPosition(0);
          
          // Play all queued audio chunks
          const queue = audioQueueRef.current;
          let currentTime = adjustedStartTime;
          
          queue.forEach(({ buffer, duration }) => {
            const source = audioContextRef.current.createBufferSource();
            source.buffer = buffer;
            source.connect(audioContextRef.current.destination);
            
            // Track this source so we can stop it if needed
            activeAudioSources.push(source);
            source.onended = () => {
              // Remove from active sources when done
              const index = activeAudioSources.indexOf(source);
              if (index > -1) {
                activeAudioSources.splice(index, 1);
              }
            };
            
            source.start(currentTime);
            currentTime += duration;
          });
          
          // Update next audio start time
          nextAudioStartTimeRef.current = currentTime;

          // Clear queue
          audioQueueRef.current = [];
        }
      });

      // Handle response completion
      rt.on('response.done', () => {
        rt._hasActiveResponse = false;
        
        // Clear the waiting flag - response is done, safe to update now
        waitingForTranscriptRef.current = false;
        
        // Get the response ID to look up the correct message index
        const responseId = currentResponseIdRef.current;
        let messageIndex = null;
        
        // First try to get the index from the stored mapping (most reliable)
        if (responseId) {
          messageIndex = responseIdToMessageIndexRef.current.get(responseId);
        }
        
        // Fallback to the ref if mapping doesn't exist
        if (messageIndex == null) {
          messageIndex = currentAssistantMessageIndexRef.current;
        }
        
        // Ensure text is displayed even if transcript.done didn't fire
        // But only if transcript.done hasn't already set it (to prevent duplicates)
        const finalText = currentResponseTextRef.current;
        if (finalText && finalText.trim() !== '' && messageIndex != null) {
          setMessages(prev => {
            if (messageIndex < 0 || messageIndex >= prev.length) {
              return prev;
            }
            const currentMessage = prev[messageIndex];
            if (!currentMessage || currentMessage.role !== 'assistant') {
              return prev;
            }
            // Only update if message is empty (transcript.done should have already set it)
            // This is a fallback only
            if (!currentMessage.content || currentMessage.content.trim() === '') {
              const newMessages = [...prev];
              newMessages[messageIndex] = {
                ...currentMessage,
                content: finalText,
                model: 'realtime'
              };
              return newMessages;
            }
            // If content already exists and matches, don't update (prevent duplicates)
            if (currentMessage.content === finalText) {
              return prev;
            }
            return prev;
          });
        }
        
        // Stop loading indicator
        setIsLoading(false);
        
        if (audioContextRef.current) {
          nextAudioStartTimeRef.current = audioContextRef.current.currentTime;
        }
        
        // Clean up: remove the mapping and reset refs
        if (responseId) {
          responseIdToMessageIndexRef.current.delete(responseId);
          console.log(`Cleaned up response ${responseId} -> message index mapping`);
        }
        currentResponseIdRef.current = null;
        currentAssistantMessageIndexRef.current = null;
        currentAssistantItemIdRef.current = null;
      });

      rt.on('response.error', (event) => {
        rt._hasActiveResponse = false;
        setIsLoading(false);
        console.error('Response error:', event);
        
        // Clear the waiting flag - response errored, safe to update now
        waitingForTranscriptRef.current = false;
        
        // Get the response ID to look up the correct message index
        const responseId = currentResponseIdRef.current;
        let messageIndex = null;
        
        // First try to get the index from the stored mapping (most reliable)
        if (responseId) {
          messageIndex = responseIdToMessageIndexRef.current.get(responseId);
        }
        
        // Fallback to the ref if mapping doesn't exist
        if (messageIndex == null) {
          messageIndex = currentAssistantMessageIndexRef.current;
        }
        
        // Update message with error if it exists
        setMessages(prev => {
          if (messageIndex != null && messageIndex >= 0 && messageIndex < prev.length) {
            const newMessages = [...prev];
            const currentMessage = newMessages[messageIndex];
            if (currentMessage && currentMessage.role === 'assistant' && !currentMessage.content) {
              newMessages[messageIndex] = {
                ...currentMessage,
                content: 'Sorry, I encountered an error generating a response.',
                model: 'realtime'
              };
              return newMessages;
            }
          }
          // Fallback: update last message if index lookup failed
          const newMessages = [...prev];
          const lastMessage = newMessages[newMessages.length - 1];
          if (lastMessage && lastMessage.role === 'assistant' && !lastMessage.content) {
            lastMessage.content = 'Sorry, I encountered an error generating a response.';
          }
          return newMessages;
        });
        
        // Clean up: remove the mapping and reset refs
        if (responseId) {
          responseIdToMessageIndexRef.current.delete(responseId);
        }
        currentResponseIdRef.current = null;
        currentAssistantMessageIndexRef.current = null;
        
        if (audioContextRef.current) {
          nextAudioStartTimeRef.current = audioContextRef.current.currentTime;
        }
      });
      
      // Monitor connection state
      rt.socket.addEventListener('close', (event) => {
        console.warn('WebSocket closed:', {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
        });
        sessionReadyRef.current = false;
        rt._hasActiveResponse = false;
        if (audioContextRef.current) {
          nextAudioStartTimeRef.current = audioContextRef.current.currentTime;
        }
        
        // Don't reconnect if it was a clean close or if we're disabling speech
        if (event.wasClean || !isSpeechEnabled) {
          setConnectionStatus('disconnected');
          reconnectAttemptsRef.current = 0;
          return;
        }
        
        // Attempt reconnection with exponential backoff
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          setConnectionStatus('reconnecting');
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000); // 1s, 2s, 4s, 8s, 16s (max 30s)
          console.log(`Attempting to reconnect in ${delay}ms (attempt ${reconnectAttemptsRef.current + 1}/${maxReconnectAttempts})`);
          
          reconnectTimerRef.current = setTimeout(async () => {
            reconnectAttemptsRef.current++;
            realtimeRef.current = null; // Clear old reference
            try {
              await initializeRealtime();
              reconnectAttemptsRef.current = 0; // Reset on success
              setConnectionStatus('connected');
            } catch (error) {
              console.error('Reconnection failed:', error);
              if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
                setConnectionStatus('disconnected');
                console.error('Max reconnection attempts reached');
              }
            }
          }, delay);
        } else {
          setConnectionStatus('disconnected');
          console.error('Max reconnection attempts reached');
        }
      });
      
      rt.socket.addEventListener('error', (event) => {
        // Only log if it's a real connection error (not just a generic error event)
        if (rt.socket.readyState === WebSocket.CLOSED) {
          console.warn('WebSocket connection error');
        }
        rt._hasActiveResponse = false;
        if (audioContextRef.current) {
          nextAudioStartTimeRef.current = audioContextRef.current.currentTime;
        }
      });

      // Handle errors - filter out non-critical ones
      rt.on('error', (err) => {
        // Filter out expected/benign errors
        const errorCode = err?.error?.code;
        const errorMessage = err?.error?.message || err?.message || '';
        
        // Skip logging for expected errors
        if (errorCode === 'response_cancel_not_active') {
          // This is expected when we try to cancel but there's no active response
          return;
        }
        
        // Only log actual errors
        if (errorCode && errorCode !== 'unknown_parameter') {
          console.error('Realtime API error:', errorMessage || err.message);
        }
        
        rt._hasActiveResponse = false;
        if (audioContextRef.current) {
          nextAudioStartTimeRef.current = audioContextRef.current.currentTime;
        }
      });

        realtimeRef.current = rt;
        sessionReadyRef.current = false; // Reset session ready flag
        rt._hasActiveResponse = false;
        setConnectionStatus('connected');
        return rt;
      } catch (error) {
        console.error('Failed to initialize Realtime API:', error);
        throw error; // Re-throw so waiting promises can handle it
      } finally {
        // Clear the in-progress flag when done (success or failure)
        tokenRequestInProgressRef.current = null;
      }
    })();
    
    tokenRequestInProgressRef.current = initializationPromise;
    
    try {
      return await initializationPromise;
    } catch (error) {
      // Handle rate limit errors gracefully
      if (error.message?.includes('Rate limit exceeded')) {
        console.warn('Token request rate limited:', error.message);
        // Return null so caller can handle gracefully
        return null;
      }
      throw error;
    }
  };

  // Function to stop current speech playback
  const handleStopSpeech = () => {
    console.log('🛑 Stopping speech playback');
    
    // Clear accumulated response text to prevent it from appearing in new messages
    currentResponseTextRef.current = '';
    
    // Clear any incomplete assistant message content immediately to prevent brief flash of old content
    setMessages(prev => {
      const index = currentAssistantMessageIndexRef.current;
      if (index != null && index >= 0 && index < prev.length) {
        const newMessages = [...prev];
        const currentMessage = newMessages[index];
        // Only clear if it's a Realtime message that's incomplete
        if (currentMessage && currentMessage.role === 'assistant' && 
            currentMessage.model === 'realtime' &&
            (!currentMessage.content || currentMessage.content.trim() === '')) {
          // Already empty, no need to update
          return prev;
        }
      }
      return prev;
    });
    
    // Cancel any ongoing Realtime API response FIRST to stop new audio chunks from arriving
    if (realtimeRef.current && realtimeRef.current._hasActiveResponse) {
      try {
        realtimeRef.current.send({ type: 'response.cancel' });
        realtimeRef.current._hasActiveResponse = false;
      } catch (e) {
        console.warn('Error canceling response:', e);
      }
    }
    
    // Clear any queued audio chunks BEFORE stopping audio context
    // Access audio queue refs stored on the realtime connection
    if (realtimeRef.current) {
      if (realtimeRef.current._audioQueueRef) {
        realtimeRef.current._audioQueueRef.current = [];
      }
      if (realtimeRef.current._audioChunkTimingsRef) {
        realtimeRef.current._audioChunkTimingsRef.current = [];
      }
      if (realtimeRef.current._transcriptReadyRef) {
        realtimeRef.current._transcriptReadyRef.current = false;
      }
      // Stop any active audio sources immediately
      if (realtimeRef.current._activeAudioSources) {
        realtimeRef.current._activeAudioSources.forEach(source => {
          try {
            source.stop();
            source.disconnect();
          } catch (e) {
            // Source may have already finished or been stopped - ignore errors
          }
        });
        realtimeRef.current._activeAudioSources.length = 0;
      }
    }
    
    // Stop audio playback by suspending audio context
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        // Suspend immediately to stop all playback
        audioContextRef.current.suspend();
        // Reset audio state
        audioStartTimeRef.current = null;
        totalAudioPlayedRef.current = 0;
        setTotalAudioDuration(0);
        totalAudioDurationRef.current = 0;
        setCurrentPlaybackPosition(0);
        lastPlaybackPositionRef.current = 0;
        setCurrentTranscript('');
        nextAudioStartTimeRef.current = audioContextRef.current.currentTime;
        setIsLoading(false);
      } catch (e) {
        console.warn('Error suspending audio context:', e);
      }
    }
  };

  // Function to clear all messages
  const handleClearChat = () => {
    setMessages([]);
    setCurrentTranscript(''); // Clear transcript
    setCurrentPlaybackPosition(0);
    lastPlaybackPositionRef.current = 0;
    setTotalAudioDuration(0);
    totalAudioDurationRef.current = 0;
    audioStartTimeRef.current = null;
    totalAudioPlayedRef.current = 0;
    
    // Clear response ID to message index mapping
    responseIdToMessageIndexRef.current.clear();
    currentResponseIdRef.current = null;
    currentAssistantMessageIndexRef.current = null;
    currentResponseTextRef.current = '';
    
    // Stop any ongoing speech and cancel response
    if (realtimeRef.current) {
      if (realtimeRef.current._hasActiveResponse) {
        try {
          realtimeRef.current.send({ type: 'response.cancel' });
        } catch (e) {
          console.warn('Error canceling response:', e);
        }
        realtimeRef.current._hasActiveResponse = false;
      }
    }
    
    // Stop and clear all audio playback
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        // Suspend audio context to stop all playback
        audioContextRef.current.suspend();
        nextAudioStartTimeRef.current = audioContextRef.current.currentTime;
      } catch (e) {
        console.warn('Error suspending audio context:', e);
      }
    }
    
    // Clear any queued audio chunks (these are stored in event handlers, so we need to access them)
    // Note: audioQueueRef, transcriptReadyRef, and audioChunkTimingsRef are created inside event handlers
    // We can't directly access them here, but stopping the response and suspending audio context
    // will prevent any queued audio from playing
  };

  // Function to toggle speech
  const toggleSpeech = async () => {
    const newSpeechEnabled = !isSpeechEnabled;
    
    // Stop any ongoing speech when toggling off
    if (isSpeechEnabled) {
      // Close the Realtime connection completely to ensure fresh state
      if (realtimeRef.current) {
        console.log('🔌 Closing Realtime connection to reset state');
        try {
          if (realtimeRef.current._hasActiveResponse) {
            realtimeRef.current.send({ type: 'response.cancel' });
          }
          realtimeRef.current.close();
        } catch (e) {
          console.warn('Error closing Realtime connection:', e);
        }
        realtimeRef.current = null;
        realtimeSyncedMessageCountRef.current = 0; // Reset sync count
        sessionReadyRef.current = false;
      }
      
      // Stop and clear any playing audio
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        try {
          audioContextRef.current.suspend();
          console.log('⏸️ Suspended audio context');
        } catch (e) {
          console.warn('Failed to suspend audio context:', e);
        }
      }
      
      // Clear transcript and reset audio state
      setCurrentTranscript('');
      setCurrentPlaybackPosition(0);
      lastPlaybackPositionRef.current = 0;
      setTotalAudioDuration(0);
      totalAudioDurationRef.current = 0;
      audioStartTimeRef.current = null;
      totalAudioPlayedRef.current = 0;
      setIsLoading(false); // Stop loading indicator
      
      // CRITICAL: Clear accumulated response text to prevent it from appearing in new messages
      currentResponseTextRef.current = '';
      currentResponseIdRef.current = null;
      currentAssistantMessageIndexRef.current = null;
      currentAssistantItemIdRef.current = null;
      
      // Remove any empty Realtime placeholder messages when switching to text-only mode
      setMessages(prev => {
        if (prev.length > 0) {
          const lastMessage = prev[prev.length - 1];
          // Remove empty Realtime assistant messages
          if (lastMessage && lastMessage.role === 'assistant' && 
              lastMessage.model === 'realtime' &&
              (!lastMessage.content || lastMessage.content.trim() === '')) {
            return prev.slice(0, -1);
          }
        }
        return prev;
      });
    }
    
    // Update state first
    setIsSpeechEnabled(newSpeechEnabled);
    
    // If enabling speech, pre-initialize the Realtime connection
    // Pass the new speech enabled state to ensure correct configuration
    if (newSpeechEnabled) {
      try {
        console.log('🎤 Initializing Realtime connection for speech...');
        await initializeRealtime(true); // Pass true to ensure speech is enabled
        console.log('✅ Realtime connection initialized');
      } catch (error) {
        console.error('Failed to initialize Realtime connection:', error);
        // Don't prevent the toggle - let it fail gracefully on first message
        // Show a user-friendly error message
        const errorMessage = {
          role: 'assistant',
          content: `Speech mode enabled, but connection setup failed. Please try sending a message to retry. ${error.message || ''}`,
          model: 'system'
        };
        setMessages(prev => [...prev, errorMessage]);
      }
    }
    
    if (audioContextRef.current) {
      nextAudioStartTimeRef.current = audioContextRef.current.currentTime;
    }
  };

  // Function to send message via regular Chat API (text-only fallback)
  const sendChatMessage = async (prompt, currentMessages) => {
    try {
      // Build history from current messages (excluding the last one, which is the current user message)
      // The API will add the prompt separately, so we send all previous messages as history
      let history = currentMessages
        .slice(0, -1) // Exclude the last message (current user message)
        .filter(msg => msg.role && msg.content)
        .map(msg => ({
          role: msg.role,
          content: msg.content
        }));

      // Truncate history to prevent excessive API costs (server also does this, but good to do client-side too)
      history = truncateHistory(history);

      // Add timeout to fetch request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          history,
        }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        clearTimeout(timeoutId);
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 408) {
          throw new Error('Request timed out. Please try again.');
        }
        if (response.status === 429 && errorData.limitReached) {
          // Daily limit reached - show subscription modal
          setShowSubscriptionModal(true);
          throw new Error('Daily limit reached. Please subscribe for unlimited access.');
        }
        throw new Error(errorData.error || errorData.message || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const aiResponse = data.response || 'Sorry, I couldn\'t generate a response.';

      // Add assistant message
      setMessages(prev => [...prev, { role: 'assistant', content: aiResponse, model: 'gpt-5.1' }]);
      setIsLoading(false);

    } catch (error) {
      console.error('Error sending chat message:', error);
      throw error;
    }
  };

  // Function to send message via Realtime API (replaces /api/chat)
  const sendRealtimeMessage = async (prompt, currentMessages) => {
    try {
      // Check if token is expired or about to expire (within 2 minutes for better reuse)
      // Only create new token if current one is expiring soon or doesn't exist
      const needsNewToken = !tokenExpiryRef.current || 
                           tokenExpiryRef.current < new Date(Date.now() + 120000); // 2 minutes buffer
      
      if (needsNewToken && realtimeRef.current) {
        // Token expired or expiring soon, close old connection
        realtimeRef.current.close();
        realtimeRef.current = null;
        realtimeSyncedMessageCountRef.current = 0; // Reset sync count when connection closes
      }

      // Ensure Realtime connection is initialized
      const rt = await initializeRealtime();
      if (!rt) {
        console.error('Failed to initialize Realtime API');
        throw new Error('Failed to initialize Realtime API');
      }

      // Wait for connection to be ready
      if (rt.socket.readyState !== WebSocket.OPEN) {
        await new Promise((resolve) => {
          rt.socket.addEventListener('open', resolve, { once: true });
        });
      }

      // Wait for session to be configured
      if (rt._sessionReadyPromise) {
        await rt._sessionReadyPromise;
      } else if (!sessionReadyRef.current) {
        // Fallback: wait a bit for session to be ready
        await new Promise((resolve) => setTimeout(resolve, 300));
      }

      // Resume audio context if suspended
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        try {
          await audioContextRef.current.resume();
          nextAudioStartTimeRef.current = audioContextRef.current.currentTime;
        } catch (error) {
          console.warn('Failed to resume AudioContext:', error);
          // Clear audio state if resume fails
          setCurrentTranscript('');
          setCurrentPlaybackPosition(0);
          lastPlaybackPositionRef.current = 0;
          setTotalAudioDuration(0);
          totalAudioDurationRef.current = 0;
          audioStartTimeRef.current = null;
          totalAudioPlayedRef.current = 0;
        }
      }

      // Stop any currently playing audio before starting a new response
      // Check if there's audio currently playing
      const isAudioPlaying = audioContextRef.current && 
                            audioStartTimeRef.current !== null && 
                            totalAudioDurationRef.current > 0 &&
                            totalAudioPlayedRef.current < totalAudioDurationRef.current;
      
      if (isAudioPlaying) {
        console.log('Stopping previous audio before starting new response');
        // Cancel the previous response to stop audio generation
        if (rt.socket.readyState === WebSocket.OPEN && rt._hasActiveResponse) {
          try {
            rt.send({ type: 'response.cancel' });
          } catch (e) {
            console.warn('Error canceling previous response:', e);
          }
          rt._hasActiveResponse = false;
        }
        
        // Stop audio playback by suspending audio context
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
          try {
            audioContextRef.current.suspend();
            // Reset audio state
            audioStartTimeRef.current = null;
            totalAudioPlayedRef.current = 0;
            setTotalAudioDuration(0);
            totalAudioDurationRef.current = 0;
            setCurrentPlaybackPosition(0);
            lastPlaybackPositionRef.current = 0;
            setCurrentTranscript('');
            nextAudioStartTimeRef.current = audioContextRef.current.currentTime;
          } catch (e) {
            console.warn('Error suspending audio context:', e);
          }
        }
        
        // Wait a brief moment for audio to stop, then resume for new audio
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Resume audio context so new audio can play
        if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
          try {
            await audioContextRef.current.resume();
            nextAudioStartTimeRef.current = audioContextRef.current.currentTime;
          } catch (e) {
            console.warn('Error resuming audio context after stopping previous audio:', e);
          }
        }
      }
      
      // Cancel any ongoing response
      if (rt.socket.readyState === WebSocket.OPEN && rt._hasActiveResponse) {
        rt.send({ type: 'response.cancel' });
        rt._hasActiveResponse = false;
        if (audioContextRef.current) {
          nextAudioStartTimeRef.current = audioContextRef.current.currentTime;
        }
      }

      if (rt.socket.readyState !== WebSocket.OPEN) {
        throw new Error('WebSocket not open, cannot send');
      }

      // Send conversation history that wasn't already sent via Realtime API
      // This handles the case when switching from GPT-5.1 to Realtime
      if (currentMessages && currentMessages.length > 0) {
        // Get all messages except the last one (which is the current user message we're about to send)
        let historyMessages = currentMessages.slice(0, -1);
        
        // Truncate history to prevent excessive API costs
        historyMessages = truncateHistory(historyMessages);
        
        // Detect if we're switching from GPT-5.1 to Realtime
        // Check if there are any GPT-5.1 messages in the history that haven't been synced
        const unsyncedMessages = historyMessages.slice(realtimeSyncedMessageCountRef.current);
        const hasUnsyncedGPT5Messages = unsyncedMessages.some(msg => msg.model === 'gpt-5.1');
        
        // If switching from GPT-5.1, we need to send ALL previous messages to ensure full context
        // This is because the Realtime API needs the full conversation history
        // Otherwise, just send messages that haven't been synced yet
        const messagesToSync = hasUnsyncedGPT5Messages 
          ? historyMessages // Send all messages when switching from GPT-5.1 to ensure full context
          : unsyncedMessages; // Otherwise, just unsynced ones
        
        console.log('🔄 Syncing messages to Realtime API:', {
          totalHistory: historyMessages.length,
          syncedCount: realtimeSyncedMessageCountRef.current,
          messagesToSync: messagesToSync.length,
          hasUnsyncedGPT5: hasUnsyncedGPT5Messages,
          messages: messagesToSync.map(m => ({ role: m.role, model: m.model, preview: m.content?.substring(0, 50) }))
        });
        
        // Send ALL messages at once, then wait for them to be processed
        // This is more reliable than waiting for individual events
        for (const msg of messagesToSync) {
          if (msg.role && msg.content) {
            if (msg.role === 'user') {
              console.log('📤 [USER]:', msg.content);
              rt.send({
                type: 'conversation.item.create',
                item: {
                  type: 'message',
                  role: 'user',
                  content: [{ type: 'input_text', text: msg.content }],
                },
              });
            } else if (msg.role === 'assistant') {
              console.log('📤 [ASSISTANT]:', msg.content);
              rt.send({
                type: 'conversation.item.create',
                item: {
                  type: 'message',
                  role: 'assistant',
                  content: [{ type: 'output_text', text: msg.content }],
                },
              });
            }
          }
        }
        
        // Wait longer after ALL history messages to ensure they're fully processed
        // The Realtime API needs time to process the context before responding
        if (messagesToSync.length > 0) {
          const delayMs = Math.min(1000, messagesToSync.length * 150); // 150ms per message, max 1 second
          console.log(`✅ Sent ${messagesToSync.length} history messages, waiting ${delayMs}ms for processing...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
        
        // Update the count of synced messages to reflect what was actually sent
        // This accounts for both truncation and partial syncing (unsynced messages only)
        realtimeSyncedMessageCountRef.current = realtimeSyncedMessageCountRef.current + messagesToSync.length;
      }

      // Send current user message to Realtime API
      rt.send({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: prompt }],
        },
      });
      
      // Increment synced message count by 1 (we just sent the current user message)
      realtimeSyncedMessageCountRef.current = realtimeSyncedMessageCountRef.current + 1;

      // Request response (will include both text and audio if speech enabled)
      rt.send({ type: 'response.create' });

    } catch (error) {
      console.error('Error sending Realtime message:', error);
      throw error;
    }
  };

  const handleSendMessage = async (prompt) => {
    if (!prompt.trim()) return;
    
    // Stop any currently playing speech when sending a new message
    if (isSpeechEnabled) {
      handleStopSpeech();
    }
    
    // Clear any incomplete assistant message that might have been accumulating
    // This is important regardless of speech mode to prevent old messages from appearing
    // Only remove empty messages, NOT completed ones with content
    setMessages(prev => {
      const newMessages = [...prev];
      // Only remove assistant message at the end if it's empty (incomplete/placeholder)
      // Don't remove completed messages that have content
      if (newMessages.length > 0 && newMessages[newMessages.length - 1]?.role === 'assistant') {
        const lastMessage = newMessages[newMessages.length - 1];
        // Only remove if completely empty - if it has any content, it's a completed message
        if (!lastMessage.content || lastMessage.content.trim() === '') {
          newMessages.pop();
        }
      }
      return newMessages;
    });
    
    // Client-side validation
    if (prompt.length > MAX_PROMPT_LENGTH) {
      const errorMessage = { 
        role: 'assistant', 
        content: `Your message is too long. Maximum length is ${MAX_PROMPT_LENGTH} characters.`,
        model: 'system'
      };
      setMessages(prev => [...prev, errorMessage]);
      return;
    }

    const newUserMessage = { role: 'user', content: prompt };
    
    // Add user message to state (and placeholder for speech mode)
    setMessages(prev => {
      let updatedMessages = [...prev, newUserMessage];
      
      // If speech is disabled, send via chat API with updated messages
      if (!isSpeechEnabled) {
        // Ensure all Realtime state is cleared before using text-only mode
        currentResponseTextRef.current = '';
        currentResponseIdRef.current = null;
        currentAssistantMessageIndexRef.current = null;
        currentAssistantItemIdRef.current = null;
        
        setIsLoading(true);
        sendChatMessage(prompt, updatedMessages).catch((error) => {
          console.error("Failed to send message:", error);
          setIsLoading(false);
          const errorMessage = { 
            role: 'assistant', 
            content: `Sorry, I encountered an error: ${error.message || 'Please try again.'}`,
            model: 'gpt-5.1'
          };
          setMessages(prevMsgs => [...prevMsgs, errorMessage]);
        });
        
        return updatedMessages;
      }
      
      // Speech is enabled - send via Realtime API
      setIsLoading(true);
      
      // Clear old content to prevent showing old GPT-5.1 messages
      // CRITICAL: Clear this BEFORE creating placeholder to prevent any handlers from using old text
      currentResponseTextRef.current = '';
      currentResponseIdRef.current = null;
      
      // Create assistant message placeholder in the SAME state update
      // Always create a new placeholder after the user message
      // (the last message in updatedMessages is the user message we just added)
      updatedMessages.push({ role: 'assistant', content: '', model: 'realtime' });
      currentAssistantMessageIndexRef.current = updatedMessages.length - 1;
      
      // Set waiting flag immediately to prevent early handlers from updating with old content
      // This will be set again in response.created, but set it here too for safety
      waitingForTranscriptRef.current = true;
      
      // Send message asynchronously (after state update completes)
      // Use the messages BEFORE adding the placeholder (just user + history)
      const messagesForApi = [...prev, newUserMessage];
      sendRealtimeMessage(prompt, messagesForApi).catch((error) => {
        console.error("Failed to send message:", error);
        setIsLoading(false);
        // Update the placeholder message with error
        setMessages(prev => {
          const index = currentAssistantMessageIndexRef.current;
          if (index != null && index >= 0 && index < prev.length) {
            const newMessages = [...prev];
            newMessages[index] = {
              role: 'assistant',
              content: `Sorry, I encountered an error: ${error.message || 'Please try again.'}`,
              model: 'realtime'
            };
            return newMessages;
          }
          // Fallback: add error message if index is invalid
          return [...prev, {
            role: 'assistant',
            content: `Sorry, I encountered an error: ${error.message || 'Please try again.'}`,
            model: 'realtime'
          }];
        });
        currentAssistantMessageIndexRef.current = null;
      });
      
      return updatedMessages;
    });
  };

  return (
    <div className="h-[var(--visual-viewport-height, 100vh)] bg-dark relative">
      <div className="container mx-auto max-w-4xl h-full relative">
        
        <div className="fixed top-0 left-0 right-0 z-10 bg-dark/90 backdrop-blur-md">
          <div className="container mx-auto max-w-4xl border-b border-light/10">
            <div className="flex items-center justify-between py-3 px-4">
              <div className="flex-1"> {/* Left side - Clear Chat button */}
                <button
                  onClick={handleClearChat}
                  disabled={messages.length === 0}
                  className={`text-sm px-3 py-1 rounded border transition-colors ${
                    messages.length > 0
                      ? 'text-light/60 hover:text-light border-light/20 hover:border-light/40 cursor-pointer'
                      : 'text-light/30 border-light/10 cursor-not-allowed opacity-50'
                  }`}
                  aria-label="Clear chat history"
                  aria-disabled={messages.length === 0}
                >
                  Clear Chat
                </button>
              </div>
              
              <div className="flex-1 text-center"> {/* Center - logo */}
                <button
                  onClick={() => {
                    // Open user management modal (login/signup/signout/password reset)
                    setShowUserManagementModal(true);
                  }}
                  className="inline-block hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-primary-start rounded"
                  aria-label="User management"
                >
                  <Image
                    src="/img/logo.png"
                    alt="access:chatgpt logo"
                    width={130}
                    height={45}
                    priority
                    className="opacity-90 mx-auto"
                  />
                </button>
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
              <ChatDisplay 
                messages={messages} 
                isLoading={isLoading} 
                currentTranscript={currentTranscript}
                currentPlaybackPosition={currentPlaybackPosition}
                totalAudioDuration={totalAudioDuration}
              />
            </div>
        
        <div className="fixed bottom-0 left-0 right-0 z-10 bg-dark/90 backdrop-blur-md">
          <div className="container mx-auto max-w-4xl border-t border-light/10">
            <div className="p-4">
              <SearchForm 
                onSendMessage={handleSendMessage} 
                isLoading={isLoading}
                isModalOpen={showSubscriptionModal || showUserManagementModal}
              />
            </div>
          </div>
        </div>
        
      </div>
      
      <SubscriptionModal
        isOpen={showSubscriptionModal}
        onClose={() => setShowSubscriptionModal(false)}
        onSubscribe={async () => {
          // Redirect to subscription page
          window.location.href = '/api/subscribe';
        }}
        user={user}
      />
      
      <UserManagementModal
        isOpen={showUserManagementModal}
        onClose={() => setShowUserManagementModal(false)}
        user={user}
        onUserChange={(newUser) => {
          setUser(newUser);
          // Refresh page to update subscription status if needed
          if (newUser) {
            window.location.reload();
          }
        }}
      />
    </div>
  );
}

