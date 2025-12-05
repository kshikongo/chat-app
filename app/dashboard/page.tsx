"use client"

import { useAuth } from "@/contexts/auth-context"
import { useRouter } from "next/navigation"
import { useEffect, useState, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { LogOut, Menu, Users, MessageCircle, UserPlus, Settings, Search, X, Trash2, Check, CheckSquare, Square, Plus, Send, Paperclip, Smile, MoreVertical } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ThemeToggle } from "@/components/theme-toggle"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChatInterface } from "@/components/chat-interface"
import { Input } from "@/components/ui/input"

import { db, auth } from "@/lib/firebase"
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc, 
  writeBatch, 
  updateDoc,
  getDoc,
  orderBy,
  serverTimestamp 
} from "firebase/firestore"
import {
  updateProfile,
  updateEmail,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from "firebase/auth"
import type { User, Conversation, Group, Message } from "@/lib/types"

// Group Chat Interface Component
const GroupChatInterface = ({ groupId, currentUser }: { groupId: string, currentUser: User }) => {
  const [group, setGroup] = useState<Group | null>(null)
  const [groupMembers, setGroupMembers] = useState<User[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState("")
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [showMembers, setShowMembers] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Fetch group data and members
  useEffect(() => {
    const fetchGroupData = async () => {
      try {
        const groupDoc = await getDoc(doc(db, "Groups", groupId))
        if (groupDoc.exists()) {
          const groupData = { 
            id: groupDoc.id, 
            ...groupDoc.data(),
            createdAt: groupDoc.data().createdAt?.toDate(),
            updatedAt: groupDoc.data().updatedAt?.toDate(),
            lastMessageTime: groupDoc.data().lastMessageTime?.toDate(),
          } as Group
          setGroup(groupData)
          
          // Fetch group members
          const membersData: User[] = []
          for (const userId of groupData.participants) {
            try {
              const generalDoc = await getDoc(doc(db, "General", userId))
              if (generalDoc.exists()) {
                membersData.push({ 
                  id: userId, 
                  ...generalDoc.data(), 
                  role: "general",
                  createdAt: generalDoc.data().createdAt?.toDate(),
                  lastActive: generalDoc.data().lastActive?.toDate(),
                } as User)
              } else {
                const adminDoc = await getDoc(doc(db, "Admins", userId))
                if (adminDoc.exists()) {
                  membersData.push({ 
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
          setGroupMembers(membersData)
        }
      } catch (error) {
        console.error("Error fetching group data:", error)
      } finally {
        setLoading(false)
      }
    }
    
    fetchGroupData()
  }, [groupId])

  // Listen for messages
  useEffect(() => {
    if (!groupId) return

    const messagesQuery = query(
      collection(db, "Groups", groupId, "messages"),
      orderBy("timestamp", "asc")
    )

    const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
      const messagesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate(),
      })) as Message[]
      
      setMessages(messagesData)
      
      // Scroll to bottom when new messages arrive
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
      }, 100)
    })

    return () => unsubscribe()
  }, [groupId])

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const sendMessage = async () => {
    if (!newMessage.trim() || !group || !currentUser) return

    setSending(true)
    try {
      await addDoc(collection(db, "Groups", groupId, "messages"), {
        text: newMessage.trim(),
        senderId: currentUser.id,
        senderName: currentUser.displayName,
        timestamp: serverTimestamp(),
        type: "text"
      })

      // Update group's last message and timestamp
      await updateDoc(doc(db, "Groups", groupId), {
        lastMessage: newMessage.trim(),
        lastMessageTime: serverTimestamp(),
        updatedAt: serverTimestamp()
      })

      setNewMessage("")
    } catch (error) {
      console.error("Error sending message:", error)
      alert("Error sending message. Please try again.")
    } finally {
      setSending(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const getSenderName = (senderId: string) => {
    if (senderId === currentUser.id) return "You"
    const member = groupMembers.find(m => m.id === senderId)
    return member?.displayName || "Unknown User"
  }

  const getSenderInitials = (senderId: string) => {
    if (senderId === currentUser.id) {
      return currentUser.displayName?.charAt(0).toUpperCase() || "Y"
    }
    const member = groupMembers.find(m => m.id === senderId)
    return member?.displayName?.charAt(0).toUpperCase() || "U"
  }

  const getSenderColor = (senderId: string) => {
    // Generate consistent color based on sender ID
    const colors = [
      "from-blue-500 to-blue-600",
      "from-green-500 to-green-600",
      "from-purple-500 to-purple-600",
      "from-orange-500 to-orange-600",
      "from-pink-500 to-pink-600",
      "from-teal-500 to-teal-600",
      "from-indigo-500 to-indigo-600",
      "from-red-500 to-red-600"
    ]
    
    const index = senderId.split('').reduce((a, b) => a + b.charCodeAt(0), 0) % colors.length
    return colors[index]
  }

  const formatTime = (timestamp: Date) => {
    return new Date(timestamp).toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    })
  }

  if (loading) {
    return (
      <Card className="h-full bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 shadow-lg">
        <CardContent className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-500 dark:text-gray-400">Loading group chat...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!group) {
    return (
      <Card className="h-full bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 shadow-lg">
        <CardContent className="flex items-center justify-center h-96">
          <div className="text-center">
            <Users className="h-16 w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">Group Not Found</h3>
            <p className="text-gray-500 dark:text-gray-400">The group you're looking for doesn't exist.</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Group Header */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="relative">
              <div className="h-12 w-12 bg-gradient-to-br from-purple-600 to-purple-800 rounded-full flex items-center justify-center text-white font-semibold">
                <Users className="h-6 w-6" />
              </div>
              <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-white dark:border-gray-800 bg-green-500" />
            </div>
            <div>
              <h2 className="font-bold text-lg text-gray-900 dark:text-white">{group.name}</h2>
              <div className="flex items-center space-x-2 mt-1">
                <Badge variant="secondary" className="bg-gradient-to-r from-purple-500/20 to-blue-500/20 text-purple-700 dark:text-purple-300 border-purple-500/30">
                  {groupMembers.length} members
                </Badge>
                {group.description && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 truncate max-w-xs">
                    {group.description}
                  </p>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowMembers(!showMembers)}
              className="rounded-xl"
            >
              <Users className="h-4 w-4 mr-2" />
              Members
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat Messages */}
        <div className="flex-1 flex flex-col">
          {/* Messages Container */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50/50 dark:bg-gray-900/50">
            {messages.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Send className="h-6 w-6 text-gray-400 dark:text-gray-500" />
                </div>
                <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  No messages yet
                </h3>
                <p className="text-gray-500 dark:text-gray-400">
                  Be the first to start the conversation in {group.name}!
                </p>
              </div>
            ) : (
              messages.map((message, index) => {
                const isCurrentUser = message.senderId === currentUser.id
                const showSenderInfo = index === 0 || 
                  messages[index - 1].senderId !== message.senderId ||
                  (message.timestamp!.getTime() - messages[index - 1].timestamp!.getTime()) > 300000 // 5 minutes

                return (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-xs lg:max-w-md ${isCurrentUser ? 'ml-12' : 'mr-12'}`}>
                      {/* Sender Info */}
                      {!isCurrentUser && showSenderInfo && (
                        <div className="flex items-center space-x-2 mb-1">
                          <div className={`w-6 h-6 ${getSenderColor(message.senderId)} rounded-full flex items-center justify-center text-white text-xs font-semibold`}>
                            {getSenderInitials(message.senderId)}
                          </div>
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            {getSenderName(message.senderId)}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {formatTime(message.timestamp!)}
                          </span>
                        </div>
                      )}
                      
                      {/* Message Bubble */}
                      <div className={`rounded-2xl p-4 ${
                        isCurrentUser 
                          ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-br-none' 
                          : 'bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white rounded-bl-none'
                      } shadow-sm`}>
                        <p className="text-sm whitespace-pre-wrap break-words">{message.text}</p>
                        
                        {/* Timestamp for current user */}
                        {isCurrentUser && (
                          <div className="text-right mt-2">
                            <span className={`text-xs ${
                              isCurrentUser ? 'text-blue-100' : 'text-gray-500'
                            }`}>
                              {formatTime(message.timestamp!)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Message Input */}
          <div className="p-6 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            <div className="flex space-x-4">
              <div className="flex-1 relative">
                <Input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder={`Message ${group.name}...`}
                  className="pr-12 py-3 rounded-xl border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  disabled={sending}
                />
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex space-x-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    <Paperclip className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    <Smile className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <Button
                onClick={sendMessage}
                disabled={!newMessage.trim() || sending}
                className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-xl px-6 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Members Sidebar */}
        <AnimatePresence>
          {showMembers && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 300, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden"
            >
              <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900 dark:text-white">Group Members</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowMembers(false)}
                    className="h-8 w-8 p-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="relative mt-3">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    placeholder="Search members..."
                    className="pl-10 pr-4 py-2 text-sm rounded-xl border-gray-300 dark:border-gray-600"
                  />
                </div>
              </div>
              
              <div className="overflow-y-auto h-full pb-4">
                <div className="p-4 space-y-3">
                  {groupMembers.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center space-x-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-200"
                    >
                      <div className="relative">
                        <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold">
                          {member.displayName?.charAt(0).toUpperCase() || "U"}
                        </div>
                        <div className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-white dark:border-gray-800 bg-green-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 dark:text-white truncate">
                          {member.displayName}
                          {member.id === currentUser.id && (
                            <span className="text-blue-600 dark:text-blue-400 text-xs ml-2">(You)</span>
                          )}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                          {member.email}
                        </p>
                      </div>
                      <Badge 
                        variant="secondary" 
                        className={`text-xs ${
                          group.admins?.includes(member.id) 
                            ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' 
                            : 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300'
                        }`}
                      >
                        {group.admins?.includes(member.id) ? 'Admin' : 'Member'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { user, loading, logout } = useAuth()
  const router = useRouter()

  // Sidebar / tabs
  const [activeTab, setActiveTab] = useState<"general-users" | "chats" | "groups" | "admins" | "settings" | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Chat + users
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [generalUsers, setGeneralUsers] = useState<User[]>([])
  const [adminUsers, setAdminUsers] = useState<User[]>([])
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null)
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")

  // Conversation selection and deletion
  const [selectedConversations, setSelectedConversations] = useState<Set<string>>(new Set())
  const [isSelectMode, setIsSelectMode] = useState(false)

  // Group creation
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState("")
  const [newGroupDescription, setNewGroupDescription] = useState("")
  const [selectedUsersForGroup, setSelectedUsersForGroup] = useState<Set<string>>(new Set())
  const [creatingGroup, setCreatingGroup] = useState(false)

  // Profile
  const [displayName, setDisplayName] = useState(user?.displayName || "")
  const [email, setEmail] = useState(user?.email || "")
  const [password, setPassword] = useState("")
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    if (!loading && (!user || user.role !== "general")) {
      router.push("/login")
    }
  }, [user, loading, router])

  // Firestore listeners
  useEffect(() => {
    if (!user) return

    // Direct conversations
    const conversationsQuery = query(collection(db, "Conversations"), where("participants", "array-contains", user.id))
    const unsubscribeConversations = onSnapshot(conversationsQuery, (snapshot) => {
      const conversationData = snapshot.docs.map((doc) => ({ 
        id: doc.id, 
        ...doc.data(),
        lastMessageTime: doc.data().lastMessageTime?.toDate(),
      })) as Conversation[]
      setConversations(conversationData)
    })

    // Groups where user is participant
    const groupsQuery = query(collection(db, "Groups"), where("participants", "array-contains", user.id))
    const unsubscribeGroups = onSnapshot(groupsQuery, (snapshot) => {
      const groupData = snapshot.docs.map((doc) => ({ 
        id: doc.id, 
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
        updatedAt: doc.data().updatedAt?.toDate(),
        lastMessageTime: doc.data().lastMessageTime?.toDate(),
      })) as Group[]
      setGroups(groupData)
    })

    const generalQuery = query(collection(db, "General"))
    const unsubscribeGeneral = onSnapshot(generalQuery, (snapshot) => {
      setGeneralUsers(
        snapshot.docs
          .map((doc) => ({ 
            id: doc.id, 
            ...doc.data(), 
            role: "general",
            createdAt: doc.data().createdAt?.toDate(),
            lastActive: doc.data().lastActive?.toDate(),
          }))
          .filter((u) => u.id !== user.id) as User[],
      )
    })

    const adminsQuery = query(collection(db, "Admins"))
    const unsubscribeAdmins = onSnapshot(adminsQuery, (snapshot) => {
      setAdminUsers(snapshot.docs.map((doc) => ({ 
        id: doc.id, 
        ...doc.data(), 
        role: "admin",
        createdAt: doc.data().createdAt?.toDate(),
        lastActive: doc.data().lastActive?.toDate(),
      })) as User[])
    })

    return () => {
      unsubscribeConversations()
      unsubscribeGroups()
      unsubscribeGeneral()
      unsubscribeAdmins()
    }
  }, [user])

  // Filter users based on search term
  const filteredGeneralUsers = generalUsers.filter(user => 
    user.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const filteredAdminUsers = adminUsers.filter(user =>
    user.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const filteredConversations = conversations.filter(conv => {
    const otherId = conv.participants.find((id: string) => id !== user?.id)
    const otherUser = [...generalUsers, ...adminUsers].find((u) => u.id === otherId)
    return otherUser?.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
           otherUser?.email?.toLowerCase().includes(searchTerm.toLowerCase())
  })

  const filteredGroups = groups.filter(group =>
    group.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    group.description?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Start new conversation
  const startConversation = async (otherUserId: string) => {
    if (!user) return
    
    try {
      const existingConversation = conversations.find(
        (conv) => conv.participants.includes(otherUserId) && conv.participants.includes(user.id),
      )
      if (existingConversation) {
        setSelectedConversation(existingConversation.id)
        setSelectedGroup(null)
        setActiveTab("chats")
      } else {
        const conversationRef = await addDoc(collection(db, "Conversations"), {
          participants: [user.id, otherUserId],
          lastMessage: "",
          lastMessageTime: new Date(),
          unreadCount: {
            [user.id]: 0,
            [otherUserId]: 0,
          },
          type: "direct",
        })
        setSelectedConversation(conversationRef.id)
        setSelectedGroup(null)
        setActiveTab("chats")
      }
    } catch (err) {
      console.error("Error starting conversation:", err)
    }
  }

  // Group management
  const toggleUserSelection = (userId: string) => {
    const newSelected = new Set(selectedUsersForGroup)
    if (newSelected.has(userId)) {
      newSelected.delete(userId)
    } else {
      newSelected.add(userId)
    }
    setSelectedUsersForGroup(newSelected)
  }

  const createGroup = async () => {
    if (!user || !newGroupName.trim() || selectedUsersForGroup.size === 0) {
      alert("Please provide a group name and select at least one member")
      return
    }

    setCreatingGroup(true)
    try {
      const participants = Array.from(selectedUsersForGroup)
      participants.push(user.id) // Add current user as participant and admin

      const groupRef = await addDoc(collection(db, "Groups"), {
        name: newGroupName.trim(),
        description: newGroupDescription.trim(),
        createdBy: user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
        participants: participants,
        admins: [user.id],
        isActive: true,
      })

      // Reset form
      setNewGroupName("")
      setNewGroupDescription("")
      setSelectedUsersForGroup(new Set())
      setShowCreateGroup(false)
      
      // Select the new group
      setSelectedGroup(groupRef.id)
      setSelectedConversation(null)
      setActiveTab("groups")
    } catch (error) {
      console.error("Error creating group:", error)
      alert("Error creating group. Please try again.")
    } finally {
      setCreatingGroup(false)
    }
  }

  // Select group for chatting
  const selectGroup = (groupId: string) => {
    setSelectedGroup(groupId)
    setSelectedConversation(null)
  }

  // Conversation selection and deletion
  const toggleConversationSelection = (conversationId: string) => {
    const newSelected = new Set(selectedConversations)
    if (newSelected.has(conversationId)) {
      newSelected.delete(conversationId)
    } else {
      newSelected.add(conversationId)
    }
    setSelectedConversations(newSelected)
  }

  const selectAllConversations = () => {
    if (selectedConversations.size === filteredConversations.length) {
      setSelectedConversations(new Set())
    } else {
      setSelectedConversations(new Set(filteredConversations.map(conv => conv.id)))
    }
  }

  const deleteSelectedConversations = async () => {
    if (selectedConversations.size === 0) return

    const confirmDelete = window.confirm(
      `Are you sure you want to delete ${selectedConversations.size} conversation${selectedConversations.size > 1 ? 's' : ''}? This action cannot be undone.`
    )

    if (!confirmDelete) return

    try {
      const batch = writeBatch(db)
      selectedConversations.forEach(conversationId => {
        const conversationRef = doc(db, "Conversations", conversationId)
        batch.delete(conversationRef)
      })
      await batch.commit()
      
      // Clear selection and exit select mode
      setSelectedConversations(new Set())
      setIsSelectMode(false)
      
      // If the currently selected conversation was deleted, clear it
      if (selectedConversation && selectedConversations.has(selectedConversation)) {
        setSelectedConversation(null)
      }
    } catch (error) {
      console.error("Error deleting conversations:", error)
      alert("Error deleting conversations. Please try again.")
    }
  }

  const deleteSingleConversation = async (conversationId: string, otherUserName: string) => {
    const confirmDelete = window.confirm(
      `Are you sure you want to delete your conversation with ${otherUserName}? This action cannot be undone.`
    )

    if (!confirmDelete) return

    try {
      await deleteDoc(doc(db, "Conversations", conversationId))
      
      // If the deleted conversation was currently selected, clear it
      if (selectedConversation === conversationId) {
        setSelectedConversation(null)
      }
    } catch (error) {
      console.error("Error deleting conversation:", error)
      alert("Error deleting conversation. Please try again.")
    }
  }

  const deleteAllConversations = async () => {
    if (conversations.length === 0) return

    const confirmDelete = window.confirm(
      `Are you sure you want to delete all ${conversations.length} conversations? This action cannot be undone.`
    )

    if (!confirmDelete) return

    try {
      const batch = writeBatch(db)
      conversations.forEach(conversation => {
        const conversationRef = doc(db, "Conversations", conversation.id)
        batch.delete(conversationRef)
      })
      await batch.commit()
      
      setSelectedConversation(null)
      setSelectedConversations(new Set())
      setIsSelectMode(false)
    } catch (error) {
      console.error("Error deleting all conversations:", error)
      alert("Error deleting all conversations. Please try again.")
    }
  }

  const exitSelectMode = () => {
    setIsSelectMode(false)
    setSelectedConversations(new Set())
  }

  // Profile update
  const handleUpdateProfile = async () => {
    const currentUser = auth.currentUser
    if (!currentUser) return alert("No authenticated user found.")

    setUpdating(true)
    try {
      if ((email !== currentUser.email) || password.trim()) {
        const reauthPassword = prompt("Please confirm your current password")
        if (!reauthPassword) throw new Error("Reauthentication required.")

        const credential = EmailAuthProvider.credential(currentUser.email!, reauthPassword)
        await reauthenticateWithCredential(currentUser, credential)
      }

      if (displayName !== currentUser.displayName) {
        await updateProfile(currentUser, { displayName })
      }
      if (email !== currentUser.email) {
        await updateEmail(currentUser, email)
      }
      if (password.trim()) {
        await updatePassword(currentUser, password)
      }

      alert("Profile updated successfully!")
    } catch (err: any) {
      console.error("Error updating profile:", err)
      alert(err.message)
    } finally {
      setUpdating(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-gray-600 dark:text-gray-300">Loading your dashboard...</p>
        </div>
      </div>
    )
  }

  if (!user || user.role !== "general") return null

  const allUsers = [...generalUsers, ...adminUsers]

  const tabConfig = {
    "general-users": { icon: Users, title: "General Users", color: "from-blue-500 to-blue-600" },
    "chats": { icon: MessageCircle, title: "My Chats", color: "from-green-500 to-green-600" },
    "groups": { icon: Users, title: "Groups", color: "from-purple-500 to-purple-600" },
    "admins": { icon: UserPlus, title: "Administrators", color: "from-orange-500 to-orange-600" },
    "settings": { icon: Settings, title: "Settings", color: "from-red-500 to-red-600" }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-gray-100 to-gray-200 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      {/* HEADER */}
      <header className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-md border-b border-gray-200/50 dark:border-gray-700/50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-4">
              <Button 
                variant="ghost" 
                onClick={() => setSidebarOpen(true)}
                className="rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-200"
              >
                <Menu className="h-5 w-5" />
              </Button>
              <div className="hidden md:block">
                <h1 className="text-xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 dark:from-gray-100 dark:to-gray-300 bg-clip-text text-transparent">
                  Dashboard
                </h1>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{user.displayName}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">General User</p>
              </div>
              <ThemeToggle />
              <Button 
                variant="outline" 
                onClick={logout}
                className="rounded-xl border-gray-300 dark:border-gray-600 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 transition-all duration-200"
              >
                <LogOut className="h-4 w-4 mr-2" /> 
                <span className="hidden sm:inline">Logout</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* SIDEBAR DRAWER */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
            />
            <motion.div
              className="fixed top-0 left-0 w-80 h-full bg-white dark:bg-gray-800 shadow-xl z-50 p-6 border-r border-gray-200 dark:border-gray-700"
              initial={{ x: -320 }}
              animate={{ x: 0 }}
              exit={{ x: -320 }}
              transition={{ type: "spring", damping: 25 }}
            >
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 dark:from-gray-100 dark:to-gray-300 bg-clip-text text-transparent">
                  Navigation
                </h2>
                <Button
                  variant="ghost"
                  onClick={() => setSidebarOpen(false)}
                  className="rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
              
              <nav className="space-y-2">
                {Object.entries(tabConfig).map(([tab, config]) => {
                  const Icon = config.icon
                  return (
                    <Button
                      key={tab}
                      variant={activeTab === tab ? "default" : "ghost"}
                      className={`w-full justify-start py-3 px-4 rounded-xl transition-all duration-200 ${
                        activeTab === tab 
                          ? `bg-gradient-to-r ${config.color} text-white shadow-lg` 
                          : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200'
                      }`}
                      onClick={() => {
                        setActiveTab(tab as any)
                        setSidebarOpen(false)
                      }}
                    >
                      <Icon className="h-5 w-5 mr-3" />
                      <span className="font-medium">{config.title}</span>
                    </Button>
                  )
                })}
              </nav>

              {/* User Info in Sidebar */}
              <div className="absolute bottom-6 left-6 right-6 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-200 dark:border-gray-600">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold">
                    {user.displayName?.charAt(0).toUpperCase() || "U"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {user.displayName}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {user.email}
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* MAIN CONTENT */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === null && (
          <div className="text-center py-20">
            <div className="w-24 h-24 bg-gradient-to-br from-gray-300 to-gray-400 dark:from-gray-600 dark:to-gray-700 rounded-full flex items-center justify-center mx-auto mb-6">
              <div className="text-3xl">👋</div>
            </div>
            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-4">
              Welcome to Your Dashboard
            </h2>
            <p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">
              Open the menu to start chatting with other users or administrators.
            </p>
          </div>
        )}

        {/* Search Bar for List Views */}
        {(activeTab === "general-users" || activeTab === "admins" || activeTab === "chats" || activeTab === "groups") && (
          <div className="mb-6">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                type="text"
                placeholder={`Search ${tabConfig[activeTab]?.title.toLowerCase()}...`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 rounded-xl bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        )}

        {activeTab === "general-users" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 shadow-lg">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center space-x-3">
                  <div className="p-2 bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg">
                    <Users className="h-5 w-5 text-white" />
                  </div>
                  <span>General Users</span>
                  <Badge variant="secondary" className="ml-2 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                    {filteredGeneralUsers.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {filteredGeneralUsers.length === 0 ? (
                  <div className="text-center py-12">
                    <Users className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                    <p className="text-gray-500 dark:text-gray-400">
                      {searchTerm ? "No users match your search." : "No general users found."}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredGeneralUsers.map((u) => (
                      <Card key={u.id} className="p-5 bg-gradient-to-br from-gray-50 to-white dark:from-gray-700/50 dark:to-gray-800 border border-gray-200/50 dark:border-gray-600/50 hover:shadow-md transition-all duration-200">
                        <div className="flex flex-col items-center text-center space-y-3">
                          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold text-lg">
                            {u.displayName?.charAt(0).toUpperCase() || "U"}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900 dark:text-white">{u.displayName}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-[200px]">{u.email}</p>
                          </div>
                          <Button 
                            onClick={() => startConversation(u.id)} 
                            className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-xl transition-all duration-200"
                          >
                            <MessageCircle className="h-4 w-4 mr-2" /> 
                            Start Chat
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {activeTab === "chats" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="grid grid-cols-1 xl:grid-cols-3 gap-6"
          >
            <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 shadow-lg xl:col-span-1">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center space-x-3">
                    <div className="p-2 bg-gradient-to-r from-green-500 to-green-600 rounded-lg">
                      <MessageCircle className="h-5 w-5 text-white" />
                    </div>
                    <span>My Conversations</span>
                    <Badge variant="secondary" className="ml-2 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                      {filteredConversations.length}
                    </Badge>
                  </CardTitle>
                  
                  {/* Conversation Actions */}
                  <div className="flex items-center space-x-2">
                    {isSelectMode ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={selectAllConversations}
                          className="text-xs"
                        >
                          {selectedConversations.size === filteredConversations.length ? (
                            <CheckSquare className="h-3 w-3 mr-1" />
                          ) : (
                            <Square className="h-3 w-3 mr-1" />
                          )}
                          {selectedConversations.size === filteredConversations.length ? 'Deselect All' : 'Select All'}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={exitSelectMode}
                          className="text-xs"
                        >
                          Cancel
                        </Button>
                        {selectedConversations.size > 0 && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={deleteSelectedConversations}
                            className="text-xs"
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            Delete ({selectedConversations.size})
                          </Button>
                        )}
                      </>
                    ) : (
                      <>
                        {filteredConversations.length > 0 && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setIsSelectMode(true)}
                              className="text-xs"
                            >
                              <Check className="h-3 w-3 mr-1" />
                              Select
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={deleteAllConversations}
                              className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-3 w-3 mr-1" />
                              Delete All
                            </Button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {filteredConversations.length === 0 ? (
                  <div className="text-center py-12">
                    <MessageCircle className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                    <p className="text-gray-500 dark:text-gray-400">
                      {searchTerm ? "No conversations match your search." : "No conversations yet."}
                    </p>
                    <Button 
                      onClick={() => setActiveTab("general-users")}
                      className="mt-4 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700"
                    >
                      Start a Conversation
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredConversations.map((conv) => {
                      const otherId = conv.participants.find((id: string) => id !== user.id)
                      const otherUser = allUsers.find((u) => u.id === otherId)
                      const otherUserName = otherUser?.displayName || "Unknown User"

                      return (
                        <div
                          key={conv.id}
                          className={`relative p-4 rounded-xl transition-all duration-200 border ${
                            selectedConversation === conv.id && !isSelectMode
                              ? 'bg-gradient-to-r from-green-500 to-green-600 text-white shadow-lg border-green-500'
                              : isSelectMode && selectedConversations.has(conv.id)
                              ? 'bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700'
                              : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600'
                          }`}
                        >
                          <div className="flex items-center space-x-3">
                            {/* Selection Checkbox */}
                            {isSelectMode && (
                              <button
                                onClick={() => toggleConversationSelection(conv.id)}
                                className="flex-shrink-0"
                              >
                                {selectedConversations.has(conv.id) ? (
                                  <CheckSquare className="h-5 w-5 text-green-600 dark:text-green-400" />
                                ) : (
                                  <Square className="h-5 w-5 text-gray-400" />
                                )}
                              </button>
                            )}

                            {/* Conversation Info */}
                            <button
                              onClick={() => {
                                if (isSelectMode) {
                                  toggleConversationSelection(conv.id)
                                } else {
                                  setSelectedConversation(conv.id)
                                }
                              }}
                              className="flex items-center space-x-3 flex-1 text-left"
                            >
                              <div className="w-10 h-10 bg-gradient-to-br from-gray-400 to-gray-600 rounded-full flex items-center justify-center text-white text-sm font-semibold">
                                {otherUserName.charAt(0).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={`font-medium truncate ${
                                  selectedConversation === conv.id && !isSelectMode ? 'text-white' : 'text-gray-900 dark:text-white'
                                }`}>
                                  {otherUserName}
                                </p>
                                <p className={`text-xs truncate ${
                                  selectedConversation === conv.id && !isSelectMode ? 'text-green-100' : 'text-gray-500 dark:text-gray-400'
                                }`}>
                                  {otherUser?.role}
                                </p>
                              </div>
                            </button>

                            {/* Delete Button (visible in non-select mode) */}
                            {!isSelectMode && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  deleteSingleConversation(conv.id, otherUserName)
                                }}
                                className={`flex-shrink-0 ${
                                  selectedConversation === conv.id 
                                    ? 'text-white hover:bg-green-600' 
                                    : 'text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20'
                                }`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
            
            <div className="xl:col-span-2">
              {selectedConversation ? (
                <ChatInterface conversationId={selectedConversation} currentUser={user} />
              ) : (
                <Card className="h-full bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 shadow-lg">
                  <CardContent className="flex items-center justify-center h-96">
                    <div className="text-center">
                      <MessageCircle className="h-16 w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">No Conversation Selected</h3>
                      <p className="text-gray-500 dark:text-gray-400">Choose a conversation from the list to start messaging</p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </motion.div>
        )}

        {activeTab === "groups" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="grid grid-cols-1 xl:grid-cols-3 gap-6"
          >
            <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 shadow-lg xl:col-span-1">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center space-x-3">
                    <div className="p-2 bg-gradient-to-r from-purple-500 to-purple-600 rounded-lg">
                      <Users className="h-5 w-5 text-white" />
                    </div>
                    <span>My Groups</span>
                    <Badge variant="secondary" className="ml-2 bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                      {filteredGroups.length}
                    </Badge>
                  </CardTitle>
                  
                  <Button
                    onClick={() => setShowCreateGroup(true)}
                    className="bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white rounded-xl"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create Group
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {filteredGroups.length === 0 ? (
                  <div className="text-center py-12">
                    <Users className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                    <p className="text-gray-500 dark:text-gray-400">
                      {searchTerm ? "No groups match your search." : "No groups yet."}
                    </p>
                    <Button 
                      onClick={() => setShowCreateGroup(true)}
                      className="mt-4 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700"
                    >
                      Create Your First Group
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredGroups.map((group) => (
                      <div
                        key={group.id}
                        className={`relative p-4 rounded-xl transition-all duration-200 border ${
                          selectedGroup === group.id
                            ? 'bg-gradient-to-r from-purple-500 to-purple-600 text-white shadow-lg border-purple-500'
                            : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600'
                        }`}
                      >
                        <button
                          onClick={() => selectGroup(group.id)}
                          className="flex items-center space-x-3 w-full text-left"
                        >
                          <div className="w-10 h-10 bg-gradient-to-br from-purple-400 to-purple-600 rounded-full flex items-center justify-center text-white text-sm font-semibold">
                            <Users className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`font-medium truncate ${
                              selectedGroup === group.id ? 'text-white' : 'text-gray-900 dark:text-white'
                            }`}>
                              {group.name}
                            </p>
                            <p className={`text-xs truncate ${
                              selectedGroup === group.id ? 'text-purple-100' : 'text-gray-500 dark:text-gray-400'
                            }`}>
                              {group.participants.length} members
                            </p>
                            {group.description && (
                              <p className={`text-xs truncate ${
                                selectedGroup === group.id ? 'text-purple-200' : 'text-gray-400 dark:text-gray-500'
                              }`}>
                                {group.description}
                              </p>
                            )}
                          </div>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            
            <div className="xl:col-span-2">
              {selectedGroup ? (
                <GroupChatInterface groupId={selectedGroup} currentUser={user} />
              ) : (
                <Card className="h-full bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 shadow-lg">
                  <CardContent className="flex items-center justify-center h-96">
                    <div className="text-center">
                      <Users className="h-16 w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">No Group Selected</h3>
                      <p className="text-gray-500 dark:text-gray-400">Choose a group from the list or create a new one to start messaging</p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </motion.div>
        )}

        {/* Create Group Modal */}
        {showCreateGroup && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Create New Group</h3>
                <Button
                  variant="ghost"
                  onClick={() => setShowCreateGroup(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                    Group Name *
                  </label>
                  <Input
                    type="text"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="Enter group name"
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                    Description (Optional)
                  </label>
                  <Input
                    type="text"
                    value={newGroupDescription}
                    onChange={(e) => setNewGroupDescription(e.target.value)}
                    placeholder="Enter group description"
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                    Select Members *
                  </label>
                  <div className="max-h-48 overflow-y-auto border rounded-lg p-2 space-y-2">
                    {generalUsers.map((user) => (
                      <div
                        key={user.id}
                        className="flex items-center space-x-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg cursor-pointer"
                        onClick={() => toggleUserSelection(user.id)}
                      >
                        {selectedUsersForGroup.has(user.id) ? (
                          <CheckSquare className="h-5 w-5 text-green-500" />
                        ) : (
                          <Square className="h-5 w-5 text-gray-400" />
                        )}
                        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-xs font-semibold">
                          {user.displayName?.charAt(0).toUpperCase() || "U"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {user.displayName}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {user.email}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    {selectedUsersForGroup.size} members selected
                  </p>
                </div>

                <div className="flex space-x-3 pt-4">
                  <Button
                    onClick={() => setShowCreateGroup(false)}
                    variant="outline"
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={createGroup}
                    disabled={creatingGroup || !newGroupName.trim() || selectedUsersForGroup.size === 0}
                    className="flex-1 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700"
                  >
                    {creatingGroup ? (
                      <div className="flex items-center space-x-2">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Creating...</span>
                    </div>
                    ) : (
                      "Create Group"
                    )}
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {activeTab === "admins" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 shadow-lg">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center space-x-3">
                  <div className="p-2 bg-gradient-to-r from-orange-500 to-orange-600 rounded-lg">
                    <UserPlus className="h-5 w-5 text-white" />
                  </div>
                  <span>Administrators</span>
                  <Badge variant="secondary" className="ml-2 bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                    {filteredAdminUsers.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {filteredAdminUsers.length === 0 ? (
                  <div className="text-center py-12">
                    <UserPlus className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                    <p className="text-gray-500 dark:text-gray-400">
                      {searchTerm ? "No administrators match your search." : "No administrators found."}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredAdminUsers.map((admin) => (
                      <Card key={admin.id} className="p-5 bg-gradient-to-br from-gray-50 to-white dark:from-gray-700/50 dark:to-gray-800 border border-gray-200/50 dark:border-gray-600/50 hover:shadow-md transition-all duration-200">
                        <div className="flex items-center space-x-4">
                          <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-red-600 rounded-full flex items-center justify-center text-white font-semibold text-lg">
                            {admin.displayName?.charAt(0).toUpperCase() || "A"}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2 mb-1">
                              <p className="font-semibold text-gray-900 dark:text-white truncate">{admin.displayName}</p>
                              <Badge className="bg-gradient-to-r from-orange-500 to-red-600 text-white border-0 text-xs">
                                Admin
                              </Badge>
                            </div>
                            <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{admin.email}</p>
                          </div>
                          <Button 
                            onClick={() => startConversation(admin.id)}
                            className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-xl transition-all duration-200"
                          >
                            <MessageCircle className="h-4 w-4" />
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {activeTab === "settings" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 shadow-lg max-w-2xl mx-auto">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center space-x-3">
                  <div className="p-2 bg-gradient-to-r from-red-500 to-red-600 rounded-lg">
                    <Settings className="h-5 w-5 text-white" />
                  </div>
                  <span>Account Settings</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-3 text-gray-700 dark:text-gray-300">Display Name</label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all duration-200"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-3 text-gray-700 dark:text-gray-300">Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all duration-200"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-3 text-gray-700 dark:text-gray-300">New Password</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Leave blank to keep current password"
                      className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all duration-200"
                    />
                  </div>
                </div>
                <Button 
                  onClick={handleUpdateProfile} 
                  disabled={updating}
                  className="w-full bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-xl py-3 transition-all duration-200 disabled:opacity-50"
                >
                  {updating ? (
                    <div className="flex items-center justify-center space-x-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Updating...</span>
                    </div>
                  ) : (
                    "Update Profile"
                  )}
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </main>
    </div>
  )
}