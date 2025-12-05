export interface User {
  id: string
  email: string
  displayName: string
  role: "admin" | "general"
  createdAt: Date
  lastActive: Date
  avatar?: string
}

export interface Message {
  id: string
  senderId: string
  receiverId?: string // For DM (make optional for group messages)
  groupId?: string // For group messages (make optional for DM)
  content: string
  timestamp: Date
  read: boolean
  readBy: string[]
  conversationId: string
  type: "text" | "image" | "video" | "audio" | "file" | "system" // Added system type
  fileName?: string
  fileSize?: number
  // New fields
  replyTo?: string // messageId being replied to
  replyToMessage?: Message // populated client-side
  forwardedFrom?: string // userId who originally sent
  forwardedMessageId?: string // original messageId
  forwardedMessage?: Message // populated client-side
  edited: boolean
  editTimestamp?: Date
}

export interface Conversation {
  id: string
  participants: string[]
  lastMessage?: string
  lastMessageTime?: Date
  unreadCount: { [userId: string]: number }
  type: "direct" | "group" // New field
}

export interface Group {
  id: string
  name: string
  description: string
  createdBy: string
  createdAt: Date
  updatedAt: Date
  participants: string[]
  admins: string[]
  avatar?: string
  isActive: boolean
  lastMessage?: string
  lastMessageTime?: Date
  unreadCount?: { [userId: string]: number }
  // Optional: Add these if you want to track group activity
  settings?: {
    allowInvites?: boolean
    allowMedia?: boolean
  }
}

export interface AdminStats {
  totalGeneralUsers: number
  totalAdmins: number
  totalMessages: number
  activeUsers: number
  totalGroups: number
}