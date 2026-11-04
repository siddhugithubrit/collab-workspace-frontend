'use client'

import Editor from '@/components/Editor'

export default function Home() {
  return (
    <main className="min-h-screen bg-white">
      <h1 className="text-xl font-bold p-4 border-b">Collaborative Workspace</h1>
      <Editor />
    </main>
  )
}