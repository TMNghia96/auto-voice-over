import { Spinner } from '@/components/ui/spinner';
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff, Check, ExternalLink } from "lucide-react";

export const HuggingFaceKeyPage = () => {
    const [apiKey, setApiKey] = useState("");
    const [showKey, setShowKey] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        loadKey();
    }, []);

    const loadKey = async () => {
        const key = await window.api.getApiKey("huggingface");
        setApiKey(key || "");
    };

    const handleSave = async () => {
        setSaving(true);
        const success = await window.api.setApiKey("huggingface", apiKey);
        setSaving(false);

        if (success) {
            setSaved(true);
            setTimeout(() => setSaved(false), 2500);
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-lg font-semibold">Hugging Face Token</h2>
                <p className="text-sm text-muted-foreground mt-1">
                    Hugging Face Token được sử dụng cho tính năng Voice Activity Detection (VAD) cao cấp của WhisperX.
                </p>
            </div>

            <div className="space-y-3">
                <label className="text-sm font-medium">Access Token</label>
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Input
                            type={showKey ? "text" : "password"}
                            placeholder="hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            className="pr-10 font-mono text-sm"
                        />
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                            onClick={() => setShowKey(!showKey)}
                        >
                            {showKey ? (
                                <EyeOff className="w-4 h-4 text-muted-foreground" />
                            ) : (
                                <Eye className="w-4 h-4 text-muted-foreground" />
                            )}
                        </Button>
                    </div>
                    <Button
                        variant={saved ? "default" : "outline"}
                        onClick={handleSave}
                        disabled={saving}
                        className="shrink-0 min-w-[72px]"
                    >
                        {saving ? (
                            <Spinner className="w-4 h-4 animate-spin" />
                        ) : saved ? (
                            <Check className="w-4 h-4" />
                        ) : (
                            "Lưu"
                        )}
                    </Button>
                </div>
            </div>

            <div className="rounded-lg border border-dashed p-4 space-y-2">
                <p className="text-xs text-muted-foreground">
                    <strong>Hướng dẫn:</strong> Truy cập trang web Hugging Face để tạo Access Token (loại Read).
                    Bạn cũng cần vào trang <strong>pyannote/segmentation-3.0</strong> trên Hugging Face để xin cấp quyền truy cập mô hình này.
                </p>
                <a
                    href="https://huggingface.co/settings/tokens"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                    onClick={(e) => {
                        e.preventDefault();
                        window.open("https://huggingface.co/settings/tokens", "_blank");
                    }}
                >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Lấy Token tại huggingface.co
                </a>
            </div>
        </div>
    );
};
