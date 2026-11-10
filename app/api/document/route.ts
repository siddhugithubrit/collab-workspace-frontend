import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// 1. डॉक्युमेंट फेच करण्यासाठी (GET Request)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (id) {
      // विशिष्ट डॉक्युमेंट आणणे
      const document = await prisma.document.findUnique({
        where: { id },
      })
      if (!document) {
        return NextResponse.json({ error: 'Document not found' }, { status: 404 })
      }
      return NextResponse.json(document, { status: 200 })
    }

    // सर्व डॉक्युमेंट्सची लिस्ट आणणे
    const documents = await prisma.document.findMany({
      orderBy: { updatedAt: 'desc' },
    })
    return NextResponse.json(documents, { status: 200 })
  } catch (error) {
    console.error('Error fetching documents:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

// 2. नवीन डॉक्युमेंट तयार करणे किंवा सेव्ह/अपडेट करणे (POST Request)
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { id, title, content } = body

    if (id) {
      // आधीच अस्तित्वात असलेल्या डॉक्युमेंटचे कंटेंट अपडेट करणे
      const updatedDoc = await prisma.document.update({
        where: { id },
        data: {
          title: title || undefined,
          content: content || undefined,
        },
      })
      return NextResponse.json(updatedDoc, { status: 200 })
    }

    // नवीन डॉक्युमेंट तयार करणे
    const newDoc = await prisma.document.create({
      data: {
        title: title || 'Untitled Document',
        content: content || '',
      },
    })

    return NextResponse.json(newDoc, { status: 201 })
  } catch (error) {
    console.error('Error saving document:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}