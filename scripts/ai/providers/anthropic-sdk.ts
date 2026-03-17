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
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    })

    const text =
      response.content[0].type === "text" ? response.content[0].text : ""

    return parseAndValidate(text)
  }
}
