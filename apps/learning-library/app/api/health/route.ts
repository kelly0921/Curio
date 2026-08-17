import { NextResponse } from "next/server";
import { persistenceConfiguration } from "@/lib/data/provider";

export const dynamic = "force-dynamic";

export async function GET() {
  const persistence = persistenceConfiguration();
  return NextResponse.json({
    ok: persistence.mode !== "invalid",
    data: {
      service: "learning-library",
      openAIConfigured: Boolean(process.env.OPENAI_API_KEY?.trim()),
      persistence,
      uploadBoundary: "direct-small-file-v0.1",
    },
  }, { status: persistence.mode === "invalid" ? 503 : 200 });
}
