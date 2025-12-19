import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing DEEPGRAM_API_KEY on server." },
      { status: 500 },
    );
  }

  // Generate a JWT token for WebSocket authentication
  // Deepgram requires JWT tokens for Voice Agent API (not raw API keys)
  try {
    // Generate JWT token using Deepgram's /auth/grant endpoint
    // TTL: 300 seconds (5 minutes) - API guaranteed value
    const grantRes = await fetch("https://api.deepgram.com/v1/auth/grant", {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ttl: 300, // 5 minutes - API guaranteed value
        scopes: ["agent:converse"], // Voice Agent API scope
      }),
    });

    if (!grantRes.ok) {
      // If scope-based grant fails, try without scopes (may grant all permissions)
      const errorText = await grantRes.text().catch(() => "");
      console.warn(`JWT grant with scope failed (${grantRes.status}): ${errorText}. Trying without scope...`);
      
      const fallbackRes = await fetch("https://api.deepgram.com/v1/auth/grant", {
        method: "POST",
        headers: {
          Authorization: `Token ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ttl: 300, // 5 minutes - API guaranteed value
          // No scopes - may grant all permissions for the API key
        }),
      });

      if (!fallbackRes.ok) {
        const fallbackErrorText = await fallbackRes.text().catch(() => "");
        throw new Error(
          `Failed to generate JWT token. ` +
          `First attempt (with scope "agent:converse"): ${grantRes.status} - ${errorText}. ` +
          `Fallback attempt (no scope): ${fallbackRes.status} - ${fallbackErrorText}. ` +
          `\n\nSOLUTION: Your API key needs "Member" permissions to create JWT tokens. ` +
          `1. Go to Deepgram Console → API Keys ` +
          `2. Check your API key permissions (must be "Member" or higher) ` +
          `3. If needed, create a new API key with "Member" permissions ` +
          `4. Update DEEPGRAM_API_KEY in your .env file`
        );
      }

      const fallbackData = (await fallbackRes.json()) as { access_token?: string };
      const jwtToken = fallbackData.access_token;

      if (!jwtToken) {
        console.error("Fallback JWT grant response:", JSON.stringify(fallbackData, null, 2));
        throw new Error("JWT token not returned from Deepgram (fallback attempt). Response: " + JSON.stringify(fallbackData));
      }

      console.log("JWT token generated successfully (fallback, no scope), length:", jwtToken.length);

      const model = process.env.DEEPGRAM_MODEL;
      const voice = process.env.DEEPGRAM_VOICE;
      const language = process.env.DEEPGRAM_LANGUAGE ?? "fr";

      return NextResponse.json({
        token: jwtToken,
        model,
        voice,
        language,
      });
    }

    const grantData = (await grantRes.json()) as { access_token?: string };
    const jwtToken = grantData.access_token;

    if (!jwtToken) {
      console.error("JWT grant response:", JSON.stringify(grantData, null, 2));
      throw new Error("JWT token not returned from Deepgram. Response: " + JSON.stringify(grantData));
    }

    console.log("JWT token generated successfully (with scope), length:", jwtToken.length);

    const model = process.env.DEEPGRAM_MODEL;
    const voice = process.env.DEEPGRAM_VOICE;
    const language = process.env.DEEPGRAM_LANGUAGE ?? "fr";

    // For browser connections, we can optionally use API key directly with Sec-WebSocket-Protocol
    // This matches the Twilio example pattern, but JWT tokens should also work
    // Set USE_API_KEY_DIRECTLY=true in .env to test with API key (less secure, for testing only)
    const useApiKeyDirectly = process.env.USE_API_KEY_DIRECTLY === "true";
    const audioMode = process.env.DEEPGRAM_AUDIO_MODE ?? "hifi"; // "hifi" | "telephony"
    const thinkModel = process.env.DEEPGRAM_THINK_MODEL ?? "gpt-4o-mini";

    return NextResponse.json({
      token: useApiKeyDirectly ? apiKey : jwtToken, // Use API key or JWT token
      apiKey: useApiKeyDirectly ? apiKey : undefined, // Also return API key if requested
      model,
      voice,
      language,
      audioMode,
      thinkModel,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Failed to generate Deepgram JWT token: ${errorMessage}` },
      { status: 500 },
    );
  }
}

