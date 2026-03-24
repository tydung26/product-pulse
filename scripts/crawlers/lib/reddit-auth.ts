// Reddit OAuth token manager using client_credentials flow (app-only, no user login)

export class RedditAuth {
  private token: string | null = null
  private expiresAt = 0

  constructor(
    private clientId: string,
    private clientSecret: string,
  ) {}

  async getToken(): Promise<string> {
    // Return cached token if still valid (with 60s buffer)
    if (this.token && Date.now() < this.expiresAt - 60_000) return this.token

    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64")

    const response = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "ProductPulse/1.0",
      },
      body: "grant_type=client_credentials",
    })

    if (!response.ok) {
      throw new Error(`Reddit OAuth failed: ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as { access_token: string; expires_in: number }
    this.token = data.access_token
    this.expiresAt = Date.now() + data.expires_in * 1000

    return this.token
  }

  // Authenticated fetch with auto-refresh and User-Agent
  async fetchAuthenticated(url: string): Promise<Response> {
    const token = await this.getToken()
    return fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "ProductPulse/1.0",
      },
    })
  }
}
