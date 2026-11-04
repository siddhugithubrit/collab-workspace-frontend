import { NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/prisma'

// डॉक्युमेंट सेव्ह करण्यासाठी POST API
export async function POST(request: Request) {
  try {
    const { title, content } = await request.json()
    
    const savedSnapshot = await prisma.snapshot.create({
      data: {
        documentId: 'default-room-id',
        title,
        content,
      },
    })

    return NextResponse.json({ success: true, savedSnapshot })
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Failed to save' }, { status: 500 })
  }
}