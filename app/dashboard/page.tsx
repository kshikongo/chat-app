"use client"

import { useAuth } from "@/contexts/auth-context"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { collection, query, where, onSnapshot, addDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import type { User, Conversation } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { MessageCircle, Settings, Users, LogOut, UserPlus } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"
import { ChatInterface } from "@/components/chat-interface"

export default function DashboardPage() {
  const { user, loading, logout } = useAuth()
  const router = useRouter()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [generalUsers, setGeneralUsers] = useState<User[]>([])
  const [adminUsers, setAdminUsers] = useState<User[]>([])
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<"chats" | "general-users" | "admins" | "settings">("general-users")
  const [startingChat, setStartingChat] = useState(false)

  const startConversation = async (otherUserId: string) => {
    setStartingChat(true)
    try {
      // Check if conversation already exists
      const existingConversation = conversations.find(
        (conv) => conv.participants.includes(otherUserId) && conv.participants.includes(user.id),
      )

      if (existingConversation) {
        setSelectedConversation(existingConversation.id)
        setActiveTab("chats")
      } else {
        // Create new conversation
        const conversationRef = await addDoc(collection(db, "Conversations"), {
          participants: [user.id, otherUserId],
          lastMessage: "",
          lastMessageTime: new Date(),
          unreadCount: {
            [user.id]: 0,
            [otherUserId]: 0,
          },
        })

        setSelectedConversation(conversationRef.id)
        setActiveTab("chats")
      }
    } catch (error) {
      console.error("Error starting conversation:", error)
    } finally {
      setStartingChat(false)
    }
  }

  useEffect(() => {
    if (!loading && (!user || user.role !== "general")) {
      router.push("/login")
    }
  }, [user, loading, router])

  useEffect(() => {
    if (!user) return

    // Listen to conversations
    const conversationsQuery = query(collection(db, "Conversations"), where("participants", "array-contains", user.id))

    const unsubscribeConversations = onSnapshot(conversationsQuery, (snapshot) => {
      const conversationData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Conversation[]
      setConversations(conversationData)
    })

    // Listen to General users (excluding current user)
    const generalQuery = query(collection(db, "General"))
    const unsubscribeGeneral = onSnapshot(generalQuery, (snapshot) => {
      const users = snapshot.docs
        .map((doc) => ({
          id: doc.id,
          ...doc.data(),
          role: "general",
        }))
        .filter((u) => u.id !== user.id) as User[]
      setGeneralUsers(users)
    })

    // Listen to Admin users
    const adminsQuery = query(collection(db, "Admins"))
    const unsubscribeAdmins = onSnapshot(adminsQuery, (snapshot) => {
      const users = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        role: "admin",
      })) as User[]
      setAdminUsers(users)
    })

    return () => {
      unsubscribeConversations()
      unsubscribeGeneral()
      unsubscribeAdmins()
    }
  }, [user])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!user || user.role !== "general") {
    return null
  }

  const allUsers = [...generalUsers, ...adminUsers]

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
              <Badge variant="secondary">General User</Badge>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-sm text-gray-600 dark:text-gray-300">
                Welcome, <span className="font-medium">{user.displayName}</span>
              </div>
              <ThemeToggle />
              <Button variant="outline" onClick={logout}>
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Avatar>
                    <AvatarFallback>{user.displayName?.charAt(0).toUpperCase() || "U"}</AvatarFallback>
                  </Avatar>
                  <span className="truncate">{user.displayName}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button
                  variant={activeTab === "general-users" ? "default" : "ghost"}
                  className="w-full justify-start"
                  onClick={() => setActiveTab("general-users")}
                >
                  <Users className="h-4 w-4 mr-2" />
                  General Users ({generalUsers.length})
                </Button>
                <Button
                  variant={activeTab === "chats" ? "default" : "ghost"}
                  className="w-full justify-start"
                  onClick={() => setActiveTab("chats")}
                >
                  <MessageCircle className="h-4 w-4 mr-2" />
                  My Chats ({conversations.length})
                </Button>
                <Button
                  variant={activeTab === "admins" ? "default" : "ghost"}
                  className="w-full justify-start"
                  onClick={() => setActiveTab("admins")}
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  Admins ({adminUsers.length})
                </Button>
                <Button
                  variant={activeTab === "settings" ? "default" : "ghost"}
                  className="w-full justify-start"
                  onClick={() => setActiveTab("settings")}
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)}>
              {/* General Users Tab */}
              <TabsContent value="general-users">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Users className="h-5 w-5" />
                      <span>General Users - Start a Chat</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {generalUsers.length === 0 ? (
                      <div className="text-center py-12">
                        <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                        <p className="text-gray-500 text-lg">No other general users found</p>
                        <p className="text-gray-400 text-sm">Be the first to invite others!</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {generalUsers.map((otherUser) => (
                          <Card key={otherUser.id} className="hover:shadow-md transition-shadow">
                            <CardContent className="p-4">
                              <div className="flex flex-col items-center text-center space-y-3">
                                <Avatar className="h-16 w-16">
                                  <AvatarFallback className="text-lg font-semibold">
                                    {otherUser.displayName?.charAt(0).toUpperCase() || "U"}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="font-medium text-lg">{otherUser.displayName}</p>
                                  <p className="text-sm text-gray-500">{otherUser.email}</p>
                                  <Badge variant="secondary" className="mt-1">
                                    General User
                                  </Badge>
                                </div>
                                <Button
                                  onClick={() => startConversation(otherUser.id)}
                                  disabled={startingChat}
                                  className="w-full"
                                >
                                  <MessageCircle className="h-4 w-4 mr-2" />
                                  {startingChat ? "Starting..." : "Start Chat"}
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Chats Tab */}
              <TabsContent value="chats">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>My Conversations</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {conversations.length === 0 ? (
                        <div className="text-center py-8">
                          <MessageCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                          <p className="text-gray-500">No conversations yet</p>
                          <p className="text-gray-400 text-sm">Start chatting with other users!</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {conversations.map((conversation) => {
                            // Find other participant
                            const otherParticipantId = conversation.participants.find((id: string) => id !== user.id)
                            const otherUser = allUsers.find((u) => u.id === otherParticipantId)

                            return (
                              <Button
                                key={conversation.id}
                                variant={selectedConversation === conversation.id ? "default" : "ghost"}
                                className="w-full justify-start p-3 h-auto"
                                onClick={() => setSelectedConversation(conversation.id)}
                              >
                                <div className="flex items-center space-x-3 w-full">
                                  <Avatar className="h-10 w-10">
                                    <AvatarFallback>
                                      {otherUser?.displayName?.charAt(0).toUpperCase() || "U"}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div className="flex-1 text-left">
                                    <p className="font-medium">{otherUser?.displayName || "Unknown User"}</p>
                                    {conversation.lastMessage && (
                                      <p className="text-sm text-gray-500 truncate">{conversation.lastMessage}</p>
                                    )}
                                  </div>
                                  {otherUser && (
                                    <Badge
                                      variant={otherUser.role === "admin" ? "default" : "secondary"}
                                      className="text-xs"
                                    >
                                      {otherUser.role}
                                    </Badge>
                                  )}
                                </div>
                              </Button>
                            )
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {selectedConversation && <ChatInterface conversationId={selectedConversation} currentUser={user} />}
                </div>
              </TabsContent>

              {/* Admins Tab */}
              <TabsContent value="admins">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <UserPlus className="h-5 w-5" />
                      <span>Contact Administrators</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {adminUsers.length === 0 ? (
                      <div className="text-center py-8">
                        <UserPlus className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                        <p className="text-gray-500">No administrators found</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {adminUsers.map((admin) => (
                          <Card key={admin.id} className="hover:shadow-md transition-shadow">
                            <CardContent className="p-4">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-3">
                                  <Avatar>
                                    <AvatarFallback>{admin.displayName?.charAt(0).toUpperCase() || "A"}</AvatarFallback>
                                  </Avatar>
                                  <div>
                                    <p className="font-medium">{admin.displayName}</p>
                                    <p className="text-sm text-gray-500">{admin.email}</p>
                                    <Badge variant="default" className="mt-1">
                                      Administrator
                                    </Badge>
                                  </div>
                                </div>
                                <Button size="sm" onClick={() => startConversation(admin.id)} disabled={startingChat}>
                                  <MessageCircle className="h-4 w-4 mr-1" />
                                  Chat
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Settings Tab */}
              <TabsContent value="settings">
                <Card>
                  <CardHeader>
                    <CardTitle>Account Settings</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Display Name</label>
                      <input
                        type="text"
                        value={user.displayName}
                        className="w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600"
                        readOnly
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Email</label>
                      <input
                        type="email"
                        value={user.email}
                        className="w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600"
                        readOnly
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Role</label>
                      <Badge variant="secondary">{user.role}</Badge>
                    </div>
                    <Button className="w-full">Update Profile</Button>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  )
}
