'use client'

import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'
import * as syncProtocol from 'y-protocols/sync'
import * as awarenessProtocol from 'y-protocols/awareness'
import { useEffect, useState, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import * as Y from 'yjs'

const Collaboration = require('@tiptap/extension-collaboration').default || require('@tiptap/extension-collaboration')
const CollaborationCursor = require('@tiptap/extension-collaboration-cursor').default || require('@tiptap/extension-collaboration-cursor')

export default function CollaborativeEditor() {
  const [isMounted, setIsMounted] = useState(false)
  const [userInfo, setUserInfo] = useState<{ name: string; color: string; avatarUrl: string } | null>(null)
  const [activeUsers, setActiveUsers] = useState<any[]>([])
  const [permission, setPermission] = useState<'edit' | 'view' | 'comment'>('edit')
  
  const [comments, setComments] = useState<any[]>([])
  const [newCommentText, setNewCommentText] = useState('')

  const [versions, setVersions] = useState<{ id: string; title: string; time: string; content: string }[]>([])
  const [showVersionModal, setShowVersionModal] = useState(false)

  const ydocRef = useRef<Y.Doc | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  if (!ydocRef.current) {
    ydocRef.current = new Y.Doc()
  }
  const ydoc = ydocRef.current

  // Use TipTap official React hook for flawless DOM mounting & cursor
  const editor = useEditor({
    immediatelyRender: false,
    editable: permission !== 'view',
    extensions: [
      StarterKit.configure({ history: false }),
      Collaboration.configure({ document: ydoc }),
      CollaborationCursor.configure({
        provider: { awareness: new awarenessProtocol.Awareness(ydoc) },
        user: userInfo ? { name: userInfo.name, color: userInfo.color } : { name: 'User', color: '#000' },
      }),
    ],
    content: '<p>Start collaborating here...</p>',
  })

  useEffect(() => {
    setIsMounted(true)
    const awareness = new awarenessProtocol.Awareness(ydoc)

    const profiles = [
      { name: 'Rahul', color: '#FBBC88', seed: 'Rahul-Male' },
      { name: 'Priya', color: '#F98181', seed: 'Priya-Female' },
      { name: 'Amit', color: '#958DF1', seed: 'Amit-Male' },
      { name: 'Sneha', color: '#70CFF8', seed: 'Sneha-Female' }
    ]
    const selectedProfile = profiles[Math.floor(Math.random() * profiles.length)]
    const uniqueNumber = Math.floor(Math.random() * 90) + 10
    const avatarUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedProfile.seed}-${uniqueNumber}&radius=50`

    const currentUser = {
      name: `Siddhesh-${uniqueNumber}`,
      color: selectedProfile.color,
      avatarUrl: avatarUrl
    }
    setUserInfo(currentUser)
    awareness.setLocalStateField('user', currentUser)

    const ws = new WebSocket('ws://localhost:1234/collab-editor-room-v2')
    wsRef.current = ws
    ws.binaryType = 'arraybuffer'

    ws.onopen = () => {
      try {
        const encoder = encoding.createEncoder()
        encoding.writeVarUint(encoder, 0)
        syncProtocol.writeSyncStep1(encoder, ydoc)
        ws.send(encoding.toUint8Array(encoder))

        const awarenessStates = awareness.getStates()
        if (awarenessStates.size > 0) {
          const enc = encoding.createEncoder()
          encoding.writeVarUint(enc, 1)
          encoding.writeVarUint8Array(enc, awarenessProtocol.encodeAwarenessUpdate(awareness, Array.from(awarenessStates.keys())))
          ws.send(encoding.toUint8Array(enc))
        }
      } catch (e) {
        console.error('Error on WS open sync:', e)
      }
    }

    ws.onmessage = (event) => {
      try {
        const decoder = decoding.createDecoder(new Uint8Array(event.data))
        if (!decoding.hasContent(decoder)) return
        const messageType = decoding.readVarUint(decoder)

        if (messageType === 0) {
          if (!decoding.hasContent(decoder)) return
          const encoder = encoding.createEncoder()
          encoding.writeVarUint(encoder, 0)
          syncProtocol.readSyncMessage(decoder, encoder, ydoc, ws)
          if (encoding.length(encoder) > 1) {
            ws.send(encoding.toUint8Array(encoder))
          }
        } else if (messageType === 1) {
          awarenessProtocol.applyAwarenessUpdate(awareness, decoding.readVarUint8Array(decoder), ws)
        }
      } catch (err) {
        console.warn('⚠️ Ignored WS message safely')
      }
    }

    const updateHandler = (update: Uint8Array, origin: any) => {
      if (origin !== 'remote' && ws.readyState === WebSocket.OPEN) {
        try {
          const encoder = encoding.createEncoder()
          encoding.writeVarUint(encoder, 0)
          syncProtocol.writeUpdate(encoder, update)
          ws.send(encoding.toUint8Array(encoder))
        } catch (e) {
          console.error('Error sending update:', e)
        }
      }
    }
    ydoc.on('update', updateHandler)

    const handleAwarenessChange = () => {
      const states = Array.from(awareness.getStates().values())
      setActiveUsers(states.map((s: any) => s.user).filter(Boolean))
    }
    awareness.on('change', handleAwarenessChange)
    handleAwarenessChange()

    const yCommentsArray = ydoc.getArray('comments')
    const updateComments = () => {
      setComments(yCommentsArray.toArray())
    }
    yCommentsArray.observe(updateComments)
    updateComments()

    return () => {
      ydoc.off('update', updateHandler)
      yCommentsArray.unobserve(updateComments)
      awareness.off('change', handleAwarenessChange)
      if (ws.readyState === WebSocket.OPEN) ws.close()
    }
  }, [])

  useEffect(() => {
    if (editor) {
      editor.setEditable(permission !== 'view')
    }
  }, [permission, editor])

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCommentText.trim() || !userInfo || !ydocRef.current) return

    const yCommentsArray = ydocRef.current.getArray('comments')
    yCommentsArray.push([{
      id: Date.now().toString(),
      text: newCommentText,
      author: userInfo.name,
      avatar: userInfo.avatarUrl,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }])
    setNewCommentText('')
  }

  const handleSaveSnapshot = () => {
    if (!editor) return
    const currentHtml = editor.getHTML()
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
    if (!editor) return
    editor.commands.setContent(content)
    setShowVersionModal(false)
  }

  if (!isMounted) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-gray-500 font-medium animate-pulse">Connecting to collaborative room...</div>
      </div>
    )
  }

  return (
    <div className="main-container">
      {/* Top Header & Global Toolbar */}
      <div className="top-header">
        <div>
          <h1 style={{ fontWeight: 'bold', fontSize: '18px', color: '#0f172a' }}>Collaborative Workspace</h1>
          <p style={{ fontSize: '12px', color: '#64748b' }}>Real-time multi-user document engine</p>
        </div>

        {/* Action Controls */}
        <div className="action-buttons">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f1f5f9', padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
            <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748b' }}>Access:</span>
            <select 
              value={permission} 
              onChange={(e: any) => setPermission(e.target.value)}
              style={{ fontSize: '12px', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '4px 6px', cursor: 'pointer' }}
            >
              <option value="edit">Can Edit</option>
              <option value="comment">Comment Only</option>
              <option value="view">View Only</option>
            </select>
          </div>

          <button 
            onClick={handleSaveSnapshot}
            className="btn-primary"
            style={{ backgroundColor: '#16a34a' }}
          >
            Save Snapshot
          </button>

          <button 
            onClick={() => setShowVersionModal(true)}
            className="btn-secondary"
          >
            Version History ({versions.length})
          </button>
        </div>
      </div>

      {/* Online Users Banner */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#ffffff', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
        <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' }}>Online Users ({activeUsers.length}):</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {activeUsers.map((user, index) => (
            <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '20px', fontSize: '12px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <img 
                src={user.avatarUrl} 
                alt={user.name} 
                style={{ width: '22px', height: '22px', minWidth: '22px', minHeight: '22px', borderRadius: '50%', objectFit: 'cover' }} 
              />
              <span style={{ fontWeight: '600', color: '#1e293b' }}>{user.name}</span>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: user.color }}></span>
            </div>
          ))}
        </div>
      </div>

      {/* Main Layout: Side-by-Side Flexbox */}
      <div className="workspace-layout" style={{ position: 'relative' }}>
        {/* TipTap Editor Box using official EditorContent */}
        <div className="editor-box" style={{ position: 'relative', cursor: 'text' }} onClick={() => editor?.chain().focus().run()}>
          {permission === 'view' && (
            <div style={{ position: 'absolute', top: '12px', right: '12px', background: '#fef08a', color: '#854d0e', fontSize: '11px', padding: '4px 8px', borderRadius: '4px', fontWeight: '600', zIndex: 10 }}>
              View Only Mode
            </div>
          )}
          <h3 style={{ fontSize: '11px', fontWeight: 'bold', color: '#4f46e5', textTransform: 'uppercase', marginBottom: '10px', letterSpacing: '0.05em' }}>Workspace Editor</h3>
          
          <div style={{ minHeight: '420px', width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '12px', background: '#ffffff', color: '#000000' }}>
            <EditorContent editor={editor} />
          </div>
        </div>

        {/* Comments Sidebar */}
        <div className="comments-sidebar">
          <div>
            <h3 style={{ fontSize: '11px', fontWeight: 'bold', color: '#334155', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.05em' }}>Live Comments ({comments.length})</h3>
            
            <div style={{ maxHeight: '360px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {comments.length === 0 ? (
                <p style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic', textAlign: 'center', marginTop: '150px' }}>No comments yet. Start a discussion!</p>
              ) : (
                comments.map((c) => (
                  <div key={c.id} style={{ background: '#f8fafc', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <img 
                          src={c.avatar} 
                          alt={c.author} 
                          style={{ width: '18px', height: '18px', borderRadius: '50%', objectFit: 'cover' }} 
                        />
                        <span style={{ fontWeight: 'bold', color: '#1e293b' }}>{c.author}</span>
                      </div>
                      <span style={{ fontSize: '9px', color: '#94a3b8' }}>{c.timestamp}</span>
                    </div>
                    <p style={{ color: '#475569', paddingLeft: '24px', margin: 0 }}>{c.text}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <form onSubmit={handleAddComment} style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={newCommentText}
              onChange={(e) => setNewCommentText(e.target.value)}
              placeholder={permission === 'view' ? "View only mode..." : "Write a comment..."}
              disabled={permission === 'view'}
              style={{ flex: 1, fontSize: '12px', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '8px', background: '#f8fafc', outline: 'none' }}
            />
            <button
              type="submit"
              disabled={permission === 'view'}
              className="btn-primary"
            >
              Post
            </button>
          </form>
        </div>
      </div>

      {/* Version History Modal */}
      {showVersionModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' }}>
          <div style={{ background: '#ffffff', borderRadius: '12px', maxWidth: '400px', width: '100%', padding: '20px', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 'bold', color: '#1e293b', margin: 0 }}>Document Version History</h3>
              <button 
                onClick={() => setShowVersionModal(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ maxHeight: '250px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
              {versions.length === 0 ? (
                <p style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', padding: '40px 0' }}>No snapshots saved yet. Click 'Save Snapshot' to record versions.</p>
              ) : (
                versions.map((ver) => (
                  <div key={ver.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px' }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontWeight: 'bold', color: '#1e293b', margin: 0 }}>{ver.title}</p>
                      <p style={{ fontSize: '10px', color: '#94a3b8', margin: 0 }}>{ver.time}</p>
                    </div>
                    <button
                      onClick={() => handleRestoreVersion(ver.content)}
                      style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '6px 10px', borderRadius: '4px', fontWeight: '600', cursor: 'pointer', fontSize: '11px' }}
                    >
                      Restore
                    </button>
                  </div>
                ))
              )}
            </div>

            <button
              onClick={() => setShowVersionModal(false)}
              style={{ width: '100%', background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#334155', fontSize: '12px', padding: '10px', borderRadius: '6px', fontWeight: '600', cursor: 'pointer' }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}