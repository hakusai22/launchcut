import { NextResponse } from "next/server";
import { listVideoSkills } from "@/lib/skills";

export const runtime = "nodejs";

export async function GET() {
  try {
    const skills = await listVideoSkills();

    return NextResponse.json({ skills });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to list skills.",
        skills: [],
      },
      { status: 500 },
    );
  }
}
