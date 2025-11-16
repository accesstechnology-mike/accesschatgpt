'use client';

// Basic component to display an AI's message
export default function AIMessage({ message, transcript = '', currentPlaybackPosition = 0, totalAudioDuration = 0, model }) {
  // Check if audio is playing
  const isPlaying = transcript && transcript.trim().length > 0 && totalAudioDuration > 0 && currentPlaybackPosition > 0 && currentPlaybackPosition < totalAudioDuration;

  return (
    <div className="flex justify-start" style={{ minHeight: '1.5em' }}>
      <div className="flex flex-col w-full max-w-lg">
        <div 
          className="bg-light text-dark p-4 rounded-lg shadow-md ml-1 relative"
          role="log"
          aria-live="polite"
        >
          {/* Flashing dot indicator when audio is playing */}
          {isPlaying && (
            <div 
              className="absolute bottom-4 right-4 w-2 h-2 bg-primary-start rounded-full"
              aria-hidden="true"
              style={{
                animation: 'audio-pulse 1s ease-in-out infinite'
              }}
            />
          )}
          
          {/* Text content */}
          <div className="relative pr-6 break-words">
            {message}
          </div>
        </div>
      </div>
    </div>
  );
} 