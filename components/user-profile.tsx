"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ChevronDown } from "lucide-react"
import { ProfileData } from "@/types/profile"
import { fadeOutPage } from "@/lib/utils"
import { useRouter } from "next/navigation"


export function UserProfile({ steamId, currencies, selectedCurrency, setSelectedCurrency }: { 
  steamId: string, 
  currencies: { code: string; char: string; rate: number; icon: React.ReactNode }[],
  selectedCurrency: string, 
  setSelectedCurrency: (currency: string) => void 
}) {
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)


  // Handle currency change
  function handleCurrencyChange(currency: string) {
    setSelectedCurrency(currency);
  }


  // Fetch user profile on component mount
  useEffect(() => {
    async function fetchProfile() {
      try {
        setLoading(true)
        const response = await fetch(`/api/steam/profile?steamid=${steamId}`)

        if (!response.ok) {
          throw new Error(`Error: ${response.status}`)
        }

        const data = await response.json()
        setProfile(data)
      } catch (err) {
        console.error("Failed to fetch profile:", err)
        setError("Failed to load profile data")
      } finally {
        setLoading(false)
      }
    }

    if (steamId) {
      fetchProfile()
    }
  }, [steamId])


  const router = useRouter()

  // Function to handle logout and redirect to homepage
  const handleLogout = () => {
    localStorage.removeItem("login_type")
    localStorage.removeItem("inventory_data")
    localStorage.removeItem("selected_currency")
    Promise.all([
      fetch(`/api/auth/logout?steamid=${steamId}`, { method: "POST" }),
      fadeOutPage(),
    ])
      .then(() => {
        router.refresh()
      })
      .catch((error) => {
        console.error("Logout error:", error)
        document.body.style.opacity = "1"
      })
  }


  // Show loading state
  if (loading) {
    return (
      <div className="flex items-center space-x-4">
        <Skeleton className="h-12 w-12 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-[200px]" />
          <Skeleton className="h-4 w-[150px]" />
        </div>
      </div>
    )
  }


  // Show error state
  if (error || !profile) {
    return (
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-400">Steam ID: {steamId}</p>
          <p className="text-sm text-red-400">{error || "Profile not available"}</p>
        </div>
        <Button onClick={handleLogout} variant="destructive" size="sm">
          Logout
        </Button>
      </div>
    )
  }


  return (
    <div className="flex items-center gap-2 sm:gap-3">
      {/* Name + ID — hidden on small screens */}
      <div className="hidden sm:flex flex-col items-end justify-center">
        <h3 className="font-medium text-white text-sm leading-tight">{profile.steamName}</h3>
        <p className="text-xs text-gray-500 hidden md:block truncate max-w-[120px]">{steamId}</p>
      </div>

      {/* Avatar */}
      <Link
        href={`https://steamcommunity.com/profiles/${steamId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="relative h-9 w-9 overflow-hidden border-2 border-gray-700 rounded-full transition-all duration-200 hover:border-blue-500 shrink-0"
      >
        <Image
          src={profile.avatarMedium || "/placeholder.svg"}
          alt={profile.steamName}
          width={36}
          height={36}
          className="object-cover"
        />
      </Link>

      {/* Currency picker */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="border-gray-700 bg-gray-900 hover:bg-gray-800 text-white gap-1 h-9 px-2.5">
            <span className="text-sm font-medium">{selectedCurrency}</span>
            <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-gray-900 border-gray-700">
          {currencies.map((c) => (
            <DropdownMenuItem key={c.code} onClick={() => handleCurrencyChange(c.code)} className="hover:bg-gray-800">
              {c.icon}
              {c.code}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Logout */}
      <Button
        onClick={handleLogout}
        size="sm"
        className="bg-red-600/90 text-white hover:bg-red-600 h-9 px-3"
      >
        <span className="hidden sm:inline">Logout</span>
        <span className="sm:hidden text-xs">✕</span>
      </Button>
    </div>
  )
}
