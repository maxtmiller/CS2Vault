"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { SteamIcon } from "@/components/ui/steam-icon";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  QrCode,
  KeyRound,
  CheckCircle2,
  Clock,
  Loader2,
  SquareArrowOutUpRight,
  RefreshCw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { fadeOutPage, resetPageFade } from "@/lib/utils";

type QrStatus = "idle" | "generating" | "waiting" | "expired" | "error" | "success";

const QR_POLL_MS = 3000;
const QR_LIFETIME_MS = 2 * 60 * 1000;
const LOGIN_FEEDBACK_MS = 450;
const QR_SUCCESS_FEEDBACK_MS = 900;

export function LoginScreen() {
  const [jwtToken, setJwtToken] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [qrStatus, setQrStatus] = useState<QrStatus>("idle");
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  // Bumped whenever a QR attempt ends so in-flight requests from an old attempt are ignored
  const qrAttemptRef = useRef(0);
  const qrPollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qrExpiryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    resetPageFade();
    localStorage.removeItem("inventory_data");
    localStorage.removeItem("login_type");
    localStorage.removeItem("selected_currency");
    return () => stopQr();
  }, []);

  const stopQr = () => {
    qrAttemptRef.current += 1;
    if (qrPollTimeoutRef.current) clearTimeout(qrPollTimeoutRef.current);
    if (qrExpiryTimeoutRef.current) clearTimeout(qrExpiryTimeoutRef.current);
  };

  const handleSteamOAuth = async () => {
    localStorage.setItem(
      "login_type",
      JSON.stringify({
        timestamp: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
        type: "steam",
        loginType: 3,
        authData: "",
      })
    );

    setIsLoading(true);
    await fadeOutPage(LOGIN_FEEDBACK_MS);
    window.location.href = `/api/auth/login/steam`;
  };

  const handleQrLogin = async (data: any) => {
    localStorage.setItem(
      "login_type",
      JSON.stringify({
        timestamp: Date.now(),
        expiresAt: Date.now() + 1000 * 60 * 60 * 7,
        type: "qr",
        loginType: 1,
        authData: "", // refresh token is stored server-side only
      })
    );

    await fadeOutPage(QR_SUCCESS_FEEDBACK_MS);
    window.location.href = `/api/auth/create-session?steamid=${data.session.steamID}`;
  };

  const pollLoginStatus = async (attempt: number) => {
    try {
      const response = await fetch("/api/auth/login-status", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Status check failed: ${response.status}`);
      }
      const data = await response.json();
      if (attempt !== qrAttemptRef.current) return;

      if (data.loggedIn) {
        stopQr();
        setQrStatus("success");
        await handleQrLogin(data);
      } else if (data.reason === "expired") {
        stopQr();
        setQrStatus("expired");
      } else {
        qrPollTimeoutRef.current = setTimeout(() => pollLoginStatus(attempt), QR_POLL_MS);
      }
    } catch (error) {
      if (attempt !== qrAttemptRef.current) return;
      console.error("Error checking login status:", error);
      stopQr();
      setQrStatus("error");
    }
  };

  const generateQrCode = async () => {
    stopQr();
    const attempt = qrAttemptRef.current;
    setQrStatus("generating");

    try {
      const response = await fetch("/api/auth/login/qr");
      if (!response.ok) {
        throw new Error(`QR code generation failed: ${response.status}`);
      }
      const data = await response.json();
      if (!data.qrCodeDataUrl) {
        throw new Error("No QR code data received");
      }
      if (attempt !== qrAttemptRef.current) return;

      setQrCodeDataUrl(data.qrCodeDataUrl);
      setQrStatus("waiting");
      qrPollTimeoutRef.current = setTimeout(() => pollLoginStatus(attempt), QR_POLL_MS);
      qrExpiryTimeoutRef.current = setTimeout(() => {
        stopQr();
        setQrStatus("expired");
      }, QR_LIFETIME_MS);
    } catch (error) {
      if (attempt !== qrAttemptRef.current) return;
      console.error("Error during QR login:", error);
      setQrStatus("error");
    }
  };

  const handleJwtLogin = async () => {
    if (!jwtToken.trim()) return;

    setIsLoading(true);
    try {
      let parsedJWT;
      try {
        parsedJWT = JSON.parse(jwtToken);
      } catch (error) {
        toast({
          title: "Invalid Token",
          variant: "destructive",
        });
        throw new Error("Invalid JWT token");
      }

      if (
        !parsedJWT.logged_in ||
        !parsedJWT.steamid ||
        !parsedJWT.accountid ||
        !parsedJWT.account_name ||
        !parsedJWT.token
      ) {
        toast({
          title: "Invalid Token",
          variant: "destructive",
        });
        throw new Error("Invalid JWT token");
      }

      localStorage.setItem(
        "login_type",
        JSON.stringify({
          timestamp: Date.now(),
          expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
          type: "jwt",
          loginType: 2,
          authData: jwtToken || "",
        })
      );

      await fadeOutPage(LOGIN_FEEDBACK_MS);
      window.location.href = `/api/auth/login/jwt?steamid=${parsedJWT.steamid}`;
    } catch (error) {
      console.error("JWT login error:", error);
      toast({
        title: "Login failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#080c16] p-4 text-white relative overflow-hidden animate-in fade-in duration-500">
      {/* Background gradient orbs */}
      <div className="absolute top-1/4 -left-32 w-[500px] h-[500px] bg-blue-700/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-[500px] h-[500px] bg-purple-700/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-900/5 rounded-full blur-3xl pointer-events-none" />

      <div className="mb-8 text-center relative z-10">
        <div className="flex justify-center items-center pb-5">
          <div className="p-4 rounded-2xl bg-gray-900/60 border border-white/5 backdrop-blur-sm">
            <img src="/logo.png" width="80" height="80" alt="Logo" />
          </div>
        </div>
        <h1 className="mb-2 text-4xl font-bold bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-500 bg-clip-text text-transparent">
          CS2 Vault
        </h1>
        <p className="text-gray-400">
          Your CS2 Inventory, Simplified and Enhanced.
        </p>
      </div>

      <Card className="w-full max-w-md bg-gray-900/80 border-gray-800/60 backdrop-blur-sm relative z-10">
        <CardHeader className="pb-4">
          <CardTitle className="text-white text-xl">Sign In</CardTitle>
          <CardDescription className="text-gray-500">
            Choose your preferred login method
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="steam" className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-gray-800/60 border border-gray-700/40">
              <TabsTrigger
                value="steam"
                className="data-[state=active]:bg-gray-900 data-[state=active]:text-white text-gray-400"
              >
                Steam
              </TabsTrigger>
              <TabsTrigger
                value="qr"
                className="data-[state=active]:bg-gray-900 data-[state=active]:text-white text-gray-400"
              >
                QR Code
              </TabsTrigger>
            </TabsList>

            <TabsContent value="steam" className="mt-5">
              <Button
                onClick={handleSteamOAuth}
                className="flex items-center gap-2 bg-[#1a56c4] hover:bg-[#1e4fa8] w-full h-11 text-white font-medium"
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <SteamIcon className="h-5 w-5" />
                )}
                Sign in with Steam
              </Button>
              <p className="mt-4 text-center text-xs text-gray-500">
                Accesses your public inventory including tradable items.
              </p>
            </TabsContent>

            <TabsContent value="qr" className="mt-4">
              <div className="flex flex-col items-center gap-4">
                <div className="relative w-full max-w-[330px] aspect-square bg-white p-4 rounded-lg flex items-center justify-center overflow-hidden">
                  {qrCodeDataUrl ? (
                    <img
                      key={qrCodeDataUrl}
                      src={qrCodeDataUrl}
                      alt="QR Code"
                      className={`w-full h-full animate-in fade-in zoom-in-95 duration-300 transition-[filter,opacity] ${
                        qrStatus === "waiting" || qrStatus === "success"
                          ? ""
                          : "blur-sm opacity-30"
                      }`}
                    />
                  ) : (
                    <QrCode
                      className={`h-48 w-48 text-gray-900 ${
                        qrStatus === "generating" ? "animate-pulse" : ""
                      }`}
                    />
                  )}
                  {qrCodeDataUrl && qrStatus === "expired" && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-gray-900 animate-in fade-in duration-300">
                      <Clock className="h-8 w-8" />
                      <p className="font-semibold">QR code expired</p>
                    </div>
                  )}
                  {qrStatus === "success" && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/80 text-green-600 animate-in fade-in duration-300">
                      <CheckCircle2 className="h-10 w-10" />
                      <p className="font-semibold">Signed in</p>
                    </div>
                  )}
                </div>

                <div className="flex flex-col w-full gap-2 min-h-[64px] justify-center">
                  {qrStatus === "waiting" && (
                    <div className="text-center text-sm text-gray-400 animate-in fade-in duration-300">
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Scan with the Steam mobile app
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        Code expires after 2 minutes
                      </p>
                    </div>
                  )}

                  {qrStatus === "success" && (
                    <div className="flex items-center justify-center gap-2 text-sm text-green-400 animate-in fade-in duration-300">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Loading your inventory...
                    </div>
                  )}

                  {(qrStatus === "expired" || qrStatus === "error") && (
                    <p className="text-center text-sm text-gray-400 animate-in fade-in duration-300">
                      {qrStatus === "expired"
                        ? "This code was not scanned in time."
                        : "Something went wrong. Please try again."}
                    </p>
                  )}

                  {qrStatus !== "waiting" && qrStatus !== "success" && (
                    <Button
                      onClick={generateQrCode}
                      className="w-full"
                      disabled={qrStatus === "generating"}
                    >
                      {qrStatus === "generating" ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Generating QR Code...
                        </>
                      ) : qrStatus === "idle" ? (
                        "Generate QR Code"
                      ) : (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Generate New Code
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="jwt" className="mt-5">
              <div className="flex flex-col gap-4">
                <div className="space-y-2">
                  <p className="text-xs text-gray-500">
                    Paste your Steam JWT token below
                  </p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="password"
                      placeholder="Paste JWT token..."
                      value={jwtToken}
                      onChange={(e) => setJwtToken(e.target.value)}
                      className="bg-gray-800/80 border-gray-700 flex-1 h-11"
                      onKeyDown={(e) => e.key === "Enter" && handleJwtLogin()}
                    />
                    <Button
                      variant="outline"
                      className="border-gray-700 bg-gray-800/80 hover:bg-gray-700 text-white h-11 w-11 shrink-0 p-0"
                      onClick={() =>
                        window.open(
                          "https://steamcommunity.com/chat/clientjstoken",
                          "_blank"
                        )
                      }
                    >
                      <SquareArrowOutUpRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <Button
                  onClick={handleJwtLogin}
                  className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-medium"
                  disabled={isLoading || !jwtToken.trim()}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <KeyRound className="mr-2 h-4 w-4" />
                      Login with JWT
                    </>
                  )}
                </Button>
                <p className="text-center text-xs text-gray-500">
                  Accesses your full inventory including non-tradable items and storage units.
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
