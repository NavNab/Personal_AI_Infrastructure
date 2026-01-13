#!/usr/bin/env bun
/**
 * Diagnostic script to analyze LLM extraction failures
 *
 * Tests different models and shows their raw output
 */

import { readTranscript, formatConversation } from './TranscriptReader';
import { sampleMessages } from './SignalSampler';

const TRANSCRIPT_PATH = process.argv[2] || '/Users/nabil.bamoh/.claude/projects/-Users-nabil-bamoh-dotfiles/23e00ce1-a50f-46e3-84ea-ad6d6adcc0d4.jsonl';

const SYSTEM_MESSAGE = `You are a JSON extraction bot. Output ONLY valid JSON, nothing else.
Task: Extract USER PREFERENCES from conversation logs.
Format: {"learnings":[{"s":"User prefers X","c":"preference","e":"exact user quote"}]}
Categories: preference, decision, correction, context

IMPORTANT:
- Extract what the USER said about their preferences, NOT what was done
- Each "s" must start with "User prefers/wants/needs"
- Each "e" must be a direct quote from the user
- Ignore technical implementation details
- If no clear user preferences, output: {"learnings":[]}`;

function filterUserMessages(conversation: string): string {
  const lines = conversation.split('\n');
  const userLines: string[] = [];
  let inUserBlock = false;

  for (const line of lines) {
    if (line.startsWith('USER:')) {
      inUserBlock = true;
      userLines.push(line);
    } else if (line.startsWith('A:') || line.startsWith('ASSISTANT:')) {
      inUserBlock = false;
    } else if (inUserBlock && line.trim()) {
      userLines.push(line);
    }
  }

  return userLines.join('\n').slice(0, 8000);
}

async function testModel(modelName: string, userContent: string): Promise<void> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${modelName}`);
  console.log('='.repeat(60));

  const startTime = Date.now();

  try {
    const response = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: 'system', content: SYSTEM_MESSAGE },
          { role: 'user', content: userContent },
        ],
        stream: false,
        options: {
          num_predict: 2048,
          temperature: 0.1,
        },
      }),
      signal: AbortSignal.timeout(60000),
    });

    const duration = Date.now() - startTime;

    if (!response.ok) {
      console.log(`❌ HTTP Error: ${response.status} ${response.statusText}`);
      return;
    }

    const data = await response.json() as { message?: { content: string } };
    const rawOutput = data.message?.content || '';

    console.log(`Duration: ${(duration / 1000).toFixed(1)}s`);
    console.log(`Output length: ${rawOutput.length} chars`);
    console.log(`\n--- RAW OUTPUT START ---`);
    console.log(rawOutput.slice(0, 2000));
    if (rawOutput.length > 2000) {
      console.log(`\n... [${rawOutput.length - 2000} more chars] ...`);
      console.log(`\n--- LAST 500 CHARS ---`);
      console.log(rawOutput.slice(-500));
    }
    console.log(`--- RAW OUTPUT END ---`);

    // Try to parse JSON
    const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        console.log(`\n✅ JSON parsed successfully`);
        console.log(`   learnings array: ${Array.isArray(parsed.learnings) ? parsed.learnings.length + ' items' : 'NOT FOUND'}`);
      } catch (e) {
        console.log(`\n❌ JSON parse error: ${e}`);
        console.log(`   Matched JSON (first 500 chars): ${jsonMatch[0].slice(0, 500)}`);
      }
    } else {
      console.log(`\n❌ No JSON object found in output`);

      // Check for array
      const arrayMatch = rawOutput.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        try {
          const parsed = JSON.parse(arrayMatch[0]);
          console.log(`   Found array with ${parsed.length} items`);
        } catch {
          console.log(`   Array found but failed to parse`);
        }
      }

      // Check for thinking tags
      if (rawOutput.includes('<think>') || rawOutput.includes('</think>')) {
        console.log(`   Found <think> tags - deepseek thinking mode detected`);
      }
      if (rawOutput.includes('Thinking...')) {
        console.log(`   Found "Thinking..." prefix`);
      }
    }
  } catch (error) {
    console.log(`❌ Error: ${error}`);
  }
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║         LLM EXTRACTION DIAGNOSTIC                             ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  // Check available models
  console.log('Checking available models...');
  const tagsResponse = await fetch('http://localhost:11434/api/tags');
  const tagsData = await tagsResponse.json() as { models?: Array<{ name: string }> };
  const availableModels = tagsData.models?.map(m => m.name) || [];
  console.log(`Available: ${availableModels.join(', ')}`);

  // Read and prepare transcript
  console.log(`\nReading transcript: ${TRANSCRIPT_PATH}`);
  const transcript = readTranscript(TRANSCRIPT_PATH);
  console.log(`Messages: ${transcript.messages.length}`);
  console.log(`Tokens: ${transcript.totalTokens}`);

  const sampled = sampleMessages(transcript.messages, { maxTokens: 18000 });
  const conversation = formatConversation(sampled, { maxMessageLength: 500 });
  const userContent = `Here are USER messages from a conversation. Extract their preferences:\n\n${filterUserMessages(conversation)}\n\nJSON:`;

  console.log(`\nUser content length: ${userContent.length} chars`);
  console.log(`Filtered user messages: ${filterUserMessages(conversation).length} chars`);

  // Models to test
  const modelsToTest = [
    'deepseek-r1:8b',
    'qwen3:4b',
  ].filter(m => availableModels.some(am => am.includes(m.split(':')[0])));

  console.log(`\nModels to test: ${modelsToTest.join(', ')}`);

  for (const model of modelsToTest) {
    await testModel(model, userContent);
  }

  console.log('\n' + '='.repeat(60));
  console.log('DIAGNOSTIC COMPLETE');
  console.log('='.repeat(60));
}

main().catch(console.error);
