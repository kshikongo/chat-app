"use client"

import { useAuth } from "@/contexts/auth-context"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { LogOut, Menu, Users, MessageCircle, UserPlus, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ThemeToggle } from "@/components/theme-toggle"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChatInterface } from "@/components/chat-interface"

import { db, auth } from "@/lib/firebase"
import { collection, query, where, onSnapshot, addDoc } from "firebase/firestore"
import {
  updateProfile,
  updateEmail,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from "firebase/auth"
import type { User, Conversation } from "@/lib/types"

export default function DashboardPage() {
  const { user, loading, logout } = useAuth()
  const router = useRouter()

  // Sidebar / tabs
  const [activeTab, setActiveTab] = useState<"general-users" | "chats" | "admins" | "settings" | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Chat + users
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [generalUsers, setGeneralUsers] = useState<User[]>([])
  const [adminUsers, setAdminUsers] = useState<User[]>([])
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null)

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

    const conversationsQuery = query(collection(db, "Conversations"), where("participants", "array-contains", user.id))
    const unsubscribeConversations = onSnapshot(conversationsQuery, (snapshot) => {
      const conversationData = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Conversation[]
      setConversations(conversationData)
    })

    const generalQuery = query(collection(db, "General"))
    const unsubscribeGeneral = onSnapshot(generalQuery, (snapshot) => {
      setGeneralUsers(
        snapshot.docs
          .map((doc) => ({ id: doc.id, ...doc.data(), role: "general" }))
          .filter((u) => u.id !== user.id) as User[],
      )
    })

    const adminsQuery = query(collection(db, "Admins"))
    const unsubscribeAdmins = onSnapshot(adminsQuery, (snapshot) => {
      setAdminUsers(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data(), role: "admin" })) as User[])
    })

    return () => {
      unsubscribeConversations()
      unsubscribeGeneral()
      unsubscribeAdmins()
    }
  }, [user])

  // Start new conversation
  const startConversation = async (otherUserId: string) => {
    try {
      const existingConversation = conversations.find(
        (conv) => conv.participants.includes(otherUserId) && conv.participants.includes(user.id),
      )
      if (existingConversation) {
        setSelectedConversation(existingConversation.id)
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
        })
        setSelectedConversation(conversationRef.id)
        setActiveTab("chats")
      }
    } catch (err) {
      console.error("Error starting conversation:", err)
    }
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!user || user.role !== "general") return null

  const allUsers = [...generalUsers, ...adminUsers]

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 relative">
      {/* HEADER */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <Button variant="ghost" onClick={() => setSidebarOpen(true)}>
              <Menu className="h-6 w-6" />
            </Button>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600 dark:text-gray-300">
               <span className="font-medium">{user.displayName}</span>
              </span>
              <ThemeToggle />
              <Button variant="outline" onClick={logout}>
                <LogOut className="h-4 w-4 mr-2" /> Logout
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
              className="fixed inset-0 bg-black bg-opacity-50 z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
            />
            <motion.div
              className="fixed top-0 left-0 w-64 h-full bg-white dark:bg-gray-800 shadow-lg z-50 p-4"
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
            >
              <h2 className="text-lg font-bold mb-4">Menu</h2>
              <nav className="space-y-2">
                {["general-users", "chats", "admins", "settings"].map((tab) => (
                  <Button
                    key={tab}
                    variant={activeTab === tab ? "default" : "ghost"}
                    className="w-full justify-start"
                    onClick={() => {
                      setActiveTab(tab as any)
                      setSidebarOpen(false)
                    }}
                  >
                    {tab === "general-users" && <Users className="h-4 w-4 mr-2" />}
                    {tab === "chats" && <MessageCircle className="h-4 w-4 mr-2" />}
                    {tab === "admins" && <UserPlus className="h-4 w-4 mr-2" />}
                    {tab === "settings" && <Settings className="h-4 w-4 mr-2" />}
                    {tab.replace("-", " ").toUpperCase()}
                  </Button>
                ))}
              </nav>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* MAIN CONTENT */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === null && <p className="text-gray-500">👈 Open the menu to get started</p>}

        {activeTab === "general-users" && (
          <Card>
            <CardHeader>
              <CardTitle>General Users</CardTitle>
            </CardHeader>
            <CardContent>
              {generalUsers.length === 0 ? (
                <p>No general users found.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {generalUsers.map((u) => (
                    <Card key={u.id} className="p-4 flex flex-col items-center">
                      <p className="font-medium">{u.displayName}</p>
                      <p className="text-sm text-gray-500">{u.email}</p>
                      <Button onClick={() => startConversation(u.id)} className="mt-2">
                        <MessageCircle className="h-4 w-4 mr-2" /> Start Chat
                      </Button>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === "chats" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>My Conversations</CardTitle>
              </CardHeader>
              <CardContent>
                {conversations.length === 0 ? (
                  <p>No conversations yet.</p>
                ) : (
                  <div className="space-y-2">
                    {conversations.map((conv) => {
                      const otherId = conv.participants.find((id: string) => id !== user.id)
                      const otherUser = allUsers.find((u) => u.id === otherId)
                      return (
                        <Button
                          key={conv.id}
                          variant={selectedConversation === conv.id ? "default" : "ghost"}
                          className="w-full justify-start"
                          onClick={() => setSelectedConversation(conv.id)}
                        >
                          <span>{otherUser?.displayName || "Unknown User"}</span>
                        </Button>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
            {selectedConversation && <ChatInterface conversationId={selectedConversation} currentUser={user} />}
          </div>
        )}

        {activeTab === "admins" && (
          <Card>
            <CardHeader>
              <CardTitle>Admins</CardTitle>
            </CardHeader>
            <CardContent>
              {adminUsers.length === 0 ? (
                <p>No admins found.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {adminUsers.map((admin) => (
                    <Card key={admin.id} className="p-4 flex flex-col">
                      <p className="font-medium">{admin.displayName}</p>
                      <p className="text-sm text-gray-500">{admin.email}</p>
                      <Badge variant="default" className="mt-1">
                        Administrator
                      </Badge>
                      <Button onClick={() => startConversation(admin.id)} className="mt-2">
                        <MessageCircle className="h-4 w-4 mr-2" /> Chat
                      </Button>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === "settings" && (
          <Card>
            <CardHeader>
              <CardTitle>Account Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Display Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">New Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Leave blank to keep current password"
                  className="w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600"
                />
              </div>
              <Button className="w-full" onClick={handleUpdateProfile} disabled={updating}>
                {updating ? "Updating..." : "Update Profile"}
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  )
}
