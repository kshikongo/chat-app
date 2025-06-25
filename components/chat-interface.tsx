"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, doc, getDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import type { Message, User } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Send } from "lucide-react"

interface ChatInterfaceProps {
  conversationId: string
  currentUser: User
}

export function ChatInterface({ conversationId, currentUser }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState("")
  const [loading, setLoading] = useState(false)
  const [otherParticipant, setOtherParticipant] = useState<User | null>(null)
  const [conversation, setConversation] = useState<any>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Get conversation details
    const getConversation = async () => {
      try {
        const conversationDoc = await getDoc(doc(db, "Conversations", conversationId))
        if (conversationDoc.exists()) {
          const convData = conversationDoc.data()
          setConversation(convData)

          // Find the other participant
          const otherUserId = convData.participants.find((id: string) => id !== currentUser.id)

          if (otherUserId) {
            // Try to get from General collection first
            const generalDoc = await getDoc(doc(db, "General", otherUserId))
            if (generalDoc.exists()) {
              setOtherParticipant({
                id: otherUserId,
                ...generalDoc.data(),
                role: "general",
              } as User)
            } else {
              // Try Admin collection
              const adminDoc = await getDoc(doc(db, "Admins", otherUserId))
              if (adminDoc.exists()) {
                setOtherParticipant({
                  id: otherUserId,
                  ...adminDoc.data(),
                  role: "admin",
                } as User)
              }
            }
          }
        }
      } catch (error) {
        console.error("Error getting conversation:", error)
      }
    }

    getConversation()
  }, [conversationId, currentUser.id])

  useEffect(() => {
    const messagesQuery = query(
      collection(db, "Messages"),
      where("conversationId", "==", conversationId),
      orderBy("timestamp", "asc"),
    )

    const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
      const messageData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate() || new Date(),
      })) as Message[]
      setMessages(messageData)
    })

    return unsubscribe
  }, [conversationId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const sendMessage = async () => {
    if (!newMessage.trim() || !otherParticipant) return

    setLoading(true)
    try {
      await addDoc(collection(db, "Messages"), {
        senderId: currentUser.id,
        receiverId: otherParticipant.id,
        content: newMessage.trim(),
        conversationId,
        timestamp: serverTimestamp(),
        read: false,
      })
      setNewMessage("")
    } catch (error) {
      console.error("Error sending message:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <Card className="h-96 flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Avatar>
              <AvatarFallback>{otherParticipant?.displayName?.charAt(0).toUpperCase() || "U"}</AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-lg">{otherParticipant?.displayName || "Loading..."}</CardTitle>
              {otherParticipant && (
                <Badge variant={otherParticipant.role === "admin" ? "default" : "secondary"} className="text-xs">
                  {otherParticipant.role}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        <div className="flex-1 overflow-y-auto space-y-4 mb-4 p-2">
          {messages.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              <p>No messages yet. Start the conversation!</p>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.senderId === currentUser.id ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                    message.senderId === currentUser.id
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white"
                  }`}
                >
                  <p className="text-sm">{message.content}</p>
                  <p className="text-xs opacity-70 mt-1">{message.timestamp.toLocaleTimeString()}</p>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="flex space-x-2">
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type a message..."
            disabled={loading}
          />
          <Button onClick={sendMessage} disabled={loading || !newMessage.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
