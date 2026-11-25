import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isBlobStorageConfigured, uploadChatAttachment } from "@/lib/storage";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!isBlobStorageConfigured()) {
    return NextResponse.json(
      {
        error:
          "Vercel Blob is not configured yet. Add a Blob store in Vercel Storage (BLOB_READ_WRITE_TOKEN).",
      },
      { status: 503 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }

    const attachment = await uploadChatAttachment(file, user.id);
    return NextResponse.json({ attachment }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
