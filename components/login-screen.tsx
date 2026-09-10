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
  Loader2,
  SquareArrowOutUpRight,
  RefreshCw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { createSteamSession } from "@/lib/session";

export function LoginScreen() {
  const [jwtToken, setJwtToken] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [qrRefreshNeeded, setQrRefreshNeeded] = useState(false);
  const [pollingError, setPollingError] = useState<string | null>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pollingCountRef = useRef<number>(0);
  const { toast } = useToast();

  useEffect(() => {
    localStorage.removeItem("inventory_data");
    localStorage.removeItem("login_type");
    localStorage.removeItem("selected_currency");
    // return () => {
    //   stopPolling()
    // }
  }, []);

  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    if (pollingTimeoutRef.current) {
      clearTimeout(pollingTimeoutRef.current);
      pollingTimeoutRef.current = null;
    }
    setIsPolling(false);
    pollingCountRef.current = 0;
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

    window.location.href = `/api/auth/login/steam`;
  };

  const handleQrLogin = async (data: any) => {
    setIsLoading(true);
    try {
      stopPolling();

      const authData = {
        responseStatus: data.responseStatus,
        accountName: data.session.accountName,
        refreshToken: data.session.refreshToken,
        accessToken: data.session.accessToken,
        // accessTokenSetAt: data.session.accessTokenSetAt,
      };

      const EXPIRATION_TIME = 1000 * 60 * 60 * 7;

      localStorage.setItem(
        "login_type",
        JSON.stringify({
          timestamp: Date.now(),
          expiresAt: Date.now() + EXPIRATION_TIME,
          type: "qr",
          loginType: 1,
          authData: JSON.stringify(authData) || "",
        })
      );

      window.location.href = `/api/auth/create-session?steamid=${data.session.steamID}`;
    } catch (error) {
      console.error("QR login error:", error);
      toast({
        title: "Login failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setIsPolling(false);
    }
  };

  const checkLoginStatus = async () => {
    try {
      pollingCountRef.current += 1;

      if (pollingCountRef.current > 60) {
        stopPolling();
        setQrRefreshNeeded(true);
        setPollingError("Polling timeout. Please refresh the QR code.");
        return;
      }

      const response = await fetch("/api/auth/login-status", {
        // Add cache: 'no-store' to prevent caching
        cache: "no-store",
        headers: {
          // Add a timestamp to prevent caching
          "X-Timestamp": Date.now().toString(),
        },
      });

      if (!response.ok) {
        throw new Error(`Status check failed: ${response.status}`);
      }

      const data = await response.json();

      if (data.loggedIn) {
        console.log("User authenticated via QR code");
        await handleQrLogin(data);
      } else if (data.reason === "expired") {
        stopPolling();
        setQrRefreshNeeded(true);
        setPollingError("Session expired. Please refresh the QR code.");
      } else if (pollingCountRef.current > 40) {
        setQrRefreshNeeded(true);
      }
    } catch (error) {
      console.error("Error checking login status:", error);
      setPollingError("Error checking login status. Please try again.");
      stopPolling();
    }
  };

  const handleQrPolling = async (refresh = false) => {
    setIsLoading(true);
    setQrRefreshNeeded(false);

    try {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }

      const response = await fetch(
        `/api/auth/login/qr${refresh ? "?refresh=true" : ""}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error(`QR code generation failed: ${response.status}`);
      }

      const data = await response.json();

      if (data.qrCodeDataUrl) {
        setQrCodeDataUrl(data.qrCodeDataUrl);
        setIsPolling(true);

        pollingIntervalRef.current = setInterval(checkLoginStatus, 3000);

        setTimeout(() => {
          setQrRefreshNeeded(true);
        }, 120000);
      } else {
        throw new Error("No QR code data received");
      }
    } catch (error) {
      console.error("Error during QR login:", error);
      toast({
        title: "QR Code Generation Failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
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
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#080c16] p-4 text-white relative overflow-hidden">
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
                <div className="bg-white p-4 rounded-lg">
                  {qrCodeDataUrl ? (
                    <img
                      src={qrCodeDataUrl || "/placeholder.svg"}
                      style={{ width: "330px", height: "330px" }}
                      alt="QR Code"
                    />
                  ) : (
                    <QrCode className="h-48 w-48 text-gray-900" />
                  )}
                </div>

                <div className="flex flex-col w-full gap-2">
                  {!qrCodeDataUrl ? (
                    <Button
                      onClick={() => handleQrPolling(false)}
                      className="w-full"
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Generating QR Code...
                        </>
                      ) : (
                        "Generate QR Code"
                      )}
                    </Button>
                  ) : (
                    <>
                      {isPolling && !pollingError && (
                        <div className="text-center text-sm text-gray-400 flex items-center justify-center gap-2">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Waiting for QR scan...
                        </div>
                      )}

                      {pollingError && (
                        <div className="text-center text-sm text-red-400 mb-2">
                          {pollingError}
                        </div>
                      )}

                      {(qrRefreshNeeded || pollingError) && (
                        <div className="text-center text-sm text-amber-400 mb-2">
                          QR code may have expired. Please refresh.
                        </div>
                      )}

                      <Button
                        onClick={() => handleQrPolling()}
                        className="w-full border-gray-600"
                        disabled={isLoading}
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Refreshing...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Refresh QR Code
                          </>
                        )}
                      </Button>
                    </>
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
