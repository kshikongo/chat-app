"use client"

import { useState, useEffect, useRef } from "react"
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  serverTimestamp,
  doc,
  getDoc,
} from "firebase/firestore"
import { db } from "@/lib/firebase"
import type { Message, User } from "@/lib/types"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Send, Smile, Mic, StopCircle } from "lucide-react"
import EmojiPicker from "emoji-picker-react"
import { supabase } from "@/lib/supabase"

interface ChatInterfaceProps {
  conversationId: string
  currentUser: User
}

export function ChatInterface({ conversationId, currentUser }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState("")
  const [otherParticipant, setOtherParticipant] = useState<User | null>(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [recording, setRecording] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const emojiPickerRef = useRef<HTMLDivElement>(null)

  // Fetch other participant
  useEffect(() => {
    const getOtherUser = async () => {
      const convoDoc = await getDoc(doc(db, "Conversations", conversationId))
      const convo = convoDoc.data()
      const otherId = convo?.participants.find((id: string) => id !== currentUser.id)
      if (!otherId) return

      const generalDoc = await getDoc(doc(db, "General", otherId))
      if (generalDoc.exists()) {
        setOtherParticipant({ id: otherId, ...generalDoc.data(), role: "general" } as User)
      } else {
        const adminDoc = await getDoc(doc(db, "Admins", otherId))
        if (adminDoc.exists()) {
          setOtherParticipant({ id: otherId, ...adminDoc.data(), role: "admin" } as User)
        }
      }
    }
    getOtherUser()
  }, [conversationId, currentUser.id])

  // Fetch messages
  useEffect(() => {
    const messagesQuery = query(
      collection(db, "Messages"),
      where("conversationId", "==", conversationId),
      orderBy("timestamp", "asc")
    )
    const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
      const msgData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate() || new Date(),
      })) as Message[]
      setMessages(msgData)
    })
    return unsubscribe
  }, [conversationId])

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Close emoji picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [])

  const sendMessage = async () => {
    if (!newMessage.trim() || !otherParticipant) return
    await addDoc(collection(db, "Messages"), {
      senderId: currentUser.id,
      receiverId: otherParticipant.id,
      content: newMessage.trim(),
      conversationId,
      timestamp: serverTimestamp(),
      read: false,
      type: "text",
    })
    setNewMessage("")
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const handleEmojiClick = (emojiData: any) => {
    setNewMessage((prev) => prev + emojiData.emoji)
  }

  // Audio recording
  const startRecording = async () => {
    setRecording(true)
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const recorder = new MediaRecorder(stream)
    mediaRecorderRef.current = recorder
    audioChunksRef.current = []

    recorder.ondataavailable = (e) => audioChunksRef.current.push(e.data)
    recorder.onstop = async () => {
      setRecording(false)
      const blob = new Blob(audioChunksRef.current, { type: "audio/webm" })
      await sendAudioMessage(blob)
    }

    recorder.start()
  }

  const stopRecording = () => {
    mediaRecorderRef.current?.stop()
  }

  const sendAudioMessage = async (blob: Blob) => {
    if (!otherParticipant) return

    const fileName = `${conversationId}/${Date.now()}.webm`

    const { data, error: uploadError } = await supabase.storage
      .from("Chat-App-VoiceMessages")
      .upload(fileName, blob, { contentType: blob.type })

    if (uploadError) {
      console.error("Supabase upload error:", uploadError)
      return
    }

    const audioUrl = supabase.storage.from("Chat-App-VoiceMessages").getPublicUrl(fileName).data.publicUrl

    await addDoc(collection(db, "Messages"), {
      senderId: currentUser.id,
      receiverId: otherParticipant.id,
      content: audioUrl,
      conversationId,
      timestamp: serverTimestamp(),
      read: false,
      type: "audio",
    })
  }

  return (
    <div className="h-[500px] flex flex-col bg-black rounded-xl text-white shadow-lg overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-800 flex items-center space-x-3 bg-gray-900">
        <Avatar>
          <AvatarFallback>{otherParticipant?.displayName?.charAt(0).toUpperCase() || "U"}</AvatarFallback>
        </Avatar>
        <div>
          <p className="font-semibold">{otherParticipant?.displayName || "Loading..."}</p>
          {otherParticipant && (
            <Badge variant={otherParticipant.role === "admin" ? "default" : "secondary"} className="text-xs">
              {otherParticipant.role}
            </Badge>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-3 bg-black">
        {messages.length === 0 ? (
          <div className="text-center text-gray-400 pt-20">No messages yet. Start the conversation!</div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.senderId === currentUser.id ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-xs px-4 py-2 rounded-lg ${
                  message.senderId === currentUser.id
                    ? "bg-blue-600 text-white"
                    : "bg-gray-700 text-white"
                }`}
              >
                {message.type === "audio" ? (
                  <audio controls src={message.content} className="w-full" />
                ) : (
                  <p className="text-sm">{message.content}</p>
                )}
                <p className="text-xs text-gray-300 mt-1 text-right">
                  {message.timestamp.toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-800 bg-gray-900 relative flex items-center space-x-2">
        <Input
          className="flex-1 bg-gray-800 text-white border-none focus:ring-0 focus:outline-none"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Type a message..."
        />
        <div className="flex items-center space-x-2">
          <div className="relative" ref={emojiPickerRef}>
            <Button
              type="button"
              variant="ghost"
              className="text-gray-400 hover:text-white"
              onClick={() => setShowEmojiPicker((prev) => !prev)}
            >
              <Smile className="h-5 w-5" />
            </Button>
            {showEmojiPicker && (
              <div className="absolute bottom-12 right-0 z-50">
                <EmojiPicker onEmojiClick={handleEmojiClick} theme="dark" />
              </div>
            )}
          </div>

          <Button onClick={sendMessage} disabled={!newMessage.trim()}>
            <Send className="h-4 w-4" />
          </Button>

          {recording ? (
            <Button onClick={stopRecording} className="text-red-500">
              <StopCircle className="h-5 w-5" />
            </Button>
          ) : (
            <Button onClick={startRecording}>
              <Mic className="h-5 w-5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
