import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cleanUrl(url: string) {
  return url.replace(/\/$/, "");
}

function timeoutSignal(ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);

  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer),
  };
}

export async function GET() {
  const localApiUrl =
    process.env.LOCAL_THEATRE_API_URL ||
    process.env.LOCAL_AUTHORITY_BASE_URL ||
    "";

  const localSharedSecret =
    process.env.LOCAL_THEATRE_SHARED_SECRET ||
    process.env.LOCAL_AUTHORITY_SECRET ||
    "";

  const cloudflareAccessClientId =
    process.env.CLOUDFLARE_ACCESS_CLIENT_ID || "";

  const cloudflareAccessClientSecret =
    process.env.CLOUDFLARE_ACCESS_CLIENT_SECRET || "";

  if (!localApiUrl) {
    return NextResponse.json(
      {
        success: false,
        errorCode: "LOCAL_THEATRE_API_URL_MISSING",
        errorMessage:
          "LOCAL_THEATRE_API_URL is missing in central server environment variables.",
      },
      { status: 500 }
    );
  }

  const healthUrl = `${cleanUrl(localApiUrl)}/api/local/health`;

  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (localSharedSecret) {
    headers["x-authority-secret"] = localSharedSecret;
  }

  if (cloudflareAccessClientId && cloudflareAccessClientSecret) {
    headers["CF-Access-Client-Id"] = cloudflareAccessClientId;
    headers["CF-Access-Client-Secret"] = cloudflareAccessClientSecret;
  }

  const timeout = timeoutSignal(10000);

  try {
    const response = await fetch(healthUrl, {
      method: "GET",
      cache: "no-store",
      headers,
      signal: timeout.signal,
    });

    timeout.clear();

    const rawText = await response.text();

    let responseBody: unknown = null;

    try {
      responseBody = rawText ? JSON.parse(rawText) : null;
    } catch {
      responseBody = {
        raw: rawText.slice(0, 800),
      };
    }

    return NextResponse.json(
      {
        success: response.ok,
        localApiUrl: cleanUrl(localApiUrl),
        checkedUrl: healthUrl,
        hasLocalTheatreApiUrl: Boolean(localApiUrl),
        hasLocalTheatreSharedSecret: Boolean(localSharedSecret),
        hasCloudflareAccessClientId: Boolean(cloudflareAccessClientId),
        hasCloudflareAccessClientSecret: Boolean(cloudflareAccessClientSecret),
        sentCloudflareAccessHeaders: Boolean(
          cloudflareAccessClientId && cloudflareAccessClientSecret
        ),
        statusCode: response.status,
        statusText: response.statusText,
        localResponse: responseBody,
      },
      { status: response.ok ? 200 : 502 }
    );
  } catch (error: any) {
    timeout.clear();

    return NextResponse.json(
      {
        success: false,
        localApiUrl: cleanUrl(localApiUrl),
        checkedUrl: healthUrl,
        hasLocalTheatreApiUrl: Boolean(localApiUrl),
        hasLocalTheatreSharedSecret: Boolean(localSharedSecret),
        hasCloudflareAccessClientId: Boolean(cloudflareAccessClientId),
        hasCloudflareAccessClientSecret: Boolean(cloudflareAccessClientSecret),
        sentCloudflareAccessHeaders: Boolean(
          cloudflareAccessClientId && cloudflareAccessClientSecret
        ),
        errorCode:
          error?.name === "AbortError"
            ? "LOCAL_THEATRE_API_TIMEOUT"
            : "LOCAL_THEATRE_API_UNREACHABLE",
        errorMessage:
          error?.name === "AbortError"
            ? "Local theatre API health check timed out."
            : error?.message || "Local theatre service could not complete the request.",
      },
      { status: 502 }
    );
  }
}