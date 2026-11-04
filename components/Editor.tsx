'use client'

import { useEffect, useState, useRef } from 'react'
import { Editor } from '@tiptap/core'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import Bold from '@tiptap/extension-bold'
import Italic from '@tiptap/extension-italic'
import Heading from '@tiptap/extension-heading'
import BulletList from '@tiptap/extension-bullet-list'
import OrderedList from '@tiptap/extension-ordered-list'
import ListItem from '@tiptap/extension-list-item'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'

const Collaboration = require('@tiptap/extension-collaboration').default || require('@tiptap/extension-collaboration')
const CollaborationCursor = require('@tiptap/extension-collaboration-cursor').default || require('@tiptap/extension-collaboration-cursor')

export default function CollaborativeEditor() {
  const editorRef = useRef<HTMLDivElement | null>(null)
  const [editorInstance, setEditorInstance] = useState<Editor | null>(null)
  
  const [isMounted, setIsMounted] = useState(false)
  const [userInfo, setUserInfo] = useState<{ name: string; color: string; gender: string; avatarUrl: string } | null>(null)
  const [activeUsers, setActiveUsers] = useState<any[]>([])
  const [permission, setPermission] = useState<'edit' | 'view' | 'comment'>('edit')
  
  const [comments, setComments] = useState<any[]>([])
  const [newCommentText, setNewCommentText] = useState('')

  const [versions, setVersions] = useState<{ id: string; title: string; time: string; content: string }[]>([])
  const [showVersionModal, setShowVersionModal] = useState(false)

  useEffect(() => {
    setIsMounted(true)

    // 1. Yjs Doc आणि Websocket Provider तयार करणे
    const ydoc = new Y.Doc()
    const provider = new WebsocketProvider(
      'ws://localhost:1234',
      'collab-editor-room-v2',
      ydoc
    )
    const yCommentsArray = ydoc.getArray('comments')

    // युजर प्रोफाइल्स सेट करणे
    const profiles = [
      { name: 'Rahul', gender: 'male', color: '#FBBC88', seed: 'Rahul-Male' },
      { name: 'Priya', gender: 'female', color: '#F98181', seed: 'Priya-Female' },
      { name: 'Amit', gender: 'male', color: '#958DF1', seed: 'Amit-Male' },
      { name: 'Sneha', gender: 'female', color: '#70CFF8', seed: 'Sneha-Female' }
    ]

    const existingStates = Array.from(provider.awareness.getStates().values())
    const takenNames = existingStates.map((s: any) => s.user?.name?.split('-')[0]).filter(Boolean)
    const availableProfiles = profiles.filter(p => !takenNames.includes(p.name))
    const selectedProfile = availableProfiles.length > 0 
      ? availableProfiles[Math.floor(Math.random() * availableProfiles.length)]
      : profiles[Math.floor(Math.random() * profiles.length)]

    const uniqueNumber = Math.floor(Math.random() * 90) + 10
    const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedProfile.seed}-${uniqueNumber}&radius=50`

    const currentUser = {
      name: `${selectedProfile.name}-${uniqueNumber}`,
      color: selectedProfile.color,
      gender: selectedProfile.gender,
      avatarUrl: avatarUrl
    }

    setUserInfo(currentUser)
    provider.awareness.setLocalStateField('user', currentUser)

    const handleAwarenessChange = () => {
      const states = Array.from(provider.awareness.getStates().values())
      setActiveUsers(states.map((s: any) => s.user).filter(Boolean))
    }

    provider.awareness.on('change', handleAwarenessChange)
    handleAwarenessChange()

    const updateComments = () => {
      setComments(yCommentsArray.toArray())
    }
    yCommentsArray.observe(updateComments)
    updateComments()

    // 2. मॅन्युअली TipTap एडिटर इन्स्टन्स तयार करणे (ज्यामुळे कधीही डुप्लिकेट प्लगइन एरर येणार नाही)
    if (editorRef.current && !editorInstance) {
      const newEditor = new Editor({
        element: editorRef.current,
        // immediatelyRender: false, -> हा ऑप्शन इथे काढ John/Siddhesh
        editable: permission !== 'view',
        extensions: [
          Document,
          Paragraph,
          Text,
          Bold,
          Italic,
          Heading.configure({ levels: [1, 2, 3] }),
          BulletList,
          OrderedList,
          ListItem,
          Collaboration.configure({
            document: ydoc,
          }),
          CollaborationCursor.configure({
            provider: provider,
            user: {
              name: currentUser.name,
              color: currentUser.color,
            },
          }),
        ],
        content: '<p>Welcome to your collaborative workspace, Siddhesh! Real-time sync stable...</p>',
      })

      setEditorInstance(newEditor)
    }

    return () => {
      provider.awareness.off('change', handleAwarenessChange)
      yCommentsArray.unobserve(updateComments)
      provider.destroy()
    }
  }, [])

  useEffect(() => {
    if (editorInstance) {
      editorInstance.setEditable(permission !== 'view')
    }
  }, [permission, editorInstance])

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCommentText.trim() || !userInfo) return

    // yCommentsArray ॲक्सेस करण्यासाठी सोपी पद्धत
    // (किंवा थेट ydoc मधून घेऊ शकता)
    setNewCommentText('')
  }

  const handleSaveSnapshot = () => {
    if (!editorInstance) return
    const currentHtml = editorInstance.getHTML()
    const newVersion = {
      id: Date.now().toString(),
      title: `Snapshot v${versions.length + 1}`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      content: currentHtml
    }
    setVersions([newVersion, ...versions])
    alert('Version snapshot saved successfully!')
  }

  const handleRestoreVersion = (content: string) => {
    if (!editorInstance) return
    editorInstance.commands.setContent(content)
    setShowVersionModal(false)
  }

  if (!isMounted) {
    return <div className="p-4 text-gray-500">Connecting to collaborative room...</div>
  }

  return (
    <div className="max-w-6xl mx-auto p-4">
      {/* Top Header & Toolbar */}
      <div className="flex items-center justify-between mb-4 bg-gray-50 p-3 rounded-lg border shadow-sm">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-700">Online Users ({activeUsers.length}):</h2>
          <div className="flex items-center gap-2">
            {activeUsers.map((user, index) => (
              <div
                key={index}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-white border shadow-sm"
              >
                <img src={user.avatarUrl} alt={user.name} className="w-5 h-5 rounded-full border bg-gray-100" />
                <span className="text-gray-800 font-medium">{user.name}</span>
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: user.color }}></span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSaveSnapshot}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 py-1.5 rounded-md font-medium transition shadow-2xs"
          >
            Save Snapshot
          </button>
          
          <button
            onClick={() => setShowVersionModal(true)}
            className="bg-gray-800 hover:bg-gray-900 text-white text-xs px-3 py-1.5 rounded-md font-medium transition shadow-2xs"
          >
            Version History ({versions.length})
          </button>

          <div className="flex items-center gap-1.5 pl-2 border-l">
            <span className="text-xs font-medium text-gray-500">Permission:</span>
            <select
              value={permission}
              onChange={(e) => setPermission(e.target.value as any)}
              className="text-xs border rounded-md px-2 py-1 bg-white font-medium text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="edit">Can Edit</option>
              <option value="comment">Can Comment</option>
              <option value="view">Can View</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* TipTap Editor Box using useRef */}
        <div className="md:col-span-2 border p-4 rounded-lg min-h-[350px] bg-white text-black relative shadow-sm">
          {permission === 'view' && (
            <div className="absolute top-2 right-2 bg-yellow-100 text-yellow-800 text-xs px-2 py-0.5 rounded font-medium">
              View Only Mode
            </div>
          )}
          <div ref={editorRef} className="outline-none min-h-[300px] cursor-text" />
        </div>

        {/* Comments Sidebar */}
        <div className="border bg-gray-50 rounded-lg p-3 flex flex-col justify-between shadow-sm h-[400px]">
          <div>
            <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-3">Live Comments ({comments.length})</h3>
            
            <div className="overflow-y-auto max-h-[260px] space-y-2.5 pr-1">
              {comments.length === 0 ? (
                <p className="text-xs text-gray-400 italic text-center mt-10">No comments yet. Start a discussion!</p>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className="bg-white p-2.5 rounded-md border text-xs shadow-2xs">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <img src={c.avatar} alt={c.author} className="w-4 h-4 rounded-full border" />
                        <span className="font-bold text-gray-800">{c.author}</span>
                      </div>
                      <span className="text-[10px] text-gray-400">{c.timestamp}</span>
                    </div>
                    <p className="text-gray-600 pl-5">{c.text}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <form onSubmit={handleAddComment} className="mt-3 pt-2 border-t flex gap-2">
            <input
              type="text"
              value={newCommentText}
              onChange={(e) => setNewCommentText(e.target.value)}
              placeholder={permission === 'view' ? "View only mode..." : "Write a comment..."}
              disabled={permission === 'view'}
              className="flex-1 text-xs border rounded-md px-2.5 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-100"
            />
            <button
              type="submit"
              disabled={permission === 'view'}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-3 py-1.5 rounded-md font-medium transition disabled:opacity-50"
            >
              Post
            </button>
          </form>
        </div>
      </div>

      {showVersionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-5 shadow-xl">
            <div className="flex justify-between items-center mb-4 border-b pb-2">
              <h3 className="text-sm font-bold text-gray-800">Document Version History</h3>
              <button 
                onClick={() => setShowVersionModal(false)}
                className="text-gray-400 hover:text-gray-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="max-h-[300px] overflow-y-auto space-y-2 mb-4">
              {versions.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-6">No snapshots saved yet. Click 'Save Snapshot' to record versions.</p>
              ) : (
                versions.map((ver) => (
                  <div key={ver.id} className="flex items-center justify-between p-2.5 border rounded-md hover:bg-gray-50 text-xs">
                    <div>
                      <p className="font-bold text-gray-800">{ver.title}</p>
                      <p className="text-[10px] text-gray-400">{ver.time}</p>
                    </div>
                    <button
                      onClick={() => handleRestoreVersion(ver.content)}
                      className="bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-2.5 py-1 rounded font-medium transition"
                    >
                      Restore
                    </button>
                  </div>
                ))
              )}
            </div>

            <button
              onClick={() => setShowVersionModal(false)}
              className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs py-2 rounded font-medium transition"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}