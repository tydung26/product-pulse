import { execSync } from "child_process"
import { writeFileSync, unlinkSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { buildPrompt } from "../prompt"
import { parseAndValidate } from "../parse-ai-response"
import type { AIProvider, AnalysisInput, OpportunityResult } from "./types"

export class ClaudeCLIProvider implements AIProvider {
  async analyze(input: AnalysisInput): Promise<OpportunityResult[]> {
    const prompt = buildPrompt(input)

    // Write prompt to temp file to avoid shell escaping issues
    const tmpFile = join(tmpdir(), `productpulse-prompt-${Date.now()}.txt`)
    writeFileSync(tmpFile, prompt, "utf-8")

    try {
      const result = execSync(`cat "${tmpFile}" | claude --print`, {
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
        timeout: 120_000,
      })

      return parseAndValidate(result)
    } catch (err: unknown) {
      const message = (err as Error).message
      if (message.includes("command not found") || message.includes("ENOENT")) {
        throw new Error(
          "Claude CLI not found. Install it or use --api flag with ANTHROPIC_API_KEY."
        )
      }
      throw err
    } finally {
      try { unlinkSync(tmpFile) } catch { /* ignore cleanup errors */ }
    }
  }
}
