import { useState, useEffect, useRef } from "react"
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc as firestoreDoc,
  serverTimestamp,
  getDoc,
  writeBatch,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore"
import { db } from "@/lib/firebase"
import type { Message, User, Group } from "@/lib/types"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { 
  Send, 
  Smile, 
  Mic, 
  StopCircle, 
  Image, 
  Video, 
  File, 
  X, 
  Trash2, 
  Edit3, 
  Check, 
  CheckCheck,
  MoreVertical,
  Download,
  Reply,
  Forward,
  Users,
  UserPlus,
  Settings,
  Crown,
  Shield,
} from "lucide-react"
import EmojiPicker from "emoji-picker-react"
import { supabase } from "@/lib/supabase"

interface ChatInterfaceProps {
  conversationId: string
  currentUser: User
  isGroup?: boolean
}

type MediaView = {
  type: 'image' | 'video' | 'file'
  url: string
  name?: string
}

type ReplyState = {
  messageId: string
  content: string
  senderName: string
}

type ForwardState = {
  message: Message | null
}

type GroupInfo = {
  id: string
  name: string
  description?: string
  participants: string[]
  admins: string[]
  createdBy: string
  createdAt: Date
}

export function ChatInterface({ conversationId, currentUser, isGroup = false }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState("")
  const [otherParticipant, setOtherParticipant] = useState<User | null>(null)
  const [groupInfo, setGroupInfo] = useState<GroupInfo | null>(null)
  const [groupMembers, setGroupMembers] = useState<User[]>([])
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [recording, setRecording] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [mediaPreview, setMediaPreview] = useState<{ url: string; type: 'image' | 'video' | 'file'; file: File } | null>(null)
  const [editingMessage, setEditingMessage] = useState<string | null>(null)
  const [editText, setEditText] = useState("")
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set())
  const [mediaView, setMediaView] = useState<MediaView | null>(null)
  const [messageMenu, setMessageMenu] = useState<string | null>(null)
  const [replyingTo, setReplyingTo] = useState<ReplyState | null>(null)
  const [forwarding, setForwarding] = useState<ForwardState>({ message: null })
  const [showGroupInfo, setShowGroupInfo] = useState(false)
  const [showAddMembers, setShowAddMembers] = useState(false)
  const [availableUsers, setAvailableUsers] = useState<User[]>([])
  const [selectedUsersToAdd, setSelectedUsersToAdd] = useState<Set<string>>(new Set())

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const emojiPickerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const documentInputRef = useRef<HTMLInputElement>(null)

  // Fetch conversation/group data
  useEffect(() => {
    const fetchConversationData = async () => {
      if (isGroup) {
        // Fetch group data
        const groupDoc = await getDoc(firestoreDoc(db, "Groups", conversationId))
        if (groupDoc.exists()) {
          const groupData = groupDoc.data()
          setGroupInfo({
            id: groupDoc.id,
            name: groupData.name,
            description: groupData.description,
            participants: groupData.participants || [],
            admins: groupData.admins || [],
            createdBy: groupData.createdBy,
            createdAt: groupData.createdAt?.toDate() || new Date(),
          })
          
          // Fetch group members
          await fetchGroupMembers(groupData.participants || [])
        }
      } else {
        // Fetch direct conversation data
        const convoDoc = await getDoc(firestoreDoc(db, "Conversations", conversationId))
        const convo = convoDoc.data()
        const otherId = convo?.participants.find((id: string) => id !== currentUser.id)
        if (!otherId) return

        const generalDoc = await getDoc(firestoreDoc(db, "General", otherId))
        if (generalDoc.exists()) {
          setOtherParticipant({ 
            id: otherId, 
            ...generalDoc.data(), 
            role: "general",
            createdAt: generalDoc.data().createdAt?.toDate(),
            lastActive: generalDoc.data().lastActive?.toDate(),
          } as User)
        } else {
          const adminDoc = await getDoc(firestoreDoc(db, "Admins", otherId))
          if (adminDoc.exists()) {
            setOtherParticipant({ 
              id: otherId, 
              ...adminDoc.data(), 
              role: "admin",
              createdAt: adminDoc.data().createdAt?.toDate(),
              lastActive: adminDoc.data().lastActive?.toDate(),
            } as User)
          }
        }
      }
    }
    fetchConversationData()
  }, [conversationId, currentUser.id, isGroup])

  // Fetch group members
  const fetchGroupMembers = async (participantIds: string[]) => {
    const members: User[] = []
    
    for (const userId of participantIds) {
      try {
        const generalDoc = await getDoc(firestoreDoc(db, "General", userId))
        if (generalDoc.exists()) {
          members.push({ 
            id: userId, 
            ...generalDoc.data(), 
            role: "general",
            createdAt: generalDoc.data().createdAt?.toDate(),
            lastActive: generalDoc.data().lastActive?.toDate(),
          } as User)
        } else {
          const adminDoc = await getDoc(firestoreDoc(db, "Admins", userId))
          if (adminDoc.exists()) {
            members.push({ 
              id: userId, 
              ...adminDoc.data(), 
              role: "admin",
              createdAt: adminDoc.data().createdAt?.toDate(),
              lastActive: adminDoc.data().lastActive?.toDate(),
            } as User)
          }
        }
      } catch (error) {
        console.error(`Error fetching user ${userId}:`, error)
      }
    }
    
    setGroupMembers(members)
  }

  // Fetch available users for adding to group
  const fetchAvailableUsers = async () => {
    try {
      const [generalSnapshot, adminSnapshot] = await Promise.all([
        getDoc(firestoreDoc(db, "General")),
        getDoc(firestoreDoc(db, "Admins"))
      ])

      const users: User[] = []
      
      if (generalSnapshot.exists()) {
        const generalData = generalSnapshot.data()
        Object.entries(generalData).forEach(([userId, userData]) => {
          if (!groupInfo?.participants.includes(userId) && userId !== currentUser.id) {
            users.push({
              id: userId,
              ...userData as any,
              role: "general"
            })
          }
        })
      }

      if (adminSnapshot.exists()) {
        const adminData = adminSnapshot.data()
        Object.entries(adminData).forEach(([userId, userData]) => {
          if (!groupInfo?.participants.includes(userId) && userId !== currentUser.id) {
            users.push({
              id: userId,
              ...userData as any,
              role: "admin"
            })
          }
        })
      }

      setAvailableUsers(users)
    } catch (error) {
      console.error("Error fetching available users:", error)
    }
  }

  // Fetch messages with replies - optimized version
  useEffect(() => {
    const messagesQuery = query(
      collection(db, "Messages"),
      where("conversationId", "==", conversationId),
      orderBy("timestamp", "asc")
    )
    
    const unsubscribe = onSnapshot(messagesQuery, async (snapshot) => {
      const baseMessages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate() || new Date(),
        editTimestamp: doc.data().editTimestamp?.toDate(),
      })) as Message

      // Collect all replyTo and forwardedMessageIds to fetch in batch
      const replyIds = new Set<string>()
      const forwardIds = new Set<string>()
      
      baseMessages.forEach(message => {
        if (message.replyTo) replyIds.add(message.replyTo)
        if (message.forwardedMessageId) forwardIds.add(message.forwardedMessageId)
      })

      // Fetch all related messages in parallel
      const [replyMessages, forwardedMessages] = await Promise.all([
        fetchRelatedMessages(Array.from(replyIds)),
        fetchRelatedMessages(Array.from(forwardIds))
      ])

      // Combine messages with their related data
      const enrichedMessages = baseMessages.map(message => ({
        ...message,
        replyToMessage: message.replyTo ? replyMessages.get(message.replyTo) : undefined,
        forwardedMessage: message.forwardedMessageId ? forwardedMessages.get(message.forwardedMessageId) : undefined,
      }))

      setMessages(enrichedMessages)
    })
    
    return unsubscribe
  }, [conversationId])

  // Helper function to fetch related messages
  const fetchRelatedMessages = async (messageIds: string[]): Promise<Map<string, Message>> => {
    if (messageIds.length === 0) return new Map()

    const messagesMap = new Map<string, Message>()
    
    await Promise.all(
      messageIds.map(async (messageId) => {
        try {
          const messageDoc = await getDoc(firestoreDoc(db, "Messages", messageId))
          if (messageDoc.exists()) {
            messagesMap.set(messageId, {
              id: messageDoc.id,
              ...messageDoc.data(),
              timestamp: messageDoc.data().timestamp?.toDate() || new Date(),
              editTimestamp: messageDoc.data().editTimestamp?.toDate(),
            } as Message)
          }
        } catch (error) {
          console.error(`Error fetching message ${messageId}:`, error)
        }
      })
    )
    
    return messagesMap
  }

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Close pickers when clicking outside
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
    if (!newMessage.trim()) return
    
    const messageData: any = {
      senderId: currentUser.id,
      content: newMessage.trim(),
      conversationId,
      timestamp: serverTimestamp(),
      read: false,
      readBy: [currentUser.id],
      type: "text",
      edited: false,
    }

    // Add receiver data for direct messages
    if (!isGroup && otherParticipant) {
      messageData.receiverId = otherParticipant.id
    }

    // Add reply data if replying
    if (replyingTo) {
      messageData.replyTo = replyingTo.messageId
    }

    // Add forward data if forwarding
    if (forwarding.message) {
      messageData.forwardedFrom = forwarding.message.senderId
      messageData.forwardedMessageId = forwarding.message.id
    }

    await addDoc(collection(db, "Messages"), messageData)
    setNewMessage("")
    setReplyingTo(null)
    setForwarding({ message: null })
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const handleEmojiClick = (emojiData: any) => {
    setNewMessage((prev) => prev + emojiData.emoji)
    setShowEmojiPicker(false)
  }

  // Message Actions
  const startEditMessage = (message: Message) => {
    setEditingMessage(message.id)
    setEditText(message.content)
    setMessageMenu(null)
  }

  const saveEditMessage = async () => {
    if (!editingMessage || !editText.trim()) return

    await updateDoc(firestoreDoc(db, "Messages", editingMessage), {
      content: editText.trim(),
      edited: true,
      editTimestamp: serverTimestamp(),
    })

    setEditingMessage(null)
    setEditText("")
  }

  const cancelEdit = () => {
    setEditingMessage(null)
    setEditText("")
  }

  const deleteMessage = async (messageId: string) => {
    await deleteDoc(firestoreDoc(db, "Messages", messageId))
    setMessageMenu(null)
  }

  const deleteSelectedMessages = async () => {
    const batch = writeBatch(db)
    selectedMessages.forEach(messageId => {
      const messageRef = firestoreDoc(db, "Messages", messageId)
      batch.delete(messageRef)
    })
    await batch.commit()
    setSelectedMessages(new Set())
  }

  const deleteAllMessages = async () => {
    const batch = writeBatch(db)
    messages.forEach(message => {
      const messageRef = firestoreDoc(db, "Messages", message.id)
      batch.delete(messageRef)
    })
    await batch.commit()
    setSelectedMessages(new Set())
  }

  const toggleMessageSelection = (messageId: string) => {
    const newSelected = new Set(selectedMessages)
    if (newSelected.has(messageId)) {
      newSelected.delete(messageId)
    } else {
      newSelected.add(messageId)
    }
    setSelectedMessages(newSelected)
  }

  // Reply functionality
  const startReply = (message: Message) => {
    setReplyingTo({
      messageId: message.id,
      content: message.content.substring(0, 100) + (message.content.length > 100 ? '...' : ''),
      senderName: getSenderName(message.senderId)
    })
    setMessageMenu(null)
  }

  const cancelReply = () => {
    setReplyingTo(null)
  }

  // Forward functionality
  const startForward = (message: Message) => {
    setForwarding({ message })
    setMessageMenu(null)
  }

  const cancelForward = () => {
    setForwarding({ message: null })
  }

  const getSenderName = (senderId: string) => {
    if (senderId === currentUser.id) return "You"
    
    if (isGroup) {
      const member = groupMembers.find(m => m.id === senderId)
      return member?.displayName || "Unknown User"
    }
    
    return otherParticipant?.displayName || "Unknown User"
  }

  const getSenderRole = (senderId: string) => {
    if (isGroup && groupInfo) {
      if (groupInfo.admins.includes(senderId)) {
        return senderId === groupInfo.createdBy ? "creator" : "admin"
      }
    }
    return "member"
  }

  // Group Management Functions
  const addMembersToGroup = async () => {
    if (!groupInfo || selectedUsersToAdd.size === 0) return

    try {
      const newParticipants = Array.from(selectedUsersToAdd)
      const updatedParticipants = [...groupInfo.participants, ...newParticipants]

      await updateDoc(firestoreDoc(db, "Groups", groupInfo.id), {
        participants: updatedParticipants,
        updatedAt: serverTimestamp(),
      })

      // Send system message
      const newMembersNames = newParticipants.map(userId => {
        const user = availableUsers.find(u => u.id === userId)
        return user?.displayName || "Unknown User"
      }).join(", ")

      await addDoc(collection(db, "Messages"), {
        senderId: "system",
        content: `${currentUser.displayName} added ${newMembersNames} to the group`,
        conversationId,
        timestamp: serverTimestamp(),
        type: "system",
      })

      setSelectedUsersToAdd(new Set())
      setShowAddMembers(false)
      
      // Refresh group members
      await fetchGroupMembers(updatedParticipants)
    } catch (error) {
      console.error("Error adding members to group:", error)
    }
  }

  const removeMemberFromGroup = async (memberId: string) => {
    if (!groupInfo || !isGroupAdmin()) return

    try {
      const updatedParticipants = groupInfo.participants.filter(id => id !== memberId)
      const updatedAdmins = groupInfo.admins.filter(id => id !== memberId)

      await updateDoc(firestoreDoc(db, "Groups", groupInfo.id), {
        participants: updatedParticipants,
        admins: updatedAdmins,
        updatedAt: serverTimestamp(),
      })

      const member = groupMembers.find(m => m.id === memberId)
      
      // Send system message
      await addDoc(collection(db, "Messages"), {
        senderId: "system",
        content: `${currentUser.displayName} removed ${member?.displayName || "a member"} from the group`,
        conversationId,
        timestamp: serverTimestamp(),
        type: "system",
      })

      // Refresh group members
      await fetchGroupMembers(updatedParticipants)
    } catch (error) {
      console.error("Error removing member from group:", error)
    }
  }

  const promoteToAdmin = async (memberId: string) => {
    if (!groupInfo || !isGroupCreator()) return

    try {
      await updateDoc(firestoreDoc(db, "Groups", groupInfo.id), {
        admins: arrayUnion(memberId),
        updatedAt: serverTimestamp(),
      })

      const member = groupMembers.find(m => m.id === memberId)
      
      // Send system message
      await addDoc(collection(db, "Messages"), {
        senderId: "system",
        content: `${currentUser.displayName} promoted ${member?.displayName || "a member"} to admin`,
        conversationId,
        timestamp: serverTimestamp(),
        type: "system",
      })
    } catch (error) {
      console.error("Error promoting member to admin:", error)
    }
  }

  const demoteFromAdmin = async (memberId: string) => {
    if (!groupInfo || !isGroupCreator() || memberId === groupInfo.createdBy) return

    try {
      await updateDoc(firestoreDoc(db, "Groups", groupInfo.id), {
        admins: arrayRemove(memberId),
        updatedAt: serverTimestamp(),
      })

      const member = groupMembers.find(m => m.id === memberId)
      
      // Send system message
      await addDoc(collection(db, "Messages"), {
        senderId: "system",
        content: `${currentUser.displayName} removed admin role from ${member?.displayName || "a member"}`,
        conversationId,
        timestamp: serverTimestamp(),
        type: "system",
      })
    } catch (error) {
      console.error("Error demoting admin:", error)
    }
  }

  const leaveGroup = async () => {
    if (!groupInfo) return

    try {
      const updatedParticipants = groupInfo.participants.filter(id => id !== currentUser.id)
      const updatedAdmins = groupInfo.admins.filter(id => id !== currentUser.id)

      await updateDoc(firestoreDoc(db, "Groups", groupInfo.id), {
        participants: updatedParticipants,
        admins: updatedAdmins,
        updatedAt: serverTimestamp(),
      })

      // Send system message
      await addDoc(collection(db, "Messages"), {
        senderId: "system",
        content: `${currentUser.displayName} left the group`,
        conversationId,
        timestamp: serverTimestamp(),
        type: "system",
      })
    } catch (error) {
      console.error("Error leaving group:", error)
    }
  }

  const isGroupAdmin = () => {
    return groupInfo?.admins.includes(currentUser.id) || false
  }

  const isGroupCreator = () => {
    return groupInfo?.createdBy === currentUser.id
  }

  const toggleUserSelectionForAdd = (userId: string) => {
    const newSelected = new Set(selectedUsersToAdd)
    if (newSelected.has(userId)) {
      newSelected.delete(userId)
    } else {
      newSelected.add(userId)
    }
    setSelectedUsersToAdd(newSelected)
  }

  // Audio recording
  const startRecording = async () => {
    try {
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
        stream.getTracks().forEach(track => track.stop())
      }

      recorder.start()
    } catch (error) {
      console.error("Error starting recording:", error)
      setRecording(false)
    }
  }

  const stopRecording = () => {
    mediaRecorderRef.current?.stop()
  }

  const sendAudioMessage = async (blob: Blob) => {
    const fileName = `${conversationId}/${Date.now()}.webm`

    const { data, error: uploadError } = await supabase.storage
      .from("Chat-App-VoiceMessages")
      .upload(fileName, blob, { contentType: blob.type })

    if (uploadError) {
      console.error("Supabase upload error:", uploadError)
      return
    }

    const audioUrl = supabase.storage.from("Chat-App-VoiceMessages").getPublicUrl(fileName).data.publicUrl

    const messageData: any = {
      senderId: currentUser.id,
      content: audioUrl,
      conversationId,
      timestamp: serverTimestamp(),
      read: false,
      readBy: [currentUser.id],
      type: "audio",
    }

    if (!isGroup && otherParticipant) {
      messageData.receiverId = otherParticipant.id
    }

    await addDoc(collection(db, "Messages"), messageData)
  }

  // File handling
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file)
      setMediaPreview({ url, type: 'image', file })
    }
    if (e.target) e.target.value = ''
  }

  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && file.type.startsWith('video/')) {
      const url = URL.createObjectURL(file)
      setMediaPreview({ url, type: 'video', file })
    }
    if (e.target) e.target.value = ''
  }

  const handleDocumentSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const url = URL.createObjectURL(file)
      setMediaPreview({ url, type: 'file', file })
    }
    if (e.target) e.target.value = ''
  }

  const clearMediaPreview = () => {
    if (mediaPreview?.url) {
      URL.revokeObjectURL(mediaPreview.url)
    }
    setMediaPreview(null)
  }

  const uploadMedia = async () => {
    if (!mediaPreview) return

    setUploading(true)
    try {
      const fileExtension = mediaPreview.file.name.split('.').pop()
      const fileName = `${conversationId}/${Date.now()}.${fileExtension}`
      
      let bucket = 'Chat-App-Files'
      if (mediaPreview.type === 'image') bucket = 'Chat-App-Images'
      else if (mediaPreview.type === 'video') bucket = 'Chat-App-Videos'

      const { data, error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(fileName, mediaPreview.file, {
          contentType: mediaPreview.file.type,
          cacheControl: '3600'
        })

      if (uploadError) {
        console.error("Supabase upload error:", uploadError)
        return
      }

      const mediaUrl = supabase.storage.from(bucket).getPublicUrl(fileName).data.publicUrl

      const messageData: any = {
        senderId: currentUser.id,
        content: mediaUrl,
        conversationId,
        timestamp: serverTimestamp(),
        read: false,
        readBy: [currentUser.id],
        type: mediaPreview.type,
        fileName: mediaPreview.file.name,
        fileSize: mediaPreview.file.size,
      }

      if (!isGroup && otherParticipant) {
        messageData.receiverId = otherParticipant.id
      }

      await addDoc(collection(db, "Messages"), messageData)

      clearMediaPreview()
    } catch (error) {
      console.error("Error uploading media:", error)
    } finally {
      setUploading(false)
    }
  }

  // View media in modal
  const openMediaView = (message: Message) => {
    setMediaView({
      type: message.type as 'image' | 'video' | 'file',
      url: message.content,
      name: message.fileName
    })
  }

  const closeMediaView = () => {
    setMediaView(null)
  }

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase()
    if (['pdf'].includes(ext || '')) return '📄'
    if (['doc', 'docx'].includes(ext || '')) return '📝'
    if (['xls', 'xlsx'].includes(ext || '')) return '📊'
    if (['zip', 'rar'].includes(ext || '')) return '📦'
    return '📎'
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const renderMessageContent = (message: Message) => {
    // System messages
    if (message.senderId === "system") {
      return (
        <div className="text-center">
          <p className="text-xs text-gray-400 italic bg-gray-800/50 rounded-lg px-3 py-1 inline-block">
            {message.content}
          </p>
        </div>
      )
    }

    // Reply preview
    if (message.replyToMessage) {
      return (
        <div className="space-y-2">
          <div className="bg-black/20 rounded-lg p-2 border-l-4 border-blue-500">
            <p className="text-xs text-blue-300 font-medium">
              Replying to {getSenderName(message.replyToMessage.senderId)}
            </p>
            <p className="text-xs text-gray-300 truncate">
              {message.replyToMessage.type === 'text' 
                ? message.replyToMessage.content
                : `Sent a ${message.replyToMessage.type}`
              }
            </p>
          </div>
          {renderMainMessageContent(message)}
        </div>
      )
    }

    // Forward preview
    if (message.forwardedMessage) {
      return (
        <div className="space-y-2">
          <div className="bg-black/20 rounded-lg p-2 border-l-4 border-green-500">
            <p className="text-xs text-green-300 font-medium">
              Forwarded from {getSenderName(message.forwardedMessage.senderId)}
            </p>
            {renderMainMessageContent(message.forwardedMessage, true)}
          </div>
        </div>
      )
    }

    return renderMainMessageContent(message)
  }

  const renderMainMessageContent = (message: Message, isForwarded = false) => {
    const content = isForwarded ? message : message

    switch (content.type) {
      case "audio":
        return (
          <div className="space-y-2">
            <audio 
              controls 
              src={content.content} 
              className="w-full min-w-[240px] h-10 rounded-lg"
            />
          </div>
        )
      case "image":
        return (
          <div 
            className="space-y-2 cursor-pointer transform transition-transform hover:scale-[1.02]"
            onClick={() => openMediaView(content)}
          >
            <img 
              src={content.content} 
              alt="Shared image" 
              className="rounded-xl max-w-full h-auto max-h-64 object-cover shadow-lg"
            />
          </div>
        )
      case "video":
        return (
          <div 
            className="space-y-2 cursor-pointer transform transition-transform hover:scale-[1.02]"
            onClick={() => openMediaView(content)}
          >
            <video 
              controls 
              src={content.content} 
              className="rounded-xl max-w-full h-auto max-h-64 shadow-lg"
            />
          </div>
        )
      case "file":
        return (
          <div 
            className="space-y-2 cursor-pointer p-4 bg-gray-700/50 rounded-xl backdrop-blur-sm border border-gray-600/50 hover:bg-gray-700 transition-all duration-200"
            onClick={() => openMediaView(content)}
          >
            <div className="flex items-center space-x-4">
              <div className="text-3xl bg-gray-600/50 p-3 rounded-lg">
                {getFileIcon(content.fileName || 'file')}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate text-white">{content.fileName}</p>
                <p className="text-xs text-gray-300 mt-1">
                  {formatFileSize(content.fileSize || 0)}
                </p>
              </div>
              <Download className="h-5 w-5 text-gray-400" />
            </div>
          </div>
        )
      default:
        return (
          <div>
            <p className="text-sm leading-relaxed">{content.content}</p>
            {content.edited && (
              <span className="text-xs text-blue-200/70 mr-2">(edited)</span>
            )}
          </div>
        )
    }
  }

  return (
    <div className="h-[600px] flex flex-col bg-gradient-to-br from-gray-900 via-black to-gray-900 rounded-2xl border border-gray-800 shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-gray-800 bg-gradient-to-r from-gray-900 to-black backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="relative">
              <Avatar className="h-12 w-12 ring-2 ring-blue-500/20 ring-offset-2 ring-offset-black">
                <AvatarFallback className="bg-gradient-to-br from-blue-600 to-purple-600 text-white font-semibold">
                  {isGroup ? (
                    <Users className="h-6 w-6" />
                  ) : (
                    otherParticipant?.displayName?.charAt(0).toUpperCase() || "U"
                  )}
                </AvatarFallback>
              </Avatar>
              <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-black bg-green-500" />
            </div>
            <div>
              <h2 className="font-bold text-lg text-white">
                {isGroup ? groupInfo?.name : otherParticipant?.displayName || "Loading..."}
              </h2>
              {isGroup ? (
                <div className="flex items-center space-x-2 mt-1">
                  <Badge className="bg-gradient-to-r from-purple-500/20 to-blue-500/20 text-purple-300 border-purple-500/30">
                    {groupMembers.length} members
                  </Badge>
                  {isGroupAdmin() && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowGroupInfo(true)}
                      className="text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-xl px-3"
                    >
                      <Settings className="h-3 w-3 mr-1" />
                      Manage
                    </Button>
                  )}
                </div>
              ) : (
                otherParticipant && (
                  <Badge 
                    variant={otherParticipant.role === "admin" ? "default" : "secondary"} 
                    className="mt-1 bg-gradient-to-r from-blue-500/20 to-purple-500/20 text-blue-300 border-blue-500/30"
                  >
                    {otherParticipant.role}
                  </Badge>
                )
              )}
            </div>
          </div>

          {/* Bulk Actions */}
          {selectedMessages.size > 0 && (
            <div className="flex items-center space-x-3 bg-gray-800/50 rounded-xl px-4 py-2 backdrop-blur-sm">
              <span className="text-sm text-gray-300 font-medium">{selectedMessages.size} selected</span>
              <div className="h-4 w-px bg-gray-600" />
              <Button
                variant="outline"
                size="sm"
                onClick={deleteSelectedMessages}
                className="bg-red-500/10 text-red-300 border-red-500/30 hover:bg-red-500 hover:text-white transition-all duration-200"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedMessages(new Set())}
                className="bg-gray-700/50 text-gray-300 border-gray-600 hover:bg-gray-600 hover:text-white transition-all duration-200"
              >
                Cancel
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 bg-gradient-to-b from-gray-900/50 to-black">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
            <div className="w-24 h-24 bg-gradient-to-br from-gray-800 to-gray-900 rounded-full flex items-center justify-center border border-gray-800">
              <div className="text-3xl">💬</div>
            </div>
            <div>
              <p className="text-gray-400 text-lg font-medium">No messages yet</p>
              <p className="text-gray-500 text-sm">Start the conversation by sending a message!</p>
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.senderId === currentUser.id ? "justify-end" : "justify-start"} group relative`}
            >
              <div
                className={`max-w-md px-4 py-3 rounded-2xl relative transition-all duration-200 ${
                  message.senderId === "system"
                    ? "w-full max-w-2xl mx-auto text-center"
                    : message.senderId === currentUser.id
                    ? "bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-500/25"
                    : "bg-gray-800/80 text-white shadow-lg shadow-black/25 backdrop-blur-sm"
                } ${
                  selectedMessages.has(message.id) ? 'ring-2 ring-yellow-400 shadow-2xl' : ''
                }`}
                onClick={() => selectedMessages.size > 0 && toggleMessageSelection(message.id)}
              >
                {/* Group Message Sender Info */}
                {isGroup && message.senderId !== "system" && message.senderId !== currentUser.id && (
                  <div className="flex items-center space-x-2 mb-2">
                    <span className="text-xs font-medium text-white/80">
                      {getSenderName(message.senderId)}
                    </span>
                    {getSenderRole(message.senderId) === "creator" && (
                      <Crown className="h-3 w-3 text-yellow-400" />
                    )}
                    {getSenderRole(message.senderId) === "admin" && (
                      <Shield className="h-3 w-3 text-blue-400" />
                    )}
                  </div>
                )}

                {/* Message Menu */}
                {messageMenu === message.id && message.senderId !== "system" && (
                  <div className="absolute top-12 right-0 bg-gray-800 rounded-xl shadow-2xl border border-gray-700 z-10 py-2 min-w-[140px] backdrop-blur-sm">
                    <button
                      onClick={() => startReply(message)}
                      className="flex items-center space-x-3 w-full px-4 py-2 text-sm hover:bg-gray-700/50 transition-colors duration-150"
                    >
                      <Reply className="h-4 w-4" />
                      <span>Reply</span>
                    </button>
                    <button
                      onClick={() => startForward(message)}
                      className="flex items-center space-x-3 w-full px-4 py-2 text-sm hover:bg-gray-700/50 transition-colors duration-150"
                    >
                      <Forward className="h-4 w-4" />
                      <span>Forward</span>
                    </button>
                    {message.senderId === currentUser.id && (
                      <>
                        <div className="h-px bg-gray-700 my-1" />
                        <button
                          onClick={() => startEditMessage(message)}
                          className="flex items-center space-x-3 w-full px-4 py-2 text-sm hover:bg-gray-700/50 transition-colors duration-150"
                        >
                          <Edit3 className="h-4 w-4" />
                          <span>Edit</span>
                        </button>
                        <button
                          onClick={() => deleteMessage(message.id)}
                          className="flex items-center space-x-3 w-full px-4 py-2 text-sm hover:bg-red-500/10 text-red-300 transition-colors duration-150"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span>Delete</span>
                        </button>
                      </>
                    )}
                    <div className="h-px bg-gray-700 my-1" />
                    <button
                      onClick={() => toggleMessageSelection(message.id)}
                      className="flex items-center space-x-3 w-full px-4 py-2 text-sm hover:bg-gray-700/50 transition-colors duration-150"
                    >
                      <Check className="h-4 w-4" />
                      <span>Select</span>
                    </button>
                  </div>
                )}

                {/* Message Content */}
                {editingMessage === message.id ? (
                  <div className="space-y-3">
                    <Input
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      className="bg-white text-black border-gray-300 focus:ring-blue-500"
                      autoFocus
                    />
                    <div className="flex space-x-2">
                      <Button size="sm" onClick={saveEditMessage} className="bg-blue-600 hover:bg-blue-700">
                        Save
                      </Button>
                      <Button size="sm" variant="outline" onClick={cancelEdit} className="border-gray-600 text-gray-300">
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    {renderMessageContent(message)}

                    {/* Message Footer */}
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/10">
                      <p className="text-xs text-white/60">
                        {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                      <div className="flex items-center space-x-1">
                        {message.senderId === currentUser.id && message.senderId !== "system" && (
                          <>
                            {message.read ? (
                              <CheckCheck className="h-3 w-3 text-blue-200" />
                            ) : (
                              <Check className="h-3 w-3 text-white/40" />
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {/* Message Menu Button */}
                {!editingMessage && message.senderId !== "system" && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setMessageMenu(messageMenu === message.id ? null : message.id)
                    }}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-all duration-200 p-1.5 rounded-lg bg-black/20 hover:bg-black/40 backdrop-blur-sm"
                  >
                    <MoreVertical className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Group Info Modal */}
      {showGroupInfo && groupInfo && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 backdrop-blur-sm p-4">
          <div className="bg-gray-900 rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-800 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold text-white">Group Info</h3>
              <Button 
                variant="ghost" 
                onClick={() => setShowGroupInfo(false)}
                className="text-gray-400 hover:text-white hover:bg-gray-800 rounded-xl"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="space-y-6">
              {/* Group Details */}
              <div className="bg-gray-800/50 rounded-xl p-4">
                <h4 className="font-semibold text-white mb-3">Group Details</h4>
                <div className="space-y-2">
                  <div>
                    <label className="text-sm text-gray-400">Group Name</label>
                    <p className="text-white font-medium">{groupInfo.name}</p>
                  </div>
                  {groupInfo.description && (
                    <div>
                      <label className="text-sm text-gray-400">Description</label>
                      <p className="text-white">{groupInfo.description}</p>
                    </div>
                  )}
                  <div>
                    <label className="text-sm text-gray-400">Created</label>
                    <p className="text-white">{groupInfo.createdAt.toLocaleDateString()}</p>
                  </div>
                </div>
              </div>

              {/* Group Members */}
              <div className="bg-gray-800/50 rounded-xl p-4">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-semibold text-white">Members ({groupMembers.length})</h4>
                  {isGroupAdmin() && (
                    <Button
                      onClick={() => {
                        fetchAvailableUsers()
                        setShowAddMembers(true)
                      }}
                      className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl"
                    >
                      <UserPlus className="h-4 w-4 mr-2" />
                      Add Members
                    </Button>
                  )}
                </div>
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {groupMembers.map((member) => (
                    <div key={member.id} className="flex items-center justify-between p-3 bg-gray-700/30 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white text-xs">
                            {member.displayName?.charAt(0).toUpperCase() || "U"}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-white font-medium text-sm">{member.displayName}</p>
                          <p className="text-gray-400 text-xs">{member.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {member.id === groupInfo.createdBy && (
                          <Badge className="bg-yellow-500/20 text-yellow-300 border-yellow-500/30">
                            <Crown className="h-3 w-3 mr-1" />
                            Creator
                          </Badge>
                        )}
                        {groupInfo.admins.includes(member.id) && member.id !== groupInfo.createdBy && (
                          <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30">
                            <Shield className="h-3 w-3 mr-1" />
                            Admin
                          </Badge>
                        )}
                        
                        {isGroupCreator() && member.id !== currentUser.id && (
                          <div className="flex space-x-1">
                            {!groupInfo.admins.includes(member.id) ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => promoteToAdmin(member.id)}
                                className="text-xs border-blue-500/30 text-blue-300 hover:bg-blue-500/20"
                              >
                                Make Admin
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => demoteFromAdmin(member.id)}
                                className="text-xs border-orange-500/30 text-orange-300 hover:bg-orange-500/20"
                              >
                                Remove Admin
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => removeMemberFromGroup(member.id)}
                              className="text-xs border-red-500/30 text-red-300 hover:bg-red-500/20"
                            >
                              Remove
                            </Button>
                          </div>
                        )}
                        
                        {member.id === currentUser.id && !isGroupCreator() && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={leaveGroup}
                            className="text-xs border-red-500/30 text-red-300 hover:bg-red-500/20"
                          >
                            Leave
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Members Modal */}
      {showAddMembers && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 backdrop-blur-sm p-4">
          <div className="bg-gray-900 rounded-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto border border-gray-800 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold text-white">Add Members</h3>
              <Button 
                variant="ghost" 
                onClick={() => setShowAddMembers(false)}
                className="text-gray-400 hover:text-white hover:bg-gray-800 rounded-xl"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="space-y-4">
              <div className="max-h-64 overflow-y-auto space-y-2">
                {availableUsers.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center space-x-3 p-3 bg-gray-800/50 rounded-lg cursor-pointer hover:bg-gray-700/50 transition-colors duration-150"
                    onClick={() => toggleUserSelectionForAdd(user.id)}
                  >
                    {selectedUsersToAdd.has(user.id) ? (
                      <CheckSquare className="h-5 w-5 text-green-500" />
                    ) : (
                      <Square className="h-5 w-5 text-gray-400" />
                    )}
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white text-xs">
                        {user.displayName?.charAt(0).toUpperCase() || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium text-sm truncate">{user.displayName}</p>
                      <p className="text-gray-400 text-xs truncate">{user.email}</p>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {user.role}
                    </Badge>
                  </div>
                ))}
              </div>

              <div className="flex space-x-3 pt-4">
                <Button
                  onClick={() => setShowAddMembers(false)}
                  variant="outline"
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={addMembersToGroup}
                  disabled={selectedUsersToAdd.size === 0}
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                >
                  Add Selected ({selectedUsersToAdd.size})
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reply Preview */}
      {replyingTo && (
        <div className="p-4 border-t border-gray-800 bg-gray-900/80 backdrop-blur-sm">
          <div className="flex items-center justify-between p-3 bg-blue-500/10 rounded-xl border border-blue-500/30">
            <div className="flex-1">
              <p className="text-xs text-blue-300 font-medium">Replying to {replyingTo.senderName}</p>
              <p className="text-sm text-gray-300 truncate">{replyingTo.content}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={cancelReply}
              className="text-gray-400 hover:text-white"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Forward Preview */}
      {forwarding.message && (
        <div className="p-4 border-t border-gray-800 bg-gray-900/80 backdrop-blur-sm">
          <div className="flex items-center justify-between p-3 bg-green-500/10 rounded-xl border border-green-500/30">
            <div className="flex-1">
              <p className="text-xs text-green-300 font-medium">Forwarding message</p>
              <p className="text-sm text-gray-300 truncate">
                {forwarding.message.type === 'text' 
                  ? forwarding.message.content
                  : `Forwarding ${forwarding.message.type}`
                }
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={cancelForward}
              className="text-gray-400 hover:text-white"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Media View Modal */}
      {mediaView && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-gray-900 rounded-2xl p-6 max-w-4xl max-h-[90vh] border border-gray-800 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold text-white">
                {mediaView.type === 'file' ? mediaView.name : `${mediaView.type.charAt(0).toUpperCase() + mediaView.type.slice(1)} View`}
              </h3>
              <Button 
                variant="ghost" 
                onClick={closeMediaView}
                className="text-gray-400 hover:text-white hover:bg-gray-800 rounded-xl"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="max-h-[70vh] overflow-auto rounded-xl">
              {mediaView.type === 'image' && (
                <img src={mediaView.url} alt="Media" className="max-w-full max-h-full rounded-lg" />
              )}
              {mediaView.type === 'video' && (
                <video controls src={mediaView.url} className="max-w-full max-h-full rounded-lg" />
              )}
              {mediaView.type === 'file' && (
                <div className="text-center p-12">
                  <div className="text-8xl mb-6">{getFileIcon(mediaView.name || 'file')}</div>
                  <p className="text-xl font-medium text-white mb-2">{mediaView.name}</p>
                  <Button asChild className="bg-blue-600 hover:bg-blue-700 mt-4 rounded-xl">
                    <a href={mediaView.url} download target="_blank" rel="noopener noreferrer">
                      <Download className="h-4 w-4 mr-2" />
                      Download File
                    </a>
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Media Preview */}
      {mediaPreview && (
        <div className="p-4 border-t border-gray-800 bg-gray-900/80 backdrop-blur-sm relative">
          <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-xl border border-gray-700">
            <div className="flex items-center space-x-4 flex-1">
              {mediaPreview.type === 'image' ? (
                <img 
                  src={mediaPreview.url} 
                  alt="Preview" 
                  className="rounded-lg h-20 w-20 object-cover"
                />
              ) : mediaPreview.type === 'video' ? (
                <video 
                  src={mediaPreview.url} 
                  className="rounded-lg h-20 w-20 object-cover"
                />
              ) : (
                <div className="h-20 w-20 bg-gray-700 rounded-lg flex items-center justify-center">
                  <File className="h-8 w-8 text-gray-400" />
                </div>
              )}
              <div className="flex-1">
                <p className="font-medium text-white text-sm">{mediaPreview.file.name}</p>
                <p className="text-gray-400 text-xs mt-1">
                  {formatFileSize(mediaPreview.file.size)}
                </p>
              </div>
            </div>
            <div className="flex space-x-3">
              <Button 
                onClick={uploadMedia} 
                disabled={uploading}
                className="bg-green-600 hover:bg-green-700 text-white rounded-xl px-6"
              >
                {uploading ? (
                  <div className="flex items-center space-x-2">
                    <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Uploading...</span>
                  </div>
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Send
              </Button>
              <Button 
                onClick={clearMediaPreview} 
                variant="outline" 
                className="border-gray-600 text-gray-300 hover:bg-gray-700 rounded-xl"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="p-6 border-t border-gray-800 bg-gradient-to-t from-gray-900 to-black backdrop-blur-sm">
        <div className="flex items-end space-x-4">
          {/* Attachment Buttons */}
          <div className="flex space-x-2">
            <input type="file" ref={fileInputRef} onChange={handleImageSelect} accept="image/*" className="hidden" />
            <input type="file" ref={videoInputRef} onChange={handleVideoSelect} accept="video/*" className="hidden" />
            <input type="file" ref={documentInputRef} onChange={handleDocumentSelect} className="hidden" />
            
            <Button
              type="button"
              variant="ghost"
              className="text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-xl p-3 transition-all duration-200"
              onClick={() => fileInputRef.current?.click()}
            >
              <Image className="h-5 w-5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="text-gray-400 hover:text-green-400 hover:bg-green-500/10 rounded-xl p-3 transition-all duration-200"
              onClick={() => videoInputRef.current?.click()}
            >
              <Video className="h-5 w-5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="text-gray-400 hover:text-purple-400 hover:bg-purple-500/10 rounded-xl p-3 transition-all duration-200"
              onClick={() => documentInputRef.current?.click()}
            >
              <File className="h-5 w-5" />
            </Button>
          </div>

          {/* Message Input */}
          <div className="flex-1 relative">
            <Input
              className="w-full bg-gray-800/50 border-gray-700 text-white placeholder-gray-400 rounded-2xl px-4 py-3 pr-24 backdrop-blur-sm focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all duration-200"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type your message..."
            />
            
            <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center space-x-2">
              {/* Emoji Picker */}
              <div className="relative" ref={emojiPickerRef}>
                <Button
                  type="button"
                  variant="ghost"
                  className="text-gray-400 hover:text-yellow-400 hover:bg-yellow-500/10 rounded-xl p-2 transition-all duration-200"
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

              {/* Recording Button */}
              {recording ? (
                <Button 
                  onClick={stopRecording} 
                  className="bg-red-500 hover:bg-red-600 text-white rounded-xl px-4 animate-pulse"
                >
                  <StopCircle className="h-5 w-5" />
                </Button>
              ) : (
                <Button 
                  onClick={startRecording}
                  className="text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl p-2 transition-all duration-200"
                >
                  <Mic className="h-5 w-5" />
                </Button>
              )}

              {/* Send Button */}
              <Button 
                onClick={sendMessage} 
                disabled={!newMessage.trim()}
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-4 transition-all duration-200 disabled:bg-gray-700 disabled:text-gray-400"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Delete All Button */}
      {messages.length > 0 && selectedMessages.size === 0 && (
        <div className="p-4 border-t border-gray-800 bg-gradient-to-t from-gray-900 to-black flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={deleteAllMessages}
            className="bg-red-500/10 text-red-300 border-red-500/30 hover:bg-red-500 hover:text-white transition-all duration-200 rounded-xl px-6"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete All Messages
          </Button>
        </div>
      )}
    </div>
  )
}