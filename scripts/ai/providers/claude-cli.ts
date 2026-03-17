import { spawnSync } from "child_process"
import { buildPrompt } from "../prompt"
import { parseAndValidate } from "../parse-ai-response"
import type { AIProvider, AnalysisInput, OpportunityResult } from "./types"

export class ClaudeCLIProvider implements AIProvider {
  async analyze(input: AnalysisInput): Promise<OpportunityResult[]> {
    const prompt = buildPrompt(input)

    // Pipe prompt via stdin — no shell, no temp files, no injection surface
    const result = spawnSync("claude", ["--print"], {
      input: prompt,
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
      timeout: 120_000,
    })

    if (result.error) {
      const message = result.error.message
      if (message.includes("ENOENT")) {
        throw new Error(
          "Claude CLI not found. Install it or use --api flag with ANTHROPIC_API_KEY."
        )
      }
      throw result.error
    }

    if (result.status !== 0) {
      throw new Error(`Claude CLI exited with code ${result.status}: ${result.stderr}`)
    }

    return parseAndValidate(result.stdout)
  }
}
