import { handleUpload } from "@vercel/blob/client";
import { NextResponse } from "next/server";

// This route issues short-lived tokens so the browser can upload photos
// DIRECTLY to Vercel Blob — bypassing the ~4.5MB serverless request-body limit.
// Requires BLOB_READ_WRITE_TOKEN in the environment.
export async function POST(request) {
  const body = await request.json();

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (/* pathname */) => {
        return {
          allowedContentTypes: [
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/heic",
            "image/heif",
          ],
          maximumSizeInBytes: 10 * 1024 * 1024, // 10 MB per file
          addRandomSuffix: true, // unguessable filenames
        };
      },
      onUploadCompleted: async () => {
        // Called by Vercel's servers after upload (won't fire on localhost).
        // No-op for now; the form reads the returned URL directly.
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Upload authorization failed." },
      { status: 400 }
    );
  }
}
