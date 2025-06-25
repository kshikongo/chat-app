"use client"

import { useAuth } from "@/contexts/auth-context"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { collection, query, onSnapshot, doc, setDoc, deleteDoc } from "firebase/firestore"
import { createUserWithEmailAndPassword } from "firebase/auth"
import { auth, db } from "@/lib/firebase"
import type { User, AdminStats } from "@/lib/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Users, Shield, MessageCircle, Plus, Trash2, LogOut } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"

export default function AdminPage() {
  const { user, loading, logout } = useAuth()
  const router = useRouter()
  const [generalUsers, setGeneralUsers] = useState<User[]>([])
  const [adminUsers, setAdminUsers] = useState<User[]>([])
  const [stats, setStats] = useState<AdminStats>({
    totalGeneralUsers: 0,
    totalAdmins: 0,
    totalMessages: 0,
    activeUsers: 0,
  })
  const [newAdminEmail, setNewAdminEmail] = useState("")
  const [newAdminPassword, setNewAdminPassword] = useState("")
  const [newAdminName, setNewAdminName] = useState("")
  const [loading2, setLoading2] = useState(false)
  const [error, setError] = useState("")
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  useEffect(() => {
    if (!loading && (!user || user.role !== "admin")) {
      router.push("/login")
    }
  }, [user, loading, router])

  useEffect(() => {
    if (!user) return

    // Listen to General users
    const generalQuery = query(collection(db, "General"))
    const unsubscribeGeneral = onSnapshot(generalQuery, (snapshot) => {
      const users = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        role: "general",
      })) as User[]
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

    // Listen to Messages for stats
    const messagesQuery = query(collection(db, "Messages"))
    const unsubscribeMessages = onSnapshot(messagesQuery, (snapshot) => {
      setStats((prev) => ({
        ...prev,
        totalMessages: snapshot.docs.length,
      }))
    })

    return () => {
      unsubscribeGeneral()
      unsubscribeAdmins()
      unsubscribeMessages()
    }
  }, [user])

  useEffect(() => {
    setStats((prev) => ({
      ...prev,
      totalGeneralUsers: generalUsers.length,
      totalAdmins: adminUsers.length,
      activeUsers: generalUsers.filter((u) => {
        const lastActive = u.lastActive?.toDate?.() || new Date(u.lastActive)
        return Date.now() - lastActive.getTime() < 24 * 60 * 60 * 1000 // Active in last 24 hours
      }).length,
    }))
  }, [generalUsers, adminUsers])

  const createAdmin = async () => {
    if (!newAdminEmail || !newAdminPassword || !newAdminName) {
      setError("Please fill in all fields")
      return
    }

    setLoading2(true)
    setError("")

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, newAdminEmail, newAdminPassword)
      const newUser = userCredential.user

      await setDoc(doc(db, "Admins", newUser.uid), {
        email: newUser.email,
        displayName: newAdminName,
        role: "admin",
        createdAt: new Date(),
        lastActive: new Date(),
        createdBy: user.id,
      })

      setNewAdminEmail("")
      setNewAdminPassword("")
      setNewAdminName("")
      setIsDialogOpen(false)
    } catch (error: any) {
      setError(error.message)
    } finally {
      setLoading2(false)
    }
  }

  const deleteUser = async (userId: string, userType: "admin" | "general") => {
    if (userId === user.id) {
      setError("Cannot delete your own account")
      return
    }

    try {
      const collection_name = userType === "admin" ? "Admins" : "General"
      await deleteDoc(doc(db, collection_name, userId))
    } catch (error: any) {
      setError(error.message)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!user || user.role !== "admin") {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Admin Dashboard</h1>
              <Badge variant="default">Administrator</Badge>
            </div>
            <div className="flex items-center space-x-4">
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
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">General Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalGeneralUsers}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Administrators</CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalAdmins}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Messages</CardTitle>
              <MessageCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalMessages}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Users</CardTitle>
              <Users className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.activeUsers}</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* General Users */}
          <Card>
            <CardHeader>
              <CardTitle>General Users</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {generalUsers.map((generalUser) => (
                  <div key={generalUser.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-3">
                      <Avatar>
                        <AvatarFallback>{generalUser.displayName?.charAt(0).toUpperCase() || "U"}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{generalUser.displayName}</p>
                        <p className="text-sm text-gray-500">{generalUser.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge variant="secondary">General</Badge>
                      <Button size="sm" variant="destructive" onClick={() => deleteUser(generalUser.id, "general")}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                {generalUsers.length === 0 && <p className="text-center text-gray-500 py-8">No general users found</p>}
              </div>
            </CardContent>
          </Card>

          {/* Admin Users */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Administrators</CardTitle>
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Admin
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create New Administrator</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="adminName">Display Name</Label>
                      <Input
                        id="adminName"
                        value={newAdminName}
                        onChange={(e) => setNewAdminName(e.target.value)}
                        placeholder="Enter display name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="adminEmail">Email</Label>
                      <Input
                        id="adminEmail"
                        type="email"
                        value={newAdminEmail}
                        onChange={(e) => setNewAdminEmail(e.target.value)}
                        placeholder="Enter email address"
                      />
                    </div>
                    <div>
                      <Label htmlFor="adminPassword">Password</Label>
                      <Input
                        id="adminPassword"
                        type="password"
                        value={newAdminPassword}
                        onChange={(e) => setNewAdminPassword(e.target.value)}
                        placeholder="Enter password"
                      />
                    </div>
                    <Button onClick={createAdmin} disabled={loading2} className="w-full">
                      {loading2 ? "Creating..." : "Create Administrator"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {adminUsers.map((adminUser) => (
                  <div key={adminUser.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-3">
                      <Avatar>
                        <AvatarFallback>{adminUser.displayName?.charAt(0).toUpperCase() || "A"}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{adminUser.displayName}</p>
                        <p className="text-sm text-gray-500">{adminUser.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge variant="default">Admin</Badge>
                      {adminUser.id !== user.id && (
                        <Button size="sm" variant="destructive" onClick={() => deleteUser(adminUser.id, "admin")}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
