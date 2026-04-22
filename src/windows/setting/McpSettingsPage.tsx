import { useEffect, useState } from "react";
import { Share2, Activity, Globe, CheckCircle2, Copy, ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

interface McpStatus {
    isEnabled: boolean;
    port: number;
    endpoint: string;
    isClientConnected: boolean;
    tools: string[];
}

export const McpSettingsPage = () => {
    const [status, setStatus] = useState<McpStatus | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const fetchStatus = async () => {
        try {
            const data = await (window as any).api.mcpGetStatus();
            setStatus(data);
        } catch (error) {
            console.error("Failed to fetch MCP status:", error);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    };

    useEffect(() => {
        fetchStatus();
    }, []);

    const handleRefresh = () => {
        setIsRefreshing(true);
        fetchStatus();
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        // Note: You might want to use a toast notification here if available in the project
    };

    if (isLoading && !isRefreshing) {
        return (
            <div className="flex h-[400px] items-center justify-center">
                <Spinner className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold tracking-tight">Cấu hình MCP (Model Context Protocol)</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        Kết nối AVOT với các công cụ AI bên ngoài (Antigravity, Claude Desktop, v.v.)
                    </p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    className="gap-2"
                >
                    <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
                    Làm mới
                </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                {/* Server Status Card */}
                <Card className={status?.isEnabled ? "border-green-500/50 bg-green-500/5" : "border-red-500/50 bg-red-500/5"}>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <Activity className="h-4 w-4" />
                            Trạng thái Server
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-2">
                            <CheckCircle2 className={`w-5 h-5 ${status?.isEnabled ? "text-green-500" : "text-red-500"}`} />
                            <span className="text-lg font-bold">
                                {status?.isEnabled ? "Đang hoạt động" : "Đã dừng"}
                            </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            {status?.isClientConnected ? "🟢 Có client đang kết nối" : "⚪ Chờ kết nối từ client"}
                        </p>
                    </CardContent>
                </Card>

                {/* Connection Info Card */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <Globe className="h-4 w-4" />
                            Endpoint SSE
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-2 bg-muted p-2 rounded-md overflow-hidden">
                            <code className="text-xs flex-1 truncate">{status?.endpoint}</code>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(status?.endpoint || "")}>
                                <Copy className="h-3 w-3" />
                            </Button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                            Sử dụng URL này để cấu hình trong các AI Client.
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Tools List Card */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                        <Share2 className="w-5 h-5 text-primary" />
                        Danh sách Công cụ (Tools) đã đăng ký
                    </CardTitle>
                    <CardDescription>
                        Các chức năng này sẽ xuất hiện dưới dạng "Tools" trong trình duyệt AI của bạn.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {status?.tools && status.tools.length > 0 ? (
                            status.tools.map((tool) => (
                                <div key={tool} className="flex items-center gap-2 p-2 rounded-md border bg-card hover:bg-accent transition-colors">
                                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                                    <span className="text-sm font-medium font-mono">{tool}</span>
                                </div>
                            ))
                        ) : (
                            <p className="text-sm text-muted-foreground italic">Chưa có công cụ nào được đăng ký.</p>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Help / Info Section */}
            <div className="bg-muted/50 p-4 rounded-lg border border-dashed text-sm">
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                    <ExternalLink className="w-4 h-4" />
                    Cách sử dụng
                </h4>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground text-xs leading-relaxed">
                    <li>Đảm bảo AVOT vẫn đang chạy trong khi bạn sử dụng AI Client.</li>
                    <li>Sử dụng phương thức kết nối <strong>SSE (Server-Sent Events)</strong>.</li>
                    <li>Port mặc định là <strong>3000</strong>.</li>
                    <li>Hiện tại AVOT hỗ trợ tối đa <strong>10 Tools</strong> cho các tác vụ âm thanh và phần cứng.</li>
                </ul>
            </div>
        </div>
    );
};
