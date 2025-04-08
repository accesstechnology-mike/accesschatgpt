import { NextResponse } from "next/server";
import OpenAI from 'openai';

// Instantiate the OpenAI client.
// It will automatically pick up the OPENAI_API_KEY environment variable.
const openai = new OpenAI();

// Updated system prompt to explicitly request plain text only
const systemPrompt = "You are a helpful assistant designed for accessibility. IMPORTANT: Provide ONLY plain text responses. DO NOT use markdown formatting, code blocks, bullet points, or any special formatting. Just respond with straightforward, accessible text.";

// Function to strip any markdown that might still come through
function stripMarkdown(text) {
  if (!text) return text;
  return text
    // Replace code blocks (both ```language and ```)
    .replace(/```[\s\S]*?```/g, content => {
      // Extract the code content without the backticks
      const code = content.replace(/```(?:\w+)?\n([\s\S]*?)```/g, '$1').trim();
      return `Code: ${code}`;
    })
    // Replace inline code
    .replace(/`([^`]+)`/g, '$1')
    // Replace headers
    .replace(/^#+\s+(.*)$/gm, '$1')
    // Replace bold/italic
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    // Replace bullet lists (simplify to plain text)
    .replace(/^[\s-]*[-*+]\s+(.*)$/gm, '• $1')
    // Replace numbered lists
    .replace(/^\s*\d+\.\s+(.*)$/gm, '• $1')
    // Replace links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    // Replace any other potential markdown elements as needed
    .trim();
}

export async function POST(request) {
  try {
    const body = await request.json();
    const userPrompt = body.prompt;
    // Ensure history is always an array, even if not provided
    const history = Array.isArray(body.history) ? body.history : []; 

    if (!userPrompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    // Construct the message history for the API call
    const messagesForApi = [
      { role: "system", content: systemPrompt },
      // Spread the incoming history (ensure it adheres to {role, content} structure)
      ...history.filter(msg => msg.role && msg.content), 
      { role: "user", content: userPrompt },
    ];

    // --- Make the actual OpenAI API call --- 
    const chatCompletion = await openai.chat.completions.create({
      messages: messagesForApi,
      model: "chatgpt-4o-latest", // Use the exact specified model
      // Optional parameters (temperature, max_tokens, etc.) can be added here
    });

    // Extract the response content and strip any markdown
    const rawResponse = chatCompletion.choices[0]?.message?.content || "Sorry, I couldn't generate a response.";
    const aiResponse = stripMarkdown(rawResponse);
    // -----------------------------------------

    return NextResponse.json({ response: aiResponse });

  } catch (error) {
    console.error("Error in chat API route:", error);
    // Provide more specific error feedback if possible
    let errorMessage = "Failed to get response from AI";
    if (error instanceof OpenAI.APIError) {
      errorMessage = `OpenAI API Error: ${error.status} ${error.name} ${error.message}`;
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    return NextResponse.json(
      {
        error: "Failed to get response from AI",
        message: errorMessage,
      },
      // Use appropriate status code if available, otherwise 500
      { status: error instanceof OpenAI.APIError ? error.status : 500 } 
    );
  }
} 