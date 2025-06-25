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
  receiverId: string
  content: string
  timestamp: Date
  read: boolean
  conversationId: string
}

export interface Conversation {
  id: string
  participants: string[]
  lastMessage?: string
  lastMessageTime?: Date
  unreadCount: { [userId: string]: number }
}

export interface AdminStats {
  totalGeneralUsers: number
  totalAdmins: number
  totalMessages: number
  activeUsers: number
}
