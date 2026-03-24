import Anthropic from "@anthropic-ai/sdk"
import { buildPrompt } from "../prompt"
import { parseAndValidate } from "../parse-ai-response"
import type { AIProvider, AnalysisInput, OpportunityResult } from "./types"

export class AnthropicSDKProvider implements AIProvider {
  private client: Anthropic

  constructor() {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY required for --api mode. Set it in .env.local")
    }
    this.client = new Anthropic()
  }

  async analyze(input: AnalysisInput): Promise<OpportunityResult[]> {
    const prompt = buildPrompt(input)

    const response = await this.client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    })

    // Concatenate all text blocks (model may return multiple content blocks)
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")

    return parseAndValidate(text)
  }
}
