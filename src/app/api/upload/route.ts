import { NextRequest, NextResponse } from 'next/server';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { wasabiClient, WASABI_BUCKET } from '@/lib/wasabi';

export async function POST(request: NextRequest) {
  try {
    const { filename, contentType } = await request.json();

    if (!filename || !contentType) {
      return NextResponse.json(
        { error: 'Filename and content type are required' },
        { status: 400 }
      );
    }

    // Generate a unique key for the file
    const key = `uploads/${Date.now()}-${filename}`;

    // Create a presigned POST URL
    const presignedPost = await createPresignedPost(wasabiClient, {
      Bucket: WASABI_BUCKET,
      Key: key,
      Fields: {
        'Content-Type': contentType,
      },
      Conditions: [
        ['content-length-range', 0, 100 * 1024 * 1024], // 100MB max
        ['starts-with', '$Content-Type', contentType.split('/')[0]],
      ],
      Expires: 3600, // 1 hour
    });

    return NextResponse.json({
      uploadUrl: presignedPost.url,
      fields: presignedPost.fields,
      key,
    });
  } catch (error) {
    console.error('Error creating presigned URL:', error);
    return NextResponse.json(
      { error: 'Failed to create upload URL' },
      { status: 500 }
    );
  }
}